import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ArrowUpRight, ArrowDownRight, Wallet, Trash2 } from "lucide-react";
import api, { formatRupiah, formatDate } from "@/lib/api";
import ResetModuleButton from "@/components/ResetModuleButton";
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

export default function Keuangan() {
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [debts, setDebts] = useState([]);
  const [trx, setTrx] = useState([]);
  const [bizUnits, setBizUnits] = useState([]);
  const [show, setShow] = useState(false);
  const [showInc, setShowInc] = useState(false);
  const [form, setForm] = useState({ amount: 0, category: CATEGORIES[0], unit: "warung", notes: "", payment_method: "cash" });
  const [incForm, setIncForm] = useState({ amount: 0, category: INCOME_CATEGORIES[0], unit: "umum", source: "", notes: "", payment_method: "cash" });

  const load = async () => {
    const [e, i, d, t] = await Promise.all([
      api.get("/expenses"),
      api.get("/incomes"),
      api.get("/customer-debts"),
      api.get("/transactions"),
    ]);
    setExpenses(e.data); setIncomes(i.data); setDebts(d.data); setTrx(t.data);
  };
  const loadBizUnits = async () => {
    try {
      const { data } = await api.get("/business-units");
      setBizUnits([{ code: "umum", name: "Umum" }, ...data.filter((u) => u.active !== false).map((u) => ({ code: u.code, name: u.name }))]);
    } catch (err) { /* ignore */ }
  };
  useEffect(() => { load(); loadBizUnits(); }, []);

  useEffect(() => {
    const h = (e) => {
      const k = e.detail?.type;
      if (k === "transaction_created" || k === "transaction_cancelled") load();
      if (k === "bizunit_updated") loadBizUnits();
    };
    window.addEventListener("aw:ws", h);
    return () => window.removeEventListener("aw:ws", h);
  }, []);

  const save = async () => {
    if (!form.amount) return toast.error("Isi jumlah");
    await api.post("/expenses", { ...form, amount: parseInt(form.amount) });
    setForm({ amount: 0, category: CATEGORIES[0], unit: "warung", notes: "", payment_method: "cash" });
    setShow(false); load(); toast.success("Pengeluaran dicatat");
  };

  const saveIncome = async () => {
    if (!incForm.amount || parseInt(incForm.amount) <= 0) return toast.error("Isi jumlah pemasukan");
    try {
      await api.post("/incomes", { ...incForm, amount: parseInt(incForm.amount) });
      setIncForm({ amount: 0, category: INCOME_CATEGORIES[0], unit: "umum", source: "", notes: "", payment_method: "cash" });
      setShowInc(false); load(); toast.success("Pemasukan tercatat di kas");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal mencatat pemasukan");
    }
  };

  const deleteIncome = async (id, cat) => {
    if (!window.confirm(`Hapus pemasukan ${cat}? Saldo kas akan disesuaikan.`)) return;
    await api.delete(`/incomes/${id}`);
    load(); toast.success("Pemasukan dihapus");
  };

  const deleteExpense = async (e) => {
    if (!window.confirm(`Hapus pengeluaran ${e.category} (${formatRupiah(e.amount)})? Saldo kas akan disesuaikan.`)) return;
    try {
      await api.delete(`/expenses/${e.id}`);
      load(); toast.success("Pengeluaran dihapus");
    } catch (err) { toast.error(err?.response?.data?.detail || "Gagal hapus"); }
  };

  // "Bayar" → navigate ke Kasir dengan bon ID untuk proses pelunasan + cetak nota
  const payDebt = (id) => {
    navigate(`/kasir?bon=${id}`);
  };

  const markPaid = async (id, customer) => {
    if (!window.confirm(`Tandai bon ${customer} sebagai LUNAS sepenuhnya?\n\nDana akan otomatis tercatat sebagai pemasukan kas.`)) return;
    await api.post(`/customer-debts/${id}/mark-paid`);
    load(); toast.success("Bon lunas — dana tercatat di kas");
  };

  const totalDebt = debts.filter(d => d.status !== "paid").reduce((s, d) => s + (d.amount - (d.paid || 0)), 0);
  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
  const validTrx = trx.filter((t) => !t.cancelled && !t.is_bon);
  const totalKasir = validTrx.reduce((s, t) => s + (t.total || 0), 0);
  const totalNet = totalKasir + totalIncome - totalExpense;

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Keuangan</h1>
          <p className="text-sm text-gray-500 mt-0.5">Pemasukan, Pengeluaran & Piutang</p>
        </div>
        <div className="flex gap-2">
          <ResetModuleButton module="keuangan" label="Keuangan" />
          <Button data-testid="add-income-btn" onClick={() => setShowInc(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <ArrowUpRight className="w-4 h-4 mr-1.5" /> Pemasukan
          </Button>
          <Button data-testid="add-expense-btn" onClick={() => setShow(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]">
            <Plus className="w-4 h-4 mr-1.5" /> Pengeluaran
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-xs uppercase font-semibold text-gray-500 tracking-wider mb-1">
            <Wallet className="w-4 h-4 text-[#1a6b3c]" /> Pemasukan Kasir
          </div>
          <div className="font-mono text-2xl font-bold text-[#1a6b3c]" data-testid="total-kasir">{formatRupiah(totalKasir)}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">{validTrx.length} transaksi (non-bon, non-batal)</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-xs uppercase font-semibold text-gray-500 tracking-wider mb-1">
            <ArrowUpRight className="w-4 h-4 text-emerald-600" /> Pemasukan Non-Kasir
          </div>
          <div className="font-mono text-2xl font-bold text-emerald-600" data-testid="total-income">{formatRupiah(totalIncome)}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">{incomes.length} entri</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-xs uppercase font-semibold text-gray-500 tracking-wider mb-1">
            <ArrowDownRight className="w-4 h-4 text-red-600" /> Total Pengeluaran
          </div>
          <div className="font-mono text-2xl font-bold text-red-600">{formatRupiah(totalExpense)}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">{expenses.length} entri</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-xs uppercase font-semibold text-gray-500 tracking-wider mb-1">
            <Wallet className="w-4 h-4 text-[#f4a228]" /> Piutang Bon Belum Tertagih
          </div>
          <div className="font-mono text-2xl font-bold text-[#f4a228]">{formatRupiah(totalDebt)}</div>
        </div>
      </div>

      <Tabs defaultValue="kasir" className="bg-white rounded-xl border border-gray-100">
        <TabsList className="m-1 bg-gray-50">
          <TabsTrigger value="kasir" data-testid="tab-kasir">Penjualan Kasir</TabsTrigger>
          <TabsTrigger value="inc" data-testid="tab-incomes">Pemasukan</TabsTrigger>
          <TabsTrigger value="exp" data-testid="tab-expenses">Pengeluaran</TabsTrigger>
          <TabsTrigger value="debt" data-testid="tab-debts">Bon Pelanggan</TabsTrigger>
        </TabsList>
        <TabsContent value="kasir" className="p-2">
          <div className="divide-y divide-gray-100">
            {trx.length === 0 ? <div className="text-center py-10 text-gray-400 text-sm">Belum ada transaksi kasir</div> :
              trx.slice(0, 50).map((t) => {
                const pm = (t.payment_method || "cash").toLowerCase();
                const isBank = ["transfer", "bank", "bca", "mandiri", "bri", "bni", "debit"].includes(pm);
                const isEw = ["qris", "qr", "gopay", "ovo", "dana", "shopeepay", "ewallet"].includes(pm);
                const tag = isBank ? "bg-blue-100 text-blue-700 border-blue-200" : isEw ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-emerald-100 text-emerald-700 border-emerald-200";
                const dot = isBank ? "bg-blue-500" : isEw ? "bg-orange-500" : "bg-emerald-500";
                const label = isBank ? "TRANSFER" : isEw ? "QRIS" : "TUNAI";
                return (
                  <div key={t.id} data-testid={`kasir-row-${t.id}`} className="flex items-center gap-3 py-3 px-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${dot} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{t.trx_no}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${tag}`}>{label}</span>
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
        <TabsContent value="inc" className="p-2">
          <div className="divide-y divide-gray-100">
            {incomes.length === 0 ? <div className="text-center py-10 text-gray-400 text-sm">Belum ada pemasukan non-kasir</div> :
              incomes.map((i) => (
                <div key={i.id} data-testid={`income-row-${i.id}`} className="flex items-center gap-3 py-3 px-2">
                  <div className="p-2 bg-emerald-50 rounded-lg shrink-0"><ArrowUpRight className="w-4 h-4 text-emerald-600" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{i.category}{i.source && <span className="text-gray-500"> · {i.source}</span>}</div>
                    <div className="text-xs text-gray-500">{formatDate(i.date)} · {i.unit}{i.notes && ` · ${i.notes}`}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-semibold text-emerald-600">+{formatRupiah(i.amount)}</div>
                    <button data-testid={`delete-income-${i.id}`} onClick={() => deleteIncome(i.id, i.category)} className="text-[10px] text-red-500 hover:underline">Hapus</button>
                  </div>
                </div>
              ))}
          </div>
        </TabsContent>
        <TabsContent value="exp" className="p-2">
          <div className="divide-y divide-gray-100">
            {expenses.length === 0 ? <div className="text-center py-10 text-gray-400 text-sm">Belum ada pengeluaran</div> :
              expenses.map((e) => (
                <div key={e.id} className="flex items-center gap-3 py-3 px-2">
                  <div className="p-2 bg-red-50 rounded-lg"><ArrowDownRight className="w-4 h-4 text-red-600" /></div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{e.category}</div>
                    <div className="text-xs text-gray-500">{formatDate(e.date)} · {e.unit} {e.notes && `· ${e.notes}`}</div>
                  </div>
                  <div className="font-mono font-semibold text-red-600">-{formatRupiah(e.amount)}</div>
                  <button onClick={() => deleteExpense(e)} data-testid={`delete-expense-${e.id}`} className="p-1.5 text-gray-300 hover:text-red-600" title="Hapus">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
          </div>
        </TabsContent>
        <TabsContent value="debt" className="p-2">
          <div className="divide-y divide-gray-100">
            {debts.length === 0 ? <div className="text-center py-10 text-gray-400 text-sm">Tidak ada bon</div> :
              debts.map((d) => {
                const remaining = d.amount - (d.paid || 0);
                const isPaid = d.status === "paid";
                const statusColor = isPaid ? "bg-emerald-100 text-emerald-700 border-emerald-200" : d.status === "partial" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-red-100 text-red-700 border-red-200";
                const statusLabel = isPaid ? "LUNAS" : d.status === "partial" ? "SEBAGIAN" : "BELUM BAYAR";
                return (
                  <div key={d.id} data-testid={`debt-row-${d.id}`} className="flex items-center gap-3 py-3 px-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{d.customer_name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span>{formatDate(d.created_at)}</span>
                        <span>·</span>
                        <span>Total {formatRupiah(d.amount)}</span>
                        {d.paid > 0 && <><span>·</span><span>Dibayar {formatRupiah(d.paid)}</span></>}
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${statusColor}`}>{statusLabel}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`font-mono font-semibold ${isPaid ? "text-emerald-600 line-through opacity-60" : "text-[#f4a228]"}`}>{formatRupiah(remaining)}</div>
                      {!isPaid && (
                        <div className="flex gap-2 justify-end mt-0.5">
                          <button data-testid={`pay-debt-${d.id}`} onClick={() => payDebt(d.id)} className="text-xs text-[#1a6b3c] font-medium hover:underline">Bayar</button>
                          <button data-testid={`lunas-debt-${d.id}`} onClick={() => markPaid(d.id, d.customer_name)} className="text-xs text-emerald-700 font-semibold hover:underline">Lunas</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showInc} onOpenChange={setShowInc}>
        <DialogContent>
          <DialogHeader><DialogTitle>Catat Pemasukan Non-Kasir</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Jumlah (Rp)</Label>
              <Input data-testid="income-amount-input" type="number" value={incForm.amount || ""}
                onChange={(e) => setIncForm({ ...incForm, amount: e.target.value })} placeholder="0" />
            </div>
            <div>
              <Label>Kategori</Label>
              <Select value={incForm.category} onValueChange={(v) => setIncForm({ ...incForm, category: v })}>
                <SelectTrigger data-testid="income-category"><SelectValue /></SelectTrigger>
                <SelectContent>{INCOME_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sumber (nama supplier / referensi)</Label>
              <Input data-testid="income-source-input" value={incForm.source}
                onChange={(e) => setIncForm({ ...incForm, source: e.target.value })} placeholder="Contoh: PT Cipta Subur, KPP Pratama, dll" />
            </div>
            <div>
              <Label>Unit Bisnis</Label>
              <Select value={incForm.unit} onValueChange={(v) => setIncForm({ ...incForm, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(bizUnits.length ? bizUnits : FALLBACK_UNITS.map(c => ({code:c,name:c}))).map(u => <SelectItem key={u.code} value={u.code}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Metode Pembayaran</Label>
              <Select value={incForm.payment_method} onValueChange={(v) => setIncForm({ ...incForm, payment_method: v })}>
                <SelectTrigger data-testid="income-payment-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">💵 Tunai</SelectItem>
                  <SelectItem value="transfer">🏦 Transfer Bank</SelectItem>
                  <SelectItem value="qris">📱 QRIS / E-Wallet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Catatan</Label>
              <Input data-testid="income-notes-input" value={incForm.notes} onChange={(e) => setIncForm({ ...incForm, notes: e.target.value })} />
            </div>
            <div className="text-[11px] text-gray-500 bg-emerald-50 rounded-lg p-2 border border-emerald-100">
              Dana akan otomatis dicatat di Kas dan masuk ke laporan Laba/Rugi sebagai "Pendapatan Lain".
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInc(false)}>Batal</Button>
            <Button onClick={saveIncome} data-testid="save-income-btn" className="bg-emerald-600 hover:bg-emerald-700">
              <ArrowUpRight className="w-4 h-4 mr-1" /> Catat Pemasukan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent>
          <DialogHeader><DialogTitle>Catat Pengeluaran</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Jumlah (Rp)</Label><Input data-testid="expense-amount-input" type="number" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div>
              <Label>Kategori</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger data-testid="expense-category"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unit Bisnis</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(bizUnits.length ? bizUnits : FALLBACK_UNITS.map(c => ({code:c,name:c}))).map(u => <SelectItem key={u.code} value={u.code}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Metode Pembayaran</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                <SelectTrigger data-testid="expense-payment-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">💵 Tunai</SelectItem>
                  <SelectItem value="transfer">🏦 Transfer Bank</SelectItem>
                  <SelectItem value="qris">📱 QRIS / E-Wallet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Catatan</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShow(false)}>Batal</Button>
            <Button onClick={save} data-testid="save-expense-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
