import React, { useEffect, useState } from "react";
import { Grape, MapPin, Plus, Wheat, FileText, Trash2 } from "lucide-react";
import api, { formatRupiah, formatDate } from "@/lib/api";
import ResetModuleButton from "@/components/ResetModuleButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const initPlot = { name: "", location: "", area_sqm: 0, variety: "", planted_count: 0, notes: "" };
const initHarv = { plot_id: "", quantity_kg: 0, quality_grade: "A", notes: "" };
const initCust = { name: "", contact: "", address: "", payment_terms: "COD" };
const initInv = { customer_id: "", items: [{ name: "", quantity: 0, unit_price: 0 }], notes: "" };

export default function Anggur() {
  const [plots, setPlots] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [showPlot, setShowPlot] = useState(false);
  const [showHarv, setShowHarv] = useState(false);
  const [showCust, setShowCust] = useState(false);
  const [showInv, setShowInv] = useState(false);
  const [plotForm, setPlotForm] = useState(initPlot);
  const [harvForm, setHarvForm] = useState(initHarv);
  const [custForm, setCustForm] = useState(initCust);
  const [invForm, setInvForm] = useState(initInv);

  const load = async () => {
    const [p, h, c, i] = await Promise.all([
      api.get("/vineyard/plots"), api.get("/vineyard/harvests"),
      api.get("/b2b/customers"), api.get("/b2b/invoices"),
    ]);
    setPlots(p.data); setHarvests(h.data); setCustomers(c.data); setInvoices(i.data);
  };
  useEffect(() => { load(); }, []);

  const savePlot = async () => {
    if (!plotForm.name) return toast.error("Nama plot wajib");
    await api.post("/vineyard/plots", plotForm);
    setPlotForm(initPlot); setShowPlot(false); load(); toast.success("Plot tersimpan");
  };
  const saveHarv = async () => {
    if (!harvForm.plot_id || !harvForm.quantity_kg) return toast.error("Lengkapi data");
    await api.post("/vineyard/harvests", { ...harvForm, quantity_kg: parseFloat(harvForm.quantity_kg) });
    setHarvForm(initHarv); setShowHarv(false); load(); toast.success("Panen dicatat");
  };
  const saveCust = async () => {
    if (!custForm.name) return toast.error("Nama wajib");
    await api.post("/b2b/customers", custForm);
    setCustForm(initCust); setShowCust(false); load(); toast.success("Pelanggan B2B ditambahkan");
  };
  const saveInv = async () => {
    if (!invForm.customer_id || invForm.items.some((i) => !i.name || !i.quantity)) return toast.error("Lengkapi data");
    const cleaned = invForm.items.map((i) => ({ ...i, quantity: parseFloat(i.quantity), unit_price: parseInt(i.unit_price) || 0 }));
    await api.post("/b2b/invoices", { ...invForm, items: cleaned });
    setInvForm(initInv); setShowInv(false); load(); toast.success("Invoice B2B dibuat");
  };

  const payInvoice = async (inv) => {
    const a = window.prompt(`Bayar invoice ${inv.invoice_no} — sisa ${formatRupiah(inv.total - (inv.paid || 0))}. Jumlah?`);
    if (!a) return;
    await api.post(`/b2b/invoices/${inv.id}/pay`, { amount: parseInt(a) });
    load(); toast.success("Pembayaran dicatat");
  };

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Kebun Anggur</h1>
          <p className="text-sm text-gray-500 mt-0.5">Plot kebun, panen, dan invoice B2B</p>
        </div>
        <ResetModuleButton module="anggur" label="Anggur" />
      </div>

      <Tabs defaultValue="plots" className="bg-white rounded-xl border border-gray-100">
        <TabsList className="bg-gray-50 m-1 overflow-x-auto">
          <TabsTrigger value="plots" data-testid="tab-plots">Plot Kebun</TabsTrigger>
          <TabsTrigger value="harvests" data-testid="tab-harvests">Panen</TabsTrigger>
          <TabsTrigger value="b2b" data-testid="tab-b2b">Pelanggan B2B</TabsTrigger>
          <TabsTrigger value="invoices" data-testid="tab-invoices">Invoice B2B</TabsTrigger>
        </TabsList>

        <TabsContent value="plots" className="p-4 space-y-3">
          <Button data-testid="add-plot-btn" onClick={() => setShowPlot(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]">
            <Plus className="w-4 h-4 mr-1.5" /> Plot Baru
          </Button>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {plots.length === 0 ? <div className="col-span-full text-center py-6 text-gray-400 text-sm">Belum ada plot</div> :
              plots.map((p) => (
                <div key={p.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-start gap-2 mb-1">
                    <MapPin className="w-4 h-4 text-[#1a6b3c] mt-0.5" />
                    <div>
                      <div className="font-semibold text-sm">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.location || "—"}</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 mt-2">Varietas: <span className="font-medium">{p.variety || "—"}</span></div>
                  <div className="text-xs text-gray-600">Tanaman: <span className="font-mono">{p.planted_count || 0}</span> · Luas: <span className="font-mono">{p.area_sqm || 0} m²</span></div>
                </div>
              ))}
          </div>
        </TabsContent>

        <TabsContent value="harvests" className="p-4 space-y-3">
          {plots.length === 0 ? (
            <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4 text-sm">
              <div className="font-semibold text-amber-900 mb-1">⚠ Belum ada Plot Kebun</div>
              <div className="text-amber-800 text-xs mb-2">Untuk mencatat panen, Anda harus punya minimal 1 plot kebun terlebih dulu.</div>
              <Button size="sm" onClick={() => { setShowPlot(true); }} className="bg-amber-600 hover:bg-amber-700">
                <Plus className="w-3.5 h-3.5 mr-1" /> Buat Plot Sekarang
              </Button>
            </div>
          ) : (
            <Button data-testid="add-harvest-btn" onClick={() => setShowHarv(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]">
              <Wheat className="w-4 h-4 mr-1.5" /> Catat Panen
            </Button>
          )}
          <div className="divide-y divide-gray-100">
            {harvests.length === 0 ? <div className="text-center py-6 text-gray-400 text-sm">Belum ada panen</div> :
              harvests.map((h) => {
                const p = plots.find((x) => x.id === h.plot_id);
                return (
                  <div key={h.id} className="flex items-center gap-3 py-3">
                    <div className="p-2 bg-purple-50 rounded-lg"><Grape className="w-4 h-4 text-purple-700" /></div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold">{p?.name || "—"}</div>
                      <div className="text-xs text-gray-500">{formatDate(h.date)} · Kualitas {h.quality_grade}</div>
                    </div>
                    <div className="font-mono font-semibold">{h.quantity_kg} kg</div>
                  </div>
                );
              })}
          </div>
        </TabsContent>

        <TabsContent value="b2b" className="p-4 space-y-3">
          <Button data-testid="add-b2b-cust-btn" onClick={() => setShowCust(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]">
            <Plus className="w-4 h-4 mr-1.5" /> Pelanggan B2B
          </Button>
          <div className="grid sm:grid-cols-2 gap-3">
            {customers.length === 0 ? <div className="col-span-full text-center py-6 text-gray-400 text-sm">Belum ada pelanggan B2B</div> :
              customers.map((c) => (
                <div key={c.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="font-semibold text-sm">{c.name}</div>
                  <div className="text-xs text-gray-500">{c.contact || "—"} · {c.payment_terms}</div>
                  <div className="text-xs text-gray-600 mt-1">{c.address}</div>
                </div>
              ))}
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="p-4 space-y-3">
          {customers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4 text-sm">
              <div className="font-semibold text-amber-900 mb-1">⚠ Belum ada Pelanggan B2B</div>
              <div className="text-amber-800 text-xs mb-2">Untuk membuat invoice, Anda harus mendaftarkan minimal 1 pelanggan B2B terlebih dulu.</div>
              <Button size="sm" onClick={() => setShowCust(true)} className="bg-amber-600 hover:bg-amber-700">
                <Plus className="w-3.5 h-3.5 mr-1" /> Daftar Pelanggan B2B
              </Button>
            </div>
          ) : (
            <Button data-testid="add-invoice-btn" onClick={() => setShowInv(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]">
              <FileText className="w-4 h-4 mr-1.5" /> Invoice Baru
            </Button>
          )}
          <div className="divide-y divide-gray-100">
            {invoices.length === 0 ? <div className="text-center py-6 text-gray-400 text-sm">Belum ada invoice</div> :
              invoices.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{inv.invoice_no}</div>
                    <div className="text-xs text-gray-500">{inv.customer_name} · {formatDate(inv.created_at)}</div>
                  </div>
                  <Badge variant={inv.status === "paid" ? "default" : (inv.status === "partial" ? "secondary" : "outline")}>{inv.status}</Badge>
                  <div className="text-right">
                    <div className="font-mono font-semibold">{formatRupiah(inv.total)}</div>
                    {inv.status !== "paid" && (
                      <button onClick={() => payInvoice(inv)} className="text-xs text-[#1a6b3c] font-medium hover:underline">Bayar</button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Plot */}
      <Dialog open={showPlot} onOpenChange={setShowPlot}>
        <DialogContent>
          <DialogHeader><DialogTitle>Plot Kebun Baru</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nama Plot</Label><Input value={plotForm.name} onChange={(e) => setPlotForm({ ...plotForm, name: e.target.value })} placeholder="Plot A1" /></div>
            <div><Label>Lokasi</Label><Input value={plotForm.location} onChange={(e) => setPlotForm({ ...plotForm, location: e.target.value })} /></div>
            <div><Label>Varietas</Label><Input value={plotForm.variety} onChange={(e) => setPlotForm({ ...plotForm, variety: e.target.value })} placeholder="Ninel, Jupiter, dll" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Luas (m²)</Label><Input type="number" value={plotForm.area_sqm || ""} onChange={(e) => setPlotForm({ ...plotForm, area_sqm: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Jumlah Tanaman</Label><Input type="number" value={plotForm.planted_count || ""} onChange={(e) => setPlotForm({ ...plotForm, planted_count: parseInt(e.target.value) || 0 })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlot(false)}>Batal</Button>
            <Button onClick={savePlot} className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Harvest */}
      <Dialog open={showHarv} onOpenChange={setShowHarv}>
        <DialogContent>
          <DialogHeader><DialogTitle>Catat Panen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Plot</Label>
              <Select value={harvForm.plot_id} onValueChange={(v) => setHarvForm({ ...harvForm, plot_id: v })}>
                <SelectTrigger><SelectValue placeholder="Pilih plot" /></SelectTrigger>
                <SelectContent>{plots.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Jumlah (kg)</Label><Input type="number" step="any" value={harvForm.quantity_kg || ""} onChange={(e) => setHarvForm({ ...harvForm, quantity_kg: e.target.value })} /></div>
            <div>
              <Label>Kualitas</Label>
              <Select value={harvForm.quality_grade} onValueChange={(v) => setHarvForm({ ...harvForm, quality_grade: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A (Premium)</SelectItem>
                  <SelectItem value="B">B (Standard)</SelectItem>
                  <SelectItem value="C">C (Olahan)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHarv(false)}>Batal</Button>
            <Button onClick={saveHarv} className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add B2B Customer */}
      <Dialog open={showCust} onOpenChange={setShowCust}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pelanggan B2B Baru</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nama / Distributor</Label><Input value={custForm.name} onChange={(e) => setCustForm({ ...custForm, name: e.target.value })} /></div>
            <div><Label>Kontak</Label><Input value={custForm.contact} onChange={(e) => setCustForm({ ...custForm, contact: e.target.value })} /></div>
            <div><Label>Alamat</Label><Input value={custForm.address} onChange={(e) => setCustForm({ ...custForm, address: e.target.value })} /></div>
            <div>
              <Label>Termin Pembayaran</Label>
              <Select value={custForm.payment_terms} onValueChange={(v) => setCustForm({ ...custForm, payment_terms: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["COD", "Net 7", "Net 14", "Net 30"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCust(false)}>Batal</Button>
            <Button onClick={saveCust} className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Invoice */}
      <Dialog open={showInv} onOpenChange={setShowInv}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Invoice B2B Baru</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Pelanggan</Label>
              <Select value={invForm.customer_id} onValueChange={(v) => setInvForm({ ...invForm, customer_id: v })}>
                <SelectTrigger data-testid="inv-customer-select"><SelectValue placeholder="Pilih pelanggan" /></SelectTrigger>
                <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Item</Label>
              <div className="space-y-2">
                {invForm.items.map((it, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input placeholder="Nama produk" value={it.name}
                      onChange={(e) => { const ns = [...invForm.items]; ns[idx] = { ...ns[idx], name: e.target.value }; setInvForm({ ...invForm, items: ns }); }} />
                    <Input className="w-20 font-mono" placeholder="Qty" type="number" step="any" value={it.quantity || ""}
                      onChange={(e) => { const ns = [...invForm.items]; ns[idx] = { ...ns[idx], quantity: e.target.value }; setInvForm({ ...invForm, items: ns }); }} />
                    <Input className="w-28 font-mono" placeholder="Harga" type="number" value={it.unit_price || ""}
                      onChange={(e) => { const ns = [...invForm.items]; ns[idx] = { ...ns[idx], unit_price: e.target.value }; setInvForm({ ...invForm, items: ns }); }} />
                    <button onClick={() => { const ns = invForm.items.filter((_, i) => i !== idx); setInvForm({ ...invForm, items: ns.length ? ns : [{ name: "", quantity: 0, unit_price: 0 }] }); }} className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                <button onClick={() => setInvForm({ ...invForm, items: [...invForm.items, { name: "", quantity: 0, unit_price: 0 }] })} className="text-xs text-[#1a6b3c] font-medium">+ Tambah Item</button>
              </div>
            </div>
            <div><Label>Catatan</Label><Input value={invForm.notes} onChange={(e) => setInvForm({ ...invForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInv(false)}>Batal</Button>
            <Button onClick={saveInv} data-testid="save-invoice-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Buat Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
