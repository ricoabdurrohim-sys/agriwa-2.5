"""AgriWarung Manager - FastAPI Backend"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import asyncio
import uuid
import logging
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
import secrets
import hmac
import hashlib
from urllib.parse import quote
from typing import List, Optional, Literal, Dict

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, WebSocket, WebSocketDisconnect, BackgroundTasks
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict


# ---------- Setup ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALG = 'HS256'

app = FastAPI(title="AgriWarung Manager API")
api = APIRouter(prefix="/api")


# ---------- Helpers ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def gen_id() -> str:
    return str(uuid.uuid4())


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Tidak terautentikasi")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User tidak ditemukan")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token kedaluwarsa")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid")


def require_roles(*roles):
    async def checker(user: dict = Depends(get_current_user)):
        if user.get("role") not in roles and user.get("role") != "super_admin":
            raise HTTPException(status_code=403, detail="Akses ditolak")
        return user
    return checker


def clean_doc(doc):
    if not doc:
        return doc
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


def normalize_phone(phone: str = "") -> str:
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    if digits.startswith("0"):
        return "62" + digits[1:]
    if digits and not digits.startswith("62"):
        return "62" + digits
    return digits


def format_rp_short(amount: int | float | None) -> str:
    try:
        n = int(round(float(amount or 0)))
    except Exception:
        n = 0
    sign = "-" if n < 0 else ""
    return f"{sign}Rp {abs(n):,}".replace(",", ".")


def payment_account(payment_method: str) -> str:
    m = (payment_method or "cash").lower()
    if m in ("transfer", "bank"):
        return "Bank"
    if m in ("qris", "qr", "ewallet", "e-wallet", "gopay", "ovo", "dana", "shopeepay"):
        return "QRIS/E-Wallet"
    return "Kas"


def as_receipt_bool(value, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if value is None or value == "":
        return default
    s = str(value).strip().lower()
    if s in ("false", "0", "no", "off", "mati", "tidak", "nonaktif"):
        return False
    if s in ("true", "1", "yes", "on", "aktif", "ya"):
        return True
    return default


async def get_unit_receipt_config(unit_code: str = "warung") -> dict:
    # v2.5.7: struk harus mengikuti Lini Bisnis, bukan Pengaturan global.
    # Pengaturan global tidak lagi dijadikan fallback alamat/telepon/footer agar struk antar unit tidak bentrok.
    unit = await db.business_units.find_one({"code": unit_code}, {"_id": 0}) or {}
    name = (unit.get("receipt_name") or unit.get("name") or "AgriWarung").strip()
    return {
        "unit": unit_code,
        "business_name": name,
        "address": unit.get("receipt_address") or "",
        "phone": unit.get("receipt_phone") or "",
        "footer": unit.get("receipt_footer") or "",
        "note": unit.get("receipt_note") or "",
        "logo_url": unit.get("receipt_logo") or unit.get("receipt_logo_url") or "",
        "show_qr": as_receipt_bool(unit.get("receipt_show_qr"), True),
    }


async def build_receipt_snapshot(unit_code: str = "warung") -> dict:
    cfg = await get_unit_receipt_config(unit_code)
    cfg["snapshot_at"] = now_iso()
    return cfg


def receipt_cfg_from_trx(trx: dict) -> dict:
    snap = trx.get("receipt_snapshot") or {}
    return {
        "business_name": snap.get("business_name") or snap.get("name") or "AgriWarung",
        "address": snap.get("address", ""),
        "phone": snap.get("phone", ""),
        "footer": snap.get("footer") or "",
        "note": snap.get("note", ""),
        "logo_url": snap.get("logo_url") or snap.get("receipt_logo") or "",
        "show_qr": as_receipt_bool(snap.get("show_qr"), True),
    }


def generate_receipt_text(trx: dict) -> str:
    cfg = receipt_cfg_from_trx(trx)
    lines = []
    lines.append(str(cfg["business_name"]).upper())
    if cfg.get("address"):
        lines.append(str(cfg["address"]))
    if cfg.get("phone"):
        lines.append(f"Telp: {cfg['phone']}")
    lines += ["-" * 32, f"No: {trx.get('trx_no', '-')}", f"Tanggal: {trx.get('created_at', '-')}"]
    if trx.get("queue_no"):
        lines.append(f"Antrian: {trx.get('queue_no')}")
    if trx.get("cashier_name"):
        lines.append(f"Kasir: {trx.get('cashier_name')}")
    if trx.get("customer_name"):
        lines.append(f"Pelanggan: {trx.get('customer_name')}")
    trx_type = (trx.get("transaction_type") or "SALE").upper()
    if trx_type != "SALE":
        label = {"SELF_USE": "PEMAKAIAN SENDIRI", "WASTE": "BARANG RUSAK", "ADJUSTMENT": "PENYESUAIAN"}.get(trx_type, trx_type)
        lines.append(f"Jenis: {label}")
    lines.append("-" * 32)
    for it in trx.get("items", []):
        qty = it.get("quantity", 0)
        price = it.get("unit_price", 0)
        lines.append(str(it.get("name", "Item")))
        lines.append(f"  {qty} x {format_rp_short(price)} = {format_rp_short(qty * price)}")
    lines.append("-" * 32)
    if trx.get("subtotal", 0):
        lines.append(f"Subtotal : {format_rp_short(trx.get('subtotal'))}")
    if trx.get("discount", 0):
        lines.append(f"Diskon   : -{format_rp_short(trx.get('discount'))}")
    if trx_type == "SALE":
        lines.append(f"TOTAL    : {format_rp_short(trx.get('total'))}")
        lines.append(f"Metode   : {str(trx.get('payment_method', '-')).upper()}")
        if trx.get("payment_method") == "cash":
            lines.append(f"Bayar    : {format_rp_short(trx.get('cash_received'))}")
            lines.append(f"Kembali  : {format_rp_short(trx.get('change'))}")
        if trx.get("debt_amount", 0) > 0:
            lines.append(f"Hutang   : {format_rp_short(trx.get('debt_amount'))}")
        if trx.get("payment_status"):
            lines.append(f"Status   : {trx.get('payment_status')}")
    else:
        lines.append(f"Nilai HPP: {format_rp_short(trx.get('cost_total'))}")
        lines.append("Pendapatan: Rp 0")
    if cfg.get("note"):
        lines += ["-" * 32, str(cfg["note"])]
    lines += ["-" * 32, str(cfg.get("footer") or "Terima kasih! 🙏")]
    return "\n".join(lines)


async def write_notification(notif_type: str, title: str, message: str, *, business_id: str = "", ref_type: str = "", ref_id: str = "", priority: str = "normal") -> dict:
    doc = {
        "id": gen_id(),
        "type": notif_type,
        "title": title,
        "message": message,
        "business_id": business_id or "",
        "ref_type": ref_type or "",
        "ref_id": ref_id or "",
        "priority": priority,
        "is_read": False,
        "created_at": now_iso(),
    }
    try:
        await db.notifications.insert_one(doc)
        doc.pop("_id", None)
        await broadcast_event("notification", doc)
    except Exception:
        pass
    return doc


async def check_low_stock_and_notify(item_id: str):
    try:
        item = await db.inventory_items.find_one({"id": item_id}, {"_id": 0})
        if not item:
            return
        min_stock = float(item.get("min_stock") or item.get("minimum_stock") or 0)
        current = float(item.get("current_stock") or 0)
        if min_stock > 0 and current <= min_stock:
            await write_notification(
                "LOW_STOCK",
                f"Stok menipis: {item.get('name')}",
                f"Stok {item.get('name')} tinggal {current:g} {item.get('unit', '')}. Minimum {min_stock:g}.",
                business_id=item.get("business_unit", ""),
                ref_type="inventory",
                ref_id=item_id,
                priority="high",
            )
    except Exception:
        pass


async def send_whatsapp_message(phone: str, text: str) -> dict:
    """Send WhatsApp receipt.

    Priority:
    1) Official WhatsApp Cloud API when WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN are set.
    2) Generic gateway when WHATSAPP_API_URL + WHATSAPP_API_KEY are set.
    3) Manual wa.me fallback.
    """
    normalized = normalize_phone(phone)
    if not normalized:
        raise HTTPException(400, "Nomor WhatsApp belum diisi")

    cloud_phone_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "").strip()
    cloud_token = os.environ.get("WHATSAPP_ACCESS_TOKEN", "").strip() or os.environ.get("WHATSAPP_CLOUD_TOKEN", "").strip()
    graph_version = os.environ.get("WHATSAPP_GRAPH_VERSION", "v20.0").strip() or "v20.0"
    if cloud_phone_id and cloud_token:
        try:
            import httpx
            url = f"https://graph.facebook.com/{graph_version}/{cloud_phone_id}/messages"
            headers = {"Authorization": f"Bearer {cloud_token}", "Content-Type": "application/json"}
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": normalized,
                "type": "text",
                "text": {"preview_url": False, "body": text[:4000]},
            }
            async with httpx.AsyncClient(timeout=20) as http:
                res = await http.post(url, json=payload, headers=headers)
            ok = 200 <= res.status_code < 300
            return {
                "sent": ok, "manual": False, "provider": "whatsapp_cloud",
                "status_code": res.status_code, "response": res.text[:800], "phone": normalized,
                "wa_url": f"https://wa.me/{normalized}?text={quote(text)}",
            }
        except Exception as e:
            return {"sent": False, "manual": False, "provider": "whatsapp_cloud", "phone": normalized, "error": str(e), "wa_url": f"https://wa.me/{normalized}?text={quote(text)}"}

    url = os.environ.get("WHATSAPP_API_URL", "").strip()
    token = os.environ.get("WHATSAPP_API_KEY", "").strip()
    if url and token:
        try:
            import httpx
            headers = {"Authorization": token, "Content-Type": "application/json"}
            payload = {"target": normalized, "phone": normalized, "message": text}
            async with httpx.AsyncClient(timeout=15) as http:
                res = await http.post(url, json=payload, headers=headers)
            return {"sent": 200 <= res.status_code < 300, "manual": False, "provider": "generic_gateway", "status_code": res.status_code, "response": res.text[:500], "phone": normalized}
        except Exception as e:
            return {"sent": False, "manual": False, "provider": "generic_gateway", "phone": normalized, "error": str(e)}

    return {
        "sent": False, "manual": True, "provider": "wa_me", "phone": normalized,
        "wa_url": f"https://wa.me/{normalized}?text={quote(text)}",
        "message": "WhatsApp API belum diatur. Browser akan membuka WhatsApp/wa.me dan user tetap perlu menekan tombol kirim.",
    }


def whatsapp_integration_status() -> dict:
    cloud_ready = bool(os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "").strip() and (os.environ.get("WHATSAPP_ACCESS_TOKEN", "").strip() or os.environ.get("WHATSAPP_CLOUD_TOKEN", "").strip()))
    generic_ready = bool(os.environ.get("WHATSAPP_API_URL", "").strip() and os.environ.get("WHATSAPP_API_KEY", "").strip())
    return {
        "cloud_api_ready": cloud_ready,
        "generic_gateway_ready": generic_ready,
        "mode": "cloud_api" if cloud_ready else ("generic_gateway" if generic_ready else "manual_wa_me"),
        "manual_fallback": not (cloud_ready or generic_ready),
    }



@api.get("/integrations/whatsapp/status")
async def get_whatsapp_status(user: dict = Depends(get_current_user)):
    return whatsapp_integration_status()


@api.get("/scan/resolve")
async def resolve_scan_code(code: str, user: dict = Depends(get_current_user)):
    raw = (code or "").strip()
    if not raw:
        raise HTTPException(400, "Kode scan kosong")
    decoded = raw
    # Accept URLs generated by the app: /scan?code=..., /kasir?lookup=..., /inventori?batch=...
    try:
        from urllib.parse import urlparse, parse_qs, unquote
        parsed = urlparse(raw)
        qs = parse_qs(parsed.query or "")
        if "code" in qs and qs["code"]:
            decoded = unquote(qs["code"][0]).strip()
        elif "lookup" in qs and qs["lookup"]:
            decoded = "aw:trx:" + unquote(qs["lookup"][0]).strip()
        elif "batch" in qs and qs["batch"]:
            decoded = "aw:batch:" + unquote(qs["batch"][0]).strip()
        elif (parsed.path or "").rstrip("/").endswith("/warung") and qs.get("table") and qs.get("order"):
            decoded = "aw:warung-order:" + unquote(qs["table"][0]).strip() + ":" + unquote(qs["order"][0]).strip()
    except Exception:
        decoded = raw

    low = decoded.lower()
    def payload(kind, target, item=None):
        return {"ok": True, "kind": kind, "target": target, "item": item or {}, "code": decoded}

    if low.startswith("aw:trx:"):
        q = decoded.split(":", 2)[2]
        trx = await db.transactions.find_one({"$or": [{"trx_no": q}, {"id": q}]}, {"_id": 0})
        if trx:
            return payload("transaction", f"/kasir?lookup={quote(trx.get('trx_no') or trx.get('id'))}", trx)
    if low.startswith("aw:warung-order:"):
        # Format baru thermal sengaja pendek agar printer tidak error QR:
        #   aw:warung-order:ORDER_ID
        # Format lama tetap didukung:
        #   aw:warung-order:TABLE_ID:ORDER_ID
        parts = decoded.split(":")
        table_id = ""
        order_id = ""
        if len(parts) >= 4:
            table_id, order_id = parts[2].strip(), parts[3].strip()
            order = await db.orders.find_one({"id": order_id, "table_id": table_id}, {"_id": 0})
        elif len(parts) == 3:
            order_id = parts[2].strip()
            order = await db.orders.find_one({"id": order_id}, {"_id": 0})
            table_id = str((order or {}).get("table_id") or "")
        else:
            order = None
        if order and table_id and str(order.get("status", "")).lower() not in ("paid", "cancelled", "closed"):
            return payload("warung_order", f"/warung?table={quote(table_id)}&order={quote(order_id)}&from=scan", order)
        raise HTTPException(404, "QR pesanan Warung tidak aktif atau sudah selesai dibayar")

    if low.startswith("aw:batch:"):
        q = decoded.split(":", 2)[2]
        b = await db.inventory_batches.find_one({"$or": [{"batch_no": q}, {"id": q}]}, {"_id": 0})
        if b:
            return payload("inventory_batch", f"/inventori?batch={quote(b.get('batch_no') or b.get('id'))}", b)
    if low.startswith("aw:production:"):
        q = decoded.split(":", 2)[2]
        row = await db.production_batches.find_one({"$or": [{"id": q}, {"batch_no": q}]}, {"_id": 0})
        if row:
            return payload("production", f"/pupuk?batch={quote(row.get('id') or row.get('batch_no'))}", row)
    if low.startswith("aw:harvest:"):
        q = decoded.split(":", 2)[2]
        row = await db.vineyard_harvests.find_one({"id": q}, {"_id": 0})
        if row:
            return payload("harvest", f"/kebun?harvest={quote(q)}", row)
    if low.startswith("aw:activity:"):
        q = decoded.split(":", 2)[2]
        row = await db.vineyard_activities.find_one({"id": q}, {"_id": 0})
        if row:
            return payload("farm_activity", f"/kebun?activity={quote(q)}", row)
    if low.startswith("aw:livestock:"):
        q = decoded.split(":", 2)[2]
        row = await db.livestock_productions.find_one({"id": q}, {"_id": 0})
        if row:
            return payload("livestock_production", f"/peternakan?production={quote(q)}", row)

    # Smart fallback: try transaction number/name/phone and batch number in one place.
    q = decoded.strip()
    trx = await db.transactions.find_one({"$or": [
        {"trx_no": {"$regex": re.escape(q), "$options": "i"}},
        {"id": q},
        {"customer_name": {"$regex": re.escape(q), "$options": "i"}},
        {"customer_phone": {"$regex": re.escape(q), "$options": "i"}},
    ]}, {"_id": 0})
    if trx:
        return payload("transaction", f"/kasir?lookup={quote(trx.get('trx_no') or trx.get('id'))}", trx)
    b = await db.inventory_batches.find_one({"$or": [{"batch_no": {"$regex": f"^{re.escape(q)}$", "$options": "i"}}, {"id": q}]}, {"_id": 0})
    if b:
        return payload("inventory_batch", f"/inventori?batch={quote(b.get('batch_no') or b.get('id'))}", b)
    raise HTTPException(404, "Kode tidak ditemukan di QR Warung/transaksi/batch/produksi/kebun/peternakan")

# ---------- Models ----------
class LoginIn(BaseModel):
    email: str
    password: str


class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: str = "kasir"
    phone: Optional[str] = ""


# ---------- Auth ----------
@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email atau password salah")
    token = create_access_token(user["id"], user["email"], user["role"])
    response.set_cookie(
        key="access_token", value=token, httponly=True,
        secure=False, samesite="lax", max_age=604800, path="/",
    )
    return {"token": token, "user": clean_doc(user)}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ---------- Google OAuth (Emergent-managed) ----------
class GoogleSessionIn(BaseModel):
    session_id: str


@api.post("/auth/google-session")
async def google_session(body: GoogleSessionIn, response: Response):
    """Validate session_id from Emergent Auth → create/update user → return JWT."""
    import httpx as _httpx
    try:
        async with _httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": body.session_id},
            )
        if r.status_code != 200:
            raise HTTPException(401, "Sesi Google tidak valid")
        data = r.json()
    except _httpx.HTTPError as e:
        raise HTTPException(502, f"Tidak bisa menghubungi server Auth: {e}")

    email = (data.get("email") or "").lower().strip()
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture") or ""
    session_token = data.get("session_token") or ""
    if not email or not session_token:
        raise HTTPException(401, "Data sesi tidak lengkap")

    # Upsert user — preserve existing role if user exists
    existing = await db.users.find_one({"email": email})
    if existing:
        await db.users.update_one(
            {"id": existing["id"]},
            {"$set": {"name": name, "picture": picture, "google_linked": True}},
        )
        user_id = existing["id"]
        role = existing.get("role", "kasir")
    else:
        user_id = gen_id()
        await db.users.insert_one({
            "id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "role": "kasir",  # least privilege; super_admin must promote via UI
            "password_hash": "",
            "source": "google",
            "google_linked": True,
            "active": True,
            "created_at": now_iso(),
        })
        role = "kasir"

    # Store session token (7 days) — for cookie-based auth path
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "user_id": user_id, "email": email, "session_token": session_token,
            "expires_at": expires_at, "created_at": now_iso(),
        }},
        upsert=True,
    )

    # Issue compatibility JWT (frontend uses Bearer token for some calls)
    token = create_access_token(user_id, email, role)
    response.set_cookie(
        key="access_token", value=token, httponly=True,
        secure=False, samesite="lax", max_age=604800, path="/",
    )
    response.set_cookie(
        key="session_token", value=session_token, httponly=True,
        secure=False, samesite="lax", max_age=604800, path="/",
    )
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return {"token": token, "user": user_doc}


# ---------- Password Reset: WhatsApp OTP + Super Admin Reset ----------
# Token reset lama sengaja dimatikan: tidak boleh lagi mengembalikan token ke browser.
class ForgotPasswordIn(BaseModel):
    email: str


@api.post("/auth/forgot-password")
async def forgot_password_disabled(body: ForgotPasswordIn):
    raise HTTPException(410, "Reset password token sudah dinonaktifkan. Gunakan reset via WhatsApp OTP.")


class ResetPasswordTokenIn(BaseModel):
    email: str
    token: str
    new_password: str


@api.post("/auth/reset-password-with-token")
async def reset_password_with_token_disabled(body: ResetPasswordTokenIn):
    raise HTTPException(410, "Reset password token sudah dinonaktifkan. Gunakan reset via WhatsApp OTP.")


class RequestWaOtpIn(BaseModel):
    phone: str


class ResetPasswordWaIn(BaseModel):
    phone: str
    otp: str
    new_password: str


@api.post("/auth/request-wa-otp")
async def request_wa_otp(body: RequestWaOtpIn):
    phone = normalize_phone(body.phone)
    if not phone:
        raise HTTPException(400, "Nomor WhatsApp wajib diisi")
    user = await db.users.find_one({"$or": [{"phone": phone}, {"phone": body.phone}, {"whatsapp": phone}]})
    # Generic response agar nomor terdaftar/tidak tidak bocor.
    generic = {"ok": True, "message": "Jika nomor terdaftar, OTP reset password dikirim ke WhatsApp."}
    if not user:
        return generic

    # Rate limit sederhana: max 3 OTP aktif dalam 15 menit per user.
    since = datetime.now(timezone.utc) - timedelta(minutes=15)
    recent = await db.otp_codes.count_documents({"user_id": user["id"], "created_at_dt": {"$gte": since}, "used": False})
    if recent >= 3:
        raise HTTPException(429, "Terlalu banyak permintaan OTP. Coba lagi nanti.")

    otp = f"{secrets.randbelow(1000000):06d}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    await db.otp_codes.insert_one({
        "id": gen_id(),
        "user_id": user["id"],
        "phone": phone,
        "otp_hash": hash_password(otp),
        "purpose": "password_reset",
        "used": False,
        "expires_at": expires_at,
        "created_at_dt": datetime.now(timezone.utc),
        "created_at": now_iso(),
    })
    text = f"Kode OTP reset password AgriWarung Anda: {otp}\nBerlaku 10 menit. Jangan berikan kode ini kepada siapa pun."
    wa_result = await send_whatsapp_message(phone, text)
    result = {**generic, "expires_in_minutes": 10, "wa": {k: v for k, v in wa_result.items() if k not in ("response",)}}
    # Untuk mode development lokal/HF tanpa WA API, token TIDAK ditampilkan. wa_url membantu buka WA manual dari perangkat admin bila phone valid.
    return result


@api.post("/auth/reset-password-wa")
async def reset_password_wa(body: ResetPasswordWaIn):
    if len(body.new_password) < 6:
        raise HTTPException(400, "Password baru minimal 6 karakter")
    phone = normalize_phone(body.phone)
    otp = (body.otp or "").strip()
    if not phone or not otp:
        raise HTTPException(400, "Nomor WhatsApp dan OTP wajib")
    user = await db.users.find_one({"$or": [{"phone": phone}, {"phone": body.phone}, {"whatsapp": phone}]})
    if not user:
        raise HTTPException(400, "OTP tidak valid atau sudah kedaluwarsa")
    recs = await db.otp_codes.find({
        "user_id": user["id"], "phone": phone, "purpose": "password_reset", "used": False
    }, {"_id": 0}).sort("created_at", -1).to_list(5)
    now_dt = datetime.now(timezone.utc)
    match = None
    for rec in recs:
        exp = rec.get("expires_at")
        if isinstance(exp, str):
            exp = datetime.fromisoformat(exp)
        if exp and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp and exp < now_dt:
            continue
        if verify_password(otp, rec.get("otp_hash", "")):
            match = rec
            break
    if not match:
        raise HTTPException(400, "OTP tidak valid atau sudah kedaluwarsa")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password), "phone": phone, "phone_verified": True}})
    await db.otp_codes.update_one({"id": match["id"]}, {"$set": {"used": True, "used_at": now_iso()}})
    await write_notification("SECURITY", "Password direset via WhatsApp OTP", f"Password akun {user.get('email')} berhasil direset via OTP.", ref_type="user", ref_id=user["id"], priority="high")
    return {"ok": True, "message": "Password berhasil di-reset. Silakan login dengan password baru."}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users


@api.post("/users")
async def create_user(body: UserCreate, user: dict = Depends(require_roles("super_admin"))):
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(status_code=400, detail="Email sudah terdaftar")
    doc = {
        "id": gen_id(),
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": body.role,
        "phone": normalize_phone(body.phone),
        "phone_verified": bool(body.phone),
        "active": True,
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    return clean_doc(doc)


# ---------- Generic CRUD utility ----------
async def list_collection(coll: str, query: dict = None):
    return await db[coll].find(query or {}, {"_id": 0}).to_list(5000)


async def insert_doc(coll: str, data: dict):
    if "id" not in data:
        data["id"] = gen_id()
    data["created_at"] = data.get("created_at", now_iso())
    await db[coll].insert_one(data)
    data.pop("_id", None)
    return data



# ---------- Investor finance lock helpers ----------
async def _has_active_dividends(investor_id: str = None) -> bool:
    """Returns true once dividends have been distributed/finalized.
    During building/testing, investor and capital data can still be edited freely
    until an active dividend exists. Cancelled/voided dividends do not lock.
    """
    q = {"status": {"$nin": ["cancelled", "void", "deleted"]}}
    if investor_id:
        q["items.investor_id"] = investor_id
    return (await db.dividends.count_documents(q)) > 0

async def _active_dividend_count(investor_id: str = None) -> int:
    q = {"status": {"$nin": ["cancelled", "void", "deleted"]}}
    if investor_id:
        q["items.investor_id"] = investor_id
    return await db.dividends.count_documents(q)

async def _create_expense_journal(exp_doc: dict):
    await db.journal_entries.delete_many({"reference": exp_doc.get("reference", "expense"), "reference_id": exp_doc.get("id")})
    await db.journal_entries.insert_one({
        "id": gen_id(),
        "date": exp_doc.get("date") or now_iso(),
        "description": f"Biaya {exp_doc.get('category', 'Pengeluaran')}",
        "lines": [
            {"account": exp_doc.get("category", "Pengeluaran"), "debit": _money(exp_doc.get("amount")), "credit": 0},
            {"account": "Kas", "debit": 0, "credit": _money(exp_doc.get("amount"))},
        ],
        "reference": exp_doc.get("reference", "expense"),
        "reference_id": exp_doc.get("reference_id") or exp_doc.get("id"),
        "expense_id": exp_doc.get("id"),
        "unit": exp_doc.get("unit", "umum"),
        "created_at": now_iso(),
    })

# ---------- Investors & Capital ----------
class InvestorIn(BaseModel):
    name: str
    phone: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""


@api.get("/investors")
async def get_investors(user: dict = Depends(get_current_user)):
    investors = await list_collection("investors")
    # compute total capital per investor
    injections = await list_collection("capital_injections")
    total_all = sum(i.get("amount", 0) for i in injections)
    for inv in investors:
        inv["total_capital"] = sum(
            ci.get("amount", 0) for ci in injections if ci.get("investor_id") == inv["id"]
        )
        inv["ownership_pct"] = (inv["total_capital"] / total_all * 100) if total_all else 0
    return investors


@api.post("/investors")
async def create_investor(body: InvestorIn, user: dict = Depends(get_current_user)):
    data = body.model_dump()
    data["updated_at"] = now_iso()
    return await insert_doc("investors", data)


@api.put("/investors/{investor_id}")
async def update_investor(investor_id: str, body: InvestorIn, user: dict = Depends(get_current_user)):
    existing = await db.investors.find_one({"id": investor_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Investor tidak ditemukan")
    data = body.model_dump()
    data["updated_at"] = now_iso()
    await db.investors.update_one({"id": investor_id}, {"$set": data})
    invalidate_finance_summary_cache()
    updated = await db.investors.find_one({"id": investor_id}, {"_id": 0})
    return clean_doc(updated)


@api.delete("/investors/{investor_id}")
async def delete_investor(investor_id: str, user: dict = Depends(require_roles("super_admin", "manager"))):
    existing = await db.investors.find_one({"id": investor_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Investor tidak ditemukan")

    # Tahap building: investor/modal boleh dibersihkan selama belum ada dividen aktif.
    # Setelah dividen dibagikan, data investor dan modal menjadi dasar audit dan dikunci.
    if await _has_active_dividends(investor_id):
        raise HTTPException(
            status_code=400,
            detail="Investor sudah menerima pembagian dividen aktif. Batalkan dividen dulu sebelum menghapus investor/modalnya.",
        )

    caps = await db.capital_injections.find({"investor_id": investor_id}, {"_id": 0, "id": 1}).to_list(1000)
    cap_ids = [c.get("id") for c in caps if c.get("id")]
    if cap_ids:
        await db.journal_entries.delete_many({"reference": "capital_injection", "reference_id": {"$in": cap_ids}})
        await db.capital_injections.delete_many({"id": {"$in": cap_ids}})
    await db.land_rental.delete_many({"investor_id": investor_id})
    await db.investors.delete_one({"id": investor_id})
    invalidate_finance_summary_cache()
    await write_audit(user, "delete", "investor", investor_id, {"name": existing.get("name"), "capital_deleted": len(cap_ids)})
    return {"ok": True, "deleted_id": investor_id, "capital_deleted": len(cap_ids)}


class CapitalIn(BaseModel):
    investor_id: str
    amount: int
    unit: str = "umum"
    notes: Optional[str] = ""
    date: Optional[str] = None


@api.get("/capital-injections")
async def get_capital(user: dict = Depends(get_current_user)):
    return await list_collection("capital_injections")


@api.post("/capital-injections")
async def add_capital(body: CapitalIn, user: dict = Depends(get_current_user)):
    data = body.model_dump()
    data["date"] = data.get("date") or now_iso()
    doc = await insert_doc("capital_injections", data)
    # create journal entry: Debit Kas / Credit Modal Disetor
    await insert_doc("journal_entries", {
        "date": doc["date"],
        "description": f"Setoran modal - {doc.get('notes') or 'modal'}",
        "lines": [
            {"account": "Kas", "debit": _money(doc.get("amount")), "credit": 0},
            {"account": "Modal Disetor", "debit": 0, "credit": _money(doc.get("amount"))},
        ],
        "reference": "capital_injection",
        "reference_id": doc["id"],
        "unit": doc.get("unit", "umum"),
    })
    invalidate_finance_summary_cache()
    return doc


@api.put("/capital-injections/{capital_id}")
async def update_capital(capital_id: str, body: CapitalIn, user: dict = Depends(require_roles("super_admin", "manager"))):
    existing = await db.capital_injections.find_one({"id": capital_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Setoran modal tidak ditemukan")
    if await _has_active_dividends(existing.get("investor_id")):
        raise HTTPException(400, "Modal investor ini sudah dipakai pembagian dividen aktif. Batalkan dividen dulu sebelum edit modal.")
    data = body.model_dump()
    data["date"] = data.get("date") or existing.get("date") or now_iso()
    data["updated_at"] = now_iso()
    await db.capital_injections.update_one({"id": capital_id}, {"$set": data})
    await db.journal_entries.delete_many({"reference": "capital_injection", "reference_id": capital_id})
    await insert_doc("journal_entries", {
        "date": data["date"],
        "description": f"Setoran modal - {data.get('notes') or 'modal'}",
        "lines": [
            {"account": "Kas", "debit": _money(data.get("amount")), "credit": 0},
            {"account": "Modal Disetor", "debit": 0, "credit": _money(data.get("amount"))},
        ],
        "reference": "capital_injection",
        "reference_id": capital_id,
        "unit": data.get("unit", "umum"),
    })
    invalidate_finance_summary_cache()
    await write_audit(user, "update", "capital_injection", capital_id, {"before": existing, "after": data})
    return clean_doc(await db.capital_injections.find_one({"id": capital_id}, {"_id": 0}))


@api.delete("/capital-injections/{capital_id}")
async def delete_capital(capital_id: str, user: dict = Depends(require_roles("super_admin", "manager"))):
    existing = await db.capital_injections.find_one({"id": capital_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Setoran modal tidak ditemukan")
    if await _has_active_dividends(existing.get("investor_id")):
        raise HTTPException(400, "Modal investor ini sudah dipakai pembagian dividen aktif. Batalkan dividen dulu sebelum hapus modal.")
    await db.capital_injections.delete_one({"id": capital_id})
    await db.journal_entries.delete_many({"reference": "capital_injection", "reference_id": capital_id})
    invalidate_finance_summary_cache()
    await write_audit(user, "delete", "capital_injection", capital_id, {"amount": existing.get("amount"), "investor_id": existing.get("investor_id")})
    return {"ok": True, "deleted_id": capital_id}


# ---------- Land Rental ----------
class LandRentalIn(BaseModel):
    investor_id: str
    monthly_amount: int
    start_date: str
    notes: Optional[str] = ""


@api.get("/land-rental")
async def get_land_rental(user: dict = Depends(get_current_user)):
    return await list_collection("land_rental")


@api.post("/land-rental")
async def set_land_rental(body: LandRentalIn, user: dict = Depends(get_current_user)):
    await db.land_rental.delete_many({})
    return await insert_doc("land_rental", body.model_dump())


# ---------- Dividends ----------
class DividendIn(BaseModel):
    month: int
    year: int
    total_profit: int


@api.post("/dividends/calculate")
async def calc_dividends(body: DividendIn, user: dict = Depends(get_current_user)):
    investors = await get_investors(user)
    result = []
    for inv in investors:
        share = int(body.total_profit * inv["ownership_pct"] / 100)
        result.append({
            "investor_id": inv["id"],
            "investor_name": inv["name"],
            "ownership_pct": inv["ownership_pct"],
            "share": share,
        })
    return {"month": body.month, "year": body.year, "total_profit": body.total_profit, "items": result}


@api.get("/dividends")
async def list_dividends(user: dict = Depends(get_current_user)):
    return await db.dividends.find({"status": {"$nin": ["cancelled", "void", "deleted"]}}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.post("/dividends")
async def record_dividend(body: dict, user: dict = Depends(get_current_user)):
    # Legacy/manual record. Prefer /dividends/distribute because it creates the matching expense.
    body["status"] = body.get("status") or "recorded"
    doc = await insert_doc("dividends", body)
    invalidate_finance_summary_cache()
    return doc


class DividendDistributeIn(BaseModel):
    unit: str = "all"
    month: int
    year: int
    total_profit: int
    payment_method: str = "cash"
    date: Optional[str] = None
    notes: Optional[str] = ""
    items: Optional[List[dict]] = None


@api.post("/dividends/distribute")
async def distribute_dividend(body: DividendDistributeIn, user: dict = Depends(require_roles("super_admin", "manager"))):
    if body.total_profit <= 0:
        raise HTTPException(400, "Laba bersih harus lebih dari 0")
    if body.items:
        items = [dict(x) for x in body.items if _money(x.get("share")) > 0]
        total_dividend = sum(_money(x.get("share")) for x in items)
    else:
        calc = await calc_dividend_unit(DividendUnitIn(unit=body.unit, month=body.month, year=body.year, total_profit=body.total_profit), user)
        items = [dict(x) for x in calc.get("items", []) if _money(x.get("share")) > 0]
        total_dividend = sum(_money(x.get("share")) for x in items)
    if not items or total_dividend <= 0:
        raise HTTPException(400, "Tidak ada investor dengan porsi dividen")

    date = body.date or now_iso()
    div_doc = {
        "id": gen_id(),
        "unit": body.unit,
        "month": body.month,
        "year": body.year,
        "total_profit": _money(body.total_profit),
        "amount": total_dividend,
        "items": items,
        "payment_method": body.payment_method,
        "date": date,
        "notes": body.notes or "",
        "status": "distributed",
        "created_at": now_iso(),
        "created_by": user.get("id"),
    }
    exp_doc = {
        "id": gen_id(),
        "amount": total_dividend,
        "category": "Pembagian Dividen",
        "unit": body.unit if body.unit != "all" else "umum",
        "notes": body.notes or f"Dividen {body.month:02d}/{body.year}",
        "date": date,
        "payment_method": body.payment_method,
        "reference": "dividend_distribution",
        "reference_id": div_doc["id"],
        "created_at": now_iso(),
        "created_by": user.get("id"),
    }
    div_doc["expense_id"] = exp_doc["id"]
    await db.dividends.insert_one(div_doc)
    await db.expenses.insert_one(exp_doc)
    await db.journal_entries.insert_one({
        "id": gen_id(),
        "date": date,
        "description": f"Pembagian Dividen {body.month:02d}/{body.year}",
        "lines": [
            {"account": "Dividen / Prive Investor", "debit": total_dividend, "credit": 0},
            {"account": "Kas", "debit": 0, "credit": total_dividend},
        ],
        "reference": "dividend_distribution",
        "reference_id": div_doc["id"],
        "expense_id": exp_doc["id"],
        "unit": exp_doc["unit"],
        "created_at": now_iso(),
    })
    invalidate_finance_summary_cache()
    await write_audit(user, "create", "dividend_distribution", div_doc["id"], {"amount": total_dividend, "expense_id": exp_doc["id"]})
    for d in (div_doc, exp_doc):
        d.pop("_id", None)
    return {"ok": True, "dividend": clean_doc(div_doc), "expense": clean_doc(exp_doc)}


@api.delete("/dividends/{dividend_id}")
async def delete_dividend(dividend_id: str, user: dict = Depends(require_roles("super_admin", "manager"))):
    div = await db.dividends.find_one({"id": dividend_id}, {"_id": 0})
    if not div:
        raise HTTPException(404, "Catatan dividen tidak ditemukan")
    exp_id = div.get("expense_id")
    await db.expenses.delete_many({"$or": [{"id": exp_id}, {"reference": "dividend_distribution", "reference_id": dividend_id}]})
    await db.journal_entries.delete_many({"reference": "dividend_distribution", "reference_id": dividend_id})
    await db.dividends.delete_one({"id": dividend_id})
    invalidate_finance_summary_cache()
    await write_audit(user, "delete", "dividend_distribution", dividend_id, {"amount": div.get("amount"), "expense_id": exp_id})
    return {"ok": True, "deleted_id": dividend_id, "expense_id": exp_id}


# ---------- Inventory ----------
class InventoryIn(BaseModel):
    name: str
    category: str
    unit: str = "pcs"
    current_stock: float = 0
    min_stock: float = 0
    cost_price: int = 0
    sell_price: int = 0
    business_unit: str = "warung"
    location: Optional[str] = ""
    notes: Optional[str] = ""
    image_url: Optional[str] = ""
    has_variants: bool = False
    variants: List[dict] = []  # POS variants: panas/es, kecil/besar, dll. Stok tetap memakai item utama.
    supplier_name: Optional[str] = ""
    batch_no: Optional[str] = ""
    purchase_ref: Optional[str] = ""
    purchase_url: Optional[str] = ""
    expiry_date: Optional[str] = ""
    purchase_date: Optional[str] = ""


def _inventory_name_key(name: str) -> str:
    return (name or "").strip().lower()


def _batch_prefix_from_name(name: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", (name or "").upper())
    if not words:
        return "BT"
    if len(words) == 1:
        return words[0][:2].ljust(2, "X")
    return "".join(w[0] for w in words[:3])[:3]


async def _generate_batch_no(item_name: str, purchase_date: str = "", item_id: str = "") -> str:
    # Format contoh: GP150626001 = Gula Pasir, 15 Juni 2026, pembelian pertama untuk item itu pada hari itu.
    # Counter dipisah per barang, bukan global lintas semua item.
    prefix = _batch_prefix_from_name(item_name)
    if purchase_date:
        raw = str(purchase_date)[:10]
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except Exception:
            dt = datetime.now(timezone.utc)
    else:
        dt = datetime.now(timezone.utc)
    date_part = dt.strftime("%d%m%y")
    regex = f"^{re.escape(prefix + date_part)}"
    query = {"batch_no": {"$regex": regex}}
    if item_id:
        query["item_id"] = item_id
    count = await db.inventory_batches.count_documents(query)
    return f"{prefix}{date_part}{count + 1:03d}"


async def _record_inventory_batch(item: dict, qty: float, body: dict, source: str = "manual"):
    if qty == 0:
        return None
    batch_no = (body.get("batch_no") or "").strip()
    purchase_date = body.get("purchase_date") or body.get("date") or ""
    if not batch_no:
        batch_no = await _generate_batch_no(item.get("name"), purchase_date, item.get("id"))
    batch = {
        "id": gen_id(),
        "item_id": item.get("id"),
        "item_name": item.get("name"),
        "quantity": float(qty),
        "remaining_quantity": float(qty),
        "unit": item.get("unit", body.get("unit", "pcs")),
        "supplier_name": body.get("supplier_name") or "",
        "batch_no": batch_no,
        "purchase_date": purchase_date or now_iso(),
        "purchase_ref": body.get("purchase_ref") or "",
        "purchase_url": body.get("purchase_url") or "",
        "expiry_date": body.get("expiry_date") or "",
        "notes": body.get("notes") or "",
        "source": source,
        "created_at": now_iso(),
    }
    await db.inventory_batches.insert_one(batch)
    await db.stock_movements.insert_one({
        "id": gen_id(), "item_id": item.get("id"), "type": "stock_in_batch",
        "quantity": float(qty), "qty_in": float(qty), "qty_out": 0,
        "reason": f"Stok masuk {batch['batch_no']} dari {batch['supplier_name'] or 'manual'}",
        "reference": "inventory_batch", "reference_id": batch["id"],
        "supplier_name": batch["supplier_name"], "batch_no": batch["batch_no"],
        "remaining_quantity": batch["remaining_quantity"],
        "created_at": now_iso(),
    })
    return batch


async def _business_unit_allows_batch(unit_code: str, field: str = "batch_on_production") -> bool:
    """Policy batch per lini bisnis. Default aman: produksi/panen/peternakan dibatch; warung normal tidak wajib."""
    unit_code = (unit_code or "").strip()
    unit = await db.business_units.find_one({"code": unit_code}, {"_id": 0}) if unit_code else None
    if unit and unit.get("auto_batch_enabled") is False:
        return False
    if unit and field in unit:
        return bool(unit.get(field))
    return unit_code in ("anggur", "kebun", "pupuk", "peternakan", "pembibitan")


async def _record_output_batch_if_enabled(item: dict, qty: float, source: str, ref: str = "", notes: str = "", date: str = ""):
    if not item or not qty:
        return None
    unit_code = item.get("business_unit") or ""
    field = "batch_on_harvest" if source in ("harvest", "vineyard_harvest", "livestock_production") else "batch_on_production"
    if not await _business_unit_allows_batch(unit_code, field):
        return None
    return await _record_inventory_batch(item, float(qty), {
        "supplier_name": "Produksi" if field == "batch_on_production" else "Panen/Hasil",
        "purchase_ref": ref,
        "notes": notes or f"Batch otomatis dari {source}",
        "purchase_date": date or now_iso(),
    }, source=source)


async def _printable_batch_payload(batch: dict, base_url: str = "") -> dict:
    target = f"{base_url.rstrip('/')}/inventori?batch={batch.get('batch_no')}" if base_url else f"agriwarung://batch/{batch.get('batch_no')}"
    return {
        "batch_no": batch.get("batch_no"),
        "item_name": batch.get("item_name"),
        "qty": batch.get("remaining_quantity", batch.get("quantity")),
        "unit": batch.get("unit"),
        "supplier_name": batch.get("supplier_name"),
        "purchase_date": batch.get("purchase_date"),
        "target_url": target,
        "label_text": f"{batch.get('item_name','ITEM')}\nBatch: {batch.get('batch_no','-')}\nSisa: {batch.get('remaining_quantity', batch.get('quantity', 0))} {batch.get('unit','')}\nSumber: {batch.get('supplier_name') or batch.get('source') or '-'}",
    }


async def _consume_inventory_batches(item_id: str, qty: float, reference: str = "stock_out", preferred_batch: str = ""):
    """Kurangi sisa batch. Kalau preferred_batch dipilih, pakai batch itu dulu, lalu FIFO."""
    remaining = float(qty or 0)
    if remaining <= 0:
        return []
    consumed = []

    async def take_from_batch(b, amount_left):
        current_left = b.get("remaining_quantity")
        if current_left is None:
            current_left = b.get("quantity", 0)
        current_left = float(current_left or 0)
        if current_left <= 0 or amount_left <= 0:
            return amount_left
        take = min(current_left, amount_left)
        new_left = max(0, current_left - take)
        await db.inventory_batches.update_one({"id": b.get("id")}, {"$set": {"remaining_quantity": new_left, "updated_at": now_iso()}})
        consumed.append({"batch_id": b.get("id"), "batch_no": b.get("batch_no"), "qty_out": take, "remaining_after": new_left})
        return amount_left - take

    used_ids = set()
    if preferred_batch:
        pref = await db.inventory_batches.find_one({
            "item_id": item_id,
            "$or": [{"id": preferred_batch}, {"batch_no": preferred_batch}],
        }, {"_id": 0})
        if pref:
            remaining = await take_from_batch(pref, remaining)
            used_ids.add(pref.get("id"))

    cursor = db.inventory_batches.find({"item_id": item_id}).sort("created_at", 1)
    async for b in cursor:
        if remaining <= 0:
            break
        if b.get("id") in used_ids:
            continue
        remaining = await take_from_batch(b, remaining)
    return consumed


async def _reconcile_batch_remaining(item_id: str):
    """Perbaiki sisa batch dari stock_movements agar batch lama yang sudah dipakai tampil benar."""
    batches = await db.inventory_batches.find({"item_id": item_id}, {"_id": 0}).to_list(2000)
    if not batches:
        return []
    used = {}
    moves = db.stock_movements.find({"item_id": item_id, "$or": [{"consumed_batches": {"$exists": True}}, {"restored_batches": {"$exists": True}}]}, {"_id": 0, "consumed_batches": 1, "restored_batches": 1})
    restored = {}
    async for mv in moves:
        for c in mv.get("consumed_batches") or []:
            key = c.get("batch_id") or c.get("batch_no")
            if key:
                used[key] = used.get(key, 0.0) + float(c.get("qty_out") or 0)
        for r in mv.get("restored_batches") or []:
            key = r.get("batch_id") or r.get("batch_no")
            if key:
                restored[key] = restored.get(key, 0.0) + float(r.get("qty_in") or 0)
    changed = []
    for b in batches:
        qty = float(b.get("quantity") or 0)
        spent = float(used.get(b.get("id"), 0.0) + used.get(b.get("batch_no"), 0.0))
        added_back = float(restored.get(b.get("id"), 0.0) + restored.get(b.get("batch_no"), 0.0))
        expected = max(0.0, min(qty, qty - spent + added_back))
        current = b.get("remaining_quantity")
        if current is None or abs(float(current or 0) - expected) > 0.0001:
            await db.inventory_batches.update_one({"id": b.get("id")}, {"$set": {"remaining_quantity": expected, "updated_at": now_iso()}})
            b["remaining_quantity"] = expected
            changed.append(b.get("batch_no"))
    return changed


@api.get("/inventory")
async def list_inventory(user: dict = Depends(get_current_user), include_batches: bool = True, limit: int = 3000):
    """List inventory.

    include_batches=false dipakai Kasir/Warung supaya halaman tidak menarik seluruh
    riwayat batch dan tetap cepat. Menu Inventori/Produksi tetap memakai batch.
    """
    safe_limit = max(100, min(int(limit or 3000), 5000))
    items = await db.inventory_items.find({}, {"_id": 0}).sort([("name_key", 1), ("name", 1), ("created_at", -1)]).to_list(safe_limit)
    if not include_batches:
        for item in items:
            item["recent_batches"] = []
            item["batch_count"] = 0
            item["batch_remaining_total"] = 0
        return items

    batches = await db.inventory_batches.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    by_item = {}
    for b in batches:
        by_item.setdefault(b.get("item_id"), []).append(b)
    for item in items:
        all_batches = by_item.get(item.get("id"), [])
        for b in all_batches:
            if b.get("remaining_quantity") is None:
                b["remaining_quantity"] = float(b.get("quantity") or 0)
        recent = all_batches[:5]
        item["recent_batches"] = recent
        item["batch_count"] = len(all_batches)
        item["batch_remaining_total"] = sum(float(b.get("remaining_quantity") or 0) for b in all_batches)
        if recent:
            item["last_supplier_name"] = recent[0].get("supplier_name", "")
            item["last_batch_no"] = recent[0].get("batch_no", "")
            item["last_stock_in_at"] = recent[0].get("created_at", "")
    return items


def _sanitize_pos_variants(rows):
    clean = []
    for idx, v in enumerate(rows or []):
        if not isinstance(v, dict):
            continue
        name = str(v.get("name") or v.get("label") or "").strip()
        if not name:
            continue
        price = int(float(v.get("sell_price") or v.get("price") or 0))
        clean.append({
            "id": str(v.get("id") or f"var-{idx+1}"),
            "name": name,
            "sell_price": max(0, price),
            "active": False if v.get("active") is False else True,
        })
    return clean


@api.post("/inventory")
async def create_inventory(body: InventoryIn, user: dict = Depends(get_current_user)):
    data = body.model_dump()
    data["variants"] = _sanitize_pos_variants(data.get("variants") or [])
    data["has_variants"] = bool(data.get("has_variants") and data["variants"])
    name_key = _inventory_name_key(data.get("name"))
    # v2.5.7: jika nama+unit+unit bisnis sama, jangan bikin duplikat.
    # Tambahkan stok ke item lama dan simpan batch/supplier agar bisa trace retur.
    existing = await db.inventory_items.find_one({
        "name_key": name_key,
        "unit": data.get("unit", "pcs"),
        "business_unit": data.get("business_unit", "warung"),
    }, {"_id": 0})
    if not existing:
        existing = await db.inventory_items.find_one({
            "name": {"$regex": f"^{re.escape(data.get('name','').strip())}$", "$options": "i"},
            "unit": data.get("unit", "pcs"),
            "business_unit": data.get("business_unit", "warung"),
        }, {"_id": 0})
    if existing:
        qty = float(data.get("current_stock") or 0)
        update = {
            "category": data.get("category", existing.get("category")),
            "min_stock": data.get("min_stock", existing.get("min_stock", 0)),
            "cost_price": data.get("cost_price", existing.get("cost_price", 0)),
            "sell_price": data.get("sell_price", existing.get("sell_price", 0)),
            "location": data.get("location", existing.get("location", "")),
            "notes": data.get("notes", existing.get("notes", "")),
            "image_url": data.get("image_url", existing.get("image_url", "")),
            "has_variants": data.get("has_variants", existing.get("has_variants", False)),
            "variants": data.get("variants", existing.get("variants", [])),
            "updated_at": now_iso(),
            "name_key": name_key,
        }
        await db.inventory_items.update_one({"id": existing["id"]}, {"$set": update, "$inc": {"current_stock": qty}})
        doc = await db.inventory_items.find_one({"id": existing["id"]}, {"_id": 0})
        await _record_inventory_batch(doc, qty, data, source="merge_duplicate_item")
        await write_audit(user, "update", "inventory", existing["id"], {"action": "merge_duplicate_stock", "qty": qty, "supplier": data.get("supplier_name")})
        return {**doc, "merged_existing": True}
    data["name_key"] = name_key
    doc = await insert_doc("inventory_items", data)
    await _record_inventory_batch(doc, float(data.get("current_stock") or 0), data, source="new_item")
    await write_audit(user, "create", "inventory", doc["id"], {"name": doc.get("name"), "qty": doc.get("current_stock")})
    return doc


@api.put("/inventory/{item_id}")
async def update_inventory(item_id: str, body: dict, user: dict = Depends(get_current_user)):
    body.pop("_id", None)
    body.pop("id", None)
    if "variants" in body:
        body["variants"] = _sanitize_pos_variants(body.get("variants") or [])
        body["has_variants"] = bool(body.get("has_variants") and body["variants"])
    if body.get("name"):
        body["name_key"] = _inventory_name_key(body.get("name"))
    body["updated_at"] = now_iso()
    await db.inventory_items.update_one({"id": item_id}, {"$set": body})
    doc = await db.inventory_items.find_one({"id": item_id}, {"_id": 0})
    return doc


@api.get("/inventory/{item_id}/batches")
async def list_inventory_batches(item_id: str, user: dict = Depends(get_current_user)):
    await _reconcile_batch_remaining(item_id)
    return await db.inventory_batches.find({"item_id": item_id}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.get("/inventory/batches/{batch_no}/label")
async def get_batch_label(batch_no: str, user: dict = Depends(get_current_user)):
    b = await db.inventory_batches.find_one({"$or": [{"id": batch_no}, {"batch_no": batch_no}]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Batch tidak ditemukan")
    return await _printable_batch_payload(b)


@api.delete("/inventory/{item_id}")
async def delete_inventory(item_id: str, user: dict = Depends(get_current_user)):
    await db.inventory_items.delete_one({"id": item_id})
    return {"ok": True}


@api.get("/inventory/low-stock")
async def low_stock(user: dict = Depends(get_current_user)):
    items = await list_collection("inventory_items")
    return [i for i in items if i.get("current_stock", 0) <= i.get("min_stock", 0) and i.get("min_stock", 0) > 0]


@api.get("/stock-movements")
async def stock_movements(user: dict = Depends(get_current_user)):
    movs = await db.stock_movements.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return movs


# ---------- BOM ----------
class BOMIngredient(BaseModel):
    item_id: str
    quantity: float


class BOMIn(BaseModel):
    output_item_id: str
    name: str
    type: str = "menu"  # menu | fertilizer
    ingredients: List[BOMIngredient]


@api.get("/bom")
async def list_bom(user: dict = Depends(get_current_user)):
    return await list_collection("bom_recipes")


@api.post("/bom")
async def create_bom(body: BOMIn, user: dict = Depends(get_current_user)):
    data = body.model_dump()
    return await insert_doc("bom_recipes", data)


@api.delete("/bom/{bom_id}")
async def delete_bom(bom_id: str, user: dict = Depends(get_current_user)):
    await db.bom_recipes.delete_one({"id": bom_id})
    return {"ok": True}


# ---------- Produksi (Restock product via BOM) ----------
class ProduceIn(BaseModel):
    quantity: float  # how many finished units to produce
    selected_batches: Optional[Dict[str, str]] = None  # ingredient_item_id -> batch_no/id


@api.post("/inventory/{item_id}/produce")
async def produce_item(item_id: str, body: ProduceIn, user: dict = Depends(get_current_user)):
    """Tambah stok produk jadi sebanyak `quantity`, otomatis kurangi bahan baku sesuai BOM."""
    item = await db.inventory_items.find_one({"id": item_id})
    if not item:
        raise HTTPException(404, "Item tidak ditemukan")
    if body.quantity <= 0:
        raise HTTPException(400, "Jumlah produksi harus lebih dari 0")
    bom = await db.bom_recipes.find_one({"output_item_id": item_id}, {"_id": 0})
    consumed = []
    if bom:
        # Pre-validate stock availability
        shortages = []
        for ing in bom["ingredients"]:
            need = ing["quantity"] * body.quantity
            ing_item = await db.inventory_items.find_one({"id": ing["item_id"]})
            if not ing_item:
                shortages.append({"item_id": ing["item_id"], "name": "(tidak ditemukan)", "need": need})
                continue
            available = ing_item.get("current_stock", 0)
            if available < need:
                shortages.append({"name": ing_item["name"], "available": available, "need": need})
        if shortages:
            raise HTTPException(400, "Bahan baku kurang: " + ", ".join([f"{s.get('name')} (butuh {s.get('need')}, ada {s.get('available',0)})" for s in shortages]))
        for ing in bom["ingredients"]:
            qty_used = ing["quantity"] * body.quantity
            await db.inventory_items.update_one(
                {"id": ing["item_id"]},
                {"$inc": {"current_stock": -qty_used}},
            )
            used_batches = await _consume_inventory_batches(ing["item_id"], qty_used, reference=f"PRODUCE-{item_id}", preferred_batch=(body.selected_batches or {}).get(ing["item_id"], ""))
            await db.stock_movements.insert_one({
                "id": gen_id(),
                "item_id": ing["item_id"],
                "type": "production_consume",
                "quantity": -qty_used,
                "reason": f"Produksi {body.quantity} {item['name']}",
                "consumed_batches": used_batches,
                "created_at": now_iso(),
            })
            consumed.append({"item_id": ing["item_id"], "quantity": qty_used})
    # Add finished product stock
    await db.inventory_items.update_one(
        {"id": item_id},
        {"$inc": {"current_stock": body.quantity}},
    )
    output_after = await db.inventory_items.find_one({"id": item_id}, {"_id": 0})
    output_batch = await _record_output_batch_if_enabled(output_after or item, body.quantity, "production", ref=f"PRODUCE-{item_id}", notes=f"Produksi {body.quantity:g} {item.get('name')}")
    await db.stock_movements.insert_one({
        "id": gen_id(),
        "item_id": item_id,
        "type": "production",
        "quantity": body.quantity,
        "reason": f"Produksi {body.quantity} unit",
        "batch_no": (output_batch or {}).get("batch_no", ""),
        "created_at": now_iso(),
    })
    await write_audit(user, "update", "inventory", item_id, {"action": "produce", "quantity": body.quantity, "bom_used": bool(bom)})
    return {"ok": True, "produced": body.quantity, "has_bom": bool(bom), "consumed": consumed}


# ---------- Tables ----------
class TableIn(BaseModel):
    name: str


@api.get("/tables")
async def list_tables(light: bool = False, user: dict = Depends(get_current_user)):
    tables = await list_collection("tables")
    if light:
        return tables
    orders = await db.orders.find({"status": {"$in": ["open", "sent", "bill_requested"]}}, {"_id": 0}).to_list(500)
    by_table = {}
    for o in orders:
        by_table.setdefault(o.get("table_id"), []).append(o)
    for t in tables:
        active = by_table.get(t["id"], [])
        t["status"] = "available" if not active else (active[0].get("status") or "occupied")
        t["active_order_id"] = active[0]["id"] if active else None
        t["active_total"] = sum(sum(it["quantity"] * it["unit_price"] for it in o.get("items", [])) for o in active)
    return tables


@api.post("/tables")
async def create_table(body: TableIn, user: dict = Depends(get_current_user)):
    return await insert_doc("tables", body.model_dump())


@api.put("/tables/{table_id}")
async def update_table(table_id: str, body: TableIn, user: dict = Depends(get_current_user)):
    if not body.name.strip():
        raise HTTPException(400, "Nama meja wajib")
    await db.tables.update_one({"id": table_id}, {"$set": {"name": body.name.strip(), "updated_at": now_iso()}})
    doc = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Meja tidak ditemukan")
    await write_audit(user, "update", "table", table_id, {"name": body.name.strip()})
    return doc


@api.delete("/tables/{table_id}")
async def delete_table(table_id: str, user: dict = Depends(get_current_user)):
    active = await db.orders.find_one({"table_id": table_id, "status": {"$nin": ["paid", "cancelled"]}})
    if active:
        raise HTTPException(400, "Meja masih memiliki order aktif. Selesaikan/batalkan order dulu.")
    await db.tables.delete_one({"id": table_id})
    await write_audit(user, "delete", "table", table_id, {})
    return {"ok": True}


# ---------- Orders & Transactions ----------
class OrderItemIn(BaseModel):
    item_id: str
    name: str
    quantity: int
    unit_price: int
    notes: Optional[str] = ""
    variant_id: Optional[str] = ""
    variant_name: Optional[str] = ""


class OrderIn(BaseModel):
    table_id: Optional[str] = None
    items: List[OrderItemIn]
    notes: Optional[str] = ""


@api.get("/orders")
async def list_orders(user: dict = Depends(get_current_user)):
    return await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.get("/orders/active")
async def active_orders(user: dict = Depends(get_current_user)):
    return await db.orders.find(
        {"status": {"$in": ["open", "sent", "bill_requested"]}}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)



@api.get("/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    doc = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Order tidak ditemukan")
    return doc


def _order_line_key(line: dict) -> tuple:
    return (
        str(line.get("item_id") or ""),
        str(line.get("variant_id") or ""),
        str(line.get("name") or ""),
        int(line.get("unit_price") or 0),
    )


def _subtract_split_items_from_order(source_items: list, paid_items: list) -> list:
    remaining = []
    to_pay = {}
    for it in paid_items:
        d = it.model_dump() if hasattr(it, "model_dump") else dict(it)
        key = _order_line_key(d)
        to_pay[key] = to_pay.get(key, 0) + int(d.get("quantity") or 0)
    for raw in source_items or []:
        line = dict(raw)
        key = _order_line_key(line)
        qty = int(line.get("quantity") or 0)
        pay_qty = int(to_pay.get(key, 0) or 0)
        if pay_qty < 0:
            pay_qty = 0
        if pay_qty > qty:
            raise HTTPException(400, f"Qty split melebihi pesanan untuk {line.get('name')}")
        left = qty - pay_qty
        if left > 0:
            line["quantity"] = left
            remaining.append(line)
        to_pay[key] = max(0, pay_qty - qty)
    leftovers = sum(max(0, int(v or 0)) for v in to_pay.values())
    if leftovers > 0:
        raise HTTPException(400, "Item split tidak cocok dengan order aktif")
    return remaining


async def _next_takeaway_queue_no() -> str:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = f"TA-{today}-"
    count = await db.orders.count_documents({"queue_no": {"$regex": f"^{prefix}"}})
    return f"{prefix}{count + 1:03d}"

@api.post("/orders")
async def create_order(body: OrderIn, user: dict = Depends(get_current_user)):
    is_takeaway = not body.table_id or str(body.table_id).lower() in ("takeaway", "_takeaway")
    queue_no = await _next_takeaway_queue_no() if is_takeaway else ""
    doc = {
        "id": gen_id(),
        "table_id": None if is_takeaway else body.table_id,
        "order_type": "takeaway" if is_takeaway else "dine_in",
        "queue_no": queue_no,
        "items": [i.model_dump() for i in body.items],
        "notes": body.notes,
        "status": "sent",
        "created_by": user["id"],
        "created_at": now_iso(),
    }
    await db.orders.insert_one(doc)
    doc.pop("_id", None)
    await broadcast_event("order_created", {"id": doc["id"], "table_id": doc.get("table_id")})
    return doc


@api.put("/orders/{order_id}")
async def update_order(order_id: str, body: dict, user: dict = Depends(get_current_user)):
    body.pop("_id", None)
    body.pop("id", None)
    await db.orders.update_one({"id": order_id}, {"$set": body})
    doc = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return doc


class TransactionIn(BaseModel):
    order_id: Optional[str] = None
    table_id: Optional[str] = None
    items: List[OrderItemIn]
    discount: int = 0
    payment_method: str = "cash"
    cash_received: int = 0
    customer_name: Optional[str] = ""
    customer_phone: Optional[str] = ""
    is_bon: bool = False
    transaction_type: Literal["SALE", "SELF_USE", "WASTE", "ADJUSTMENT"] = "SALE"
    notes: Optional[str] = ""
    unit: str = "warung"
    branch_id: Optional[str] = None
    member_id: Optional[str] = None
    points_redeemed: int = 0
    split_source_order_id: Optional[str] = None


async def _next_transaction_no(unit: str = "POS") -> str:
    """Retail-style daily transaction number.

    Format: AW-DDMMYY-0001. Tanggal/jam detail tetap ada di struk,
    sedangkan nomor ini pendek, mudah dicari, dan urut per hari.
    """
    day = datetime.now(timezone.utc).strftime("%d%m%y")
    prefix = f"AW-{day}-"
    count = await db.transactions.count_documents({"trx_no": {"$regex": f"^{prefix}"}})
    return f"{prefix}{count + 1:04d}"

@api.post("/transactions")
async def create_transaction(body: TransactionIn, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    if not body.items:
        raise HTTPException(400, "Item transaksi kosong")
    trx_type = (body.transaction_type or "SALE").upper()
    if trx_type not in ("SALE", "SELF_USE", "WASTE", "ADJUSTMENT"):
        raise HTTPException(400, "Jenis transaksi tidak valid")

    retail_subtotal = sum(i.quantity * i.unit_price for i in body.items)
    discount = max(0, int(body.discount or 0))
    sale_total = max(0, retail_subtotal - discount)
    cash_received = max(0, int(body.cash_received or 0))

    split_source_order = None
    split_remaining_items = None
    if body.split_source_order_id:
        split_source_order = await db.orders.find_one({"id": body.split_source_order_id}, {"_id": 0})
        if not split_source_order:
            raise HTTPException(404, "Order sumber split bill tidak ditemukan")
        if str(split_source_order.get("status", "")).lower() in ("paid", "cancelled", "closed"):
            raise HTTPException(400, "Order sumber split bill sudah selesai")
        split_remaining_items = _subtract_split_items_from_order(split_source_order.get("items") or [], body.items)

    # Cost/HPP dihitung dari inventory saat transaksi dibuat.
    cost_total = 0
    trx_no = await _next_transaction_no(body.unit)
    stock_type = {"SALE": "sale", "SELF_USE": "self_use", "WASTE": "waste", "ADJUSTMENT": "adjustment"}[trx_type]
    for it in body.items:
        inv = await db.inventory_items.find_one({"id": it.item_id})
        unit_cost = 0
        if inv:
            unit_cost = int(inv.get("cost_price") or inv.get("hpp") or 0)
            cost_total += unit_cost * it.quantity
            await db.inventory_items.update_one({"id": it.item_id}, {"$inc": {"current_stock": -it.quantity}})
            consumed_batches = await _consume_inventory_batches(it.item_id, it.quantity, reference=trx_no)
            after = await db.inventory_items.find_one({"id": it.item_id}, {"_id": 0})
            await db.stock_movements.insert_one({
                "id": gen_id(),
                "item_id": it.item_id,
                "business_unit": inv.get("business_unit", body.unit),
                "type": stock_type,
                "quantity": -it.quantity,
                "qty_out": it.quantity,
                "qty_in": 0,
                "balance_after": (after or {}).get("current_stock"),
                "reason": f"{stock_type.upper()} {trx_no}",
                "reference_id": trx_no,
                "consumed_batches": consumed_batches if 'consumed_batches' in locals() else [],
                "created_at": now_iso(),
            })
            background_tasks.add_task(check_low_stock_and_notify, it.item_id)

    is_sale = trx_type == "SALE"
    auto_debt = is_sale and body.payment_method == "cash" and cash_received < sale_total
    effective_is_bon = bool(body.is_bon or auto_debt) if is_sale else False
    paid_amount = 0 if not is_sale else (min(cash_received, sale_total) if body.payment_method == "cash" else sale_total)
    debt_amount = 0 if not is_sale else max(0, sale_total - paid_amount)
    payment_status = (
        "INTERNAL" if not is_sale else
        "PAID" if debt_amount == 0 else
        "PARTIAL" if paid_amount > 0 else
        "DEBT"
    )
    change = (cash_received - sale_total) if (is_sale and body.payment_method == "cash") else 0
    receipt_snapshot = await build_receipt_snapshot(body.unit)
    source_order = split_source_order or (await db.orders.find_one({"id": body.order_id}, {"_id": 0}) if body.order_id else None)
    settings_doc = await db.settings.find_one({}, {"_id": 0}) or {}
    tax_rate = float(settings_doc.get("tax_rate") or 0)
    tax_receipt_enabled = bool(settings_doc.get("tax_receipt_enabled", True))
    tax_inclusive = bool(settings_doc.get("tax_inclusive", True))
    tax_amount = 0
    taxable_amount = sale_total
    if is_sale and tax_receipt_enabled and tax_rate > 0:
        if tax_inclusive:
            tax_amount = int(round(sale_total * tax_rate / (100 + tax_rate)))
            taxable_amount = max(0, sale_total - tax_amount)
        else:
            tax_amount = int(round(sale_total * tax_rate / 100))
            taxable_amount = sale_total

    doc = {
        "id": gen_id(),
        "trx_no": trx_no,
        "lookup_key": trx_no,
        "order_id": body.order_id,
        "split_source_order_id": body.split_source_order_id,
        "table_id": body.table_id or ((split_source_order or {}).get("table_id") if split_source_order else None),
        "queue_no": (source_order or {}).get("queue_no", ""),
        "order_type": (source_order or {}).get("order_type", ""),
        "branch_id": body.branch_id,
        "items": [i.model_dump() for i in body.items],
        "subtotal": retail_subtotal,
        "discount": discount,
        "total": sale_total if is_sale else 0,
        "tax_rate": tax_rate if is_sale else 0,
        "tax_receipt_enabled": tax_receipt_enabled if is_sale else False,
        "tax_inclusive": tax_inclusive if is_sale else True,
        "tax_amount": tax_amount if is_sale else 0,
        "taxable_amount": taxable_amount if is_sale else 0,
        "cost_total": int(cost_total),
        "transaction_type": trx_type,
        "payment_method": body.payment_method if is_sale else trx_type.lower(),
        "payment_status": payment_status,
        "paid_amount": paid_amount,
        "debt_amount": debt_amount,
        "cash_received": cash_received if is_sale else 0,
        "change": change,
        "customer_name": body.customer_name or ("Pelanggan" if auto_debt else ""),
        "customer_phone": body.customer_phone,
        "is_bon": effective_is_bon,
        "notes": body.notes or "",
        "unit": body.unit,
        "receipt_snapshot": receipt_snapshot,
        "cashier_id": user["id"],
        "cashier_name": user.get("name"),
        "created_at": now_iso(),
    }
    await db.transactions.insert_one(doc)
    doc.pop("_id", None)

    # Loyalty hanya untuk penjualan berbayar, bukan pemakaian sendiri/rusak.
    if is_sale and (body.customer_name or body.member_id) and not effective_is_bon:
        member = None
        if body.member_id:
            member = await db.members.find_one({"$or": [{"id": body.member_id}, {"member_id": body.member_id}, {"phone": body.member_id}]})
        if member:
            loy = await db.loyalty_settings.find_one({}, {"_id": 0}) or {"earn_rate": 1000}
            points_earned = int(sale_total / loy.get("earn_rate", 1000))
            new_points = member.get("points", 0) + points_earned
            new_total = member.get("total_spent", 0) + sale_total
            new_tier = "Gold" if new_points >= 500 else ("Silver" if new_points >= 100 else "Bronze")
            await db.members.update_one({"id": member["id"]}, {"$set": {"points": new_points, "total_spent": new_total, "tier": new_tier}})
            doc["points_earned"] = points_earned
            doc["member_id"] = member["id"]
            doc["member_name"] = member["name"]
            await db.transactions.update_one({"id": doc["id"]}, {"$set": {"points_earned": points_earned, "member_id": member["id"], "member_name": member["name"]}})

    if is_sale and body.member_id and body.points_redeemed:
        await db.members.update_one({"$or": [{"id": body.member_id}, {"member_id": body.member_id}]}, {"$inc": {"points": -body.points_redeemed}})

    # Close order setelah pembayaran penuh, atau kurangi order sumber untuk split bill.
    if body.split_source_order_id and split_source_order is not None and split_remaining_items is not None:
        if split_remaining_items:
            await db.orders.update_one({"id": body.split_source_order_id}, {"$set": {"items": split_remaining_items, "updated_at": now_iso(), "last_split_trx_id": doc["id"]}})
            await broadcast_event("order_updated", {"id": body.split_source_order_id, "status": "sent", "table_id": (split_source_order or {}).get("table_id")})
        else:
            await db.orders.update_one({"id": body.split_source_order_id}, {"$set": {"status": "paid" if is_sale else "closed", "last_split_trx_id": doc["id"], "updated_at": now_iso()}})
            await broadcast_event("order_updated", {"id": body.split_source_order_id, "status": "paid", "table_id": (split_source_order or {}).get("table_id")})
    elif body.order_id:
        await db.orders.update_one({"id": body.order_id}, {"$set": {"status": "paid" if is_sale else "closed"}})
        await broadcast_event("order_updated", {"id": body.order_id, "status": "paid", "table_id": body.table_id})

    # Customer bon/hutang otomatis jika uang kurang.
    if effective_is_bon and debt_amount > 0:
        # amount di customer_debts harus berarti SISA BON, bukan total belanja.
        # Contoh: total 21.000, DP 10.000 -> amount 11.000, paid 0.
        await db.customer_debts.insert_one({
            "id": gen_id(),
            "customer_name": body.customer_name or "Pelanggan",
            "customer_phone": body.customer_phone or "",
            "amount": debt_amount,
            "paid": 0,
            "status": "unpaid",
            "original_total": sale_total,
            "initial_paid": paid_amount,
            "transaction_id": doc["id"],
            "unit": body.unit,
            "created_at": now_iso(),
        })
        background_tasks.add_task(write_notification, "DEBT", "Transaksi menjadi hutang", f"{doc['trx_no']} kurang {format_rp_short(debt_amount)}", business_id=body.unit, ref_type="transaction", ref_id=doc["id"], priority="high")

    # Journal entries ringan ala Odoo.
    if is_sale:
        debit_lines = []
        if paid_amount > 0:
            debit_lines.append({"account": payment_account(body.payment_method), "debit": paid_amount, "credit": 0})
        if debt_amount > 0:
            debit_lines.append({"account": "Piutang Bon", "debit": debt_amount, "credit": 0})
        if not debit_lines:
            debit_lines.append({"account": "Piutang Bon", "debit": sale_total, "credit": 0})
        await db.journal_entries.insert_one({
            "id": gen_id(),
            "date": doc["created_at"],
            "description": f"Penjualan {body.unit} - {trx_no}",
            "lines": debit_lines + [{"account": f"Pendapatan {body.unit.capitalize()}", "debit": 0, "credit": sale_total}],
            "reference": "transaction",
            "reference_id": doc["id"],
            "unit": body.unit,
            "created_at": now_iso(),
        })
        if cost_total > 0:
            await db.journal_entries.insert_one({
                "id": gen_id(), "date": doc["created_at"],
                "description": f"HPP {body.unit} - {trx_no}",
                "lines": [
                    {"account": f"HPP {body.unit.capitalize()}", "debit": int(cost_total), "credit": 0},
                    {"account": "Persediaan", "debit": 0, "credit": int(cost_total)},
                ],
                "reference": "hpp", "reference_id": doc["id"], "unit": body.unit, "created_at": now_iso(),
            })
    else:
        expense_account = {"SELF_USE": "Beban Pemakaian Sendiri", "WASTE": "Beban Barang Rusak", "ADJUSTMENT": "Beban Penyesuaian Stok"}.get(trx_type, "Beban Persediaan")
        if cost_total > 0:
            await db.journal_entries.insert_one({
                "id": gen_id(), "date": doc["created_at"],
                "description": f"{expense_account} - {trx_no}",
                "lines": [
                    {"account": expense_account, "debit": int(cost_total), "credit": 0},
                    {"account": "Persediaan", "debit": 0, "credit": int(cost_total)},
                ],
                "reference": trx_type.lower(), "reference_id": doc["id"], "unit": body.unit, "created_at": now_iso(),
            })

    invalidate_finance_summary_cache()
    background_tasks.add_task(broadcast_event, "transaction_created", {"id": doc["id"], "total": doc["total"], "unit": body.unit, "transaction_type": trx_type})
    background_tasks.add_task(write_notification, "TRANSACTION", "Transaksi baru", f"{trx_no} · {format_rp_short(doc['total'])} · {payment_status}", business_id=body.unit, ref_type="transaction", ref_id=doc["id"])
    background_tasks.add_task(write_audit, user, "create", "transaction", doc["id"], {"trx_no": trx_no, "total": doc["total"], "type": trx_type, "payment_status": payment_status})
    return doc


@api.get("/transactions")
async def list_transactions(user: dict = Depends(get_current_user), limit: int = 500, unit: Optional[str] = None, include_receipts: bool = False):
    q = {}
    if unit:
        q["unit"] = unit
    limit = max(1, min(int(limit or 500), 2000))
    rows = await db.transactions.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit * 2)
    debt_ctx = await _load_debt_financial_context()
    enriched = []
    for row in rows:
        # Dokumen pelunasan bon legacy hanya untuk audit/struk, bukan transaksi kasir utama.
        if _is_debt_settlement_document(row) and not include_receipts:
            continue
        enriched.append(_enrich_transaction_financial_fields(row, debt_ctx))
        if len(enriched) >= limit:
            break
    return enriched


@api.get("/transactions/{trx_id}")
async def get_transaction(trx_id: str, user: dict = Depends(get_current_user)):
    trx = await db.transactions.find_one({"id": trx_id}, {"_id": 0})
    if not trx:
        raise HTTPException(404, "Transaksi tidak ditemukan")
    debt_ctx = await _load_debt_financial_context()
    return _enrich_transaction_financial_fields(trx, debt_ctx)


@api.get("/transactions/{trx_id}/receipt")
async def get_transaction_receipt(trx_id: str, user: dict = Depends(get_current_user)):
    trx = await get_transaction(trx_id, user)
    if not trx.get("receipt_snapshot"):
        trx["receipt_snapshot"] = await build_receipt_snapshot(trx.get("unit", "warung"))
    return {"transaction": trx, "text": generate_receipt_text(trx)}


class SendReceiptWaIn(BaseModel):
    phone: Optional[str] = ""


@api.post("/transactions/{trx_id}/send-whatsapp")
async def send_transaction_receipt_wa(trx_id: str, body: SendReceiptWaIn, user: dict = Depends(get_current_user)):
    trx = await get_transaction(trx_id, user)
    phone = body.phone or trx.get("customer_phone")
    text = generate_receipt_text(trx)
    result = await send_whatsapp_message(phone, text)
    await write_audit(user, "send", "receipt_whatsapp", trx_id, {"phone": normalize_phone(phone), "sent": result.get("sent")})
    return {**result, "text": text}


# ---------- Customer Debts (Bon) ----------
def _normalize_debt_for_response(d: dict) -> dict:
    """Return customer debt as outstanding-balance based response.

    Schema baru: amount = sisa bon saat dibuat, paid = pembayaran atas bon.
    Schema lama (kompatibilitas): amount = total transaksi, paid = DP/uang awal.
    Untuk UI, bon harus tampil sebagai sisa tagihan, bukan total transaksi.
    """
    if not d:
        return d
    out = dict(d)
    out.pop("_id", None)
    raw_amount = int(out.get("amount") or 0)
    raw_paid = int(out.get("paid") or 0)

    if out.get("original_total") is not None:
        out["remaining"] = max(0, raw_amount - raw_paid)
        out["payment_due"] = out["remaining"]
        out["settlement_due"] = out["remaining"]
        out["original_total"] = int(out.get("original_total") or raw_amount)
        out["initial_paid"] = int(out.get("initial_paid") or 0)
        return out

    # Legacy docs made before the fix: amount was original sale total and paid was customer DP.
    if out.get("transaction_id") and raw_paid > 0:
        remaining = max(0, raw_amount - raw_paid)
        out["original_total"] = raw_amount
        out["initial_paid"] = raw_paid
        out["amount"] = remaining
        out["paid"] = 0 if out.get("status") != "paid" else remaining
        out["remaining"] = 0 if out.get("status") == "paid" else remaining
        out["payment_due"] = out["remaining"]
        out["settlement_due"] = out["remaining"]
        return out

    out["original_total"] = int(out.get("original_total") or raw_amount)
    out["initial_paid"] = int(out.get("initial_paid") or 0)
    out["remaining"] = max(0, raw_amount - raw_paid)
    out["payment_due"] = out["remaining"]
    out["settlement_due"] = out["remaining"]
    return out


@api.get("/customer-debts")
async def list_debts(user: dict = Depends(get_current_user)):
    debts = await db.customer_debts.find({"status": {"$nin": ["cancelled", "void", "deleted"]}}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [_normalize_debt_for_response(d) for d in debts]


@api.get("/customer-debts/search")
async def search_debts(q: str = "", include_paid: bool = False, user: dict = Depends(get_current_user)):
    query = {}
    if not include_paid:
        query["status"] = {"$nin": ["paid", "cancelled", "void", "deleted"]}
    q = (q or "").strip()
    if q:
        query["$or"] = [
            {"customer_name": {"$regex": re.escape(q), "$options": "i"}},
            {"customer_phone": {"$regex": re.escape(q), "$options": "i"}},
            {"original_trx_no": {"$regex": re.escape(q), "$options": "i"}},
            {"transaction_id": {"$regex": re.escape(q), "$options": "i"}},
            {"trx_no": {"$regex": re.escape(q), "$options": "i"}},
        ]
    rows = await db.customer_debts.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)
    normalized = [_normalize_debt_for_response(r) for r in rows]
    # Fallback: beberapa data lama hanya ada di transaksi, belum tersalin sempurna ke customer_debts.
    if q and len(normalized) < 10:
        trx_q = {"debt_amount": {"$gt": 0}, "payment_status": {"$ne": "CANCELLED"}, "cancel_reason": {"$nin": ["manual_cancel", "user_cancel", "void"]}, "$or": [
            {"trx_no": {"$regex": re.escape(q), "$options": "i"}},
            {"customer_name": {"$regex": re.escape(q), "$options": "i"}},
            {"customer_phone": {"$regex": re.escape(q), "$options": "i"}},
        ]}
        trx_rows = await db.transactions.find(trx_q, {"_id": 0}).sort("created_at", -1).to_list(20)
        existing_ids = {x.get("transaction_id") for x in normalized}
        for t in trx_rows:
            if t.get("id") in existing_ids:
                continue
            normalized.append({
                "id": t.get("id"), "transaction_id": t.get("id"), "original_trx_no": t.get("trx_no"),
                "customer_name": t.get("customer_name") or "Pelanggan", "customer_phone": t.get("customer_phone") or "",
                "amount": int(t.get("total") or 0), "paid": int(t.get("paid_amount") or t.get("cash_collected") or t.get("cash_received") or 0),
                "remaining": int(t.get("debt_amount") or 0), "status": t.get("payment_status") or "PARTIAL",
                "created_at": t.get("created_at"), "original_items": t.get("items") or [], "original_total": int(t.get("total") or 0),
            })
    return normalized


@api.get("/transactions/search")
async def search_transactions(q: str = "", limit: int = 50, user: dict = Depends(get_current_user)):
    q = (q or "").strip()
    query = {}
    if q:
        query["$or"] = [
            {"trx_no": {"$regex": re.escape(q), "$options": "i"}},
            {"customer_name": {"$regex": re.escape(q), "$options": "i"}},
            {"customer_phone": {"$regex": re.escape(q), "$options": "i"}},
        ]
    return await db.transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(min(max(int(limit or 50), 1), 200))


class PayDebtIn(BaseModel):
    amount: int


@api.post("/customer-debts/{debt_id}/pay")
async def pay_debt(debt_id: str, body: PayDebtIn, user: dict = Depends(get_current_user)):
    debt = await db.customer_debts.find_one({"id": debt_id})
    if not debt:
        raise HTTPException(404, "Bon tidak ditemukan")
    amount = max(0, int(body.amount or 0))
    if amount <= 0:
        raise HTTPException(400, "Nominal pelunasan harus lebih dari 0")
    remaining_before = max(0, int(debt.get("amount", 0)) - int(debt.get("paid", 0)))
    pay_amount = min(amount, remaining_before)
    new_paid = int(debt.get("paid", 0)) + pay_amount
    status = "paid" if new_paid >= int(debt.get("amount", 0)) else "partial"
    await db.customer_debts.update_one(
        {"id": debt_id},
        {"$set": {"paid": new_paid, "status": status, "last_paid_at": now_iso()}},
    )
    payment_id = gen_id()
    await db.debt_payments.insert_one({
        "id": payment_id,
        "debt_id": debt_id,
        "transaction_id": debt.get("transaction_id"),
        "customer_name": debt.get("customer_name", "Pelanggan"),
        "amount": pay_amount,
        "cash_received": pay_amount,
        "change": 0,
        "payment_method": "cash",
        "created_at": now_iso(),
        "cashier_id": user["id"],
        "cashier_name": user.get("name", user.get("email")),
        "source": "debt_pay_endpoint",
    })
    # Tambahkan penerimaan kas/bank tanpa membuat revenue baru dobel.
    await db.journal_entries.insert_one({
        "id": gen_id(),
        "date": now_iso(),
        "description": f"Pelunasan bon {debt['customer_name']} (sebagian)" if status == "partial" else f"Pelunasan bon {debt['customer_name']}",
        "lines": [
            {"account": "Kas", "debit": pay_amount, "credit": 0},
            {"account": "Piutang Bon", "debit": 0, "credit": pay_amount},
        ],
        "reference": "debt_payment",
        "reference_id": payment_id,
        "unit": debt.get("unit", "warung"),
        "created_at": now_iso(),
    })
    # Update transaksi asli: paid_amount naik, debt_amount turun. Jangan cancel transaksi asli.
    if debt.get("transaction_id"):
        trx = await db.transactions.find_one({"id": debt["transaction_id"]})
        if trx:
            state = _compute_debt_payment_state(debt, trx)
            trx_total = state["original_total"]
            trx_paid = min(trx_total, state["previous_paid"] + pay_amount)
            trx_debt = max(0, trx_total - trx_paid)
            await db.transactions.update_one(
                {"id": trx["id"]},
                {"$set": {
                    "cancelled": False,
                    "paid_amount": trx_paid,
                    "debt_amount": trx_debt,
                    "payment_status": "PAID" if trx_debt == 0 else "PARTIAL",
                    "is_bon": trx_debt > 0,
                    "settled_at": now_iso() if trx_debt == 0 else trx.get("settled_at"),
                    "last_debt_payment_at": now_iso(),
                    "last_debt_payment_amount": pay_amount,
                    "initial_cash_received": int(trx.get("initial_cash_received", trx.get("cash_received", 0)) or 0),
                    "cash_collected": trx_paid,
                }, "$unset": {"cancel_reason": "", "cancelled_at": "", "cancelled_by": "", "replaced_by": ""}}
            )
    invalidate_finance_summary_cache()
    await write_audit(user, "update", "customer_debt", debt_id, {"amount": pay_amount, "status": status})
    return {"ok": True, "status": status, "paid": new_paid, "remaining": max(0, int(debt.get("amount", 0)) - new_paid)}


@api.post("/customer-debts/{debt_id}/mark-paid")
async def mark_paid_full(debt_id: str, user: dict = Depends(get_current_user)):
    debt = await db.customer_debts.find_one({"id": debt_id})
    if not debt:
        raise HTTPException(404, "Bon tidak ditemukan")
    if str(debt.get("status") or "").lower() in ("cancelled", "void", "deleted"):
        raise HTTPException(400, "Bon ini sudah dibatalkan dan tidak boleh dilunasi")
    if debt.get("status") == "paid":
        return {"ok": True, "already_paid": True}
    remaining = debt["amount"] - debt.get("paid", 0)
    await db.customer_debts.update_one(
        {"id": debt_id},
        {"$set": {"paid": debt["amount"], "status": "paid", "last_paid_at": now_iso()}},
    )
    # Record remaining cash receipt to journal + debt_payments so reports can rebuild cash-basis revenue.
    payment_id = gen_id()
    if remaining > 0:
        await db.debt_payments.insert_one({
            "id": payment_id,
            "debt_id": debt_id,
            "transaction_id": debt.get("transaction_id"),
            "customer_name": debt.get("customer_name", "Pelanggan"),
            "amount": remaining,
            "cash_received": remaining,
            "change": 0,
            "payment_method": "cash",
            "created_at": now_iso(),
            "cashier_id": user["id"],
            "cashier_name": user.get("name", user.get("email")),
            "source": "mark_paid_endpoint",
        })
        await db.journal_entries.insert_one({
            "id": gen_id(),
            "date": now_iso(),
            "description": f"Pelunasan bon {debt['customer_name']} (Lunas)",
            "lines": [
                {"account": "Kas", "debit": remaining, "credit": 0},
                {"account": "Piutang Bon", "debit": 0, "credit": remaining},
            ],
            "reference": "debt_payment",
            "reference_id": payment_id,
            "unit": debt.get("unit", "warung"),
            "created_at": now_iso(),
        })
    # Update related transaction: paid_amount naik sebesar sisa bon. Jangan cancel transaksi asli.
    if debt.get("transaction_id"):
        trx = await db.transactions.find_one({"id": debt["transaction_id"]})
        if trx:
            state = _compute_debt_payment_state(debt, trx)
            trx_total = state["original_total"]
            trx_paid = min(trx_total, state["previous_paid"] + remaining)
            trx_debt = max(0, trx_total - trx_paid)
            await db.transactions.update_one(
                {"id": trx["id"]},
                {"$set": {
                    "cancelled": False,
                    "paid_amount": trx_paid,
                    "debt_amount": trx_debt,
                    "payment_status": "PAID" if trx_debt == 0 else "PARTIAL",
                    "is_bon": trx_debt > 0,
                    "settled_at": now_iso() if trx_debt == 0 else trx.get("settled_at"),
                    "last_debt_payment_at": now_iso(),
                    "last_debt_payment_amount": remaining,
                    "initial_cash_received": int(trx.get("initial_cash_received", trx.get("cash_received", 0)) or 0),
                    "cash_collected": trx_paid,
                }, "$unset": {"cancel_reason": "", "cancelled_at": "", "cancelled_by": "", "replaced_by": ""}}
            )
    invalidate_finance_summary_cache()
    await write_audit(user, "update", "customer_debt", debt_id, {"status": "paid", "full": True})
    return {"ok": True}


@api.get("/customer-debts/{debt_id}")
async def get_debt(debt_id: str, user: dict = Depends(get_current_user)):
    debt_raw = await db.customer_debts.find_one({"id": debt_id}, {"_id": 0})
    if not debt_raw:
        raise HTTPException(404, "Bon tidak ditemukan")
    debt = _normalize_debt_for_response(debt_raw)
    # Include original transaction items if available
    if debt_raw.get("transaction_id"):
        trx = await db.transactions.find_one({"id": debt_raw["transaction_id"]}, {"_id": 0})
        if trx:
            debt["original_items"] = trx.get("items", [])
            debt["customer_phone"] = trx.get("customer_phone") or ""
            debt["original_trx_no"] = trx.get("trx_no")
            debt["unit"] = trx.get("unit", debt.get("unit", "warung"))
    return debt


class SettleBonIn(BaseModel):
    payment_method: str = "cash"  # cash | transfer | qris
    cash_received: int = 0


@api.post("/customer-debts/{debt_id}/settle-via-kasir")
async def settle_via_kasir(debt_id: str, body: SettleBonIn, user: dict = Depends(get_current_user)):
    """Pelunasan bon dari Kasir.

    Fix penting:
    - Jangan membatalkan transaksi awal.
    - Jangan membuat transaksi penjualan baru senilai sisa bon.
    - Pelunasan hanya menambah paid_amount transaksi awal dan mengurangi Piutang Bon.

    Dengan begitu contoh total 21.000 + DP 10.000 + pelunasan 11.000
    akan tampil sebagai revenue terkumpul 21.000, bukan hanya 11.000.
    """
    debt = await db.customer_debts.find_one({"id": debt_id})
    if not debt:
        raise HTTPException(404, "Bon tidak ditemukan")
    if str(debt.get("status") or "").lower() in ("cancelled", "void", "deleted"):
        raise HTTPException(400, "Bon ini sudah dibatalkan dan tidak boleh dilunasi")
    if debt.get("status") == "paid":
        raise HTTPException(400, "Bon sudah lunas")

    original_trx = None
    if debt.get("transaction_id"):
        original_trx = await db.transactions.find_one({"id": debt["transaction_id"]})

    state = _compute_debt_payment_state(debt, original_trx)
    remaining = state["remaining_before"]
    previous_paid = state["previous_paid"]
    original_total = state["original_total"]
    if remaining <= 0:
        await db.customer_debts.update_one({"id": debt_id}, {"$set": {"status": "paid", "last_paid_at": now_iso()}})
        raise HTTPException(400, "Bon sudah tidak memiliki sisa tagihan")

    payment_method = (body.payment_method or "cash").lower()
    cash_received = max(0, int(body.cash_received or 0))
    if payment_method == "cash" and cash_received < remaining:
        raise HTTPException(400, "Uang tunai kurang")
    payment_amount = remaining
    change = (cash_received - remaining) if payment_method == "cash" else 0

    # Mark debt paid. amount di schema baru = sisa bon; paid menjadi sisa bon yang sudah dilunasi.
    await db.customer_debts.update_one(
        {"id": debt_id},
        {"$set": {
            "paid": int(debt.get("amount", 0)),
            "status": "paid",
            "last_paid_at": now_iso(),
            "settlement_method": payment_method,
            "settlement_amount": payment_amount,
        }},
    )

    # Update transaksi awal agar laporan revenue berbasis kas menjadi benar.
    if original_trx:
        new_paid = min(original_total, previous_paid + payment_amount)
        new_debt = max(0, original_total - new_paid)
        original_cash_received = int(original_trx.get("initial_cash_received", original_trx.get("cash_received", 0)) or 0)
        await db.transactions.update_one(
            {"id": original_trx["id"]},
            {
                "$set": {
                    "cancelled": False,
                    "paid_amount": new_paid,
                    "debt_amount": new_debt,
                    "payment_status": "PAID" if new_debt == 0 else "PARTIAL",
                    "is_bon": new_debt > 0,
                    "settled_at": now_iso() if new_debt == 0 else original_trx.get("settled_at"),
                    "last_debt_payment_at": now_iso(),
                    "last_debt_payment_amount": payment_amount,
                    "last_debt_payment_method": payment_method,
                    "initial_cash_received": original_cash_received,
                    "cash_collected": new_paid,
                    # Jangan overwrite cash_received transaksi awal: itu harus tetap merepresentasikan DP/uang pertama di struk asli.
                },
                "$unset": {"cancel_reason": "", "cancelled_at": "", "cancelled_by": "", "replaced_by": ""},
            }
        )

    payment_id = gen_id()
    await db.debt_payments.insert_one({
        "id": payment_id,
        "debt_id": debt_id,
        "transaction_id": original_trx.get("id") if original_trx else None,
        "customer_name": debt.get("customer_name", "Pelanggan"),
        "amount": payment_amount,
        "cash_received": cash_received if payment_method == "cash" else payment_amount,
        "change": change,
        "payment_method": payment_method,
        "created_at": now_iso(),
        "cashier_id": user["id"],
        "cashier_name": user.get("name", user.get("email")),
    })

    await db.journal_entries.insert_one({
        "id": gen_id(),
        "date": now_iso(),
        "description": f"Pelunasan bon {debt.get('customer_name', 'Pelanggan')}",
        "lines": [
            {"account": payment_account(payment_method), "debit": payment_amount, "credit": 0},
            {"account": "Piutang Bon", "debit": 0, "credit": payment_amount},
        ],
        "reference": "debt_payment",
        "reference_id": payment_id,
        "unit": (original_trx or {}).get("unit", debt.get("unit", "warung")),
        "created_at": now_iso(),
    })

    # Return receipt-ready transaction snapshot. Ini bukan penjualan baru dan tidak mengurangi stok lagi.
    receipt_doc = dict(original_trx or {})
    receipt_doc.pop("_id", None)
    receipt_doc.update({
        "id": payment_id,
        "trx_no": f"PAY-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}",
        "receipt_kind": "DEBT_SETTLEMENT",
        "settled_from_debt": debt_id,
        "settled_from_trx": original_trx.get("id") if original_trx else None,
        "original_trx_no": original_trx.get("trx_no") if original_trx else debt.get("transaction_id"),
        "items": (original_trx or {}).get("items", []),
        "subtotal": original_total,
        "total": original_total,
        "previous_paid": previous_paid,
        "payment_amount": payment_amount,
        "paid_amount": min(original_total, previous_paid + payment_amount),
        "debt_amount": 0,
        "payment_method": payment_method,
        "cash_received": cash_received if payment_method == "cash" else payment_amount,
        "change": change,
        "customer_name": debt.get("customer_name", "Pelanggan"),
        "customer_phone": debt.get("customer_phone") or (original_trx or {}).get("customer_phone", ""),
        "is_bon": False,
        "payment_status": "PAID",
        "transaction_type": "SALE",
        "created_at": now_iso(),
        "cashier_id": user["id"],
        "cashier_name": user.get("name", user.get("email")),
    })

    await write_audit(user, "update", "customer_debt", debt_id, {"paid": payment_amount, "via": "kasir"})
    await broadcast_event("transaction_updated", {"id": original_trx.get("id") if original_trx else debt_id, "debt_paid": True})
    return receipt_doc


# Update PO/online order statuses manually
class StatusUpdateIn(BaseModel):
    payment_status: Optional[str] = None  # paid | unpaid | partial
    delivery_status: Optional[str] = None  # arrived | pending | shipped


async def _record_purchase_expense(doc: dict, source: str, kind: str = "po"):
    """Idempotent: record expense once when payment_status=paid."""
    if doc.get("expense_recorded"):
        return
    label = doc.get("po_no") or doc.get("order_number") or doc.get("id")
    await db.expenses.insert_one({
        "id": gen_id(),
        "amount": doc.get("total", 0),
        "category": "Pembelian Bahan",
        "unit": "gudang",
        "notes": f"{kind.upper()} {label}" + (f" — {source}" if source else ""),
        "date": now_iso(),
        "created_at": now_iso(),
        "reference": kind,
        "reference_id": doc["id"],
    })
    # Journal: Debit Pembelian / Credit Kas
    await db.journal_entries.insert_one({
        "id": gen_id(),
        "date": now_iso(),
        "description": f"Pembayaran {kind.upper()} {label}",
        "lines": [
            {"account": "Pembelian Bahan", "debit": doc.get("total", 0), "credit": 0},
            {"account": "Kas", "debit": 0, "credit": doc.get("total", 0)},
        ],
        "reference": kind,
        "reference_id": doc["id"],
        "unit": "gudang",
        "created_at": now_iso(),
    })


async def _record_purchase_payment(doc: dict, amount: int, source: str, kind: str = "po", method: str = "transfer", proof_url: str = "", notes: str = "", paid_at: str = ""):
    """Record actual cash out for PO/online order payment. Supports partial payment."""
    amount = int(amount or 0)
    if amount <= 0:
        raise HTTPException(400, "Nominal pembayaran harus lebih dari 0")
    total = int(doc.get("total") or 0)
    old_paid = int(doc.get("paid_amount") or 0)
    remaining = max(0, total - old_paid)
    if remaining <= 0:
        raise HTTPException(400, "Pembelian sudah lunas")
    pay_amount = min(amount, remaining)
    label = doc.get("po_no") or doc.get("order_number") or doc.get("id")
    payment_doc = {
        "id": gen_id(), "kind": kind, "purchase_id": doc["id"], "reference_no": label,
        "amount": pay_amount, "method": method or "transfer", "payment_proof_url": proof_url or "",
        "notes": notes or "", "paid_at": paid_at or now_iso(), "created_at": now_iso(),
    }
    await db.purchase_payments.insert_one(payment_doc)
    await db.expenses.insert_one({
        "id": gen_id(), "amount": pay_amount, "category": "Pembelian Bahan", "unit": "gudang",
        "notes": f"Pembayaran {kind.upper()} {label}" + (f" — {source}" if source else "") + (f" — {notes}" if notes else ""),
        "date": payment_doc["paid_at"], "created_at": now_iso(),
        "reference": f"{kind}_payment", "reference_id": payment_doc["id"], "purchase_id": doc["id"],
    })
    await db.journal_entries.insert_one({
        "id": gen_id(), "date": payment_doc["paid_at"],
        "description": f"Pembayaran {kind.upper()} {label}",
        "lines": [
            {"account": "Pembelian Bahan", "debit": pay_amount, "credit": 0},
            {"account": payment_account(method), "debit": 0, "credit": pay_amount},
        ],
        "reference": f"{kind}_payment", "reference_id": payment_doc["id"],
        "unit": "gudang", "created_at": now_iso(),
    })
    return {k: v for k, v in payment_doc.items() if k != "_id"}


async def _record_stock_receipt(doc: dict, kind: str = "po"):
    """Idempotent: add to inventory when delivery_status=arrived.
    Returns dict with counts: {added: N, skipped: [names], items_added: [{name, qty}]}.
    """
    result = {"added": 0, "skipped": [], "items_added": []}
    if doc.get("stock_received"):
        return result
    label = doc.get("po_no") or doc.get("order_number") or doc.get("id")
    for it in doc.get("items", []):
        ref_id = it.get("item_id")
        ref_item = None
        if ref_id:
            ref_item = await db.inventory_items.find_one({"id": ref_id})
        # Fallback: try to find by name
        if not ref_item and it.get("name"):
            ref_item = await db.inventory_items.find_one({"name": it["name"]})
            if ref_item:
                # Backfill the PO's item_id so next time it matches
                ref_id = ref_item["id"]
        if not ref_item:
            result["skipped"].append(it.get("name") or "(tanpa nama)")
            continue
        update_doc = {"$inc": {"current_stock": it.get("quantity", 0)}}
        if it.get("unit_price") and kind == "po":
            update_doc["$set"] = {"cost_price": it["unit_price"]}
        await db.inventory_items.update_one({"id": ref_item["id"]}, update_doc)
        await db.stock_movements.insert_one({
            "id": gen_id(),
            "item_id": ref_item["id"],
            "type": f"{kind}_in",
            "quantity": it.get("quantity", 0),
            "reason": f"Penerimaan {kind.upper()} {label}",
            "created_at": now_iso(),
        })
        result["added"] += 1
        result["items_added"].append({"name": ref_item["name"], "qty": it.get("quantity", 0)})
    return result


@api.put("/purchase-orders/{po_id}/status")
async def update_po_status(po_id: str, body: StatusUpdateIn, user: dict = Depends(get_current_user)):
    po = await db.purchase_orders.find_one({"id": po_id})
    if not po:
        raise HTTPException(404, "PO tidak ditemukan")
    update = {}
    if body.payment_status:
        update["payment_status"] = body.payment_status
    if body.delivery_status:
        update["delivery_status"] = body.delivery_status
    if not update:
        return {"ok": True}
    await db.purchase_orders.update_one({"id": po_id}, {"$set": update})

    # Auto-integration: paid → expense, arrived → stock receipt
    po_after = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    suppliers = await db.suppliers.find_one({"id": po.get("supplier_id")})
    supplier_name = (suppliers or {}).get("name", "")
    side_effects = {}
    if body.payment_status == "paid":
        remaining = int(po_after.get("total") or 0) - int(po_after.get("paid_amount") or 0)
        if remaining > 0:
            await _record_purchase_payment(po_after, remaining, supplier_name, kind="po", method=po_after.get("payment_method") or "transfer", proof_url=po_after.get("payment_proof_url") or "", notes="Pelunasan via status")
            await db.purchase_orders.update_one({"id": po_id}, {"$set": {"paid_amount": int(po_after.get("total") or 0), "payment_status": "paid", "paid_at": now_iso()}})
            side_effects["payment"] = True
    if body.delivery_status == "arrived" and not po_after.get("stock_received"):
        await _record_stock_receipt(po_after, kind="po")
        await db.purchase_orders.update_one({"id": po_id}, {"$set": {"stock_received": True, "stock_received_at": now_iso(), "status": "received"}})
        side_effects["stock"] = True
    await write_audit(user, "update", "purchase_order", po_id, {**update, **side_effects})
    return {"ok": True, **side_effects}


@api.put("/online-orders/{oid}/status")
async def update_online_status(oid: str, body: StatusUpdateIn, user: dict = Depends(get_current_user)):
    o = await db.online_orders.find_one({"id": oid})
    if not o:
        raise HTTPException(404, "Order tidak ditemukan")
    update = {}
    if body.payment_status:
        update["payment_status"] = body.payment_status
    if body.delivery_status:
        update["delivery_status"] = body.delivery_status
    if not update:
        return {"ok": True}
    await db.online_orders.update_one({"id": oid}, {"$set": update})

    o_after = await db.online_orders.find_one({"id": oid}, {"_id": 0})
    side_effects = {}
    if body.payment_status == "paid":
        remaining = int(o_after.get("total") or 0) - int(o_after.get("paid_amount") or 0)
        if remaining > 0:
            await _record_purchase_payment(o_after, remaining, o_after.get("platform", ""), kind="online", method=o_after.get("payment_method") or "transfer", proof_url=o_after.get("payment_proof_url") or "", notes="Pelunasan via status")
            await db.online_orders.update_one({"id": oid}, {"$set": {"paid_amount": int(o_after.get("total") or 0), "payment_status": "paid", "paid_at": now_iso()}})
            side_effects["payment"] = True
    if body.delivery_status == "arrived" and not o_after.get("stock_received"):
        await _record_stock_receipt(o_after, kind="online")
        await db.online_orders.update_one({"id": oid}, {"$set": {"stock_received": True, "stock_received_at": now_iso(), "status": "received"}})
        side_effects["stock"] = True
    await write_audit(user, "update", "online_order", oid, {**update, **side_effects})
    return {"ok": True, **side_effects}


# Cancel transaction (refund inventory)
@api.delete("/transactions/{trx_id}")
async def cancel_transaction(trx_id: str, user: dict = Depends(get_current_user)):
    """Batalkan transaksi kasir secara aman.

    Perbaikan v2.5.15:
    - kasir/admin biasa boleh membatalkan dari Riwayat Kasir;
    - transaksi bon juga bisa dibatalkan;
    - transaksi manual-cancel tidak lagi dianggap aktif oleh normalisasi finance;
    - stok dikembalikan, piutang bon dibatalkan, debt payment terkait divoid.
    """
    trx = await db.transactions.find_one({"id": trx_id}, {"_id": 0})
    if not trx:
        raise HTTPException(404, "Transaksi tidak ditemukan")
    if trx.get("cancelled") and trx.get("cancel_reason") == "manual_cancel":
        raise HTTPException(400, "Sudah dibatalkan")
    if _is_debt_settlement_document(trx):
        raise HTTPException(400, "Struk pelunasan bon tidak dibatalkan sendiri. Batalkan transaksi asalnya dari Riwayat Kasir.")

    trx_no = trx.get("trx_no") or trx.get("id")
    now = now_iso()

    # Restore inventory and reverse batch consumption.
    for it in trx.get("items", []) or []:
        item_id = it.get("item_id")
        qty = float(it.get("quantity") or 0)
        if not item_id or qty == 0:
            continue
        await db.inventory_items.update_one({"id": item_id}, {"$inc": {"current_stock": qty}})
        # Jika transaksi dulu mengurangi batch, tambahkan kembali ke batch terkait.
        moves = await db.stock_movements.find({"reference_id": trx_no, "item_id": item_id}, {"_id": 0}).to_list(50)
        restored_batches = []
        for mv in moves:
            for cb in mv.get("consumed_batches") or []:
                bid = cb.get("batch_id")
                bno = cb.get("batch_no")
                qout = float(cb.get("qty_out") or 0)
                if qout <= 0:
                    continue
                q = {"$or": [{"id": bid}, {"batch_no": bno}], "item_id": item_id}
                await db.inventory_batches.update_one(q, {"$inc": {"remaining_quantity": qout}, "$set": {"updated_at": now}})
                restored_batches.append({"batch_id": bid, "batch_no": bno, "qty_in": qout})
        await db.stock_movements.insert_one({
            "id": gen_id(), "item_id": item_id, "type": "cancel_refund",
            "quantity": qty, "qty_in": qty, "qty_out": 0,
            "reason": f"Pembatalan {trx_no}",
            "reference": "transaction_cancel", "reference_id": trx_id,
            "restored_batches": restored_batches,
            "created_at": now,
        })

    await db.transactions.update_one(
        {"id": trx_id},
        {"$set": {
            "cancelled": True,
            "cancel_reason": "manual_cancel",
            "payment_status": "CANCELLED",
            "is_bon": False,
            "debt_amount": 0,
            "cash_collected": 0,
            "paid_amount": 0,
            "cancelled_at": now,
            "cancelled_by": user.get("id"),
            "cancelled_by_name": user.get("name"),
        }},
    )

    # Cancel related customer debt (bon) and void payments so summary tidak menghitungnya lagi.
    await db.customer_debts.update_many(
        {"transaction_id": trx_id},
        {"$set": {"status": "cancelled", "paid": 0, "cancelled_at": now, "cancelled_by": user.get("id")}},
    )
    await db.debt_payments.update_many(
        {"transaction_id": trx_id},
        {"$set": {"voided": True, "voided_at": now, "voided_by": user.get("id"), "void_reason": "transaction_cancelled"}},
    )

    # Revert loyalty points (best effort).
    if trx.get("member_id") and trx.get("points_earned"):
        await db.members.update_one({"id": trx["member_id"]}, {"$inc": {"points": -int(trx.get("points_earned") or 0), "total_spent": -int(trx.get("total") or 0)}})

    # Reverse journal entry. Finance summary utama memang mengecualikan manual_cancel, tapi journal tetap menyimpan audit.
    total = int(trx.get("total") or 0)
    if total > 0:
        await db.journal_entries.insert_one({
            "id": gen_id(), "date": now,
            "description": f"PEMBATALAN {trx_no}",
            "lines": [
                {"account": f"Pendapatan {trx.get('unit', 'warung').capitalize()}", "debit": total, "credit": 0},
                {"account": "Kas/Piutang", "debit": 0, "credit": total},
            ],
            "reference": "cancellation", "reference_id": trx_id, "unit": trx.get("unit"),
            "created_at": now,
        })
    invalidate_finance_summary_cache()
    await write_audit(user, "delete", "transaction", trx_id, {"trx_no": trx_no, "total": total, "reason": "manual_cancel"})
    await broadcast_event("transaction_cancelled", {"id": trx_id})
    return {"ok": True, "cancelled": True}


# Edit transaction (only certain fields, not items)
class TrxEditIn(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    notes: Optional[str] = None


@api.put("/transactions/{trx_id}")
async def edit_transaction(trx_id: str, body: TrxEditIn, user: dict = Depends(require_roles("super_admin", "manager"))):
    update = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not update:
        raise HTTPException(400, "Tidak ada perubahan")
    await db.transactions.update_one({"id": trx_id}, {"$set": update})
    await write_audit(user, "update", "transaction", trx_id, update)
    return await db.transactions.find_one({"id": trx_id}, {"_id": 0})


# Mark order items served (Warung)
@api.put("/orders/{order_id}/items-served")
async def mark_items_served(order_id: str, body: dict, user: dict = Depends(get_current_user)):
    """body: {indices: [0,1,2], served: true/false}"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order tidak ditemukan")
    items = order.get("items", [])
    indices = body.get("indices", [])
    served = body.get("served", True)
    for idx in indices:
        if 0 <= idx < len(items):
            items[idx]["served"] = served
    await db.orders.update_one({"id": order_id}, {"$set": {"items": items}})
    await broadcast_event("order_updated", {"id": order_id})
    return {"ok": True}


