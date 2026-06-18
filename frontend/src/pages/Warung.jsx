import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Minus, Trash2, Search, Clock, ChevronLeft, Send, Check, X, UtensilsCrossed, QrCode, Smartphone, Edit2 } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import api, { formatRupiah } from "@/lib/api";
import { printViaIframe } from "@/lib/safePrint";
import { printThermalOrderQr, isPrinterAvailable } from "@/lib/printer";
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

function buildWarungOrderScanUrl(tableId, orderId) {
  // QR pesanan Warung langsung membuka order aktif meja.
  // Tidak lewat /scan?code agar tidak jatuh ke pencarian global lintas menu/lini bisnis.
  return `${window.location.origin}/warung?table=${encodeURIComponent(tableId || "")}&order=${encodeURIComponent(orderId || "")}&from=qr`;
}

export default function Warung() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const selectedOrderId = params.get("order") || "";
  const selectedTableId = params.get("table") || "";
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
  const [draftTakeawayCart, setDraftTakeawayCart] = useState([]);
  const [draftTableCarts, setDraftTableCarts] = useState({});
  const [localOrderItems, setLocalOrderItems] = useState({});
  const [variantPicker, setVariantPicker] = useState(null);
  const saveTimersRef = useRef({});
  const pendingOrderItemsRef = useRef({});
  const previousOrderRef = useRef({});
  const createTimersRef = useRef({});
  const creatingTableRef = useRef({});
  const draftTableCartsRef = useRef({});
  const opsRefreshTimerRef = useRef(null);

  const normalizeMenuItems = (rows = []) => rows
    .filter((x) => !String(x.category || "").toLowerCase().includes("bahan baku"))
    .filter((x) => Number(x.sell_price || 0) > 0 || ((x.variants || []).some((v) => Number(v?.sell_price || 0) > 0)))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "id"));

  const loadOps = async () => {
    const [t, o] = await Promise.all([api.get("/tables?light=true"), api.get("/orders/active")]);
    setTables(t.data || []);
    setOrders(o.data || []);
  };
  const scheduleOpsRefresh = (delay = 900) => {
    if (opsRefreshTimerRef.current) clearTimeout(opsRefreshTimerRef.current);
    opsRefreshTimerRef.current = setTimeout(() => { loadOps().catch(() => {}); }, delay);
  };
  const loadMenu = async () => {
    const { data } = await api.get("/inventory?include_batches=false&limit=1500");
    setItems(normalizeMenuItems(data || []));
  };
  const load = async () => { await Promise.all([loadOps(), loadMenu()]); };
  const replaceOrderLocal = (doc) => {
    if (!doc?.id) return;
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === doc.id);
      if (["paid", "cancelled", "closed"].includes(String(doc.status || "").toLowerCase())) {
        return prev.filter((o) => o.id !== doc.id);
      }
      if (idx >= 0) return prev.map((o) => (o.id === doc.id ? doc : o));
      return [...prev, doc];
    });
  };

  const saveOrderItemsNow = async (orderId) => {
    const itemsToSave = pendingOrderItemsRef.current[orderId];
    if (!orderId || !itemsToSave) return null;
    if (saveTimersRef.current[orderId]) {
      clearTimeout(saveTimersRef.current[orderId]);
      delete saveTimersRef.current[orderId];
    }
    try {
      const { data } = await api.put(`/orders/${orderId}/items`, { items: itemsToSave, quiet: true });
      delete pendingOrderItemsRef.current[orderId];
      delete previousOrderRef.current[orderId];
      setLocalOrderItems((prev) => { const cp = { ...prev }; delete cp[orderId]; return cp; });
      replaceOrderLocal(data);
      return data;
    } catch (e) {
      const previous = previousOrderRef.current[orderId];
      if (previous) replaceOrderLocal(previous);
      toast.error(e?.response?.data?.detail || "Gagal menyimpan pesanan");
      return null;
    }
  };

  const scheduleOrderItemsSync = (orderId, next, previous) => {
    if (!orderId) return;
    pendingOrderItemsRef.current[orderId] = next;
    if (!previousOrderRef.current[orderId] && previous) previousOrderRef.current[orderId] = previous;
    if (saveTimersRef.current[orderId]) clearTimeout(saveTimersRef.current[orderId]);
    saveTimersRef.current[orderId] = setTimeout(() => { saveOrderItemsNow(orderId); }, 450);
  };

  const scheduleCreateTableOrder = (tableId, next) => {
    if (!tableId) return;
    draftTableCartsRef.current[tableId] = next;
    if (creatingTableRef.current[tableId]) return;
    if (createTimersRef.current[tableId]) clearTimeout(createTimersRef.current[tableId]);
    createTimersRef.current[tableId] = setTimeout(async () => {
      creatingTableRef.current[tableId] = true;
      const latest = draftTableCartsRef.current[tableId] || [];
      if (latest.length === 0) {
        creatingTableRef.current[tableId] = false;
        return;
      }
      try {
        const { data } = await api.post("/orders", { table_id: tableId, items: latest });
        const newest = draftTableCartsRef.current[tableId] || latest;
        const optimistic = { ...data, items: newest, updated_at: new Date().toISOString() };
        replaceOrderLocal(optimistic);
        setDraftTableCarts((prev) => { const cp = { ...prev }; delete cp[tableId]; return cp; });
        delete draftTableCartsRef.current[tableId];
        if (JSON.stringify(newest) !== JSON.stringify(data.items || [])) {
          scheduleOrderItemsSync(data.id, newest, data);
        }
      } catch (e) {
        toast.error(e?.response?.data?.detail || "Gagal membuat order meja");
      } finally {
        creatingTableRef.current[tableId] = false;
      }
    }, 350);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { const id = setInterval(() => { loadOps(); setTick(t => t + 1); }, 15000); return () => clearInterval(id); }, []);
  useEffect(() => {
    const h = (e) => {
      const t = e.detail?.type;
      if (t === "inventory_updated" || t === "bizunit_updated") loadMenu();
      if (t === "transaction_created" || t === "order_created" || t === "transaction_cancelled") scheduleOpsRefresh(500);
      if (t === "order_updated") scheduleOpsRefresh(1500);
    };
    window.addEventListener("aw:ws", h);
    return () => window.removeEventListener("aw:ws", h);
  }, []);

  const ordersByTable = useMemo(() => {
    const m = {};
    orders.forEach((o) => { if (o.status !== "paid" && o.status !== "cancelled") m[o.table_id || "_takeaway"] = o; });
    return m;
  }, [orders]);

  useEffect(() => {
    const tableParam = selectedTableId;
    const orderParam = selectedOrderId;
    if (!tableParam || tables.length === 0) return;
    const row = tables.find((t) => String(t.id) === String(tableParam));
    if (row && String(activeTable?.id || "") !== String(tableParam)) setActiveTable(row);

    // QR pesanan Warung wajib membuka order aktif yang spesifik, bukan scan global lintas menu.
    // Jika orders/active belum sempat memuat order tersebut, ambil langsung by order_id.
    if (orderParam && !orders.some((o) => String(o.id) === String(orderParam))) {
      api.get(`/orders/${encodeURIComponent(orderParam)}`)
        .then(({ data }) => {
          if (!data?.id) return;
          const st = String(data.status || "").toLowerCase();
          if (["paid", "cancelled", "closed"].includes(st)) {
            toast.error("QR pesanan sudah tidak aktif karena transaksi sudah selesai");
            return;
          }
          if (String(data.table_id || "") !== String(tableParam)) {
            toast.error("QR tidak cocok dengan meja ini");
            return;
          }
          replaceOrderLocal(data);
        })
        .catch(() => toast.error("QR pesanan tidak ditemukan atau transaksi sudah selesai"));
    }
  }, [selectedTableId, selectedOrderId, tables, orders, activeTable]);

  const totalForOrder = (o) => o?.items?.reduce((s, i) => s + i.quantity * i.unit_price, 0) || 0;
  const servedCount = (o) => o?.items?.filter((i) => i.served)?.length || 0;

  const formatMenuPrice = (n) => `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
  const itemPriceLabel = (item) => {
    const variants = (item?.variants || []).filter((v) => v && v.active !== false && v.name);
    if (item?.has_variants && variants.length) {
      const prices = [...new Set(variants.map((v) => Number(v.sell_price || item.sell_price || 0)).filter((n) => n > 0))].sort((a,b)=>a-b);
      if (prices.length) return `Rp ${prices.map((n) => Number(n).toLocaleString("id-ID")).join("/")}`;
    }
    return formatRupiah(item?.sell_price || 0);
  };
  const lineKey = (line) => `${line.item_id || line.id}::${line.variant_id || "base"}`;
  const totalForItems = (rows = []) => rows.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0);

  const addTable = async () => {
    const name = newTableName.trim();
    if (!name) return;
    const tempId = `tmp-${Date.now()}`;
    const optimistic = { id: tempId, name, status: "available" };
    setTables((prev) => [...prev, optimistic]);
    setNewTableName(""); setShowAdd(false);
    try {
      const { data } = await api.post("/tables", { name });
      setTables((prev) => prev.map((t) => t.id === tempId ? data : t));
      toast.success("Meja ditambahkan");
      scheduleOpsRefresh(700);
    } catch (e) {
      setTables((prev) => prev.filter((t) => t.id !== tempId));
      toast.error(e?.response?.data?.detail || "Gagal menambah meja");
    }
  };

  const openEditTable = (t) => { setEditTable(t); setEditTableName(t.name || ""); };
  const saveEditTable = async () => {
    if (!editTable || !editTableName.trim()) return toast.error("Nama meja wajib");
    const name = editTableName.trim();
    const previous = tables;
    setTables((prev) => prev.map((t) => t.id === editTable.id ? { ...t, name } : t));
    setEditTable(null); setEditTableName("");
    try {
      const { data } = await api.put(`/tables/${editTable.id}`, { name });
      setTables((prev) => prev.map((t) => t.id === editTable.id ? data : t));
      toast.success("Meja diperbarui");
    } catch (e) {
      setTables(previous);
      toast.error(e?.response?.data?.detail || "Gagal memperbarui meja");
    }
  };
  const deleteTable = async (t) => {
    if (ordersByTable[t.id]) return toast.error("Meja masih punya order aktif. Selesaikan dulu.");
    if (!window.confirm(`Hapus ${t.name}? Hanya meja ini yang dihapus, bukan semua meja.`)) return;
    const previous = tables;
    setTables((prev) => prev.filter((row) => row.id !== t.id));
    try {
      await api.delete(`/tables/${t.id}`);
      toast.success("Meja dihapus");
      scheduleOpsRefresh(700);
    } catch (e) {
      setTables(previous);
      toast.error(e?.response?.data?.detail || "Gagal menghapus meja");
    }
  };

  const filteredItems = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  // Table detail view
  if (activeTable) {
    const order = activeTable.takeaway
      ? orders.find((o) => o.id === activeTable.order_id)
      : (selectedOrderId ? orders.find((o) => String(o.id) === String(selectedOrderId) && String(o.table_id || "") === String(activeTable.id || "")) : null) || ordersByTable[activeTable.id];
    const getCurrentCart = () => {
      if (order?.id) return pendingOrderItemsRef.current[order.id] || localOrderItems[order.id] || order.items || [];
      if (activeTable.takeaway) return draftTakeawayCart;
      return draftTableCartsRef.current[activeTable.id] || draftTableCarts[activeTable.id] || [];
    };
    const cart = getCurrentCart();
    const total = order ? totalForItems(cart) : totalForItems(cart);
    const elapsed = order ? elapsedMin(order.created_at) : 0;

    const saveItems = async (next) => {
      if (order) {
        const optimistic = { ...order, items: next, updated_at: new Date().toISOString() };
        setLocalOrderItems((prev) => ({ ...prev, [order.id]: next }));
        replaceOrderLocal(optimistic);
        scheduleOrderItemsSync(order.id, next, order);
        return;
      }
      if (activeTable.takeaway) {
        setDraftTakeawayCart(next);
        return;
      }
      setDraftTableCarts((prev) => ({ ...prev, [activeTable.id]: next }));
      scheduleCreateTableOrder(activeTable.id, next);
    };

    const upsertLine = async (line, delta) => {
      const next = [...getCurrentCart()];
      const key = lineKey(line);
      const idx = next.findIndex((c) => lineKey(c) === key);
      if (idx >= 0) {
        next[idx] = { ...next[idx], quantity: Math.max(0, Number(next[idx].quantity || 0) + delta) };
        if (next[idx].quantity === 0) next.splice(idx, 1);
      } else if (delta > 0) {
        next.push({ ...line, quantity: 1, notes: "", served: false });
      }
      saveItems(next);
    };

    const addVariantLine = async (item, variant = null) => {
      const price = Number(variant?.sell_price || item.sell_price || 0);
      const line = {
        line_id: `${item.id}::${variant?.id || "base"}`,
        item_id: item.id,
        name: variant ? `${item.name} (${variant.name})` : item.name,
        unit_price: price,
        variant_id: variant?.id || "",
        variant_name: variant?.name || "",
      };
      upsertLine(line, 1);
      setVariantPicker(null);
    };

    const addMenuItem = async (item) => {
      const variants = (item.variants || []).filter((v) => v && v.active !== false && v.name);
      if (item.has_variants && variants.length) return setVariantPicker({ ...item, variants });
      return addVariantLine(item, null);
    };

    const processTakeawayDraft = async () => {
      if (cart.length === 0) return toast.error("Pilih menu dulu sebelum masuk antrian");
      const { data } = await api.post("/orders", { table_id: null, items: cart });
      setDraftTakeawayCart([]);
      replaceOrderLocal(data);
      setActiveTable({ id: null, name: `Takeaway ${data.queue_no || ""}`.trim(), takeaway: true, order_id: data.id });
      toast.success(`Masuk antrian ${data.queue_no || "takeaway"}`);
    };

    const toggleServed = async (idx) => {
      const newServed = !cart[idx].served;
      const nextItems = cart.map((row, i) => i === idx ? { ...row, served: newServed } : row);
      replaceOrderLocal({ ...order, items: nextItems });
      try {
        const { data } = await api.put(`/orders/${order.id}/items-served`, { indices: [idx], served: newServed });
        replaceOrderLocal(data);
      } catch (e) {
        replaceOrderLocal(order);
        toast.error("Gagal mengubah status item");
      }
    };

    const ensureCurrentOrderSaved = async () => {
      const latestCart = getCurrentCart();
      if (order?.id) {
        if (pendingOrderItemsRef.current[order.id]) await saveOrderItemsNow(order.id);
        return { ...order, items: latestCart };
      }
      if (activeTable.takeaway) return null;
      if (!latestCart.length) return null;
      if (createTimersRef.current[activeTable.id]) {
        clearTimeout(createTimersRef.current[activeTable.id]);
        delete createTimersRef.current[activeTable.id];
      }
      const { data } = await api.post("/orders", { table_id: activeTable.id, items: latestCart });
      const saved = { ...data, items: latestCart };
      replaceOrderLocal(saved);
      setDraftTableCarts((prev) => { const cp = { ...prev }; delete cp[activeTable.id]; return cp; });
      delete draftTableCartsRef.current[activeTable.id];
      return saved;
    };

    const printActiveOrderQr = async () => {
      const latestCart = getCurrentCart();
      if (!latestCart.length) return toast.error("Isi pesanan dulu sebelum print QR pesanan");
      let savedOrder = null;
      try {
        savedOrder = await ensureCurrentOrderSaved();
        if (!savedOrder?.id) return toast.error("Order belum siap untuk QR");
        const url = buildWarungOrderScanUrl(activeTable.id, savedOrder.id);
        const orderCode = savedOrder.queue_no || savedOrder.id;
        if (isPrinterAvailable()) {
          await printThermalOrderQr({
            tableName: activeTable.name,
            orderCode,
            items: latestCart,
            total: totalForItems(latestCart),
            qrData: url,
            footer: "",
          });
          toast.success("QR pesanan dikirim ke printer thermal");
          return;
        }
        throw new Error("Web Bluetooth tidak tersedia");
      } catch (e) {
        // Fallback tetap ada supaya kasir tidak berhenti kalau printer belum connect/HP tidak support Bluetooth.
        try {
          if (!savedOrder?.id) savedOrder = await ensureCurrentOrderSaved();
          if (!savedOrder?.id) throw e;
          const url = buildWarungOrderScanUrl(activeTable.id, savedOrder.id);
          const qr = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(url)}`;
          const rows = latestCart.map((it) => `<div class="item-name">${it.name}</div><div class="row"><span>${it.quantity} x ${formatRupiah(it.unit_price)}</span><b>${formatRupiah(Number(it.quantity || 0) * Number(it.unit_price || 0))}</b></div>`).join("");
          printViaIframe({
            title: `QR Pesanan ${activeTable.name}`,
            preferWindow: true,
            css: "@page{size:80mm auto;margin:1.5mm}html,body{margin:0;padding:0}.thermal-print{font-family:'Courier New',monospace;font-size:11px;line-height:1.25;width:74mm;margin:0 auto;color:#111}.center{text-align:center!important}.title{font-weight:800;font-size:15px;text-align:center!important}.small{font-size:9.5px}.line{border-top:1px dashed #555;margin:5px 0}.row{display:flex;justify-content:space-between;gap:8px}.item-name{font-weight:600;word-break:break-word}.qr{width:82px;height:82px;display:block;margin:5px auto}.total{font-weight:700;font-size:13px}@media print{body>*:not(.thermal-print):not(main){display:none!important}}",
            bodyHtml: `<div class="thermal-print"><div class="center title">QR PESANAN</div><div class="center"><b>${activeTable.name}</b></div><div class="center small">${savedOrder.queue_no || savedOrder.id}</div><div class="line"></div>${rows}<div class="line"></div><div class="row total"><span>Total</span><b>${formatRupiah(totalForItems(latestCart))}</b></div><div class="center"><img class="qr" src="${qr}"/><div class="small">${activeTable.name}</div></div></div>`,
          });
          toast.info("Thermal gagal/Belum connect, dibuka fallback print browser 80mm");
        } catch (err) {
          toast.error(err?.response?.data?.detail || err?.message || "Gagal membuat QR pesanan");
        }
      }
    };

    const sendToKasir = async () => {
      const savedOrder = await ensureCurrentOrderSaved();
      if (!savedOrder?.id) return toast.error("Proses order dulu sebelum lanjut ke Kasir");
      nav(`/kasir?${activeTable.takeaway ? "" : `table=${activeTable.id}&`}order=${savedOrder.id}`);
    };

    const cancelOrder = async () => {
      if (!order || !window.confirm("Batalkan order ini?")) return;
      await api.delete(`/orders/${order.id}`);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      setActiveTable(null);
    };

    return (
      <div className="space-y-4 fade-in">
        <div className="flex items-center gap-2">
          <button onClick={() => setActiveTable(null)} className="p-1.5 hover:bg-gray-100 rounded" data-testid="back-to-tables-btn">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>{activeTable.name}</h1>
            <p className="text-xs text-gray-500">{order ? `${order.queue_no ? `Antrian ${order.queue_no} · ` : ""}Order aktif · ${elapsed} menit yang lalu` : (activeTable.takeaway ? "Takeaway baru — pilih menu untuk mulai" : "Meja kosong — pilih menu untuk mulai")}</p>
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
                <button key={i.id} data-testid={`warung-menu-${i.id}`} onClick={() => addMenuItem(i)}
                  className="bg-white rounded-lg border border-gray-100 p-2 text-left hover:border-[#1a6b3c] transition-all">
                  {i.image_url ? <img src={resolveImageUrl(i.image_url)} alt={i.name} className="w-full h-16 object-cover rounded mb-1.5" /> :
                    <div className="w-full h-16 bg-gradient-to-br from-emerald-50 to-amber-50 rounded mb-1.5 flex items-center justify-center text-2xl">🍽️</div>}
                  <div className="text-xs font-semibold line-clamp-2">{i.name}</div>
                  <div className="font-mono text-xs font-semibold text-[#1a6b3c]">{itemPriceLabel(i)}</div>
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
                {order && <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3" /> {order.queue_no ? `${order.queue_no} · ` : ""}{elapsed} menit · {servedCount(order)}/{cart.length} dilayani</div>}
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {cart.length === 0 ? <div className="py-10 text-center text-gray-400 text-sm">Belum ada pesanan</div> :
                cart.map((c, idx) => (
                  <div key={idx} className="px-3 py-2.5 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <button onClick={() => order && toggleServed(idx)} disabled={!order} data-testid={`served-toggle-${idx}`}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          c.served ? "bg-emerald-500 border-emerald-500" : "border-gray-300 hover:border-emerald-500"
                        }`}>
                        {c.served && <Check className="w-3 h-3 text-white" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${c.served ? "line-through text-gray-400" : ""}`}>{c.name}</div>
                        <div className="font-mono text-xs text-gray-500">{formatRupiah(c.unit_price)} × {c.quantity}</div>
                      </div>
                      <button data-testid={`item-minus-${idx}`} onClick={() => upsertLine(c, -1)} className="w-6 h-6 rounded border border-gray-200 hover:bg-gray-50"><Minus className="w-3 h-3 mx-auto" /></button>
                      <span className="w-5 text-center text-sm font-semibold">{c.quantity}</span>
                      <button data-testid={`item-plus-${idx}`} onClick={() => upsertLine(c, 1)} className="w-6 h-6 rounded border border-gray-200 hover:bg-gray-50"><Plus className="w-3 h-3 mx-auto" /></button>
                    </div>
                  </div>
                ))}
            </div>

            <div className="p-3 border-t border-gray-100 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Sementara</span>
                <span className="font-mono font-bold text-base text-[#1a6b3c]" data-testid="warung-total">{formatRupiah(total)}</span>
              </div>
              {!order && !activeTable.takeaway && cart.length > 0 && (
                <Button data-testid="print-draft-order-qr-btn" onClick={printActiveOrderQr}
                  variant="outline" className="w-full h-10 font-semibold border-[#1a6b3c] text-[#1a6b3c] hover:bg-emerald-50">
                  <QrCode className="w-4 h-4 mr-1.5" /> Print QR Pesanan Meja
                </Button>
              )}
              {!order && activeTable.takeaway && (
                <Button data-testid="process-takeaway-btn" onClick={processTakeawayDraft} disabled={cart.length === 0}
                  className="w-full bg-[#1a6b3c] hover:bg-[#14522d] h-11 font-semibold">
                  <Send className="w-4 h-4 mr-1.5" /> Proses ke Antrian / Dapur
                </Button>
              )}
              {order && (
                <>
                  <Button data-testid="print-order-qr-btn" onClick={printActiveOrderQr} disabled={cart.length === 0}
                    variant="outline" className="w-full h-10 font-semibold border-[#1a6b3c] text-[#1a6b3c] hover:bg-emerald-50">
                    <QrCode className="w-4 h-4 mr-1.5" /> Print QR Pesanan Meja
                  </Button>
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
        <Dialog open={!!variantPicker} onOpenChange={(o) => { if (!o) setVariantPicker(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Pilih Varian</DialogTitle></DialogHeader>
            {variantPicker && <div className="space-y-2">
              <div className="text-sm font-semibold">{variantPicker.name}</div>
              {(variantPicker.variants || []).map((v) => (
                <button key={v.id || v.name} onClick={() => addVariantLine(variantPicker, v)} className="w-full text-left border border-gray-200 rounded-lg p-3 hover:border-[#1a6b3c] hover:bg-emerald-50">
                  <div className="font-semibold text-sm">{v.name}</div>
                  <div className="font-mono text-xs text-[#1a6b3c]">{formatRupiah(v.sell_price || variantPicker.sell_price)}</div>
                </button>
              ))}
            </div>}
          </DialogContent>
        </Dialog>
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
          <p className="text-sm text-gray-500 mt-0.5">{Object.keys(ordersByTable).length} meja aktif · klik item mode cepat</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button data-testid="new-takeaway-btn" onClick={() => setActiveTable({ id: null, name: "Takeaway Baru", takeaway: true })} variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50">
            <Plus className="w-4 h-4 mr-1.5" /> Takeaway / Antrian
          </Button>
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

      {orders.filter((o) => o.order_type === "takeaway" || !o.table_id).length > 0 && (
        <div className="bg-white rounded-xl border border-amber-100 p-3">
          <div className="text-sm font-semibold text-amber-900 mb-2">Antrian Takeaway Aktif</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {orders.filter((o) => o.order_type === "takeaway" || !o.table_id).map((o) => (
              <button key={o.id} onClick={() => setActiveTable({ id: null, name: `Takeaway ${o.queue_no || ''}`.trim(), takeaway: true, order_id: o.id })} className="text-left rounded-lg border border-amber-100 bg-amber-50 p-3 hover:bg-amber-100">
                <div className="flex justify-between gap-2"><span className="font-semibold text-sm">{o.queue_no || 'Takeaway'}</span><span className="text-xs text-amber-700">{elapsedMin(o.created_at)}m</span></div>
                <div className="text-xs text-gray-600 mt-1">{o.items?.length || 0} item · {formatRupiah(totalForOrder(o))}</div>
                <div className="text-[10px] text-gray-500 mt-1">Klik untuk lihat detail / lanjut ke kasir</div>
              </button>
            ))}
          </div>
        </div>
      )}

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
                    css: "@page{size:80mm auto;margin:2mm}body{font-family:sans-serif;text-align:center;padding:8px;}h1{margin:0 0 4px;font-size:18px;}p{color:#666;font-size:11px;margin-top:3px;}img{margin:10px auto;display:block;}.b{border:1px solid #1a6b3c;border-radius:12px;padding:10px;display:inline-block;max-width:72mm;}",
                    buildBody: (doc) => {
                      const box = doc.createElement("div");
                      box.className = "b";
                      const h = doc.createElement("h1");
                      h.textContent = qrTable.name;
                      const p1 = doc.createElement("p");
                      p1.textContent = "";
                      const img = doc.createElement("img");
                      img.src = dataUrl;
                      img.width = 190;
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
