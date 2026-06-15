import React, { useEffect, useState } from "react";
import { MessageCircle, AlertTriangle, BarChart3, Briefcase, Save, Send, Copy, Plus, Edit2, Trash2, Eye, Bell, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const NOTIF_TYPES = [
  { key: "low-stock", label: "Stok Menipis", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", desc: "Daftar barang di bawah minimum" },
  { key: "daily-summary", label: "Ringkasan Harian", icon: BarChart3, color: "text-emerald-700", bg: "bg-emerald-50", desc: "Pendapatan, pengeluaran, laba hari ini" },
  { key: "payroll-alert", label: "Penggajian Pending", icon: Briefcase, color: "text-amber-700", bg: "bg-amber-50", desc: "Karyawan yang belum digaji bulan ini" },
];

export default function Notifications() {
  const [settings, setSettings] = useState({ recipient_phone: "", low_stock_alerts: true, daily_summary: true, payroll_alerts: true });
  const [previews, setPreviews] = useState({});
  const [templates, setTemplates] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [editTpl, setEditTpl] = useState(null);
  const initialTpl = { title: "", icon: "💬", body: "", enabled: true, recipient_phone: "" };

  const loadTemplates = async () => {
    try { const { data } = await api.get("/notifications/wa/templates"); setTemplates(data); } catch (err) { /* ignore */ }
  };

  const loadNotifications = async () => {
    try { const { data } = await api.get("/notifications?limit=50"); setNotifications(data); } catch (err) { /* ignore */ }
  };

  useEffect(() => {
    api.get("/notifications/settings").then(({ data }) => setSettings({ ...settings, ...data }));
    loadTemplates();
    loadNotifications();
    const h = (e) => { if (e.detail?.type === "notification") loadNotifications(); };
    window.addEventListener("aw:ws", h);
    return () => window.removeEventListener("aw:ws", h);
    // eslint-disable-next-line
  }, []);

  const saveSettings = async () => {
    await api.put("/notifications/settings", settings);
    toast.success("Pengaturan disimpan");
  };

  const generate = async (key) => {
    try {
      const { data } = await api.get(`/notifications/wa/${key}`);
      setPreviews({ ...previews, [key]: data });
    } catch (e) { toast.error("Gagal generate"); }
  };

  const sendWA = (text) => {
    const phone = settings.recipient_phone.replace(/[^\d]/g, "");
    let normalized = phone;
    if (normalized.startsWith("0")) normalized = "62" + normalized.slice(1);
    if (!normalized.startsWith("62") && normalized.length > 0) normalized = "62" + normalized;
    const base = normalized ? `https://wa.me/${normalized}` : "https://wa.me/";
    window.open(`${base}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Pesan disalin");
  };

  const saveTemplate = async () => {
    if (!editTpl.title || !editTpl.body) return toast.error("Judul dan isi wajib");
    try {
      if (editTpl.id) await api.put(`/notifications/wa/templates/${editTpl.id}`, editTpl);
      else await api.post("/notifications/wa/templates", editTpl);
      toast.success("Template disimpan");
      setEditTpl(null); loadTemplates();
    } catch (e) { toast.error("Gagal menyimpan"); }
  };

  const removeTemplate = async (id, title) => {
    if (!window.confirm(`Hapus template "${title}"?`)) return;
    await api.delete(`/notifications/wa/templates/${id}`);
    toast.success("Template dihapus"); loadTemplates();
  };

  const previewTemplate = async (id) => {
    const { data } = await api.get(`/notifications/wa/templates/${id}/preview`);
    setPreviews({ ...previews, [`tpl-${id}`]: { text: data.text } });
  };

  const markRead = async (id) => {
    await api.put(`/notifications/${id}/read`);
    loadNotifications();
  };

  return (
    <div className="space-y-4 fade-in max-w-4xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Notifikasi WhatsApp</h1>
        <p className="text-sm text-gray-500 mt-0.5">Generate pesan otomatis dan kirim via WhatsApp dengan 1 klik</p>
      </div>

      {/* Notification Center */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Bell className="w-5 h-5 text-[#1a6b3c]" /> Pusat Notifikasi</h2>
          <Button size="sm" variant="outline" onClick={loadNotifications}>Refresh</Button>
        </div>
        {notifications.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-6 border border-dashed rounded-lg">Belum ada notifikasi. Pesanan QR, stok menipis, pembayaran gateway, hutang, dan aktivitas penting akan muncul di sini.</div>
        ) : (
          <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {notifications.map((n) => (
              <div key={n.id} className={`py-3 flex items-start gap-3 ${n.is_read ? "opacity-60" : ""}`}>
                <div className={`w-2 h-2 rounded-full mt-2 ${n.is_read ? "bg-gray-300" : "bg-[#f4a228]"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{n.title}</span>
                    <span className="text-[10px] font-bold bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{n.type}</span>
                    {n.priority === "high" && <span className="text-[10px] font-bold bg-red-100 text-red-700 rounded px-1.5 py-0.5">PENTING</span>}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">{n.message}</div>
                  <div className="text-[10px] text-gray-400 mt-1">{new Date(n.created_at).toLocaleString("id-ID")}</div>
                </div>
                {!n.is_read && <button onClick={() => markRead(n.id)} className="text-xs text-[#1a6b3c] font-semibold hover:underline flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Dibaca</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Pengaturan</h2>
        <div>
          <Label>Nomor WhatsApp Penerima</Label>
          <Input data-testid="recipient-phone-input" value={settings.recipient_phone} onChange={(e) => setSettings({ ...settings, recipient_phone: e.target.value })}
            placeholder="08123456789 atau 628123456789" className="font-mono" />
          <p className="text-xs text-gray-500 mt-1">Format: nomor lokal (08xxx) atau internasional (628xxx)</p>
        </div>
        <div className="space-y-2">
          {NOTIF_TYPES.map((t) => {
            const key = t.key === "low-stock" ? "low_stock_alerts" : (t.key === "daily-summary" ? "daily_summary" : "payroll_alerts");
            return (
              <div key={t.key} className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${t.bg}`}><t.icon className={`w-4 h-4 ${t.color}`} /></div>
                  <div>
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-xs text-gray-500">{t.desc}</div>
                  </div>
                </div>
                <Switch data-testid={`toggle-${t.key}`} checked={settings[key]} onCheckedChange={(c) => setSettings({ ...settings, [key]: c })} />
              </div>
            );
          })}
        </div>
        <Button onClick={saveSettings} data-testid="save-notif-settings-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">
          <Save className="w-4 h-4 mr-1.5" /> Simpan Pengaturan
        </Button>
      </div>

      {/* Quick send */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-emerald-600" /> Kirim Notifikasi Sekarang
        </h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {NOTIF_TYPES.map((t) => (
            <button key={t.key} onClick={() => generate(t.key)} data-testid={`gen-${t.key}-btn`}
              className="border border-gray-200 rounded-lg p-4 text-left hover:border-[#1a6b3c] hover:shadow-sm transition-all">
              <div className={`p-2 rounded-lg ${t.bg} inline-block mb-2`}><t.icon className={`w-5 h-5 ${t.color}`} /></div>
              <div className="font-semibold text-sm">{t.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">Klik untuk generate pesan</div>
            </button>
          ))}
        </div>

        {Object.entries(previews).map(([key, data]) => {
          const meta = NOTIF_TYPES.find((t) => t.key === key);
          return (
            <div key={key} className="border border-gray-200 rounded-lg overflow-hidden" data-testid={`preview-${key}`}>
              <div className={`px-3 py-2 ${meta.bg} text-sm font-semibold ${meta.color} flex items-center gap-2`}>
                <meta.icon className="w-4 h-4" /> {meta.label}
                {data.count !== undefined && <span className="text-xs">({data.count} item)</span>}
              </div>
              <div className="p-3 bg-gray-50">
                <pre className="text-xs whitespace-pre-wrap font-sans text-gray-800">{data.text}</pre>
              </div>
              <div className="px-3 py-2 bg-white border-t border-gray-100 flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => copyText(data.text)}><Copy className="w-3.5 h-3.5 mr-1" /> Salin</Button>
                <Button size="sm" data-testid={`send-${key}-btn`} onClick={() => sendWA(data.text)} className="bg-emerald-600 hover:bg-emerald-700">
                  <Send className="w-3.5 h-3.5 mr-1" /> Kirim WA
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded-lg p-3">
        💡 <strong>Tips:</strong> Untuk otomatisasi penuh (kirim jadwal harian/mingguan), gunakan WhatsApp Business API atau Twilio. Saat ini sistem generate pesan + buka WhatsApp dengan teks pre-filled (klik kirim manual).
      </div>

      {/* Custom Templates */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-purple-600" /> Template Notifikasi Kustom
          </h2>
          <Button data-testid="add-template-btn" onClick={() => setEditTpl({ ...initialTpl })} className="bg-purple-600 hover:bg-purple-700">
            <Plus className="w-4 h-4 mr-1" /> Tambah Template
          </Button>
        </div>
        {templates.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-8 border border-dashed rounded-lg">
            Belum ada template kustom. Klik "Tambah Template" untuk buat pesan personalisasi (mis. promo, pengumuman, dll).
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} data-testid={`tpl-row-${t.id}`} className="border border-gray-100 rounded-lg p-3 flex items-start gap-3 hover:border-purple-200 hover:bg-purple-50/30 transition-colors">
                <div className="text-2xl shrink-0">{t.icon || "💬"}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{t.title}</span>
                    {!t.enabled && <span className="text-[10px] font-bold bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">NON-AKTIF</span>}
                  </div>
                  <div className="text-xs text-gray-500 line-clamp-2 mt-0.5 font-mono">{t.body}</div>
                </div>
                <div className="flex gap-1">
                  <button data-testid={`tpl-preview-${t.id}`} onClick={() => previewTemplate(t.id)} className="p-1.5 text-gray-500 hover:text-purple-600" title="Preview"><Eye className="w-4 h-4" /></button>
                  <button data-testid={`tpl-edit-${t.id}`} onClick={() => setEditTpl({ ...t })} className="p-1.5 text-gray-500 hover:text-blue-600" title="Edit"><Edit2 className="w-4 h-4" /></button>
                  <button data-testid={`tpl-delete-${t.id}`} onClick={() => removeTemplate(t.id, t.title)} className="p-1.5 text-gray-500 hover:text-red-600" title="Hapus"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Preview output */}
        {Object.entries(previews).filter(([k]) => k.startsWith("tpl-")).map(([k, v]) => (
          <div key={k} className="border border-purple-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-purple-50 text-sm font-semibold text-purple-700">Preview Template (variabel sudah dirender)</div>
            <div className="p-3 bg-gray-50"><pre className="text-xs whitespace-pre-wrap font-sans text-gray-800">{v.text}</pre></div>
            <div className="px-3 py-2 bg-white border-t flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => copyText(v.text)}><Copy className="w-3.5 h-3.5 mr-1" /> Salin</Button>
              <Button size="sm" onClick={() => sendWA(v.text)} className="bg-emerald-600 hover:bg-emerald-700"><Send className="w-3.5 h-3.5 mr-1" /> Kirim WA</Button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Template Dialog */}
      <Dialog open={!!editTpl} onOpenChange={() => setEditTpl(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTpl?.id ? "Edit Template" : "Tambah Template Baru"}</DialogTitle>
          </DialogHeader>
          {editTpl && (
            <div className="space-y-3">
              <div className="grid grid-cols-[80px_1fr] gap-2">
                <div>
                  <Label>Ikon</Label>
                  <Input data-testid="tpl-icon-input" value={editTpl.icon || ""} onChange={(e) => setEditTpl({ ...editTpl, icon: e.target.value })} placeholder="💬" className="text-center text-2xl" />
                </div>
                <div>
                  <Label>Judul Template</Label>
                  <Input data-testid="tpl-title-input" value={editTpl.title} onChange={(e) => setEditTpl({ ...editTpl, title: e.target.value })} placeholder="Promo Akhir Pekan" />
                </div>
              </div>
              <div>
                <Label>Isi Pesan (WhatsApp markdown didukung)</Label>
                <Textarea data-testid="tpl-body-input" rows={8} value={editTpl.body} onChange={(e) => setEditTpl({ ...editTpl, body: e.target.value })}
                  placeholder={"Halo!\nIni laporan hari ini ({today}):\n💰 Pendapatan: {revenue}\n💸 Pengeluaran: {expense}\n📊 Laba: {net_profit}\n🧾 {tx_count} transaksi"} />
                <p className="text-[11px] text-gray-500 mt-1">Variabel: <code className="bg-gray-100 px-1">{"{today}"}</code> <code className="bg-gray-100 px-1">{"{time}"}</code> <code className="bg-gray-100 px-1">{"{revenue}"}</code> <code className="bg-gray-100 px-1">{"{expense}"}</code> <code className="bg-gray-100 px-1">{"{net_profit}"}</code> <code className="bg-gray-100 px-1">{"{tx_count}"}</code></p>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={editTpl.enabled} onCheckedChange={(c) => setEditTpl({ ...editTpl, enabled: c })} />
                <Label className="font-normal">Aktifkan template ini</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTpl(null)}>Batal</Button>
            <Button data-testid="save-template-btn" onClick={saveTemplate} className="bg-purple-600 hover:bg-purple-700">
              <Save className="w-4 h-4 mr-1" /> Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