@api.delete("/orders/{order_id}")
async def cancel_order(order_id: str, user: dict = Depends(get_current_user)):
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "cancelled"}})
    await broadcast_event("order_updated", {"id": order_id, "status": "cancelled"})
    return {"ok": True}


@api.put("/orders/{order_id}/items")
async def update_order_items(order_id: str, body: dict, user: dict = Depends(get_current_user)):
    """body: {items: [...full new list...], quiet?: true}

    Warung/meja sering mengirim update item beruntun. `quiet=true` dipakai agar
    device yang sama tidak memicu broadcast/reload berat untuk setiap klik +/-.
    Order tetap tersimpan di database; layar lain tetap akan sinkron lewat refresh ringan.
    """
    items = body.get("items", [])
    await db.orders.update_one({"id": order_id}, {"$set": {"items": items, "updated_at": now_iso()}})
    if not body.get("quiet"):
        await broadcast_event("order_updated", {"id": order_id})
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


# ---------- Public Self-Order (QR di Meja) — no auth ----------
class PublicOrderIn(BaseModel):
    table_id: str
    items: List[OrderItemIn]
    customer_name: Optional[str] = ""
    customer_phone: Optional[str] = ""
    notes: Optional[str] = ""


@api.get("/public/menu")
async def public_menu():
    """Daftar menu siap-jual untuk halaman QR pelanggan (no auth).

    Self-order harus memakai sumber menu yang sama dengan Kasir/Warung:
    - item harga dasar > 0 tetap muncul
    - item harga dasar 0 tetapi punya varian aktif/harga > 0 tetap muncul
    - varian dikirim ke frontend agar pelanggan dapat memilih panas/es/kecil/besar
    """
    rows = await db.inventory_items.find({}, {"_id": 0}).sort("name", 1).to_list(1500)
    out = []
    for i in rows:
        category = str(i.get("category") or "Umum")
        if "bahan baku" in category.lower():
            continue
        variants = _sanitize_pos_variants(i.get("variants") or [])
        active_variants = [
            v for v in variants
            if v.get("active", True) is not False and str(v.get("name") or "").strip() and _money(v.get("sell_price") or i.get("sell_price")) > 0
        ]
        base_price = _money(i.get("sell_price"))
        if base_price <= 0 and not active_variants:
            continue
        out.append({
            "id": i.get("id"),
            "name": i.get("name"),
            "category": category,
            "sell_price": base_price,
            "image_url": i.get("image_url"),
            "has_variants": bool(i.get("has_variants") and active_variants),
            "variants": active_variants,
        })
    out.sort(key=lambda x: (str(x.get("category") or ""), str(x.get("name") or "")))
    return out


