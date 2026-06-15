import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight, ArrowDownRight, TrendingUp, Wallet, Receipt, AlertTriangle,
  Grape, UtensilsCrossed, Sprout, Warehouse, Box, Sparkles,
  Users, Truck, Package, Clock, BellRing, ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import api, { formatRupiah, formatDateTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const UNIT_META = {
  warung: { label: "Warung", color: "#ea580c", bg: "#ffedd5", icon: UtensilsCrossed },
  anggur: { label: "Anggur", color: "#6b46c1", bg: "#f3e8ff", icon: Grape },
  pupuk: { label: "Pupuk", color: "#b45309", bg: "#fef3c7", icon: Box },
  pembibitan: { label: "Pembibitan", color: "#059669", bg: "#d1fae5", icon: Sprout },
  gudang: { label: "Gudang", color: "#2563eb", bg: "#dbeafe", icon: Warehouse },
};

// Helper: hex → light bg (resolve from solid color)
const hexToBg = (hex) => {
  if (!hex || !hex.startsWith("#")) return "#f3f4f6";
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},0.12)`;
};

function KPICard({ label, value, sub, accent, icon: Icon, testid }) {
  return (
    <div data-testid={testid} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</div>
        {Icon && <Icon className="w-4 h-4 text-gray-400" />}
      </div>
      <div className="mt-2 font-mono text-xl sm:text-2xl font-semibold tracking-tight" style={{ color: accent || "#111827" }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [summary, setSummary] = useState(null);
  const [investors, setInvestors] = useState([]);
  const [reminders, setReminders] = useState(null);
  const [bizUnits, setBizUnits] = useState([]);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [s, inv, rem, bu] = await Promise.all([
        api.get("/dashboard/summary"),
        api.get("/investors"),
        api.get("/reminders"),
        api.get("/business-units"),
      ]);
      setSummary(s.data);
      setInvestors(inv.data);
      setReminders(rem.data);
      setBizUnits(bu.data.filter((u) => u.active !== false));
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.detail || "Gagal memuat dashboard. Coba refresh atau restart backend.");
      toast.error("Gagal memuat dashboard");
      setSummary((prev) => prev || { today: {}, revenue_by_unit: {}, weekly_trend: [], low_stock: [], recent_transactions: [] });
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const h = (e) => {
      const k = e.detail?.type;
      if (["transaction_created", "transaction_cancelled", "transaction_updated", "order_created", "order_updated"].includes(k)) {
        load();
      }
    };
    window.addEventListener("aw:ws", h);
    return () => window.removeEventListener("aw:ws", h);
  }, []);


  const seedSample = async () => {
    if (!window.confirm("Muat data contoh? Ini akan menghapus data transaksi/inventori saat ini.")) return;
    setSeeding(true);
    try {
      await api.post("/seed/sample-data");
      toast.success("Data contoh berhasil dimuat!");
      await load();
    } catch (e) {
      toast.error("Gagal memuat data contoh");
    } finally {
      setSeeding(false);
    }
  };

  if (!summary) {
    return <div className="text-center py-20 text-gray-500">Memuat...</div>;
  }

  const t = summary.today || {};
  const profitColor = t.net_profit >= 0 ? "#1a6b3c" : "#e53e3e";

  const unitPocketData = Object.entries(summary.revenue_by_unit || {}).map(([k, v]) => ({
    key: k, value: v, ...(UNIT_META[k] || { label: k, color: "#999", bg: "#eee" })
  }));

  const equityData = investors.map((i, idx) => ({
    name: i.name,
    value: Math.round(i.total_capital),
    color: ["#1a6b3c", "#f4a228", "#6b46c1", "#2563eb"][idx % 4],
  }));

  return (
    <div className="space-y-5 fade-in">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Hari ini</div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>
            Halo, {user?.name?.split(" ")[0] || "Admin"} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        {false && summary.recent_transactions?.length === 0 && (
          <Button onClick={seedSample} disabled={seeding} data-testid="seed-sample-btn"
            className="bg-[#f4a228] hover:bg-[#d98b1a] text-white">
            <Sparkles className="w-4 h-4 mr-1.5" /> {seeding ? "Memuat..." : "Muat Data Contoh"}
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KPICard testid="kpi-revenue" label="Pendapatan Hari Ini" value={formatRupiah(t.revenue)}
          sub={`${t.tx_count} transaksi`} icon={ArrowUpRight} accent="#1a6b3c" />
        <KPICard testid="kpi-expense" label="Pengeluaran" value={formatRupiah(t.expense)}
          sub="Operasional hari ini" icon={ArrowDownRight} accent="#e53e3e" />
        <KPICard testid="kpi-profit" label="Laba Bersih" value={formatRupiah(t.net_profit)}
          sub={t.net_profit >= 0 ? "Profit" : "Rugi"} icon={TrendingUp} accent={profitColor} />
        <KPICard testid="kpi-cash" label="Posisi Kas" value={formatRupiah(t.cash_position)}
          sub="Kas + Bank" icon={Wallet} accent="#111827" />
      </div>

      {/* Reminders / Pengingat */}
      {reminders && reminders.total > 0 && (
        <div data-testid="reminders-panel" className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-red-50 border-b border-gray-100 flex items-center gap-2.5">
            <div className="relative">
              <BellRing className="w-5 h-5 text-amber-600" />
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{reminders.total}</span>
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Pengingat Pembayaran</div>
              <div className="text-[11px] text-gray-500">Tindakan yang perlu Anda selesaikan</div>
            </div>
          </div>
          <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
            {reminders.items.slice(0, 8).map((r) => {
              const icons = { users: Users, truck: Truck, package: Package, clock: Clock };
              const colors = {
                amber: "bg-amber-50 text-amber-700 border-amber-200",
                red: "bg-red-50 text-red-700 border-red-200",
              };
              const Icn = icons[r.icon] || BellRing;
              return (
                <button key={r.id} data-testid={`reminder-${r.kind}`} onClick={() => nav(r.action_url)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${colors[r.color] || colors.amber}`}>
                    <Icn className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{r.title}</div>
                    <div className="text-xs text-gray-500 truncate">{r.subtitle}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                </button>
              );
            })}
            {reminders.total > 8 && (
              <div className="px-4 py-2 text-center text-xs text-gray-500">+ {reminders.total - 8} pengingat lainnya</div>
            )}
          </div>
        </div>
      )}

      {/* Alerts */}
      {summary.low_stock?.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3" data-testid="low-stock-alert">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-red-900 text-sm">Stok Menipis</div>
            <div className="text-xs text-red-800 mt-0.5">
              {summary.low_stock.slice(0, 3).map((i) => `${i.name} (${i.current_stock} ${i.unit})`).join(", ")}
              {summary.low_stock.length > 3 && ` +${summary.low_stock.length - 3} lainnya`}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => nav("/inventori")}>Lihat</Button>
        </div>
      )}

      {/* Unit Pockets - Kantong */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-2.5 uppercase tracking-wider">Kantong Unit Bisnis</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {(() => {
            // Build a union: bizUnits from API + any unit found in revenue_by_unit (for orphans)
            const apiCodes = new Set(bizUnits.map((b) => b.code));
            const orphanCodes = Object.keys(summary.revenue_by_unit || {}).filter((c) => !apiCodes.has(c));
            const allUnits = [
              ...bizUnits,
              ...orphanCodes.map((c) => ({ code: c, name: (UNIT_META[c]?.label) || c.charAt(0).toUpperCase() + c.slice(1), color: UNIT_META[c]?.color || "#6b7280" })),
            ];
            return allUnits.map((u) => {
              const meta = UNIT_META[u.code];
              const Icon = meta?.icon || Box;
              const color = meta?.color || u.color || "#6b7280";
              const bg = meta?.bg || hexToBg(color);
              const rev = summary.revenue_by_unit?.[u.code] || 0;
              return (
                <div key={u.code} data-testid={`unit-pocket-${u.code}`}
                  className="relative bg-white rounded-xl border border-gray-100 shadow-sm p-4 overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color }} />
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-md" style={{ background: bg }}>
                      <Icon className="w-4 h-4" style={{ color }} />
                    </div>
                    <span className="text-sm font-semibold text-gray-800">{u.name || meta?.label || u.code}</span>
                  </div>
                  <div className="text-xs text-gray-500">Pendapatan Total</div>
                  <div className="font-mono text-lg font-semibold mt-0.5" style={{ color }}>
                    {formatRupiah(rev)}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Chart row */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Tren Mingguan</h3>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#1a6b3c]" />Pendapatan</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#e53e3e]" />Pengeluaran</span>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary.weekly_trend}>
                <defs>
                  <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a6b3c" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#1a6b3c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#6b7280" }} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}rb` : v} />
                <Tooltip formatter={(v) => formatRupiah(v)} contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }} />
                <Area type="monotone" dataKey="revenue" stroke="#1a6b3c" strokeWidth={2} fill="url(#gRev)" />
                <Area type="monotone" dataKey="expense" stroke="#e53e3e" strokeWidth={2} fill="transparent" strokeDasharray="3 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Ekuitas Investor</h3>
          {equityData.length === 0 ? (
            <div className="text-sm text-gray-500 py-8 text-center">Belum ada data investor</div>
          ) : (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={equityData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
                      {equityData.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatRupiah(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 mt-2">
                {equityData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                      {d.name}
                    </span>
                    <span className="font-mono">{formatRupiah(d.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Transaksi Terkini</h3>
          <button onClick={() => nav("/laporan")} className="text-xs font-medium text-[#1a6b3c] hover:underline">
            Lihat Semua →
          </button>
        </div>
        <div className="divide-y divide-gray-100">
          {false && summary.recent_transactions?.length === 0 && (
            <div className="px-4 py-10 text-center text-gray-400 text-sm">
              Belum ada transaksi. Mulai jualan di Kasir atau muat data contoh.
            </div>
          )}
          {summary.recent_transactions?.map((t) => {
            const bizUnit = bizUnits.find((b) => b.code === t.unit);
            const meta = UNIT_META[t.unit] || {
              label: bizUnit?.name || t.unit || "?",
              color: bizUnit?.color || "#6b7280",
              bg: hexToBg(bizUnit?.color || "#6b7280"),
              icon: Box,
            };
            const Icon = meta.icon;
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="p-2 rounded-lg" style={{ background: meta.bg }}>
                  <Icon className="w-4 h-4" style={{ color: meta.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{t.trx_no || t.id.slice(0, 8)}</div>
                  <div className="text-xs text-gray-500">{formatDateTime(t.created_at)} · {meta.label}</div>
                </div>
                <div className="font-mono font-semibold text-[#1a6b3c]">{formatRupiah(t.total)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
