import React, { useEffect, useState } from "react";
import { Plus, Trash2, Truck, ShoppingBag, Package, CheckCircle2, Image as ImageIcon, ExternalLink, Wallet } from "lucide-react";
import api, { formatRupiah, formatDate } from "@/lib/api";
import ResetModuleButton from "@/components/ResetModuleButton";
import ImageUpload, { resolveImageUrl } from "@/components/ImageUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const initSup = { name: "", contact: "", phone: "", address: "", payment_terms: "cash", notes: "" };
const initPO = { supplier_id: "", items: [{ item_id: "", name: "", quantity: 0, unit_price: 0 }], notes: "" };
const initOnline = { platform: "shopee", order_number: "", items: [{ item_id: "", name: "", quantity: 0, unit_price: 0 }], shipping_cost: 0, notes: "" };
const PAYMENT_TERMS = [
  { value: "cash", label: "Tunai" },
  { value: "transfer", label: "Transfer" },
  { value: "qris", label: "QRIS" },
  { value: "bon", label: "Bon" },
];
const paymentTermLabel = (v) => (PAYMENT_TERMS.find((x) => x.value === String(v || "").toLowerCase())?.label || v || "Tunai");

export default function Pembelian() {
  const [suppliers, setSuppliers] = useState([]);
  const [pos, setPos] = useState([]);
  const [online, setOnline] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [showSup, setShowSup] = useState(false);
  const [showPO, setShowPO] = useState(false);
  const [showOnline, setShowOnline] = useState(false);
  const [supForm, setSupForm] = useState(initSup);
  const [poForm, setPoForm] = useState(initPO);
  const [onlineForm, setOnlineForm] = useState(initOnline);

  const load = async () => {
    const [s, p, o, i] = await Promise.all([
      api.get("/suppliers"), api.get("/purchase-orders"),
      api.get("/online-orders"), api.get("/inventory"),
    ]);
    setSuppliers(s.data); setPos(p.data); setOnline(o.data); setInventory(i.data);
  };
  useEffect(() => { load(); }, []);

  const saveSup = async () => {
    if (!supForm.name) return toast.error("Nama wajib");
    await api.post("/suppliers", supForm);
    setSupForm(initSup); setShowSup(false); load(); toast.success("Supplier ditambahkan");
  };

  const savePO = async () => {
    if (!poForm.supplier_id || poForm.items.some((i) => !i.item_id || !i.quantity)) return toast.error("Lengkapi data");
    const cleaned = poForm.items.map((it) => {
      const inv = inventory.find((x) => x.id === it.item_id);
      return { ...it, name: inv?.name || "", quantity: parseFloat(it.quantity), unit_price: parseInt(it.unit_price) || 0 };
    });
    await api.post("/purchase-orders", { ...poForm, items: cleaned });
    setPoForm(initPO); setShowPO(false); load(); toast.success("PO dibuat");
  };

  const receivePO = async (id) => {
    if (!window.confirm("Tandai PO sebagai diterima?\n• Stok otomatis bertambah\n• Tercatat sebagai pengeluaran")) return;
    try {
      const { data } = await api.post(`/purchase-orders/${id}/receive`);
      load();
      const summary = (data.items || []).map((i) => `${i.name} +${i.qty}`).join(", ");
      toast.success(`PO diterima${summary ? ` — ${summary}` : ""}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal menerima PO");
    }
  };

  const saveOnline = async () => {
    if (!onlineForm.order_number || onlineForm.items.some((i) => !i.name || !i.quantity)) return toast.error("Lengkapi data");
    const cleaned = onlineForm.items.map((it) => ({ ...it, quantity: parseFloat(it.quantity), unit_price: parseInt(it.unit_price) || 0 }));
    await api.post("/online-orders", { ...onlineForm, items: cleaned, shipping_cost: parseInt(onlineForm.shipping_cost) || 0 });
    setOnlineForm(initOnline); setShowOnline(false); load(); toast.success("Order online dicatat");
  };

  const receiveOnline = async (id) => {
    if (!window.confirm("Tandai order online sebagai tiba?\n• Stok otomatis bertambah\n• Tercatat sebagai pengeluaran")) return;
    try {
      const { data } = await api.post(`/online-orders/${id}/receive`);
      load();
      const summary = (data.items || []).map((i) => `${i.name} +${i.qty}`).join(", ");
      toast.success(`Order diterima${summary ? ` — ${summary}` : ""}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal menerima order");
    }
  };

  const updatePoStatus = async (id, field, value) => {
    try {
      const { data } = await api.put(`/purchase-orders/${id}/status`, { [field]: value });
      load();
      const parts = [];
      if (data?.stock) parts.push("stok bertambah");
      if (data?.expense) parts.push("dicatat di pengeluaran");
      toast.success(parts.length ? `Status diperbarui — ${parts.join(" & ")}` : "Status diperbarui");
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  const updateOnlineStatus = async (id, field, value) => {
    try {
      const { data } = await api.put(`/online-orders/${id}/status`, { [field]: value });
      load();
      const parts = [];
      if (data?.stock) parts.push("stok bertambah");
      if (data?.expense) parts.push("dicatat di pengeluaran");
      toast.success(parts.length ? `Status diperbarui — ${parts.join(" & ")}` : "Status diperbarui");
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  const deletePO = async (p) => {
    const warn = p.stock_received || p.expense_recorded
      ? `\n\n⚠ Stok dan/atau pengeluaran yang sudah tercatat akan otomatis dibalik.`
      : "";
    if (!window.confirm(`Hapus PO ${p.po_no}?${warn}`)) return;
    try {
      await api.delete(`/purchase-orders/${p.id}`);
      toast.success("PO dihapus");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal hapus PO"); }
  };

  const deleteOnline = async (o) => {
    const warn = o.stock_received || o.expense_recorded
      ? `\n\n⚠ Stok dan/atau pengeluaran yang sudah tercatat akan otomatis dibalik.`
      : "";
    if (!window.confirm(`Hapus order ${o.order_number}?${warn}`)) return;
    try {
      await api.delete(`/online-orders/${o.id}`);
      toast.success("Order online dihapus");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal hapus order"); }
  };

  const payColor = (s) => s === "paid" ? "bg-emerald-100 text-emerald-700 border-emerald-300"
    : s === "partial" ? "bg-amber-100 text-amber-800 border-amber-300"
    : "bg-red-100 text-red-700 border-red-300";
  const payLabel = (s) => s === "paid" ? "SUDAH BAYAR" : s === "partial" ? "SEBAGIAN" : "BELUM BAYAR";
  const delivColor = (s) => s === "arrived" ? "bg-emerald-100 text-emerald-700 border-emerald-300"
    : s === "shipped" ? "bg-blue-100 text-blue-700 border-blue-300"
    : "bg-gray-100 text-gray-700 border-gray-300";
  const delivLabel = (s) => s === "arrived" ? "SUDAH TIBA" : s === "shipped" ? "DIKIRIM" : "BELUM TIBA";

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Pembelian & Supplier</h1>
          <p className="text-sm text-gray-500 mt-0.5">PO supplier dan pembelian online (Shopee, Tokopedia)</p>
        </div>
        <ResetModuleButton module="pembelian" label="Pembelian" />
      </div>

      <Tabs defaultValue="po" className="bg-white rounded-xl border border-gray-100">
        <TabsList className="bg-gray-50 m-1 overflow-x-auto">
          <TabsTrigger value="po" data-testid="tab-po">Purchase Order</TabsTrigger>
          <TabsTrigger value="online" data-testid="tab-online">Belanja Online</TabsTrigger>
          <TabsTrigger value="suppliers" data-testid="tab-suppliers">Supplier</TabsTrigger>
        </TabsList>

        <TabsContent value="po" className="p-4 space-y-3">
          <Button data-testid="add-po-btn" onClick={() => setShowPO(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]" disabled={suppliers.length === 0}>
            <Plus className="w-4 h-4 mr-1.5" /> PO Baru
          </Button>
          <div className="divide-y divide-gray-100">
            {pos.length === 0 ? <div className="text-center py-6 text-gray-400 text-sm">Belum ada PO</div> :
              pos.map((p) => {
                const payStatus = p.payment_status || (p.status === "received" ? "paid" : "unpaid");
                const delivStatus = p.delivery_status || (p.status === "received" ? "arrived" : "pending");
                return (
                  <div key={p.id} data-testid={`po-row-${p.id}`} className="flex items-start gap-3 py-3">
                    <div className="p-2 bg-blue-50 rounded-lg mt-0.5"><Truck className="w-4 h-4 text-blue-700" /></div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-semibold">{p.po_no}</div>
                        <div className="font-mono text-sm font-semibold text-gray-900">{formatRupiah(p.total)}</div>
                      </div>
                      <div className="text-xs text-gray-500">{p.supplier_name} · {formatDate(p.created_at)}</div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Select value={payStatus} onValueChange={(v) => updatePoStatus(p.id, "payment_status", v)}>
                          <SelectTrigger data-testid={`po-pay-status-${p.id}`} className={`h-7 text-[10px] font-bold border w-auto px-2 ${payColor(payStatus)}`}>
                            <SelectValue>{payLabel(payStatus)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unpaid">Belum Bayar</SelectItem>
                            <SelectItem value="partial">Sebagian</SelectItem>
                            <SelectItem value="paid">Sudah Bayar</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={delivStatus} onValueChange={(v) => updatePoStatus(p.id, "delivery_status", v)}>
                          <SelectTrigger data-testid={`po-deliv-status-${p.id}`} className={`h-7 text-[10px] font-bold border w-auto px-2 ${delivColor(delivStatus)}`}>
                            <SelectValue>{delivLabel(delivStatus)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Belum Tiba</SelectItem>
                            <SelectItem value="shipped">Dikirim</SelectItem>
                            <SelectItem value="arrived">Sudah Tiba</SelectItem>
                          </SelectContent>
                        </Select>
                        {!p.stock_received && (
                          <button onClick={() => receivePO(p.id)} data-testid={`receive-po-${p.id}`} className="text-xs text-[#1a6b3c] font-semibold hover:underline ml-1 self-center">Terima Stok →</button>
                        )}
                        {p.stock_received && <Badge className="bg-emerald-600 self-center text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" /> Stok Masuk</Badge>}
                        {p.expense_recorded && <Badge className="bg-red-500 self-center text-[10px]"><Wallet className="w-3 h-3 mr-1" /> Pengeluaran Tercatat</Badge>}
                      </div>
                    </div>
                    <button onClick={() => deletePO(p)} data-testid={`delete-po-${p.id}`} className="p-1.5 text-gray-400 hover:text-red-600 self-start" title="Hapus PO">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
          </div>
        </TabsContent>

        <TabsContent value="online" className="p-4 space-y-3">
          <Button data-testid="add-online-btn" onClick={() => setShowOnline(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]">
            <ShoppingBag className="w-4 h-4 mr-1.5" /> Order Online
          </Button>
          <div className="divide-y divide-gray-100">
            {online.length === 0 ? <div className="text-center py-6 text-gray-400 text-sm">Belum ada order online</div> :
              online.map((o) => {
                const payStatus = o.payment_status || (o.status === "received" ? "paid" : "unpaid");
                const delivStatus = o.delivery_status || (o.status === "received" ? "arrived" : "pending");
                return (
                  <div key={o.id} data-testid={`online-row-${o.id}`} className="flex items-start gap-3 py-3">
                    {o.invoice_image_url ? (
                      <a href={resolveImageUrl(o.invoice_image_url)} target="_blank" rel="noreferrer" className="flex-shrink-0">
                        <img src={resolveImageUrl(o.invoice_image_url)} alt="invoice" className="w-12 h-12 object-cover rounded-lg border border-gray-200" />
                      </a>
                    ) : (
                      <div className="p-2 bg-orange-50 rounded-lg flex-shrink-0 mt-0.5"><Package className="w-4 h-4 text-orange-700" /></div>
                    )}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-semibold">{o.order_number}</div>
                        <div className="font-mono text-sm font-semibold text-gray-900">{formatRupiah(o.total)}</div>
                      </div>
                      <div className="text-xs text-gray-500 capitalize">{o.platform} · {formatDate(o.order_date)}</div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Select value={payStatus} onValueChange={(v) => updateOnlineStatus(o.id, "payment_status", v)}>
                          <SelectTrigger data-testid={`online-pay-status-${o.id}`} className={`h-7 text-[10px] font-bold border w-auto px-2 ${payColor(payStatus)}`}>
                            <SelectValue>{payLabel(payStatus)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unpaid">Belum Bayar</SelectItem>
                            <SelectItem value="partial">Sebagian</SelectItem>
                            <SelectItem value="paid">Sudah Bayar</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={delivStatus} onValueChange={(v) => updateOnlineStatus(o.id, "delivery_status", v)}>
                          <SelectTrigger data-testid={`online-deliv-status-${o.id}`} className={`h-7 text-[10px] font-bold border w-auto px-2 ${delivColor(delivStatus)}`}>
                            <SelectValue>{delivLabel(delivStatus)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Belum Tiba</SelectItem>
                            <SelectItem value="shipped">Dikirim</SelectItem>
                            <SelectItem value="arrived">Sudah Tiba</SelectItem>
                          </SelectContent>
                        </Select>
                        {!o.stock_received && (
                          <button onClick={() => receiveOnline(o.id)} data-testid={`receive-online-${o.id}`} className="text-xs text-[#1a6b3c] font-semibold hover:underline ml-1 self-center">Terima Stok →</button>
                        )}
                        {o.stock_received && <Badge className="bg-emerald-600 self-center text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" /> Stok Masuk</Badge>}
                        {o.expense_recorded && <Badge className="bg-red-500 self-center text-[10px]"><Wallet className="w-3 h-3 mr-1" /> Pengeluaran Tercatat</Badge>}
                      </div>
                    </div>
                    <button onClick={() => deleteOnline(o)} data-testid={`delete-online-${o.id}`} className="p-1.5 text-gray-400 hover:text-red-600 self-start" title="Hapus order">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
          </div>
        </TabsContent>

        <TabsContent value="suppliers" className="p-4 space-y-3">
          <Button data-testid="add-supplier-btn" onClick={() => setShowSup(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]">
            <Plus className="w-4 h-4 mr-1.5" /> Supplier Baru
          </Button>
          <div className="grid sm:grid-cols-2 gap-3">
            {suppliers.length === 0 ? <div className="col-span-full text-center py-6 text-gray-400 text-sm">Belum ada supplier</div> :
              suppliers.map((s) => (
                <div key={s.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="font-semibold text-sm">{s.name}</div>
                  <div className="text-xs text-gray-500">{s.contact || "—"} · {s.phone || "—"}</div>
                  <div className="text-xs text-gray-600 mt-1">Termin: {paymentTermLabel(s.payment_terms)}</div>
                </div>
              ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Supplier */}
      <Dialog open={showSup} onOpenChange={setShowSup}>
        <DialogContent>
          <DialogHeader><DialogTitle>Supplier Baru</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nama Supplier</Label><Input value={supForm.name} onChange={(e) => setSupForm({ ...supForm, name: e.target.value })} /></div>
            <div><Label>Kontak Person</Label><Input value={supForm.contact} onChange={(e) => setSupForm({ ...supForm, contact: e.target.value })} /></div>
            <div><Label>No. HP</Label><Input value={supForm.phone} onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })} /></div>
            <div><Label>Alamat</Label><Input value={supForm.address} onChange={(e) => setSupForm({ ...supForm, address: e.target.value })} /></div>
            <div>
              <Label>Termin Pembayaran</Label>
              <Select value={supForm.payment_terms} onValueChange={(v) => setSupForm({ ...supForm, payment_terms: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_TERMS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSup(false)}>Batal</Button>
            <Button onClick={saveSup} className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add PO */}
      <Dialog open={showPO} onOpenChange={setShowPO}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Purchase Order Baru</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Supplier</Label>
              <Select value={poForm.supplier_id} onValueChange={(v) => setPoForm({ ...poForm, supplier_id: v })}>
                <SelectTrigger data-testid="po-supplier-select"><SelectValue placeholder="Pilih supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Item</Label>
              <div className="space-y-2">
                {poForm.items.map((it, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Select value={it.item_id} onValueChange={(v) => { const ns = [...poForm.items]; ns[idx] = { ...ns[idx], item_id: v }; setPoForm({ ...poForm, items: ns }); }}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Pilih barang" /></SelectTrigger>
                      <SelectContent>{inventory.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input className="w-20 font-mono" placeholder="Qty" type="number" step="any" value={it.quantity || ""}
                      onChange={(e) => { const ns = [...poForm.items]; ns[idx] = { ...ns[idx], quantity: e.target.value }; setPoForm({ ...poForm, items: ns }); }} />
                    <Input className="w-28 font-mono" placeholder="Harga" type="number" value={it.unit_price || ""}
                      onChange={(e) => { const ns = [...poForm.items]; ns[idx] = { ...ns[idx], unit_price: e.target.value }; setPoForm({ ...poForm, items: ns }); }} />
                    <button onClick={() => { const ns = poForm.items.filter((_, i) => i !== idx); setPoForm({ ...poForm, items: ns.length ? ns : [{ item_id: "", name: "", quantity: 0, unit_price: 0 }] }); }} className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                <button onClick={() => setPoForm({ ...poForm, items: [...poForm.items, { item_id: "", name: "", quantity: 0, unit_price: 0 }] })} className="text-xs text-[#1a6b3c] font-medium">+ Tambah Item</button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPO(false)}>Batal</Button>
            <Button onClick={savePO} data-testid="save-po-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Buat PO</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Online Order */}
      <Dialog open={showOnline} onOpenChange={setShowOnline}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Order Online Baru</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Platform</Label>
                <Select value={onlineForm.platform} onValueChange={(v) => setOnlineForm({ ...onlineForm, platform: v })}>
                  <SelectTrigger data-testid="online-platform-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shopee">Shopee</SelectItem>
                    <SelectItem value="tokopedia">Tokopedia</SelectItem>
                    <SelectItem value="tiktok">TikTok Shop</SelectItem>
                    <SelectItem value="lazada">Lazada</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>No. Order</Label><Input data-testid="online-orderno-input" value={onlineForm.order_number} onChange={(e) => setOnlineForm({ ...onlineForm, order_number: e.target.value })} /></div>
            </div>
            <div>
              <Label>Item</Label>
              <div className="space-y-2">
                {onlineForm.items.map((it, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Select value={it.item_id} onValueChange={(v) => {
                      const inv = inventory.find((x) => x.id === v);
                      const ns = [...onlineForm.items]; ns[idx] = { ...ns[idx], item_id: v, name: inv?.name || "" }; setOnlineForm({ ...onlineForm, items: ns });
                    }}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Pilih (opsional)" /></SelectTrigger>
                      <SelectContent>{inventory.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input className="w-20 font-mono" placeholder="Qty" type="number" step="any" value={it.quantity || ""}
                      onChange={(e) => { const ns = [...onlineForm.items]; ns[idx] = { ...ns[idx], quantity: e.target.value }; setOnlineForm({ ...onlineForm, items: ns }); }} />
                    <Input className="w-28 font-mono" placeholder="Harga" type="number" value={it.unit_price || ""}
                      onChange={(e) => { const ns = [...onlineForm.items]; ns[idx] = { ...ns[idx], unit_price: e.target.value }; setOnlineForm({ ...onlineForm, items: ns }); }} />
                  </div>
                ))}
                <button onClick={() => setOnlineForm({ ...onlineForm, items: [...onlineForm.items, { item_id: "", name: "", quantity: 0, unit_price: 0 }] })} className="text-xs text-[#1a6b3c] font-medium">+ Tambah Item</button>
              </div>
            </div>
            <div><Label>Ongkir (Rp)</Label><Input type="number" value={onlineForm.shipping_cost || ""} onChange={(e) => setOnlineForm({ ...onlineForm, shipping_cost: e.target.value })} /></div>
            <ImageUpload value={onlineForm.invoice_image_url} onChange={(v) => setOnlineForm({ ...onlineForm, invoice_image_url: v })} label="Foto Invoice (opsional)" testid="online-invoice-image" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOnline(false)}>Batal</Button>
            <Button onClick={saveOnline} data-testid="save-online-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