@api.get("/public/tables/{table_id}")
async def public_table_info(table_id: str):
    """Validasi meja untuk halaman QR (no auth)."""
    t = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Meja tidak ditemukan")
    profile = await db.business_profile.find_one({}, {"_id": 0}) or {}
    return {"id": t["id"], "name": t["name"], "business_name": profile.get("name", "AgriWarung")}


@api.post("/public/orders")
async def public_create_order(body: PublicOrderIn):
    """Pelanggan submit order dari halaman QR (no auth)."""
    if not body.items:
        raise HTTPException(400, "Pesanan kosong")
    # Validate table
    t = await db.tables.find_one({"id": body.table_id})
    if not t:
        raise HTTPException(404, "Meja tidak ditemukan")
    # Validate items exist, including variant price for POS/self-order.
    item_ids = [i.item_id for i in body.items]
    inv = await db.inventory_items.find({"id": {"$in": item_ids}}, {"_id": 0}).to_list(500)
    inv_by_id = {i["id"]: i for i in inv}
    validated_items = []
    for it in body.items:
        ref = inv_by_id.get(it.item_id)
        if not ref:
            raise HTTPException(400, f"Item tidak tersedia: {it.name}")
        variants = _sanitize_pos_variants(ref.get("variants") or [])
        active_variants = [v for v in variants if v.get("active", True) is not False and str(v.get("name") or "").strip()]
        chosen_variant = None
        if it.variant_id:
            chosen_variant = next((v for v in active_variants if str(v.get("id")) == str(it.variant_id)), None)
            if not chosen_variant:
                raise HTTPException(400, f"Varian tidak tersedia untuk {ref.get('name')}")
        elif ref.get("has_variants") and active_variants:
            raise HTTPException(400, f"Pilih varian untuk {ref.get('name')}")
        price = _money((chosen_variant or {}).get("sell_price") or ref.get("sell_price"))
        if price <= 0:
            raise HTTPException(400, f"Harga belum diatur untuk {ref.get('name')}")
        variant_name = (chosen_variant or {}).get("name", "")
        validated_items.append({
            "line_id": f"{it.item_id}::{(chosen_variant or {}).get('id', 'base')}",
            "item_id": it.item_id,
            "name": f"{ref.get('name')} ({variant_name})" if variant_name else ref.get("name"),
            "quantity": max(1, int(it.quantity or 1)),
            "unit_price": int(price),
            "notes": it.notes or "",
            "served": False,
            "variant_id": (chosen_variant or {}).get("id", ""),
            "variant_name": variant_name,
        })
    doc = {
        "id": gen_id(),
        "table_id": body.table_id,
        "items": validated_items,
        "notes": body.notes,
        "status": "sent",
        "source": "self_order",
        "customer_name": body.customer_name,
        "customer_phone": body.customer_phone,
        "created_at": now_iso(),
    }
    await db.orders.insert_one(doc)
    doc.pop("_id", None)
    notif = await write_notification("NEW_ORDER", f"Pesanan baru {t.get('name', '')}", f"{len(validated_items)} item masuk dari QR meja {t.get('name', body.table_id)}", ref_type="order", ref_id=doc["id"], priority="high")
    await broadcast_event("notification_created", {"id": notif.get("id"), "type": "NEW_ORDER", "ref_type": "order", "ref_id": doc["id"], "priority": "high", "source": "self_order"})
    await broadcast_event("order_created", {"id": doc["id"], "table_id": doc["table_id"], "source": "self_order"})
    return {"ok": True, "order_id": doc["id"], "table_name": t["name"], "items_count": len(validated_items)}


