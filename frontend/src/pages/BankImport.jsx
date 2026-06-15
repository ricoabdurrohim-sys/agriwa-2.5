import React, { useEffect, useState } from "react";
import { Upload, Link2, CheckCircle2, AlertCircle, Building2 } from "lucide-react";
import api, { formatRupiah, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// Simple CSV parser - expects header row. Supports columns: date, description, amount (or debit/credit), reference
function parseCSV(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim().replace(/"/g, ""));
  const findCol = (...names) => header.findIndex((h) => names.includes(h));
  const ci = {
    date: findCol("date", "tanggal", "tgl"),
    description: findCol("description", "deskripsi", "keterangan", "note"),
    amount: findCol("amount", "jumlah", "nominal"),
    debit: findCol("debit"),
    credit: findCol("credit", "kredit"),
    reference: findCol("reference", "ref", "no"),
  };
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    let amount = 0;
    if (ci.amount >= 0) amount = parseInt(cells[ci.amount].replace(/[^\d-]/g, "")) || 0;
    else {
      const debit = ci.debit >= 0 ? parseInt(cells[ci.debit].replace(/[^\d]/g, "")) || 0 : 0;
      const credit = ci.credit >= 0 ? parseInt(cells[ci.credit].replace(/[^\d]/g, "")) || 0 : 0;
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

export default function BankImport() {
  const [transactions, setTransactions] = useState([]);
  const [accountName, setAccountName] = useState("BCA");
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);

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
      toast.error("CSV kosong atau format tidak dikenali. Pastikan ada kolom: date, description, amount (atau debit/credit)");
      return;
    }
    setPreview(rows);
    toast.success(`${rows.length} baris terbaca. Tekan Import untuk simpan.`);
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

  const matched = transactions.filter((t) => t.matched);
  const unmatched = transactions.filter((t) => !t.matched);

  return (
    <div className="space-y-4 fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Import Bank & Rekonsiliasi</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upload CSV mutasi rekening untuk pencocokan otomatis</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Nama Akun</Label>
            <Input data-testid="account-name-input" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="BCA Operasional" />
          </div>
          <div>
            <Label>File CSV Mutasi</Label>
            <Input data-testid="csv-file-input" type="file" accept=".csv,.txt" onChange={onFile} />
          </div>
        </div>
        {preview.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-amber-900 mb-2">Preview ({preview.length} baris):</div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {preview.slice(0, 10).map((r, i) => (
                <div key={`${r.date}-${r.amount}-${i}`} className="flex justify-between text-xs">
                  <span>{r.date} · {r.description.slice(0, 30)}</span>
                  <span className={`font-mono font-semibold ${r.amount < 0 ? "text-red-600" : "text-emerald-700"}`}>{r.amount > 0 ? "+" : ""}{formatRupiah(r.amount)}</span>
                </div>
              ))}
              {preview.length > 10 && <div className="text-xs text-gray-500">...dan {preview.length - 10} lainnya</div>}
            </div>
            <Button onClick={doImport} disabled={importing} data-testid="import-btn" className="mt-3 bg-[#1a6b3c] hover:bg-[#14522d]">
              <Upload className="w-4 h-4 mr-1.5" /> {importing ? "Mengimpor..." : "Import Semua"}
            </Button>
          </div>
        )}
        <div className="text-xs text-gray-500">
          Format kolom yang didukung: <code>date, description, amount</code> ATAU <code>date, description, debit, credit</code>. Nilai positif = pemasukan, negatif = pengeluaran.
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-xs uppercase font-semibold text-gray-500 mb-1">Total Transaksi</div>
          <div className="font-mono text-2xl font-bold">{transactions.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-xs uppercase font-semibold text-emerald-600 mb-1">Tercocokkan</div>
          <div className="font-mono text-2xl font-bold text-emerald-600">{matched.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-xs uppercase font-semibold text-amber-600 mb-1">Belum Cocok</div>
          <div className="font-mono text-2xl font-bold text-amber-600">{unmatched.length}</div>
        </div>
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
                    <div className="text-sm">{t.description}</div>
                    <div className="text-xs text-gray-500">{formatDate(t.date)} · {t.account_name}</div>
                  </div>
                  <div className={`font-mono font-semibold ${t.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>{t.amount > 0 ? "+" : ""}{formatRupiah(t.amount)}</div>
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
                    <div className="text-sm">{t.description}</div>
                    <div className="text-xs text-gray-500">{formatDate(t.date)} · {t.match_type || "—"}</div>
                  </div>
                  <div className={`font-mono font-semibold ${t.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>{t.amount > 0 ? "+" : ""}{formatRupiah(t.amount)}</div>
                </div>
              ))}
            </div>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
