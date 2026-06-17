import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Beaker, Play, CheckCircle2, XCircle, Printer, Edit2, Trash2 } from "lucide-react";
import api, { formatRupiah, formatDateTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { printThermalLabel, isPrinterAvailable } from "@/lib/printer";
import { printViaIframe, thermal80Css } from "@/lib/safePrint";

export default function Pupuk() {
  const [params] = useSearchParams();
  const focusBatch = params.get("batch") || "";
  const [recipes, setRecipes] = useState([]);
  const [batches, setBatches] = useState([]);
  const [show, setShow] = useState(false);
  const [recipeId, setRecipeId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [preview, setPreview] = useState(null);
  const [notes, setNotes] = useState("");
  const [inventory, setInventory] = useState([]);
  const [selectedBatches, setSelectedBatches] = useState({});
  const [editBatch, setEditBatch] = useState(null);
  const [editBatchForm, setEditBatchForm] = useState({ batch_no: "", notes: "" });

  const load = async () => {
    const [b, h, inv] = await Promise.all([api.get("/bom"), api.get("/production/batches"), api.get("/inventory")]);
    setRecipes(b.data.filter((r) => r.type === "fertilizer"));
    setBatches(h.data);
    setInventory(inv.data || []);
  };
  useEffect(() => { load(); }, []);

  const onPreview = async () => {
    if (!recipeId || !quantity) return toast.error("Pilih resep & jumlah");
    try {
      const { data } = await api.post("/production/preview", { recipe_id: recipeId, quantity: parseInt(quantity) });
      setPreview(data);
    } catch (e) { toast.error("Gagal memuat preview"); }
  };

  const startProduction = async () => {
    try {
      await api.post("/production/batches", { recipe_id: recipeId, quantity: parseInt(quantity), notes, force: !preview?.can_produce, selected_batches: selectedBatches });
      toast.success("Produksi selesai. Stok produk bertambah.");
      setShow(false); setPreview(null); setRecipeId(""); setQuantity(1); setNotes(""); setSelectedBatches({});
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal memproses"); }
  };

  const printProductionThermal = async (b) => {
    try {
      const code = `aw:production:${b.id || b.batch_no}`;
      const target = `${window.location.origin}/scan?code=${encodeURIComponent(code)}`;
      if (!isPrinterAvailable()) {
        const qr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(target)}`;
        printViaIframe({
          title: `Label ${b.batch_no || b.recipe_name}`,
          css: thermal80Css(),
          preferWindow: true,
          bodyHtml: `<div class='thermal-print center'><div class='big'>${b.recipe_name || 'Produksi'}</div><div>Batch: ${b.batch_no || '-'}</div><img class='qr' src='${qr}'/><div>${b.quantity || ''} unit</div><div class='small'>Scan QR untuk riwayat produksi</div></div>`
        });
        return toast.info('Bluetooth langsung tidak tersedia. Dibuka mode print QR 80mm.');
      }
      await printThermalLabel({
        title: b.recipe_name || 'Produksi', subtitle: b.batch_no || b.id,
        lines: [`Jumlah: ${b.quantity} unit`, `Biaya: ${formatRupiah(b.actual_cost || 0)}`, `Waktu: ${formatDateTime(b.created_at)}`],
        qrData: target, footer: 'AgriWarung Produksi'
      });
      toast.success('Label produksi dikirim ke printer thermal');
    } catch (e) { toast.error(e?.message || 'Gagal print thermal'); }
  };

  const openEditBatch = (b) => {
    setEditBatch(b);
    setEditBatchForm({ batch_no: b.batch_no || "", notes: b.notes || "" });
  };

  const saveEditBatch = async () => {
    if (!editBatch) return;
    try {
      await api.put(`/production/batches/${editBatch.id}`, editBatchForm);
      toast.success("Riwayat produksi diperbarui");
      setEditBatch(null);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal update riwayat produksi"); }
  };

  const deleteProductionBatch = async (b) => {
    if (!window.confirm(`Hapus/batalkan produksi ${b.batch_no || b.recipe_name}?\nStok barang jadi akan dikurangi dan bahan baku dikembalikan.`)) return;
    try {
      await api.delete(`/production/batches/${b.id}`);
      toast.success("Produksi dibatalkan dan stok dikembalikan");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal hapus produksi"); }
  };

  const inventoryById = Object.fromEntries((inventory || []).map((it) => [it.id, it]));

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Produksi</h1>
          <p className="text-sm text-gray-500 mt-0.5">Batch produksi dengan checklist bahan</p>
        </div>
        <div className="flex gap-2">
          <Button data-testid="start-production-btn" onClick={() => setShow(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]">
            <Play className="w-4 h-4 mr-1.5" /> Mulai Produksi
          </Button>
        </div>
      </div>

      <Tabs defaultValue="history" className="bg-white rounded-xl border border-gray-100">
        <TabsList className="bg-gray-50 m-1">
          <TabsTrigger value="history">Riwayat Batch</TabsTrigger>
          <TabsTrigger value="recipes">Formula</TabsTrigger>
        </TabsList>
        <TabsContent value="history" className="p-2">
          {batches.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">Belum ada batch produksi</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {batches.map((b) => { const active = focusBatch && (focusBatch === b.id || focusBatch === b.batch_no); return (
                <div key={b.id} data-testid={`batch-${b.id}`} className={`flex items-center gap-3 py-3 px-2 ${active ? 'bg-emerald-50 ring-1 ring-emerald-200' : ''}`}>
                  <div className="p-2 bg-amber-50 rounded-lg"><Beaker className="w-4 h-4 text-amber-700" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{b.batch_no}</div>
                    <div className="text-xs text-gray-500">{b.recipe_name} · {formatDateTime(b.created_at)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold">{b.quantity} unit</div>
                    <div className="text-xs text-gray-500 font-mono">{formatRupiah(b.actual_cost)}</div>
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    <Button size="sm" variant="outline" onClick={() => printProductionThermal(b)}><Printer className="w-3.5 h-3.5 mr-1" /> Thermal</Button>
                    <Button size="sm" variant="outline" onClick={() => openEditBatch(b)}><Edit2 className="w-3.5 h-3.5 mr-1" /> Edit</Button>
                    <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => deleteProductionBatch(b)}><Trash2 className="w-3.5 h-3.5 mr-1" /> Hapus</Button>
                  </div>
                </div>
              );})}
            </div>
          )}
        </TabsContent>
        <TabsContent value="recipes" className="p-4">
          {recipes.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Belum ada formula. Tambahkan di menu Resep & BOM.</div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {recipes.map((r) => (
                <div key={r.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="font-semibold text-sm">{r.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{r.ingredients.length} bahan</div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={show} onOpenChange={(o) => { setShow(o); if (!o) { setPreview(null); setSelectedBatches({}); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Mulai Produksi</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Pilih Formula</Label>
              <Select value={recipeId} onValueChange={setRecipeId}>
                <SelectTrigger data-testid="prod-recipe-select"><SelectValue placeholder="Pilih formula" /></SelectTrigger>
                <SelectContent>{recipes.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Jumlah Batch</Label>
              <Input data-testid="prod-qty-input" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <Button onClick={onPreview} variant="outline" className="w-full">Cek Ketersediaan Bahan</Button>

            {preview && (
              <div className={`rounded-lg border p-3 ${preview.can_produce ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  {preview.can_produce ? <CheckCircle2 className="w-4 h-4 text-emerald-700" /> : <XCircle className="w-4 h-4 text-red-700" />}
                  {preview.can_produce ? "Bahan mencukupi" : "Stok bahan tidak cukup"}
                </div>
                <div className="space-y-1">
                  {preview.checklist.map((c) => {
                    const item = inventoryById[c.item_id] || {};
                    return (
                    <div key={c.item_id} className="space-y-1 border-b border-gray-200 last:border-0 pb-1.5">
                      <div className="flex justify-between text-xs">
                        <span>{c.name}</span>
                        <span className={`font-mono ${c.sufficient ? "text-emerald-700" : "text-red-700 font-semibold"}`}>
                          {c.required} / {c.available} {c.unit}
                        </span>
                      </div>
                      <select
                        value={selectedBatches[c.item_id] || ""}
                        onChange={(e) => setSelectedBatches((p) => ({ ...p, [c.item_id]: e.target.value }))}
                        className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700"
                      >
                        <option value="">FIFO otomatis: batch masuk lebih dulu dipakai dulu</option>
                        {(item.recent_batches || []).filter((b) => Number(b.remaining_quantity ?? b.quantity ?? 0) > 0).map((b) => (
                          <option key={b.id || b.batch_no} value={b.batch_no || b.id}>{b.batch_no} · sisa {Number(b.remaining_quantity ?? b.quantity ?? 0).toFixed(2)} {b.unit || c.unit || ""}</option>
                        ))}
                      </select>
                    </div>
                  );})}
                </div>
                <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between text-sm">
                  <span className="font-medium">Estimasi Biaya</span>
                  <span className="font-mono font-semibold">{formatRupiah(preview.total_estimated_cost)}</span>
                </div>
              </div>
            )}

            <div>
              <Label>Catatan</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShow(false)}>Batal</Button>
            <Button data-testid="confirm-production-btn" onClick={startProduction}
              disabled={!preview}
              className={preview?.can_produce ? "bg-[#1a6b3c] hover:bg-[#14522d]" : "bg-[#e53e3e] hover:bg-red-700"}>
              {preview?.can_produce ? "Selesai Produksi" : (preview ? "Override & Produksi" : "Cek Bahan Dulu")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editBatch} onOpenChange={(o) => { if (!o) setEditBatch(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Riwayat Produksi</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>No Batch</Label>
              <Input value={editBatchForm.batch_no} onChange={(e) => setEditBatchForm((p) => ({ ...p, batch_no: e.target.value }))} />
            </div>
            <div>
              <Label>Catatan</Label>
              <Input value={editBatchForm.notes} onChange={(e) => setEditBatchForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2">Edit hanya mengubah label/catatan. Jumlah produksi tidak diubah agar stok dan HPP tidak rusak.</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBatch(null)}>Batal</Button>
            <Button onClick={saveEditBatch}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
