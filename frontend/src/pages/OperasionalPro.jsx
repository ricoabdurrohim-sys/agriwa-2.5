import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChefHat, QrCode, SplitSquareHorizontal, ArrowRightLeft, Gauge, BellRing, PackageCheck, Users, Tag, Warehouse, Calculator, UtensilsCrossed, Settings2, CheckCircle2, Sparkles, AlertTriangle } from "lucide-react";
import api, { formatRupiah } from "@/lib/api";
import { Button } from "@/components/ui/button";

const FLOW_CARDS = [
  { title: "Warung cepat", icon: UtensilsCrossed, href: "/warung", desc: "Meja aktif, tambah menu cepat, print QR pesanan, lanjut Kasir." },
  { title: "Kasir final", icon: Calculator, href: "/kasir", desc: "Selesaikan transaksi, bon, member, diskon, dan print struk." },
  { title: "Dapur / KDS", icon: ChefHat, href: "/kds", desc: "Pantau item baru, diproses, siap, dan diantar." },
  { title: "Promo", icon: Tag, href: "/promo", desc: "Atur promo agar diskon tetap terkontrol." },
  { title: "Member", icon: Users, href: "/members", desc: "Loyalty dan histori pelanggan untuk repeat order." },
  { title: "Inventori", icon: Warehouse, href: "/inventori", desc: "Stok, barcode, batch, dan FIFO tersambung ke kasir." },
];

const ERP_IDEAS = [
  { icon: QrCode, title: "QR pesanan aktif", status: "Aktif", text: "QR dari Warung mengunci table_id + order_id, jadi scan langsung membuka pesanan meja itu saja." },
  { icon: ChefHat, title: "Preparation display / KDS", status: "Aktif", text: "Order Warung dan self-order masuk layar dapur untuk status baru → proses → siap → diantar." },
  { icon: SplitSquareHorizontal, title: "Split bill", status: "Rencana aman", text: "Bisa ditambahkan sebagai submenu terpisah agar tidak mengganggu transaksi utama." },
  { icon: ArrowRightLeft, title: "Transfer/gabung meja", status: "Rencana aman", text: "Berguna untuk pindah meja/gabung meja, sebaiknya lewat aksi khusus order aktif." },
  { icon: BellRing, title: "Panggil pelayan / minta bill", status: "Rencana aman", text: "Bisa disambungkan ke notifikasi tanpa mengubah kasir/inventori." },
  { icon: PackageCheck, title: "86 / item habis otomatis", status: "Rencana", text: "Produk stok 0 bisa otomatis disembunyikan dari self-order dan diberi badge di Warung." },
];

function statusColor(status) {
  if (status === "Aktif") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status.includes("aman")) return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

