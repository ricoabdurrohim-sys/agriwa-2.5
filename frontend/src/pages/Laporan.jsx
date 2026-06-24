import React, { useEffect, useRef, useState } from "react";
import { HelpCircle, Download, Printer, FileSpreadsheet, FileText, Banknote, CreditCard, Smartphone, AlertTriangle, Brain, TrendingUp, CalendarDays } from "lucide-react";
import api, { formatRupiah, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { exportTransactionsXLSX, exportTransactionsPDF, exportProfitLossXLSX, exportProfitLossPDF } from "@/lib/exports";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const GLOSSARY = {
  "Pendapatan": "Uang yang benar-benar sudah masuk dari kasir + pemasukan lain. Bon yang belum dibayar tidak dihitung sebagai kas masuk.",
  "HPP": "Harga Pokok Penjualan — biaya langsung barang yang terjual berdasarkan snapshot transaksi.",
  "Laba Kotor": "Pendapatan dikurangi HPP.",
  "Laba Bersih": "Laba kotor dikurangi biaya operasional.",
  "Aset": "Kas, piutang, dan persediaan.",
  "Ekuitas": "Modal pemilik + laba ditahan.",
  "Arus Kas": "Pergerakan kas masuk dan keluar.",
};

const money = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const asArray = (v) => Array.isArray(v) ? v : [];
const FINANCE_CACHE_MS = 30000;

function Glossary({ term }) {
  if (!GLOSSARY[term]) return null;
  return (
    <Popover>
      <PopoverTrigger asChild><button className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-600 text-[10px] ml-1 hover:bg-[#f4a228] hover:text-white"><HelpCircle className="w-3 h-3" /></button></PopoverTrigger>
      <PopoverContent className="w-72 text-sm"><div className="font-semibold mb-1">{term}</div><div className="text-gray-600 text-xs leading-relaxed">{GLOSSARY[term]}</div></PopoverContent>
    </Popover>
  );
}

function Row({ label, value, indent = 0, bold, accent, hint }) {
  return (
    <div className={`flex items-center justify-between py-2 ${bold ? "border-t border-gray-200 mt-2 pt-3" : ""}`} style={{ paddingLeft: indent * 16 }}>
      <span className={`text-sm flex items-center ${bold ? "font-semibold text-gray-900" : "text-gray-700"}`}>{label} {hint && <Glossary term={hint} />}</span>
      <span className={`font-mono ${bold ? "font-semibold" : ""}`} style={{ color: accent || (bold ? "#111827" : "#374151") }}>{formatRupiah(value)}</span>
    </div>
  );
}

export default function Laporan() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState({ weekly: {}, monthly: {}, yearly: {} });
  const [ai, setAi] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const refreshTimerRef = useRef(null);

  const load = async ({ force = false } = {}) => {
    setError("");
    const cached = window.__awFinanceSummaryCache;
    if (!force && cached?.data && Date.now() - cached.ts < FINANCE_CACHE_MS) {
      setSummary(cached.data);
      api.get("/reports/sales-analytics").then(({data}) => setAnalytics(data || { weekly: {}, monthly: {}, yearly: {} })).catch(() => {});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [{ data }, analyticsRes] = await Promise.all([
        api.get("/finance/system-summary?limit=500"),
        api.get("/reports/sales-analytics").catch(() => ({ data: { weekly: {}, monthly: {}, yearly: {} } })),
      ]);
      const cacheMeta = data?.cache || {};
      // Kalau backend mengirim data stale sambil refresh background berjalan, tampilkan dulu
      // tetapi jangan disimpan di cache frontend agar fetch berikutnya mengambil data segar.
      if (cacheMeta.dirty || cacheMeta.refreshing) {
        window.__awFinanceSummaryCache = null;
      } else {
        window.__awFinanceSummaryCache = { data: data || {}, ts: Date.now() };
      }
      setSummary(data || {});
      setAnalytics(analyticsRes.data || { weekly: {}, monthly: {}, yearly: {} });
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.detail || "Gagal memuat laporan. Coba restart backend HuggingFace lalu refresh.");
      setSummary({ profit_loss: {}, balance_sheet: { assets: {}, liabilities: {}, equity: {} }, cash_flow: {}, cash_balance: { by_method: {} }, cashier_ledger: [] });
    } finally { setLoading(false); }
  };

  const loadAi = async (useOpenAi = false) => {
    setAiLoading(true);
    try {
      const { data } = await api.get(`/ai/inventory-insights?use_openai=${useOpenAi ? 'true' : 'false'}`);
      setAi(data);
    } catch (e) {
      setAi({ openai_error: e?.response?.data?.detail || "Gagal memuat rekomendasi AI" });
    } finally { setAiLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const debouncedFinanceLoad = () => {
      window.__awFinanceSummaryCache = null;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        load({ force: false });
        // Ambil ulang sekali lagi setelah background cache backend kemungkinan sudah selesai.
        refreshTimerRef.current = setTimeout(() => load({ force: false }), 3500);
      }, 1200);
    };
    const h = (e) => {
      const k = e.detail?.type;
      if (["transaction_created", "transaction_cancelled", "transaction_updated", "bizunit_updated"].includes(k)) debouncedFinanceLoad();
    };
    const financeH = () => debouncedFinanceLoad();
    window.addEventListener("aw:ws", h);
    window.addEventListener("aw:finance-mutated", financeH);
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      window.removeEventListener("aw:ws", h);
      window.removeEventListener("aw:finance-mutated", financeH);
    };
  }, []);

  if (loading && !summary) return <div className="text-center py-20 text-gray-500">Memuat laporan...</div>;

  const pl = summary?.profit_loss || {};
  const bs = summary?.balance_sheet || { assets: {}, liabilities: {}, equity: {} };
  const cf = summary?.cash_flow || { operating: {}, investing: {}, financing: {} };
  const cb = summary?.cash_balance || { by_method: {} };
  const trx = asArray(summary?.cashier_ledger || summary?.pos_transactions);
  const totals = summary?.totals || {};
  const bm = cb.by_method || {};
  const safeMethod = (m) => bm[m] || { balance: 0, inflow: 0, outflow: 0, in_count: 0, out_count: 0 };
  const trendRows = (obj) => Object.entries(obj || {}).sort(([a],[b]) => String(b).localeCompare(String(a))).slice(0, 12);

  const exportPL = { ...pl, total_revenue: money(pl.total_revenue), net_profit: money(pl.net_profit) };

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Laporan Keuangan</h1>
          <p className="text-sm text-gray-500 mt-0.5">Menggunakan sumber data yang sama dengan Keuangan dan Dashboard</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Button variant="outline" size="sm" onClick={() => exportTransactionsXLSX(trx)}><FileSpreadsheet className="w-4 h-4 mr-1.5" /> Trx XLSX</Button>
          <Button variant="outline" size="sm" onClick={() => exportTransactionsPDF(trx)}><FileText className="w-4 h-4 mr-1.5" /> Trx PDF</Button>
          <Button variant="outline" size="sm" onClick={() => exportProfitLossXLSX(exportPL)}><FileSpreadsheet className="w-4 h-4 mr-1.5" /> L/R XLSX</Button>
          <Button variant="outline" size="sm" onClick={() => exportProfitLossPDF(exportPL)}><FileText className="w-4 h-4 mr-1.5" /> L/R PDF</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1.5" /> Print</Button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5" /> {error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-100 rounded-xl p-4"><div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">Total Revenue</div><div className="font-mono text-xl font-bold text-[#1a6b3c]">{formatRupiah(pl.total_revenue)}</div><div className="text-[10px] text-gray-500 mt-0.5">Kasir + pendapatan lain</div></div>
        <div className="bg-white border border-gray-100 rounded-xl p-4"><div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">HPP</div><div className="font-mono text-xl font-bold text-amber-700">{formatRupiah(pl.cogs || 0)}</div><div className="text-[10px] text-gray-500 mt-0.5">Biaya barang terjual</div></div>
        <div className="bg-white border border-gray-100 rounded-xl p-4"><div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">Gross Profit</div><div className="font-mono text-xl font-bold text-emerald-700">{formatRupiah(pl.gross_profit || 0)}</div><div className="text-[10px] text-emerald-600 font-semibold mt-0.5">{pl.gross_profit_margin || 0}% margin</div></div>
        <div className="bg-white border border-gray-100 rounded-xl p-4"><div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">Net Profit</div><div className={`font-mono text-xl font-bold ${money(pl.net_profit) >= 0 ? "text-[#1a6b3c]" : "text-red-600"}`}>{formatRupiah(pl.net_profit)}</div><div className="text-[10px] text-gray-500 mt-0.5">Kas posisi {formatRupiah(totals.cash_position)}</div></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[{k:'cash',t:'Tunai',I:Banknote,c:'emerald'},{k:'bank',t:'Transfer Bank',I:CreditCard,c:'blue'},{k:'ewallet',t:'QRIS / E-Wallet',I:Smartphone,c:'orange'}].map(({k,t,I,c}) => { const v=safeMethod(k); return (
          <div key={k} className={`bg-white border border-gray-100 rounded-xl p-4`}><div className="flex items-center gap-2 mb-2"><div className="w-9 h-9 rounded-lg bg-gray-900 flex items-center justify-center text-white"><I className="w-5 h-5" /></div><div><div className="text-[10px] uppercase tracking-wider font-bold text-gray-600">{t}</div><div className="text-[11px] text-gray-500">{v.in_count} masuk · {v.out_count} keluar</div></div></div><div className="font-mono text-2xl font-bold text-gray-900">{formatRupiah(v.balance)}</div><div className="flex justify-between text-[10px] font-mono mt-1.5 text-gray-500"><span>↑ {formatRupiah(v.inflow)}</span><span>↓ {formatRupiah(v.outflow)}</span></div></div>
        );})}
      </div>

      <Tabs defaultValue="pl" className="bg-white rounded-xl border border-gray-100">
        <TabsList className="m-1 bg-gray-50 flex flex-wrap h-auto">
          <TabsTrigger value="pl">Laba Rugi</TabsTrigger><TabsTrigger value="period">Mingguan/Tahunan</TabsTrigger><TabsTrigger value="ai">AI Rekomendasi</TabsTrigger><TabsTrigger value="bs">Neraca</TabsTrigger><TabsTrigger value="cf">Arus Kas</TabsTrigger><TabsTrigger value="trx">Transaksi</TabsTrigger>
        </TabsList>
        <TabsContent value="pl" className="p-4 sm:p-6">
          <div className="text-xs uppercase font-semibold text-gray-500 tracking-wider mb-3">Laporan Laba Rugi</div>
          <div className="text-sm font-semibold text-gray-700 mb-1">PENDAPATAN <Glossary term="Pendapatan" /></div>
          {Object.entries(pl.revenue_by_unit || {}).map(([u,v]) => <Row key={u} label={`Pendapatan ${u}`} value={v} indent={1} />)}
          {Object.entries(pl.other_income_by_category || {}).map(([u,v]) => <Row key={u} label={u} value={v} indent={1} />)}
          <Row label="Total Pendapatan" value={pl.total_revenue} bold accent="#1a6b3c" />
          <Row label="HPP" value={-money(pl.cogs)} indent={1} hint="HPP" />
          <Row label="Laba Kotor" value={pl.gross_profit} bold hint="Laba Kotor" />
          <div className="text-sm font-semibold text-gray-700 mt-5 mb-1">BEBAN OPERASIONAL</div>
          {Object.entries(pl.expense_by_category || {}).map(([c,v]) => <Row key={c} label={c} value={-money(v)} indent={1} />)}
          <Row label="Total Beban" value={-money(pl.total_expense)} bold />
          <Row label="LABA BERSIH" value={pl.net_profit} bold accent={money(pl.net_profit) >= 0 ? "#1a6b3c" : "#e53e3e"} hint="Laba Bersih" />
        </TabsContent>
        <TabsContent value="period" className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700"><CalendarDays className="w-4 h-4 text-[#1a6b3c]" /> Ringkasan Periode</div>
          <div className="grid md:grid-cols-3 gap-3">
            {[["Mingguan", analytics.weekly], ["Bulanan", analytics.monthly], ["Tahunan", analytics.yearly]].map(([title, rows]) => (
              <div key={title} className="border border-gray-100 rounded-xl p-3">
                <div className="text-xs uppercase font-bold text-gray-500 mb-2">{title}</div>
                <div className="space-y-1.5">
                  {trendRows(rows).length === 0 && <div className="text-xs text-gray-400">Belum ada data</div>}
                  {trendRows(rows).map(([k, v]) => <div key={k} className="flex justify-between text-xs"><span className="font-mono text-gray-600">{k}</span><span className="font-mono font-semibold text-[#1a6b3c]">{formatRupiah(v.revenue || 0)}</span></div>)}
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-3">Konsepnya mirip reporting ERP: angka bisa dilihat per minggu, bulan, dan tahun tanpa mengubah sumber data Keuangan/Dashboard.</div>
        </TabsContent>

        <TabsContent value="ai" className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div><div className="flex items-center gap-2 text-sm font-semibold text-gray-700"><Brain className="w-4 h-4 text-purple-600" /> Rekomendasi Stok & Flow Barang</div><div className="text-xs text-gray-500 mt-1">Mode lokal berjalan tanpa API. Mode OpenAI aktif jika OPENAI_API_KEY diisi di HuggingFace.</div></div>
            <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => loadAi(false)} disabled={aiLoading}>Analisa Lokal</Button><Button size="sm" onClick={() => loadAi(true)} disabled={aiLoading} className="bg-purple-600 hover:bg-purple-700">Pakai OpenAI</Button></div>
          </div>
          {!ai && <div className="text-sm text-gray-400 border border-dashed rounded-xl p-8 text-center">Klik Analisa Lokal untuk melihat rekomendasi restock cepat.</div>}
          {ai?.openai_error && <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">{ai.openai_error}</div>}
          {ai?.ai_text && <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-sm whitespace-pre-line text-purple-950">{ai.ai_text}</div>}
          {Array.isArray(ai?.insights) && <div className="grid md:grid-cols-2 gap-3">{ai.insights.map((x, idx) => <div key={idx} className="bg-white border border-gray-100 rounded-xl p-3"><div className="font-semibold text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[#1a6b3c]" /> {x.title}</div><div className="text-xs text-gray-600 mt-1">{x.message}</div></div>)}</div>}
        </TabsContent>

        <TabsContent value="bs" className="p-4 sm:p-6"><div className="text-xs uppercase font-semibold text-gray-500 tracking-wider mb-3">Neraca</div><div className="text-sm font-semibold text-gray-700 mb-1">ASET <Glossary term="Aset" /></div>{Object.entries(bs.assets || {}).filter(([k])=>k!=="total").map(([k,v]) => <Row key={k} label={k} value={v} indent={1} />)}<Row label="Total Aset" value={bs.assets?.total || 0} bold accent="#1a6b3c" /><div className="text-sm font-semibold text-gray-700 mt-5 mb-1">KEWAJIBAN</div><Row label="Total Kewajiban" value={bs.liabilities?.total || 0} indent={1} /><div className="text-sm font-semibold text-gray-700 mt-5 mb-1">EKUITAS <Glossary term="Ekuitas" /></div>{Object.entries(bs.equity || {}).filter(([k])=>k!=="total").map(([k,v]) => <Row key={k} label={k} value={v} indent={1} />)}<Row label="Total Ekuitas" value={bs.equity?.total || 0} bold accent="#1a6b3c" /></TabsContent>
        <TabsContent value="cf" className="p-4 sm:p-6"><div className="text-xs uppercase font-semibold text-gray-500 tracking-wider mb-3">Arus Kas <Glossary term="Arus Kas" /></div><Row label="Kas Masuk Operasional" value={cf.operating?.in || 0} indent={1} /><Row label="Kas Keluar Operasional" value={-(cf.operating?.out || 0)} indent={1} /><Row label="Arus Kas Operasi" value={cf.operating?.net || 0} bold /><Row label="Setoran Modal" value={cf.financing?.in || 0} indent={1} /><Row label="ARUS KAS BERSIH" value={cf.net_cash_flow || 0} bold accent="#1a6b3c" /></TabsContent>
        <TabsContent value="trx" className="p-2"><div className="divide-y divide-gray-100">{trx.length === 0 ? <div className="text-center py-10 text-gray-400 text-sm">Belum ada transaksi</div> : trx.slice(0,100).map((t) => <div key={t.id} className="flex items-center gap-3 py-3 px-2"><div className={`w-2.5 h-2.5 rounded-full ${(t.debt_amount || 0) > 0 ? "bg-amber-500" : "bg-emerald-500"}`} /><div className="flex-1 min-w-0"><div className="text-sm font-medium">{t.trx_no || t.id}</div><div className="text-xs text-gray-500">{formatDate(t.created_at)} · {t.unit} · Struk {formatRupiah(t.transaction_total || t.total)} · Masuk {formatRupiah(t.cash_collected || t.paid_amount)}</div></div><div className="font-mono font-semibold text-[#1a6b3c]">{formatRupiah(t.cash_collected || t.paid_amount)}</div></div>)}</div></TabsContent>
      </Tabs>
    </div>
  );
}
