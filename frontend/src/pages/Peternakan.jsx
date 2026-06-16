import React, { useEffect, useMemo, useState } from "react";
import { Activity, Plus, Trash2, Printer } from "lucide-react";
import api, { formatDateTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { printViaIframe } from "@/lib/safePrint";

const initAsset = { name: "", animal_type: "ayam", count: "", unit: "ekor", location: "Kandang", notes: "" };
const initProd = { asset_id: "", product_name: "Telur", quantity: "", unit: "pcs", grade: "A", notes: "" };

export default function Peternakan() {
  const [assets, setAssets] = useState([]);
  const [productions, setProductions] = useState([]);
  const [showAsset, setShowAsset] = useState(false);
  const [showProd, setShowProd] = useState(false);
  const [assetForm, setAssetForm] = useState(initAsset);
  const [prodForm, setProdForm] = useState(initProd);

  const load = async () => {
    const [a, p] = await Promise.all([api.get("/livestock/assets"), api.get("/livestock/productions")]);
    setAssets(a.data); setProductions(p.data);
  };
  useEffect(() => { load(); }, []);

  const saveAsset = async () => {
    if (!assetForm.name) return toast.error("Nama kelompok ternak wajib");
    await api.post("/livestock/assets", { ...assetForm, count: parseFloat(assetForm.count) || 0 });
    setShowAsset(false); setAssetForm(initAsset); load(); toast.success("Aset ternak tersimpan dan bisa masuk inventori");
  };
  const saveProduction = async () => {
    if (!prodForm.product_name || !prodForm.quantity) return toast.error("Produk dan jumlah wajib");
    const { data } = await api.post("/livestock/productions", { ...prodForm, quantity: parseFloat(prodForm.quantity) || 0 });
    setShowProd(false); setProdForm(initProd); load(); toast.success(`Hasil ternak masuk inventori${data.batch_no ? ` · ${data.batch_no}` : ""}`);
  };
  const delProd = async (p) => { if (!window.confirm("Hapus produksi ini dan balikkan stok?")) return; await api.delete(`/livestock/productions/${p.id}`); load(); };
  const delAsset = async (a) => { if (!window.confirm("Hapus aset ternak ini?")) return; try { await api.delete(`/livestock/assets/${a.id}`); load(); } catch(e){ toast.error(e?.response?.data?.detail || "Gagal"); } };
  const printLabel = (p) => {
    const target = `${window.location.origin}/inventori?batch=${encodeURIComponent(p.batch_no || p.id)}`;
    const qr = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(target)}`;
    printViaIframe({ title: `Label ${p.batch_no || p.product_name}`, css: "body{font-family:monospace;font-size:12px;text-align:center;padding:8px}.qr{width:92px;height:92px}.big{font-weight:700;font-size:14px}", bodyHtml: `<div class='big'>${p.inventory_item_name || p.product_name}</div><div>Batch: ${p.batch_no || '-'}</div><img class='qr' src='${qr}'/><div>${p.quantity} ${p.unit}</div>` });
  };
  const totalAssets = assets.reduce((s,a)=>s+(Number(a.count)||0),0);
  const totalProd = productions.reduce((s,p)=>s+(Number(p.quantity)||0),0);

  return <div className="space-y-4 fade-in">
    <div className="flex items-end justify-between gap-3 flex-wrap"><div><h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{fontFamily:'Poppins'}}>Peternakan</h1><p className="text-sm text-gray-500 mt-0.5">Ayam, telur, pakan, hasil ternak, batch dan inventori</p></div><div className="flex gap-2"><Button variant="outline" onClick={()=>setShowAsset(true)}><Plus className="w-4 h-4 mr-1"/>Aset Ternak</Button><Button onClick={()=>setShowProd(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]"><Activity className="w-4 h-4 mr-1"/>Catat Hasil</Button></div></div>
    <div className="grid sm:grid-cols-3 gap-3"><Card title="Kelompok Ternak" value={assets.length}/><Card title="Total Ekor" value={totalAssets}/><Card title="Hasil Tercatat" value={totalProd}/></div>
    <div className="grid lg:grid-cols-2 gap-4"><section className="bg-white rounded-xl border p-4"><h2 className="font-semibold mb-3">Aset Ternak</h2>{assets.length===0?<Empty/>:assets.map(a=><div key={a.id} className="border-b py-2 flex justify-between gap-2"><div><b className="text-sm">{a.name}</b><div className="text-xs text-gray-500">{a.animal_type} · {a.count} {a.unit} · {a.location}</div></div><button onClick={()=>delAsset(a)} className="text-red-600"><Trash2 className="w-4 h-4"/></button></div>)}</section><section className="bg-white rounded-xl border p-4"><h2 className="font-semibold mb-3">Produksi / Hasil Ternak</h2>{productions.length===0?<Empty/>:productions.map(p=><div key={p.id} className="border-b py-2 flex justify-between gap-2"><div><b className="text-sm">{p.inventory_item_name || p.product_name}</b><div className="text-xs text-gray-500">{p.quantity} {p.unit} · Grade {p.grade} · {formatDateTime(p.date)}</div>{p.batch_no&&<div className="text-[10px] text-emerald-700 font-mono">Batch {p.batch_no}</div>}</div><div className="flex gap-2"><button onClick={()=>printLabel(p)} className="text-gray-600"><Printer className="w-4 h-4"/></button><button onClick={()=>delProd(p)} className="text-red-600"><Trash2 className="w-4 h-4"/></button></div></div>)}</section></div>
    <Dialog open={showAsset} onOpenChange={setShowAsset}><DialogContent><DialogHeader><DialogTitle>Tambah Aset Ternak</DialogTitle></DialogHeader><Field label="Nama Kelompok" value={assetForm.name} onChange={(v)=>setAssetForm({...assetForm,name:v})}/><Field label="Jenis" value={assetForm.animal_type} onChange={(v)=>setAssetForm({...assetForm,animal_type:v})}/><Field label="Jumlah" type="number" value={assetForm.count} onChange={(v)=>setAssetForm({...assetForm,count:v})}/><Field label="Lokasi/Kandang" value={assetForm.location} onChange={(v)=>setAssetForm({...assetForm,location:v})}/><DialogFooter><Button variant="outline" onClick={()=>setShowAsset(false)}>Batal</Button><Button onClick={saveAsset}>Simpan</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={showProd} onOpenChange={setShowProd}><DialogContent><DialogHeader><DialogTitle>Catat Hasil Ternak</DialogTitle></DialogHeader><Label>Kelompok Ternak</Label><Select value={prodForm.asset_id} onValueChange={(v)=>setProdForm({...prodForm,asset_id:v})}><SelectTrigger><SelectValue placeholder="Opsional"/></SelectTrigger><SelectContent>{assets.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><Field label="Nama Produk" value={prodForm.product_name} onChange={(v)=>setProdForm({...prodForm,product_name:v})}/><Field label="Jumlah" type="number" value={prodForm.quantity} onChange={(v)=>setProdForm({...prodForm,quantity:v})}/><Field label="Satuan" value={prodForm.unit} onChange={(v)=>setProdForm({...prodForm,unit:v})}/><Field label="Grade" value={prodForm.grade} onChange={(v)=>setProdForm({...prodForm,grade:v})}/><Field label="Catatan" value={prodForm.notes} onChange={(v)=>setProdForm({...prodForm,notes:v})}/><DialogFooter><Button variant="outline" onClick={()=>setShowProd(false)}>Batal</Button><Button onClick={saveProduction}>Simpan</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
function Card({title,value}){return <div className="bg-white rounded-xl border p-4"><div className="text-xs text-gray-500">{title}</div><div className="text-2xl font-bold text-[#1a6b3c]">{value}</div></div>}
function Empty(){return <div className="py-8 text-center text-gray-400 text-sm">Belum ada data</div>}
function Field({label,value,onChange,type='text'}){return <div><Label>{label}</Label><Input type={type} value={value||''} onChange={(e)=>onChange(e.target.value)} className="mt-1"/></div>}
