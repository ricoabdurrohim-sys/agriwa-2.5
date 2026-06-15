import React, { useEffect, useState } from "react";
import { Plus, Building2, Edit2, Trash2, MapPin, Phone, User } from "lucide-react";
import api, { formatRupiah } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const init = { code: "", name: "", address: "", phone: "", manager: "", active: true };

export default function Branches() {
  const [branches, setBranches] = useState([]);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(init);

  const load = async () => { const { data } = await api.get("/branches"); setBranches(data); };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name || !form.code) return toast.error("Nama dan kode wajib");
    try {
      if (editing) await api.put(`/branches/${editing.id}`, form);
      else await api.post("/branches", { ...form, code: form.code.toLowerCase().replace(/\s+/g, "_") });
      setShow(false); setEditing(null); setForm(init); load();
      toast.success("Tersimpan");
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  const del = async (b) => {
    if (b.code === "main") return toast.error("Cabang utama tidak bisa dihapus");
    if (!window.confirm(`Hapus cabang ${b.name}?`)) return;
    try { await api.delete(`/branches/${b.id}`); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  const totalRev = branches.reduce((s, b) => s + (b.total_revenue || 0), 0);
  const totalTx = branches.reduce((s, b) => s + (b.tx_count || 0), 0);

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Cabang / Lokasi</h1>
          <p className="text-sm text-gray-500 mt-0.5">{branches.length} cabang aktif · Total {totalTx} transaksi · {formatRupiah(totalRev)}</p>
        </div>
        <Button data-testid="add-branch-btn" onClick={() => { setEditing(null); setForm(init); setShow(true); }} className="bg-[#1a6b3c] hover:bg-[#14522d]">
          <Plus className="w-4 h-4 mr-1.5" /> Cabang Baru
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {branches.map((b) => (
          <div key={b.id} data-testid={`branch-${b.code}`} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 rounded-lg"><Building2 className="w-5 h-5 text-[#1a6b3c]" /></div>
                <div>
                  <div className="font-semibold text-gray-900">{b.name}</div>
                  <div className="text-xs text-gray-500 font-mono">{b.code}</div>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditing(b); setForm({ ...init, ...b }); setShow(true); }} className="p-1.5 text-gray-500 hover:text-[#1a6b3c]"><Edit2 className="w-3.5 h-3.5" /></button>
                {b.code !== "main" && <button onClick={() => del(b)} className="p-1.5 text-gray-500 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}
              </div>
            </div>
            {b.address && <div className="flex items-start gap-1.5 text-xs text-gray-600 mb-1"><MapPin className="w-3.5 h-3.5 mt-0.5" />{b.address}</div>}
            {b.phone && <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1"><Phone className="w-3.5 h-3.5" />{b.phone}</div>}
            {b.manager && <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-2"><User className="w-3.5 h-3.5" />{b.manager}</div>}
            <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between text-xs">
              <div><span className="text-gray-500">Transaksi: </span><span className="font-mono font-semibold">{b.tx_count || 0}</span></div>
              <div className="font-mono font-semibold text-[#1a6b3c]">{formatRupiah(b.total_revenue || 0)}</div>
            </div>
            {!b.active && <Badge variant="secondary" className="mt-2">Nonaktif</Badge>}
          </div>
        ))}
      </div>

      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Cabang" : "Cabang Baru"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nama Cabang</Label><Input data-testid="branch-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, code: editing ? form.code : e.target.value.toLowerCase().replace(/\s+/g, "_") })} placeholder="Cabang Solo" /></div>
            <div><Label>Kode (slug)</Label><Input data-testid="branch-code-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="font-mono" disabled={editing} /></div>
            <div><Label>Alamat</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>Telepon</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Manager / PIC</Label><Input value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} /></div>
            <div className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
              <div><div className="text-sm font-medium">Status Aktif</div></div>
              <Switch checked={form.active} onCheckedChange={(c) => setForm({ ...form, active: c })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShow(false)}>Batal</Button>
            <Button onClick={save} data-testid="save-branch-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
