import React, { useEffect, useState } from "react";
import { CheckCircle2, Edit2, ExternalLink, FileText, Image as ImageIcon, Plus, Printer, ShoppingBag, Trash2, Truck, Wallet } from "lucide-react";
import api, { formatRupiah, formatDate } from "@/lib/api";
import { printViaIframe } from "@/lib/safePrint";
import ImageUpload, { resolveImageUrl } from "@/components/ImageUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const initSup = { name: "", contact: "", phone: "", address: "", payment_terms: "cash", notes: "" };
const initPO = { supplier_id: "", items: [{ item_id: "", name: "", quantity: 0, unit_price: 0 }], expected_date: "", due_date: "", notes: "", purchase_url: "", invoice_image_url: "", payment_proof_url: "", paid_amount: 0, payment_method: "transfer" };
const initOnline = { platform: "shopee", order_number: "", items: [{ item_id: "", name: "", quantity: 0, unit_price: 0 }], shipping_cost: 0, expected_date: "", due_date: "", invoice_image_url: "", payment_proof_url: "", order_url: "", paid_amount: 0, payment_method: "transfer", notes: "" };
const PAYMENT_TERMS = [
  { value: "cash", label: "Tunai" }, { value: "transfer", label: "Transfer" }, { value: "qris", label: "QRIS" }, { value: "bon", label: "Bon" },
];
const PAYMENT_METHODS = PAYMENT_TERMS.filter((x) => x.value !== "bon");
const termLabel = (v) => PAYMENT_TERMS.find((x) => x.value === String(v || "").toLowerCase())?.label || "Tunai";
const statusLabel = (s) => ({ paid: "Lunas", partial: "Sebagian", unpaid: "Belum Bayar" }[s] || s || "Belum Bayar");
const statusClass = (s) => s === "paid" ? "bg-emerald-600" : s === "partial" ? "bg-amber-500" : "bg-gray-500";

