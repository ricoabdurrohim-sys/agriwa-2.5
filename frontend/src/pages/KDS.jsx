import React, { useEffect, useState } from "react";
import { ChefHat, Clock, CheckCircle2, Flame } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";

const STATUSES = ["new", "preparing", "ready", "served"];
const STATUS_LABEL = { new: "Baru", preparing: "Diproses", ready: "Siap", served: "Diantar" };
const STATUS_COLOR = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  preparing: "bg-amber-50 text-amber-700 border-amber-200",
  ready: "bg-emerald-50 text-emerald-700 border-emerald-200",
  served: "bg-gray-100 text-gray-500 border-gray-200",
};

function elapsedMin(iso) {
  const d = new Date(iso);
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
}

export default function KDS() {
  const [orders, setOrders] = useState([]);
  const [tick, setTick] = useState(0);

  const load = async () => {
    try {
      const { data } = await api.get("/orders/kds");
      setOrders(data);
    } catch (err) { console.error("KDS load failed:", err); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const id = setInterval(() => { load(); setTick(t => t + 1); }, 5000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const handler = (e) => {
      const t = e.detail?.type;
      if (t === "order_created" || t === "order_updated") load();
    };
    window.addEventListener("aw:ws", handler);
    return () => window.removeEventListener("aw:ws", handler);
  }, []);

  const updateStatus = async (orderId, idx, status) => {
    await api.put(`/orders/${orderId}/item-status`, { item_index: idx, status });
    load();
  };

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>
            <ChefHat className="inline w-7 h-7 text-[#1a6b3c] mr-2 mb-1" /> Dapur (KDS)
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Kitchen Display System — auto-refresh tiap 5 detik</p>
        </div>
        <div className="text-xs text-gray-500 font-mono">
          {orders.length} order aktif · refresh {tick}x
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-16 text-center">
          <ChefHat className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <div className="text-gray-500 font-medium">Tidak ada order aktif</div>
          <div className="text-xs text-gray-400 mt-1">Order baru dari Warung akan muncul di sini</div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {orders.map((o) => {
            const elapsed = elapsedMin(o.created_at);
            const urgent = elapsed >= 20;
            const warn = elapsed >= 10 && !urgent;
            const borderColor = urgent ? "border-red-400" : warn ? "border-amber-400" : "border-gray-200";
            return (
              <div key={o.id} data-testid={`kds-order-${o.id}`} className={`bg-white rounded-xl border-2 ${borderColor} shadow-sm overflow-hidden`}>
                <div className={`px-3 py-2 flex items-center justify-between ${urgent ? "bg-red-50" : warn ? "bg-amber-50" : "bg-gray-50"}`}>
                  <div>
                    <div className="font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>{o.table_name}</div>
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-mono font-semibold ${urgent ? "text-red-700" : warn ? "text-amber-700" : "text-gray-600"}`}>
                    {urgent && <Flame className="w-3.5 h-3.5" />} <Clock className="w-3.5 h-3.5" /> {elapsed}m
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {o.items.map((it, idx) => {
                    const st = it.status || "new";
                    return (
                      <div key={idx} className="p-3 space-y-1.5">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-semibold">{it.quantity}x {it.name}</div>
                            {it.notes && <div className="text-xs text-amber-700 mt-0.5">📝 {it.notes}</div>}
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${STATUS_COLOR[st]}`}>{STATUS_LABEL[st]}</span>
                        </div>
                        <div className="flex gap-1">
                          {STATUSES.filter((s) => s !== st).map((s) => (
                            <button
                              key={s}
                              data-testid={`kds-${o.id}-${idx}-${s}`}
                              onClick={() => updateStatus(o.id, idx, s)}
                              className={`text-[10px] px-2 py-1 rounded font-medium flex-1 ${
                                s === "ready" ? "bg-emerald-600 text-white hover:bg-emerald-700" :
                                s === "preparing" ? "bg-amber-500 text-white hover:bg-amber-600" :
                                s === "served" ? "bg-gray-600 text-white hover:bg-gray-700" :
                                "bg-blue-500 text-white hover:bg-blue-600"
                              }`}
                            >
                              {STATUS_LABEL[s]}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
