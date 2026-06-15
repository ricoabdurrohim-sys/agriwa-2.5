import React, { useEffect, useState } from "react";
import { Plus, Tag, Calendar, Trash2, Copy } from "lucide-react";
import api, { formatRupiah, formatDate } from "@/lib/api";
import ResetModuleButton from "@/components/ResetModuleButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const init = {
  name: "", code: "", discount_type: "percentage", discount_value: 0,
  scope: "total", target_ids: [], min_purchase: 0, max_discount: 0,
  start_date: "", end_date: "", max_uses: 0, active: true,
};

const CATEGORIES = ["Bahan Baku Warung", "Bahan Baku Pupuk", "Bibit Anggur", "Buah Anggur", "Barang Jadi"];

export default function Promo() {
  const [promos, setPromos] = useState([]);
  const [items, setItems] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(init);

  const load = async () => {
    const [p, i] = await Promise.all([api.get("/promos"), api.get("/inventory")]);
    setPromos(p.data); setItems(i.data);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name) return toast.error("Nama promo wajib");
    if (!form.discount_value) return toast.error("Nilai diskon wajib");
    try {
      const payload = {
        ...form,
        discount_value: parseInt(form.discount_value) || 0,
        min_purchase: parseInt(form.min_purchase) || 0,
        max_discount: parseInt(form.max_discount) || 0,
        max_uses: parseInt(form.max_uses) || 0,
      };
      await api.post("/promos", payload);
      toast.success("Promo dibuat");
      setShow(false); setForm(init); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  const del = async (id) => { if (!window.confirm("Hapus promo?")) return; await api.delete(`/promos/${id}`); load(); };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    toast.success(`Kode ${code} disalin`);
  };

  const isActive = (p) => {
    const now = new Date().toISOString();
    if (!p.active) return false;
    if (p.start_date && now < p.start_date) return false;
    if (p.end_date && now > p.end_date) return false;
    if (p.max_uses && p.used_count >= p.max_uses) return false;
    return true;
  };

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Promo & Diskon</h1>
          <p className="text-sm text-gray-500 mt-0.5">Rules-based discount: per-item, kategori, atau total</p>
        </div>
        <div className="flex gap-2">
          <ResetModuleButton module="promo" label="Promo" />
          <Button data-testid="add-promo-btn" onClick={() => { setForm(init); setShow(true); }} className="bg-[#f4a228] hover:bg-[#d98b1a] text-white">
            <Plus className="w-4 h-4 mr-1.5" /> Promo Baru
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {promos.length === 0 ? (
          <div className="col-span-full bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
            Belum ada promo. Buat promo pertama untuk meningkatkan penjualan.
          </div>
        ) : promos.map((p) => {
          const active = isActive(p);
          return (
            <div key={p.id} data-testid={`promo-${p.id}`} className={`bg-white rounded-xl border-2 p-4 relative ${active ? "border-[#f4a228]" : "border-gray-200 opacity-60"}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-[#f4a228]" />
                    {p.name}
                  </div>
                  {p.code && (
                    <button onClick={() => copyCode(p.code)} className="mt-1 inline-flex items-center gap-1 text-xs font-mono font-semibold bg-amber-50 text-amber-900 px-2 py-1 rounded">
                      {p.code} <Copy className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <button onClick={() => del(p.id)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="text-sm font-mono font-bold text-[#1a6b3c]">
                {p.discount_type === "percentage" ? `${p.discount_value}% OFF` : `Diskon ${formatRupiah(p.discount_value)}`}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Scope: <span className="font-medium">{p.scope}</span>
                {p.min_purchase > 0 && ` · Min ${formatRupiah(p.min_purchase)}`}
              </div>
              <div className="flex gap-2 mt-2 text-xs flex-wrap">
                {p.end_date && <Badge variant="outline">Sampai {formatDate(p.end_date)}</Badge>}
                {p.max_uses > 0 && <Badge variant="outline">{p.used_count || 0}/{p.max_uses}</Badge>}
                {active ? <Badge className="bg-emerald-100 text-emerald-700">Aktif</Badge> : <Badge variant="secondary">Tidak Aktif</Badge>}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Promo Baru</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nama Promo</Label><Input data-testid="promo-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Diskon Akhir Pekan" /></div>
              <div><Label>Kode (opsional)</Label><Input data-testid="promo-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="WEEKEND10" className="font-mono uppercase" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipe</Label>
                <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v })}>
                  <SelectTrigger data-testid="promo-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Persentase (%)</SelectItem>
                    <SelectItem value="fixed">Nominal (Rp)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nilai {form.discount_type === "percentage" ? "(%)" : "(Rp)"}</Label>
                <Input data-testid="promo-value" type="number" value={form.discount_value || ""} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Berlaku Pada</Label>
              <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v, target_ids: [] })}>
                <SelectTrigger data-testid="promo-scope"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Total Pembelian</SelectItem>
                  <SelectItem value="item">Item Tertentu</SelectItem>
                  <SelectItem value="category">Kategori Tertentu</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.scope === "item" && (
              <div>
                <Label>Pilih Item</Label>
                <div className="max-h-32 overflow-y-auto border border-gray-200 rounded p-2 space-y-1">
                  {items.filter((i) => i.sell_price > 0).map((i) => (
                    <label key={i.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" className="accent-[#1a6b3c]" checked={form.target_ids.includes(i.id)}
                        onChange={(e) => {
                          setForm({ ...form, target_ids: e.target.checked ? [...form.target_ids, i.id] : form.target_ids.filter(x => x !== i.id) });
                        }} />
                      {i.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {form.scope === "category" && (
              <div>
                <Label>Pilih Kategori</Label>
                <div className="space-y-1">
                  {CATEGORIES.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" className="accent-[#1a6b3c]" checked={form.target_ids.includes(c)}
                        onChange={(e) => setForm({ ...form, target_ids: e.target.checked ? [...form.target_ids, c] : form.target_ids.filter(x => x !== c) })} />
                      {c}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Min. Pembelian (Rp)</Label><Input type="number" value={form.min_purchase || ""} onChange={(e) => setForm({ ...form, min_purchase: e.target.value })} /></div>
              <div><Label>Maks. Diskon (Rp)</Label><Input type="number" value={form.max_discount || ""} onChange={(e) => setForm({ ...form, max_discount: e.target.value })} placeholder="0 = tanpa batas" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tanggal Mulai</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><Label>Tanggal Berakhir</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            </div>
            <div><Label>Maks. Penggunaan (0 = unlimited)</Label><Input type="number" value={form.max_uses || ""} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShow(false)}>Batal</Button>
            <Button onClick={save} data-testid="save-promo-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan Promo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