export default function Pembelian() {
  const [suppliers, setSuppliers] = useState([]);
  const [pos, setPos] = useState([]);
  const [online, setOnline] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [showSup, setShowSup] = useState(false);
  const [showPO, setShowPO] = useState(false);
  const [showOnline, setShowOnline] = useState(false);
  const [editSup, setEditSup] = useState(null);
  const [editPO, setEditPO] = useState(null);
  const [editOnline, setEditOnline] = useState(null);
  const [supForm, setSupForm] = useState(initSup);
  const [poForm, setPoForm] = useState(initPO);
  const [onlineForm, setOnlineForm] = useState(initOnline);
  const [detail, setDetail] = useState(null);
  const [payments, setPayments] = useState([]);
  const [payTarget, setPayTarget] = useState(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "transfer", payment_proof_url: "", notes: "" });

  const load = async () => {
    const [s, p, o, i] = await Promise.all([api.get("/suppliers"), api.get("/purchase-orders"), api.get("/online-orders"), api.get("/inventory")]);
    setSuppliers(s.data); setPos(p.data); setOnline(o.data); setInventory(i.data);
  };
  useEffect(() => { load(); }, []);

  const cleanPOItems = (items) => items.map((it) => {
    const inv = inventory.find((x) => x.id === it.item_id);
    return { item_id: it.item_id, name: inv?.name || it.name || "", quantity: parseFloat(it.quantity) || 0, unit_price: parseInt(it.unit_price) || 0 };
  });
  const openNewPO = () => { setEditPO(null); setPOFormSafe(initPO); setShowPO(true); };
  const setPOFormSafe = (v) => setPoForm({ ...initPO, ...v, items: v.items?.length ? v.items : initPO.items });
  const openEditPO = (po) => { setEditPO(po); setPOFormSafe({ ...po, paid_amount: 0 }); setShowPO(true); };
  const openNewOnline = () => { setEditOnline(null); setOnlineForm({ ...initOnline }); setShowOnline(true); };
  const openEditOnline = (o) => { setEditOnline(o); setOnlineForm({ ...initOnline, ...o, paid_amount: 0, items: o.items?.length ? o.items : initOnline.items }); setShowOnline(true); };

  const saveSup = async () => {
    if (!supForm.name) return toast.error("Nama supplier wajib");
    if (editSup) await api.put(`/suppliers/${editSup.id}`, supForm);
    else await api.post("/suppliers", supForm);
    setSupForm(initSup); setEditSup(null); setShowSup(false); load(); toast.success("Supplier tersimpan");
  };
  const openEditSup = (s) => { setEditSup(s); setSupForm({ ...initSup, ...s }); setShowSup(true); };
  const deleteSupplier = async (s) => {
    if (!window.confirm(`Hapus supplier ${s.name}?`)) return;
    try { await api.delete(`/suppliers/${s.id}`); load(); toast.success("Supplier dihapus"); } catch(e) { toast.error(e?.response?.data?.detail || "Gagal hapus supplier"); }
  };

  const savePO = async () => {
    if (!poForm.supplier_id || poForm.items.some((i) => !i.item_id || !i.quantity)) return toast.error("Lengkapi supplier dan item PO");
    const body = { ...poForm, items: cleanPOItems(poForm.items), paid_amount: parseInt(poForm.paid_amount) || 0 };
    if (editPO) await api.put(`/purchase-orders/${editPO.id}`, body);
    else await api.post("/purchase-orders", body);
    setPOFormSafe(initPO); setEditPO(null); setShowPO(false); load(); toast.success(editPO ? "PO diperbarui" : "PO dibuat");
  };

  const saveOnline = async () => {
    if (!onlineForm.order_number || onlineForm.items.some((i) => !i.item_id || !i.quantity)) return toast.error("Lengkapi nomor order dan item");
    const body = { ...onlineForm, items: cleanPOItems(onlineForm.items), shipping_cost: parseInt(onlineForm.shipping_cost) || 0, paid_amount: parseInt(onlineForm.paid_amount) || 0 };
    if (editOnline) await api.put(`/online-orders/${editOnline.id}`, body);
    else await api.post("/online-orders", body);
    setOnlineForm(initOnline); setEditOnline(null); setShowOnline(false); load(); toast.success(editOnline ? "Order online diperbarui" : "Order online dicatat");
  };

  const receivePO = async (id) => {
    if (!window.confirm("Tandai barang PO sudah diterima? Stok otomatis bertambah.")) return;
    try { const { data } = await api.post(`/purchase-orders/${id}/receive`); load(); toast.success(`Stok masuk: ${data.added || 0} item`); }
    catch (e) { toast.error(e?.response?.data?.detail || "Gagal menerima PO"); }
  };
  const receiveOnline = async (id) => {
    if (!window.confirm("Tandai order online sudah diterima? Stok otomatis bertambah.")) return;
    try { const { data } = await api.post(`/online-orders/${id}/receive`); load(); toast.success(`Stok masuk: ${data.added || 0} item`); }
    catch (e) { toast.error(e?.response?.data?.detail || "Gagal menerima order"); }
  };
  const deletePO = async (po) => { if (!window.confirm(`Hapus PO ${po.po_no}? Stok/pembayaran terkait akan dibalik bila ada.`)) return; await api.delete(`/purchase-orders/${po.id}`); load(); toast.success("PO dihapus"); };
  const deleteOnline = async (o) => { if (!window.confirm(`Hapus order ${o.order_number}?`)) return; await api.delete(`/online-orders/${o.id}`); load(); toast.success("Order dihapus"); };

  const openDetail = async (kind, doc) => {
    setDetail({ kind, doc });
    const url = kind === "po" ? `/purchase-orders/${doc.id}/payments` : `/online-orders/${doc.id}/payments`;
    try { const { data } = await api.get(url); setPayments(data); } catch { setPayments([]); }
  };
  const openPay = (kind, doc) => {
    const remaining = (doc.total || 0) - (doc.paid_amount || 0);
    setPayTarget({ kind, doc }); setPayForm({ amount: remaining > 0 ? String(remaining) : "", method: doc.payment_method || "transfer", payment_proof_url: doc.payment_proof_url || "", notes: "" });
  };
  const savePayment = async () => {
    if (!payTarget || !payForm.amount) return toast.error("Nominal wajib");
    const url = payTarget.kind === "po" ? `/purchase-orders/${payTarget.doc.id}/pay` : `/online-orders/${payTarget.doc.id}/pay`;
    await api.post(url, { ...payForm, amount: parseInt(payForm.amount) || 0 });
    setPayTarget(null); load(); toast.success("Pembayaran supplier dicatat");
  };
  const printPurchase = (kind, doc) => {
    const title = kind === "po" ? doc.po_no : doc.order_number;
    printViaIframe({ title, css: "body{font-family:monospace;padding:20px}.r{display:flex;justify-content:space-between;border-bottom:1px dashed #ddd;padding:4px 0}h2{text-align:center}small{color:#666}", buildBody: (d) => {
      const el = d.createElement("div");
      el.innerHTML = `<h2>BUKTI PEMBELIAN</h2><p>No: ${title}</p><p>Supplier/Platform: ${doc.supplier_name || doc.platform || '-'}</p><p>Tanggal: ${formatDate(doc.created_at || doc.order_date)}</p><hr/>${(doc.items||[]).map(it=>`<div class='r'><span>${it.name} ${it.quantity}x</span><b>${formatRupiah(it.quantity*it.unit_price)}</b></div>`).join("")}<div class='r'><span>Ongkir</span><b>${formatRupiah(doc.shipping_cost || 0)}</b></div><h3>Total: ${formatRupiah(doc.total || 0)}</h3><p>Dibayar: ${formatRupiah(doc.paid_amount || 0)}</p><p>Sisa: ${formatRupiah((doc.total || 0) - (doc.paid_amount || 0))}</p><p>Status: ${statusLabel(doc.payment_status)}</p><small>${doc.notes || ''}</small>`;
      return el;
    }});
  };

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap"><div><h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily:'Poppins' }}>Pembelian & Supplier</h1><p className="text-sm text-gray-500 mt-0.5">PO, order online, bukti bayar, link marketplace, pembayaran parsial, dan penerimaan stok</p></div></div>
      <Tabs defaultValue="po" className="bg-white rounded-xl border border-gray-100"><TabsList className="bg-gray-50 m-1"><TabsTrigger value="po">Purchase Order</TabsTrigger><TabsTrigger value="online">Order Online</TabsTrigger><TabsTrigger value="suppliers">Supplier</TabsTrigger></TabsList>
        <TabsContent value="po" className="p-4 space-y-3"><Button onClick={openNewPO} className="bg-[#1a6b3c] hover:bg-[#14522d]"><Plus className="w-4 h-4 mr-1.5"/>PO Baru</Button><PurchaseList rows={pos} kind="po" onDetail={openDetail} onEdit={openEditPO} onDelete={deletePO} onPay={openPay} onReceive={receivePO} onPrint={printPurchase}/></TabsContent>
        <TabsContent value="online" className="p-4 space-y-3"><Button onClick={openNewOnline} className="bg-[#1a6b3c] hover:bg-[#14522d]"><ShoppingBag className="w-4 h-4 mr-1.5"/>Order Online</Button><PurchaseList rows={online} kind="online" onDetail={openDetail} onEdit={openEditOnline} onDelete={deleteOnline} onPay={openPay} onReceive={receiveOnline} onPrint={printPurchase}/></TabsContent>
        <TabsContent value="suppliers" className="p-4 space-y-3"><Button onClick={()=>{setEditSup(null);setSupForm(initSup);setShowSup(true);}} className="bg-[#1a6b3c] hover:bg-[#14522d]"><Plus className="w-4 h-4 mr-1.5"/>Supplier Baru</Button><div className="grid sm:grid-cols-2 gap-3">{suppliers.length===0?<Empty text="Belum ada supplier"/>:suppliers.map(s=><div key={s.id} className="border rounded-lg p-3"><div className="flex justify-between gap-2"><div><div className="font-semibold text-sm">{s.name}</div><div className="text-xs text-gray-500">{s.contact || '—'} · {s.phone || '—'}</div><div className="text-xs text-gray-600 mt-1">Termin: {termLabel(s.payment_terms)}</div></div><div className="flex gap-2"><button onClick={()=>openEditSup(s)} className="text-blue-600"><Edit2 className="w-4 h-4"/></button><button onClick={()=>deleteSupplier(s)} className="text-red-600"><Trash2 className="w-4 h-4"/></button></div></div></div>)}</div></TabsContent>
      </Tabs>

      <Dialog open={showSup} onOpenChange={setShowSup}><DialogContent><DialogHeader><DialogTitle>{editSup?'Edit Supplier':'Supplier Baru'}</DialogTitle></DialogHeader><Field label="Nama Supplier" value={supForm.name} onChange={(v)=>setSupForm({...supForm,name:v})}/><Field label="Kontak Person" value={supForm.contact} onChange={(v)=>setSupForm({...supForm,contact:v})}/><Field label="No. HP" value={supForm.phone} onChange={(v)=>setSupForm({...supForm,phone:v})}/><Field label="Alamat" value={supForm.address} onChange={(v)=>setSupForm({...supForm,address:v})}/><SelectField label="Termin Pembayaran" value={supForm.payment_terms} onChange={(v)=>setSupForm({...supForm,payment_terms:v})} items={PAYMENT_TERMS}/><DialogFooter><Button variant="outline" onClick={()=>setShowSup(false)}>Batal</Button><Button onClick={saveSup}>Simpan</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={showPO} onOpenChange={setShowPO}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{editPO?'Edit PO':'Purchase Order Baru'}</DialogTitle></DialogHeader><PurchaseForm form={poForm} setForm={setPoForm} inventory={inventory} suppliers={suppliers} isPO/><DialogFooter><Button variant="outline" onClick={()=>setShowPO(false)}>Batal</Button><Button onClick={savePO}>Simpan</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={showOnline} onOpenChange={setShowOnline}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{editOnline?'Edit Order Online':'Order Online Baru'}</DialogTitle></DialogHeader><PurchaseForm form={onlineForm} setForm={setOnlineForm} inventory={inventory}/><DialogFooter><Button variant="outline" onClick={()=>setShowOnline(false)}>Batal</Button><Button onClick={saveOnline}>Simpan</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={!!payTarget} onOpenChange={()=>setPayTarget(null)}><DialogContent><DialogHeader><DialogTitle>Catat Pembayaran</DialogTitle></DialogHeader>{payTarget&&<div className="text-sm text-gray-600">Sisa: <b>{formatRupiah((payTarget.doc.total||0)-(payTarget.doc.paid_amount||0))}</b></div>}<Field label="Nominal Bayar" type="number" value={payForm.amount} onChange={(v)=>setPayForm({...payForm,amount:v})}/><SelectField label="Metode" value={payForm.method} onChange={(v)=>setPayForm({...payForm,method:v})} items={PAYMENT_METHODS}/><ImageUpload value={payForm.payment_proof_url} onChange={(v)=>setPayForm({...payForm,payment_proof_url:v})} label="Bukti Bayar / Transfer" testid="purchase-payment-proof"/><Field label="Catatan" value={payForm.notes} onChange={(v)=>setPayForm({...payForm,notes:v})}/><DialogFooter><Button variant="outline" onClick={()=>setPayTarget(null)}>Batal</Button><Button onClick={savePayment}>Simpan Pembayaran</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={!!detail} onOpenChange={()=>{setDetail(null);setPayments([]);}}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Detail Pembelian</DialogTitle></DialogHeader>{detail&&<PurchaseDetail kind={detail.kind} doc={detail.doc} payments={payments} onPrint={printPurchase}/>}<DialogFooter><Button variant="outline" onClick={()=>setDetail(null)}>Tutup</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function PurchaseList({ rows, kind, onDetail, onEdit, onDelete, onPay, onReceive, onPrint }) {
  return <div className="divide-y divide-gray-100">{rows.length===0?<div className="text-center py-6 text-gray-400 text-sm">Belum ada data</div>:rows.map((d)=>{const total=d.total||0, paid=d.paid_amount||0, remaining=total-paid; const no=kind==='po'?d.po_no:d.order_number; return <div key={d.id} className="py-3 flex gap-3"><div className="p-2 bg-emerald-50 rounded-lg h-fit">{kind==='po'?<Truck className="w-4 h-4 text-emerald-700"/>:<ShoppingBag className="w-4 h-4 text-emerald-700"/>}</div><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><b className="text-sm">{no}</b><Badge className={statusClass(d.payment_status)}>{statusLabel(d.payment_status)}</Badge>{d.stock_received&&<Badge className="bg-blue-600"><CheckCircle2 className="w-3 h-3 mr-1"/>Stok Masuk</Badge>}</div><div className="text-xs text-gray-500">{d.supplier_name || d.platform || '—'} · {formatDate(d.created_at || d.order_date)}</div><div className="text-sm mt-1">Total <b>{formatRupiah(total)}</b> · Dibayar <b>{formatRupiah(paid)}</b> · Sisa <b>{formatRupiah(Math.max(0,remaining))}</b></div><div className="flex flex-wrap gap-2 mt-2"><Button size="sm" variant="outline" onClick={()=>onDetail(kind,d)}>Detail</Button><Button size="sm" variant="outline" onClick={()=>onPrint(kind,d)}><Printer className="w-3.5 h-3.5 mr-1"/>Print</Button>{remaining>0&&<Button size="sm" variant="outline" onClick={()=>onPay(kind,d)}>Bayar</Button>}{!d.stock_received&&<Button size="sm" variant="outline" onClick={()=>onReceive(d.id)}>Terima Stok</Button>}{(d.purchase_url||d.order_url)&&<Button size="sm" variant="outline" onClick={()=>window.open(d.purchase_url||d.order_url,'_blank')}><ExternalLink className="w-3.5 h-3.5 mr-1"/>Link</Button>}</div></div><div className="flex gap-2"><button onClick={()=>onEdit(d)} className="text-blue-600"><Edit2 className="w-4 h-4"/></button><button onClick={()=>onDelete(d)} className="text-red-600"><Trash2 className="w-4 h-4"/></button></div></div>})}</div>;
}
function PurchaseForm({ form, setForm, inventory, suppliers=[], isPO=false }) {
  const updateItem=(idx,patch)=>{const ns=[...form.items]; ns[idx]={...ns[idx],...patch}; setForm({...form,items:ns});};
  return <div className="space-y-3">{isPO?<SelectField label="Supplier" value={form.supplier_id} onChange={(v)=>setForm({...form,supplier_id:v})} items={suppliers.map(s=>({value:s.id,label:s.name}))}/>:<div className="grid grid-cols-2 gap-2"><SelectField label="Platform" value={form.platform} onChange={(v)=>setForm({...form,platform:v})} items={["shopee","tokopedia","tiktok","lazada","manual"].map(x=>({value:x,label:x}))}/><Field label="No. Order" value={form.order_number} onChange={(v)=>setForm({...form,order_number:v})}/></div>}<div className="grid grid-cols-2 gap-2"><Field label="Tanggal Estimasi Datang" type="date" value={form.expected_date||''} onChange={(v)=>setForm({...form,expected_date:v})}/><Field label="Jatuh Tempo Bayar" type="date" value={form.due_date||''} onChange={(v)=>setForm({...form,due_date:v})}/></div><Field label={isPO?"Link Pembelian / Invoice Online":"Link Order Marketplace"} value={form.purchase_url || form.order_url || ''} onChange={(v)=>setForm(isPO?{...form,purchase_url:v}:{...form,order_url:v})}/><div className="space-y-2"><Label>Item</Label>{form.items.map((it,idx)=><div key={idx} className="flex gap-2"><Select value={it.item_id} onValueChange={(v)=>{const inv=inventory.find(x=>x.id===v); updateItem(idx,{item_id:v,name:inv?.name||''});}}><SelectTrigger className="flex-1"><SelectValue placeholder="Pilih barang inventori"/></SelectTrigger><SelectContent>{inventory.map(i=><SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent></Select><Input className="w-20" type="number" placeholder="Qty" value={it.quantity||''} onChange={(e)=>updateItem(idx,{quantity:e.target.value})}/><Input className="w-28" type="number" placeholder="Harga" value={it.unit_price||''} onChange={(e)=>updateItem(idx,{unit_price:e.target.value})}/><button onClick={()=>{const ns=form.items.filter((_,i)=>i!==idx);setForm({...form,items:ns.length?ns:[{item_id:'',name:'',quantity:0,unit_price:0}]});}}><Trash2 className="w-4 h-4 text-red-600"/></button></div>)}<button onClick={()=>setForm({...form,items:[...form.items,{item_id:'',name:'',quantity:0,unit_price:0}]})} className="text-xs text-[#1a6b3c] font-medium">+ Tambah Item</button></div>{!isPO&&<Field label="Ongkir" type="number" value={form.shipping_cost||''} onChange={(v)=>setForm({...form,shipping_cost:v})}/>}<div className="grid grid-cols-2 gap-2"><Field label="Dibayar Awal" type="number" value={form.paid_amount||''} onChange={(v)=>setForm({...form,paid_amount:v})}/><SelectField label="Metode" value={form.payment_method||'transfer'} onChange={(v)=>setForm({...form,payment_method:v})} items={PAYMENT_METHODS}/></div><ImageUpload value={form.invoice_image_url} onChange={(v)=>setForm({...form,invoice_image_url:v})} label="Invoice / Bukti Pembelian" testid="purchase-invoice"/><ImageUpload value={form.payment_proof_url} onChange={(v)=>setForm({...form,payment_proof_url:v})} label="Bukti Bayar" testid="purchase-proof"/><Label>Catatan</Label><Textarea value={form.notes||''} onChange={(e)=>setForm({...form,notes:e.target.value})}/></div>;
}
function PurchaseDetail({ kind, doc, payments, onPrint }) { return <div className="space-y-3 text-sm"><div className="grid grid-cols-2 gap-2"><Info label="Nomor" value={kind==='po'?doc.po_no:doc.order_number}/><Info label="Total" value={formatRupiah(doc.total||0)}/><Info label="Dibayar" value={formatRupiah(doc.paid_amount||0)}/><Info label="Sisa" value={formatRupiah((doc.total||0)-(doc.paid_amount||0))}/><Info label="Status Bayar" value={statusLabel(doc.payment_status)}/><Info label="Status Stok" value={doc.stock_received?'Sudah diterima':'Belum diterima'}/></div><div>{(doc.items||[]).map((it,i)=><div key={i} className="flex justify-between border-b py-1"><span>{it.name} · {it.quantity}x</span><b>{formatRupiah(it.quantity*it.unit_price)}</b></div>)}</div>{(doc.purchase_url||doc.order_url)&&<Button variant="outline" onClick={()=>window.open(doc.purchase_url||doc.order_url,'_blank')}><ExternalLink className="w-4 h-4 mr-1"/>Buka Link Pembelian</Button>}<div className="flex gap-2 flex-wrap">{doc.invoice_image_url&&<a className="text-blue-600 underline flex items-center gap-1" href={resolveImageUrl(doc.invoice_image_url)} target="_blank" rel="noreferrer"><ImageIcon className="w-4 h-4"/>Invoice</a>}{doc.payment_proof_url&&<a className="text-blue-600 underline flex items-center gap-1" href={resolveImageUrl(doc.payment_proof_url)} target="_blank" rel="noreferrer"><ImageIcon className="w-4 h-4"/>Bukti Bayar</a>}</div><div><b>Riwayat Pembayaran</b>{payments.length===0?<div className="text-gray-400 text-xs mt-1">Belum ada pembayaran terpisah</div>:payments.map(p=><div key={p.id} className="flex justify-between border-b py-1 text-xs"><span>{formatDate(p.paid_at)} · {p.method}</span><b>{formatRupiah(p.amount)}</b></div>)}</div><Button variant="outline" onClick={()=>onPrint(kind,doc)}><Printer className="w-4 h-4 mr-1"/>Print Bukti</Button></div>; }
function Info({label,value}){return <div className="bg-gray-50 rounded p-2"><div className="text-xs text-gray-500">{label}</div><div className="font-semibold">{value}</div></div>}
function Empty({ text }) { return <div className="col-span-full text-center py-6 text-gray-400 text-sm">{text}</div>; }
function Field({ label, value, onChange, type='text' }) { return <div><Label>{label}</Label><Input type={type} value={value} onChange={(e)=>onChange(e.target.value)} /></div>; }
function SelectField({ label, value, onChange, items }) { return <div><Label>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{items.map((i)=><SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent></Select></div>; }
