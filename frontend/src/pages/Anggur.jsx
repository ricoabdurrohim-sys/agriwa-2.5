import React, { useEffect, useMemo, useState } from "react";
import { ClipboardList, Edit2, FileText, Grape, Leaf, MapPin, Plus, Printer, Sprout, Trash2, Wallet, Wheat } from "lucide-react";
import api, { formatRupiah, formatDate } from "@/lib/api";
import { printViaIframe } from "@/lib/safePrint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const initPlot = { name: "", location: "", area_sqm: 0, variety: "", planted_count: 0, planted_date: "", notes: "" };
const initHarv = { plot_id: "", inventory_item_id: "", quantity_kg: 0, quality_grade: "A", notes: "" };
const initCust = { name: "", contact: "", address: "", payment_terms: "COD" };
const initInv = { customer_id: "", items: [{ name: "", quantity: 0, unit_price: 0 }], notes: "" };
const initAct = { plot_id: "", activity_type: "perawatan", labor_hours: 0, cost: 0, notes: "" };
const initInput = { plot_id: "", item_id: "", quantity: 0, purpose: "Perawatan kebun", notes: "" };

export default function Anggur() {
  const [plots, setPlots] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [activities, setActivities] = useState([]);
  const [inputUsages, setInputUsages] = useState([]);
  const [showPlot, setShowPlot] = useState(false);
  const [showHarv, setShowHarv] = useState(false);
  const [showCust, setShowCust] = useState(false);
  const [showInv, setShowInv] = useState(false);
  const [showAct, setShowAct] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [editPlot, setEditPlot] = useState(null);
  const [plotForm, setPlotForm] = useState(initPlot);
  const [harvForm, setHarvForm] = useState(initHarv);
  const [custForm, setCustForm] = useState(initCust);
  const [invForm, setInvForm] = useState(initInv);
  const [actForm, setActForm] = useState(initAct);
  const [inputForm, setInputForm] = useState(initInput);

  const load = async () => {
    const [p, h, c, i, inv, a, u] = await Promise.all([
      api.get("/vineyard/plots"), api.get("/vineyard/harvests"),
      api.get("/b2b/customers"), api.get("/b2b/invoices"), api.get("/inventory"),
      api.get("/vineyard/activities"), api.get("/vineyard/input-usages"),
    ]);
    setPlots(p.data); setHarvests(h.data); setCustomers(c.data); setInvoices(i.data);
    setInventory(inv.data); setActivities(a.data); setInputUsages(u.data);
  };
  useEffect(() => { load(); }, []);

  const grapeItems = inventory.filter((x) => x.business_unit === "anggur" || String(x.name || "").toLowerCase().includes("anggur"));
  const inputItems = inventory.filter((x) => !String(x.category || "").toLowerCase().includes("hasil panen"));
  const totalHarvest = harvests.reduce((s, h) => s + Number(h.quantity_kg || 0), 0);
  const totalStockGrape = grapeItems.reduce((s, i) => s + Number(i.current_stock || 0), 0);
  const totalCost = activities.reduce((s, a) => s + Number(a.cost || 0), 0);
  const totalB2B = invoices.reduce((s, i) => s + Number(i.total || 0), 0);
  const totalB2BPaid = invoices.reduce((s, i) => s + Number(i.paid || 0), 0);

  const openNewPlot = () => { setEditPlot(null); setPlotForm(initPlot); setShowPlot(true); };
  const openEditPlot = (p) => { setEditPlot(p); setPlotForm({ ...initPlot, ...p }); setShowPlot(true); };

  const savePlot = async () => {
    if (!plotForm.name) return toast.error("Nama plot wajib");
    if (editPlot) await api.put(`/vineyard/plots/${editPlot.id}`, plotForm);
    else await api.post("/vineyard/plots", plotForm);
    setPlotForm(initPlot); setEditPlot(null); setShowPlot(false); load(); toast.success(editPlot ? "Plot diperbarui" : "Plot tersimpan");
  };
  const deletePlot = async (p) => {
    if (!window.confirm(`Hapus plot ${p.name}?`)) return;
    try { await api.delete(`/vineyard/plots/${p.id}`); load(); toast.success("Plot dihapus"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Gagal hapus plot"); }
  };
  const saveHarv = async () => {
    if (!harvForm.plot_id || !harvForm.quantity_kg) return toast.error("Lengkapi data panen");
    await api.post("/vineyard/harvests", { ...harvForm, quantity_kg: parseFloat(harvForm.quantity_kg) });
    setHarvForm(initHarv); setShowHarv(false); load(); toast.success("Panen dicatat dan stok gudang bertambah");
  };
  const deleteHarvest = async (h) => {
    if (!window.confirm("Hapus catatan panen ini? Stok gudang akan dikurangi kembali.")) return;
    await api.delete(`/vineyard/harvests/${h.id}`); load(); toast.success("Panen dihapus dan stok dibalik");
  };
  const saveActivity = async () => {
    if (!actForm.plot_id) return toast.error("Pilih plot");
    await api.post("/vineyard/activities", { ...actForm, labor_hours: parseFloat(actForm.labor_hours) || 0, cost: parseInt(actForm.cost) || 0 });
    setActForm(initAct); setShowAct(false); load(); toast.success("Aktivitas kebun dicatat");
  };
  const deleteActivity = async (a) => {
    if (!window.confirm("Hapus aktivitas kebun ini?")) return;
    await api.delete(`/vineyard/activities/${a.id}`); load(); toast.success("Aktivitas dihapus");
  };
  const saveInputUsage = async () => {
    if (!inputForm.plot_id || !inputForm.item_id || !inputForm.quantity) return toast.error("Lengkapi input kebun");
    await api.post("/vineyard/input-usages", { ...inputForm, quantity: parseFloat(inputForm.quantity) });
    setInputForm(initInput); setShowInput(false); load(); toast.success("Input kebun dicatat dan stok inventori berkurang");
  };
  const deleteInputUsage = async (u) => {
    if (!window.confirm("Hapus pemakaian input ini? Stok inventori akan dikembalikan.")) return;
    await api.delete(`/vineyard/input-usages/${u.id}`); load(); toast.success("Pemakaian input dihapus");
  };
  const saveCust = async () => {
    if (!custForm.name) return toast.error("Nama wajib");
    await api.post("/b2b/customers", custForm);
    setCustForm(initCust); setShowCust(false); load(); toast.success("Pelanggan B2B ditambahkan");
  };
  const saveInv = async () => {
    if (!invForm.customer_id || invForm.items.some((i) => !i.name || !i.quantity)) return toast.error("Lengkapi data invoice");
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
  const printInvoice = (inv) => {
    printViaIframe({ title: inv.invoice_no, css: "body{font-family:monospace;padding:20px} .r{display:flex;justify-content:space-between;border-bottom:1px dashed #ddd;padding:4px 0} h2{text-align:center}", buildBody: (doc) => {
      const d = doc.createElement("div");
      d.innerHTML = `<h2>INVOICE ANGGUR</h2><p>No: ${inv.invoice_no}</p><p>Pelanggan: ${inv.customer_name || "-"}</p><hr/>${(inv.items||[]).map(it=>`<div class='r'><span>${it.name} ${it.quantity}x</span><b>${formatRupiah(it.quantity*it.unit_price)}</b></div>`).join("")}<h3>Total: ${formatRupiah(inv.total)}</h3><p>Dibayar: ${formatRupiah(inv.paid || 0)}</p><p>Sisa: ${formatRupiah(inv.total - (inv.paid || 0))}</p>`;
      return d;
    }});
  };

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Kebun Anggur</h1>
          <p className="text-sm text-gray-500 mt-0.5">Plot, aktivitas, input kebun, panen, gudang, dan penjualan B2B terintegrasi</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Summary title="Total Panen" value={`${totalHarvest.toLocaleString('id-ID')} kg`} icon={<Grape />} />
        <Summary title="Stok Anggur Gudang" value={`${totalStockGrape.toLocaleString('id-ID')} kg`} icon={<Wheat />} />
        <Summary title="Biaya Kebun" value={formatRupiah(totalCost)} icon={<Sprout />} />
        <Summary title="Piutang B2B" value={formatRupiah(totalB2B - totalB2BPaid)} icon={<Wallet />} />
      </div>

      <Tabs defaultValue="plots" className="bg-white rounded-xl border border-gray-100">
        <TabsList className="bg-gray-50 m-1 overflow-x-auto flex flex-wrap h-auto">
          <TabsTrigger value="plots">Plot</TabsTrigger>
          <TabsTrigger value="activities">Aktivitas</TabsTrigger>
          <TabsTrigger value="inputs">Input Kebun</TabsTrigger>
          <TabsTrigger value="harvests">Panen</TabsTrigger>
          <TabsTrigger value="b2b">Pelanggan B2B</TabsTrigger>
          <TabsTrigger value="invoices">Invoice</TabsTrigger>
        </TabsList>

        <TabsContent value="plots" className="p-4 space-y-3">
          <Button onClick={openNewPlot} className="bg-[#1a6b3c] hover:bg-[#14522d]"><Plus className="w-4 h-4 mr-1.5" /> Plot Baru</Button>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {plots.length === 0 ? <Empty text="Belum ada plot" /> : plots.map((p) => (
              <div key={p.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex justify-between gap-2">
                  <div className="flex items-start gap-2"><MapPin className="w-4 h-4 text-[#1a6b3c] mt-0.5" /><div><div className="font-semibold text-sm">{p.name}</div><div className="text-xs text-gray-500">{p.location || "—"}</div></div></div>
                  <div className="flex gap-1"><button onClick={() => openEditPlot(p)} className="text-blue-600"><Edit2 className="w-4 h-4" /></button><button onClick={() => deletePlot(p)} className="text-red-600"><Trash2 className="w-4 h-4" /></button></div>
                </div>
                <div className="text-xs text-gray-600 mt-2">Varietas: <b>{p.variety || "—"}</b></div>
                <div className="text-xs text-gray-600">Tanaman: <b>{p.planted_count || 0}</b> · Luas: <b>{p.area_sqm || 0} m²</b></div>
                {p.notes && <div className="text-xs text-gray-500 mt-2">{p.notes}</div>}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="activities" className="p-4 space-y-3">
          <Button onClick={() => setShowAct(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]"><ClipboardList className="w-4 h-4 mr-1.5" /> Catat Aktivitas</Button>
          <List rows={activities} empty="Belum ada aktivitas" render={(a) => <Row key={a.id} icon={<Leaf />} title={`${a.plot_name || 'Plot'} · ${a.activity_type}`} subtitle={`${formatDate(a.date)} · ${a.labor_hours || 0} jam · ${formatRupiah(a.cost || 0)}`} right={<button onClick={() => deleteActivity(a)} className="text-red-600"><Trash2 className="w-4 h-4" /></button>} />} />
        </TabsContent>

        <TabsContent value="inputs" className="p-4 space-y-3">
          <Button onClick={() => setShowInput(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]"><Sprout className="w-4 h-4 mr-1.5" /> Pakai Input Kebun</Button>
          <List rows={inputUsages} empty="Belum ada pemakaian input" render={(u) => <Row key={u.id} icon={<Sprout />} title={`${u.item_name || 'Input'} → ${u.plot_name || 'Plot'}`} subtitle={`${formatDate(u.date)} · ${u.quantity} ${u.unit || ''} · ${u.purpose || ''}`} right={<button onClick={() => deleteInputUsage(u)} className="text-red-600"><Trash2 className="w-4 h-4" /></button>} />} />
        </TabsContent>

        <TabsContent value="harvests" className="p-4 space-y-3">
          <Button disabled={plots.length === 0} onClick={() => setShowHarv(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]"><Wheat className="w-4 h-4 mr-1.5" /> Catat Panen</Button>
          <List rows={harvests} empty="Belum ada panen" render={(h) => <Row key={h.id} icon={<Grape />} title={`${h.plot_name || plots.find(x=>x.id===h.plot_id)?.name || 'Plot'} · ${h.quantity_kg} kg`} subtitle={`${formatDate(h.date)} · Kualitas ${h.quality_grade} · masuk: ${h.inventory_item_name || 'Inventori Anggur'}`} right={<button onClick={() => deleteHarvest(h)} className="text-red-600"><Trash2 className="w-4 h-4" /></button>} />} />
        </TabsContent>

        <TabsContent value="b2b" className="p-4 space-y-3">
          <Button onClick={() => setShowCust(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]"><Plus className="w-4 h-4 mr-1.5" /> Pelanggan B2B</Button>
          <div className="grid sm:grid-cols-2 gap-3">{customers.length === 0 ? <Empty text="Belum ada pelanggan B2B" /> : customers.map((c) => <div key={c.id} className="border rounded-lg p-3"><div className="font-semibold text-sm">{c.name}</div><div className="text-xs text-gray-500">{c.contact || '—'} · {c.payment_terms}</div><div className="text-xs text-gray-600 mt-1">{c.address}</div></div>)}</div>
        </TabsContent>

        <TabsContent value="invoices" className="p-4 space-y-3">
          <Button disabled={customers.length === 0} onClick={() => setShowInv(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]"><FileText className="w-4 h-4 mr-1.5" /> Invoice Baru</Button>
          <List rows={invoices} empty="Belum ada invoice" render={(inv) => <Row key={inv.id} icon={<FileText />} title={`${inv.invoice_no} · ${inv.customer_name || '—'}`} subtitle={`${formatRupiah(inv.total)} · dibayar ${formatRupiah(inv.paid || 0)}`} badge={<Badge className={inv.status === 'paid' ? 'bg-emerald-600' : 'bg-amber-500'}>{inv.status}</Badge>} right={<div className="flex gap-2"><button onClick={() => printInvoice(inv)} className="text-gray-600"><Printer className="w-4 h-4" /></button><Button size="sm" variant="outline" onClick={() => payInvoice(inv)}>Bayar</Button></div>} />} />
        </TabsContent>
      </Tabs>

      <Dialog open={showPlot} onOpenChange={setShowPlot}><DialogContent><DialogHeader><DialogTitle>{editPlot ? 'Edit Plot' : 'Plot Baru'}</DialogTitle></DialogHeader><div className="grid grid-cols-2 gap-3"><Field label="Nama" value={plotForm.name} onChange={(v)=>setPlotForm({...plotForm,name:v})}/><Field label="Lokasi" value={plotForm.location} onChange={(v)=>setPlotForm({...plotForm,location:v})}/><Field label="Varietas" value={plotForm.variety} onChange={(v)=>setPlotForm({...plotForm,variety:v})}/><Field label="Jumlah Tanaman" type="number" value={plotForm.planted_count || ''} onChange={(v)=>setPlotForm({...plotForm,planted_count:v})}/><Field label="Luas m²" type="number" value={plotForm.area_sqm || ''} onChange={(v)=>setPlotForm({...plotForm,area_sqm:v})}/><Field label="Tanggal Tanam" type="date" value={plotForm.planted_date || ''} onChange={(v)=>setPlotForm({...plotForm,planted_date:v})}/></div><Label>Catatan</Label><Textarea value={plotForm.notes} onChange={(e)=>setPlotForm({...plotForm,notes:e.target.value})}/><DialogFooter><Button variant="outline" onClick={()=>setShowPlot(false)}>Batal</Button><Button onClick={savePlot}>Simpan</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={showHarv} onOpenChange={setShowHarv}><DialogContent><DialogHeader><DialogTitle>Catat Panen</DialogTitle></DialogHeader><SelectField label="Plot" value={harvForm.plot_id} onChange={(v)=>setHarvForm({...harvForm,plot_id:v})} items={plots.map(p=>({value:p.id,label:p.name}))}/><Field label="Jumlah kg" type="number" value={harvForm.quantity_kg || ''} onChange={(v)=>setHarvForm({...harvForm,quantity_kg:v})}/><SelectField label="Kualitas" value={harvForm.quality_grade} onChange={(v)=>setHarvForm({...harvForm,quality_grade:v})} items={[{value:'A',label:'A Premium'},{value:'B',label:'B Standard'},{value:'C',label:'C Olahan'}]}/><SelectField label="Masukkan ke Item Inventori (opsional, kosong = otomatis)" value={harvForm.inventory_item_id || 'auto'} onChange={(v)=>setHarvForm({...harvForm,inventory_item_id:v === 'auto' ? '' : v})} items={[{value:'auto',label:'Otomatis per Grade'},...grapeItems.map(i=>({value:i.id,label:`${i.name} (${i.current_stock || 0} ${i.unit})`}))]}/><DialogFooter><Button variant="outline" onClick={()=>setShowHarv(false)}>Batal</Button><Button onClick={saveHarv}>Simpan</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={showAct} onOpenChange={setShowAct}><DialogContent><DialogHeader><DialogTitle>Aktivitas Kebun</DialogTitle></DialogHeader><SelectField label="Plot" value={actForm.plot_id} onChange={(v)=>setActForm({...actForm,plot_id:v})} items={plots.map(p=>({value:p.id,label:p.name}))}/><SelectField label="Jenis" value={actForm.activity_type} onChange={(v)=>setActForm({...actForm,activity_type:v})} items={['pemangkasan','pemupukan','penyiraman','pengendalian hama','panen persiapan','perawatan'].map(x=>({value:x,label:x}))}/><Field label="Jam Kerja" type="number" value={actForm.labor_hours || ''} onChange={(v)=>setActForm({...actForm,labor_hours:v})}/><Field label="Biaya" type="number" value={actForm.cost || ''} onChange={(v)=>setActForm({...actForm,cost:v})}/><Label>Catatan</Label><Textarea value={actForm.notes} onChange={(e)=>setActForm({...actForm,notes:e.target.value})}/><DialogFooter><Button variant="outline" onClick={()=>setShowAct(false)}>Batal</Button><Button onClick={saveActivity}>Simpan</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={showInput} onOpenChange={setShowInput}><DialogContent><DialogHeader><DialogTitle>Pemakaian Input Kebun</DialogTitle></DialogHeader><SelectField label="Plot" value={inputForm.plot_id} onChange={(v)=>setInputForm({...inputForm,plot_id:v})} items={plots.map(p=>({value:p.id,label:p.name}))}/><SelectField label="Item Inventori" value={inputForm.item_id} onChange={(v)=>setInputForm({...inputForm,item_id:v})} items={inputItems.map(i=>({value:i.id,label:`${i.name} · stok ${i.current_stock || 0} ${i.unit}`}))}/><Field label="Jumlah" type="number" value={inputForm.quantity || ''} onChange={(v)=>setInputForm({...inputForm,quantity:v})}/><Field label="Keperluan" value={inputForm.purpose} onChange={(v)=>setInputForm({...inputForm,purpose:v})}/><DialogFooter><Button variant="outline" onClick={()=>setShowInput(false)}>Batal</Button><Button onClick={saveInputUsage}>Simpan</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={showCust} onOpenChange={setShowCust}><DialogContent><DialogHeader><DialogTitle>Pelanggan B2B Baru</DialogTitle></DialogHeader><Field label="Nama / Distributor" value={custForm.name} onChange={(v)=>setCustForm({...custForm,name:v})}/><Field label="Kontak" value={custForm.contact} onChange={(v)=>setCustForm({...custForm,contact:v})}/><Field label="Alamat" value={custForm.address} onChange={(v)=>setCustForm({...custForm,address:v})}/><SelectField label="Termin" value={custForm.payment_terms} onChange={(v)=>setCustForm({...custForm,payment_terms:v})} items={['COD','Net 7','Net 14','Net 30'].map(x=>({value:x,label:x}))}/><DialogFooter><Button variant="outline" onClick={()=>setShowCust(false)}>Batal</Button><Button onClick={saveCust}>Simpan</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={showInv} onOpenChange={setShowInv}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Invoice B2B Baru</DialogTitle></DialogHeader><SelectField label="Pelanggan" value={invForm.customer_id} onChange={(v)=>setInvForm({...invForm,customer_id:v})} items={customers.map(c=>({value:c.id,label:c.name}))}/><div className="space-y-2"><Label>Item</Label>{invForm.items.map((it, idx)=><div key={idx} className="flex gap-2"><Input placeholder="Nama produk" value={it.name} onChange={(e)=>{const ns=[...invForm.items];ns[idx]={...ns[idx],name:e.target.value};setInvForm({...invForm,items:ns});}}/><Input className="w-20" type="number" placeholder="Qty" value={it.quantity || ''} onChange={(e)=>{const ns=[...invForm.items];ns[idx]={...ns[idx],quantity:e.target.value};setInvForm({...invForm,items:ns});}}/><Input className="w-28" type="number" placeholder="Harga" value={it.unit_price || ''} onChange={(e)=>{const ns=[...invForm.items];ns[idx]={...ns[idx],unit_price:e.target.value};setInvForm({...invForm,items:ns});}}/><button onClick={()=>{const ns=invForm.items.filter((_,i)=>i!==idx);setInvForm({...invForm,items:ns.length?ns:[{name:'',quantity:0,unit_price:0}]});}}><Trash2 className="w-4 h-4 text-red-600"/></button></div>)}<button onClick={()=>setInvForm({...invForm,items:[...invForm.items,{name:'',quantity:0,unit_price:0}]})} className="text-xs text-[#1a6b3c] font-medium">+ Tambah Item</button></div><Field label="Catatan" value={invForm.notes} onChange={(v)=>setInvForm({...invForm,notes:v})}/><DialogFooter><Button variant="outline" onClick={()=>setShowInv(false)}>Batal</Button><Button onClick={saveInv}>Buat Invoice</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function Summary({ title, value, icon }) { return <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500">{title}</div><div className="flex items-center justify-between mt-1"><div className="font-bold text-lg">{value}</div><div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">{React.cloneElement(icon,{className:'w-5 h-5'})}</div></div></div>; }
function Empty({ text }) { return <div className="col-span-full text-center py-6 text-gray-400 text-sm">{text}</div>; }
function List({ rows, empty, render }) { return <div className="divide-y divide-gray-100">{rows.length === 0 ? <div className="text-center py-6 text-gray-400 text-sm">{empty}</div> : rows.map(render)}</div>; }
function Row({ icon, title, subtitle, right, badge }) { return <div className="flex items-center gap-3 py-3"><div className="p-2 bg-purple-50 rounded-lg text-purple-700">{React.cloneElement(icon,{className:'w-4 h-4'})}</div><div className="flex-1"><div className="text-sm font-semibold flex items-center gap-2">{title}{badge}</div><div className="text-xs text-gray-500">{subtitle}</div></div>{right}</div>; }
function Field({ label, value, onChange, type='text' }) { return <div><Label>{label}</Label><Input type={type} value={value} onChange={(e)=>onChange(e.target.value)} /></div>; }
function SelectField({ label, value, onChange, items }) { return <div><Label>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{items.map((i)=><SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent></Select></div>; }
