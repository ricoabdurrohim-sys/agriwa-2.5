import React, { useEffect, useState } from "react";
import { Plus, Trash2, ChefHat } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function BOM() {
  const [boms, setBoms] = useState([]);
  const [items, setItems] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ output_item_id: "", name: "", type: "menu", ingredients: [{ item_id: "", quantity: 0 }] });

  const load = async () => {
    const [b, i] = await Promise.all([api.get("/bom"), api.get("/inventory")]);
    setBoms(b.data); setItems(i.data);
  };
  useEffect(() => { load(); }, []);

  const itemName = (id) => items.find((x) => x.id === id)?.name || "—";
  const itemUnit = (id) => items.find((x) => x.id === id)?.unit || "";

  const save = async () => {
    if (!form.output_item_id || form.ingredients.some((i) => !i.item_id)) return toast.error("Lengkapi data");
    const out = items.find((x) => x.id === form.output_item_id);
    await api.post("/bom", { ...form, name: out?.name || form.name });
    toast.success("Resep tersimpan"); setShow(false);
    setForm({ output_item_id: "", name: "", type: "menu", ingredients: [{ item_id: "", quantity: 0 }] });
    load();
  };

  const del = async (id) => { if (!window.confirm("Hapus resep?")) return; await api.delete(`/bom/${id}`); load(); };

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Resep & BOM</h1>
          <p className="text-sm text-gray-500 mt-0.5">Bill of Materials — daftar bahan untuk menu & pupuk</p>
        </div>
        <Button data-testid="add-bom-btn" onClick={() => setShow(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]">
          <Plus className="w-4 h-4 mr-1.5" /> Resep Baru
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {boms.length === 0 && (
          <div className="col-span-full bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
            Belum ada resep. Buat resep pertama Anda untuk auto-deduct stok saat penjualan.
          </div>
        )}
        {boms.map((b) => (
          <div key={b.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <ChefHat className="w-4 h-4 text-[#1a6b3c]" />
                  <span className="font-semibold text-gray-900">{b.name}</span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5 capitalize">{b.type === "menu" ? "Resep Menu" : "Formula Pupuk"}</div>
              </div>
              <button onClick={() => del(b.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="space-y-1.5">
              {b.ingredients.map((ing, i) => (
                <div key={`${ing.item_id || 'ing'}-${i}`} className="flex justify-between text-sm">
                  <span className="text-gray-700">{itemName(ing.item_id)}</span>
                  <span className="font-mono text-gray-600">{ing.quantity} {itemUnit(ing.item_id)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Tambah Resep / BOM</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipe</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="menu">Menu (Warung)</SelectItem>
                  <SelectItem value="fertilizer">Pupuk</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Produk Output</Label>
              <Select value={form.output_item_id} onValueChange={(v) => setForm({ ...form, output_item_id: v })}>
                <SelectTrigger data-testid="bom-output-select"><SelectValue placeholder="Pilih produk akhir" /></SelectTrigger>
                <SelectContent>
                  {items.filter((i) => i.sell_price > 0 || form.type === "fertilizer").map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Bahan</Label>
              <div className="space-y-2">
                {form.ingredients.map((ing, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Select value={ing.item_id} onValueChange={(v) => {
                      const next = [...form.ingredients]; next[idx] = { ...next[idx], item_id: v }; setForm({ ...form, ingredients: next });
                    }}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Pilih bahan" /></SelectTrigger>
                      <SelectContent>{items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" step="any" className="w-24 font-mono" placeholder="Qty" value={ing.quantity || ""}
                      onChange={(e) => { const next = [...form.ingredients]; next[idx] = { ...next[idx], quantity: parseFloat(e.target.value) || 0 }; setForm({ ...form, ingredients: next }); }} />
                    <button onClick={() => { const next = form.ingredients.filter((_, i) => i !== idx); setForm({ ...form, ingredients: next.length ? next : [{ item_id: "", quantity: 0 }] }); }} className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                <button onClick={() => setForm({ ...form, ingredients: [...form.ingredients, { item_id: "", quantity: 0 }] })} className="text-xs text-[#1a6b3c] font-medium">+ Tambah Bahan</button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShow(false)}>Batal</Button>
            <Button onClick={save} data-testid="save-bom-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
