import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Minus, Trash2, Search, Clock, ChevronLeft, Send, Check, X, UtensilsCrossed, QrCode, Smartphone, Edit2 } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import api, { formatRupiah } from "@/lib/api";
import { printViaIframe } from "@/lib/safePrint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { resolveImageUrl } from "@/components/ImageUpload";

function elapsedMin(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export default function Warung() {
  const nav = useNavigate();
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [newTableName, setNewTableName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [activeTable, setActiveTable] = useState(null);
  const [qrTable, setQrTable] = useState(null);
  const [editTable, setEditTable] = useState(null);
  const [editTableName, setEditTableName] = useState("");
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(0);

  const load = async () => {
    const [t, o, i] = await Promise.all([
      api.get("/tables"),
      api.get("/orders/active"),
      api.get("/inventory"),
    ]);
    setTables(t.data);
    setOrders(o.data);
    setItems(i.data.filter((x) => x.sell_price > 0));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { const id = setInterval(() => { load(); setTick(t => t + 1); }, 8000); return () => clearInterval(id); }, []);
  useEffect(() => {
    const h = (e) => { const t = e.detail?.type; if (t === "transaction_created" || t === "order_created" || t === "order_updated" || t === "transaction_cancelled") load(); };
    window.addEventListener("aw:ws", h);
    return () => window.removeEventListener("aw:ws", h);
  }, []);

  const ordersByTable = useMemo(() => {
    const m = {};
    orders.forEach((o) => { if (o.status !== "paid" && o.status !== "cancelled") m[o.table_id || "_takeaway"] = o; });
    return m;
  }, [orders]);

  const totalForOrder = (o) => o?.items?.reduce((s, i) => s + i.quantity * i.unit_price, 0) || 0;
  const servedCount = (o) => o?.items?.filter((i) => i.served)?.length || 0;

  const addTable = async () => {
    if (!newTableName.trim()) return;
    await api.post("/tables", { name: newTableName });
    setNewTableName(""); setShowAdd(false); load(); toast.success("Meja ditambahkan");
  };

  const openEditTable = (t) => { setEditTable(t); setEditTableName(t.name || ""); };
  const saveEditTable = async () => {
    if (!editTable || !editTableName.trim()) return toast.error("Nama meja wajib");
    await api.put(`/tables/${editTable.id}`, { name: editTableName.trim() });
    setEditTable(null); setEditTableName(""); load(); toast.success("Meja diperbarui");
  };
  const deleteTable = async (t) => {
    if (ordersByTable[t.id]) return toast.error("Meja masih punya order aktif. Selesaikan dulu.");
    if (!window.confirm(`Hapus ${t.name}? Hanya meja ini yang dihapus, bukan semua meja.`)) return;
    await api.delete(`/tables/${t.id}`);
    load(); toast.success("Meja dihapus");
  };

  const filteredItems = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  // Table detail view
  if (activeTable) {
    const order = ordersByTable[activeTable.id];
    const cart = order?.items || [];
    const total = totalForOrder(order);
    const elapsed = order ? elapsedMin(order.created_at) : 0;

    const upsertItem = async (item, delta) => {
      const next = [...cart];
      const idx = next.findIndex((c) => c.item_id === item.id);
      if (idx >= 0) {
        next[idx] = { ...next[idx], quantity: Math.max(0, next[idx].quantity + delta) };
        if (next[idx].quantity === 0) next.splice(idx, 1);
      } else if (delta > 0) {
        next.push({ item_id: item.id, name: item.name, unit_price: item.sell_price, quantity: 1, notes: "", served: false });
      }
      if (order) {
        await api.put(`/orders/${order.id}/items`, { items: next });
      } else {
        await api.post("/orders", { table_id: activeTable.id, items: next });
      }
      load();
    };

    const toggleServed = async (idx) => {
      const newServed = !cart[idx].served;
      await api.put(`/orders/${order.id}/items-served`, { indices: [idx], served: newServed });
      load();
    };

    const sendToKasir = () => {
      nav(`/kasir?table=${activeTable.id}&order=${order.id}`);
    };

    const cancelOrder = async () => {
      if (!order || !window.confirm("Batalkan order ini?")) return;
      await api.delete(`/orders/${order.id}`);
      setActiveTable(null); load();
    };

    return (
      <div className="space-y-4 fade-in">
        <div className="flex items-center gap-2">
          <button onClick={() => setActiveTable(null)} className="p-1.5 hover:bg-gray-100 rounded" data-testid="back-to-tables-btn">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>{activeTable.name}</h1>
            <p className="text-xs text-gray-500">{order ? `Order aktif · ${elapsed} menit yang lalu` : "Meja kosong — pilih menu untuk mulai"}</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Menu */}
          <div className="lg:col-span-2 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input data-testid="warung-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari menu..." className="pl-9 h-10 bg-white border-gray-200" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filteredItems.map((i) => (
                <button key={i.id} data-testid={`warung-menu-${i.id}`} onClick={() => upsertItem(i, 1)}
                  className="bg-white rounded-lg border border-gray-100 p-2 text-left hover:border-[#1a6b3c] transition-all">
                  {i.image_url ? <img src={resolveImageUrl(i.image_url)} alt={i.name} className="w-full h-16 object-cover rounded mb-1.5" /> :
                    <div className="w-full h-16 bg-gradient-to-br from-emerald-50 to-amber-50 rounded mb-1.5 flex items-center justify-center text-2xl">🍽️</div>}
                  <div className="text-xs font-semibold line-clamp-2">{i.name}</div>
                  <div className="font-mono text-xs font-semibold text-[#1a6b3c]">{formatRupiah(i.sell_price)}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Cart */}
          <div className="bg-white rounded-xl border border-gray-100 lg:sticky lg:top-20 lg:self-start">
            <div className="p-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="font-semibold flex items-center gap-1.5" style={{ fontFamily: 'Poppins' }}>
                  <UtensilsCrossed className="w-4 h-4 text-[#1a6b3c]" /> Pesanan ({cart.length})
                </div>
                {order && <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3" /> {elapsed} menit · {servedCount(order)}/{cart.length} dilayani</div>}
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {cart.length === 0 ? <div className="py-10 text-center text-gray-400 text-sm">Belum ada pesanan</div> :
                cart.map((c, idx) => (
                  <div key={idx} className="px-3 py-2.5 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleServed(idx)} data-testid={`served-toggle-${idx}`}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          c.served ? "bg-emerald-500 border-emerald-500" : "border-gray-300 hover:border-emerald-500"
                        }`}>
                        {c.served && <Check className="w-3 h-3 text-white" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${c.served ? "line-through text-gray-400" : ""}`}>{c.name}</div>
                        <div className="font-mono text-xs text-gray-500">{formatRupiah(c.unit_price)} × {c.quantity}</div>
                      </div>
                      <button data-testid={`item-minus-${idx}`} onClick={() => upsertItem({ id: c.item_id, name: c.name, sell_price: c.unit_price }, -1)} className="w-6 h-6 rounded border border-gray-200 hover:bg-gray-50"><Minus className="w-3 h-3 mx-auto" /></button>
                      <span className="w-5 text-center text-sm font-semibold">{c.quantity}</span>
                      <button data-testid={`item-plus-${idx}`} onClick={() => upsertItem({ id: c.item_id, name: c.name, sell_price: c.unit_price }, 1)} className="w-6 h-6 rounded border border-gray-200 hover:bg-gray-50"><Plus className="w-3 h-3 mx-auto" /></button>
                    </div>
                  </div>
                ))}
            </div>

            <div className="p-3 border-t border-gray-100 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Sementara</span>
                <span className="font-mono font-bold text-base text-[#1a6b3c]" data-testid="warung-total">{formatRupiah(total)}</span>
              </div>
              {order && (
                <>
                  <Button data-testid="send-to-kasir-btn" onClick={sendToKasir} disabled={cart.length === 0}
                    className="w-full bg-[#f4a228] hover:bg-[#d98b1a] h-11 font-semibold">
                    <Send className="w-4 h-4 mr-1.5" /> Lanjut Bayar ke Kasir
                  </Button>
                  <Button onClick={cancelOrder} variant="outline" size="sm" className="w-full text-red-600 hover:bg-red-50">
                    <X className="w-3.5 h-3.5 mr-1" /> Batalkan Order
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Tables grid view
  const statusColor = (o) => {
    if (!o) return { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500", label: "Tersedia" };
    const elapsed = elapsedMin(o.created_at);
    if (elapsed >= 30) return { bg: "bg-red-50", border: "border-red-300", text: "text-red-700", dot: "bg-red-500", label: "Lama Menunggu" };
    if (elapsed >= 15) return { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700", dot: "bg-amber-500", label: "Menunggu" };
    return { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-700", dot: "bg-blue-500", label: "Aktif" };
  };

  const sortedTables = [...tables].sort((a, b) => {
    const oa = ordersByTable[a.id], ob = ordersByTable[b.id];
    if (oa && !ob) return -1;
    if (!oa && ob) return 1;
    if (oa && ob) return new Date(oa.created_at) - new Date(ob.created_at);
    return 0;
  });

  return (
    <div className="space-y-5 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Warung Makan</h1>
          <p className="text-sm text-gray-500 mt-0.5">{Object.keys(ordersByTable).length} meja aktif · refresh otomatis tiap 8 detik</p>
        </div>
        <div className="flex gap-2">
          <Button data-testid="add-table-btn" onClick={() => setShowAdd(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]">
            <Plus className="w-4 h-4 mr-1.5" /> Meja Baru
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        {[{l:"Tersedia",c:"bg-emerald-500"},{l:"Aktif",c:"bg-blue-500"},{l:"Menunggu (>15m)",c:"bg-amber-500"},{l:"Lama (>30m)",c:"bg-red-500"}].map(s => (
          <span key={s.l} className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${s.c}`} />{s.l}</span>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="tables-grid">
        {sortedTables.map((t) => {
          const order = ordersByTable[t.id];
          const c = statusColor(order);
          const elapsed = order ? elapsedMin(order.created_at) : 0;
          const total = totalForOrder(order);
          const served = servedCount(order);
          const isSelfOrder = order?.source === "self_order";
          return (
            <div key={t.id} data-testid={`table-card-${t.id}`} role="button" tabIndex={0}
              className={`${c.bg} ${c.border} border-2 rounded-xl p-4 cursor-pointer hover:shadow-md transition-all relative`}>
              <div onClick={() => setActiveTable(t)} className="cursor-pointer">
                <div className="flex items-start justify-between mb-2">
                  <span className="font-semibold text-gray-900" style={{ fontFamily: 'Poppins' }}>{t.name}</span>
                  <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  <span className={`text-xs font-medium ${c.text}`}>{c.label}</span>
                  {isSelfOrder && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">
                      <Smartphone className="w-2.5 h-2.5" /> SELF-ORDER
                    </span>
                  )}
                </div>
                {order && (
                  <>
                    <div className="font-mono text-base font-bold text-gray-900">{formatRupiah(total)}</div>
                    <div className="flex items-center gap-2 mt-1.5 text-xs">
                      <span className="flex items-center gap-1 text-gray-700"><Clock className="w-3 h-3" /> {elapsed}m</span>
                      <span className="text-gray-700">·</span>
                      <span className="text-gray-700">{order.items?.length || 0} item</span>
                      {served > 0 && <Badge className="bg-emerald-100 text-emerald-700 text-[10px] py-0">{served} dilayani</Badge>}
                    </div>
                  </>
                )}
              </div>
              <div className="absolute top-2 right-2 flex gap-1">
                <button data-testid={`qr-btn-${t.id}`} onClick={(e) => { e.stopPropagation(); setQrTable(t); }}
                  className="p-1.5 hover:bg-white/60 rounded-md text-gray-500 hover:text-[#1a6b3c] transition-colors"
                  title="Tampilkan QR Self-Order">
                  <QrCode className="w-3.5 h-3.5" />
                </button>
                <button data-testid={`edit-table-${t.id}`} onClick={(e) => { e.stopPropagation(); openEditTable(t); }}
                  className="p-1.5 hover:bg-white/60 rounded-md text-gray-500 hover:text-blue-600 transition-colors" title="Edit meja">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button data-testid={`delete-table-${t.id}`} onClick={(e) => { e.stopPropagation(); deleteTable(t); }}
                  className="p-1.5 hover:bg-white/60 rounded-md text-gray-500 hover:text-red-600 transition-colors" title="Hapus meja ini">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah Meja Baru</DialogTitle></DialogHeader>
          <Input data-testid="new-table-name-input" value={newTableName} onChange={(e) => setNewTableName(e.target.value)}
            placeholder="Contoh: Meja 7" className="h-12" onKeyDown={(e) => e.key === "Enter" && addTable()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Batal</Button>
            <Button onClick={addTable} data-testid="confirm-add-table-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTable} onOpenChange={() => setEditTable(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Meja</DialogTitle></DialogHeader>
          <Input data-testid="edit-table-name-input" value={editTableName} onChange={(e) => setEditTableName(e.target.value)}
            placeholder="Nama meja" className="h-12" onKeyDown={(e) => e.key === "Enter" && saveEditTable()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTable(null)}>Batal</Button>
            <Button onClick={saveEditTable} data-testid="confirm-edit-table-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Self-Order Dialog */}
      <Dialog open={!!qrTable} onOpenChange={() => setQrTable(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><QrCode className="w-5 h-5 text-[#1a6b3c]" /> QR Self-Order</DialogTitle>
          </DialogHeader>
          {qrTable && (() => {
            const url = `${window.location.origin}/order/${qrTable.id}`;
            return (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-sm text-gray-600 mb-1">Untuk meja</div>
                  <div className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>{qrTable.name}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl border-2 border-gray-100 flex justify-center" data-testid="qr-canvas-wrap">
                  <QRCodeCanvas value={url} size={220} level="H" includeMargin={false} fgColor="#1a6b3c" />
                </div>
                <div className="text-[11px] text-center text-gray-500">Pelanggan scan untuk memesan dari HP-nya</div>
                <div className="bg-gray-50 rounded-lg p-2 text-[11px] font-mono break-all text-gray-700">{url}</div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" data-testid="copy-qr-link"
                    onClick={() => { navigator.clipboard.writeText(url); toast.success("Link disalin"); }}>
                    Salin Link
                  </Button>
                  <Button data-testid="open-qr-preview" className="flex-1 bg-[#1a6b3c] hover:bg-[#14522d]"
                    onClick={() => window.open(url, "_blank")}>
                    Buka Preview
                  </Button>
                </div>
                <Button variant="outline" className="w-full" data-testid="print-qr-btn" onClick={() => {
                  const canvas = document.querySelector('[data-testid="qr-canvas-wrap"] canvas');
                  const dataUrl = canvas?.toDataURL("image/png") || "";
                  printViaIframe({
                    title: `QR ${qrTable.name}`,
                    css: "body{font-family:sans-serif;text-align:center;padding:24px;}h1{margin:0 0 6px;font-size:22px;}p{color:#666;font-size:14px;margin-top:4px;}img{margin:18px auto;display:block;}.b{border:2px solid #1a6b3c;border-radius:18px;padding:18px;display:inline-block;}",
                    buildBody: (doc) => {
                      const box = doc.createElement("div");
                      box.className = "b";
                      const h = doc.createElement("h1");
                      h.textContent = qrTable.name;
                      const p1 = doc.createElement("p");
                      p1.textContent = "Scan untuk pesan";
                      const img = doc.createElement("img");
                      img.src = dataUrl;
                      img.width = 280;
                      const p2 = doc.createElement("p");
                      p2.style.cssText = "font-size:11px;color:#888;";
                      p2.textContent = url;
                      box.appendChild(h); box.appendChild(p1); box.appendChild(img); box.appendChild(p2);
                      doc.body.appendChild(box);
                    },
                  });
                }}>
                  Cetak QR
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
