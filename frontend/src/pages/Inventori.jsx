import React, { useEffect, useState, useMemo } from "react";
import { Plus, Search, AlertTriangle, Edit, Trash2, FileSpreadsheet, FileText, Image as ImageIcon, Factory } from "lucide-react";
import api, { formatRupiah } from "@/lib/api";
import { exportInventoryXLSX, exportInventoryPDF } from "@/lib/exports";
import ImageUpload, { resolveImageUrl } from "@/components/ImageUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const CATEGORIES = [
  "Bahan Baku Warung", "Bahan Baku Pupuk", "Bahan Baku Kebun",
  "Bibit Anggur", "Buah Anggur", "Barang Jadi", "Peralatan & Perlengkapan",
];
const UNITS = ["pcs", "gram", "kg", "liter", "ml", "porsi", "gelas", "batang", "karung"];
const FALLBACK_BIZ = ["warung", "anggur", "pupuk", "pembibitan", "gudang"];

const initial = {
  name: "", category: CATEGORIES[0], unit: "pcs",
  current_stock: "", min_stock: "", cost_price: "", sell_price: "",
  business_unit: "warung", location: "", notes: "",
  supplier_name: "", batch_no: "", purchase_ref: "", purchase_url: "", expiry_date: "",
};

export default function Inventori() {
  const [items, setItems] = useState([]);
  const [boms, setBoms] = useState([]);
  const [bizUnits, setBizUnits] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initial);
  const [produceItem, setProduceItem] = useState(null);
  const [produceQty, setProduceQty] = useState("");
  const [producing, setProducing] = useState(false);
  const [batchItem, setBatchItem] = useState(null);
  const [batchRows, setBatchRows] = useState([]);
  const [templateId, setTemplateId] = useState("new");

  const load = async () => {
    const { data } = await api.get("/inventory");
    setItems(data);
  };
  const loadBoms = async () => {
    try { const { data } = await api.get("/bom"); setBoms(data); } catch (err) { /* ignore */ }
  };
  const loadBizUnits = async () => {
    try {
      const { data } = await api.get("/business-units");
      setBizUnits(data.filter((u) => u.active !== false));
    } catch (err) { /* ignore */ }
  };
  useEffect(() => { load(); loadBoms(); loadBizUnits(); }, []);

  useEffect(() => {
    const h = (e) => {
      const k = e.detail?.type;
      if (k === "bizunit_updated") loadBizUnits();
      if (k === "transaction_created" || k === "transaction_cancelled") load();
    };
    window.addEventListener("aw:ws", h);
    return () => window.removeEventListener("aw:ws", h);
  }, []);

  // Build dynamic biz unit list: prefer API, fallback to hardcoded
  const bizUnitOptions = bizUnits.length > 0
    ? bizUnits.map((u) => ({ code: u.code, name: u.name, color: u.color || "#1a6b3c" }))
    : FALLBACK_BIZ.map((c) => ({ code: c, name: c, color: "#1a6b3c" }));

  const bomByOutput = useMemo(() => {
    const map = {};
    for (const b of boms) map[b.output_item_id] = b;
    return map;
  }, [boms]);

  const itemsById = useMemo(() => {
    const map = {}; for (const i of items) map[i.id] = i; return map;
  }, [items]);

  const filtered = useMemo(() => {
    let f = items;
    if (filter === "low") f = f.filter((i) => i.current_stock <= i.min_stock && i.min_stock > 0);
    else if (filter !== "all") f = f.filter((i) => i.business_unit === filter);
    if (search) f = f.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
    return f;
  }, [items, filter, search]);

  const openNew = () => { setEditing(null); setTemplateId("new"); setForm(initial); setShowForm(true); };
  const useTemplate = (id) => {
    setTemplateId(id);
    if (id === "new") { setForm(initial); return; }
    const item = items.find((x) => x.id === id);
    if (!item) return;
    setForm({
      ...initial,
      name: item.name || "", category: item.category || initial.category, unit: item.unit || "pcs",
      business_unit: item.business_unit || "warung", min_stock: item.min_stock || "",
      cost_price: item.cost_price || "", sell_price: item.sell_price || "",
      location: item.location || "", supplier_name: item.last_supplier_name || "",
      current_stock: "", batch_no: "", notes: "", image_url: item.image_url || "",
    });
  };
  const openBatches = async (item) => {
    setBatchItem(item);
    try { const { data } = await api.get(`/inventory/${item.id}/batches`); setBatchRows(data); }
    catch { toast.error("Gagal memuat batch"); }
  };
  const openEdit = (item) => {
    setEditing(item);
    // Keep blank strings if 0 so user can clear them when editing
    setForm({ ...initial, ...item });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name) return toast.error("Nama wajib diisi");
    try {
      // Coerce string fields to numbers at submission time
      const payload = {
        ...form,
        current_stock: parseFloat(form.current_stock) || 0,
        min_stock: parseFloat(form.min_stock) || 0,
        cost_price: parseInt(form.cost_price) || 0,
        sell_price: parseInt(form.sell_price) || 0,
      };
      const same = !editing && items.find((i) => String(i.name || '').toLowerCase().trim() === String(form.name || '').toLowerCase().trim() && i.unit === form.unit && i.business_unit === form.business_unit);
      if (same && !window.confirm(`Barang "${form.name}" sudah ada. Sistem akan menambah stok ke item lama dan mencatat batch/supplier baru. Lanjut?`)) return;
      if (editing) await api.put(`/inventory/${editing.id}`, payload);
      else await api.post("/inventory", payload);
      toast.success(editing ? "Tersimpan" : "Tersimpan. Jika barang sama, stok digabung dan batch supplier dicatat.");
      setShowForm(false); load();
    } catch (e) { toast.error("Gagal menyimpan"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Hapus barang ini?")) return;
    await api.delete(`/inventory/${id}`);
    load();
  };

  const openProduce = (item) => {
    setProduceItem(item);
    setProduceQty("");
  };

  const doProduce = async () => {
    const q = parseFloat(produceQty);
    if (!q || q <= 0) return toast.error("Masukkan jumlah produksi");
    setProducing(true);
    try {
      const { data } = await api.post(`/inventory/${produceItem.id}/produce`, { quantity: q });
      toast.success(`Produksi ${q} ${produceItem.unit} ${produceItem.name} berhasil${data.has_bom ? " — bahan baku otomatis berkurang" : ""}`);
      setProduceItem(null); setProduceQty(""); load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal produksi");
    } finally {
      setProducing(false);
    }
  };

  const lowCount = items.filter((i) => i.current_stock <= i.min_stock && i.min_stock > 0).length;

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Inventori & Gudang</h1>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} barang · {lowCount} stok menipis</p>
        </div>
        <div className="flex items-center gap-2">
          <Button data-testid="add-inventory-btn" onClick={openNew} className="bg-[#1a6b3c] hover:bg-[#14522d]">
            <Plus className="w-4 h-4 mr-1.5" /> Barang Baru
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => exportInventoryXLSX(items)} data-testid="export-inv-xlsx">
          <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Export Excel
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportInventoryPDF(items)} data-testid="export-inv-pdf">
          <FileText className="w-4 h-4 mr-1.5" /> Export PDF
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input data-testid="inventory-search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari barang..." className="pl-9 h-10 bg-gray-50 border-gray-200" />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {[
            ["all", "Semua"], ["low", `⚠ Menipis (${lowCount})`],
            ...bizUnitOptions.map(u => [u.code, u.name]),
          ].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} data-testid={`filter-${k}`}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                filter === k ? "bg-[#1a6b3c] text-white" : "bg-gray-100 text-gray-700"
              }`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">Tidak ada barang</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((i) => {
              const low = i.current_stock <= i.min_stock && i.min_stock > 0;
              return (
                <div key={i.id} data-testid={`inv-item-${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  {i.image_url ? (
                    <img src={resolveImageUrl(i.image_url)} alt={i.name} className="w-12 h-12 object-cover rounded-lg border border-gray-200 flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <ImageIcon className="w-5 h-5 text-gray-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">{i.name}</span>
                      {low && <Badge variant="destructive" className="text-[10px] py-0">Menipis</Badge>}
                      {bomByOutput[i.id] && <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] py-0 hover:bg-blue-100">BOM</Badge>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {i.category} · {i.business_unit} {i.location && `· ${i.location}`}
                    </div>
                    {(i.last_supplier_name || i.last_batch_no) && (
                      <div className="text-[10px] text-blue-700 mt-0.5 truncate">
                        Batch terakhir: {i.last_batch_no || "—"}{i.last_supplier_name && ` · ${i.last_supplier_name}`}{i.last_stock_in_at && ` · ${new Date(i.last_stock_in_at).toLocaleDateString('id-ID')}`}
                      </div>
                    )}
                    {i.batch_count > 0 && (
                      <button onClick={() => openBatches(i)} className="text-[10px] text-emerald-700 hover:underline mt-0.5">
                        Lihat {i.batch_count} batch · sisa batch {Number(i.batch_remaining_total || 0).toFixed(2)} {i.unit}
                      </button>
                    )}
                  </div>
                  <div className="text-right">
                    <div className={`font-mono font-semibold text-sm ${low ? "text-red-600" : "text-gray-900"}`}>
                      {i.current_stock} {i.unit}
                    </div>
                    <div className="text-xs text-gray-500 font-mono">
                      Min: {i.min_stock} · HPP {formatRupiah(i.cost_price)}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button data-testid={`produce-btn-${i.id}`} onClick={() => openProduce(i)} className="p-2 text-gray-500 hover:text-[#1a6b3c]" title={bomByOutput[i.id] ? "Produksi (otomatis kurangi bahan baku)" : "Tambah stok"}>
                      <Factory className="w-4 h-4" />
                    </button>
                    <button data-testid={`edit-btn-${i.id}`} onClick={() => openEdit(i)} className="p-2 text-gray-500 hover:text-[#1a6b3c]"><Edit className="w-4 h-4" /></button>
                    <button data-testid={`delete-btn-${i.id}`} onClick={() => remove(i.id)} className="p-2 text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Barang" : "Tambah Barang"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <ImageUpload value={form.image_url} onChange={(v) => setForm({ ...form, image_url: v })} label="Foto Produk (opsional)" testid="inv-image" />
            </div>
            {!editing && (
              <div className="col-span-2 rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                <Label>Tambah dari barang yang sudah ada</Label>
                <Select value={templateId} onValueChange={useTemplate}>
                  <SelectTrigger className="mt-1 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Barang baru / isi manual</SelectItem>
                    {items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name} · stok {i.current_stock} {i.unit}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="text-[11px] text-emerald-800 mt-1">Pilih barang lama agar nama, kategori, satuan, harga, dan supplier terakhir otomatis terisi. Kamu tinggal isi stok masuk baru.</div>
              </div>
            )}
            <div className="col-span-2">
              <Label>Nama Barang</Label>
              <Input data-testid="form-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Kategori</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger data-testid="form-category"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unit Bisnis</Label>
              <Select value={form.business_unit} onValueChange={(v) => setForm({ ...form, business_unit: v })}>
                <SelectTrigger data-testid="form-biz-unit"><SelectValue /></SelectTrigger>
                <SelectContent>{bizUnitOptions.map(u => <SelectItem key={u.code} value={u.code}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Satuan</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Stok Saat Ini</Label>
              <Input type="number" inputMode="decimal" value={form.current_stock ?? ""} onChange={(e) => setForm({ ...form, current_stock: e.target.value })} />
            </div>
            <div>
              <Label>Stok Minimum</Label>
              <Input type="number" inputMode="decimal" value={form.min_stock ?? ""} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
            </div>
            <div>
              <Label>Lokasi</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Rak A2" />
            </div>
            {!editing && (
              <div className="col-span-2 rounded-lg border border-blue-100 bg-blue-50 p-3 grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 text-xs text-blue-800 leading-relaxed">
                  Jika nama barang sudah ada, stok akan otomatis ditambahkan ke item lama dan dicatat sebagai batch baru. Ini membantu trace supplier kalau ada retur/komplain.
                </div>
                <div><Label>Supplier / Sumber</Label><Input value={form.supplier_name || ""} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} placeholder="Nama supplier" /></div>
                <div><Label>No Batch / Invoice</Label><Input value={form.batch_no || ""} onChange={(e) => setForm({ ...form, batch_no: e.target.value })} placeholder="Kosong = otomatis GP150626001" /></div>
                <div><Label>Ref Pembelian</Label><Input value={form.purchase_ref || ""} onChange={(e) => setForm({ ...form, purchase_ref: e.target.value })} placeholder="PO/Marketplace" /></div>
                <div><Label>Link Pembelian</Label><Input value={form.purchase_url || ""} onChange={(e) => setForm({ ...form, purchase_url: e.target.value })} placeholder="https://..." /></div>
                <div><Label>Tanggal Beli/Panen</Label><Input type="date" value={form.purchase_date || ""} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></div><div><Label>Kadaluarsa / Evaluasi</Label><Input type="date" value={form.expiry_date || ""} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
              </div>
            )}
            <div>
              <Label>Harga Pokok (Rp)</Label>
              <Input type="number" inputMode="numeric" value={form.cost_price ?? ""} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
            </div>
            <div>
              <Label>Harga Jual (Rp)</Label>
              <Input type="number" inputMode="numeric" value={form.sell_price ?? ""} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
            <Button onClick={save} data-testid="save-inventory-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!batchItem} onOpenChange={() => setBatchItem(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Batch {batchItem?.name}</DialogTitle></DialogHeader>
          <div className="text-xs text-gray-500">Riwayat batch tidak ditumpuk. Sisa batch lama berkurang otomatis saat barang keluar lewat kasir/pemakaian.</div>
          <div className="divide-y divide-gray-100 border rounded-lg overflow-hidden">
            {batchRows.length === 0 ? <div className="p-6 text-center text-gray-400 text-sm">Belum ada batch</div> : batchRows.map((b) => (
              <div key={b.id} className="p-3 grid sm:grid-cols-4 gap-2 text-sm">
                <div><div className="text-[10px] text-gray-500 uppercase">Batch</div><div className="font-mono font-semibold">{b.batch_no}</div></div>
                <div><div className="text-[10px] text-gray-500 uppercase">Supplier</div><div>{b.supplier_name || '—'}</div></div>
                <div><div className="text-[10px] text-gray-500 uppercase">Masuk</div><div className="font-mono">{b.quantity} {b.unit}</div></div>
                <div><div className="text-[10px] text-gray-500 uppercase">Sisa</div><div className="font-mono font-bold text-emerald-700">{Number(b.remaining_quantity ?? b.quantity ?? 0).toFixed(2)} {b.unit}</div></div>
                <div className="sm:col-span-4 text-xs text-gray-500">{b.purchase_date ? new Date(b.purchase_date).toLocaleDateString('id-ID') : ''} {b.purchase_ref && `· Ref ${b.purchase_ref}`} {b.purchase_url && <a className="text-blue-600 underline" href={b.purchase_url} target="_blank" rel="noreferrer">· Link</a>} {b.notes && `· ${b.notes}`}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Produksi Dialog — for items with BOM */}
      <Dialog open={!!produceItem} onOpenChange={() => setProduceItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Factory className="w-5 h-5 text-[#1a6b3c]" /> Produksi {produceItem?.name}</DialogTitle>
          </DialogHeader>
          {produceItem && (() => {
            const bom = bomByOutput[produceItem.id];
            const q = parseFloat(produceQty) || 0;
            return (
              <div className="space-y-3">
                <div>
                  <Label>Jumlah Produksi ({produceItem.unit})</Label>
                  <Input data-testid="produce-qty-input" type="number" inputMode="decimal" value={produceQty}
                    onChange={(e) => setProduceQty(e.target.value)} placeholder="Mis. 10" autoFocus />
                </div>
                <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2 border border-gray-100">
                  Stok saat ini: <b className="font-mono">{produceItem.current_stock} {produceItem.unit}</b><br />
                  Setelah produksi: <b className="font-mono text-emerald-700">{(produceItem.current_stock + q).toFixed(2)} {produceItem.unit}</b>
                </div>
                {bom ? (
                  <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                    <div className="text-xs font-semibold text-amber-900 mb-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Bahan baku yang akan dipakai (BOM):</div>
                    <div className="space-y-1.5">
                      {bom.ingredients.map((ing) => {
                        const ref = itemsById[ing.item_id];
                        const need = (ing.quantity * q).toFixed(2);
                        const available = ref?.current_stock || 0;
                        const insufficient = q > 0 && available < ing.quantity * q;
                        return (
                          <div key={ing.item_id} className="text-xs flex justify-between font-mono">
                            <span className="text-amber-900">{ref?.name || ing.item_id}</span>
                            <span className={insufficient ? "text-red-600 font-bold" : "text-amber-800"}>
                              {need} / tersedia {available} {ref?.unit || ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-500 bg-blue-50 border border-blue-100 rounded-lg p-2">
                    Item ini belum punya BOM. Stok akan ditambahkan langsung tanpa mengurangi bahan baku.
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProduceItem(null)}>Batal</Button>
            <Button data-testid="produce-confirm-btn" onClick={doProduce} disabled={producing} className="bg-[#1a6b3c] hover:bg-[#14522d]">
              <Factory className="w-4 h-4 mr-1.5" /> {producing ? "Memproduksi..." : "Produksi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
