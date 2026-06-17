"""AgriWarung v2.5.16 backend patch.

This wrapper imports the existing server.py app, then adds QR table/self-order
endpoints without deleting existing endpoints or data.
Run with: uvicorn server_patched:app --host 0.0.0.0 --port 7860
"""

import os
from typing import List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from server import app, db, gen_id, now_iso, get_current_user

try:
    from server import broadcast_event  # existing realtime notifier in newer builds
except Exception:  # pragma: no cover
    async def broadcast_event(event: str, payload: dict):
        return None

qr_api = APIRouter(prefix="/api", tags=["table-qr"])

ACTIVE_ORDER_STATUSES = ["open", "sent", "preparing", "ready", "bill_requested"]


def _safe_frontend_base(request: Request) -> str:
    """Find frontend base URL for printed QR links.

    Priority:
    1. FRONTEND_PUBLIC_URL / FRONTEND_URL env on HF
    2. Origin header when called from Vercel frontend
    3. Referer header
    4. Placeholder base; frontend may override before printing
    """
    env_base = (os.environ.get("FRONTEND_PUBLIC_URL") or os.environ.get("FRONTEND_URL") or "").strip()
    if env_base:
        return env_base.rstrip("/")

    origin = (request.headers.get("origin") or "").strip()
    if origin:
        return origin.rstrip("/")

    referer = (request.headers.get("referer") or "").strip()
    if referer:
        parsed = urlparse(referer)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"

    return "https://example.com"


def _public_doc(doc):
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


class QrOrderItemIn(BaseModel):
    item_id: str
    quantity: int = 1
    notes: Optional[str] = ""


class QrOrderIn(BaseModel):
    items: List[QrOrderItemIn]
    notes: Optional[str] = ""
    customer_name: Optional[str] = ""
    customer_phone: Optional[str] = ""


@qr_api.get("/tables/{table_id}/qr-meta")
async def table_qr_meta(table_id: str, request: Request, user: dict = Depends(get_current_user)):
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(404, "Meja tidak ditemukan")

    active_orders = await db.orders.find(
        {"table_id": table_id, "status": {"$in": ACTIVE_ORDER_STATUSES}},
        {"_id": 0},
    ).sort("created_at", 1).to_list(50)

    active_total = 0
    for order in active_orders:
        active_total += sum(
            int(it.get("quantity", 0)) * int(it.get("unit_price", 0))
            for it in order.get("items", [])
        )

    base = _safe_frontend_base(request)
    return {
        "ok": True,
        "table_id": table_id,
        "table_name": table.get("name", "Meja"),
        "url": f"{base}/self-order/table/{table_id}",
        "active_order_id": active_orders[0].get("id") if active_orders else None,
        "active_order_count": len(active_orders),
        "active_total": active_total,
    }


@qr_api.get("/public/tables/{table_id}")
async def public_table_detail(table_id: str):
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(404, "Meja tidak ditemukan")

    active_orders = await db.orders.find(
        {"table_id": table_id, "status": {"$in": ACTIVE_ORDER_STATUSES}},
        {"_id": 0},
    ).sort("created_at", 1).to_list(50)

    menu_query = {
        "sell_price": {"$gt": 0},
        "$or": [
            {"business_unit": {"$in": ["warung", "umum", "", None]}},
            {"business_unit": {"$exists": False}},
        ],
    }
    menu_items = await db.inventory_items.find(menu_query, {"_id": 0}).sort("name", 1).to_list(500)
    # Only expose what customer needs.
    safe_menu = []
    for item in menu_items:
        stock = float(item.get("current_stock", 0) or 0)
        if stock <= 0:
            continue
        safe_menu.append({
            "id": item.get("id"),
            "name": item.get("name"),
            "category": item.get("category", "Menu"),
            "unit": item.get("unit", "pcs"),
            "sell_price": int(item.get("sell_price", 0) or 0),
            "image_url": item.get("image_url", ""),
            "available_stock": stock,
        })

    table = _public_doc(table)
    return {
        "ok": True,
        "table": table,
        "active_orders": active_orders,
        "menu_items": safe_menu,
    }


@qr_api.post("/public/tables/{table_id}/orders")
async def public_table_order(table_id: str, body: QrOrderIn):
    if not body.items:
        raise HTTPException(400, "Pesanan kosong")

    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(404, "Meja tidak ditemukan")

    requested_ids = [it.item_id for it in body.items]
    inv_items = await db.inventory_items.find(
        {"id": {"$in": requested_ids}, "sell_price": {"$gt": 0}},
        {"_id": 0},
    ).to_list(500)
    inv_by_id = {it.get("id"): it for it in inv_items}

    validated_items = []
    for req in body.items:
        if req.quantity <= 0:
            continue
        ref = inv_by_id.get(req.item_id)
        if not ref:
            raise HTTPException(400, f"Item tidak tersedia: {req.item_id}")
        stock = float(ref.get("current_stock", 0) or 0)
        if stock <= 0:
            raise HTTPException(400, f"Stok habis: {ref.get('name', 'Item')}")
        if req.quantity > stock:
            raise HTTPException(400, f"Stok kurang: {ref.get('name', 'Item')} tersisa {stock:g}")
        validated_items.append({
            "item_id": ref.get("id"),
            "name": ref.get("name"),
            "quantity": int(req.quantity),
            "unit_price": int(ref.get("sell_price", 0) or 0),
            "notes": req.notes or "",
            "status": "new",
            "served": False,
            "source": "table_qr",
            "added_at": now_iso(),
        })

    if not validated_items:
        raise HTTPException(400, "Pesanan kosong")

    active = await db.orders.find_one(
        {"table_id": table_id, "status": {"$in": ACTIVE_ORDER_STATUSES}},
        {"_id": 0},
        sort=[("created_at", 1)],
    )

    if active:
        merged_items = list(active.get("items", [])) + validated_items
        await db.orders.update_one(
            {"id": active["id"]},
            {"$set": {
                "items": merged_items,
                "status": "sent",
                "last_customer_order_at": now_iso(),
                "customer_name": body.customer_name or active.get("customer_name", ""),
                "customer_phone": body.customer_phone or active.get("customer_phone", ""),
                "notes": ((active.get("notes") or "") + "\n" + (body.notes or "")).strip(),
            }},
        )
        await broadcast_event("order_updated", {"id": active["id"], "table_id": table_id, "source": "table_qr"})
        return {"ok": True, "mode": "append", "order_id": active["id"], "table_name": table.get("name"), "items_count": len(validated_items)}

    doc = {
        "id": gen_id(),
        "table_id": table_id,
        "items": validated_items,
        "notes": body.notes or "",
        "status": "sent",
        "source": "table_qr",
        "customer_name": body.customer_name or "",
        "customer_phone": body.customer_phone or "",
        "created_at": now_iso(),
        "last_customer_order_at": now_iso(),
    }
    await db.orders.insert_one(doc)
    await broadcast_event("order_created", {"id": doc["id"], "table_id": table_id, "source": "table_qr"})
    return {"ok": True, "mode": "new", "order_id": doc["id"], "table_name": table.get("name"), "items_count": len(validated_items)}


app.include_router(qr_api)
