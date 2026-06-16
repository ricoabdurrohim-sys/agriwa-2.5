import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ArrowUpRight, ArrowDownRight, Wallet, Trash2, RefreshCw, AlertTriangle, Pencil } from "lucide-react";
import api, { formatRupiah, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const CATEGORIES = ["Gaji Karyawan", "Sewa Tanah", "Utilitas", "Pembelian Bahan", "Biaya Pemasaran", "Biaya Pengiriman", "Pengeluaran Lain-lain"];
const INCOME_CATEGORIES = ["Cashback Supplier", "Pengembalian Pajak", "Hibah / Donasi", "Bunga Bank", "Penjualan Aset", "Pemasukan Lain-lain"];
const FALLBACK_UNITS = ["umum", "warung", "anggur", "pupuk", "pembibitan", "gudang"];

const asArray = (v) => Array.isArray(v) ? v : [];
const money = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const FINANCE_CACHE_MS = 30000;

export default function Keuangan() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [bizUnits, setBizUnits] = useState([]);
  const [show, setShow] = useState(false);
  const [showInc, setShowInc] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [editingIncome, setEditingIncome] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ amount: 0, category: CATEGORIES[0], unit: "warung", notes: "", payment_method: "cash" });
  const [incForm, setIncForm] = useState({ amount: 0, category: INCOME_CATEGORIES[0], unit: "umum", source: "", notes: "", payment_method: "cash" });

  const load = async ({ force = false } = {}) => {
    setError("");
    const cached = window.__awFinanceSummaryCache;
    if (!force && cached?.data && Date.now() - cached.ts < FINANCE_CACHE_MS) {
      setSummary(cached.data);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get("/finance/system-summary?limit=500");
      window.__awFinanceSummaryCache = { data: data || {}, ts: Date.now() };
      setSummary(data || {});
    } catch (err) {
      console.error("finance/system-summary failed", err);
      setError(err?.response?.data?.detail || "Gagal memuat ringkasan keuangan. Backend mungkin belum selesai restart.");
      setSummary({ totals: {}, cashier_ledger: [], incomes: [], expenses: [], debts: [], profit_loss: {} });
    } finally {
      setLoading(false);
    }
  };

  const loadBizUnits = async () => {
    try {
      const { data } = await api.get("/business-units");
      setBizUnits([{ code: "umum", name: "Umum" }, ...asArray(data).filter((u) => u.active !== false).map((u) => ({ code: u.code, name: u.name }))]);
    } catch (err) { /* ignore */ }
  };

  useEffect(() => { load(); loadBizUnits(); }, []);
  useEffect(() => {
    const h = (e) => {
      const k = e.detail?.type;
      if (["transaction_created", "transaction_cancelled", "transaction_updated", "bizunit_updated"].includes(k)) {
        window.__awFinanceSummaryCache = null;
        load({ force: true }); loadBizUnits();
      }
    };
    window.addEventListener("aw:ws", h);
    return () => window.removeEventListener("aw:ws", h);
  }, []);

  const invalidateFinanceCache = () => {
    window.__awFinanceSummaryCache = null;
    window.dispatchEvent(new CustomEvent("aw:finance-mutated", { detail: { ts: Date.now() } }));
  };

  const refreshFinance = async () => {
    invalidateFinanceCache();
    await load({ force: true });
  };

  const openExpenseForm = (expense = null) => {
    setEditingExpense(expense);
    setForm(expense
      ? {
          amount: expense.amount || 0,
          category: expense.category || CATEGORIES[0],
          unit: expense.unit || "warung",
          notes: expense.notes || "",
          payment_method: expense.payment_method || "cash",
          date: expense.date || "",
        }
      : { amount: 0, category: CATEGORIES[0], unit: "warung", notes: "", payment_method: "cash", date: "" }
    );
    setShow(true);
  };

  const openIncomeForm = (income = null) => {
    setEditingIncome(income);
    setIncForm(income
      ? {
          amount: income.amount || 0,
          category: income.category || INCOME_CATEGORIES[0],
          unit: income.unit || "umum",
          source: income.source || "",
          notes: income.notes || "",
          payment_method: income.payment_method || "cash",
          date: income.date || "",
        }
      : { amount: 0, category: INCOME_CATEGORIES[0], unit: "umum", source: "", notes: "", payment_method: "cash", date: "" }
    );
    setShowInc(true);
  };

  const ledger = asArray(summary?.cashier_ledger || summary?.pos_transactions);
  const incomes = asArray(summary?.incomes);
  const expenses = asArray(summary?.expenses);
  const debts = asArray(summary?.debts);
  const totals = summary?.totals || {};

  const totalKasir = money(totals.pos_income ?? summary?.total_pos_income);
  const totalSalesValue = money(totals.pos_sales_value ?? summary?.total_pos_sales_value);
  const totalIncome = money(totals.other_income ?? summary?.total_other_income);
  const totalExpense = money(totals.expense ?? summary?.total_expense);
  const totalDebt = money(totals.debt ?? summary?.total_debt);
  const totalNet = totalKasir + totalIncome - totalExpense;

  const debtRemaining = (d) => Math.max(0, money(d.remaining ?? d.payment_due ?? (money(d.amount) - money(d.paid))));
  const payDebt = (id) => navigate(`/kasir?bon=${id}`);

  const save = async () => {
    if (!form.amount || parseInt(form.amount) <= 0) return toast.error("Isi jumlah pengeluaran");
    try {
      const payload = { ...form, amount: parseInt(form.amount) };
      if (editingExpense?.id) {
        await api.put(`/expenses/${editingExpense.id}`, payload);
        toast.success("Pengeluaran diperbarui");
      } else {
        await api.post("/expenses", payload);
        toast.success("Pengeluaran dicatat");
      }
      setEditingExpense(null);
      setForm({ amount: 0, category: CATEGORIES[0], unit: "warung", notes: "", payment_method: "cash", date: "" });
      setShow(false);
      await refreshFinance();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal menyimpan pengeluaran"); }
  };

  const saveIncome = async () => {
    if (!incForm.amount || parseInt(incForm.amount) <= 0) return toast.error("Isi jumlah pemasukan");
    try {
      const payload = { ...incForm, amount: parseInt(incForm.amount) };
      if (editingIncome?.id) {
        await api.put(`/incomes/${editingIncome.id}`, payload);
        toast.success("Pemasukan diperbarui");
      } else {
        await api.post("/incomes", payload);
        toast.success("Pemasukan tercatat di kas");
      }
      setEditingIncome(null);
      setIncForm({ amount: 0, category: INCOME_CATEGORIES[0], unit: "umum", source: "", notes: "", payment_method: "cash", date: "" });
      setShowInc(false);
      await refreshFinance();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal menyimpan pemasukan"); }
  };

  const deleteIncome = async (id, cat) => {
    if (!window.confirm(`Hapus pemasukan ${cat}? Saldo kas, Dashboard, dan Laporan akan disesuaikan.`)) return;
    try { await api.delete(`/incomes/${id}`); await refreshFinance(); toast.success("Pemasukan dihapus"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Gagal hapus pemasukan"); }
  };

  const deleteExpense = async (e) => {
    if (!window.confirm(`Hapus pengeluaran ${e.category} (${formatRupiah(e.amount)})? Saldo kas, Dashboard, dan Laporan akan disesuaikan.`)) return;
    try { await api.delete(`/expenses/${e.id}`); await refreshFinance(); toast.success("Pengeluaran dihapus"); }
    catch (err) { toast.error(err?.response?.data?.detail || "Gagal hapus pengeluaran"); }
  };

  const markPaid = async (id, customer) => {
    if (!window.confirm(`Tandai bon ${customer} sebagai LUNAS sepenuhnya?`)) return;
    try { await api.post(`/customer-debts/${id}/mark-paid`); await load(); toast.success("Bon lunas — dana tercatat di kas"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Gagal melunasi bon"); }
  };

  const unitOptions = bizUnits.length ? bizUnits : FALLBACK_UNITS.map(c => ({ code: c, name: c }));
  const methodLabel = (m) => {
    const p = String(m || "cash").toLowerCase();
    if (["transfer", "bank", "bca", "mandiri", "bni", "bri", "debit"].includes(p)) return "Transfer";
    if (["qris", "qr", "gopay", "ovo", "dana", "shopeepay", "ewallet", "e-wallet"].includes(p)) return "QRIS/E-Wallet";
    return "Tunai";
  };

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Keuangan</h1>
          <p className="text-sm text-gray-500 mt-0.5">Satu sumber data resmi untuk kasir, dashboard, dan laporan</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className="w-4 h-4 mr-1.5" /> Refresh</Button>
          <Button data-testid="add-income-btn" onClick={() => openIncomeForm()} className="bg-emerald-600 hover:bg-emerald-700"><ArrowUpRight className="w-4 h-4 mr-1.5" /> Pemasukan</Button>
          <Button data-testid="add-expense-btn" onClick={() => openExpenseForm()} className="bg-[#1a6b3c] hover:bg-[#14522d]"><Plus className="w-4 h-4 mr-1.5" /> Pengeluaran</Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-xs uppercase font-semibold text-gray-500 mb-1">Pemasukan Kasir</div>
          <div className="font-mono text-2xl font-bold text-[#1a6b3c]">{formatRupiah(totalKasir)}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">Nilai struk: {formatRupiah(totalSalesValue)} · {ledger.length} transaksi</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-xs uppercase font-semibold text-gray-500 mb-1">Pemasukan Non-Kasir</div>
          <div className="font-mono text-2xl font-bold text-emerald-600">{formatRupiah(totalIncome)}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">{incomes.length} entri</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-xs uppercase font-semibold text-gray-500 mb-1">Pengeluaran</div>
          <div className="font-mono text-2xl font-bold text-red-600">{formatRupiah(totalExpense)}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">{expenses.length} entri</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-xs uppercase font-semibold text-gray-500 mb-1">Kas Bersih / Piutang</div>
          <div className="font-mono text-2xl font-bold text-gray-900">{formatRupiah(totalNet)}</div>
          <div className="text-[11px] text-amber-700 mt-0.5">Piutang bon: {formatRupiah(totalDebt)}</div>
        </div>
      </div>

      <Tabs defaultValue="kasir" className="bg-white rounded-xl border border-gray-100">
        <TabsList className="m-1 bg-gray-50 flex flex-wrap h-auto">
          <TabsTrigger value="kasir">Penjualan Kasir</TabsTrigger>
          <TabsTrigger value="inc">Pemasukan</TabsTrigger>
          <TabsTrigger value="exp">Pengeluaran</TabsTrigger>
          <TabsTrigger value="debt">Bon Pelanggan</TabsTrigger>
        </TabsList>

        <TabsContent value="kasir" className="p-2">
          <div className="divide-y divide-gray-100">
            {ledger.length === 0 ? <div className="text-center py-10 text-gray-400 text-sm">Belum ada transaksi kasir</div> : ledger.slice(0, 100).map((t) => {
              const total = money(t.transaction_total ?? t.total);
              const collected = money(t.cash_collected ?? t.paid_amount);
              const remaining = money(t.open_receivable ?? t.debt_amount);
              return (
                <div key={t.id} className="flex items-center gap-3 py-3 px-2">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${remaining > 0 ? "bg-amber-500" : "bg-emerald-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{t.trx_no || t.id}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-gray-100 text-gray-700 border-gray-200">{methodLabel(t.payment_method)}</span>
                      {remaining > 0 ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-100 text-amber-800 border-amber-300">BON</span> : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-emerald-100 text-emerald-700 border-emerald-300">LUNAS</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {formatDate(t.created_at)} · {t.unit || "warung"}{t.customer_name && ` · ${t.customer_name}`} · Struk {formatRupiah(total)} · Masuk {formatRupiah(collected)}{remaining > 0 && ` · Sisa ${formatRupiah(remaining)}`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-semibold text-[#1a6b3c]">{formatRupiah(collected)}</div>
                    <div className="text-[10px] text-gray-500">uang masuk</div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="inc" className="p-2"><div className="divide-y divide-gray-100">
          {incomes.length === 0 ? <div className="text-center py-10 text-gray-400 text-sm">Belum ada pemasukan non-kasir</div> : incomes.map((i) => (
            <div key={i.id} className="flex items-center gap-3 py-3 px-2">
              <div className="p-2 bg-emerald-50 rounded-lg shrink-0"><ArrowUpRight className="w-4 h-4 text-emerald-600" /></div>
              <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{i.category}{i.source && <span className="text-gray-500"> · {i.source}</span>}</div><div className="text-xs text-gray-500">{formatDate(i.date || i.created_at)} · {i.unit}{i.notes && ` · ${i.notes}`}</div></div>
              <div className="text-right shrink-0">
                <div className="font-mono font-semibold text-emerald-600">+{formatRupiah(i.amount)}</div>
                <div className="flex justify-end gap-2 mt-0.5">
                  <button onClick={() => openIncomeForm(i)} className="text-[10px] text-blue-600 hover:underline">Edit</button>
                  <button onClick={() => deleteIncome(i.id, i.category)} className="text-[10px] text-red-500 hover:underline">Hapus</button>
                </div>
              </div>
            </div>
          ))}
        </div></TabsContent>

        <TabsContent value="exp" className="p-2"><div className="divide-y divide-gray-100">
          {expenses.length === 0 ? <div className="text-center py-10 text-gray-400 text-sm">Belum ada pengeluaran</div> : expenses.map((e) => (
            <div key={e.id} className="flex items-center gap-3 py-3 px-2">
              <div className="p-2 bg-red-50 rounded-lg"><ArrowDownRight className="w-4 h-4 text-red-600" /></div>
              <div className="flex-1"><div className="text-sm font-medium">{e.category}</div><div className="text-xs text-gray-500">{formatDate(e.date || e.created_at)} · {e.unit} {e.notes && `· ${e.notes}`}</div></div>
              <div className="font-mono font-semibold text-red-600">-{formatRupiah(e.amount)}</div>
              <button onClick={() => openExpenseForm(e)} className="p-1.5 text-gray-300 hover:text-blue-600" title="Edit"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => deleteExpense(e)} className="p-1.5 text-gray-300 hover:text-red-600" title="Hapus"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div></TabsContent>

        <TabsContent value="debt" className="p-2"><div className="divide-y divide-gray-100">
          {debts.length === 0 ? <div className="text-center py-10 text-gray-400 text-sm">Tidak ada bon</div> : debts.map((d) => {
            const remaining = debtRemaining(d); const isPaid = d.status === "paid" || remaining <= 0;
            return (
              <div key={d.id} className="flex items-center gap-3 py-3 px-2">
                <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{d.customer_name || "Pelanggan"}</div><div className="text-xs text-gray-500 mt-0.5">{formatDate(d.created_at)} · Total {formatRupiah(d.original_total || d.amount)} · DP {formatRupiah(d.initial_paid || 0)} · Pelunasan {formatRupiah(d.paid || 0)} · Sisa {formatRupiah(remaining)}</div></div>
                <div className="text-right shrink-0"><div className={`font-mono font-semibold ${isPaid ? "text-emerald-600" : "text-[#f4a228]"}`}>{isPaid ? "Lunas" : formatRupiah(remaining)}</div>{!isPaid && <div className="flex gap-2 justify-end mt-0.5"><button onClick={() => payDebt(d.id)} className="text-xs text-[#1a6b3c] font-medium hover:underline">Bayar</button><button onClick={() => markPaid(d.id, d.customer_name)} className="text-xs text-emerald-700 font-semibold hover:underline">Lunas</button></div>}</div>
              </div>
            );
          })}
        </div></TabsContent>
      </Tabs>

      <Dialog open={showInc} onOpenChange={(open) => { setShowInc(open); if (!open) setEditingIncome(null); }}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{editingIncome ? "Edit Pemasukan Non-Kasir" : "Catat Pemasukan Non-Kasir"}</DialogTitle></DialogHeader><div className="space-y-3">
        <div><Label>Jumlah (Rp)</Label><Input type="number" value={incForm.amount || ""} onChange={(e) => setIncForm({ ...incForm, amount: e.target.value })} placeholder="0" /></div>
        <div><Label>Tanggal</Label><Input type="date" value={(incForm.date || "").slice(0,10)} onChange={(e) => setIncForm({ ...incForm, date: e.target.value })} /></div>
        <div><Label>Kategori</Label><Select value={incForm.category} onValueChange={(v) => setIncForm({ ...incForm, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{INCOME_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Sumber</Label><Input value={incForm.source} onChange={(e) => setIncForm({ ...incForm, source: e.target.value })} placeholder="Supplier / referensi" /></div>
        <div><Label>Unit Bisnis</Label><Select value={incForm.unit} onValueChange={(v) => setIncForm({ ...incForm, unit: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{unitOptions.map(u => <SelectItem key={u.code} value={u.code}>{u.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Metode</Label><Select value={incForm.payment_method} onValueChange={(v) => setIncForm({ ...incForm, payment_method: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Tunai</SelectItem><SelectItem value="transfer">Transfer</SelectItem><SelectItem value="qris">QRIS/E-Wallet</SelectItem></SelectContent></Select></div>
        <div><Label>Catatan</Label><Input value={incForm.notes} onChange={(e) => setIncForm({ ...incForm, notes: e.target.value })} /></div>
      </div><DialogFooter><Button variant="outline" onClick={() => { setShowInc(false); setEditingIncome(null); }}>Batal</Button><Button onClick={saveIncome} className="bg-emerald-600 hover:bg-emerald-700">{editingIncome ? "Simpan Perubahan" : "Catat Pemasukan"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={show} onOpenChange={(open) => { setShow(open); if (!open) setEditingExpense(null); }}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{editingExpense ? "Edit Pengeluaran" : "Catat Pengeluaran"}</DialogTitle></DialogHeader><div className="space-y-3">
        <div><Label>Jumlah (Rp)</Label><Input type="number" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
        <div><Label>Tanggal</Label><Input type="date" value={(form.date || "").slice(0,10)} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        <div><Label>Kategori</Label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Unit Bisnis</Label><Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{unitOptions.map(u => <SelectItem key={u.code} value={u.code}>{u.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Metode</Label><Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Tunai</SelectItem><SelectItem value="transfer">Transfer</SelectItem><SelectItem value="qris">QRIS/E-Wallet</SelectItem></SelectContent></Select></div>
        <div><Label>Catatan</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </div><DialogFooter><Button variant="outline" onClick={() => { setShow(false); setEditingExpense(null); }}>Batal</Button><Button onClick={save} className="bg-[#1a6b3c] hover:bg-[#14522d]">{editingExpense ? "Simpan Perubahan" : "Simpan"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