class PublicWaiterCallIn(BaseModel):
    table_id: str
    action: Literal["call_waiter", "request_bill", "need_help"] = "call_waiter"
    note: Optional[str] = ""


@api.post("/public/waiter-call")
async def public_waiter_call(body: PublicWaiterCallIn):
    t = await db.tables.find_one({"id": body.table_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Meja tidak ditemukan")
    action_label = {
        "call_waiter": "Panggil Pelayan",
        "request_bill": "Minta Bill",
        "need_help": "Butuh Bantuan",
    }.get(body.action, "Panggil Pelayan")
    active = await db.orders.find_one({"table_id": body.table_id, "status": {"$in": ["open", "sent", "bill_requested"]}}, {"_id": 0})
    if body.action == "request_bill" and active:
        await db.orders.update_one({"id": active["id"]}, {"$set": {"status": "bill_requested", "bill_requested_at": now_iso(), "waiter_note": body.note or ""}})
    notif = await write_notification("WAITER_CALL", f"{action_label} - {t.get('name')}", body.note or f"{t.get('name')} meminta bantuan", ref_type="table", ref_id=body.table_id, priority="high")
    await broadcast_event("notification_created", {"id": notif.get("id"), "type": "WAITER_CALL", "ref_type": "table", "ref_id": body.table_id, "priority": "high", "action": body.action})
    await broadcast_event("waiter_call", {"table_id": body.table_id, "table_name": t.get("name"), "action": body.action})
    return {"ok": True, "message": f"{action_label} dikirim", "table_name": t.get("name")}


# ---------- Expenses (manual) ----------
class ExpenseIn(BaseModel):
    amount: int
    category: str
    unit: str = "umum"
    notes: Optional[str] = ""
    date: Optional[str] = None
    payment_method: str = "cash"  # cash | transfer | qris


@api.get("/expenses")
async def list_expenses(user: dict = Depends(get_current_user)):
    return await db.expenses.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/expenses")
async def create_expense(body: ExpenseIn, user: dict = Depends(get_current_user)):
    data = body.model_dump()
    data["date"] = data.get("date") or now_iso()
    doc = await insert_doc("expenses", data)
    await db.journal_entries.insert_one({
        "id": gen_id(),
        "date": doc["date"],
        "description": f"Biaya {body.category}",
        "lines": [
            {"account": body.category, "debit": body.amount, "credit": 0},
            {"account": "Kas", "debit": 0, "credit": body.amount},
        ],
        "reference": "expense",
        "reference_id": doc["id"],
        "unit": body.unit,
        "created_at": now_iso(),
    })
    invalidate_finance_summary_cache()
    return doc


@api.put("/expenses/{eid}")
async def update_expense(eid: str, body: ExpenseIn, user: dict = Depends(require_roles("super_admin", "manager"))):
    existing = await db.expenses.find_one({"id": eid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Pengeluaran tidak ditemukan")
    ref = (existing.get("reference") or "").strip()
    if ref and ref not in ("expense", "manual", "manual_expense"):
        raise HTTPException(400, "Pengeluaran ini berasal dari modul lain. Edit/hapus dari modul asalnya agar laporan tetap sinkron.")
    if body.amount <= 0:
        raise HTTPException(400, "Jumlah harus lebih dari 0")
    data = body.model_dump()
    data["date"] = data.get("date") or existing.get("date") or now_iso()
    data["updated_at"] = now_iso()
    await db.expenses.update_one({"id": eid}, {"$set": data})
    # Ganti jurnal asli supaya Keuangan, Dashboard, dan Laporan membaca angka yang sama.
    await db.journal_entries.delete_many({"reference": "expense", "reference_id": eid})
    await db.journal_entries.insert_one({
        "id": gen_id(),
        "date": data["date"],
        "description": f"Biaya {body.category}",
        "lines": [
            {"account": body.category, "debit": body.amount, "credit": 0},
            {"account": "Kas", "debit": 0, "credit": body.amount},
        ],
        "reference": "expense",
        "reference_id": eid,
        "unit": body.unit,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    invalidate_finance_summary_cache()
    await write_audit(user, "update", "expense", eid, {"before": existing, "after": data})
    updated = await db.expenses.find_one({"id": eid}, {"_id": 0})
    return clean_doc(updated)


# ---------- Incomes (Non-POS revenue: cashback, tax refund, donation, etc.) ----------
class IncomeIn(BaseModel):
    amount: int
    category: str  # Cashback Supplier | Pengembalian Pajak | Hibah | Bunga Bank | Pemasukan Lain-lain
    unit: str = "umum"
    source: Optional[str] = ""  # free text: nama supplier / referensi
    notes: Optional[str] = ""
    date: Optional[str] = None
    payment_method: str = "cash"  # cash | transfer | qris


@api.get("/incomes")
async def list_incomes(user: dict = Depends(get_current_user)):
    return await db.incomes.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/incomes")
async def create_income(body: IncomeIn, user: dict = Depends(get_current_user)):
    if body.amount <= 0:
        raise HTTPException(400, "Jumlah harus lebih dari 0")
    data = body.model_dump()
    data["date"] = data.get("date") or now_iso()
    doc = await insert_doc("incomes", data)
    await db.journal_entries.insert_one({
        "id": gen_id(),
        "date": doc["date"],
        "description": f"Pemasukan {body.category}" + (f" - {body.source}" if body.source else ""),
        "lines": [
            {"account": "Kas", "debit": body.amount, "credit": 0},
            {"account": body.category, "debit": 0, "credit": body.amount},
        ],
        "reference": "income",
        "reference_id": doc["id"],
        "unit": body.unit,
        "created_at": now_iso(),
    })
    invalidate_finance_summary_cache()
    await write_audit(user, "create", "income", doc["id"], {"amount": body.amount, "category": body.category})
    return doc


@api.put("/incomes/{income_id}")
async def update_income(income_id: str, body: IncomeIn, user: dict = Depends(require_roles("super_admin", "manager"))):
    existing = await db.incomes.find_one({"id": income_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Pemasukan tidak ditemukan")
    ref = (existing.get("reference") or "").strip()
    if ref and ref not in ("income", "manual", "manual_income"):
        raise HTTPException(400, "Pemasukan ini berasal dari modul lain. Edit/hapus dari modul asalnya agar laporan tetap sinkron.")
    if body.amount <= 0:
        raise HTTPException(400, "Jumlah harus lebih dari 0")
    data = body.model_dump()
    data["date"] = data.get("date") or existing.get("date") or now_iso()
    data["updated_at"] = now_iso()
    await db.incomes.update_one({"id": income_id}, {"$set": data})
    await db.journal_entries.delete_many({"reference": "income", "reference_id": income_id})
    await db.journal_entries.insert_one({
        "id": gen_id(),
        "date": data["date"],
        "description": f"Pemasukan {body.category}" + (f" - {body.source}" if body.source else ""),
        "lines": [
            {"account": "Kas", "debit": body.amount, "credit": 0},
            {"account": body.category, "debit": 0, "credit": body.amount},
        ],
        "reference": "income",
        "reference_id": income_id,
        "unit": body.unit,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    invalidate_finance_summary_cache()
    await write_audit(user, "update", "income", income_id, {"before": existing, "after": data})
    updated = await db.incomes.find_one({"id": income_id}, {"_id": 0})
    return clean_doc(updated)


@api.delete("/incomes/{income_id}")
async def delete_income(income_id: str, user: dict = Depends(require_roles("super_admin", "manager"))):
    inc = await db.incomes.find_one({"id": income_id}, {"_id": 0})
    if not inc:
        raise HTTPException(404, "Pemasukan tidak ditemukan")
    ref = (inc.get("reference") or "").strip()
    if ref and ref not in ("income", "manual", "manual_income"):
        raise HTTPException(400, "Pemasukan ini berasal dari modul lain. Hapus dari modul asalnya agar laporan tetap sinkron.")
    await db.incomes.delete_one({"id": income_id})
    await db.journal_entries.delete_many({"reference": "income", "reference_id": income_id})
    # Reverse journal: Debit category / Credit Kas untuk audit kas.
    await db.journal_entries.insert_one({
        "id": gen_id(),
        "date": now_iso(),
        "description": f"Pembatalan pemasukan {inc.get('category')}",
        "lines": [
            {"account": inc.get("category"), "debit": inc.get("amount", 0), "credit": 0},
            {"account": "Kas", "debit": 0, "credit": inc.get("amount", 0)},
        ],
        "reference": "income_void",
        "reference_id": income_id,
        "unit": inc.get("unit", "umum"),
        "created_at": now_iso(),
    })
    invalidate_finance_summary_cache()
    await write_audit(user, "delete", "income", income_id, {"amount": inc.get("amount")})
    return {"ok": True}



# ---------- Financial normalization helpers ----------
def _money(v, default: int = 0) -> int:
    try:
        if v is None or v == "":
            return default
        return int(float(v))
    except Exception:
        return default


def _is_debt_settlement_document(t: dict) -> bool:
    """Dokumen/receipt pelunasan bon tidak boleh dihitung sebagai penjualan baru."""
    if not t:
        return False
    return bool(
        t.get("financial_exclude")
        or t.get("receipt_kind") == "DEBT_SETTLEMENT"
        or t.get("settled_from_debt")
        or (t.get("transaction_type") or "").upper() == "DEBT_SETTLEMENT"
    )


def _is_financial_sale_transaction(t: dict) -> bool:
    """True untuk transaksi penjualan asli yang boleh masuk pendapatan/kas.

    Legacy fix: beberapa transaksi bon lama pernah ditandai cancelled saat dibuat
    receipt pelunasan. Jika transaksi itu sudah/akan direpair sebagai transaksi asli
    bon, tetap perlakukan sebagai sale supaya Kasir, Keuangan, Dashboard, dan
    Laporan memakai baris yang sama.
    """
    if not t:
        return False
    if _is_debt_settlement_document(t):
        return False
    if (t.get("transaction_type") or "SALE").upper() != "SALE":
        return False
    if t.get("cancel_reason") in ("manual_cancel", "user_cancel", "void"):
        return False
    if t.get("cancelled") and not (t.get("legacy_bon_repaired") or t.get("cancel_reason") in ("replaced_by_payment", "replaced_by_debt_payment", "debt_settlement_legacy")):
        return False
    return True


async def _load_debt_financial_context() -> dict:
    """Load peta bon/pelunasan untuk menghitung revenue secara kanonis.

    Sumber kebenaran untuk transaksi bon:
    - transaksi asli menyimpan total belanja dan DP awal,
    - customer_debts menyimpan sisa bon awal,
    - debt_payments menyimpan cicilan/pelunasan.

    Dengan cara ini laporan tidak bergantung pada dokumen receipt pelunasan atau
    field paid_amount yang mungkin pernah tertimpa patch lama.
    """
    debts = await db.customer_debts.find({"status": {"$ne": "cancelled"}}, {"_id": 0}).to_list(5000)
    payments = await db.debt_payments.find({"voided": {"$ne": True}}, {"_id": 0}).to_list(5000)
    debt_by_trx = {}
    debt_by_id = {}
    payments_by_trx = {}
    payments_by_debt = {}
    for d in debts:
        debt_by_id[d.get("id")] = d
        if d.get("transaction_id"):
            debt_by_trx[d.get("transaction_id")] = d
    for p in payments:
        if p.get("transaction_id"):
            payments_by_trx.setdefault(p.get("transaction_id"), []).append(p)
        if p.get("debt_id"):
            payments_by_debt.setdefault(p.get("debt_id"), []).append(p)
    return {
        "debt_by_trx": debt_by_trx,
        "debt_by_id": debt_by_id,
        "payments_by_trx": payments_by_trx,
        "payments_by_debt": payments_by_debt,
    }


def _initial_paid_for_transaction(t: dict, debt: Optional[dict] = None) -> int:
    total = _money(t.get("total"))
    if debt:
        if debt.get("initial_paid") is not None:
            return max(0, min(total, _money(debt.get("initial_paid"))))
        original_total = _money(debt.get("original_total") or total)
        # Schema baru: amount = sisa bon awal. Maka initial paid = total belanja - sisa bon.
        if original_total > 0 and debt.get("amount") is not None:
            return max(0, min(original_total, original_total - _money(debt.get("amount"))))
    pm = (t.get("payment_method") or "cash").lower()
    if pm == "cash":
        return max(0, min(total, _money(t.get("cash_received")))) if total else max(0, _money(t.get("cash_received")))
    paid = t.get("paid_amount")
    if paid is not None:
        return max(0, min(total, _money(paid))) if total else max(0, _money(paid))
    return total


def _canonical_cash_collected(t: dict, debt_ctx: Optional[dict] = None) -> int:
    """Cash-basis amount yang benar-benar sudah diterima untuk transaksi asli."""
    if not _is_financial_sale_transaction(t):
        return 0
    total = _money(t.get("total"))
    debt_ctx = debt_ctx or {}
    debt = (debt_ctx.get("debt_by_trx") or {}).get(t.get("id"))
    if debt and debt.get("original_total") is not None:
        total = max(total, _money(debt.get("original_total")))
    if total <= 0:
        return 0
    if debt:
        initial_paid = _initial_paid_for_transaction({**t, "total": total}, debt)
        payments_by_trx = debt_ctx.get("payments_by_trx") or {}
        payments_by_debt = debt_ctx.get("payments_by_debt") or {}
        payment_sum = sum(_money(p.get("amount")) for p in payments_by_trx.get(t.get("id"), []))
        if not payment_sum:
            payment_sum = sum(_money(p.get("amount")) for p in payments_by_debt.get(debt.get("id"), []))
        paid_on_debt = _money(debt.get("paid"))
        collected = max(initial_paid + payment_sum, initial_paid + paid_on_debt)
        # Jika bon sudah berstatus lunas, transaksi asli harus dianggap terkumpul penuh.
        if debt.get("status") == "paid":
            collected = max(collected, total)
        return max(0, min(total, collected))
    paid = t.get("paid_amount")
    if paid is not None:
        return max(0, min(total, _money(paid)))
    pm = (t.get("payment_method") or "cash").lower()
    if pm == "cash":
        return max(0, min(total, _money(t.get("cash_received"))))
    return total


def _transaction_cash_collected(t: dict) -> int:
    """Fallback sinkron untuk kode lama. Untuk laporan baru pakai _canonical_cash_collected + debt_ctx."""
    return _canonical_cash_collected(t, None)


def _enrich_transaction_financial_fields(t: dict, debt_ctx: Optional[dict] = None) -> dict:
    row = dict(t or {})
    if not _is_financial_sale_transaction(row):
        return row
    total = _money(row.get("total"))
    debt_ctx = debt_ctx or {}
    debt = (debt_ctx.get("debt_by_trx") or {}).get(row.get("id"))
    if debt and debt.get("original_total") is not None:
        total = max(total, _money(debt.get("original_total")))
    collected = _canonical_cash_collected({**row, "total": total}, debt_ctx)
    remaining = max(0, total - collected)
    if row.get("cancel_reason") in ("manual_cancel", "user_cancel", "void"):
        return {**row, "cancelled": True, "payment_status": "CANCELLED", "is_bon": False, "debt_amount": 0, "paid_amount": 0, "cash_collected": 0}
    if row.get("cancel_reason") in ("replaced_by_payment", "replaced_by_debt_payment", "debt_settlement_legacy") or row.get("legacy_bon_repaired"):
        row["cancelled"] = False
        row.pop("cancel_reason", None)
    row["total"] = total
    row["transaction_total"] = total
    row["paid_amount"] = collected
    row["cash_collected"] = collected
    row["debt_amount"] = remaining
    row["payment_status"] = "PAID" if remaining == 0 else ("PARTIAL" if collected > 0 else "DEBT")
    row["is_bon"] = remaining > 0
    if debt:
        row["debt_id"] = debt.get("id")
        row["debt_initial_amount"] = _money(debt.get("amount"))
        row["initial_paid"] = _initial_paid_for_transaction(row, debt)
        row["debt_payments_total"] = max(0, collected - row.get("initial_paid", 0))
    return row


async def _repair_cancelled_transaction_finance_leaks() -> int:
    """Pastikan transaksi yang dibatalkan tidak menyisakan piutang/pelunasan di Keuangan.

    Ini memperbaiki data dari patch sebelumnya: transaksi sudah CANCELLED di Kasir,
    tetapi customer_debts/debt_payments lama masih aktif sehingga Dashboard,
    Keuangan, dan Laporan tetap membaca piutang bon.
    """
    fixed = 0
    q = {"$or": [
        {"cancel_reason": {"$in": ["manual_cancel", "user_cancel", "void"]}},
        {"payment_status": "CANCELLED"},
    ]}
    async for t in db.transactions.find(q, {"_id": 0, "id": 1, "trx_no": 1}):
        trx_id = t.get("id")
        trx_no = t.get("trx_no")
        ors = []
        if trx_id:
            ors += [{"transaction_id": trx_id}, {"original_transaction_id": trx_id}, {"trx_id": trx_id}]
        if trx_no:
            ors += [{"original_trx_no": trx_no}, {"trx_no": trx_no}]
        if not ors:
            continue
        debt_res = await db.customer_debts.update_many(
            {"$or": ors, "status": {"$nin": ["cancelled", "void", "deleted"]}},
            {"$set": {"status": "cancelled", "paid": 0, "remaining": 0, "payment_due": 0, "cancel_reason": "linked_transaction_cancelled", "cancelled_at": now_iso()}},
        )
        pay_res = await db.debt_payments.update_many(
            {"$or": ors, "voided": {"$ne": True}},
            {"$set": {"voided": True, "void_reason": "linked_transaction_cancelled", "voided_at": now_iso()}},
        )
        fixed += int(getattr(debt_res, "modified_count", 0) or 0) + int(getattr(pay_res, "modified_count", 0) or 0)
    if fixed:
        invalidate_finance_summary_cache()
    return fixed


async def _repair_legacy_bon_settlement_transactions() -> int:
    """Perbaiki data bon dari patch lama.

    Patch awal sempat membatalkan transaksi Rp21.000 dan membuat transaksi baru
    Rp11.000 untuk pelunasan. Fungsi ini mengembalikan transaksi asli sebagai
    sumber riwayat/pendapatan, menandai transaksi Rp11.000 sebagai receipt-only,
    dan membuat debt_payments agar laporan konsisten.
    """
    repaired = 0
    debts = await db.customer_debts.find({"transaction_id": {"$exists": True}}, {"_id": 0}).to_list(5000)
    for debt in debts:
        if str(debt.get("status") or "").lower() in ("cancelled", "void", "deleted"):
            continue
        debt_id = debt.get("id")
        original_id = debt.get("transaction_id")
        if not original_id:
            continue
        original = await db.transactions.find_one({"id": original_id})
        if not original:
            continue
        if original.get("cancel_reason") in ("manual_cancel", "user_cancel", "void") or original.get("payment_status") == "CANCELLED":
            continue

        settlement_docs = []
        if debt.get("settled_trx_id"):
            st = await db.transactions.find_one({"id": debt.get("settled_trx_id")})
            if st:
                settlement_docs.append(st)
        more = await db.transactions.find({
            "$or": [
                {"settled_from_debt": debt_id},
                {"receipt_kind": "DEBT_SETTLEMENT", "settled_from_debt": debt_id},
            ]
        }).to_list(50)
        for st in more:
            if st and all(st.get("id") != x.get("id") for x in settlement_docs):
                settlement_docs.append(st)

        original_total = max(_money(debt.get("original_total")), _money(original.get("total")), _money(original.get("subtotal")))
        if original_total <= 0:
            continue
        initial_paid = _money(debt.get("initial_paid"), None)
        if initial_paid is None:
            initial_paid = max(0, original_total - _money(debt.get("amount")))
        initial_paid = max(0, min(original_total, initial_paid))

        # Pastikan setiap settlement legacy punya debt_payment record.
        payment_sum = 0
        for st in settlement_docs:
            amount = _money(st.get("payment_amount") or st.get("total") or st.get("cash_received"))
            if amount <= 0:
                continue
            payment_sum += amount
            exists = await db.debt_payments.find_one({"legacy_transaction_id": st.get("id")})
            if not exists:
                await db.debt_payments.insert_one({
                    "id": gen_id(),
                    "debt_id": debt_id,
                    "transaction_id": original_id,
                    "legacy_transaction_id": st.get("id"),
                    "customer_name": debt.get("customer_name", "Pelanggan"),
                    "amount": amount,
                    "cash_received": _money(st.get("cash_received"), amount),
                    "change": _money(st.get("change"), 0),
                    "payment_method": st.get("payment_method", debt.get("settlement_method", "cash")),
                    "created_at": st.get("created_at") or debt.get("last_paid_at") or now_iso(),
                    "cashier_id": st.get("cashier_id"),
                    "cashier_name": st.get("cashier_name"),
                    "migration_note": "created from legacy settlement transaction",
                })

            await db.transactions.update_one(
                {"id": st.get("id")},
                {"$set": {
                    "financial_exclude": True,
                    "receipt_kind": "DEBT_SETTLEMENT",
                    "transaction_type": "DEBT_SETTLEMENT",
                    "settled_from_debt": debt_id,
                    "settled_from_trx": original_id,
                    "migration_note": "Excluded from revenue/history; original transaction holds sale.",
                }},
            )

        payments = await db.debt_payments.find({"$or": [{"transaction_id": original_id}, {"debt_id": debt_id}]}, {"_id": 0}).to_list(100)
        payment_sum = max(payment_sum, sum(_money(p.get("amount")) for p in payments))
        paid_on_debt = max(_money(debt.get("paid")), payment_sum)
        if debt.get("status") == "paid":
            new_paid = original_total
            new_debt = 0
        else:
            new_paid = min(original_total, initial_paid + paid_on_debt)
            new_debt = max(0, original_total - new_paid)

        await db.transactions.update_one(
            {"id": original_id},
            {
                "$set": {
                    "cancelled": False,
                    "total": original_total,
                    "subtotal": max(_money(original.get("subtotal")), original_total),
                    "paid_amount": new_paid,
                    "debt_amount": new_debt,
                    "payment_status": "PAID" if new_debt == 0 else ("PARTIAL" if new_paid > 0 else "DEBT"),
                    "is_bon": new_debt > 0,
                    "initial_paid": initial_paid,
                    "legacy_bon_repaired": True,
                    "settled_at": now_iso() if new_debt == 0 else original.get("settled_at"),
                },
                "$unset": {"cancelled_at": "", "cancelled_by": "", "cancel_reason": "", "replaced_by": ""},
            },
        )
        repaired += 1
    return repaired


def _compute_debt_payment_state(debt: dict, original_trx: Optional[dict] = None) -> dict:
    """Normalisasi state bon untuk pelunasan baru."""
    amount = _money(debt.get("amount"))
    paid_on_debt = _money(debt.get("paid"))
    original_total = _money(debt.get("original_total") or (original_trx or {}).get("total") or amount)
    remaining_before = max(0, amount - paid_on_debt)
    initial_paid = _money(debt.get("initial_paid"), None)
    if initial_paid is None:
        initial_paid = max(0, original_total - amount)
    trx_paid = _money((original_trx or {}).get("paid_amount"), initial_paid)
    previous_paid = max(trx_paid, initial_paid + paid_on_debt)
    return {
        "amount": amount,
        "paid_on_debt": paid_on_debt,
        "original_total": original_total,
        "remaining_before": remaining_before,
        "previous_paid": previous_paid,
        "initial_paid": initial_paid,
    }


# Cache singkat untuk ringkasan finance.
# Tujuannya: Dashboard, Keuangan, dan Laporan sering dibuka berurutan; tanpa cache backend
# menghitung ulang seluruh transaksi beberapa kali sehingga terasa lambat di HuggingFace free.
FINANCE_CACHE_TTL_SECONDS = int(os.environ.get("FINANCE_CACHE_TTL_SECONDS", "120"))
_finance_summary_cache = {"expires_at": None, "summary": None}
_finance_summary_lock = asyncio.Lock()
_finance_repair_done = False
FINANCE_MAX_DOCS = int(os.environ.get("FINANCE_MAX_DOCS", "3000"))


def _slice_finance_summary(summary: dict, limit: int = 1000) -> dict:
    safe_limit = max(1, min(_money(limit, 1000), 5000))
    sliced = dict(summary or {})
    for key in ("cashier_ledger", "pos_transactions", "incomes", "expenses", "debts"):
        val = sliced.get(key)
        if isinstance(val, list):
            sliced[key] = val[:safe_limit]
    if isinstance(sliced.get("recent_transactions"), list):
        sliced["recent_transactions"] = sliced["recent_transactions"][:10]
    sliced["cache"] = {
        "enabled": True,
        "ttl_seconds": FINANCE_CACHE_TTL_SECONDS,
        "generated_at": sliced.get("generated_at"),
    }
    return sliced


def invalidate_finance_summary_cache():
    _finance_summary_cache["expires_at"] = None
    _finance_summary_cache["summary"] = None


async def _build_unified_finance_summary(limit: int = 1000, force_refresh: bool = False) -> dict:
    now_ts = datetime.now(timezone.utc)
    cached = _finance_summary_cache.get("summary")
    expires_at = _finance_summary_cache.get("expires_at")
    if not force_refresh and cached and expires_at and expires_at > now_ts:
        return _slice_finance_summary(cached, limit)

    async with _finance_summary_lock:
        cached = _finance_summary_cache.get("summary")
        expires_at = _finance_summary_cache.get("expires_at")
        now_ts = datetime.now(timezone.utc)
        if not force_refresh and cached and expires_at and expires_at > now_ts:
            return _slice_finance_summary(cached, limit)

        # Hitung sekali dengan limit terbesar, lalu endpoint lain cukup slicing.
        summary = await _build_unified_finance_summary_uncached(limit=5000)
        _finance_summary_cache["summary"] = summary
        _finance_summary_cache["expires_at"] = now_ts + timedelta(seconds=FINANCE_CACHE_TTL_SECONDS)
        return _slice_finance_summary(summary, limit)


async def _build_unified_finance_summary_uncached(limit: int = 1000) -> dict:
    """Satu sumber kebenaran untuk Kasir, Keuangan, Dashboard, dan Laporan.

    Prinsip:
    - transaksi asli menyimpan nilai struk dan item;
    - pembayaran bon hanya menambah cash_collected transaksi asli;
    - dokumen/receipt pelunasan bon tidak dihitung sebagai penjualan baru;
    - halaman frontend tidak menghitung ulang rumus sendiri.
    """
    global _finance_repair_done
    if not _finance_repair_done:
        try:
            await _repair_cancelled_transaction_finance_leaks()
            await _repair_legacy_bon_settlement_transactions()
        except Exception:
            # Repair tidak boleh membuat halaman crash. Data tetap diringkas best-effort.
            pass
        _finance_repair_done = True

    max_docs = max(500, min(FINANCE_MAX_DOCS, 10000))
    debt_ctx = await _load_debt_financial_context()
    raw_transactions = await db.transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(max_docs)
    expenses = await db.expenses.find({}, {"_id": 0}).sort("date", -1).to_list(max_docs)
    incomes = await db.incomes.find({}, {"_id": 0}).sort("date", -1).to_list(max_docs)
    capital = await db.capital_injections.find({}, {"_id": 0}).to_list(max_docs)
    debts_raw = await db.customer_debts.find({}, {"_id": 0}).sort("created_at", -1).to_list(max_docs)
    inventory = await db.inventory_items.find({}, {"_id": 0}).to_list(max_docs)

    inv_items = {i.get("id"): i for i in inventory}

    def _item_cost_total(t: dict) -> int:
        if _money(t.get("cost_total")):
            return _money(t.get("cost_total"))
        total_cost = 0
        for it in t.get("items") or []:
            inv = inv_items.get(it.get("item_id")) or {}
            qty = _money(it.get("quantity"))
            total_cost += qty * _money(inv.get("cost_price"))
        return int(total_cost)

    ledger = []
    revenue_by_unit = {}
    revenue_by_method = {"cash": 0, "bank": 0, "ewallet": 0}
    sales_value_by_unit = {}
    total_cogs = 0

    for t in raw_transactions:
        try:
            row = _enrich_transaction_financial_fields(t, debt_ctx)
            if not _is_financial_sale_transaction(row):
                continue
            transaction_total = _money(row.get("transaction_total") or row.get("total"))
            cash_collected = _canonical_cash_collected(row, debt_ctx)
            if transaction_total <= 0 and cash_collected <= 0:
                continue
            open_receivable = max(0, transaction_total - cash_collected)
            cogs = _item_cost_total(row)
            total_cogs += cogs
            unit = row.get("unit") or "warung"
            method = _normalize_pm(row.get("payment_method"))
            revenue_by_unit[unit] = revenue_by_unit.get(unit, 0) + cash_collected
            sales_value_by_unit[unit] = sales_value_by_unit.get(unit, 0) + transaction_total
            revenue_by_method[method] = revenue_by_method.get(method, 0) + cash_collected
            initial_paid = _money(row.get("initial_paid"))
            debt_payments_total = _money(row.get("debt_payments_total"))
            ledger.append({
                **row,
                "total": transaction_total,
                "transaction_total": transaction_total,
                "cash_collected": cash_collected,
                "paid_amount": cash_collected,
                "open_receivable": open_receivable,
                "debt_amount": open_receivable,
                "initial_paid": initial_paid,
                "debt_payments_total": debt_payments_total,
                "cost_total": cogs,
                "ledger_label": "Lunas" if open_receivable == 0 else ("Bon Sebagian" if cash_collected > 0 else "Bon"),
                "finance_note": f"Nilai struk {format_rp_short(transaction_total)}; uang masuk {format_rp_short(cash_collected)}; sisa bon {format_rp_short(open_receivable)}",
            })
        except Exception as e:
            # Satu transaksi rusak tidak boleh membuat halaman Keuangan blank.
            continue

    other_income_by_category = {}
    for inc in incomes:
        cat = inc.get("category") or "Pemasukan Lain-lain"
        other_income_by_category[cat] = other_income_by_category.get(cat, 0) + _money(inc.get("amount"))

    expense_by_category = {}
    for exp in expenses:
        cat = exp.get("category") or "Lain-lain"
        expense_by_category[cat] = expense_by_category.get(cat, 0) + _money(exp.get("amount"))

    total_pos_income = sum(_money(x.get("cash_collected")) for x in ledger)
    total_pos_sales_value = sum(_money(x.get("transaction_total")) for x in ledger)
    total_other_income = sum(other_income_by_category.values())
    total_expense = sum(expense_by_category.values())
    total_capital = sum(_money(c.get("amount")) for c in capital)
    cancelled_trx_ids = {t.get("id") for t in raw_transactions if t.get("cancel_reason") in ("manual_cancel", "user_cancel", "void") or t.get("payment_status") == "CANCELLED"}
    def _active_debt(d: dict) -> bool:
        status = str(d.get("status") or "").lower()
        if status in ("paid", "cancelled", "void", "deleted"):
            return False
        if d.get("transaction_id") in cancelled_trx_ids:
            return False
        return True
    total_debt = sum(max(0, _money(d.get("amount")) - _money(d.get("paid"))) for d in debts_raw if _active_debt(d))

    total_revenue = total_pos_income + total_other_income
    gross_profit = total_revenue - total_cogs
    net_profit = gross_profit - total_expense

    # Cash balance per metode. Pelunasan bon disajikan di transaksi asli; metode mengikuti transaksi asli
    # agar konsisten dan ringan. Jika nanti perlu detail rekening, debt_payments bisa diperinci lagi.
    methods = ["cash", "bank", "ewallet"]
    by_method = {m: {"balance": 0, "inflow": 0, "outflow": 0, "in_count": 0, "out_count": 0} for m in methods}
    for row in ledger:
        m = _normalize_pm(row.get("payment_method"))
        amt = _money(row.get("cash_collected"))
        if amt > 0:
            by_method[m]["balance"] += amt
            by_method[m]["inflow"] += amt
            by_method[m]["in_count"] += 1
    for inc in incomes:
        m = _normalize_pm(inc.get("payment_method"))
        amt = _money(inc.get("amount"))
        by_method[m]["balance"] += amt
        by_method[m]["inflow"] += amt
        by_method[m]["in_count"] += 1
    for cap in capital:
        m = _normalize_pm(cap.get("payment_method"))
        amt = _money(cap.get("amount"))
        by_method[m]["balance"] += amt
        by_method[m]["inflow"] += amt
        by_method[m]["in_count"] += 1
    for exp in expenses:
        m = _normalize_pm(exp.get("payment_method"))
        amt = _money(exp.get("amount"))
        by_method[m]["balance"] -= amt
        by_method[m]["outflow"] += amt
        by_method[m]["out_count"] += 1

    today = datetime.now(timezone.utc).date().isoformat()
    today_rows = [r for r in ledger if str(r.get("created_at", "")).startswith(today)]
    today_exp = [e for e in expenses if str(e.get("date") or e.get("created_at") or "").startswith(today)]
    today_inc = [i for i in incomes if str(i.get("date") or i.get("created_at") or "").startswith(today)]
    today_cogs = sum(_money(r.get("cost_total")) for r in today_rows)

    weekly = []
    for delta in range(6, -1, -1):
        day = (datetime.now(timezone.utc) - timedelta(days=delta)).date().isoformat()
        rev = sum(_money(r.get("cash_collected")) for r in ledger if str(r.get("created_at", "")).startswith(day))
        exp = sum(_money(e.get("amount")) for e in expenses if str(e.get("date") or e.get("created_at") or "").startswith(day))
        weekly.append({"day": day[5:], "revenue": rev, "expense": exp})

    inventory_value = sum(_money(i.get("current_stock")) * _money(i.get("cost_price")) for i in inventory)
    cash_position = total_capital + total_pos_income + total_other_income - total_expense
    retained = total_revenue - total_expense

    safe_limit = max(1, min(_money(limit, 1000), 5000))
    normalized_debts = [_normalize_debt_for_response(d) for d in debts_raw if _active_debt(d)]

    return {
        "ok": True,
        "generated_at": now_iso(),
        "totals": {
            "pos_income": total_pos_income,
            "pos_sales_value": total_pos_sales_value,
            "other_income": total_other_income,
            "revenue": total_revenue,
            "cogs": total_cogs,
            "gross_profit": gross_profit,
            "expense": total_expense,
            "net_profit": net_profit,
            "debt": total_debt,
            "capital": total_capital,
            "cash_position": cash_position,
            "inventory_value": int(inventory_value),
        },
        "today": {
            "revenue": sum(_money(r.get("cash_collected")) for r in today_rows) + sum(_money(i.get("amount")) for i in today_inc),
            "revenue_pos": sum(_money(r.get("cash_collected")) for r in today_rows),
            "other_income": sum(_money(i.get("amount")) for i in today_inc),
            "expense": sum(_money(e.get("amount")) for e in today_exp),
            "cogs": today_cogs,
            "net_profit": sum(_money(r.get("cash_collected")) for r in today_rows) + sum(_money(i.get("amount")) for i in today_inc) - today_cogs - sum(_money(e.get("amount")) for e in today_exp),
            "cash_position": cash_position,
            "tx_count": len(today_rows),
        },
        "profit_loss": {
            "revenue_by_unit": revenue_by_unit,
            "sales_value_by_unit": sales_value_by_unit,
            "other_income_by_category": other_income_by_category,
            "total_other_income": total_other_income,
            "total_revenue": total_revenue,
            "cogs": total_cogs,
            "gross_profit": gross_profit,
            "expense_by_category": expense_by_category,
            "total_expense": total_expense,
            "net_profit": net_profit,
            "gross_profit_margin": round((gross_profit / total_revenue * 100), 2) if total_revenue else 0,
            "net_profit_margin": round((net_profit / total_revenue * 100), 2) if total_revenue else 0,
        },
        "balance_sheet": {
            "assets": {
                "Kas": cash_position,
                "Piutang Bon Pelanggan": total_debt,
                "Persediaan": int(inventory_value),
                "total": cash_position + total_debt + int(inventory_value),
            },
            "liabilities": {"Hutang Usaha": 0, "total": 0},
            "equity": {"Modal Disetor": total_capital, "Laba Ditahan": retained, "total": total_capital + retained},
        },
        "cash_flow": {
            "operating": {"in": total_pos_income + total_other_income, "out": total_expense, "net": total_pos_income + total_other_income - total_expense},
            "investing": {"in": 0, "out": 0, "net": 0},
            "financing": {"in": total_capital, "out": 0, "net": total_capital},
            "net_cash_flow": total_pos_income + total_other_income - total_expense + total_capital,
        },
        "cash_balance": {
            "by_method": by_method,
            "total_balance": sum(v["balance"] for v in by_method.values()),
            "total_inflow": sum(v["inflow"] for v in by_method.values()),
            "total_outflow": sum(v["outflow"] for v in by_method.values()),
        },
        "by_unit": revenue_by_unit,
        "by_method": revenue_by_method,
        "weekly_trend": weekly,
        "cashier_ledger": ledger[:safe_limit],
        "pos_transactions": ledger[:safe_limit],
        "recent_transactions": ledger[:10],
        "incomes": incomes[:safe_limit],
        "expenses": expenses[:safe_limit],
        "debts": normalized_debts[:safe_limit],
    }


@api.get("/finance/system-summary")
async def finance_system_summary(user: dict = Depends(get_current_user), limit: int = 1000, refresh: bool = False):
    return await _build_unified_finance_summary(limit=limit, force_refresh=refresh)


@api.post("/finance/refresh-summary")
async def finance_refresh_summary(user: dict = Depends(get_current_user)):
    invalidate_finance_summary_cache()
    return {"ok": True, "message": "Ringkasan keuangan akan dihitung ulang pada request berikutnya."}

# ---------- Reports ----------


@api.get("/reports/sales-analytics")
async def sales_analytics(user: dict = Depends(get_current_user)):
    rows = await db.transactions.find({"cancelled": {"$ne": True}, "transaction_type": "SALE"}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    def bucket(dt, fmt):
        try: return datetime.fromisoformat(str(dt).replace('Z','+00:00')).strftime(fmt)
        except Exception: return "Tanpa tanggal"
    weekly, monthly, yearly = {}, {}, {}
    for r in rows:
        paid = int(r.get("cash_collected") or r.get("paid_amount") or (0 if r.get("is_bon") else r.get("total") or 0))
        for target, fmt in [(weekly, "%G-W%V"), (monthly, "%Y-%m"), (yearly, "%Y")]:
            key = bucket(r.get("created_at"), fmt)
            target.setdefault(key, {"revenue": 0, "count": 0})
            target[key]["revenue"] += paid
            target[key]["count"] += 1
    return {"weekly": weekly, "monthly": monthly, "yearly": yearly}

@api.get("/reports/profit-loss")
async def profit_loss(user: dict = Depends(get_current_user)):
    summary = await _build_unified_finance_summary(limit=5000)
    return summary["profit_loss"]


@api.get("/reports/balance-sheet")
async def balance_sheet(user: dict = Depends(get_current_user)):
    summary = await _build_unified_finance_summary(limit=5000)
    return summary["balance_sheet"]


@api.get("/reports/cash-flow")
async def cash_flow(user: dict = Depends(get_current_user)):
    summary = await _build_unified_finance_summary(limit=5000)
    return summary["cash_flow"]


def _normalize_pm(pm: str) -> str:
    """Normalize payment method to one of: cash, bank, ewallet"""
    if not pm:
        return "cash"
    p = pm.lower().strip()
    if p in ("cash", "tunai", "bon_paid"):
        return "cash"
    if p in ("transfer", "bank", "bca", "mandiri", "bni", "bri", "debit"):
        return "bank"
    if p in ("qris", "qr", "gopay", "ovo", "dana", "shopeepay", "ewallet", "e-wallet"):
        return "ewallet"
    return "cash"


@api.get("/reports/cash-balance")
async def cash_balance(user: dict = Depends(get_current_user)):
    summary = await _build_unified_finance_summary(limit=5000)
    return summary["cash_balance"]


@api.get("/finance/summary")
async def finance_summary(user: dict = Depends(get_current_user), limit: int = 1000):
    # Backward-compatible alias. Frontend Keuangan memakai endpoint ini sebagai sumber kebenaran.
    summary = await _build_unified_finance_summary(limit=limit)
    return {
        **summary,
        "total_pos_income": summary["totals"]["pos_income"],
        "total_pos_sales_value": summary["totals"]["pos_sales_value"],
        "total_other_income": summary["totals"]["other_income"],
        "total_expense": summary["totals"]["expense"],
        "total_debt": summary["totals"]["debt"],
        "net_cash": summary["totals"]["pos_income"] + summary["totals"]["other_income"] - summary["totals"]["expense"],
    }

@api.get("/dashboard/summary")
async def dashboard_summary(user: dict = Depends(get_current_user)):
    summary = await _build_unified_finance_summary(limit=500)
    inv = await db.inventory_items.find({}, {"_id": 0}).to_list(2000)
    low = [i for i in inv if _money(i.get("current_stock")) <= _money(i.get("min_stock")) and _money(i.get("min_stock")) > 0]
    return {
        "today": summary["today"],
        "revenue_by_unit": summary["by_unit"],
        "weekly_trend": summary["weekly_trend"],
        "low_stock": low,
        "recent_transactions": summary["recent_transactions"],
    }


# ---------- Sample Data Seed ----------
@api.post("/seed/sample-data")
async def seed_sample(user: dict = Depends(require_roles("super_admin"))):
    if os.environ.get("ALLOW_SAMPLE_SEED", "false").lower() != "true":
        raise HTTPException(403, "Fitur muat data contoh dimatikan agar data asli tidak terhapus.")
    # Wipe (except users)
    for coll in ["investors", "capital_injections", "land_rental", "inventory_items", "bom_recipes",
                 "tables", "orders", "transactions", "customer_debts", "expenses",
                 "journal_entries", "stock_movements", "dividends"]:
        await db[coll].delete_many({})

    # Investors
    inv_names = [
        ("Pak Didik", "081234567001", True),
        ("Bu Sri", "081234567002", False),
        ("Pak Budi", "081234567003", False),
        ("Pak Hartono", "081234567004", False),
    ]
    investor_ids = []
    for n, ph, land in inv_names:
        d = await insert_doc("investors", {"name": n, "phone": ph, "address": "Boyolali", "owns_land": land})
        investor_ids.append(d["id"])

    # Capital injections
    amounts = [100_000_000, 75_000_000, 50_000_000, 50_000_000]
    for iid, amt in zip(investor_ids, amounts):
        await insert_doc("capital_injections", {
            "investor_id": iid, "amount": amt, "unit": "umum",
            "notes": "Modal awal", "date": now_iso(),
        })

    # Land rental
    await insert_doc("land_rental", {
        "investor_id": investor_ids[0], "monthly_amount": 2_500_000,
        "start_date": now_iso(), "notes": "Lahan kebun anggur 2 hektar",
    })

    # Inventory
    items_seed = [
        # Bahan baku warung
        ("Beras", "Bahan Baku Warung", "kg", 50, 10, 12000, 0, "warung"),
        ("Ayam Potong", "Bahan Baku Warung", "kg", 15, 5, 35000, 0, "warung"),
        ("Telur", "Bahan Baku Warung", "kg", 8, 3, 28000, 0, "warung"),
        ("Gula Pasir", "Bahan Baku Warung", "kg", 12, 5, 14000, 0, "warung"),
        ("Teh Celup", "Bahan Baku Warung", "pcs", 200, 50, 500, 0, "warung"),
        ("Es Batu", "Bahan Baku Warung", "kg", 20, 5, 2000, 0, "warung"),
        # Menu (finished)
        ("Nasi Goreng Spesial", "Barang Jadi", "porsi", 999, 0, 0, 18000, "warung"),
        ("Ayam Bakar", "Barang Jadi", "porsi", 999, 0, 0, 25000, "warung"),
        ("Es Teh Manis", "Barang Jadi", "gelas", 999, 0, 0, 5000, "warung"),
        ("Es Teh Jumbo", "Barang Jadi", "gelas", 999, 0, 0, 8000, "warung"),
        # Pupuk
        ("Bahan A Pupuk", "Bahan Baku Pupuk", "kg", 30, 10, 8000, 0, "pupuk"),
        ("Bahan B Pupuk", "Bahan Baku Pupuk", "kg", 25, 10, 12000, 0, "pupuk"),
        # Anggur
        ("Bibit Anggur Ninel", "Bibit Anggur", "btg", 80, 20, 25000, 50000, "anggur"),
        ("Anggur Hijau Kualitas A", "Buah Anggur", "kg", 25, 5, 0, 75000, "anggur"),
    ]
    item_ids = {}
    for name, cat, unit, stock, mn, cp, sp, bu in items_seed:
        d = await insert_doc("inventory_items", {
            "name": name, "category": cat, "unit": unit,
            "current_stock": stock, "min_stock": mn,
            "cost_price": cp, "sell_price": sp, "business_unit": bu,
        })
        item_ids[name] = d["id"]

    # BOM for menu items
    boms_seed = [
        ("Nasi Goreng Spesial", "menu", [("Beras", 0.15), ("Telur", 0.1), ("Ayam Potong", 0.1)]),
        ("Ayam Bakar", "menu", [("Ayam Potong", 0.25), ("Beras", 0.15)]),
        ("Es Teh Manis", "menu", [("Teh Celup", 1), ("Gula Pasir", 0.03), ("Es Batu", 0.1)]),
        ("Es Teh Jumbo", "menu", [("Teh Celup", 1), ("Gula Pasir", 0.05), ("Es Batu", 0.2)]),
    ]
    for output_name, btype, ings in boms_seed:
        await insert_doc("bom_recipes", {
            "output_item_id": item_ids[output_name],
            "name": output_name,
            "type": btype,
            "ingredients": [{"item_id": item_ids[n], "quantity": q} for n, q in ings],
        })

    # Tables
    for i in range(1, 7):
        await insert_doc("tables", {"name": f"Meja {i}"})
    await insert_doc("tables", {"name": "Meja VIP"})
    await insert_doc("tables", {"name": "Takeaway"})

    # Some sample transactions
    nasi = item_ids["Nasi Goreng Spesial"]
    teh = item_ids["Es Teh Manis"]
    for d in range(7):
        date_iso = (datetime.now(timezone.utc) - timedelta(days=d)).isoformat()
        for _ in range(3 + d % 4):
            await db.transactions.insert_one({
                "id": gen_id(),
                "trx_no": f"TRX-DEMO-{gen_id()[:6].upper()}",
                "items": [
                    {"item_id": nasi, "name": "Nasi Goreng Spesial", "quantity": 1, "unit_price": 18000, "notes": ""},
                    {"item_id": teh, "name": "Es Teh Manis", "quantity": 1, "unit_price": 5000, "notes": ""},
                ],
                "subtotal": 23000, "discount": 0, "total": 23000,
                "payment_method": "cash", "cash_received": 25000, "change": 2000,
                "is_bon": False, "unit": "warung",
                "cashier_id": user["id"], "cashier_name": user.get("name"),
                "created_at": date_iso,
            })

    # Sample expenses
    await insert_doc("expenses", {"amount": 2_500_000, "category": "Sewa Tanah", "unit": "anggur", "notes": "Sewa bulan ini", "date": now_iso()})
    await insert_doc("expenses", {"amount": 500_000, "category": "Utilitas", "unit": "warung", "notes": "Listrik & air", "date": now_iso()})
    await insert_doc("expenses", {"amount": 1_200_000, "category": "Pembelian Bahan", "unit": "warung", "notes": "Restock", "date": now_iso()})

    return {"ok": True, "message": "Data contoh berhasil dimuat"}


# ---------- Settings ----------
@api.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    s = await db.settings.find_one({}, {"_id": 0})
    return s or {
        "business_name": "AgriWarung Boyolali",
        "address": "Boyolali, Jawa Tengah",
        "phone": "",
        "currency": "Rp",
        "tax_rate": 11,
        "tax_receipt_enabled": True,
        "tax_inclusive": True,
    }


@api.put("/settings")
async def update_settings(body: dict, user: dict = Depends(get_current_user)):
    body.pop("_id", None)
    await db.settings.update_one({}, {"$set": body}, upsert=True)
    return await get_settings(user)


# ---------- Startup ----------
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = AsyncIOScheduler(timezone="Asia/Jakarta")


async def job_daily_summary():
    fake_user = {"id": "system", "name": "System Scheduler"}
    res = await wa_daily_summary(fake_user)
    await db.scheduled_notifications.insert_one({
        "id": gen_id(),
        "type": "daily_summary",
        "title": "Ringkasan Harian Otomatis",
        "text": res["text"],
        "scheduled_at": now_iso(),
        "dismissed": False,
    })
    await broadcast_event("scheduled_notification", {"type": "daily_summary", "title": "Ringkasan Harian siap dikirim"})


async def job_low_stock_check():
    fake_user = {"id": "system", "name": "System Scheduler"}
    res = await wa_low_stock(fake_user)
    if res.get("count", 0) > 0:
        await db.scheduled_notifications.insert_one({
            "id": gen_id(),
            "type": "low_stock",
            "title": f"⚠ Stok Menipis ({res['count']} item)",
            "text": res["text"],
            "scheduled_at": now_iso(),
            "dismissed": False,
        })
        await broadcast_event("scheduled_notification", {"type": "low_stock", "title": f"Stok menipis: {res['count']} item"})


async def job_payroll_alert():
    fake_user = {"id": "system", "name": "System Scheduler"}
    res = await wa_payroll_alert(fake_user)
    await db.scheduled_notifications.insert_one({
        "id": gen_id(),
        "type": "payroll",
        "title": "Pengingat Penggajian Bulanan",
        "text": res["text"],
        "scheduled_at": now_iso(),
        "dismissed": False,
    })
    await broadcast_event("scheduled_notification", {"type": "payroll", "title": "Pengingat penggajian bulanan"})


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("phone", sparse=True)
    await db.otp_codes.create_index("expires_at", expireAfterSeconds=0)
    await db.transactions.create_index([("unit", 1), ("created_at", -1)])
    await db.transactions.create_index("payment_status")
    await db.stock_movements.create_index([("item_id", 1), ("created_at", -1)])
    await db.inventory_items.create_index([("name_key", 1), ("unit", 1), ("business_unit", 1)])
    await db.inventory_batches.create_index([("item_id", 1), ("created_at", -1)])
    await db.inventory_batches.create_index([("item_id", 1), ("batch_no", 1)])
    await db.inventory_batches.create_index([("batch_no", 1)])
    await db.production_batches.create_index([("created_at", -1)])
    await db.production_batches.create_index([("batch_no", 1)])
    await db.b2b_invoices.create_index([("created_at", -1)])
    await db.transactions.create_index([("trx_no", 1)])
    await db.transactions.create_index([("customer_name", 1)])
    await db.transactions.create_index([("customer_phone", 1)])
    await db.customer_debts.create_index([("customer_name", 1)])
    await db.customer_debts.create_index([("customer_phone", 1)])
    await db.customer_debts.create_index([("customer_name", 1)])
    await db.customer_debts.create_index([("customer_phone", 1)])
    await db.notifications.create_index([("is_read", 1), ("created_at", -1)])
    await db.audit_logs.create_index("timestamp")
    await db.debt_payments.create_index([("transaction_id", 1), ("created_at", -1)])
    await db.debt_payments.create_index([("debt_id", 1), ("created_at", -1)])
    await db.employee_leaves.create_index([("employee_id", 1), ("date_from", -1)])
    await db.opname_sessions.create_index([("status", 1), ("created_at", -1)])
    # Repair data yang sempat dibuat versi lama: pelunasan bon jangan menjadi revenue baru Rp11.000.
    try:
        repaired = await _repair_legacy_bon_settlement_transactions()
        if repaired:
            print(f"[migration] repaired legacy bon settlement transactions: {repaired}")
    except Exception as e:
        print(f"[migration] legacy bon settlement repair skipped: {e}")
    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@agriwarung.id").lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": gen_id(),
            "email": admin_email,
            "password_hash": hash_password(admin_pw),
            "name": "Super Admin",
            "role": "super_admin",
            "active": True,
            "created_at": now_iso(),
        })
    # Schedule jobs (WIB timezone)
    scheduler.add_job(job_daily_summary, CronTrigger(hour=21, minute=0), id="daily_summary", replace_existing=True)
    scheduler.add_job(job_low_stock_check, CronTrigger(hour="8,14,20", minute=0), id="low_stock_check", replace_existing=True)
    scheduler.add_job(job_payroll_alert, CronTrigger(day=25, hour=9, minute=0), id="payroll_alert", replace_existing=True)
    scheduler.start()


@app.on_event("shutdown")
async def shutdown():
    if scheduler.running:
        scheduler.shutdown()
    client.close()


# Health
@api.get("/")
async def root():
    return {"app": "AgriWarung Manager API", "status": "ok"}


@api.get("/health")
async def health():
    """Liveness probe for hosting providers (Render, Railway, Fly.io, etc.)."""
    try:
        await db.command("ping")
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        raise HTTPException(503, f"db unreachable: {e}")


# ---------- Production Batches (Pupuk) ----------
class ProductionPreviewIn(BaseModel):
    recipe_id: str
    quantity: int


@api.post("/production/preview")
async def preview_production(body: ProductionPreviewIn, user: dict = Depends(get_current_user)):
    bom = await db.bom_recipes.find_one({"id": body.recipe_id}, {"_id": 0})
    if not bom:
        raise HTTPException(404, "Resep tidak ditemukan")
    checklist = []
    total_cost = 0
    for ing in bom["ingredients"]:
        inv = await db.inventory_items.find_one({"id": ing["item_id"]}, {"_id": 0})
        required = ing["quantity"] * body.quantity
        available = inv.get("current_stock", 0) if inv else 0
        cost = (inv.get("cost_price", 0) if inv else 0) * required
        total_cost += cost
        checklist.append({
            "item_id": ing["item_id"],
            "name": inv.get("name") if inv else "—",
            "unit": inv.get("unit") if inv else "",
            "required": required,
            "available": available,
            "sufficient": available >= required,
            "estimated_cost": int(cost),
        })
    return {
        "recipe_id": body.recipe_id,
        "recipe_name": bom.get("name"),
        "quantity": body.quantity,
        "checklist": checklist,
        "total_estimated_cost": int(total_cost),
        "can_produce": all(c["sufficient"] for c in checklist),
    }


class ProductionBatchIn(BaseModel):
    recipe_id: str
    quantity: int
    notes: Optional[str] = ""
    force: bool = False  # override insufficient stock
    selected_batches: Optional[Dict[str, str]] = None


@api.post("/production/batches")
async def create_batch(body: ProductionBatchIn, user: dict = Depends(get_current_user)):
    bom = await db.bom_recipes.find_one({"id": body.recipe_id}, {"_id": 0})
    if not bom:
        raise HTTPException(404, "Resep tidak ditemukan")
    production_id = gen_id()
    actual_cost = 0
    created_at = now_iso()

    # Check stock
    for ing in bom.get("ingredients", []):
        inv = await db.inventory_items.find_one({"id": ing.get("item_id")})
        required = float(ing.get("quantity") or 0) * float(body.quantity or 0)
        if not inv or (float(inv.get("current_stock") or 0) < required and not body.force):
            raise HTTPException(400, f"Stok {inv.get('name') if inv else 'bahan'} tidak cukup")

    consumed_summary = []
    # Deduct inputs
    for ing in bom.get("ingredients", []):
        inv = await db.inventory_items.find_one({"id": ing.get("item_id")})
        required = float(ing.get("quantity") or 0) * float(body.quantity or 0)
        actual_cost += int(required * int(inv.get("cost_price") or 0))
        await db.inventory_items.update_one({"id": ing["item_id"]}, {"$inc": {"current_stock": -required}})
        used_batches = await _consume_inventory_batches(ing["item_id"], required, reference=f"PROD-{production_id}", preferred_batch=(body.selected_batches or {}).get(ing["item_id"], ""))
        consumed_summary.append({"item_id": ing["item_id"], "item_name": inv.get("name"), "quantity": required, "unit": inv.get("unit"), "batches": used_batches})
        await db.stock_movements.insert_one({
            "id": gen_id(), "item_id": ing["item_id"], "type": "production_out",
            "quantity": -required, "qty_out": required, "qty_in": 0,
            "reason": f"Produksi {bom.get('name')}",
            "reference": "production_batch", "reference_id": production_id,
            "consumed_batches": used_batches,
            "created_at": created_at,
        })

    # Add output
    await db.inventory_items.update_one({"id": bom["output_item_id"]}, {"$inc": {"current_stock": float(body.quantity or 0)}})
    output_item = await db.inventory_items.find_one({"id": bom["output_item_id"]}, {"_id": 0})
    out_batch = await _record_output_batch_if_enabled(output_item, body.quantity, "production_batch", ref=production_id, notes=body.notes or f"Hasil produksi {bom.get('name')}")
    await db.stock_movements.insert_one({
        "id": gen_id(), "item_id": bom["output_item_id"], "type": "production_in",
        "quantity": float(body.quantity or 0), "qty_in": float(body.quantity or 0), "qty_out": 0,
        "reason": f"Hasil produksi {bom.get('name')}",
        "reference": "production_batch", "reference_id": production_id,
        "batch_id": (out_batch or {}).get("id", ""),
        "batch_no": (out_batch or {}).get("batch_no", ""),
        "created_at": created_at,
    })
    batch_no = (out_batch or {}).get("batch_no") or f"BATCH-{datetime.now().strftime('%Y%m')}-{str(uuid.uuid4())[:5].upper()}"
    doc = {
        "id": production_id, "batch_no": batch_no, "recipe_id": body.recipe_id,
        "recipe_name": bom.get("name"), "output_item_id": bom["output_item_id"],
        "output_item_name": output_item.get("name") if output_item else "",
        "quantity": float(body.quantity or 0), "actual_cost": actual_cost,
        "inventory_batch_id": (out_batch or {}).get("id", ""),
        "inventory_batch_no": (out_batch or {}).get("batch_no", ""),
        "consumed_inputs": consumed_summary,
        "notes": body.notes, "created_by": user["id"], "created_at": created_at,
    }
    await db.production_batches.insert_one(doc)
    invalidate_finance_summary_cache()
    await write_audit(user, "create", "production_batch", production_id, {"batch_no": batch_no, "recipe": bom.get("name"), "qty": body.quantity})
    return doc


@api.get("/production/batches")
async def list_batches(user: dict = Depends(get_current_user)):
    return await db.production_batches.find({"cancelled": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(500)


class ProductionBatchEditIn(BaseModel):
    notes: Optional[str] = None
    batch_no: Optional[str] = None


@api.put("/production/batches/{batch_id}")
async def update_production_batch(batch_id: str, body: ProductionBatchEditIn, user: dict = Depends(get_current_user)):
    batch = await db.production_batches.find_one({"$or": [{"id": batch_id}, {"batch_no": batch_id}]}, {"_id": 0})
    if not batch:
        raise HTTPException(404, "Riwayat produksi tidak ditemukan")
    update = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not update:
        return batch
    update["updated_at"] = now_iso()
    update["updated_by"] = user.get("id")
    await db.production_batches.update_one({"id": batch["id"]}, {"$set": update})
    # Sinkronkan label inventory batch output jika batch_no/catatan diedit.
    if batch.get("inventory_batch_id"):
        inv_update = {}
        if "batch_no" in update:
            inv_update["batch_no"] = update["batch_no"]
        if "notes" in update:
            inv_update["notes"] = update["notes"]
        if inv_update:
            inv_update["updated_at"] = update["updated_at"]
            await db.inventory_batches.update_one({"id": batch["inventory_batch_id"]}, {"$set": inv_update})
    await write_audit(user, "update", "production_batch", batch["id"], update)
    return await db.production_batches.find_one({"id": batch["id"]}, {"_id": 0})


@api.delete("/production/batches/{batch_id}")
async def delete_production_batch(batch_id: str, user: dict = Depends(get_current_user)):
    batch = await db.production_batches.find_one({"$or": [{"id": batch_id}, {"batch_no": batch_id}]}, {"_id": 0})
    if not batch:
        raise HTTPException(404, "Riwayat produksi tidak ditemukan")
    if batch.get("cancelled"):
        raise HTTPException(400, "Riwayat produksi sudah dibatalkan")
    production_id = batch["id"]
    now = now_iso()
    qty = float(batch.get("quantity") or 0)

    # Kurangi stok barang jadi. Jangan sampai stok negatif tanpa alasan jelas.
    out_item_id = batch.get("output_item_id")
    if out_item_id and qty:
        out_item = await db.inventory_items.find_one({"id": out_item_id}, {"_id": 0})
        if out_item and float(out_item.get("current_stock") or 0) < qty:
            raise HTTPException(400, "Stok barang jadi sudah dipakai. Tidak bisa hapus produksi; lakukan penyesuaian stok dulu.")
        await db.inventory_items.update_one({"id": out_item_id}, {"$inc": {"current_stock": -qty}})
        if batch.get("inventory_batch_id"):
            await db.inventory_batches.update_one({"id": batch["inventory_batch_id"]}, {"$set": {"remaining_quantity": 0, "cancelled": True, "cancelled_at": now, "updated_at": now}})
        await db.stock_movements.insert_one({
            "id": gen_id(), "item_id": out_item_id, "type": "production_delete_output_reverse",
            "quantity": -qty, "qty_out": qty, "qty_in": 0,
            "reason": f"Hapus produksi {batch.get('batch_no')}",
            "reference": "production_batch_delete", "reference_id": production_id,
            "created_at": now,
        })

    # Kembalikan bahan baku sesuai consumed_inputs jika tersedia; fallback ke BOM.
    consumed_inputs = batch.get("consumed_inputs") or []
    if not consumed_inputs:
        bom = await db.bom_recipes.find_one({"id": batch.get("recipe_id")}, {"_id": 0}) or {}
        for ing in bom.get("ingredients", []):
            consumed_inputs.append({"item_id": ing.get("item_id"), "quantity": float(ing.get("quantity") or 0) * qty, "batches": []})
    for c in consumed_inputs:
        item_id = c.get("item_id")
        qin = float(c.get("quantity") or 0)
        if not item_id or qin <= 0:
            continue
        await db.inventory_items.update_one({"id": item_id}, {"$inc": {"current_stock": qin}})
        restored = []
        for b in c.get("batches") or []:
            bid, bno, q = b.get("batch_id"), b.get("batch_no"), float(b.get("qty_out") or 0)
            if q <= 0:
                continue
            await db.inventory_batches.update_one({"$or": [{"id": bid}, {"batch_no": bno}], "item_id": item_id}, {"$inc": {"remaining_quantity": q}, "$set": {"updated_at": now}})
            restored.append({"batch_id": bid, "batch_no": bno, "qty_in": q})
        await db.stock_movements.insert_one({
            "id": gen_id(), "item_id": item_id, "type": "production_delete_input_restore",
            "quantity": qin, "qty_in": qin, "qty_out": 0,
            "reason": f"Hapus produksi {batch.get('batch_no')}",
            "reference": "production_batch_delete", "reference_id": production_id,
            "restored_batches": restored,
            "created_at": now,
        })

    await db.production_batches.update_one({"id": production_id}, {"$set": {"cancelled": True, "cancelled_at": now, "cancelled_by": user.get("id")}})
    invalidate_finance_summary_cache()
    await write_audit(user, "delete", "production_batch", production_id, {"batch_no": batch.get("batch_no"), "qty": qty})
    return {"ok": True, "cancelled": True}


# ---------- Kebun / Farm (generic, formerly vineyard) ----------
class PlotIn(BaseModel):
    name: str
    location: Optional[str] = ""
    area_sqm: Optional[float] = 0
    variety: Optional[str] = ""
    planted_count: Optional[int] = 0
    planted_date: Optional[str] = None
    notes: Optional[str] = ""
    inventory_item_id: Optional[str] = ""
    inventory_mode: Optional[str] = "auto"  # auto | existing | none
    inventory_item_name: Optional[str] = ""


async def _attach_plot_to_inventory(plot: dict, previous: Optional[dict] = None):
    """Sambungkan jumlah tanaman plot ke inventory sebagai aset pohon/bibit.

    Jika user memilih item inventori, jumlah pohon ditambahkan ke item itu. Jika belum
    punya item, sistem membuat item baru otomatis. Saat edit, hanya selisih jumlah yang
    disesuaikan agar stok tidak dobel.
    """
    mode = (plot.get("inventory_mode") or "auto").lower()
    if mode == "none":
        return plot
    qty = int(float(plot.get("planted_count") or 0))
    prev_qty = int(float((previous or {}).get("inventory_qty_recorded") or 0))
    delta = qty - prev_qty if previous else qty
    if qty <= 0 and not previous:
        return plot

    item = None
    item_id = plot.get("inventory_item_id") or (previous or {}).get("inventory_item_id")
    if item_id:
        item = await db.inventory_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        name = (plot.get("inventory_item_name") or f"Tanaman Anggur - {plot.get('name') or plot.get('variety') or 'Plot'}").strip()
        item = await db.inventory_items.find_one({"name_key": _inventory_name_key(name), "business_unit": "anggur"}, {"_id": 0})
        if not item:
            doc = {
                "id": gen_id(), "name": name, "name_key": _inventory_name_key(name),
                "category": "Tanaman Kebun", "unit": "pohon", "current_stock": 0, "min_stock": 0,
                "cost_price": 0, "sell_price": 0, "business_unit": "anggur",
                "location": plot.get("location") or "Kebun",
                "notes": f"Dibuat otomatis dari plot {plot.get('name')}", "created_at": now_iso(),
            }
            await db.inventory_items.insert_one(doc)
            item = doc
    if delta != 0 and item:
        await db.inventory_items.update_one({"id": item["id"]}, {"$inc": {"current_stock": delta}})
        await db.stock_movements.insert_one({
            "id": gen_id(), "item_id": item["id"], "type": "vineyard_plot_planted",
            "quantity": delta, "qty_in": delta if delta > 0 else 0, "qty_out": abs(delta) if delta < 0 else 0,
            "reason": f"Update jumlah tanaman plot {plot.get('name')}",
            "reference": "vineyard_plot", "reference_id": plot.get("id"), "created_at": now_iso(),
        })
    plot["inventory_item_id"] = item.get("id") if item else plot.get("inventory_item_id", "")
    plot["inventory_item_name"] = item.get("name") if item else plot.get("inventory_item_name", "")
    plot["inventory_qty_recorded"] = qty
    return plot


@api.get("/vineyard/plots")
async def list_plots(user: dict = Depends(get_current_user)):
    return await list_collection("vineyard_plots")


@api.post("/vineyard/plots")
async def create_plot(body: PlotIn, user: dict = Depends(get_current_user)):
    data = body.model_dump()
    data["id"] = gen_id()
    data["created_at"] = now_iso()
    data = await _attach_plot_to_inventory(data)
    await db.vineyard_plots.insert_one(data)
    data.pop("_id", None)
    await write_audit(user, "create", "vineyard_plot", data["id"], {"name": data.get("name"), "planted_count": data.get("planted_count")})
    return data


@api.put("/vineyard/plots/{plot_id}")
async def update_plot(plot_id: str, body: PlotIn, user: dict = Depends(get_current_user)):
    previous = await db.vineyard_plots.find_one({"id": plot_id}, {"_id": 0})
    if not previous:
        raise HTTPException(404, "Plot tidak ditemukan")
    data = {**body.model_dump(), "id": plot_id, "updated_at": now_iso()}
    data = await _attach_plot_to_inventory(data, previous)
    await db.vineyard_plots.update_one({"id": plot_id}, {"$set": data})
    doc = await db.vineyard_plots.find_one({"id": plot_id}, {"_id": 0})
    await write_audit(user, "update", "vineyard_plot", plot_id, {"name": data.get("name"), "planted_count": data.get("planted_count")})
    return doc


@api.delete("/vineyard/plots/{plot_id}")
async def delete_plot(plot_id: str, user: dict = Depends(get_current_user)):
    linked = await db.vineyard_harvests.count_documents({"plot_id": plot_id}) + await db.vineyard_activities.count_documents({"plot_id": plot_id}) + await db.vineyard_input_usages.count_documents({"plot_id": plot_id})
    if linked:
        raise HTTPException(400, "Plot sudah punya panen/aktivitas/input. Hapus catatan terkait dulu agar riwayat tidak rusak.")
    await db.vineyard_plots.delete_one({"id": plot_id})
    await write_audit(user, "delete", "vineyard_plot", plot_id, {})
    return {"ok": True}


class HarvestIn(BaseModel):
    plot_id: str
    variety: Optional[str] = ""
    quantity_kg: float
    quality_grade: str = "A"
    notes: Optional[str] = ""
    date: Optional[str] = None
    inventory_item_id: Optional[str] = ""


@api.get("/vineyard/harvests")
async def list_harvests(user: dict = Depends(get_current_user)):
    return await db.vineyard_harvests.find({}, {"_id": 0}).sort("date", -1).to_list(500)


async def _get_or_create_harvest_inventory_item(grade: str, item_id: str = "", plot: Optional[dict] = None) -> dict:
    if item_id:
        existing = await db.inventory_items.find_one({"id": item_id}, {"_id": 0})
        if existing:
            return existing
    grade = (grade or "A").upper()
    variety = ((plot or {}).get("variety") or (plot or {}).get("crop_type") or (plot or {}).get("name") or "Panen").strip()
    # Nama dibuat generik supaya bisa anggur, kelengkeng, ayam/telur, dll.
    name = f"{variety} Grade {grade}"
    existing = await db.inventory_items.find_one({"name_key": _inventory_name_key(name), "business_unit": {"$in": ["anggur", "kebun"]}}, {"_id": 0})
    if existing:
        return existing
    doc = {
        "id": gen_id(), "name": name, "name_key": _inventory_name_key(name), "category": "Hasil Panen", "unit": "kg",
        "current_stock": 0, "min_stock": 0, "cost_price": 0, "sell_price": 0,
        "business_unit": (plot or {}).get("business_unit") or "anggur", "location": "Gudang Panen",
        "notes": f"Dibuat otomatis saat catat panen {variety}", "created_at": now_iso(),
    }
    await db.inventory_items.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.post("/vineyard/harvests")
async def create_harvest(body: HarvestIn, user: dict = Depends(get_current_user)):
    if body.quantity_kg <= 0:
        raise HTTPException(400, "Jumlah panen harus lebih dari 0 kg")
    plot = await db.vineyard_plots.find_one({"id": body.plot_id}, {"_id": 0})
    if not plot:
        raise HTTPException(404, "Plot kebun tidak ditemukan")
    inv_item = await _get_or_create_harvest_inventory_item(body.quality_grade, body.inventory_item_id or "", plot)
    data = body.model_dump()
    data["date"] = data.get("date") or now_iso()
    data["inventory_item_id"] = inv_item["id"]
    data["inventory_item_name"] = inv_item.get("name")
    data["variety"] = body.variety or plot.get("variety") or plot.get("name", "")
    data["stock_recorded"] = True
    data["plot_name"] = plot.get("name", "")
    doc = await insert_doc("vineyard_harvests", data)
    await db.inventory_items.update_one({"id": inv_item["id"]}, {"$inc": {"current_stock": float(body.quantity_kg)}})
    batch = await _record_inventory_batch(inv_item, float(body.quantity_kg), {
        "supplier_name": "Panen", "purchase_ref": doc["id"], "notes": f"Panen {plot.get('name','Plot')} grade {body.quality_grade}", "purchase_date": data.get("date")
    }, source="vineyard_harvest")
    await db.stock_movements.insert_one({
        "id": gen_id(), "item_id": inv_item["id"], "type": "vineyard_harvest",
        "quantity": float(body.quantity_kg),
        "reason": f"Panen {plot.get('name','Kebun')} kualitas {body.quality_grade}",
        "reference": "vineyard_harvest", "reference_id": doc["id"],
        "batch_no": (batch or {}).get("batch_no", ""),
        "created_at": now_iso(),
    })
    await write_notification("HARVEST", "Panen dicatat", f"{inv_item.get('name')} +{body.quantity_kg:g} kg masuk Inventori/Gudang", business_id="anggur", ref_type="vineyard_harvest", ref_id=doc["id"])
    await write_audit(user, "create", "vineyard_harvest", doc["id"], {"qty": body.quantity_kg, "item_id": inv_item["id"]})
    return doc


@api.delete("/vineyard/harvests/{harvest_id}")
async def delete_harvest(harvest_id: str, user: dict = Depends(get_current_user)):
    h = await db.vineyard_harvests.find_one({"id": harvest_id}, {"_id": 0})
    if not h:
        raise HTTPException(404, "Panen tidak ditemukan")
    if h.get("inventory_item_id") and h.get("quantity_kg"):
        await db.inventory_items.update_one({"id": h["inventory_item_id"]}, {"$inc": {"current_stock": -float(h.get("quantity_kg") or 0)}})
        await db.stock_movements.insert_one({
            "id": gen_id(), "item_id": h["inventory_item_id"], "type": "vineyard_harvest_delete_reverse",
            "quantity": -float(h.get("quantity_kg") or 0), "reason": f"Hapus catatan panen {h.get('plot_name','')}",
            "reference": "vineyard_harvest", "reference_id": harvest_id, "created_at": now_iso(),
        })
    await db.vineyard_harvests.delete_one({"id": harvest_id})
    await write_audit(user, "delete", "vineyard_harvest", harvest_id, {"qty": h.get("quantity_kg")})
    return {"ok": True}


class VineyardActivityIn(BaseModel):
    plot_id: str
    activity_type: str = "perawatan"
    date: Optional[str] = None
    labor_hours: Optional[float] = 0
    cost: Optional[int] = 0
    notes: Optional[str] = ""


@api.get("/vineyard/activities")
async def list_vineyard_activities(user: dict = Depends(get_current_user)):
    acts = await db.vineyard_activities.find({}, {"_id": 0}).sort("date", -1).to_list(500)
    plots = {p["id"]: p for p in await list_collection("vineyard_plots")}
    for a in acts:
        a["plot_name"] = plots.get(a.get("plot_id"), {}).get("name", "—")
    return acts


@api.post("/vineyard/activities")
async def create_vineyard_activity(body: VineyardActivityIn, user: dict = Depends(get_current_user)):
    if not await db.vineyard_plots.find_one({"id": body.plot_id}):
        raise HTTPException(404, "Plot kebun tidak ditemukan")
    doc = body.model_dump()
    doc["date"] = doc.get("date") or now_iso()
    doc = await insert_doc("vineyard_activities", doc)
    if int(body.cost or 0) > 0:
        await db.expenses.insert_one({
            "id": gen_id(), "amount": int(body.cost or 0), "category": "Biaya Kebun Anggur", "unit": "anggur",
            "notes": f"Aktivitas kebun: {body.activity_type}", "date": doc["date"], "created_at": now_iso(),
            "reference": "vineyard_activity", "reference_id": doc["id"],
        })
    await write_audit(user, "create", "vineyard_activity", doc["id"], {"type": body.activity_type})
    return doc


@api.put("/vineyard/activities/{activity_id}")
async def update_vineyard_activity(activity_id: str, body: VineyardActivityIn, user: dict = Depends(get_current_user)):
    if not await db.vineyard_activities.find_one({"id": activity_id}):
        raise HTTPException(404, "Aktivitas tidak ditemukan")
    plot = await db.vineyard_plots.find_one({"id": body.plot_id}, {"_id": 0})
    if not plot:
        raise HTTPException(404, "Plot tidak ditemukan")
    data = body.model_dump()
    data["plot_name"] = plot.get("name")
    data["updated_at"] = now_iso()
    await db.vineyard_activities.update_one({"id": activity_id}, {"$set": data})
    # Keep expense mirror aligned.
    await db.expenses.delete_many({"reference": "vineyard_activity", "reference_id": activity_id})
    if float(body.cost or 0) > 0:
        await db.expenses.insert_one({
            "id": gen_id(), "category": "Kebun", "amount": int(body.cost),
            "description": f"Aktivitas kebun {body.activity_type} - {plot.get('name')}",
            "date": data.get("date") or now_iso(), "reference": "vineyard_activity", "reference_id": activity_id, "created_at": now_iso(),
        })
    doc = await db.vineyard_activities.find_one({"id": activity_id}, {"_id": 0})
    await write_audit(user, "update", "vineyard_activity", activity_id, {"type": body.activity_type})
    return doc


@api.delete("/vineyard/activities/{activity_id}")
async def delete_vineyard_activity(activity_id: str, user: dict = Depends(get_current_user)):
    await db.vineyard_activities.delete_one({"id": activity_id})
    await db.expenses.delete_many({"reference": "vineyard_activity", "reference_id": activity_id})
    await write_audit(user, "delete", "vineyard_activity", activity_id, {})
    return {"ok": True}


class VineyardInputUseIn(BaseModel):
    plot_id: str
    item_id: str
    quantity: float
    purpose: Optional[str] = "Perawatan kebun"
    date: Optional[str] = None
    notes: Optional[str] = ""


@api.get("/vineyard/input-usages")
async def list_vineyard_input_usages(user: dict = Depends(get_current_user)):
    rows = await db.vineyard_input_usages.find({}, {"_id": 0}).sort("date", -1).to_list(500)
    plots = {p["id"]: p for p in await list_collection("vineyard_plots")}
    items = {i["id"]: i for i in await list_collection("inventory_items")}
    for r in rows:
        r["plot_name"] = plots.get(r.get("plot_id"), {}).get("name", "—")
        r["item_name"] = items.get(r.get("item_id"), {}).get("name", r.get("item_name", "—"))
        r["unit"] = items.get(r.get("item_id"), {}).get("unit", r.get("unit", ""))
    return rows


@api.post("/vineyard/input-usages")
async def create_vineyard_input_usage(body: VineyardInputUseIn, user: dict = Depends(get_current_user)):
    if body.quantity <= 0:
        raise HTTPException(400, "Jumlah input harus lebih dari 0")
    plot = await db.vineyard_plots.find_one({"id": body.plot_id}, {"_id": 0})
    item = await db.inventory_items.find_one({"id": body.item_id}, {"_id": 0})
    if not plot:
        raise HTTPException(404, "Plot kebun tidak ditemukan")
    if not item:
        raise HTTPException(404, "Item inventori tidak ditemukan")
    if float(item.get("current_stock") or 0) < float(body.quantity):
        raise HTTPException(400, f"Stok {item.get('name')} tidak cukup")
    doc = body.model_dump()
    doc["date"] = doc.get("date") or now_iso()
    doc["item_name"] = item.get("name")
    doc["unit"] = item.get("unit", "")
    doc["plot_name"] = plot.get("name")
    doc = await insert_doc("vineyard_input_usages", doc)
    await db.inventory_items.update_one({"id": body.item_id}, {"$inc": {"current_stock": -float(body.quantity)}})
    await db.stock_movements.insert_one({
        "id": gen_id(), "item_id": body.item_id, "type": "vineyard_input_use",
        "quantity": -float(body.quantity), "reason": f"Input kebun {plot.get('name')}: {body.purpose}",
        "reference": "vineyard_input_usage", "reference_id": doc["id"], "created_at": now_iso(),
    })
    await write_audit(user, "create", "vineyard_input_usage", doc["id"], {"item_id": body.item_id, "qty": body.quantity})
    return doc


@api.delete("/vineyard/input-usages/{usage_id}")
async def delete_vineyard_input_usage(usage_id: str, user: dict = Depends(get_current_user)):
    u = await db.vineyard_input_usages.find_one({"id": usage_id}, {"_id": 0})
    if not u:
        raise HTTPException(404, "Pemakaian input tidak ditemukan")
    await db.inventory_items.update_one({"id": u.get("item_id")}, {"$inc": {"current_stock": float(u.get("quantity") or 0)}})
    await db.stock_movements.insert_one({
        "id": gen_id(), "item_id": u.get("item_id"), "type": "vineyard_input_delete_reverse",
        "quantity": float(u.get("quantity") or 0), "reason": "Hapus pemakaian input kebun",
        "reference": "vineyard_input_usage", "reference_id": usage_id, "created_at": now_iso(),
    })
    await db.vineyard_input_usages.delete_one({"id": usage_id})
    await write_audit(user, "delete", "vineyard_input_usage", usage_id, {})
    return {"ok": True}


# ---------- B2B Customers & Invoices ----------
class B2BCustomerIn(BaseModel):
    name: str
    contact: Optional[str] = ""
    address: Optional[str] = ""
    payment_terms: Optional[str] = "cash"


@api.get("/b2b/customers")
async def list_b2b_customers(user: dict = Depends(get_current_user)):
    return await list_collection("b2b_customers")


@api.post("/b2b/customers")
async def create_b2b_customer(body: B2BCustomerIn, user: dict = Depends(get_current_user)):
    return await insert_doc("b2b_customers", body.model_dump())


@api.put("/b2b/customers/{cust_id}")
async def update_b2b_customer(cust_id: str, body: B2BCustomerIn, user: dict = Depends(get_current_user)):
    await db.b2b_customers.update_one({"id": cust_id}, {"$set": {**body.model_dump(), "updated_at": now_iso()}})
    doc = await db.b2b_customers.find_one({"id": cust_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Pelanggan tidak ditemukan")
    return doc


@api.delete("/b2b/customers/{cust_id}")
async def delete_b2b_customer(cust_id: str, user: dict = Depends(get_current_user)):
    if await db.b2b_invoices.find_one({"customer_id": cust_id}):
        raise HTTPException(400, "Pelanggan sudah punya invoice. Hapus invoice terkait dulu.")
    await db.b2b_customers.delete_one({"id": cust_id})
    return {"ok": True}


class B2BInvoiceItemIn(BaseModel):
    item_id: Optional[str] = ""
    name: str
    quantity: float
    unit_price: int


class B2BInvoiceIn(BaseModel):
    customer_id: str
    items: List[B2BInvoiceItemIn]
    notes: Optional[str] = ""
    delivery_date: Optional[str] = None


@api.get("/b2b/invoices")
async def list_b2b_invoices(user: dict = Depends(get_current_user)):
    invoices = await db.b2b_invoices.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    customers = {c["id"]: c for c in await list_collection("b2b_customers")}
    for inv in invoices:
        inv["customer_name"] = customers.get(inv.get("customer_id"), {}).get("name", "—")
    return invoices


@api.post("/b2b/invoices")
async def create_b2b_invoice(body: B2BInvoiceIn, user: dict = Depends(get_current_user)):
    items = [i.model_dump() for i in body.items]
    total = sum(i["quantity"] * i["unit_price"] for i in items)
    inv_no = f"INV-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:5].upper()}"
    doc = {
        "id": gen_id(), "invoice_no": inv_no, "customer_id": body.customer_id,
        "items": items, "total": int(total), "paid": 0, "status": "sent",
        "notes": body.notes, "delivery_date": body.delivery_date,
        "created_by": user["id"], "created_at": now_iso(),
    }
    await db.b2b_invoices.insert_one(doc)
    doc.pop("_id", None)
    # Journal entry: piutang B2B
    await db.journal_entries.insert_one({
        "id": gen_id(), "date": doc["created_at"],
        "description": f"Penjualan B2B {inv_no}",
        "lines": [
            {"account": "Piutang Usaha B2B", "debit": int(total), "credit": 0},
            {"account": "Pendapatan Anggur B2B", "debit": 0, "credit": int(total)},
        ],
        "reference": "b2b_invoice", "reference_id": doc["id"],
        "unit": "anggur", "created_at": now_iso(),
    })
    return doc


class B2BPayIn(BaseModel):
    amount: int


@api.post("/b2b/invoices/{inv_id}/pay")
async def pay_b2b(inv_id: str, body: B2BPayIn, user: dict = Depends(get_current_user)):
    inv = await db.b2b_invoices.find_one({"id": inv_id})
    if not inv:
        raise HTTPException(404, "Invoice tidak ditemukan")
    new_paid = inv.get("paid", 0) + body.amount
    status = "paid" if new_paid >= inv["total"] else "partial"
    await db.b2b_invoices.update_one({"id": inv_id}, {"$set": {"paid": new_paid, "status": status}})
    return {"ok": True}


@api.delete("/b2b/invoices/{inv_id}")
async def delete_b2b_invoice(inv_id: str, user: dict = Depends(get_current_user)):
    inv = await db.b2b_invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice tidak ditemukan")
    if int(inv.get("paid") or 0) > 0:
        raise HTTPException(400, "Invoice sudah memiliki pembayaran. Batalkan/adjust di Keuangan agar audit aman.")
    await db.b2b_invoices.delete_one({"id": inv_id})
    await db.journal_entries.delete_many({"reference": "b2b_invoice", "reference_id": inv_id})
    await write_audit(user, "delete", "b2b_invoice", inv_id, {"invoice_no": inv.get("invoice_no"), "total": inv.get("total")})
    return {"ok": True}


# ---------- Peternakan ----------
class LivestockAssetIn(BaseModel):
    name: str
    animal_type: Optional[str] = "ayam"
    count: float = 0
    unit: Optional[str] = "ekor"
    location: Optional[str] = "Kandang"
    notes: Optional[str] = ""
    inventory_item_id: Optional[str] = ""


class LivestockProductionIn(BaseModel):
    asset_id: Optional[str] = ""
    product_name: str
    quantity: float
    unit: Optional[str] = "pcs"
    grade: Optional[str] = "A"
    date: Optional[str] = None
    notes: Optional[str] = ""
    inventory_item_id: Optional[str] = ""


@api.get("/livestock/assets")
async def list_livestock_assets(user: dict = Depends(get_current_user)):
    return await db.livestock_assets.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/livestock/assets")
async def create_livestock_asset(body: LivestockAssetIn, user: dict = Depends(get_current_user)):
    data = body.model_dump()
    data["id"] = gen_id()
    data["created_at"] = now_iso()
    item = None
    if body.inventory_item_id:
        item = await db.inventory_items.find_one({"id": body.inventory_item_id}, {"_id": 0})
    if not item and body.count:
        name = f"{body.name} ({body.animal_type})"
        item = await db.inventory_items.find_one({"name_key": _inventory_name_key(name), "business_unit": "peternakan"}, {"_id": 0})
        if not item:
            item = {
                "id": gen_id(), "name": name, "name_key": _inventory_name_key(name),
                "category": "Aset Ternak", "unit": body.unit or "ekor", "current_stock": 0, "min_stock": 0,
                "cost_price": 0, "sell_price": 0, "business_unit": "peternakan", "location": body.location or "Kandang",
                "notes": "Dibuat otomatis dari menu Peternakan", "created_at": now_iso(),
            }
            await db.inventory_items.insert_one(item)
        await db.inventory_items.update_one({"id": item["id"]}, {"$inc": {"current_stock": float(body.count)}})
        await _record_output_batch_if_enabled(item, float(body.count), "livestock_asset", ref=data["id"], notes=f"Tambah aset ternak {body.name}")
        data["inventory_item_id"] = item["id"]
        data["inventory_item_name"] = item["name"]
    await db.livestock_assets.insert_one(data)
    data.pop("_id", None)
    await write_audit(user, "create", "livestock_asset", data["id"], {"name": body.name, "count": body.count})
    return data


@api.delete("/livestock/assets/{asset_id}")
async def delete_livestock_asset(asset_id: str, user: dict = Depends(get_current_user)):
    if await db.livestock_productions.find_one({"asset_id": asset_id}):
        raise HTTPException(400, "Aset ternak sudah punya catatan produksi. Hapus produksi terkait dulu.")
    await db.livestock_assets.delete_one({"id": asset_id})
    await write_audit(user, "delete", "livestock_asset", asset_id, {})
    return {"ok": True}


@api.get("/livestock/productions")
async def list_livestock_productions(user: dict = Depends(get_current_user)):
    return await db.livestock_productions.find({}, {"_id": 0}).sort("date", -1).to_list(500)


@api.post("/livestock/productions")
async def create_livestock_production(body: LivestockProductionIn, user: dict = Depends(get_current_user)):
    if body.quantity <= 0:
        raise HTTPException(400, "Jumlah hasil harus lebih dari 0")
    asset = await db.livestock_assets.find_one({"id": body.asset_id}, {"_id": 0}) if body.asset_id else None
    item = await db.inventory_items.find_one({"id": body.inventory_item_id}, {"_id": 0}) if body.inventory_item_id else None
    product_name = f"{body.product_name} Grade {(body.grade or 'A').upper()}".strip()
    if not item:
        item = await db.inventory_items.find_one({"name_key": _inventory_name_key(product_name), "business_unit": "peternakan"}, {"_id": 0})
    if not item:
        item = {
            "id": gen_id(), "name": product_name, "name_key": _inventory_name_key(product_name),
            "category": "Hasil Ternak", "unit": body.unit or "pcs", "current_stock": 0, "min_stock": 0,
            "cost_price": 0, "sell_price": 0, "business_unit": "peternakan", "location": "Gudang Ternak",
            "notes": "Dibuat otomatis dari produksi Peternakan", "created_at": now_iso(),
        }
        await db.inventory_items.insert_one(item)
    data = body.model_dump()
    data["id"] = gen_id()
    data["date"] = data.get("date") or now_iso()
    data["asset_name"] = (asset or {}).get("name", "")
    data["inventory_item_id"] = item["id"]
    data["inventory_item_name"] = item["name"]
    await db.livestock_productions.insert_one(data)
    await db.inventory_items.update_one({"id": item["id"]}, {"$inc": {"current_stock": float(body.quantity)}})
    batch = await _record_output_batch_if_enabled(item, float(body.quantity), "livestock_production", ref=data["id"], notes=f"Produksi ternak {item.get('name')}", date=data["date"])
    await db.stock_movements.insert_one({
        "id": gen_id(), "item_id": item["id"], "type": "livestock_production", "quantity": float(body.quantity),
        "reason": f"Produksi peternakan {item.get('name')}", "reference": "livestock_production", "reference_id": data["id"],
        "batch_no": (batch or {}).get("batch_no", ""), "created_at": now_iso(),
    })
    data["batch_no"] = (batch or {}).get("batch_no", "")
    await write_audit(user, "create", "livestock_production", data["id"], {"item": item.get("name"), "qty": body.quantity})
    data.pop("_id", None)
    return data


@api.delete("/livestock/productions/{prod_id}")
async def delete_livestock_production(prod_id: str, user: dict = Depends(get_current_user)):
    prod = await db.livestock_productions.find_one({"id": prod_id}, {"_id": 0})
    if not prod:
        raise HTTPException(404, "Catatan produksi tidak ditemukan")
    if prod.get("inventory_item_id") and prod.get("quantity"):
        await db.inventory_items.update_one({"id": prod["inventory_item_id"]}, {"$inc": {"current_stock": -float(prod.get("quantity") or 0)}})
        await db.stock_movements.insert_one({"id": gen_id(), "item_id": prod["inventory_item_id"], "type": "livestock_production_delete_reverse", "quantity": -float(prod.get("quantity") or 0), "reference": "livestock_production", "reference_id": prod_id, "created_at": now_iso()})
    await db.livestock_productions.delete_one({"id": prod_id})
    await write_audit(user, "delete", "livestock_production", prod_id, {})
    return {"ok": True}


# ---------- Suppliers & Purchase Orders ----------
class SupplierIn(BaseModel):
    name: str
    contact: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    payment_terms: Optional[str] = "cash"
    notes: Optional[str] = ""


@api.get("/suppliers")
async def list_suppliers(user: dict = Depends(get_current_user)):
    return await list_collection("suppliers")


def normalize_supplier_term(term: str) -> str:
    allowed = {"cash", "transfer", "qris", "bon"}
    t = (term or "cash").lower()
    aliases = {"tunai": "cash", "cod": "cash", "credit": "bon", "hutang": "bon"}
    return aliases.get(t, t if t in allowed else "cash")


@api.post("/suppliers")
async def create_supplier(body: SupplierIn, user: dict = Depends(get_current_user)):
    data = body.model_dump()
    data["payment_terms"] = normalize_supplier_term(data.get("payment_terms"))
    return await insert_doc("suppliers", data)


@api.put("/suppliers/{sup_id}")
async def update_supplier(sup_id: str, body: SupplierIn, user: dict = Depends(get_current_user)):
    data = body.model_dump()
    data["payment_terms"] = normalize_supplier_term(data.get("payment_terms"))
    data["updated_at"] = now_iso()
    await db.suppliers.update_one({"id": sup_id}, {"$set": data})
    doc = await db.suppliers.find_one({"id": sup_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Supplier tidak ditemukan")
    await write_audit(user, "update", "supplier", sup_id, {"name": data.get("name")})
    return doc


@api.delete("/suppliers/{sup_id}")
async def delete_supplier(sup_id: str, user: dict = Depends(get_current_user)):
    linked = await db.purchase_orders.count_documents({"supplier_id": sup_id})
    if linked:
        raise HTTPException(400, "Supplier sudah dipakai PO. Hapus/ubah PO terkait dulu.")
    await db.suppliers.delete_one({"id": sup_id})
    await write_audit(user, "delete", "supplier", sup_id, {})
    return {"ok": True}


class POItemIn(BaseModel):
    item_id: str
    name: str
    quantity: float
    unit_price: int


class POIn(BaseModel):
    supplier_id: str
    items: List[POItemIn]
    expected_date: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = ""
    purchase_url: Optional[str] = ""
    invoice_image_url: Optional[str] = ""
    payment_proof_url: Optional[str] = ""
    paid_amount: Optional[int] = 0
    payment_method: Optional[str] = "transfer"


@api.get("/purchase-orders")
async def list_po(user: dict = Depends(get_current_user)):
    pos = await db.purchase_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    suppliers = {s["id"]: s for s in await list_collection("suppliers")}
    for p in pos:
        p["supplier_name"] = suppliers.get(p.get("supplier_id"), {}).get("name", "—")
    return pos


@api.post("/purchase-orders")
async def create_po(body: POIn, user: dict = Depends(get_current_user)):
    items = [i.model_dump() for i in body.items]
    total = int(sum(i["quantity"] * i["unit_price"] for i in items))
    po_no = f"PO-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:5].upper()}"
    paid = max(0, min(int(body.paid_amount or 0), total))
    pay_status = "paid" if paid >= total and total > 0 else ("partial" if paid > 0 else "unpaid")
    doc = {
        "id": gen_id(), "po_no": po_no, "supplier_id": body.supplier_id,
        "items": items, "total": total, "paid_amount": paid, "payment_status": pay_status,
        "status": "sent", "delivery_status": "pending",
        "expected_date": body.expected_date, "due_date": body.due_date, "notes": body.notes,
        "purchase_url": body.purchase_url or "", "invoice_image_url": body.invoice_image_url or "",
        "payment_proof_url": body.payment_proof_url or "", "payment_method": body.payment_method or "transfer",
        "created_by": user["id"], "created_at": now_iso(),
    }
    await db.purchase_orders.insert_one(doc)
    if paid > 0:
        supplier = await db.suppliers.find_one({"id": body.supplier_id})
        pay_doc = {**doc, "paid_amount": 0}
        await _record_purchase_payment(pay_doc, paid, (supplier or {}).get("name", ""), "po", body.payment_method or "transfer", body.payment_proof_url or "", "Pembayaran awal PO")
    doc.pop("_id", None)
    return doc


@api.put("/purchase-orders/{po_id}")
async def update_po(po_id: str, body: POIn, user: dict = Depends(get_current_user)):
    po = await db.purchase_orders.find_one({"id": po_id})
    if not po:
        raise HTTPException(404, "PO tidak ditemukan")
    items = [i.model_dump() for i in body.items]
    total = int(sum(i["quantity"] * i["unit_price"] for i in items))
    paid = int(po.get("paid_amount") or 0)
    pay_status = "paid" if paid >= total and total > 0 else ("partial" if paid > 0 else "unpaid")
    update = {
        "supplier_id": body.supplier_id, "items": items, "total": total, "payment_status": pay_status,
        "expected_date": body.expected_date, "due_date": body.due_date, "notes": body.notes,
        "purchase_url": body.purchase_url or "", "invoice_image_url": body.invoice_image_url or "",
        "payment_proof_url": body.payment_proof_url or po.get("payment_proof_url", ""),
        "payment_method": body.payment_method or po.get("payment_method", "transfer"), "updated_at": now_iso(),
    }
    await db.purchase_orders.update_one({"id": po_id}, {"$set": update})
    await write_audit(user, "update", "purchase_order", po_id, {"po_no": po.get("po_no")})
    return await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})


@api.post("/purchase-orders/{po_id}/receive")
async def receive_po(po_id: str, user: dict = Depends(get_current_user)):
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO tidak ditemukan")
    if po.get("stock_received"):
        raise HTTPException(400, "Stok PO sudah diterima sebelumnya")
    stock_result = await _record_stock_receipt(po, kind="po")
    if stock_result["added"] == 0 and stock_result["skipped"]:
        raise HTTPException(400, f"Tidak ada item PO yang cocok dengan inventori: {', '.join(stock_result['skipped'])}. Periksa nama/ID item.")
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {
            "status": "received", "received_at": now_iso(),
            "stock_received": True, "stock_received_at": now_iso(),
            "delivery_status": "arrived",
            "payment_status": po.get("payment_status") or ("partial" if int(po.get("paid_amount") or 0) > 0 else "unpaid"),
        }},
    )
    await write_audit(user, "update", "purchase_order", po_id, {"action": "receive"})
    return {"ok": True, "added": stock_result["added"], "skipped": stock_result["skipped"], "items": stock_result["items_added"]}


class PurchasePayIn(BaseModel):
    amount: int
    method: Optional[str] = "transfer"
    payment_proof_url: Optional[str] = ""
    notes: Optional[str] = ""
    paid_at: Optional[str] = None


@api.get("/purchase-orders/{po_id}/payments")
async def list_po_payments(po_id: str, user: dict = Depends(get_current_user)):
    return await db.purchase_payments.find({"kind": "po", "purchase_id": po_id}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.post("/purchase-orders/{po_id}/pay")
async def pay_purchase_order(po_id: str, body: PurchasePayIn, user: dict = Depends(get_current_user)):
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO tidak ditemukan")
    supplier = await db.suppliers.find_one({"id": po.get("supplier_id")})
    pay = await _record_purchase_payment(po, body.amount, (supplier or {}).get("name", ""), "po", body.method or "transfer", body.payment_proof_url or po.get("payment_proof_url", ""), body.notes or "", body.paid_at or "")
    new_paid = int(po.get("paid_amount") or 0) + int(pay["amount"])
    status = "paid" if new_paid >= int(po.get("total") or 0) else "partial"
    update = {"paid_amount": new_paid, "payment_status": status, "last_payment_at": pay["paid_at"]}
    if body.payment_proof_url:
        update["payment_proof_url"] = body.payment_proof_url
    await db.purchase_orders.update_one({"id": po_id}, {"$set": update})
    await write_audit(user, "update", "purchase_order_payment", po_id, {"amount": pay["amount"], "status": status})
    return {"ok": True, "payment": pay, "paid_amount": new_paid, "payment_status": status}


# ---------- Online Orders (Shopee/Tokopedia) ----------
class OnlineOrderIn(BaseModel):
    platform: str  # shopee/tokopedia/manual
    order_number: str
    items: List[POItemIn]
    shipping_cost: Optional[int] = 0
    order_date: Optional[str] = None
    expected_date: Optional[str] = None
    due_date: Optional[str] = None
    invoice_image_url: Optional[str] = ""
    payment_proof_url: Optional[str] = ""
    order_url: Optional[str] = ""
    paid_amount: Optional[int] = 0
    payment_method: Optional[str] = "transfer"
    notes: Optional[str] = ""


@api.get("/online-orders")
async def list_online(user: dict = Depends(get_current_user)):
    return await db.online_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/online-orders")
async def create_online(body: OnlineOrderIn, user: dict = Depends(get_current_user)):
    items = [i.model_dump() for i in body.items]
    total = int(sum(i["quantity"] * i["unit_price"] for i in items) + (body.shipping_cost or 0))
    paid = max(0, min(int(body.paid_amount or 0), total))
    pay_status = "paid" if paid >= total and total > 0 else ("partial" if paid > 0 else "unpaid")
    doc = {
        "id": gen_id(), "platform": body.platform, "order_number": body.order_number,
        "items": items, "total": total, "paid_amount": paid, "payment_status": pay_status,
        "shipping_cost": body.shipping_cost or 0, "status": "ordered", "delivery_status": "pending",
        "order_date": body.order_date or now_iso(), "expected_date": body.expected_date, "due_date": body.due_date,
        "invoice_image_url": body.invoice_image_url, "payment_proof_url": body.payment_proof_url or "",
        "order_url": body.order_url or "", "payment_method": body.payment_method or "transfer",
        "notes": body.notes, "created_at": now_iso(),
    }
    await db.online_orders.insert_one(doc)
    if paid > 0:
        pay_doc = {**doc, "paid_amount": 0}
        await _record_purchase_payment(pay_doc, paid, body.platform, "online", body.payment_method or "transfer", body.payment_proof_url or "", "Pembayaran awal order online")
    doc.pop("_id", None)
    return doc


@api.put("/online-orders/{oid}")
async def update_online(oid: str, body: OnlineOrderIn, user: dict = Depends(get_current_user)):
    o = await db.online_orders.find_one({"id": oid})
    if not o:
        raise HTTPException(404, "Order tidak ditemukan")
    items = [i.model_dump() for i in body.items]
    total = int(sum(i["quantity"] * i["unit_price"] for i in items) + (body.shipping_cost or 0))
    paid = int(o.get("paid_amount") or 0)
    pay_status = "paid" if paid >= total and total > 0 else ("partial" if paid > 0 else "unpaid")
    update = {
        "platform": body.platform, "order_number": body.order_number, "items": items, "total": total,
        "payment_status": pay_status, "shipping_cost": body.shipping_cost or 0,
        "order_date": body.order_date or o.get("order_date"), "expected_date": body.expected_date, "due_date": body.due_date,
        "invoice_image_url": body.invoice_image_url, "payment_proof_url": body.payment_proof_url or o.get("payment_proof_url", ""),
        "order_url": body.order_url or "", "payment_method": body.payment_method or o.get("payment_method", "transfer"),
        "notes": body.notes, "updated_at": now_iso(),
    }
    await db.online_orders.update_one({"id": oid}, {"$set": update})
    await write_audit(user, "update", "online_order", oid, {"order_number": body.order_number})
    return await db.online_orders.find_one({"id": oid}, {"_id": 0})


@api.post("/online-orders/{oid}/receive")
async def receive_online(oid: str, user: dict = Depends(get_current_user)):
    o = await db.online_orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order tidak ditemukan")
    if o.get("stock_received"):
        raise HTTPException(400, "Stok order sudah diterima sebelumnya")
    stock_result = await _record_stock_receipt(o, kind="online")
    if stock_result["added"] == 0 and stock_result["skipped"]:
        raise HTTPException(400, f"Tidak ada item yang cocok dengan inventori: {', '.join(stock_result['skipped'])}. Edit order ini di Pengaturan lalu kaitkan dengan item inventori.")
    await db.online_orders.update_one(
        {"id": oid},
        {"$set": {
            "status": "received", "received_at": now_iso(),
            "stock_received": True, "stock_received_at": now_iso(),
            "delivery_status": "arrived",
            "payment_status": o.get("payment_status") or ("partial" if int(o.get("paid_amount") or 0) > 0 else "unpaid"),
        }},
    )
    await write_audit(user, "update", "online_order", oid, {"action": "receive"})
    return {"ok": True, "added": stock_result["added"], "skipped": stock_result["skipped"], "items": stock_result["items_added"]}


@api.get("/online-orders/{oid}/payments")
async def list_online_payments(oid: str, user: dict = Depends(get_current_user)):
    return await db.purchase_payments.find({"kind": "online", "purchase_id": oid}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.post("/online-orders/{oid}/pay")
async def pay_online_order(oid: str, body: PurchasePayIn, user: dict = Depends(get_current_user)):
    o = await db.online_orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order tidak ditemukan")
    pay = await _record_purchase_payment(o, body.amount, o.get("platform", ""), "online", body.method or "transfer", body.payment_proof_url or o.get("payment_proof_url", ""), body.notes or "", body.paid_at or "")
    new_paid = int(o.get("paid_amount") or 0) + int(pay["amount"])
    status = "paid" if new_paid >= int(o.get("total") or 0) else "partial"
    update = {"paid_amount": new_paid, "payment_status": status, "last_payment_at": pay["paid_at"]}
    if body.payment_proof_url:
        update["payment_proof_url"] = body.payment_proof_url
    await db.online_orders.update_one({"id": oid}, {"$set": update})
    await write_audit(user, "update", "online_payment", oid, {"amount": pay["amount"], "status": status})
    return {"ok": True, "payment": pay, "paid_amount": new_paid, "payment_status": status}


# ---------- KDS (Kitchen Display) ----------
@api.get("/orders/kds")
async def kds_orders(user: dict = Depends(get_current_user)):
    orders = await db.orders.find(
        {"status": {"$in": ["sent", "preparing", "bill_requested"]}},
        {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    tables = {t["id"]: t for t in await list_collection("tables")}
    for o in orders:
        if o.get("order_type") == "takeaway" or not o.get("table_id"):
            o["table_name"] = f"Takeaway {o.get('queue_no') or ''}".strip()
        else:
            o["table_name"] = tables.get(o.get("table_id"), {}).get("name", "Takeaway")
    return orders


class ItemStatusIn(BaseModel):
    item_index: int
    status: str  # new | preparing | ready | served


@api.put("/orders/{order_id}/item-status")
async def update_item_status(order_id: str, body: ItemStatusIn, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order tidak ditemukan")
    items = order.get("items", [])
    if body.item_index >= len(items):
        raise HTTPException(400, "Index tidak valid")
    items[body.item_index]["status"] = body.status
    # If all items ready/served, mark order ready
    all_ready = all(it.get("status") in ("ready", "served") for it in items)
    new_status = "bill_requested" if all_ready else "preparing"
    await db.orders.update_one(
        {"id": order_id}, {"$set": {"items": items, "status": new_status}}
    )
    await broadcast_event("order_updated", {"id": order_id, "status": new_status})
    return {"ok": True, "order_status": new_status}


# ---------- CSV Exports ----------
from fastapi.responses import PlainTextResponse


def csv_quote(v):
    s = str(v) if v is not None else ""
    if "," in s or '"' in s or "\n" in s:
        return '"' + s.replace('"', '""') + '"'
    return s


@api.get("/reports/transactions/csv", response_class=PlainTextResponse)
async def export_transactions_csv(user: dict = Depends(get_current_user)):
    trx = await db.transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    lines = ["trx_no,date,unit,payment_method,subtotal,discount,total,cashier,is_bon"]
    for t in trx:
        lines.append(",".join(csv_quote(x) for x in [
            t.get('trx_no',''), t.get('created_at',''), t.get('unit',''),
            t.get('payment_method',''), t.get('subtotal',0), t.get('discount',0),
            t.get('total',0), t.get('cashier_name',''), t.get('is_bon',False)
        ]))
    return "\n".join(lines)


@api.get("/reports/expenses/csv", response_class=PlainTextResponse)
async def export_expenses_csv(user: dict = Depends(get_current_user)):
    exps = await db.expenses.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    lines = ["date,category,unit,amount,notes"]
    for e in exps:
        lines.append(",".join(csv_quote(x) for x in [
            e.get('date',''), e.get('category',''), e.get('unit',''),
            e.get('amount',0), e.get('notes','')
        ]))
    return "\n".join(lines)


# ---------- Employees & HR ----------
class EmployeeIn(BaseModel):
    name: str
    nik: Optional[str] = ""
    role: str
    unit: str = "warung"
    salary_type: str = "monthly"  # monthly/weekly/daily
    base_salary: int = 0
    overtime_rate: int = 0
    bank_account: Optional[str] = ""
    phone: Optional[str] = ""
    department: Optional[str] = ""
    employment_status: Optional[str] = "tetap"  # tetap/kontrak/harian/magang
    emergency_contact: Optional[str] = ""
    leave_quota: int = 12
    start_date: Optional[str] = None
    active: bool = True


@api.get("/employees")
async def list_employees(user: dict = Depends(get_current_user)):
    return await list_collection("employees")


@api.post("/employees")
async def create_employee(body: EmployeeIn, user: dict = Depends(get_current_user)):
    data = body.model_dump()
    data["start_date"] = data.get("start_date") or now_iso()
    return await insert_doc("employees", data)


@api.put("/employees/{emp_id}")
async def update_employee(emp_id: str, body: dict, user: dict = Depends(get_current_user)):
    body.pop("_id", None)
    body.pop("id", None)
    await db.employees.update_one({"id": emp_id}, {"$set": body})
    return await db.employees.find_one({"id": emp_id}, {"_id": 0})


@api.delete("/employees/{emp_id}")
async def delete_employee(emp_id: str, user: dict = Depends(get_current_user)):
    await db.employees.delete_one({"id": emp_id})
    return {"ok": True}


@api.get("/hr/summary")
async def hr_summary(user: dict = Depends(get_current_user), month: Optional[int] = None, year: Optional[int] = None):
    now = datetime.now(timezone.utc)
    month = month or now.month
    year = year or now.year
    prefix = f"{year}-{month:02d}"
    employees = await db.employees.find({}, {"_id": 0}).to_list(2000)
    attendance = await db.attendance.find({"date": {"$regex": f"^{prefix}"}}, {"_id": 0}).to_list(5000)
    payroll = await db.payroll.find({"month": month, "year": year}, {"_id": 0}).to_list(2000)
    leaves = await db.employee_leaves.find({"date_from": {"$regex": f"^{year}"}}, {"_id": 0}).to_list(2000)
    active = [e for e in employees if e.get("active", True)]
    today = now.date().isoformat()
    today_att = [a for a in attendance if a.get("date") == today]
    checked_in = len([a for a in today_att if a.get("check_in") and not a.get("check_out")])
    payroll_total = sum(_money(p.get("net_salary")) for p in payroll)
    payroll_paid = sum(_money(p.get("paid_amount") or p.get("net_salary")) for p in payroll if p.get("paid"))
    return {
        "employees_total": len(employees),
        "employees_active": len(active),
        "checked_in_today": checked_in,
        "attendance_records": len(attendance),
        "payroll_total": payroll_total,
        "payroll_paid": payroll_paid,
        "payroll_unpaid": max(0, payroll_total - payroll_paid),
        "leaves_pending": len([l for l in leaves if l.get("status") == "pending"]),
    }


class LeaveIn(BaseModel):
    employee_id: str
    date_from: str
    date_to: str
    leave_type: str = "izin"
    reason: Optional[str] = ""


@api.get("/employee-leaves")
async def list_employee_leaves(user: dict = Depends(get_current_user), year: Optional[int] = None):
    q = {}
    if year:
        q["date_from"] = {"$regex": f"^{year}"}
    rows = await db.employee_leaves.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    emp_map = {e["id"]: e for e in await db.employees.find({}, {"_id": 0}).to_list(2000)}
    for r in rows:
        e = emp_map.get(r.get("employee_id"), {})
        r["employee_name"] = e.get("name", r.get("employee_id"))
    return rows


@api.post("/employee-leaves")
async def create_employee_leave(body: LeaveIn, user: dict = Depends(get_current_user)):
    emp = await db.employees.find_one({"id": body.employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Karyawan tidak ditemukan")
    doc = body.model_dump()
    doc.update({
        "id": gen_id(),
        "employee_name": emp.get("name"),
        "status": "pending",
        "created_by": user["id"],
        "created_at": now_iso(),
    })
    await db.employee_leaves.insert_one(doc)
    doc.pop("_id", None)
    await write_audit(user, "create", "employee_leave", doc["id"], {"employee": emp.get("name"), "type": doc["leave_type"]})
    return doc


@api.put("/employee-leaves/{leave_id}/status")
async def update_employee_leave_status(leave_id: str, body: dict, user: dict = Depends(require_roles("super_admin", "manager"))):
    status = body.get("status")
    if status not in ("approved", "rejected", "pending"):
        raise HTTPException(400, "Status tidak valid")
    await db.employee_leaves.update_one({"id": leave_id}, {"$set": {"status": status, "reviewed_by": user["id"], "reviewed_at": now_iso()}})
    await write_audit(user, "update", "employee_leave", leave_id, {"status": status})
    return {"ok": True}


class AttendanceIn(BaseModel):
    employee_id: str
    type: str  # check_in / check_out
    overtime_hours: Optional[float] = 0


@api.get("/attendance")
async def list_attendance(user: dict = Depends(get_current_user), month: Optional[int] = None, year: Optional[int] = None):
    q = {}
    if month and year:
        prefix = f"{year}-{month:02d}"
        q["date"] = {"$regex": f"^{prefix}"}
    return await db.attendance.find(q, {"_id": 0}).sort("date", -1).to_list(5000)


@api.post("/attendance")
async def record_attendance(body: AttendanceIn, user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    existing = await db.attendance.find_one({"employee_id": body.employee_id, "date": today})
    now_t = datetime.now(timezone.utc).isoformat()
    if existing:
        if body.type == "check_out":
            await db.attendance.update_one(
                {"id": existing["id"]},
                {"$set": {"check_out": now_t, "overtime_hours": body.overtime_hours or 0}}
            )
            return await db.attendance.find_one({"id": existing["id"]}, {"_id": 0})
        raise HTTPException(400, "Sudah check-in hari ini")
    doc = {
        "id": gen_id(), "employee_id": body.employee_id, "date": today,
        "check_in": now_t, "check_out": None,
        "overtime_hours": body.overtime_hours or 0,
        "created_at": now_iso(),
    }
    await db.attendance.insert_one(doc)
    doc.pop("_id", None)
    return doc


def calc_pph21(annual_gross: int) -> int:
    """Simplified PPh21 Indonesia (TK/0 PTKP 54jt/year)"""
    PTKP = 54_000_000
    taxable = max(0, annual_gross - PTKP)
    brackets = [(60_000_000, 0.05), (250_000_000, 0.15), (500_000_000, 0.25), (5_000_000_000, 0.30)]
    tax = 0
    prev = 0
    for limit, rate in brackets:
        if taxable <= prev:
            break
        portion = min(taxable, limit) - prev
        tax += portion * rate
        prev = limit
    if taxable > 5_000_000_000:
        tax += (taxable - 5_000_000_000) * 0.35
    return int(tax)


class PayrollGenIn(BaseModel):
    month: int
    year: int


@api.post("/payroll/generate")
async def generate_payroll(body: PayrollGenIn, user: dict = Depends(get_current_user)):
    # Don't regenerate if already exists
    existing = await db.payroll.find({"month": body.month, "year": body.year}, {"_id": 0}).to_list(1000)
    if existing:
        return existing
    employees = await db.employees.find({"active": True}, {"_id": 0}).to_list(1000)
    prefix = f"{body.year}-{body.month:02d}"
    att = await db.attendance.find({"date": {"$regex": f"^{prefix}"}}, {"_id": 0}).to_list(5000)
    att_by_emp = {}
    for a in att:
        att_by_emp.setdefault(a["employee_id"], []).append(a)
    result = []
    for e in employees:
        days = len(att_by_emp.get(e["id"], []))
        overtime = sum(a.get("overtime_hours", 0) for a in att_by_emp.get(e["id"], []))
        if e["salary_type"] == "daily":
            gross = e["base_salary"] * days
        elif e["salary_type"] == "weekly":
            gross = e["base_salary"] * max(1, days // 6)
        else:
            gross = e["base_salary"]
        overtime_pay = int(overtime * e.get("overtime_rate", 0))
        gross_total = gross + overtime_pay
        annual = gross_total * 12
        pph21_monthly = calc_pph21(annual) // 12
        net = gross_total - pph21_monthly
        doc = {
            "id": gen_id(), "employee_id": e["id"], "employee_name": e["name"],
            "month": body.month, "year": body.year, "days_worked": days,
            "overtime_hours": overtime, "overtime_pay": overtime_pay,
            "gross_salary": gross_total, "pph21": pph21_monthly,
            "net_salary": net, "paid": False, "created_at": now_iso(),
        }
        await db.payroll.insert_one(doc)
        doc.pop("_id", None)
        result.append(doc)
    return result


@api.get("/payroll")
async def list_payroll(user: dict = Depends(get_current_user), month: Optional[int] = None, year: Optional[int] = None):
    q = {}
    if month:
        q["month"] = month
    if year:
        q["year"] = year
    return await db.payroll.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


class PayPayrollIn(BaseModel):
    amount: Optional[int] = None  # custom amount; default = net_salary
    payment_method: str = "cash"  # cash | transfer | qris
    notes: Optional[str] = ""


@api.post("/payroll/{pid}/pay")
async def pay_payroll(pid: str, body: PayPayrollIn = PayPayrollIn(), user: dict = Depends(get_current_user)):
    pay = await db.payroll.find_one({"id": pid})
    if not pay:
        raise HTTPException(404, "Tidak ditemukan")
    if pay.get("paid"):
        raise HTTPException(400, "Sudah dibayar")
    amount = body.amount if body.amount and body.amount > 0 else pay["net_salary"]
    await db.payroll.update_one(
        {"id": pid},
        {"$set": {
            "paid": True, "paid_date": now_iso(),
            "paid_amount": amount, "payment_method": body.payment_method,
            "payment_notes": body.notes or "",
        }},
    )
    # Expense + journal
    label = f"Gaji {pay['employee_name']} {pay['month']:02d}/{pay['year']}"
    exp_doc = {
        "id": gen_id(), "amount": amount, "category": "Gaji Karyawan",
        "unit": "umum", "notes": label, "payment_method": body.payment_method,
        "date": now_iso(), "created_at": now_iso(),
        "reference": "payroll", "reference_id": pid,
    }
    await db.expenses.insert_one(exp_doc)
    await db.journal_entries.insert_one({
        "id": gen_id(), "date": now_iso(),
        "description": label,
        "lines": [
            {"account": "Gaji Karyawan", "debit": amount, "credit": 0},
            {"account": "Kas", "debit": 0, "credit": amount},
        ],
        "reference": "payroll", "reference_id": pid,
        "unit": "umum", "created_at": now_iso(),
    })
    await write_audit(user, "update", "payroll", pid, {"action": "pay", "amount": amount, "method": body.payment_method})
    return {"ok": True, "amount": amount}


@api.post("/payroll/{pid}/unpay")
async def unpay_payroll(pid: str, user: dict = Depends(require_roles("super_admin", "manager"))):
    """Batalkan status bayar (jika user salah klik). Hapus expense + reverse journal."""
    pay = await db.payroll.find_one({"id": pid})
    if not pay:
        raise HTTPException(404, "Tidak ditemukan")
    if not pay.get("paid"):
        raise HTTPException(400, "Belum dibayar")
    # Remove related expense
    await db.expenses.delete_many({"reference": "payroll", "reference_id": pid})
    await db.payroll.update_one(
        {"id": pid},
        {"$set": {"paid": False}, "$unset": {"paid_date": "", "paid_amount": "", "payment_method": "", "payment_notes": ""}},
    )
    await write_audit(user, "update", "payroll", pid, {"action": "unpay"})
    return {"ok": True}


# ---------- Reminders Dashboard ----------
@api.get("/reminders")
async def reminders(user: dict = Depends(get_current_user)):
    """Daftar to-do/pengingat di Dashboard: gaji belum dibayar, PO tiba blm dibayar, dll."""
    now = datetime.now(timezone.utc)
    items = []

    # 1. Payroll belum dibayar
    unpaid_payroll = await db.payroll.find({"paid": {"$ne": True}}, {"_id": 0}).to_list(500)
    for p in unpaid_payroll:
        items.append({
            "id": f"payroll:{p['id']}",
            "kind": "payroll_unpaid",
            "icon": "users",
            "color": "amber",
            "priority": 2,
            "title": f"Gaji {p['employee_name']} belum dibayar",
            "subtitle": f"Periode {p['month']:02d}/{p['year']} · Net Rp {p['net_salary']:,}",
            "amount": p["net_salary"],
            "action_url": "/karyawan",
            "ref_id": p["id"],
        })

    # 2. PO sudah tiba (stock_received) tapi belum dibayar (payment_status != paid)
    pos = await db.purchase_orders.find(
        {"stock_received": True, "payment_status": {"$ne": "paid"}}, {"_id": 0}
    ).to_list(500)
    for p in pos:
        items.append({
            "id": f"po:{p['id']}",
            "kind": "po_unpaid",
            "icon": "truck",
            "color": "red",
            "priority": 1,
            "title": f"PO {p.get('po_no')} sudah tiba — belum dibayar",
            "subtitle": f"{p.get('supplier_name','')} · Rp {p.get('total',0):,}",
            "amount": p.get("total", 0),
            "action_url": "/pembelian",
            "ref_id": p["id"],
        })

    # 3. Online orders sudah tiba tapi belum dibayar
    onlines = await db.online_orders.find(
        {"stock_received": True, "payment_status": {"$ne": "paid"}}, {"_id": 0}
    ).to_list(500)
    for o in onlines:
        items.append({
            "id": f"online:{o['id']}",
            "kind": "online_unpaid",
            "icon": "package",
            "color": "red",
            "priority": 1,
            "title": f"Order online {o.get('order_number')} tiba — belum dibayar",
            "subtitle": f"{o.get('platform','')} · Rp {o.get('total',0):,}",
            "amount": o.get("total", 0),
            "action_url": "/pembelian",
            "ref_id": o["id"],
        })

    # 4. Bon pelanggan jatuh tempo (umur > 30 hari) belum lunas
    debts = await db.customer_debts.find({"status": {"$ne": "paid"}}, {"_id": 0}).to_list(500)
    for d in debts:
        created = d.get("created_at", "")
        age_days = 0
        if created:
            try:
                age_days = (now - datetime.fromisoformat(created.replace("Z", "+00:00"))).days
            except (ValueError, TypeError):
                pass
        if age_days >= 30:
            items.append({
                "id": f"debt:{d['id']}",
                "kind": "debt_overdue",
                "icon": "clock",
                "color": "amber",
                "priority": 2,
                "title": f"Bon {d['customer_name']} sudah {age_days} hari belum lunas",
                "subtitle": f"Rp {(d['amount']-d.get('paid',0)):,}",
                "amount": d["amount"] - d.get("paid", 0),
                "action_url": "/keuangan",
                "ref_id": d["id"],
            })

    # 5. Stok menipis
    low = await db.inventory_items.find({"$expr": {"$and": [
        {"$gt": ["$min_stock", 0]},
        {"$lte": ["$current_stock", "$min_stock"]},
    ]}}, {"_id": 0}).to_list(50)
    for i in low:
        items.append({
            "id": f"stock:{i['id']}",
            "kind": "low_stock",
            "icon": "package",
            "color": "red",
            "priority": 2,
            "title": f"Stok {i['name']} menipis",
            "subtitle": f"Tersisa {i.get('current_stock',0)} {i.get('unit','')} (min {i.get('min_stock',0)})",
            "amount": 0,
            "action_url": "/inventori",
            "ref_id": i["id"],
        })

    items.sort(key=lambda x: (x["priority"], -x.get("amount", 0)))
    counts = {}
    for it in items:
        counts[it["kind"]] = counts.get(it["kind"], 0) + 1
    return {"items": items, "counts": counts, "total": len(items)}


# ---------- Stock Opname ----------
class OpnameStartIn(BaseModel):
    name: str
    category: Optional[str] = None  # null = all categories


@api.get("/opname/sessions")
async def list_opname(user: dict = Depends(get_current_user)):
    return await db.opname_sessions.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/opname/sessions")
async def start_opname(body: OpnameStartIn, user: dict = Depends(get_current_user)):
    q = {}
    if body.category:
        q["category"] = body.category
    items = await db.inventory_items.find(q, {"_id": 0}).to_list(5000)
    snapshot = [{
        "item_id": i["id"], "name": i["name"], "unit": i["unit"],
        "system_qty": i.get("current_stock", 0), "physical_qty": None,
        "cost_price": i.get("cost_price", 0),
    } for i in items]
    doc = {
        "id": gen_id(), "name": body.name, "category": body.category or "Semua",
        "status": "draft", "items": snapshot,
        "created_by": user["id"], "created_at": now_iso(),
    }
    await db.opname_sessions.insert_one(doc)
    doc.pop("_id", None)
    return doc


class OpnameCountIn(BaseModel):
    counts: dict  # {item_id: physical_qty}


@api.put("/opname/sessions/{sid}/counts")
async def update_counts(sid: str, body: OpnameCountIn, user: dict = Depends(get_current_user)):
    sess = await db.opname_sessions.find_one({"id": sid}, {"_id": 0})
    if not sess:
        raise HTTPException(404, "Sesi tidak ditemukan")
    if sess["status"] == "finalized":
        raise HTTPException(400, "Sudah difinalisasi")
    for it in sess["items"]:
        if it["item_id"] in body.counts:
            it["physical_qty"] = float(body.counts[it["item_id"]])
    await db.opname_sessions.update_one({"id": sid}, {"$set": {"items": sess["items"]}})
    return {"ok": True}


@api.post("/opname/sessions/{sid}/finalize")
async def finalize_opname(sid: str, user: dict = Depends(get_current_user)):
    sess = await db.opname_sessions.find_one({"id": sid}, {"_id": 0})
    if not sess:
        raise HTTPException(404, "Sesi tidak ditemukan")
    if sess["status"] == "finalized":
        raise HTTPException(400, "Sudah difinalisasi")
    total_variance_value = 0
    for it in sess["items"]:
        if it.get("physical_qty") is None:
            continue
        diff = it["physical_qty"] - it["system_qty"]
        if diff != 0:
            await db.inventory_items.update_one(
                {"id": it["item_id"]},
                {"$set": {"current_stock": it["physical_qty"]}}
            )
            await db.stock_movements.insert_one({
                "id": gen_id(), "item_id": it["item_id"], "type": "opname_adjust",
                "quantity": diff, "reason": f"Opname {sess['name']}",
                "created_at": now_iso(),
            })
            total_variance_value += int(diff * it.get("cost_price", 0))
    await db.opname_sessions.update_one(
        {"id": sid},
        {"$set": {"status": "finalized", "finalized_at": now_iso(), "variance_value": total_variance_value}}
    )
    return {"ok": True, "variance_value": total_variance_value}


@api.get("/opname/sessions/{sid}")
async def get_opname(sid: str, user: dict = Depends(get_current_user)):
    sess = await db.opname_sessions.find_one({"id": sid}, {"_id": 0})
    if not sess:
        raise HTTPException(404, "Tidak ditemukan")
    # Compute variance for finalized + draft
    for it in sess["items"]:
        if it.get("physical_qty") is not None:
            it["variance"] = it["physical_qty"] - it["system_qty"]
            it["variance_value"] = int(it["variance"] * it.get("cost_price", 0))
    return sess


# ---------- Bank Import & Reconciliation ----------
class BankRowIn(BaseModel):
    date: str
    description: str
    amount: int  # positive = credit, negative = debit
    reference: Optional[str] = ""


class BankImportIn(BaseModel):
    account_name: str
    rows: List[BankRowIn]


async def _bank_reconcile_candidates_for_amount(amount: int, date_prefix: str = "") -> list:
    """Cari kandidat rekonsiliasi ringan.

    Untuk bon, bank bisa berisi DP awal dan pelunasan terpisah. Karena itu
    pencocokan tidak lagi hanya t.total, tetapi juga cash_collected / debt_payment.
    """
    candidates = []
    debt_ctx = await _load_debt_financial_context()
    trxs = await db.transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    exps = await db.expenses.find({}, {"_id": 0}).sort("date", -1).to_list(5000)
    incomes = await db.incomes.find({}, {"_id": 0}).sort("date", -1).to_list(5000)
    debt_payments = await db.debt_payments.find({}, {"_id": 0}).sort("paid_at", -1).to_list(5000)

    if amount > 0:
        for t in trxs:
            if not _is_financial_sale_transaction(t):
                continue
            row = _enrich_transaction_financial_fields(t, debt_ctx)
            collected = _money(row.get("cash_collected"))
            initial = _money(row.get("initial_paid"), _money(t.get("paid_amount")))
            created = t.get("created_at") or ""
            if (not date_prefix or created.startswith(date_prefix)) and collected == amount:
                candidates.append({"match_type": "transaction", "match_id": t.get("id"), "amount": collected, "date": created, "title": t.get("trx_no"), "description": "Penjualan kasir terkumpul"})
            elif initial and (not date_prefix or created.startswith(date_prefix)) and initial == amount:
                candidates.append({"match_type": "transaction_initial", "match_id": t.get("id"), "amount": initial, "date": created, "title": t.get("trx_no"), "description": "DP awal transaksi bon"})
        for p in debt_payments:
            paid_date = p.get("paid_at") or p.get("created_at") or ""
            if (not date_prefix or paid_date.startswith(date_prefix)) and _money(p.get("amount")) == amount:
                candidates.append({"match_type": "debt_payment", "match_id": p.get("id"), "amount": amount, "date": paid_date, "title": p.get("customer_name") or p.get("debt_id"), "description": "Pelunasan/cicilan bon"})
        for i in incomes:
            d = i.get("date") or i.get("created_at") or ""
            if (not date_prefix or d.startswith(date_prefix)) and _money(i.get("amount")) == amount:
                candidates.append({"match_type": "income", "match_id": i.get("id"), "amount": amount, "date": d, "title": i.get("category"), "description": i.get("source") or "Pemasukan non-kasir"})
    else:
        target = abs(amount)
        for e in exps:
            d = e.get("date") or e.get("created_at") or ""
            if (not date_prefix or d.startswith(date_prefix)) and _money(e.get("amount")) == target:
                candidates.append({"match_type": "expense", "match_id": e.get("id"), "amount": -target, "date": d, "title": e.get("category"), "description": e.get("notes") or "Pengeluaran"})

    # Hindari list terlalu panjang; kandidat amount+tanggal paling relevan dulu.
    return candidates[:20]


@api.post("/bank/import")
async def import_bank(body: BankImportIn, user: dict = Depends(get_current_user)):
    imported = []
    for r in body.rows:
        amt = r.amount
        date_prefix = r.date[:10]
        cands = await _bank_reconcile_candidates_for_amount(amt, date_prefix)
        match_id = cands[0]["match_id"] if cands else None
        match_type = cands[0]["match_type"] if cands else None
        doc = {
            "id": gen_id(), "account_name": body.account_name,
            "date": r.date, "description": r.description, "amount": amt,
            "reference": r.reference, "matched": bool(match_id),
            "match_id": match_id, "match_type": match_type,
            "candidate_count": len(cands),
            "imported_at": now_iso(),
        }
        await db.bank_transactions.insert_one(doc)
        doc.pop("_id", None)
        imported.append(doc)
    matched = sum(1 for d in imported if d["matched"])
    return {"imported": len(imported), "matched": matched, "unmatched": len(imported) - matched, "rows": imported}


@api.get("/bank/transactions")
async def list_bank_tx(user: dict = Depends(get_current_user)):
    return await db.bank_transactions.find({}, {"_id": 0}).sort("date", -1).to_list(5000)




@api.get("/bank/transactions/{bid}/candidates")
async def bank_candidates(bid: str, user: dict = Depends(get_current_user)):
    b = await db.bank_transactions.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Mutasi bank tidak ditemukan")
    return await _bank_reconcile_candidates_for_amount(_money(b.get("amount")), (b.get("date") or "")[:10])


class BankReconcileIn(BaseModel):
    match_type: str  # transaction | expense | manual
    match_id: Optional[str] = None


@api.put("/bank/transactions/{bid}/reconcile")
async def reconcile_bank(bid: str, body: BankReconcileIn, user: dict = Depends(get_current_user)):
    await db.bank_transactions.update_one(
        {"id": bid},
        {"$set": {"matched": True, "match_type": body.match_type, "match_id": body.match_id, "reconciled_at": now_iso()}}
    )
    return {"ok": True}


# ---------- Onboarding ----------
@api.get("/onboarding/status")
async def onboarding_status(user: dict = Depends(get_current_user)):
    s = await db.settings.find_one({}, {"_id": 0})
    investors = await db.investors.count_documents({})
    inventory = await db.inventory_items.count_documents({})
    tables = await db.tables.count_documents({})
    employees = await db.employees.count_documents({})
    return {
        "completed": bool(s and s.get("onboarding_completed")),
        "checklist": {
            "business_profile": bool(s and s.get("business_name") and s.get("business_name") != "AgriWarung Boyolali"),
            "investors": investors >= 2,
            "inventory": inventory > 0,
            "tables": tables > 0,
            "employees": employees > 0,
        }
    }


class OnboardingCompleteIn(BaseModel):
    business_name: str
    address: Optional[str] = ""
    phone: Optional[str] = ""


@api.post("/onboarding/complete")
async def complete_onboarding(body: OnboardingCompleteIn, user: dict = Depends(get_current_user)):
    await db.settings.update_one(
        {},
        {"$set": {
            "business_name": body.business_name,
            "address": body.address, "phone": body.phone,
            "onboarding_completed": True,
            "completed_at": now_iso(),
        }},
        upsert=True,
    )
    return {"ok": True}


# ---------- Business Units ----------
class BizUnitIn(BaseModel):
    code: str  # slug e.g. warung, anggur, custom_xx
    name: str
    receipt_name: Optional[str] = ""  # Custom name printed on struk; defaults to `name` if empty
    receipt_address: Optional[str] = ""
    receipt_phone: Optional[str] = ""
    receipt_footer: Optional[str] = ""
    receipt_note: Optional[str] = ""
    receipt_logo: Optional[str] = ""
    receipt_show_qr: bool = True
    description: Optional[str] = ""
    icon: Optional[str] = ""
    color: Optional[str] = "#1a6b3c"
    active: bool = True
    auto_batch_enabled: bool = True
    batch_on_purchase: bool = True
    batch_on_production: bool = False
    batch_on_harvest: bool = True
    batch_on_farm: bool = True


@api.get("/business-units")
async def list_units(user: dict = Depends(get_current_user)):
    units = await db.business_units.find({}, {"_id": 0}).to_list(200)
    if not units:
        # Seed defaults
        defaults = [
            {"code": "warung", "name": "Warung Makan", "color": "#ea580c", "icon": "utensils", "batch_on_production": False, "batch_on_harvest": False},
            {"code": "anggur", "name": "Kebun", "color": "#6b46c1", "icon": "sprout", "batch_on_production": True, "batch_on_harvest": True},
            {"code": "pupuk", "name": "Produksi Pupuk", "color": "#b45309", "icon": "beaker", "batch_on_production": True, "batch_on_harvest": False},
            {"code": "peternakan", "name": "Peternakan", "color": "#0891b2", "icon": "activity", "batch_on_production": True, "batch_on_harvest": True},
            {"code": "pembibitan", "name": "Pembibitan", "color": "#059669", "icon": "sprout", "batch_on_production": True, "batch_on_harvest": True},
            {"code": "gudang", "name": "Gudang", "color": "#2563eb", "icon": "warehouse", "batch_on_production": False, "batch_on_harvest": False},
        ]
        for d in defaults:
            await insert_doc("business_units", {**d, "active": True})
        units = await db.business_units.find({}, {"_id": 0}).to_list(200)
    return units


@api.post("/business-units")
async def create_unit(body: BizUnitIn, user: dict = Depends(get_current_user)):
    existing = await db.business_units.find_one({"code": body.code})
    if existing:
        raise HTTPException(400, "Kode unit sudah ada")
    doc = await insert_doc("business_units", body.model_dump())
    await broadcast_event("bizunit_updated", {"action": "create", "code": body.code})
    return doc


@api.put("/business-units/{uid}")
async def update_unit(uid: str, body: dict, user: dict = Depends(get_current_user)):
    body.pop("_id", None)
    body.pop("id", None)
    await db.business_units.update_one({"id": uid}, {"$set": body})
    doc = await db.business_units.find_one({"id": uid}, {"_id": 0})
    await broadcast_event("bizunit_updated", {"action": "update", "id": uid})
    return doc


@api.delete("/business-units/{uid}")
async def delete_unit(uid: str, user: dict = Depends(get_current_user)):
    u = await db.business_units.find_one({"id": uid})
    if not u:
        raise HTTPException(404, "Tidak ditemukan")
    if u["code"] in ("warung", "anggur", "pupuk", "peternakan", "pembibitan", "gudang"):
        raise HTTPException(400, "Unit default tidak bisa dihapus")
    await db.business_units.delete_one({"id": uid})
    return {"ok": True}


# Per-unit investor allocation report
@api.get("/investors/allocations")
async def investor_allocations(user: dict = Depends(get_current_user)):
    """Returns: { unit_code: [{investor_id, name, capital, ownership_pct}] }"""
    injections = await db.capital_injections.find({}, {"_id": 0}).to_list(5000)
    investors = await db.investors.find({}, {"_id": 0}).to_list(500)
    inv_by_id = {i["id"]: i for i in investors}
    # group injections by (investor_id, unit)
    by_unit = {}
    for ij in injections:
        u = ij.get("unit", "umum")
        by_unit.setdefault(u, {})
        by_unit[u][ij["investor_id"]] = by_unit[u].get(ij["investor_id"], 0) + ij.get("amount", 0)
    result = {}
    for unit, m in by_unit.items():
        total = sum(m.values())
        rows = []
        for inv_id, amt in m.items():
            inv = inv_by_id.get(inv_id, {})
            rows.append({
                "investor_id": inv_id,
                "name": inv.get("name", "—"),
                "capital": amt,
                "ownership_pct": (amt / total * 100) if total else 0,
            })
        rows.sort(key=lambda x: -x["capital"])
        result[unit] = {"total_capital": total, "investors": rows}
    return result


# Dividend calc per unit
class DividendUnitIn(BaseModel):
    unit: str  # 'all' or unit_code
    month: int
    year: int
    total_profit: int


@api.post("/dividends/calculate-by-unit")
async def calc_dividend_unit(body: DividendUnitIn, user: dict = Depends(get_current_user)):
    allocs = await investor_allocations(user)
    if body.unit == "all":
        # Consolidated: use overall ownership across all units
        injections = await db.capital_injections.find({}, {"_id": 0}).to_list(5000)
        total_all = sum(i.get("amount", 0) for i in injections)
        per_inv = {}
        for ij in injections:
            per_inv[ij["investor_id"]] = per_inv.get(ij["investor_id"], 0) + ij.get("amount", 0)
        investors = await db.investors.find({}, {"_id": 0}).to_list(500)
        inv_by_id = {i["id"]: i for i in investors}
        items = []
        for inv_id, cap in per_inv.items():
            pct = (cap / total_all * 100) if total_all else 0
            items.append({
                "investor_id": inv_id, "investor_name": inv_by_id.get(inv_id, {}).get("name", "—"),
                "ownership_pct": pct, "share": int(body.total_profit * pct / 100),
            })
        return {"unit": "all", "items": items, "total_profit": body.total_profit}
    # Per-unit
    unit_data = allocs.get(body.unit, {"investors": []})
    items = [{
        "investor_id": r["investor_id"], "investor_name": r["name"],
        "ownership_pct": r["ownership_pct"],
        "share": int(body.total_profit * r["ownership_pct"] / 100),
    } for r in unit_data["investors"]]
    return {"unit": body.unit, "items": items, "total_profit": body.total_profit}


# ---------- Promo & Discount Engine ----------
class PromoIn(BaseModel):
    name: str
    code: Optional[str] = ""  # promo code; empty = always-on
    discount_type: str = "percentage"  # percentage | fixed
    discount_value: int = 0  # for percentage: 0-100, for fixed: rupiah
    scope: str = "total"  # total | item | category
    target_ids: List[str] = []  # item_ids or category names
    min_purchase: int = 0
    max_discount: int = 0  # cap for percentage; 0 = no cap
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    max_uses: int = 0  # 0 = unlimited
    used_count: int = 0
    active: bool = True


@api.get("/promos")
async def list_promos(user: dict = Depends(get_current_user)):
    return await list_collection("promos")


@api.post("/promos")
async def create_promo(body: PromoIn, user: dict = Depends(get_current_user)):
    data = body.model_dump()
    if data["code"]:
        data["code"] = data["code"].upper().strip()
        existing = await db.promos.find_one({"code": data["code"]})
        if existing:
            raise HTTPException(400, "Kode promo sudah ada")
    return await insert_doc("promos", data)


@api.delete("/promos/{pid}")
async def delete_promo(pid: str, user: dict = Depends(get_current_user)):
    await db.promos.delete_one({"id": pid})
    return {"ok": True}


@api.put("/promos/{pid}")
async def update_promo(pid: str, body: dict, user: dict = Depends(get_current_user)):
    body.pop("_id", None)
    body.pop("id", None)
    await db.promos.update_one({"id": pid}, {"$set": body})
    return await db.promos.find_one({"id": pid}, {"_id": 0})


class PromoApplyIn(BaseModel):
    code: str
    items: List[dict]  # [{item_id, quantity, unit_price, category}]


@api.post("/promos/apply")
async def apply_promo(body: PromoApplyIn, user: dict = Depends(get_current_user)):
    code = body.code.upper().strip()
    promo = await db.promos.find_one({"code": code, "active": True}, {"_id": 0})
    if not promo:
        raise HTTPException(404, "Kode promo tidak valid")
    today = now_iso()
    if promo.get("start_date") and today < promo["start_date"]:
        raise HTTPException(400, "Promo belum berlaku")
    if promo.get("end_date") and today > promo["end_date"]:
        raise HTTPException(400, "Promo sudah berakhir")
    if promo.get("max_uses") and promo.get("used_count", 0) >= promo["max_uses"]:
        raise HTTPException(400, "Promo sudah habis terpakai")
    subtotal = sum(it["quantity"] * it["unit_price"] for it in body.items)
    if subtotal < promo.get("min_purchase", 0):
        raise HTTPException(400, f"Minimal pembelian {promo['min_purchase']}")
    # Compute discount
    discount = 0
    if promo["scope"] == "total":
        if promo["discount_type"] == "percentage":
            discount = int(subtotal * promo["discount_value"] / 100)
        else:
            discount = promo["discount_value"]
    elif promo["scope"] == "item":
        for it in body.items:
            if it.get("item_id") in promo.get("target_ids", []):
                base = it["quantity"] * it["unit_price"]
                if promo["discount_type"] == "percentage":
                    discount += int(base * promo["discount_value"] / 100)
                else:
                    discount += promo["discount_value"] * it["quantity"]
    elif promo["scope"] == "category":
        for it in body.items:
            if it.get("category") in promo.get("target_ids", []):
                base = it["quantity"] * it["unit_price"]
                if promo["discount_type"] == "percentage":
                    discount += int(base * promo["discount_value"] / 100)
                else:
                    discount += promo["discount_value"] * it["quantity"]
    # Cap
    if promo.get("max_discount") and discount > promo["max_discount"]:
        discount = promo["max_discount"]
    discount = min(discount, subtotal)
    return {"promo_id": promo["id"], "promo_name": promo["name"], "discount": discount, "subtotal": subtotal}


# ---------- User Management ----------
class UserUpdateIn(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    active: Optional[bool] = None


@api.put("/users/{uid}")
async def update_user(uid: str, body: UserUpdateIn, user: dict = Depends(require_roles("super_admin"))):
    update = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if "phone" in update:
        update["phone"] = normalize_phone(update.get("phone"))
        update["phone_verified"] = bool(update["phone"])
    if not update:
        raise HTTPException(400, "Tidak ada field untuk diupdate")
    await db.users.update_one({"id": uid}, {"$set": update})
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})


@api.delete("/users/{uid}")
async def delete_user(uid: str, user: dict = Depends(require_roles("super_admin"))):
    if uid == user["id"]:
        raise HTTPException(400, "Tidak bisa hapus diri sendiri")
    target = await db.users.find_one({"id": uid})
    if target and target.get("role") == "super_admin":
        count = await db.users.count_documents({"role": "super_admin", "active": True})
        if count <= 1:
            raise HTTPException(400, "Minimal 1 super admin aktif harus tersisa")
    await db.users.delete_one({"id": uid})
    return {"ok": True}


class ResetPasswordIn(BaseModel):
    new_password: str


@api.post("/users/{uid}/reset-password")
async def reset_password(uid: str, body: ResetPasswordIn, user: dict = Depends(require_roles("super_admin"))):
    if len(body.new_password) < 6:
        raise HTTPException(400, "Password minimal 6 karakter")
    await db.users.update_one({"id": uid}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await write_audit(user, "reset_password", "user", uid, {"method": "super_admin"})
    await write_notification("SECURITY", "Super Admin reset password", f"Password user berhasil direset oleh {user.get('name')}", ref_type="user", ref_id=uid, priority="high")
    return {"ok": True}


# ---------- Self Profile (any logged-in user) ----------
class SelfProfileIn(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None


@api.put("/auth/me")
async def update_my_profile(body: SelfProfileIn, user: dict = Depends(get_current_user)):
    update = {}
    if body.name is not None and body.name.strip():
        update["name"] = body.name.strip()
    if body.email is not None and body.email.strip():
        new_email = body.email.lower().strip()
        if new_email != user.get("email"):
            existing = await db.users.find_one({"email": new_email, "id": {"$ne": user["id"]}})
            if existing:
                raise HTTPException(400, "Email sudah dipakai user lain")
            update["email"] = new_email
    if not update:
        raise HTTPException(400, "Tidak ada perubahan")
    await db.users.update_one({"id": user["id"]}, {"$set": update})
    return await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


@api.post("/auth/change-password")
async def change_my_password(body: ChangePasswordIn, response: Response, user: dict = Depends(get_current_user)):
    if len(body.new_password) < 6:
        raise HTTPException(400, "Password baru minimal 6 karakter")
    db_user = await db.users.find_one({"id": user["id"]})
    if not db_user or not verify_password(body.current_password, db_user["password_hash"]):
        raise HTTPException(401, "Password lama salah")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    # Issue fresh token so session stays valid
    token = create_access_token(user["id"], user["email"], user["role"])
    response.set_cookie(
        key="access_token", value=token, httponly=True,
        secure=False, samesite="lax", max_age=604800, path="/",
    )
    return {"ok": True, "token": token}


# ---------- System: Reset Demo Data (Super Admin only) ----------
class ResetDataIn(BaseModel):
    confirm: str  # must equal "RESET" to proceed
    keep_business_units: bool = True
    keep_branches: bool = True
    keep_business_profile: bool = True


# Module → list of collections to wipe
MODULE_COLLECTIONS = {
    "inventori":  ["inventory_items", "bom_recipes", "stock_movements"],
    "pembelian":  ["purchase_orders", "online_orders", "suppliers"],
    "keuangan":   ["transactions", "expenses", "incomes", "customer_debts",
                   "journal_entries", "bank_transactions", "bank_accounts"],
    "kasir":      ["transactions", "orders", "customer_debts"],
    "warung":     ["tables", "orders"],
    "karyawan":   ["employees", "attendance", "payroll"],
    "members":    ["members", "loyalty_settings"],
    "anggur":     ["vineyard_plots", "vineyard_harvests", "b2b_customers", "b2b_invoices"],
    "pupuk":      ["production_batches"],
    "investor":   ["investors", "capital_injections", "dividends", "land_rental"],
    "promo":      ["promos"],
    "audit":      ["audit_logs"],
    "opname":     ["opname_sessions"],
}


class ResetTransactionFinanceIn(BaseModel):
    confirm: str


@api.post("/system/reset-transaction-finance-data")
async def reset_transaction_finance_data(body: ResetTransactionFinanceIn, user: dict = Depends(require_roles("super_admin"))):
    """Reset transaksi/keuangan dinonaktifkan agar tidak ada risiko data hilang massal."""
    raise HTTPException(410, "Reset transaksi & keuangan dinonaktifkan. Gunakan edit/hapus per item dari menu masing-masing.")


@api.post("/system/reset-module/{module}")
async def reset_module(module: str, user: dict = Depends(require_roles("super_admin"))):
    """Reset massal permanen dinonaktifkan. Tidak ada kode penghapus tersembunyi di endpoint ini."""
    raise HTTPException(410, "Reset data massal dinonaktifkan permanen. Hapus/edit data satu per satu dari menu masing-masing.")


@api.post("/system/reset-data")
async def reset_demo_data(body: ResetDataIn, user: dict = Depends(require_roles("super_admin"))):
    """Reset data demo permanen dinonaktifkan untuk keamanan data produksi."""
    raise HTTPException(410, "Reset data demo dinonaktifkan permanen. Hapus/edit data satu per satu dari menu masing-masing.")



@api.get("/system/integration-health")
async def integration_health(user: dict = Depends(get_current_user)):
    """Ringkasan cepat untuk mengecek integrasi modul tanpa membuka semua menu satu per satu."""
    collections = [
        "transactions", "customer_debts", "debt_payments", "inventory_items", "stock_movements",
        "purchase_orders", "online_orders", "suppliers", "vineyard_plots", "vineyard_harvests",
        "employees", "payroll", "opname_sessions", "expenses", "incomes", "audit_logs",
    ]
    counts = {}
    for c in collections:
        try:
            counts[c] = await db[c].count_documents({})
        except Exception:
            counts[c] = 0
    summary = await _build_unified_finance_summary(limit=200)
    warnings = []
    if counts.get("transactions", 0) and summary.get("totals", {}).get("pos_income", 0) == 0:
        warnings.append("Ada transaksi kasir, tetapi pemasukan kasir masih 0. Cek transaksi bon/settlement lama.")
    open_debt = summary.get("totals", {}).get("debt", 0)
    if open_debt < 0:
        warnings.append("Piutang bon negatif. Data bon perlu dicek.")
    return {"ok": True, "counts": counts, "finance_totals": summary.get("totals", {}), "warnings": warnings}


# ---------- Delete endpoints for PO / Online order / Expense ----------
@api.delete("/purchase-orders/{po_id}")
async def delete_purchase_order(po_id: str, user: dict = Depends(require_roles("super_admin", "manager"))):
    po = await db.purchase_orders.find_one({"id": po_id})
    if not po:
        raise HTTPException(404, "PO tidak ditemukan")
    # If stock had been received, reverse the stock increase
    if po.get("stock_received"):
        for it in po.get("items", []):
            inv = await db.inventory_items.find_one({"id": it.get("item_id")}) if it.get("item_id") else None
            if not inv and it.get("name"):
                inv = await db.inventory_items.find_one({"name": it["name"]})
            if inv:
                await db.inventory_items.update_one(
                    {"id": inv["id"]},
                    {"$inc": {"current_stock": -it.get("quantity", 0)}},
                )
                await db.stock_movements.insert_one({
                    "id": gen_id(), "item_id": inv["id"], "type": "po_delete_reverse",
                    "quantity": -it.get("quantity", 0),
                    "reason": f"Hapus PO {po.get('po_no', po_id)}",
                    "created_at": now_iso(),
                })
    # Delete purchase payment records and related expense/journal rows for this PO only
    pay_ids = [x["id"] for x in await db.purchase_payments.find({"kind": "po", "purchase_id": po_id}, {"_id": 0, "id": 1}).to_list(500)]
    await db.expenses.delete_many({"$or": [{"reference": "po", "reference_id": po_id}, {"purchase_id": po_id}]})
    await db.journal_entries.delete_many({"$or": [{"reference": "po", "reference_id": po_id}, {"reference": "po_payment", "reference_id": {"$in": pay_ids}}]})
    await db.purchase_payments.delete_many({"kind": "po", "purchase_id": po_id})
    await db.purchase_orders.delete_one({"id": po_id})
    await write_audit(user, "delete", "purchase_order", po_id, {"po_no": po.get("po_no")})
    return {"ok": True, "reversed_stock": bool(po.get("stock_received")), "reversed_expense": bool(po.get("expense_recorded"))}


@api.delete("/online-orders/{oid}")
async def delete_online_order(oid: str, user: dict = Depends(require_roles("super_admin", "manager"))):
    o = await db.online_orders.find_one({"id": oid})
    if not o:
        raise HTTPException(404, "Order tidak ditemukan")
    if o.get("stock_received"):
        for it in o.get("items", []):
            inv = await db.inventory_items.find_one({"id": it.get("item_id")}) if it.get("item_id") else None
            if not inv and it.get("name"):
                inv = await db.inventory_items.find_one({"name": it["name"]})
            if inv:
                await db.inventory_items.update_one(
                    {"id": inv["id"]},
                    {"$inc": {"current_stock": -it.get("quantity", 0)}},
                )
                await db.stock_movements.insert_one({
                    "id": gen_id(), "item_id": inv["id"], "type": "online_delete_reverse",
                    "quantity": -it.get("quantity", 0),
                    "reason": f"Hapus Online {o.get('order_number', oid)}",
                    "created_at": now_iso(),
                })
    pay_ids = [x["id"] for x in await db.purchase_payments.find({"kind": "online", "purchase_id": oid}, {"_id": 0, "id": 1}).to_list(500)]
    await db.expenses.delete_many({"$or": [{"reference": "online", "reference_id": oid}, {"purchase_id": oid}]})
    await db.journal_entries.delete_many({"$or": [{"reference": "online", "reference_id": oid}, {"reference": "online_payment", "reference_id": {"$in": pay_ids}}]})
    await db.purchase_payments.delete_many({"kind": "online", "purchase_id": oid})
    await db.online_orders.delete_one({"id": oid})
    await write_audit(user, "delete", "online_order", oid, {"order_number": o.get("order_number")})
    return {"ok": True}


@api.delete("/expenses/{eid}")
async def delete_expense(eid: str, user: dict = Depends(require_roles("super_admin", "manager"))):
    exp = await db.expenses.find_one({"id": eid}, {"_id": 0})
    if not exp:
        raise HTTPException(404, "Pengeluaran tidak ditemukan")
    ref = (exp.get("reference") or "").strip()
    if ref in ("dividend_distribution", "dividend"):
        dividend_id = exp.get("reference_id")
        if dividend_id:
            await db.dividends.delete_many({"id": dividend_id})
            await db.journal_entries.delete_many({"reference": {"$in": ["dividend_distribution", "dividend"]}, "reference_id": dividend_id})
        await db.expenses.delete_one({"id": eid})
        invalidate_finance_summary_cache()
        await write_audit(user, "delete", "dividend_expense", eid, {"dividend_id": dividend_id, "amount": exp.get("amount")})
        return {"ok": True, "deleted_id": eid, "dividend_deleted": dividend_id}
    if ref and ref not in ("expense", "manual", "manual_expense"):
        raise HTTPException(400, "Pengeluaran ini berasal dari modul lain. Hapus dari modul asalnya agar laporan tetap sinkron.")
    await db.journal_entries.delete_many({"reference": "expense", "reference_id": eid})
    # Reverse journal: Debit Kas / Credit (category) untuk audit kas.
    await db.journal_entries.insert_one({
        "id": gen_id(), "date": now_iso(),
        "description": f"Pembatalan biaya {exp.get('category', '')}",
        "lines": [
            {"account": "Kas", "debit": exp.get("amount", 0), "credit": 0},
            {"account": exp.get("category", "Lain-lain"), "debit": 0, "credit": exp.get("amount", 0)},
        ],
        "reference": "expense_void", "reference_id": eid,
        "unit": exp.get("unit", "umum"), "created_at": now_iso(),
    })
    await db.expenses.delete_one({"id": eid})
    invalidate_finance_summary_cache()
    await write_audit(user, "delete", "expense", eid, {"amount": exp.get("amount"), "category": exp.get("category")})
    return {"ok": True}


# ---------- WhatsApp Notification Generators ----------
def format_rp_id(n: int) -> str:
    s = str(abs(int(n)))
    parts = []
    while len(s) > 3:
        parts.insert(0, s[-3:])
        s = s[:-3]
    if s:
        parts.insert(0, s)
    return "Rp " + ".".join(parts)


@api.get("/notifications/wa/low-stock")
async def wa_low_stock(user: dict = Depends(get_current_user)):
    items = await db.inventory_items.find({}, {"_id": 0}).to_list(2000)
    low = [i for i in items if i.get("current_stock", 0) <= i.get("min_stock", 0) and i.get("min_stock", 0) > 0]
    if not low:
        return {"text": "✅ Semua stok aman, tidak ada item di bawah minimum.", "count": 0}
    lines = ["⚠️ *PERINGATAN STOK MENIPIS — AgriWarung*", ""]
    for i in low[:20]:
        lines.append(f"• {i['name']}: *{i['current_stock']} {i['unit']}* (min: {i.get('min_stock', 0)})")
    if len(low) > 20:
        lines.append(f"...dan {len(low) - 20} item lainnya")
    lines.append("")
    lines.append("_Segera lakukan restock untuk hindari kekosongan._")
    return {"text": "\n".join(lines), "count": len(low)}


@api.get("/notifications/wa/daily-summary")
async def wa_daily_summary(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    trxs = await db.transactions.find({}, {"_id": 0}).to_list(5000)
    exps = await db.expenses.find({}, {"_id": 0}).to_list(5000)
    incs = await db.incomes.find({}, {"_id": 0}).to_list(5000)
    # Exclude cancelled & bon (not yet collected) from POS revenue
    today_trx = [t for t in trxs if (t.get("created_at") or "").startswith(today) and not t.get("cancelled") and not t.get("is_bon")]
    today_all_trx = [t for t in trxs if (t.get("created_at") or "").startswith(today)]
    today_exp = [e for e in exps if (e.get("date") or "").startswith(today)]
    today_inc = [i for i in incs if (i.get("date") or "").startswith(today)]
    revenue_pos = sum(t.get("total", 0) for t in today_trx)
    other_income = sum(i.get("amount", 0) for i in today_inc)
    revenue_total = revenue_pos + other_income
    expense = sum(e.get("amount", 0) for e in today_exp)
    net_profit = revenue_total - expense
    by_unit = {}
    for t in today_trx:
        u = t.get("unit", "warung")
        by_unit[u] = by_unit.get(u, 0) + t.get("total", 0)
    by_pay = {}
    for t in today_trx:
        p = t.get("payment_method", "cash")
        by_pay[p] = by_pay.get(p, 0) + t.get("total", 0)
    profit_label = "📈 Laba Bersih" if net_profit >= 0 else "📉 Rugi Bersih"
    profit_val = format_rp_id(net_profit) if net_profit >= 0 else f"-{format_rp_id(abs(net_profit))}"
    lines = [
        "📊 *RINGKASAN HARIAN — AgriWarung*",
        f"_{datetime.now().strftime('%A, %d %B %Y')}_",
        "",
        f"💰 Pendapatan Kasir: *{format_rp_id(revenue_pos)}*",
    ]
    if other_income > 0:
        lines.append(f"➕ Pemasukan Lain: *{format_rp_id(other_income)}*")
        lines.append(f"📊 Total Revenue: *{format_rp_id(revenue_total)}*")
    lines += [
        f"💸 Pengeluaran: *{format_rp_id(expense)}*",
        f"{profit_label}: *{profit_val}*",
        f"🧾 Transaksi: *{len(today_trx)}* (dari {len(today_all_trx)} total — {len([t for t in today_all_trx if t.get('cancelled')])} dibatalkan, {len([t for t in today_all_trx if t.get('is_bon')])} bon)",
        "",
    ]
    if by_unit:
        lines.append("*Per Unit Bisnis:*")
        for u, v in by_unit.items():
            lines.append(f"• {u.capitalize()}: {format_rp_id(v)}")
        lines.append("")
    if by_pay:
        lines.append("*Per Metode Bayar:*")
        for p, v in by_pay.items():
            lines.append(f"• {p.upper()}: {format_rp_id(v)}")
    return {"text": "\n".join(lines), "revenue": revenue_total, "expense": expense, "net_profit": net_profit, "tx_count": len(today_trx)}


@api.get("/notifications/wa/payroll-alert")
async def wa_payroll_alert(user: dict = Depends(get_current_user)):
    now = datetime.now()
    month, year = now.month, now.year
    payroll = await db.payroll.find({"month": month, "year": year}, {"_id": 0}).to_list(1000)
    unpaid = [p for p in payroll if not p.get("paid")]
    if not payroll:
        return {"text": f"⚠️ Penggajian *{month}/{year}* belum dihitung. Buka menu Karyawan & HR untuk generate.", "count": 0}
    if not unpaid:
        return {"text": f"✅ Semua gaji bulan *{month}/{year}* sudah dibayar ({len(payroll)} karyawan).", "count": 0}
    total = sum(p.get("net_salary", 0) for p in unpaid)
    lines = [
        f"💼 *PENGGAJIAN BELUM DIBAYAR — {month}/{year}*",
        "",
        f"Jumlah karyawan: *{len(unpaid)}*",
        f"Total gaji: *{format_rp_id(total)}*",
        "",
        "Detail karyawan:",
    ]
    for p in unpaid[:15]:
        lines.append(f"• {p['employee_name']}: {format_rp_id(p['net_salary'])}")
    if len(unpaid) > 15:
        lines.append(f"...dan {len(unpaid) - 15} lainnya")
    return {"text": "\n".join(lines), "count": len(unpaid), "total": total}


# ---------- WhatsApp Notification Templates (Custom) ----------
class WaTemplateIn(BaseModel):
    title: str
    body: str  # supports {today}, {revenue}, {expense}, {net_profit}, {tx_count}, {time}
    icon: Optional[str] = "💬"
    enabled: bool = True
    recipient_phone: Optional[str] = ""


def _render_wa_template(body: str, ctx: dict) -> str:
    out = body or ""
    for k, v in ctx.items():
        out = out.replace("{" + k + "}", str(v))
    return out


@api.get("/notifications/wa/templates")
async def list_wa_templates(user: dict = Depends(get_current_user)):
    items = await db.wa_templates.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return items


@api.post("/notifications/wa/templates")
async def create_wa_template(body: WaTemplateIn, user: dict = Depends(get_current_user)):
    doc = await insert_doc("wa_templates", body.model_dump())
    return doc


@api.put("/notifications/wa/templates/{tid}")
async def update_wa_template(tid: str, body: dict, user: dict = Depends(get_current_user)):
    body.pop("_id", None)
    body.pop("id", None)
    await db.wa_templates.update_one({"id": tid}, {"$set": body})
    return await db.wa_templates.find_one({"id": tid}, {"_id": 0})


@api.delete("/notifications/wa/templates/{tid}")
async def delete_wa_template(tid: str, user: dict = Depends(get_current_user)):
    await db.wa_templates.delete_one({"id": tid})
    return {"ok": True}


@api.get("/notifications/wa/templates/{tid}/preview")
async def preview_wa_template(tid: str, user: dict = Depends(get_current_user)):
    tpl = await db.wa_templates.find_one({"id": tid}, {"_id": 0})
    if not tpl:
        raise HTTPException(404, "Template tidak ditemukan")
    # Build context from today's summary
    today = datetime.now(timezone.utc).date().isoformat()
    trxs = await db.transactions.find({}, {"_id": 0}).to_list(5000)
    exps = await db.expenses.find({}, {"_id": 0}).to_list(5000)
    incs = await db.incomes.find({}, {"_id": 0}).to_list(5000)
    today_trx = [t for t in trxs if (t.get("created_at") or "").startswith(today) and not t.get("cancelled") and not t.get("is_bon")]
    today_exp = [e for e in exps if (e.get("date") or "").startswith(today)]
    today_inc = [i for i in incs if (i.get("date") or "").startswith(today)]
    rev = sum(t.get("total", 0) for t in today_trx) + sum(i.get("amount", 0) for i in today_inc)
    expense = sum(e.get("amount", 0) for e in today_exp)
    ctx = {
        "today": datetime.now().strftime("%d %B %Y"),
        "time": datetime.now().strftime("%H:%M"),
        "revenue": format_rp_id(rev),
        "expense": format_rp_id(expense),
        "net_profit": format_rp_id(rev - expense) if rev - expense >= 0 else f"-{format_rp_id(abs(rev - expense))}",
        "tx_count": len(today_trx),
    }
    return {"text": _render_wa_template(tpl["body"], ctx), "ctx": ctx}


@api.get("/notifications/settings")
async def get_notif_settings(user: dict = Depends(get_current_user)):
    s = await db.notification_settings.find_one({}, {"_id": 0})
    return s or {"recipient_phone": "", "low_stock_alerts": True, "daily_summary": True, "payroll_alerts": True}


@api.put("/notifications/settings")
async def update_notif_settings(body: dict, user: dict = Depends(get_current_user)):
    body.pop("_id", None)
    body.pop("id", None)
    await db.notification_settings.update_one({}, {"$set": body}, upsert=True)
    return await get_notif_settings(user)


# ---------- Branches (Multi-Cabang) ----------
class BranchIn(BaseModel):
    code: str
    name: str
    address: Optional[str] = ""
    phone: Optional[str] = ""
    manager: Optional[str] = ""
    active: bool = True


@api.get("/branches")
async def list_branches(user: dict = Depends(get_current_user)):
    branches = await list_collection("branches")
    if not branches:
        default = {"code": "main", "name": "Cabang Utama", "address": "Boyolali", "active": True}
        await insert_doc("branches", default)
        branches = await list_collection("branches")
    # Compute stats per branch
    for b in branches:
        b["tx_count"] = await db.transactions.count_documents({"branch_id": b["id"]})
        revenue_agg = await db.transactions.aggregate([
            {"$match": {"branch_id": b["id"], "is_bon": {"$ne": True}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}}},
        ]).to_list(1)
        b["total_revenue"] = revenue_agg[0]["total"] if revenue_agg else 0
    return branches


@api.post("/branches")
async def create_branch(body: BranchIn, user: dict = Depends(require_roles("super_admin"))):
    if await db.branches.find_one({"code": body.code}):
        raise HTTPException(400, "Kode cabang sudah ada")
    return await insert_doc("branches", body.model_dump())


@api.put("/branches/{bid}")
async def update_branch(bid: str, body: dict, user: dict = Depends(require_roles("super_admin"))):
    body.pop("_id", None)
    body.pop("id", None)
    await db.branches.update_one({"id": bid}, {"$set": body})
    return await db.branches.find_one({"id": bid}, {"_id": 0})


@api.delete("/branches/{bid}")
async def delete_branch(bid: str, user: dict = Depends(require_roles("super_admin"))):
    b = await db.branches.find_one({"id": bid})
    if not b:
        raise HTTPException(404, "Tidak ditemukan")
    if b["code"] == "main":
        raise HTTPException(400, "Cabang utama tidak bisa dihapus")
    await db.branches.delete_one({"id": bid})
    return {"ok": True}




# ---------- AI / Smart Insights ----------
def _simple_inventory_insights(items: list, tx: list) -> list:
    sold = {}
    for t in tx:
        if t.get("cancelled") or (t.get("transaction_type") or "SALE") != "SALE":
            continue
        for it in t.get("items", []):
            sold[it.get("item_id")] = sold.get(it.get("item_id"), 0) + float(it.get("quantity") or 0)
    out = []
    for i in items:
        stock = float(i.get("current_stock") or 0)
        min_stock = float(i.get("min_stock") or 0)
        qty7 = sold.get(i.get("id"), 0)
        if min_stock > 0 and stock <= min_stock:
            out.append({"level": "urgent", "title": f"Stok menipis: {i.get('name')}", "message": f"Sisa {stock:g} {i.get('unit','')}, di bawah/sama minimum {min_stock:g}. Pertimbangkan restock."})
        elif qty7 > 0 and stock <= max(min_stock, qty7 * 1.5):
            out.append({"level": "warning", "title": f"Potensi segera habis: {i.get('name')}", "message": f"Terjual sekitar {qty7:g} dalam data terbaru, stok tinggal {stock:g}."})
    if not out:
        out.append({"level": "ok", "title": "Belum ada risiko stok besar", "message": "Data penjualan/stok terbaru belum menunjukkan barang yang perlu segera dibeli."})
    return out[:10]

@api.get("/ai/inventory-insights")
async def ai_inventory_insights(use_openai: bool = False, user: dict = Depends(get_current_user)):
    since = datetime.now(timezone.utc) - timedelta(days=14)
    items = await db.inventory_items.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    tx = await db.transactions.find({"created_at_dt": {"$gte": since}}, {"_id": 0}).sort("created_at", -1).to_list(500)
    insights = _simple_inventory_insights(items, tx)
    result = {"mode": "local_rules", "insights": insights, "notes": "Analisis lokal memakai stok minimum dan pola transaksi terbaru."}
    if use_openai:
        api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not api_key:
            result["openai_error"] = "OPENAI_API_KEY belum diisi di HuggingFace Secrets. ChatGPT Plus tidak otomatis menjadi API key."
            return result
        try:
            import httpx
            top = [{"name": i.get("name"), "stock": i.get("current_stock"), "min": i.get("min_stock"), "unit": i.get("unit"), "sold_recent": sum(float(it.get("quantity") or 0) for t in tx for it in t.get("items", []) if it.get("item_id") == i.get("id"))} for i in items[:80]]
            prompt = "Beri rekomendasi restock UMKM singkat dalam Bahasa Indonesia dari data stok dan penjualan ini. Jangan mengarang angka. Data: " + str(top[:80])
            async with httpx.AsyncClient(timeout=25) as http:
                r = await http.post("https://api.openai.com/v1/responses", headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}, json={"model": os.environ.get("OPENAI_MODEL", "gpt-4.1-mini"), "input": prompt})
                data = r.json()
            text = data.get("output_text") or ""
            if not text and data.get("output"):
                try:
                    text = "\n".join(c.get("text", "") for o in data.get("output", []) for c in o.get("content", []) if c.get("type") in ("output_text", "text"))
                except Exception:
                    text = ""
            result.update({"mode": "openai", "ai_text": text.strip(), "raw_status": r.status_code})
        except Exception as e:
            result["openai_error"] = str(e)
    return result

# ---------- Audit Log ----------
async def write_audit(user: dict, action: str, entity_type: str, entity_id: str = None, payload: dict = None):
    try:
        await db.audit_logs.insert_one({
            "id": gen_id(),
            "user_id": user.get("id"),
            "user_name": user.get("name"),
            "user_role": user.get("role"),
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "payload": payload or {},
            "timestamp": now_iso(),
        })
    except Exception:
        pass


@api.get("/audit-logs")
async def list_audit(user: dict = Depends(get_current_user), limit: int = 200, entity_type: Optional[str] = None, action: Optional[str] = None, user_id: Optional[str] = None):
    q = {}
    if entity_type:
        q["entity_type"] = entity_type
    if action:
        q["action"] = action
    if user_id:
        q["user_id"] = user_id
    logs = await db.audit_logs.find(q, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return logs


@api.get("/audit-logs/{log_id}/detail")
async def audit_log_detail(log_id: str, user: dict = Depends(get_current_user)):
    log = await db.audit_logs.find_one({"id": log_id}, {"_id": 0})
    if not log:
        raise HTTPException(404, "Audit log tidak ditemukan")
    entity_type = log.get("entity_type")
    entity_id = log.get("entity_id")
    related = None
    shortcut = None
    collections = {
        "transaction": "transactions",
        "customer_debt": "customer_debts",
        "inventory": "inventory_items",
        "expense": "expenses",
        "income": "incomes",
        "supplier": "suppliers",
        "purchase_order": "purchase_orders",
        "online_order": "online_orders",
        "vineyard_harvest": "vineyard_harvests",
        "vineyard_activity": "vineyard_activities",
        "vineyard_input_usage": "vineyard_input_usages",
        "table": "tables",
        "user": "users",
        "employee": "employees",
        "employee_leave": "employee_leaves",
        "payroll": "payroll",
        "opname_session": "opname_sessions",
    }
    coll = collections.get(entity_type)
    if coll and entity_id:
        related = await db[coll].find_one({"id": entity_id}, {"_id": 0, "password_hash": 0})
    # Fallback untuk audit pembatalan transaksi: payload sering menyimpan trx_no saja.
    if not related and entity_type == "transaction" and log.get("payload", {}).get("trx_no"):
        related = await db.transactions.find_one({"trx_no": log["payload"]["trx_no"]}, {"_id": 0})
    if entity_type == "transaction":
        shortcut = {"label": "Buka Riwayat Kasir", "path": f"/kasir?trx={entity_id}"}
    elif entity_type == "customer_debt":
        shortcut = {"label": "Buka Bon di Kasir", "path": f"/kasir?bon={entity_id}"}
    elif entity_type in ("purchase_order", "online_order"):
        shortcut = {"label": "Buka Pembelian", "path": "/pembelian"}
    elif entity_type and entity_type.startswith("vineyard"):
        shortcut = {"label": "Buka Kebun Anggur", "path": "/anggur"}
    return {"log": log, "related": related, "shortcut": shortcut}


# ---------- Loyalty / Member ----------
class MemberIn(BaseModel):
    name: str
    phone: str
    email: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""


@api.get("/members")
async def list_members(user: dict = Depends(get_current_user), search: Optional[str] = None):
    q = {}
    if search:
        q["$or"] = [{"name": {"$regex": search, "$options": "i"}}, {"phone": {"$regex": search}}]
    members = await db.members.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return members


@api.post("/members")
async def create_member(body: MemberIn, user: dict = Depends(get_current_user)):
    # Auto member_id
    count = await db.members.count_documents({})
    member_id = f"MBR-{(count + 1):05d}"
    data = body.model_dump()
    data["member_id"] = member_id
    data["points"] = 0
    data["total_spent"] = 0
    data["tier"] = "Bronze"
    data["joined_at"] = now_iso()
    doc = await insert_doc("members", data)
    await write_audit(user, "create", "member", doc["id"], {"name": body.name})
    return doc


@api.get("/members/{mid}")
async def get_member(mid: str, user: dict = Depends(get_current_user)):
    m = await db.members.find_one({"$or": [{"id": mid}, {"member_id": mid}, {"phone": mid}]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Member tidak ditemukan")
    return m


@api.put("/members/{mid}")
async def update_member(mid: str, body: dict, user: dict = Depends(get_current_user)):
    body.pop("_id", None)
    body.pop("id", None)
    await db.members.update_one({"id": mid}, {"$set": body})
    return await db.members.find_one({"id": mid}, {"_id": 0})


@api.delete("/members/{mid}")
async def delete_member(mid: str, user: dict = Depends(require_roles("super_admin"))):
    await db.members.delete_one({"id": mid})
    return {"ok": True}


class LoyaltySettings(BaseModel):
    earn_rate: int = 1000  # 1 point per Rp 1000 spent
    redeem_rate: int = 100  # 1 point = Rp 100 discount
    tier_silver_at: int = 100  # points
    tier_gold_at: int = 500


@api.get("/loyalty/settings")
async def get_loyalty_settings(user: dict = Depends(get_current_user)):
    s = await db.loyalty_settings.find_one({}, {"_id": 0})
    return s or LoyaltySettings().model_dump()


@api.put("/loyalty/settings")
async def update_loyalty_settings(body: LoyaltySettings, user: dict = Depends(get_current_user)):
    await db.loyalty_settings.update_one({}, {"$set": body.model_dump()}, upsert=True)
    return await get_loyalty_settings(user)


class RedeemIn(BaseModel):
    member_id: str
    points: int


@api.post("/members/redeem")
async def redeem_points(body: RedeemIn, user: dict = Depends(get_current_user)):
    m = await db.members.find_one({"$or": [{"id": body.member_id}, {"member_id": body.member_id}]})
    if not m:
        raise HTTPException(404, "Member tidak ditemukan")
    if (m.get("points", 0)) < body.points:
        raise HTTPException(400, "Poin tidak cukup")
    settings = await get_loyalty_settings(user)
    discount = body.points * settings.get("redeem_rate", 100)
    return {"member_id": m["id"], "name": m["name"], "points_used": body.points, "discount": discount}


# ---------- Notification Center ----------
@api.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user), unread_only: bool = False, limit: int = 100):
    q = {}
    if unread_only:
        q["is_read"] = False
    limit = max(1, min(int(limit or 100), 500))
    return await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)


@api.put("/notifications/{nid}/read")
async def mark_notification_read(nid: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"id": nid}, {"$set": {"is_read": True, "read_at": now_iso(), "read_by": user.get("id")}})
    return {"ok": True}


@api.post("/notifications/manual")
async def create_manual_notification(body: dict, user: dict = Depends(get_current_user)):
    doc = await write_notification(
        body.get("type", "SYSTEM"),
        body.get("title", "Notifikasi"),
        body.get("message", ""),
        business_id=body.get("business_id", ""),
        ref_type=body.get("ref_type", "manual"),
        ref_id=body.get("ref_id", ""),
        priority=body.get("priority", "normal"),
    )
    return doc


# ---------- Help / Tutorial CMS ----------
class HelpContentIn(BaseModel):
    type: Literal["GUIDE", "VIDEO", "FAQ", "SUPPORT"] = "GUIDE"
    title: str
    content: Optional[str] = ""
    youtube_url: Optional[str] = ""
    wa_url: Optional[str] = ""
    active: bool = True
    sort_order: int = 0


@api.get("/help-contents")
async def list_help_contents(user: dict = Depends(get_current_user)):
    items = await db.help_contents.find({}, {"_id": 0}).sort("sort_order", 1).to_list(500)
    if not items:
        defaults = [
            {"type": "GUIDE", "title": "Mulai menggunakan kasir", "content": "Buka menu Kasir, pilih lini bisnis, tambah produk ke keranjang, pilih jenis transaksi, lalu konfirmasi pembayaran.", "sort_order": 1, "active": True},
            {"type": "FAQ", "title": "Bagaimana mencatat pemakaian sendiri?", "content": "Di Kasir pilih Jenis Transaksi: Pemakaian Sendiri. Stok dan HPP berkurang tanpa menambah pendapatan.", "sort_order": 2, "active": True},
            {"type": "SUPPORT", "title": "Kontak Super Admin", "content": "Isi link WhatsApp admin di tombol edit agar tim bisa langsung menghubungi support.", "wa_url": "", "sort_order": 3, "active": True},
        ]
        for d in defaults:
            await insert_doc("help_contents", d)
        items = await db.help_contents.find({}, {"_id": 0}).sort("sort_order", 1).to_list(500)
    return items


@api.post("/help-contents")
async def create_help_content(body: HelpContentIn, user: dict = Depends(get_current_user)):
    doc = await insert_doc("help_contents", body.model_dump())
    await write_audit(user, "create", "help_content", doc["id"], {"title": doc.get("title")})
    return doc


@api.put("/help-contents/{hid}")
async def update_help_content(hid: str, body: dict, user: dict = Depends(get_current_user)):
    body.pop("_id", None); body.pop("id", None)
    await db.help_contents.update_one({"id": hid}, {"$set": body})
    await write_audit(user, "update", "help_content", hid, body)
    return await db.help_contents.find_one({"id": hid}, {"_id": 0})


@api.delete("/help-contents/{hid}")
async def delete_help_content(hid: str, user: dict = Depends(get_current_user)):
    await db.help_contents.delete_one({"id": hid})
    await write_audit(user, "delete", "help_content", hid, {})
    return {"ok": True}


# ---------- Payment Gateway Abstraction (QRIS ready, provider can be added later) ----------
class PaymentGatewayIn(BaseModel):
    name: str
    provider: Literal["midtrans", "xendit", "duitku", "custom"] = "custom"
    active: bool = False
    server_key: Optional[str] = ""
    client_key: Optional[str] = ""
    webhook_secret: Optional[str] = ""
    config: dict = Field(default_factory=dict)


def safe_gateway(doc: dict) -> dict:
    if not doc:
        return doc
    out = clean_doc(doc.copy())
    for k in ("server_key", "client_key", "webhook_secret"):
        if out.get(k):
            out[k] = "••••" + str(out[k])[-4:]
    return out


@api.get("/payment-gateways")
async def list_payment_gateways(user: dict = Depends(get_current_user)):
    items = await db.payment_gateways.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return [safe_gateway(x) for x in items]


@api.post("/payment-gateways")
async def create_payment_gateway(body: PaymentGatewayIn, user: dict = Depends(require_roles("super_admin"))):
    data = body.model_dump()
    if data.get("active"):
        await db.payment_gateways.update_many({}, {"$set": {"active": False}})
    doc = await insert_doc("payment_gateways", data)
    await write_audit(user, "create", "payment_gateway", doc["id"], {"provider": doc.get("provider"), "active": doc.get("active")})
    return safe_gateway(doc)


@api.put("/payment-gateways/{gid}")
async def update_payment_gateway(gid: str, body: dict, user: dict = Depends(require_roles("super_admin"))):
    body.pop("_id", None); body.pop("id", None)
    if body.get("active"):
        await db.payment_gateways.update_many({"id": {"$ne": gid}}, {"$set": {"active": False}})
    await db.payment_gateways.update_one({"id": gid}, {"$set": body})
    doc = await db.payment_gateways.find_one({"id": gid}, {"_id": 0})
    await write_audit(user, "update", "payment_gateway", gid, {"active": body.get("active")})
    return safe_gateway(doc)


@api.post("/payment-webhooks/{provider}")
async def payment_webhook(provider: str, request: Request):
    payload = await request.json()
    rec = {"id": gen_id(), "provider": provider, "payload": payload, "processed": False, "created_at": now_iso()}
    await db.payment_webhooks.insert_one(rec)
    amount = int(payload.get("gross_amount") or payload.get("amount") or payload.get("total") or 0)
    order_id = str(payload.get("order_id") or payload.get("external_id") or payload.get("reference_id") or "")
    status_raw = str(payload.get("transaction_status") or payload.get("status") or "").lower()
    success = status_raw in ("settlement", "capture", "paid", "success", "completed")
    if success:
        await write_notification("PAYMENT", "Pembayaran masuk", f"{provider.upper()} {format_rp_short(amount)} diterima. Ref: {order_id}", ref_type="payment_webhook", ref_id=rec["id"], priority="high")
        await db.payment_webhooks.update_one({"id": rec["id"]}, {"$set": {"processed": True, "processed_at": now_iso()}})
    return {"ok": True, "processed": success}


# ---------- Scheduled Notifications ----------
@api.get("/scheduled-notifications")
async def list_scheduled(user: dict = Depends(get_current_user)):
    return await db.scheduled_notifications.find({}, {"_id": 0}).sort("scheduled_at", -1).to_list(200)


@api.delete("/scheduled-notifications/{nid}")
async def dismiss_scheduled(nid: str, user: dict = Depends(get_current_user)):
    await db.scheduled_notifications.update_one({"id": nid}, {"$set": {"dismissed": True}})
    return {"ok": True}


# ---------- File Upload (Images) ----------
import base64 as _b64
from fastapi import UploadFile, File

UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@api.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Hanya gambar yang didukung")
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(400, "Maksimal 5MB")
    ext = (file.filename or "img.png").rsplit(".", 1)[-1].lower()
    if ext not in ("png", "jpg", "jpeg", "webp", "gif"):
        ext = "png"
    fname = f"{gen_id()}.{ext}"
    fpath = UPLOAD_DIR / fname
    fpath.write_bytes(contents)
    return {"url": f"/api/uploads/{fname}", "filename": fname, "size": len(contents)}


from fastapi.staticfiles import StaticFiles
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")



# ---------- Optional AI Gateway Insights ----------
def _ai_gateway_key() -> str:
    return (os.environ.get("AI_GATEWAY_API_KEY") or os.environ.get("VERCEL_AI_GATEWAY_API_KEY") or "").strip()


def _ai_gateway_model() -> str:
    return (os.environ.get("AI_GATEWAY_MODEL") or "openai/gpt-5.4").strip()


async def _collect_ai_operational_snapshot() -> dict:
    today = datetime.now(timezone.utc).date().isoformat()
    active_orders = await db.orders.find({"status": {"$in": ["open", "sent", "bill_requested"]}}, {"_id": 0}).sort("created_at", 1).to_list(200)
    tables = await db.tables.find({}, {"_id": 0}).to_list(300)
    today_trx = await db.transactions.find({"created_at": {"$regex": f"^{today}"}, "cancelled": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(300)
    expenses = await db.expenses.find({"$or": [{"date": {"$regex": f"^{today}"}}, {"created_at": {"$regex": f"^{today}"}}]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    low_stock = await db.inventory_items.find({"$expr": {"$lte": [{"$ifNull": ["$stock", 0]}, {"$ifNull": ["$min_stock", 0]}]}}, {"_id": 0}).limit(25).to_list(25)
    unpaid_debts = await db.customer_debts.find({"status": {"$ne": "paid"}}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)

    revenue = sum(_money(x.get("total")) for x in today_trx if str(x.get("payment_status", "")).upper() != "CANCELLED")
    expense_total = sum(_money(x.get("amount")) for x in expenses)
    active_value = sum(sum(_money(i.get("quantity")) * _money(i.get("unit_price")) for i in (o.get("items") or [])) for o in active_orders)
    occupied_tables = len({o.get("table_id") for o in active_orders if o.get("table_id")})
    oldest_minutes = 0
    for o in active_orders:
        try:
            created = datetime.fromisoformat(str(o.get("created_at", "")).replace("Z", "+00:00"))
            oldest_minutes = max(oldest_minutes, int((datetime.now(timezone.utc) - created).total_seconds() // 60))
        except Exception:
            pass
    return {
        "today": today,
        "active_orders": len(active_orders),
        "active_order_value": active_value,
        "occupied_tables": occupied_tables,
        "total_tables": len(tables),
        "oldest_order_minutes": oldest_minutes,
        "today_transactions": len(today_trx),
        "today_revenue": revenue,
        "today_expense": expense_total,
        "estimated_profit": revenue - expense_total,
        "low_stock_count": len(low_stock),
        "low_stock_items": [{"name": x.get("name"), "stock": x.get("stock"), "min_stock": x.get("min_stock")} for x in low_stock[:10]],
        "unpaid_debt_count": len(unpaid_debts),
        "unpaid_debt_total": sum(_money(x.get("remaining_amount") or x.get("amount")) for x in unpaid_debts),
    }


def _rule_based_insights(snapshot: dict) -> list:
    tips = []
    if snapshot.get("oldest_order_minutes", 0) >= 25:
        tips.append("Ada order aktif yang sudah lama. Prioritaskan cek meja/KDS agar pelanggan tidak menunggu terlalu lama.")
    if snapshot.get("active_orders", 0) >= 5:
        tips.append("Order aktif cukup banyak. Gunakan Warung + KDS untuk memantau item belum dilayani dan kurangi bolak-balik ke Kasir.")
    if snapshot.get("low_stock_count", 0) > 0:
        tips.append("Ada item stok menipis. Segera cek Inventori agar menu yang habis tidak terus dijual atau tampil di self-order.")
    if snapshot.get("unpaid_debt_count", 0) > 0:
        tips.append("Ada bon/piutang belum lunas. Gunakan Kasir/Riwayat bon untuk follow-up pelanggan dan menjaga arus kas.")
    if snapshot.get("today_transactions", 0) > 0 and snapshot.get("estimated_profit", 0) < 0:
        tips.append("Estimasi profit hari ini negatif. Cek pengeluaran hari ini dan harga jual item dengan margin kecil.")
    tips.append("Fitur yang paling aman ditambah berikutnya: split bill, transfer meja, panggil pelayan/minta bill, item habis otomatis, dan approval diskon besar.")
    return tips[:6]


@api.get("/ai/status")
async def ai_gateway_status(user: dict = Depends(get_current_user)):
    key = _ai_gateway_key()
    return {
        "enabled": bool(key),
        "provider": "vercel_ai_gateway" if key else "rule_based_local",
        "model": _ai_gateway_model() if key else "local_rules",
        "message": "AI Gateway aktif" if key else "AI Gateway belum diatur; rekomendasi lokal tetap aktif tanpa API key.",
    }


@api.post("/ai/operational-insights")
async def ai_operational_insights(user: dict = Depends(get_current_user)):
    snapshot = await _collect_ai_operational_snapshot()
    key = _ai_gateway_key()
    local_tips = _rule_based_insights(snapshot)
    if not key:
        return {"source": "rule_based_local", "snapshot": snapshot, "insights": local_tips, "raw_text": ""}
    prompt = (
        "Kamu adalah konsultan ERP/POS untuk warung makan, ritel kecil, kebun, dan peternakan. "
        "Beri rekomendasi singkat, praktis, aman terhadap integrasi sistem, dan prioritas bug/efisiensi. "
        "Jawab dalam Bahasa Indonesia. Maksimal 7 poin. Data aplikasi:\n" + str(snapshot)
    )
    try:
        import httpx
        async with httpx.AsyncClient(timeout=30) as http:
            res = await http.post(
                "https://ai-gateway.vercel.sh/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={
                    "model": _ai_gateway_model(),
                    "messages": [
                        {"role": "system", "content": "Berikan insight operasional yang konkret, hindari teori panjang."},
                        {"role": "user", "content": prompt},
                    ],
                    "stream": False,
                },
            )
        if res.status_code >= 400:
            return {"source": "rule_based_local", "snapshot": snapshot, "insights": local_tips, "raw_text": "", "ai_error": res.text[:500]}
        data = res.json()
        text = (((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
        insights = [x.strip(" -•\t") for x in text.split("\n") if x.strip()]
        return {"source": "vercel_ai_gateway", "snapshot": snapshot, "insights": insights or local_tips, "raw_text": text}
    except Exception as e:
        return {"source": "rule_based_local", "snapshot": snapshot, "insights": local_tips, "raw_text": "", "ai_error": str(e)[:500]}

app.include_router(api)


class WSManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, message: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for d in dead:
            self.disconnect(d)


ws_manager = WSManager()


@app.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    try:
        await ws.send_json({"type": "connected", "ts": now_iso()})
        while True:
            # Keep connection alive; clients may send pings
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
    except Exception:
        ws_manager.disconnect(ws)


async def broadcast_event(event_type: str, payload: dict = None):
    try:
        await ws_manager.broadcast({"type": event_type, "payload": payload or {}, "ts": now_iso()})
    except Exception:
        pass

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
