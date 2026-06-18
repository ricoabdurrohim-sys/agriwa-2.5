import React, { useEffect, useState } from "react";
import { Plus, Edit2, Trash2, Briefcase, Palette } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import ImageUpload from "@/components/ImageUpload";
import { toast } from "sonner";

const DEFAULT_CODES = ["warung", "anggur", "pupuk", "pembibitan", "gudang"];
const COLORS = ["#1a6b3c", "#ea580c", "#6b46c1", "#b45309", "#059669", "#2563eb", "#dc2626", "#0891b2", "#7c3aed", "#db2777"];

const init = { code: "", name: "", receipt_name: "", receipt_address: "", receipt_phone: "", receipt_footer: "", receipt_note: "", receipt_logo: "", receipt_show_qr: true, description: "", color: "#1a6b3c", active: true, auto_batch_enabled: true, batch_on_purchase: true, batch_on_production: false, batch_on_harvest: true, batch_on_farm: true };

export default function BusinessUnits() {
  const [units, setUnits] = useState([]);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(init);

  const load = async () => { const { data } = await api.get("/business-units"); setUnits(data); };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name || !form.code) return toast.error("Nama dan kode wajib");
    try {
      if (editing) await api.put(`/business-units/${editing.id}`, form);
      else await api.post("/business-units", { ...form, code: form.code.toLowerCase().replace(/\s+/g, "_") });
      setShow(false); setEditing(null); setForm(init); load();
      toast.success("Tersimpan");
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  const del = async (u) => {
    if (DEFAULT_CODES.includes(u.code)) return toast.error("Unit default tidak bisa dihapus");
    if (!window.confirm(`Hapus unit ${u.name}?`)) return;
    await api.delete(`/business-units/${u.id}`);
    load();
  };

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Unit Bisnis</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola lini bisnis untuk pemisahan laporan & alokasi modal</p>
        </div>
        <Button data-testid="add-unit-btn" onClick={() => { setEditing(null); setForm(init); setShow(true); }} className="bg-[#1a6b3c] hover:bg-[#14522d]">
          <Plus className="w-4 h-4 mr-1.5" /> Lini Bisnis Baru
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {units.map((u) => (
          <div key={u.id} data-testid={`unit-${u.code}`} className="bg-white rounded-xl border border-gray-100 p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: u.color }} />
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg" style={{ background: u.color + "20" }}>
                  <Briefcase className="w-4 h-4" style={{ color: u.color }} />
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{u.name}</div>
                  <div className="text-xs text-gray-500 font-mono">{u.code}</div>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditing(u); setForm({ ...init, ...u }); setShow(true); }} className="p-1.5 text-gray-500 hover:text-[#1a6b3c]"><Edit2 className="w-3.5 h-3.5" /></button>
                {!DEFAULT_CODES.includes(u.code) && (
                  <button onClick={() => del(u)} className="p-1.5 text-gray-500 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </div>
            </div>
            {u.description && <div className="text-xs text-gray-600 mt-2">{u.description}</div>}
            {(u.receipt_address || u.receipt_footer || u.receipt_note || u.receipt_show_qr === false) && <div className="text-[11px] text-gray-500 mt-2 border-t border-gray-100 pt-2">Struk: {u.receipt_address || "alamat kosong"} · QR struk {u.receipt_show_qr === false ? "mati" : "aktif"}</div>}
            {!u.active && <Badge variant="secondary" className="mt-2">Nonaktif</Badge>}
          </div>
        ))}
      </div>

      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Lini Bisnis" : "Lini Bisnis Baru"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pb-2">
            <div><Label>Nama</Label><Input data-testid="unit-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, code: editing ? form.code : e.target.value.toLowerCase().replace(/\s+/g, "_") })} placeholder="Bisnis Catering" /></div>
            <div><Label>Kode (slug)</Label><Input data-testid="unit-code-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/\s+/g, "_") })} disabled={editing} className="font-mono" /></div>
            <div>
              <Label>Nama di Struk / Nota</Label>
              <Textarea data-testid="unit-receipt-name-input" value={form.receipt_name || ""} onChange={(e) => setForm({ ...form, receipt_name: e.target.value })} placeholder="Mis:\nWarung Pak Didi\nCabang Boyolali" className="min-h-[72px]" />
              <p className="text-[11px] text-gray-500 mt-1">Tekan Enter untuk turun baris. Format ini ikut ke struk 80mm.</p>
            </div>
            <div><Label>Alamat di Struk</Label><Textarea data-testid="unit-receipt-address-input" value={form.receipt_address || ""} onChange={(e) => setForm({ ...form, receipt_address: e.target.value })} placeholder="Alamat khusus lini bisnis ini" className="min-h-[72px]" /></div>
            <div><Label>Telepon di Struk</Label><Input data-testid="unit-receipt-phone-input" value={form.receipt_phone || ""} onChange={(e) => setForm({ ...form, receipt_phone: e.target.value })} placeholder="08xxx / 0276..." /></div>
            <div><Label>Footer Struk</Label><Textarea data-testid="unit-receipt-footer-input" value={form.receipt_footer || ""} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} placeholder="Terima kasih\nBarang yang sudah dibeli tidak dapat dikembalikan" className="min-h-[86px]" /></div>
            <div><Label>Catatan Struk</Label><Textarea data-testid="unit-receipt-note-input" value={form.receipt_note || ""} onChange={(e) => setForm({ ...form, receipt_note: e.target.value })} placeholder="Catatan tambahan di bawah struk" className="min-h-[72px]" /></div>
            <ImageUpload value={form.receipt_logo || ""} onChange={(v) => setForm({ ...form, receipt_logo: v })} label="Logo/Gambar di Struk (opsional)" testid="unit-receipt-logo" />
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <label className="flex items-start gap-3 text-sm text-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.receipt_show_qr !== false}
                  onChange={(e) => setForm({ ...form, receipt_show_qr: e.target.checked })}
                  className="mt-1 accent-[#1a6b3c]"
                  data-testid="unit-receipt-show-qr-input"
                />
                <span>
                  <span className="font-semibold block">Tampilkan QR code di struk transaksi</span>
                  <span className="text-xs text-gray-500">Default aktif. Matikan jika lini bisnis ini tidak ingin mencetak QR/scan nota di struk pembayaran.</span>
                </span>
              </label>
            </div>
            <div><Label>Deskripsi</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 space-y-2">
              <div className="text-sm font-semibold text-emerald-900">Pengaturan Batch Otomatis</div>
              {[
                ['auto_batch_enabled','Aktifkan batch otomatis untuk lini ini'],
                ['batch_on_purchase','Batch saat pembelian/stok masuk'],
                ['batch_on_production','Batch saat produksi'],
                ['batch_on_harvest','Batch saat panen/hasil ternak'],
              ].map(([key,label]) => (
                <label key={key} className="flex items-center gap-2 text-xs text-emerald-900">
                  <input type="checkbox" checked={form[key] !== false} onChange={(e)=>setForm({...form,[key]:e.target.checked})} className="accent-[#1a6b3c]" />
                  {label}
                </label>
              ))}
              <p className="text-[11px] text-emerald-800">Contoh: lini Pupuk/Kebun/Peternakan aktifkan produksi/panen agar setiap hasil otomatis punya batch dan bisa diprint label.</p>
            </div>
            <div>
              <Label className="flex items-center gap-1"><Palette className="w-3.5 h-3.5" /> Warna</Label>
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                    className={`w-7 h-7 rounded-full border-2 ${form.color === c ? "border-gray-900 scale-110" : "border-white"} shadow-sm transition-transform`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShow(false)}>Batal</Button>
            <Button onClick={save} data-testid="save-unit-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
