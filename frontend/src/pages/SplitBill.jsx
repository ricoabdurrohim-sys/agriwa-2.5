import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Scissors, Search, Minus, Plus, CreditCard, RefreshCcw } from "lucide-react";
import api, { formatRupiah } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const lineKey = (line) => `${line.item_id || ""}::${line.variant_id || ""}::${line.name || ""}::${Number(line.unit_price || 0)}`;

export default function SplitBill() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(params.get("order") || "");
  const [selectedQty, setSelectedQty] = useState({});
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [o, t] = await Promise.all([api.get("/orders/active"), api.get("/tables?light=true")]);
      setOrders(o.data || []);
      setTables(t.data || []);
      if (!activeId && (o.data || []).length) setActiveId(o.data[0].id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal memuat order aktif");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const tableName = (tableId) => tables.find((t) => String(t.id) === String(tableId))?.name || (tableId ? `Meja ${tableId}` : "Takeaway");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => tableName(o.table_id).toLowerCase().includes(q) || String(o.queue_no || o.id || "").toLowerCase().includes(q));
  }, [orders, query, tables]);
  const active = orders.find((o) => String(o.id) === String(activeId));
  const activeItems = active?.items || [];
  const totalOrder = activeItems.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
  const selectedItems = activeItems.map((it) => {
    const key = lineKey(it);
    const qty = Math.min(Number(selectedQty[key] || 0), Number(it.quantity || 0));
    return qty > 0 ? { ...it, quantity: qty } : null;
  }).filter(Boolean);
  const selectedTotal = selectedItems.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);

  const setQty = (line, qty) => {
    const key = lineKey(line);
    const max = Number(line.quantity || 0);
    setSelectedQty((prev) => ({ ...prev, [key]: Math.max(0, Math.min(max, Number(qty || 0))) }));
  };

  const selectAll = () => {
    const next = {};
    activeItems.forEach((it) => { next[lineKey(it)] = Number(it.quantity || 0); });
    setSelectedQty(next);
  };

  const clear = () => setSelectedQty({});

  const proceed = () => {
    if (!active) return toast.error("Pilih order dulu");
    if (!selectedItems.length) return toast.error("Pilih minimal 1 item untuk split bill");
    const draft = {
      source_order_id: active.id,
      table_id: active.table_id || "",
      table_name: tableName(active.table_id),
      queue_no: active.queue_no || "",
      items: selectedItems,
      total: selectedTotal,
      created_at: new Date().toISOString(),
    };
    localStorage.setItem("aw_split_bill_draft", JSON.stringify(draft));
    nav(`/kasir?split=1&source_order=${encodeURIComponent(active.id)}${active.table_id ? `&table=${encodeURIComponent(active.table_id)}` : ""}`);
  };

  return (
    <div className="space-y-4 fade-in">
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center"><Scissors className="w-6 h-6 text-[#1a6b3c]" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "Poppins" }}>Split Bill</h1>
            <p className="text-sm text-gray-500">Pilih sebagian item dari order aktif, bayar di Kasir, sisa order tetap aktif di meja.</p>
          </div>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}><RefreshCcw className="w-4 h-4 mr-1.5" /> Refresh</Button>
      </div>

      <div className="grid lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 bg-white rounded-xl border border-gray-100 p-3 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari meja/order..." className="pl-9" />
          </div>
          <div className="space-y-2 max-h-[68vh] overflow-y-auto pr-1">
            {filtered.map((o) => {
              const total = (o.items || []).reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
              return (
                <button key={o.id} onClick={() => { setActiveId(o.id); setSelectedQty({}); }} className={`w-full text-left rounded-xl border p-3 transition ${activeId === o.id ? "border-[#1a6b3c] bg-emerald-50" : "border-gray-100 hover:border-emerald-200"}`}>
                  <div className="font-semibold text-gray-900">{tableName(o.table_id)}</div>
                  <div className="text-xs text-gray-500">{o.queue_no || o.id} · {(o.items || []).length} item</div>
                  <div className="font-mono text-sm font-bold text-[#1a6b3c] mt-1">{formatRupiah(total)}</div>
                </button>
              );
            })}
            {!filtered.length && <div className="text-sm text-gray-400 text-center py-8">Belum ada order aktif</div>}
          </div>
        </div>

        <div className="lg:col-span-8 bg-white rounded-xl border border-gray-100 overflow-hidden">
          {!active ? <div className="p-10 text-center text-gray-400">Pilih order aktif di kiri.</div> : (
            <>
              <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-lg text-gray-900">{tableName(active.table_id)}</div>
                  <div className="text-xs text-gray-500">Total order: {formatRupiah(totalOrder)} · Pilih item yang dibayar dulu</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll}>Pilih Semua</Button>
                  <Button variant="outline" size="sm" onClick={clear}>Reset</Button>
                </div>
              </div>
              <div className="divide-y divide-gray-100 max-h-[56vh] overflow-y-auto">
                {activeItems.map((it, idx) => {
                  const key = lineKey(it);
                  const qty = Number(selectedQty[key] || 0);
                  return (
                    <div key={`${key}-${idx}`} className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-gray-900 truncate">{it.name}</div>
                        <div className="text-xs text-gray-500 font-mono">{formatRupiah(it.unit_price)} × {it.quantity}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button className="w-8 h-8 rounded-lg border border-gray-200" onClick={() => setQty(it, qty - 1)}><Minus className="w-4 h-4 mx-auto" /></button>
                        <Input value={qty} onChange={(e) => setQty(it, e.target.value)} inputMode="numeric" className="w-14 h-8 text-center font-mono" />
                        <button className="w-8 h-8 rounded-lg border border-gray-200" onClick={() => setQty(it, qty + 1)}><Plus className="w-4 h-4 mx-auto" /></button>
                      </div>
                      <div className="w-24 text-right font-mono font-semibold text-sm">{formatRupiah(qty * Number(it.unit_price || 0))}</div>
                    </div>
                  );
                })}
              </div>
              <div className="p-4 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-gray-500">Total split yang akan dibayar</div>
                  <div className="font-mono text-xl font-bold text-[#1a6b3c]">{formatRupiah(selectedTotal)}</div>
                </div>
                <Button onClick={proceed} disabled={!selectedItems.length} className="bg-[#1a6b3c] hover:bg-[#14522d] h-11 font-semibold"><CreditCard className="w-4 h-4 mr-1.5" /> Bayar Split di Kasir</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
