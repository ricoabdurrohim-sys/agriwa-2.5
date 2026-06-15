import React, { useEffect, useState } from "react";
import { HelpCircle, Download, Calendar, FileSpreadsheet, Printer, FileText, Banknote, CreditCard, Smartphone } from "lucide-react";
import api, { API_URL, formatRupiah, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { exportTransactionsXLSX, exportTransactionsPDF, exportProfitLossXLSX, exportProfitLossPDF, exportInventoryXLSX, exportInventoryPDF } from "@/lib/exports";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const GLOSSARY = {
  "Pendapatan": "Total uang masuk dari penjualan barang/jasa sebelum dipotong biaya.",
  "HPP": "Harga Pokok Penjualan — biaya langsung untuk menghasilkan barang yang terjual (bahan baku, biaya produksi).",
  "Laba Kotor": "Pendapatan dikurangi HPP. Mengukur efisiensi produksi sebelum biaya operasional.",
  "Laba Bersih": "Laba kotor dikurangi seluruh biaya operasional. Inilah keuntungan riil bisnis.",
  "Gross Profit Margin": "Persentase laba kotor terhadap pendapatan. Formula: (Pendapatan - HPP) / Pendapatan × 100%.",
  "Net Profit Margin": "Persentase laba bersih terhadap pendapatan. Formula: Laba Bersih / Pendapatan × 100%.",
  "Aset": "Harta atau sumber daya yang dimiliki bisnis (kas, persediaan, peralatan).",
  "Kewajiban": "Hutang/kewajiban yang harus dibayar bisnis kepada pihak luar.",
  "Ekuitas": "Modal pemilik = Aset - Kewajiban. Hak kepemilikan investor atas bisnis.",
  "Arus Kas": "Pergerakan uang masuk dan keluar dari operasi, investasi, dan pendanaan.",
  "Modal Disetor": "Uang yang sudah disetorkan investor ke dalam bisnis.",
  "Laba Ditahan": "Akumulasi laba bersih yang belum dibagi sebagai dividen.",
  "Piutang": "Uang yang belum tertagih dari pelanggan (bon, invoice B2B).",
  "ROI": "Return on Investment — pengembalian dari modal yang diinvestasikan. Formula: Laba Bersih / Total Modal × 100%.",
};

function Glossary({ term }) {
  if (!GLOSSARY[term]) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-600 text-[10px] ml-1 hover:bg-[#f4a228] hover:text-white">?</button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm">
        <div className="font-semibold mb-1" style={{ fontFamily: 'Poppins' }}>{term}</div>
        <div className="text-gray-600 text-xs leading-relaxed">{GLOSSARY[term]}</div>
      </PopoverContent>
    </Popover>
  );
}

function Row({ label, value, indent = 0, bold, accent, hint }) {
  return (
    <div className={`flex items-center justify-between py-2 ${bold ? "border-t border-gray-200 mt-2 pt-3" : ""}`} style={{ paddingLeft: indent * 16 }}>
      <span className={`text-sm flex items-center ${bold ? "font-semibold text-gray-900" : "text-gray-700"}`}>
        {label} {hint && <Glossary term={hint} />}
      </span>
      <span className={`font-mono ${bold ? "font-semibold" : ""}`} style={{ color: accent || (bold ? "#111827" : "#374151") }}>
        {formatRupiah(value)}
      </span>
    </div>
  );
}

export default function Laporan() {
  const [pl, setPl] = useState(null);
  const [bs, setBs] = useState(null);
  const [cf, setCf] = useState(null);
  const [cb, setCb] = useState(null);
  const [trx, setTrx] = useState([]);

  useEffect(() => {
    (async () => {
      const [a, b, c, d, e] = await Promise.all([
        api.get("/reports/profit-loss"),
        api.get("/reports/balance-sheet"),
        api.get("/reports/cash-flow"),
        api.get("/transactions"),
        api.get("/reports/cash-balance"),
      ]);
      setPl(a.data); setBs(b.data); setCf(c.data); setTrx(d.data); setCb(e.data);
    })();
  }, []);

  useEffect(() => {
    const reload = async () => {
      const [a, b, c, d, e] = await Promise.all([
        api.get("/reports/profit-loss"),
        api.get("/reports/balance-sheet"),
        api.get("/reports/cash-flow"),
        api.get("/transactions"),
        api.get("/reports/cash-balance"),
      ]);
      setPl(a.data); setBs(b.data); setCf(c.data); setTrx(d.data); setCb(e.data);
    };
    const h = (e) => {
      const k = e.detail?.type;
      if (["transaction_created", "transaction_cancelled", "bizunit_updated"].includes(k)) reload();
    };
    window.addEventListener("aw:ws", h);
    return () => window.removeEventListener("aw:ws", h);
  }, []);

  if (!pl || !bs || !cf || !cb) return <div className="text-center py-20 text-gray-500">Memuat laporan...</div>;

  // Payment method visual config
  const pmStyle = (pm) => {
    const p = (pm || "cash").toLowerCase();
    if (["cash","tunai","bon_paid"].includes(p)) return { label: "Tunai", color: "bg-emerald-100 text-emerald-800 border-emerald-300", dot: "bg-emerald-500" };
    if (["transfer","bank","bca","mandiri","bni","bri","debit"].includes(p)) return { label: "Transfer Bank", color: "bg-blue-100 text-blue-800 border-blue-300", dot: "bg-blue-500" };
    if (["qris","qr","gopay","ovo","dana","shopeepay","ewallet","e-wallet"].includes(p)) return { label: "QRIS / E-Wallet", color: "bg-orange-100 text-orange-800 border-orange-300", dot: "bg-orange-500" };
    return { label: pm || "?", color: "bg-gray-100 text-gray-700 border-gray-300", dot: "bg-gray-400" };
  };

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Laporan Keuangan</h1>
          <p className="text-sm text-gray-500 mt-0.5">Konsolidasi semua unit bisnis</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Button data-testid="export-trx-xlsx-btn" variant="outline" size="sm" onClick={() => exportTransactionsXLSX(trx)}>
            <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Trx XLSX
          </Button>
          <Button data-testid="export-trx-pdf-btn" variant="outline" size="sm" onClick={() => exportTransactionsPDF(trx)}>
            <FileText className="w-4 h-4 mr-1.5" /> Trx PDF
          </Button>
          <Button data-testid="export-pl-xlsx-btn" variant="outline" size="sm" onClick={() => exportProfitLossXLSX(pl)}>
            <FileSpreadsheet className="w-4 h-4 mr-1.5" /> L/R XLSX
          </Button>
          <Button data-testid="export-pl-pdf-btn" variant="outline" size="sm" onClick={() => exportProfitLossPDF(pl)}>
            <FileText className="w-4 h-4 mr-1.5" /> L/R PDF
          </Button>
          <Button data-testid="export-pdf-btn" variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1.5" /> Print
          </Button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div data-testid="kpi-revenue" className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">Total Revenue</div>
          <div className="font-mono text-xl font-bold text-[#1a6b3c]">{formatRupiah(pl.total_revenue)}</div>
          <div className="text-[10px] text-gray-500 mt-0.5">Penjualan + Pendapatan lain</div>
        </div>
        <div data-testid="kpi-cogs" className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">HPP (COGS)</div>
          <div className="font-mono text-xl font-bold text-amber-700">{formatRupiah(pl.cogs || 0)}</div>
          <div className="text-[10px] text-gray-500 mt-0.5">Biaya bahan terpakai</div>
        </div>
        <div data-testid="kpi-gross" className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">Gross Profit</div>
          <div className="font-mono text-xl font-bold text-emerald-700">{formatRupiah(pl.gross_profit || 0)}</div>
          <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">{pl.gross_profit_margin}% margin</div>
        </div>
        <div data-testid="kpi-net" className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">Net Profit</div>
          <div className={`font-mono text-xl font-bold ${pl.net_profit >= 0 ? "text-[#1a6b3c]" : "text-red-600"}`}>{formatRupiah(pl.net_profit)}</div>
          <div className={`text-[10px] font-semibold mt-0.5 ${pl.net_profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{pl.net_profit_margin}% margin</div>
        </div>
      </div>

      {/* Saldo Kas per Metode Pembayaran */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div data-testid="cash-card-cash" className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-2 border-emerald-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center text-white"><Banknote className="w-5 h-5" /></div>
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">Tunai</div>
                <div className="text-[11px] text-emerald-700/80">{cb.by_method.cash.in_count} masuk · {cb.by_method.cash.out_count} keluar</div>
              </div>
            </div>
          </div>
          <div className="font-mono text-2xl font-bold text-emerald-900">{formatRupiah(cb.by_method.cash.balance)}</div>
          <div className="flex justify-between text-[10px] font-mono mt-1.5 text-emerald-800">
            <span>↑ {formatRupiah(cb.by_method.cash.inflow)}</span>
            <span>↓ {formatRupiah(cb.by_method.cash.outflow)}</span>
          </div>
        </div>
        <div data-testid="cash-card-bank" className="bg-gradient-to-br from-blue-50 to-blue-100/50 border-2 border-blue-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center text-white"><CreditCard className="w-5 h-5" /></div>
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-blue-700">Transfer Bank</div>
                <div className="text-[11px] text-blue-700/80">{cb.by_method.bank.in_count} masuk · {cb.by_method.bank.out_count} keluar</div>
              </div>
            </div>
          </div>
          <div className="font-mono text-2xl font-bold text-blue-900">{formatRupiah(cb.by_method.bank.balance)}</div>
          <div className="flex justify-between text-[10px] font-mono mt-1.5 text-blue-800">
            <span>↑ {formatRupiah(cb.by_method.bank.inflow)}</span>
            <span>↓ {formatRupiah(cb.by_method.bank.outflow)}</span>
          </div>
        </div>
        <div data-testid="cash-card-ewallet" className="bg-gradient-to-br from-orange-50 to-orange-100/50 border-2 border-orange-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-orange-500 flex items-center justify-center text-white"><Smartphone className="w-5 h-5" /></div>
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-orange-700">QRIS / E-Wallet</div>
                <div className="text-[11px] text-orange-700/80">{cb.by_method.ewallet.in_count} masuk · {cb.by_method.ewallet.out_count} keluar</div>
              </div>
            </div>
          </div>
          <div className="font-mono text-2xl font-bold text-orange-900">{formatRupiah(cb.by_method.ewallet.balance)}</div>
          <div className="flex justify-between text-[10px] font-mono mt-1.5 text-orange-800">
            <span>↑ {formatRupiah(cb.by_method.ewallet.inflow)}</span>
            <span>↓ {formatRupiah(cb.by_method.ewallet.outflow)}</span>
          </div>
        </div>
      </div>

      <Tabs defaultValue="pl" className="bg-white rounded-xl border border-gray-100">
        <TabsList className="m-1 bg-gray-50">
          <TabsTrigger value="pl" data-testid="tab-pl">Laba Rugi</TabsTrigger>
          <TabsTrigger value="bs" data-testid="tab-bs">Neraca</TabsTrigger>
          <TabsTrigger value="cf" data-testid="tab-cf">Arus Kas</TabsTrigger>
          <TabsTrigger value="trx" data-testid="tab-trx">Transaksi</TabsTrigger>
        </TabsList>

        <TabsContent value="pl" className="p-4 sm:p-6">
          <div className="text-xs uppercase font-semibold text-gray-500 tracking-wider mb-3">Laporan Laba Rugi</div>
          <div className="text-sm font-semibold text-gray-700 mb-1">PENDAPATAN <Glossary term="Pendapatan" /></div>
          {Object.entries(pl.revenue_by_unit).map(([u, v]) => (
            <Row key={u} label={`Pendapatan ${u.charAt(0).toUpperCase() + u.slice(1)}`} value={v} indent={1} />
          ))}
          {pl.other_income_by_category && Object.entries(pl.other_income_by_category).length > 0 && (
            <>
              <div className="text-xs font-semibold text-gray-600 mt-2 pl-4">Pendapatan Lain-lain</div>
              {Object.entries(pl.other_income_by_category).map(([c, v]) => (
                <Row key={c} label={c} value={v} indent={2} />
              ))}
            </>
          )}
          <Row label="Total Pendapatan" value={pl.total_revenue} bold accent="#1a6b3c" />

          <div className="text-sm font-semibold text-gray-700 mt-5 mb-1">HARGA POKOK PENJUALAN <Glossary term="HPP" /></div>
          <Row label="HPP (Bahan Baku Terpakai)" value={pl.cogs || 0} indent={1} />
          <Row label="LABA KOTOR" hint="Laba Kotor" value={pl.gross_profit || 0} bold accent="#1a6b3c" />

          <div className="text-sm font-semibold text-gray-700 mt-5 mb-1">BIAYA OPERASIONAL</div>
          {Object.entries(pl.expense_by_category).map(([c, v]) => (
            <Row key={c} label={c} value={v} indent={1} />
          ))}
          <Row label="Total Biaya" value={pl.total_expense} bold accent="#e53e3e" />

          <Row label="LABA BERSIH" hint="Laba Bersih" value={pl.net_profit} bold accent={pl.net_profit >= 0 ? "#1a6b3c" : "#e53e3e"} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold text-emerald-700 tracking-wider mb-1">Gross Profit Margin <Glossary term="Gross Profit Margin" /></div>
              <div className="font-mono text-xl font-semibold text-emerald-900">{pl.gross_profit_margin}%</div>
              <div className="text-[10px] text-emerald-700/80">Laba Kotor ÷ Revenue</div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold text-amber-700 tracking-wider mb-1">Net Profit Margin <Glossary term="Net Profit Margin" /></div>
              <div className="font-mono text-xl font-semibold text-amber-900">{pl.net_profit_margin}%</div>
              <div className="text-[10px] text-amber-700/80">Laba Bersih ÷ Revenue</div>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold text-blue-700 tracking-wider mb-1">Expense Ratio</div>
              <div className="font-mono text-xl font-semibold text-blue-900">{pl.total_revenue > 0 ? ((pl.total_expense / pl.total_revenue) * 100).toFixed(2) : 0}%</div>
              <div className="text-[10px] text-blue-700/80">Biaya ÷ Revenue</div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bs" className="p-4 sm:p-6">
          <div className="text-xs uppercase font-semibold text-gray-500 tracking-wider mb-3">Neraca</div>
          <div className="text-sm font-semibold text-gray-700 mb-1">ASET <Glossary term="Aset" /></div>
          {Object.entries(bs.assets).filter(([k]) => k !== "total").map(([k, v]) => (
            <Row key={k} label={k} value={v} indent={1} />
          ))}
          <Row label="Total Aset" value={bs.assets.total} bold accent="#1a6b3c" />

          <div className="text-sm font-semibold text-gray-700 mt-5 mb-1">KEWAJIBAN <Glossary term="Kewajiban" /></div>
          <Row label="Total Kewajiban" value={bs.liabilities.total} indent={1} />

          <div className="text-sm font-semibold text-gray-700 mt-5 mb-1">EKUITAS <Glossary term="Ekuitas" /></div>
          {Object.entries(bs.equity).filter(([k]) => k !== "total").map(([k, v]) => (
            <Row key={k} label={k} value={v} indent={1} hint={k === "Modal Disetor" ? "Modal Disetor" : (k === "Laba Ditahan" ? "Laba Ditahan" : null)} />
          ))}
          <Row label="Total Ekuitas" value={bs.equity.total} bold accent="#1a6b3c" />
        </TabsContent>

        <TabsContent value="cf" className="p-4 sm:p-6">
          <div className="text-xs uppercase font-semibold text-gray-500 tracking-wider mb-3">Laporan Arus Kas <Glossary term="Arus Kas" /></div>
          <div className="text-sm font-semibold text-gray-700 mb-1">AKTIVITAS OPERASI</div>
          <Row label="Kas Masuk" value={cf.operating.in} indent={1} />
          <Row label="Kas Keluar" value={-cf.operating.out} indent={1} />
          <Row label="Arus Kas Operasi" value={cf.operating.net} bold />

          <div className="text-sm font-semibold text-gray-700 mt-5 mb-1">AKTIVITAS PENDANAAN</div>
          <Row label="Setoran Modal" value={cf.financing.in} indent={1} hint="Modal Disetor" />
          <Row label="Arus Kas Pendanaan" value={cf.financing.net} bold />

          <Row label="ARUS KAS BERSIH" value={cf.net_cash_flow} bold accent="#1a6b3c" />
        </TabsContent>

        <TabsContent value="trx" className="p-2">
          <div className="divide-y divide-gray-100">
            {trx.length === 0 ? <div className="text-center py-10 text-gray-400 text-sm">Belum ada transaksi</div> :
              trx.slice(0, 50).map((t) => {
                const s = pmStyle(t.payment_method);
                return (
                  <div key={t.id} data-testid={`trx-row-${t.id}`} className="flex items-center gap-3 py-3 px-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${s.dot} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{t.trx_no}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${s.color}`}>{s.label}</span>
                        {t.is_bon && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-100 text-amber-800 border-amber-300">BON</span>}
                        {t.cancelled && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-red-100 text-red-700 border-red-300">DIBATALKAN</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{formatDate(t.created_at)} · {t.unit}{t.customer_name && ` · ${t.customer_name}`}</div>
                    </div>
                    <div className={`font-mono font-semibold ${t.cancelled ? "text-gray-400 line-through" : "text-[#1a6b3c]"}`}>{formatRupiah(t.total)}</div>
                  </div>
                );
              })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