export default function OperasionalPro() {
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiStatus, setAiStatus] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [o, t] = await Promise.all([
        api.get("/orders/active"),
        api.get("/tables?light=true"),
      ]);
      setOrders(o.data || []);
      setTables(t.data || []);
    } finally {
      setLoading(false);
    }
  };

  const loadAIStatus = async () => {
    try { const { data } = await api.get("/ai/status"); setAiStatus(data); } catch { setAiStatus(null); }
  };

  const loadAIInsights = async () => {
    setAiLoading(true);
    try {
      const { data } = await api.post("/ai/operational-insights", {});
      setAiResult(data);
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => { load(); loadAIStatus(); }, []);
  useEffect(() => {
    const h = (e) => {
      const type = e.detail?.type;
      if (["order_created", "order_updated", "transaction_created"].includes(type)) load();
    };
    window.addEventListener("aw:ws", h);
    return () => window.removeEventListener("aw:ws", h);
  }, []);

  const stats = useMemo(() => {
    const total = orders.reduce((s, o) => s + (o.items || []).reduce((x, it) => x + Number(it.quantity || 0) * Number(it.unit_price || 0), 0), 0);
    const occupied = new Set(orders.filter((o) => o.table_id).map((o) => o.table_id)).size;
    const itemCount = orders.reduce((s, o) => s + (o.items || []).reduce((x, it) => x + Number(it.quantity || 0), 0), 0);
    return { total, occupied, itemCount };
  }, [orders]);

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: "Poppins" }}>Operasional Pro</h1>
          <p className="text-sm text-gray-500 mt-0.5">Pusat kontrol F&B/ritel modern: meja, order aktif, dapur, kasir, promo, member, dan stok.</p>
        </div>
        <Button onClick={load} variant="outline" className="border-emerald-200 text-emerald-800" disabled={loading}>
          <Gauge className="w-4 h-4 mr-1.5" /> Refresh
        </Button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="text-xs text-gray-500">Order aktif</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{orders.length}</div>
          <div className="text-[11px] text-gray-500 mt-1">Meja & takeaway belum dibayar</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="text-xs text-gray-500">Meja terisi</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{stats.occupied}/{tables.length}</div>
          <div className="text-[11px] text-gray-500 mt-1">Status real-time dari order aktif</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="text-xs text-gray-500">Nilai order aktif</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{formatRupiah(stats.total)}</div>
          <div className="text-[11px] text-gray-500 mt-1">{stats.itemCount} item belum selesai</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-2">
            <Sparkles className="w-5 h-5 text-[#f4a228] mt-0.5" />
            <div>
              <div className="font-bold text-gray-900">AI Insight Operasional</div>
              <div className="text-xs text-gray-500">Opsional. Jika AI Gateway Vercel belum diisi, sistem tetap memberi rekomendasi lokal dari data Warung/Kasir/Inventori/Keuangan.</div>
            </div>
          </div>
          <Button onClick={loadAIInsights} disabled={aiLoading} className="bg-[#1a6b3c] hover:bg-[#14522d]">
            <Sparkles className="w-4 h-4 mr-1.5" /> {aiLoading ? "Menganalisis..." : "Analisis Sekarang"}
          </Button>
        </div>
        <div className="p-4 space-y-3">
          <div className={`text-xs rounded-xl border px-3 py-2 ${aiStatus?.enabled ? "bg-emerald-50 text-emerald-800 border-emerald-100" : "bg-amber-50 text-amber-800 border-amber-100"}`}>
            {aiStatus?.message || "Status AI belum terbaca"} {aiStatus?.model ? `· Model: ${aiStatus.model}` : ""}
          </div>
          {aiResult?.ai_error && (
            <div className="text-xs rounded-xl bg-amber-50 text-amber-800 border border-amber-100 px-3 py-2 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> AI Gateway gagal dipanggil, rekomendasi lokal tetap ditampilkan. Detail: {aiResult.ai_error}
            </div>
          )}
          {aiResult?.snapshot && (
            <div className="grid sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded-xl bg-gray-50 p-3"><div className="text-gray-500">Omzet hari ini</div><div className="font-bold text-gray-900">{formatRupiah(aiResult.snapshot.today_revenue || 0)}</div></div>
              <div className="rounded-xl bg-gray-50 p-3"><div className="text-gray-500">Order terlama</div><div className="font-bold text-gray-900">{aiResult.snapshot.oldest_order_minutes || 0} menit</div></div>
              <div className="rounded-xl bg-gray-50 p-3"><div className="text-gray-500">Stok menipis</div><div className="font-bold text-gray-900">{aiResult.snapshot.low_stock_count || 0} item</div></div>
              <div className="rounded-xl bg-gray-50 p-3"><div className="text-gray-500">Bon aktif</div><div className="font-bold text-gray-900">{aiResult.snapshot.unpaid_debt_count || 0}</div></div>
            </div>
          )}
          <div className="space-y-2">
            {(aiResult?.insights || [
              "Klik Analisis Sekarang untuk melihat rekomendasi efisiensi dari data aktif aplikasi.",
              "Prioritas saat ini: QR order meja, kecepatan Warung/Kasir, stok menipis, bon/piutang, dan flow dapur/KDS.",
            ]).map((x, idx) => (
              <div key={idx} className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2 text-sm text-gray-700 leading-relaxed">{x}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {FLOW_CARDS.map((card) => (
          <Link key={card.href} to={card.href} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all block">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-[#1a6b3c] flex items-center justify-center shrink-0"><card.icon className="w-5 h-5" /></div>
              <div className="min-w-0">
                <div className="font-semibold text-gray-900">{card.title}</div>
                <div className="text-xs text-gray-500 mt-1 leading-relaxed">{card.desc}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-[#1a6b3c]" />
          <div>
            <div className="font-bold text-gray-900">Roadmap ERP/F&B aman</div>
            <div className="text-xs text-gray-500">Fitur yang sudah aktif dan fitur relevan yang bisa ditambah tanpa merusak integrasi utama.</div>
          </div>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
          {ERP_IDEAS.map((x) => (
            <div key={x.title} className="rounded-xl border border-gray-100 p-3 bg-gray-50/70">
              <div className="flex items-start gap-2">
                <x.icon className="w-4 h-4 text-[#1a6b3c] mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm text-gray-900">{x.title}</div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${statusColor(x.status)}`}>{x.status}</span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1 leading-relaxed">{x.text}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-sm text-emerald-900 flex gap-3">
        <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
        <div>Patch ini menjaga flow utama: Warung → order aktif meja → QR pesanan → scan → detail meja → tambah item → lanjut Kasir → transaksi selesai → Dashboard/Keuangan tersinkron.</div>
      </div>
    </div>
  );
}
