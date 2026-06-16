import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Beaker, Play, History, CheckCircle2, XCircle, Printer, QrCode } from "lucide-react";
import api, { formatRupiah, formatDateTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { printThermalLabel, isPrinterAvailable } from "@/lib/printer";

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

  const load = async () => {
    const [b, h] = await Promise.all([api.get("/bom"), api.get("/production/batches")]);
    setRecipes(b.data.filter((r) => r.type === "fertilizer"));
    setBatches(h.data);
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
      await api.post("/production/batches", { recipe_id: recipeId, quantity: parseInt(quantity), notes, force: !preview?.can_produce });
      toast.success("Produksi selesai. Stok produk bertambah.");
      setShow(false); setPreview(null); setRecipeId(""); setQuantity(1); setNotes("");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal memproses"); }
  };

  const printProductionThermal = async (b) => {
    try {
      if (!isPrinterAvailable()) return toast.error("Web Bluetooth tidak didukung di browser ini");
      const code = `aw:production:${b.id || b.batch_no}`;
      const target = `${window.location.origin}/scan?code=${encodeURIComponent(code)}`;
      await printThermalLabel({
        title: b.recipe_name || 'Produksi', subtitle: b.batch_no || b.id,
        lines: [`Jumlah: ${b.quantity} unit`, `Biaya: ${formatRupiah(b.actual_cost || 0)}`, `Waktu: ${formatDateTime(b.created_at)}`],
        qrData: target, footer: 'AgriWarung Produksi'
      });
      toast.success('Label produksi dikirim ke printer thermal');
    } catch (e) { toast.error(e?.message || 'Gagal print thermal'); }
  };

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
                  <Button size="sm" variant="outline" onClick={() => printProductionThermal(b)}><Printer className="w-3.5 h-3.5 mr-1" /> Thermal</Button>
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

      <Dialog open={show} onOpenChange={(o) => { setShow(o); if (!o) setPreview(null); }}>
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
                  {preview.checklist.map((c) => (
                    <div key={c.item_id} className="flex justify-between text-xs">
                      <span>{c.name}</span>
                      <span className={`font-mono ${c.sufficient ? "text-emerald-700" : "text-red-700 font-semibold"}`}>
                        {c.required} / {c.available} {c.unit}
                      </span>
                    </div>
                  ))}
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
    </div>
  );
}
