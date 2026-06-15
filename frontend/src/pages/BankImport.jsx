import React, { useEffect, useState } from "react";
import { Upload, CheckCircle2, AlertCircle, Info, Search, Link2 } from "lucide-react";
import api, { formatRupiah, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

function parseMoney(v) {
  if (!v) return 0;
  const raw = String(v).replace(/\./g, "").replace(/,/g, ".").replace(/[^\d.-]/g, "");
  return Math.round(Number(raw || 0));
}

// Parser CSV ringan. Format didukung: date,description,amount atau date,description,debit,credit.
function parseCSV(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const split = (line) => line.match(/("[^"]*"|[^,]+)/g)?.map((c) => c.trim().replace(/^"|"$/g, "")) || [];
  const header = split(lines[0]).map((h) => h.toLowerCase().trim());
  const findCol = (...names) => header.findIndex((h) => names.includes(h));
  const ci = {
    date: findCol("date", "tanggal", "tgl", "transaction date"),
    description: findCol("description", "deskripsi", "keterangan", "note", "uraian"),
    amount: findCol("amount", "jumlah", "nominal", "mutasi"),
    debit: findCol("debit", "debet"),
    credit: findCol("credit", "kredit"),
    reference: findCol("reference", "ref", "no", "nomor", "id transaksi"),
  };
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = split(lines[i]);
    let amount = 0;
    if (ci.amount >= 0) amount = parseMoney(cells[ci.amount]);
    else {
      const debit = ci.debit >= 0 ? parseMoney(cells[ci.debit]) : 0;
      const credit = ci.credit >= 0 ? parseMoney(cells[ci.credit]) : 0;
      amount = credit - debit;
    }
    rows.push({
      date: ci.date >= 0 ? cells[ci.date] : "",
      description: ci.description >= 0 ? cells[ci.description] : "",
      amount,
      reference: ci.reference >= 0 ? cells[ci.reference] : "",
    });
  }
  return rows.filter((r) => r.date && r.amount !== 0);
}

function Hint({ text }) {
  return <span title={text} className="inline-flex items-center text-gray-400 hover:text-gray-700 cursor-help"><Info className="w-3.5 h-3.5" /></span>;
}

const matchLabel = (m) => ({
  transaction: "Penjualan Kasir",
  transaction_initial: "DP Bon",
  debt_payment: "Pelunasan Bon",
  income: "Pemasukan Non-Kasir",
  expense: "Pengeluaran",
  manual: "Manual",
}[m] || m || "—");

export default function BankImport() {
  const [transactions, setTransactions] = useState([]);
  const [accountName, setAccountName] = useState("BCA Operasional");
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [candidateTarget, setCandidateTarget] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [manualType, setManualType] = useState("manual");

  const load = async () => {
    const { data } = await api.get("/bank/transactions");
    setTransactions(data);
  };
  useEffect(() => { load(); }, []);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) {
      toast.error("CSV kosong atau format tidak dikenali. Pastikan ada kolom: date, description, amount atau debit/credit");
      return;
    }
    setPreview(rows);
    toast.success(`${rows.length} baris terbaca. Cek preview lalu klik Import.`);
  };

  const doImport = async () => {
    if (preview.length === 0) return;
    setImporting(true);
    try {
      const { data } = await api.post("/bank/import", { account_name: accountName, rows: preview });
      toast.success(`${data.imported} diimpor (${data.matched} cocok otomatis, ${data.unmatched} perlu rekonsiliasi)`);
      setPreview([]); load();
    } catch (e) { toast.error("Gagal import"); } finally { setImporting(false); }
  };

  const openCandidates = async (row) => {
    setCandidateTarget(row);
    setCandidates([]);
    try {
      const { data } = await api.get(`/bank/transactions/${row.id}/candidates`);
      setCandidates(data || []);
    } catch { setCandidates([]); }
  };

  const reconcile = async (match_type, match_id = "") => {
    if (!candidateTarget) return;
    try {
      await api.put(`/bank/transactions/${candidateTarget.id}/reconcile`, { match_type, match_id });
      toast.success("Mutasi sudah direkonsiliasi");
      setCandidateTarget(null); setCandidates([]); load();
    } catch { toast.error("Gagal rekonsiliasi"); }
  };

  const matched = transactions.filter((t) => t.matched);
  const unmatched = transactions.filter((t) => !t.matched);
  const totalIn = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div className="space-y-4 fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Import Bank & Rekonsiliasi</h1>
        <p className="text-sm text-gray-500 mt-0.5">Cocokkan mutasi bank/e-wallet dengan penjualan kasir, DP bon, pelunasan bon, pemasukan, dan pengeluaran.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="inline-flex items-center gap-1">Nama Akun <Hint text="Nama rekening/dompet digital, misalnya BCA Operasional, Mandiri, QRIS, DANA. Ini hanya label agar mutasi mudah dilacak." /></Label>
            <Input data-testid="account-name-input" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="BCA Operasional" />
          </div>
          <div>
            <Label className="inline-flex items-center gap-1">File CSV Mutasi <Hint text="Export mutasi dari bank/e-wallet ke CSV. Kolom minimal: tanggal, keterangan, nominal. Jika ada debit dan credit terpisah juga bisa." /></Label>
            <Input data-testid="csv-file-input" type="file" accept=".csv,.txt" onChange={onFile} />
          </div>
        </div>
        {preview.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-amber-900 mb-2">Preview ({preview.length} baris):</div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {preview.slice(0, 12).map((r, i) => (
                <div key={`${r.date}-${r.amount}-${i}`} className="flex justify-between gap-2 text-xs">
                  <span className="truncate">{r.date} · {r.description}</span>
                  <span className={`font-mono font-semibold ${r.amount < 0 ? "text-red-600" : "text-emerald-700"}`}>{r.amount > 0 ? "+" : ""}{formatRupiah(r.amount)}</span>
                </div>
              ))}
              {preview.length > 12 && <div className="text-xs text-gray-500">...dan {preview.length - 12} lainnya</div>}
            </div>
            <Button onClick={doImport} disabled={importing} data-testid="import-btn" className="mt-3 bg-[#1a6b3c] hover:bg-[#14522d]">
              <Upload className="w-4 h-4 mr-1.5" /> {importing ? "Mengimpor..." : "Import Semua"}
            </Button>
          </div>
        )}
        <div className="text-xs text-gray-500 leading-relaxed">
          <b>Cara pakai:</b> import mutasi, sistem akan mencocokkan otomatis berdasarkan tanggal + nominal. Untuk bon, sistem bisa mencocokkan DP awal dan pelunasan bon sebagai mutasi terpisah. Baris yang belum cocok bisa diklik <b>Cari Cocokan</b>.
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        <Stat label="Total Mutasi" value={transactions.length} />
        <Stat label="Tercocokkan" value={matched.length} tone="emerald" />
        <Stat label="Belum Cocok" value={unmatched.length} tone="amber" />
        <Stat label="Saldo Bersih CSV" value={formatRupiah(totalIn - totalOut)} tone={(totalIn - totalOut) >= 0 ? "emerald" : "red"} />
      </div>

      <Tabs defaultValue="unmatched" className="bg-white rounded-xl border border-gray-100">
        <TabsList className="bg-gray-50 m-1">
          <TabsTrigger value="unmatched">Belum Cocok ({unmatched.length})</TabsTrigger>
          <TabsTrigger value="matched">Cocok ({matched.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="unmatched" className="p-2">
          {unmatched.length === 0 ? <div className="py-10 text-center text-gray-400 text-sm">Semua sudah cocok 🎉</div> :
            <div className="divide-y divide-gray-100">
              {unmatched.map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-3 px-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{t.description}</div>
                    <div className="text-xs text-gray-500">{formatDate(t.date)} · {t.account_name}{t.candidate_count ? ` · ${t.candidate_count} kandidat` : ""}</div>
                  </div>
                  <div className={`font-mono font-semibold ${t.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>{t.amount > 0 ? "+" : ""}{formatRupiah(t.amount)}</div>
                  <Button size="sm" variant="outline" onClick={() => openCandidates(t)}><Search className="w-3.5 h-3.5 mr-1"/>Cari Cocokan</Button>
                </div>
              ))}
            </div>}
        </TabsContent>
        <TabsContent value="matched" className="p-2">
          {matched.length === 0 ? <div className="py-10 text-center text-gray-400 text-sm">Belum ada yang cocok</div> :
            <div className="divide-y divide-gray-100">
              {matched.map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-3 px-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{t.description}</div>
                    <div className="text-xs text-gray-500">{formatDate(t.date)} · {matchLabel(t.match_type)}</div>
                  </div>
                  <Badge variant="outline" className="hidden sm:inline-flex"><Link2 className="w-3 h-3 mr-1" />{matchLabel(t.match_type)}</Badge>
                  <div className={`font-mono font-semibold ${t.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>{t.amount > 0 ? "+" : ""}{formatRupiah(t.amount)}</div>
                </div>
              ))}
            </div>}
        </TabsContent>
      </Tabs>

      <Dialog open={!!candidateTarget} onOpenChange={(v) => !v && setCandidateTarget(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Rekonsiliasi Mutasi</DialogTitle></DialogHeader>
          {candidateTarget && <div className="bg-gray-50 rounded-lg border p-3 text-sm">
            <div className="font-medium">{candidateTarget.description}</div>
            <div className="text-xs text-gray-500">{formatDate(candidateTarget.date)} · {candidateTarget.account_name}</div>
            <div className={`font-mono font-bold mt-1 ${candidateTarget.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>{candidateTarget.amount > 0 ? "+" : ""}{formatRupiah(candidateTarget.amount)}</div>
          </div>}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase">Kandidat Otomatis</div>
            {candidates.length === 0 ? <div className="text-sm text-gray-400 py-4 text-center border rounded-lg">Tidak ada kandidat otomatis. Pilih rekonsiliasi manual di bawah.</div> : candidates.map((c, idx) => (
              <button key={`${c.match_type}-${c.match_id}-${idx}`} onClick={() => reconcile(c.match_type, c.match_id)} className="w-full text-left border rounded-lg p-3 hover:bg-emerald-50 hover:border-emerald-200 transition-colors">
                <div className="flex justify-between gap-2"><b className="text-sm">{c.title || matchLabel(c.match_type)}</b><span className="font-mono text-sm">{formatRupiah(Math.abs(c.amount))}</span></div>
                <div className="text-xs text-gray-500 mt-0.5">{matchLabel(c.match_type)} · {formatDate(c.date)} · {c.description}</div>
              </button>
            ))}
          </div>
          <div className="border rounded-lg p-3 space-y-2">
            <Label>Rekonsiliasi Manual</Label>
            <Select value={manualType} onValueChange={setManualType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual / belum ada dokumen</SelectItem>
                <SelectItem value="income">Pemasukan non-kasir</SelectItem>
                <SelectItem value="expense">Pengeluaran</SelectItem>
                <SelectItem value="payment_gateway">QRIS / payment gateway</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => reconcile(manualType, "")}>Tandai Cocok Manual</Button>
          </div>
          <DialogFooter><Button onClick={() => setCandidateTarget(null)}>Tutup</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tone }) {
  const color = tone === "emerald" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : tone === "red" ? "text-red-600" : "text-gray-900";
  return <div className="bg-white rounded-xl border border-gray-100 p-4"><div className="text-xs uppercase font-semibold text-gray-500 mb-1">{label}</div><div className={`font-mono text-2xl font-bold ${color}`}>{value}</div></div>;
}
