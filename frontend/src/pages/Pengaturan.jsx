import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertTriangle, KeyRound, User as UserIcon, Trash2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function Pengaturan() {
  const { user, refreshUser } = useAuth();
  const [s, setS] = useState({ business_name: "", address: "", phone: "", receipt_footer: "", tax_rate: 11 });
  const [profile, setProfile] = useState({ name: "", email: "" });
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [showReset, setShowReset] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetOpts, setResetOpts] = useState({ keep_business_units: true, keep_branches: true, keep_business_profile: true });
  const [resetting, setResetting] = useState(false);
  const [gateways, setGateways] = useState([]);
  const [gatewayForm, setGatewayForm] = useState({ name: "Midtrans", provider: "midtrans", active: false, server_key: "", client_key: "", webhook_secret: "" });

  useEffect(() => {
    api.get("/settings").then(({ data }) => setS((prev) => ({ ...prev, ...data })));
    loadGateways();
  }, []);

  useEffect(() => {
    if (user) setProfile({ name: user.name || "", email: user.email || "" });
  }, [user]);

  const save = async () => {
    await api.put("/settings", s);
    toast.success("Pengaturan disimpan");
  };

  const loadGateways = async () => {
    try { const { data } = await api.get("/payment-gateways"); setGateways(data); } catch (e) { /* ignore */ }
  };

  const saveGateway = async () => {
    if (!gatewayForm.name) return toast.error("Nama gateway wajib");
    try {
      await api.post("/payment-gateways", gatewayForm);
      toast.success("Payment gateway disimpan. Jika aktif, webhook siap menerima notifikasi pembayaran.");
      setGatewayForm({ name: "Midtrans", provider: "midtrans", active: false, server_key: "", client_key: "", webhook_secret: "" });
      loadGateways();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal menyimpan gateway"); }
  };

  const saveProfile = async () => {
    if (!profile.name?.trim() || !profile.email?.trim()) return toast.error("Nama & email wajib diisi");
    try {
      await api.put("/auth/me", profile);
      toast.success("Profil diperbarui");
      if (refreshUser) await refreshUser();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  const changePassword = async () => {
    if (!pwForm.current_password) return toast.error("Masukkan password lama");
    if (pwForm.new_password.length < 6) return toast.error("Password baru minimal 6 karakter");
    if (pwForm.new_password !== pwForm.confirm) return toast.error("Konfirmasi password tidak cocok");
    try {
      await api.post("/auth/change-password", {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      toast.success("Password berhasil diganti");
      setPwForm({ current_password: "", new_password: "", confirm: "" });
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  const doReset = async () => {
    if (resetConfirm !== "RESET") return toast.error('Ketik "RESET" untuk konfirmasi');
    setResetting(true);
    try {
      const { data } = await api.post("/system/reset-data", { confirm: "RESET", ...resetOpts });
      toast.success(`${data.total_deleted} record dihapus. Aplikasi siap dengan data Anda sendiri.`);
      setShowReset(false); setResetConfirm("");
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal reset"); }
    finally { setResetting(false); }
  };

  const isSuperAdmin = user?.role === "super_admin";

  return (
    <div className="space-y-4 fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Pengaturan</h1>
        <p className="text-sm text-gray-500 mt-0.5">Profil bisnis, akun pribadi, dan konfigurasi aplikasi</p>
      </div>

      {/* Profil Saya */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2"><UserIcon className="w-4 h-4 text-[#1a6b3c]" /> Profil Saya</h2>
        <div>
          <Label>Nama Lengkap</Label>
          <Input data-testid="profile-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
        </div>
        <div>
          <Label>Email Login</Label>
          <Input data-testid="profile-email" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value.toLowerCase() })} />
          <p className="text-xs text-gray-500 mt-1">Gunakan email Anda untuk login berikutnya</p>
        </div>
        <Button onClick={saveProfile} data-testid="save-profile-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan Profil</Button>
      </div>

      {/* Ganti Password */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2"><KeyRound className="w-4 h-4 text-amber-600" /> Ganti Password</h2>
        <div>
          <Label>Password Lama</Label>
          <Input data-testid="pw-current" type="password" value={pwForm.current_password} onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })} />
        </div>
        <div>
          <Label>Password Baru (min 6 karakter)</Label>
          <Input data-testid="pw-new" type="password" value={pwForm.new_password} onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })} />
        </div>
        <div>
          <Label>Konfirmasi Password Baru</Label>
          <Input data-testid="pw-confirm" type="password" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} />
        </div>
        <Button onClick={changePassword} data-testid="change-pw-btn" className="bg-amber-500 hover:bg-amber-600">Ganti Password</Button>
      </div>

      {/* Profil Bisnis */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Profil Bisnis</h2>
        <div>
          <Label>Nama Bisnis</Label>
          <Input data-testid="settings-name" value={s.business_name || ""} onChange={(e) => setS({ ...s, business_name: e.target.value })} />
        </div>
        <div>
          <Label>Alamat</Label>
          <Input value={s.address || ""} onChange={(e) => setS({ ...s, address: e.target.value })} />
        </div>
        <div>
          <Label>No. Telepon</Label>
          <Input value={s.phone || ""} onChange={(e) => setS({ ...s, phone: e.target.value })} />
        </div>
        <div>
          <Label>Catatan / Deskripsi Struk</Label>
          <textarea
            data-testid="settings-receipt-footer"
            value={s.receipt_footer || ""}
            onChange={(e) => setS({ ...s, receipt_footer: e.target.value })}
            placeholder="Mis: Terima kasih atas kunjungan Anda. WA: 0812-3456-7890 · IG: @agriwarung"
            rows={3}
            className="w-full mt-1 rounded-md border border-gray-200 px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <p className="text-xs text-gray-500 mt-1">Tampil di bagian bawah struk cetak & WhatsApp. Bisa multi-baris.</p>
        </div>
        <div>
          <Label>Pajak PPN (%)</Label>
          <Input type="number" value={s.tax_rate || 0} onChange={(e) => setS({ ...s, tax_rate: parseFloat(e.target.value) })} />
        </div>
        <Button onClick={save} data-testid="save-settings-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan Pengaturan</Button>
      </div>

      {/* Payment Gateway */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Payment Gateway / QRIS</h2>
        <p className="text-xs text-gray-500">Disiapkan untuk Midtrans, Xendit, Duitku, atau Custom. Saat belum punya akun gateway, biarkan nonaktif; kasir tetap bisa pakai manual payment.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Nama Gateway</Label>
            <Input value={gatewayForm.name} onChange={(e) => setGatewayForm({ ...gatewayForm, name: e.target.value })} placeholder="Midtrans / Xendit / Duitku" />
          </div>
          <div>
            <Label>Provider</Label>
            <select value={gatewayForm.provider} onChange={(e) => setGatewayForm({ ...gatewayForm, provider: e.target.value })} className="w-full h-10 border border-gray-200 rounded-md px-3 text-sm bg-white">
              <option value="midtrans">Midtrans</option>
              <option value="xendit">Xendit</option>
              <option value="duitku">Duitku</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><Label>Server Key</Label><Input type="password" value={gatewayForm.server_key} onChange={(e) => setGatewayForm({ ...gatewayForm, server_key: e.target.value })} /></div>
          <div><Label>Client Key</Label><Input type="password" value={gatewayForm.client_key} onChange={(e) => setGatewayForm({ ...gatewayForm, client_key: e.target.value })} /></div>
          <div><Label>Webhook Secret</Label><Input type="password" value={gatewayForm.webhook_secret} onChange={(e) => setGatewayForm({ ...gatewayForm, webhook_secret: e.target.value })} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={gatewayForm.active} onChange={(e) => setGatewayForm({ ...gatewayForm, active: e.target.checked })} className="w-4 h-4 rounded accent-[#1a6b3c]" /> Aktifkan gateway ini
        </label>
        <Button onClick={saveGateway} className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan Gateway</Button>
        <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
          Webhook backend: <code>/api/payment-webhooks/{gatewayForm.provider}</code>. Setelah daftar provider, arahkan URL webhook provider ke endpoint backend HuggingFace Anda.
        </div>
        {gateways.length > 0 && (
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {gateways.map((g) => (
              <div key={g.id} className="p-3 flex justify-between gap-3 text-sm">
                <div>
                  <div className="font-semibold">{g.name} <span className="text-xs text-gray-500 uppercase">{g.provider}</span></div>
                  <div className="text-xs text-gray-500">Server: {g.server_key || "belum diisi"} · Client: {g.client_key || "belum diisi"}</div>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded ${g.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{g.active ? "AKTIF" : "NONAKTIF"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-2">
        <h2 className="font-semibold text-gray-900">Tentang Aplikasi</h2>
        <p className="text-sm text-gray-600">AgriWarung Manager v1.1 — platform manajemen multi-bisnis untuk grup agribisnis.</p>
      </div>

    </div>
  );
}
