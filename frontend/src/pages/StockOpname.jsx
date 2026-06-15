import React, { useEffect, useState } from "react";
import { ClipboardCheck, Plus, Save, CheckCircle2, AlertTriangle, FileSpreadsheet, Info, Search } from "lucide-react";
import api, { formatRupiah, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const CATEGORIES = ["", "Bahan Baku Warung", "Bahan Baku Pupuk", "Bahan Baku Kebun", "Bibit Anggur", "Buah Anggur", "Barang Jadi", "Peralatan & Perlengkapan"];

export default function StockOpname() {
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [counts, setCounts] = useState({});
  const [q, setQ] = useState("");
  const [onlyDiff, setOnlyDiff] = useState(false);

  const load = async () => {
    const { data } = await api.get("/opname/sessions");
    setSessions(data);
  };
  useEffect(() => { load(); }, []);

  const openSession = async (id) => {
    const { data } = await api.get(`/opname/sessions/${id}`);
    setActive(data);
    const initial = {};
    data.items.forEach((it) => { if (it.physical_qty !== null) initial[it.item_id] = it.physical_qty; });
    setCounts(initial);
  };

  const startNew = async () => {
    if (!name) return toast.error("Beri nama sesi");
    try {
      const { data } = await api.post("/opname/sessions", { name, category: category || null });
      setShow(false); setName(""); setCategory("");
      load();
      openSession(data.id);
      toast.success("Sesi opname dimulai");
    } catch (e) { toast.error("Gagal"); }
  };

  const saveCounts = async () => {
    try {
      await api.put(`/opname/sessions/${active.id}/counts`, { counts });
      openSession(active.id);
      toast.success("Hitungan disimpan");
    } catch (e) { toast.error("Gagal"); }
  };

  const finalize = async () => {
    if (!window.confirm("Finalisasi opname? Stok akan disesuaikan permanen.")) return;
    try {
      const { data } = await api.post(`/opname/sessions/${active.id}/finalize`);
      toast.success(`Opname final. Selisih nilai: ${formatRupiah(data.variance_value)}`);
      setActive(null); load();
    } catch (e) { toast.error("Gagal"); }
  };

  const downloadCountSheet = () => {
    if (!active) return;
    const lines = [`Sesi Opname: ${active.name}`, `Kategori: ${active.category}`, ``, `Item,Satuan,Stok Sistem,Hitung Fisik,Selisih`];
    active.items.forEach((it) => {
      const diff = (counts[it.item_id] ?? it.physical_qty ?? "") !== "" ? ((counts[it.item_id] ?? it.physical_qty ?? 0) - it.system_qty) : "";
      lines.push(`"${it.name}",${it.unit},${it.system_qty},${counts[it.item_id] ?? it.physical_qty ?? ""},${diff}`);
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `opname_${active.name}.csv`;
    a.click();
  };

  const fillMissingWithSystem = () => {
    if (!active) return;
    const next = { ...counts };
    active.items.forEach((it) => { if (next[it.item_id] === undefined || next[it.item_id] === "") next[it.item_id] = it.system_qty; });
    setCounts(next);
    toast.info("Item kosong diisi dengan stok sistem. Tetap klik Simpan/Finalisasi untuk menerapkan.");
  };

  const clearEmptyToZero = () => {
    if (!active || !window.confirm("Isi item yang belum dihitung menjadi 0? Ini hanya draft sampai Anda klik Simpan/Finalisasi.")) return;
    const next = { ...counts };
    active.items.forEach((it) => { if (next[it.item_id] === undefined || next[it.item_id] === "") next[it.item_id] = 0; });
    setCounts(next);
  };

  if (active) {
    const isDraft = active.status === "draft";
    const filteredItems = active.items.filter((it) => {
      const physical = counts[it.item_id] ?? it.physical_qty ?? "";
      const diff = physical !== "" ? Number(physical) - it.system_qty : null;
      const matches = !q || it.name.toLowerCase().includes(q.toLowerCase());
      return matches && (!onlyDiff || (diff !== null && diff !== 0));
    });
    const countedCount = active.items.filter((it) => (counts[it.item_id] ?? it.physical_qty ?? "") !== "").length;
    const varianceValue = active.items.reduce((sum, it) => {
      const physical = counts[it.item_id] ?? it.physical_qty ?? "";
      if (physical === "") return sum;
      return sum + ((Number(physical) - it.system_qty) * (it.cost_price || 0));
    }, 0);
    return (
      <div className="space-y-4 fade-in">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <button onClick={() => { setActive(null); load(); }} className="text-xs text-[#1a6b3c] font-medium mb-1">← Kembali ke daftar</button>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>{active.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{active.category} · {active.items.length} item · <Badge className={active.status === "finalized" ? "bg-emerald-100 text-emerald-700" : ""}>{active.status}</Badge></p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadCountSheet} data-testid="download-sheet-btn"><FileSpreadsheet className="w-4 h-4 mr-1.5" /> CSV</Button>
            {isDraft && <>
              <Button onClick={saveCounts} data-testid="save-counts-btn" variant="outline"><Save className="w-4 h-4 mr-1.5" /> Simpan</Button>
              <Button onClick={finalize} data-testid="finalize-btn" className="bg-[#f4a228] hover:bg-[#d98b1a]"><CheckCircle2 className="w-4 h-4 mr-1.5" /> Finalisasi</Button>
            </>}
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="bg-white border border-gray-100 rounded-xl p-3"><div className="text-xs text-gray-500 uppercase font-semibold">Progress Hitung</div><div className="text-xl font-bold text-[#1a6b3c]">{countedCount}/{active.items.length}</div></div>
          <div className="bg-white border border-gray-100 rounded-xl p-3"><div className="text-xs text-gray-500 uppercase font-semibold">Estimasi Selisih Nilai</div><div className={`text-xl font-bold ${varianceValue < 0 ? "text-red-600" : "text-emerald-700"}`}>{formatRupiah(varianceValue)}</div></div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800 flex gap-2"><Info className="w-4 h-4 shrink-0 mt-0.5" /> Opname mengikuti konsep ERP: hitung fisik dulu, simpan draft, baru finalisasi untuk membuat stock movement penyesuaian.</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-3 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><Input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Cari item opname" className="pl-9" /></div>
          <Button variant="outline" onClick={() => setOnlyDiff(v => !v)}>{onlyDiff ? "Tampilkan Semua" : "Hanya Selisih"}</Button>
          {isDraft && <Button variant="outline" onClick={fillMissingWithSystem}>Isi Kosong = Sistem</Button>}
          {isDraft && <Button variant="outline" onClick={clearEmptyToZero}>Kosong = 0</Button>}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-right">Stok Sistem</th>
                <th className="px-3 py-2 text-right">Hitung Fisik</th>
                <th className="px-3 py-2 text-right">Selisih</th>
                <th className="px-3 py-2 text-right">Nilai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredItems.map((it) => {
                const physical = counts[it.item_id] ?? it.physical_qty ?? "";
                const diff = physical !== "" ? Number(physical) - it.system_qty : null;
                return (
                  <tr key={it.item_id} data-testid={`opname-row-${it.item_id}`}>
                    <td className="px-3 py-2">{it.name} <span className="text-xs text-gray-400">({it.unit})</span></td>
                    <td className="px-3 py-2 text-right font-mono">{it.system_qty}</td>
                    <td className="px-3 py-2 text-right">
                      {isDraft ? (
                        <Input type="number" step="any" className="w-24 ml-auto font-mono text-right h-8"
                          value={counts[it.item_id] ?? ""}
                          onChange={(e) => setCounts({ ...counts, [it.item_id]: e.target.value === "" ? "" : parseFloat(e.target.value) })} />
                      ) : <span className="font-mono">{it.physical_qty ?? "—"}</span>}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${diff && diff < 0 ? "text-red-600" : (diff && diff > 0 ? "text-emerald-600" : "")}`}>
                      {diff === null ? "—" : (diff > 0 ? "+" : "") + diff}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${diff && diff < 0 ? "text-red-600" : ""}`}>
                      {diff === null ? "—" : formatRupiah((diff || 0) * (it.cost_price || 0))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Stock Opname</h1>
          <p className="text-sm text-gray-500 mt-0.5">Hitung fisik vs sistem dengan laporan selisih</p>
        </div>
        <Button data-testid="start-opname-btn" onClick={() => setShow(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]">
          <Plus className="w-4 h-4 mr-1.5" /> Sesi Baru
        </Button>
      </div>

      <div className="bg-blue-50 border border-blue-100 text-blue-800 rounded-xl p-3 text-xs flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>Gunakan stock opname untuk mencocokkan stok sistem dengan hitungan fisik gudang. Selisih akan otomatis masuk kartu stok saat sesi difinalisasi.</div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100">
        {sessions.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">Belum ada sesi opname</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {sessions.map((s) => (
              <button key={s.id} onClick={() => openSession(s.id)} data-testid={`opname-session-${s.id}`}
                className="flex items-center gap-3 py-3 px-4 w-full text-left hover:bg-gray-50">
                <div className="p-2 bg-indigo-50 rounded-lg"><ClipboardCheck className="w-4 h-4 text-indigo-700" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{s.name}</div>
                  <div className="text-xs text-gray-500">{s.category} · {s.items.length} item · {formatDate(s.created_at)}</div>
                </div>
                <Badge className={s.status === "finalized" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>{s.status}</Badge>
                {s.variance_value !== undefined && (
                  <div className={`text-sm font-mono font-semibold ${s.variance_value < 0 ? "text-red-600" : "text-emerald-600"}`}>{formatRupiah(s.variance_value)}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mulai Opname Baru</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nama Sesi</Label><Input data-testid="opname-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Opname Akhir Bulan Juni" /></div>
            <div>
              <Label>Kategori (kosong = semua)</Label>
              <Select value={category || "all"} onValueChange={(v) => setCategory(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Semua kategori" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua kategori</SelectItem>
                  {CATEGORIES.filter(c => c).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShow(false)}>Batal</Button>
            <Button onClick={() => { startNew(); }} data-testid="confirm-opname-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Mulai</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
