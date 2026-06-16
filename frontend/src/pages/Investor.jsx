import React, { useEffect, useState } from "react";
import { Plus, HandCoins, TrendingUp, Users, Briefcase, Pencil, Trash2, Calculator, RefreshCcw } from "lucide-react";
import api, { formatRupiah, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { toast } from "sonner";

const COLORS = ["#1a6b3c", "#f4a228", "#6b46c1", "#2563eb", "#dc2626", "#0891b2"];

const todayInput = () => new Date().toISOString().slice(0, 10);
const toInputDate = (v) => {
  if (!v) return todayInput();
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : todayInput();
};

export default function Investor() {
  const [investors, setInvestors] = useState([]);
  const [injections, setInjections] = useState([]);
  const [dividends, setDividends] = useState([]);
  const [allocations, setAllocations] = useState({});
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);

  const [showInvForm, setShowInvForm] = useState(false);
  const [showCapForm, setShowCapForm] = useState(false);
  const [editingInvestor, setEditingInvestor] = useState(null);
  const [editingCapital, setEditingCapital] = useState(null);

  const [invForm, setInvForm] = useState({ name: "", phone: "", address: "", notes: "" });
  const [capForm, setCapForm] = useState({ investor_id: "", amount: 0, unit: "umum", notes: "", date: todayInput() });

  const [divPreview, setDivPreview] = useState(null);
  const [divProfit, setDivProfit] = useState(0);
  const [divUnit, setDivUnit] = useState("all");
  const [divDate, setDivDate] = useState(todayInput());
  const [divMethod, setDivMethod] = useState("cash");
  const [divNotes, setDivNotes] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [a, b, d, al, u] = await Promise.all([
        api.get("/investors"),
        api.get("/capital-injections"),
        api.get("/dividends"),
        api.get("/investors/allocations"),
        api.get("/business-units"),
      ]);
      setInvestors(a.data || []);
      setInjections(aSort(b.data || [], "date", true));
      setDividends(aSort(d.data || [], "date", true));
      setAllocations(al.data || {});
      setUnits(u.data || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal memuat data investor");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const aSort = (rows, key, desc = false) => [...rows].sort((a, b) => {
    const av = String(a?.[key] || a?.created_at || "");
    const bv = String(b?.[key] || b?.created_at || "");
    return desc ? bv.localeCompare(av) : av.localeCompare(bv);
  });

  const unitLabel = (code) => {
    if (code === "all") return "Semua Unit";
    if (code === "umum") return "Umum / Lintas Unit";
    return units.find((u) => u.code === code)?.name || code || "Umum";
  };

  const investorName = (id) => investors.find((i) => i.id === id)?.name || "—";

  const openInvestorForm = (investor = null) => {
    setEditingInvestor(investor);
    setInvForm(investor
      ? { name: investor.name || "", phone: investor.phone || "", address: investor.address || "", notes: investor.notes || "" }
      : { name: "", phone: "", address: "", notes: "" }
    );
    setShowInvForm(true);
  };

  const saveInvestor = async () => {
    if (!invForm.name?.trim()) return toast.error("Nama wajib diisi");
    try {
      if (editingInvestor?.id) {
        await api.put(`/investors/${editingInvestor.id}`, invForm);
        toast.success("Investor diperbarui");
      } else {
        await api.post("/investors", invForm);
        toast.success("Investor ditambahkan");
      }
      setShowInvForm(false);
      setEditingInvestor(null);
      setInvForm({ name: "", phone: "", address: "", notes: "" });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal menyimpan investor");
    }
  };

  const deleteInvestor = async (investor) => {
    if (!window.confirm(`Hapus investor ${investor.name}?\n\nSelama belum ada dividen aktif, setoran modal milik investor ini juga akan dibersihkan.`)) return;
    try {
      await api.delete(`/investors/${investor.id}`);
      toast.success("Investor dihapus");
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal menghapus investor");
    }
  };

  const openCapitalForm = (capital = null) => {
    setEditingCapital(capital);
    setCapForm(capital
      ? {
          investor_id: capital.investor_id || "",
          amount: capital.amount || 0,
          unit: capital.unit || "umum",
          notes: capital.notes || "",
          date: toInputDate(capital.date),
        }
      : { investor_id: "", amount: 0, unit: "umum", notes: "", date: todayInput() }
    );
    setShowCapForm(true);
  };

  const saveCapital = async () => {
    if (!capForm.investor_id || !capForm.amount || parseInt(capForm.amount) <= 0) return toast.error("Lengkapi investor dan jumlah modal");
    const payload = { ...capForm, amount: parseInt(capForm.amount) };
    try {
      if (editingCapital?.id) {
        await api.put(`/capital-injections/${editingCapital.id}`, payload);
        toast.success("Setoran/alokasi modal diperbarui");
      } else {
        await api.post("/capital-injections", payload);
        toast.success("Setoran modal dicatat");
      }
      setShowCapForm(false);
      setEditingCapital(null);
      setCapForm({ investor_id: "", amount: 0, unit: "umum", notes: "", date: todayInput() });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal menyimpan modal");
    }
  };

  const deleteCapital = async (capital) => {
    if (!window.confirm(`Hapus setoran modal ${investorName(capital.investor_id)} sebesar ${formatRupiah(capital.amount)}?`)) return;
    try {
      await api.delete(`/capital-injections/${capital.id}`);
      toast.success("Setoran modal dihapus");
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal menghapus modal");
    }
  };

  const calcDividend = async () => {
    if (!divProfit || parseInt(divProfit) <= 0) return toast.error("Masukkan laba bersih");
    try {
      const now = new Date();
      const { data } = await api.post("/dividends/calculate-by-unit", {
        unit: divUnit,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        total_profit: parseInt(divProfit),
      });
      setDivPreview(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal menghitung dividen");
    }
  };

  const distributeDividend = async () => {
    if (!divPreview?.items?.length) return toast.error("Hitung pembagian dulu");
    const totalShare = divPreview.items.reduce((s, it) => s + (it.share || 0), 0);
    if (!window.confirm(`Bagikan dividen ${formatRupiah(totalShare)}?\n\nIni akan tercatat sebagai pengeluaran dan riwayat dividen investor.`)) return;
    try {
      await api.post("/dividends/distribute", {
        unit: divUnit,
        month: divPreview.month || new Date().getMonth() + 1,
        year: divPreview.year || new Date().getFullYear(),
        total_profit: parseInt(divProfit),
        date: divDate,
        payment_method: divMethod,
        notes: divNotes,
        items: divPreview.items,
      });
      toast.success("Dividen dibagikan dan tercatat di pengeluaran");
      setDivPreview(null);
      setDivProfit(0);
      setDivNotes("");
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal membagikan dividen");
    }
  };

  const deleteDividend = async (dividend) => {
    if (!window.confirm(`Batalkan dividen ${formatRupiah(dividend.amount || 0)}?\n\nCatatan pengeluaran dan riwayat investor akan ikut dihapus.`)) return;
    try {
      await api.delete(`/dividends/${dividend.id}`);
      toast.success("Dividen dibatalkan dan pengeluaran ikut dihapus");
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal membatalkan dividen");
    }
  };

  const totalCapital = investors.reduce((s, i) => s + (i.total_capital || 0), 0);
  const totalDividend = dividends.reduce((s, d) => s + (d.amount || 0), 0);
  const equityData = investors.map((i, idx) => ({
    name: i.name, value: i.total_capital, color: COLORS[idx % COLORS.length],
  }));

  return (
    <div className="space-y-5 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Investor & Modal</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola investor, setoran/alokasi modal, dan pembagian dividen terintegrasi</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCcw className="w-4 h-4 mr-1.5" /> Refresh</Button>
          <Button variant="outline" data-testid="add-investor-btn" onClick={() => openInvestorForm()}>
            <Users className="w-4 h-4 mr-1.5" /> Investor
          </Button>
          <Button data-testid="add-capital-btn" onClick={() => openCapitalForm()} className="bg-[#1a6b3c] hover:bg-[#14522d]">
            <Plus className="w-4 h-4 mr-1.5" /> Tambah Modal
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs uppercase font-semibold text-gray-500 tracking-wider mb-1">Total Modal Disetor</div>
          <div className="font-mono text-3xl font-bold text-[#1a6b3c]" data-testid="total-capital">{formatRupiah(totalCapital)}</div>
          <div className="text-sm text-gray-500 mt-1">Dari {investors.length} investor · Dividen aktif {formatRupiah(totalDividend)}</div>

          <div className="grid sm:grid-cols-2 gap-3 mt-5">
            {investors.map((i, idx) => (
              <div key={i.id} data-testid={`investor-${i.id}`} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm" style={{ background: COLORS[idx % COLORS.length] }}>
                    {i.name?.charAt(0) || "I"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{i.name}</div>
                    <div className="text-xs text-gray-500">{i.phone || "—"}</div>
                  </div>
                </div>
                <div className="flex items-end justify-between gap-2 mt-2">
                  <div>
                    <div className="font-mono font-semibold text-[#1a6b3c]">{formatRupiah(i.total_capital)}</div>
                    <div className="text-xs text-gray-500 font-mono">{(i.ownership_pct || 0).toFixed(1)}% kepemilikan</div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => openInvestorForm(i)} title="Edit investor"><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="outline" className="h-8 px-2 text-red-600 hover:text-red-700" onClick={() => deleteInvestor(i)} title="Hapus investor"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </div>
            ))}
            {investors.length === 0 && <div className="col-span-full text-center py-8 text-gray-400 text-sm">Belum ada investor</div>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Komposisi Kepemilikan</h3>
          {equityData.length === 0 ? <div className="text-sm text-gray-400 py-10 text-center">Belum ada data</div> : (
            <div className="h-52"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={equityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(d) => `${d.name}`} labelLine={false}>{equityData.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie><Tooltip formatter={(v) => formatRupiah(v)} /></PieChart></ResponsiveContainer></div>
          )}
        </div>
      </div>

      <Tabs defaultValue="history" className="bg-white rounded-xl border border-gray-100">
        <TabsList className="bg-gray-50 m-1 flex-wrap h-auto">
          <TabsTrigger value="history" data-testid="tab-history">Riwayat Setoran</TabsTrigger>
          <TabsTrigger value="per-unit" data-testid="tab-per-unit">Alokasi Per Unit</TabsTrigger>
          <TabsTrigger value="dividend" data-testid="tab-dividend">Pembagian Dividen</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="p-4">
          <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3">
            Saat tahap building, setoran dan alokasi modal boleh diedit/hapus. Setelah dividen aktif dibagikan, modal investor terkait akan dikunci sampai dividen dibatalkan.
          </div>
          {injections.length === 0 ? <div className="text-center py-8 text-gray-400 text-sm">Belum ada setoran modal</div> : (
            <div className="divide-y divide-gray-100">
              {injections.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-3">
                  <div className="p-2 bg-emerald-50 rounded-lg"><TrendingUp className="w-4 h-4 text-emerald-700" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{investorName(c.investor_id)}</div>
                    <div className="text-xs text-gray-500">{formatDate(c.date)} · {unitLabel(c.unit)} · {c.notes || "Setoran modal"}</div>
                  </div>
                  <div className="font-mono font-semibold text-[#1a6b3c]">{formatRupiah(c.amount)}</div>
                  <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => openCapitalForm(c)} title="Edit modal"><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="outline" className="h-8 px-2 text-red-600 hover:text-red-700" onClick={() => deleteCapital(c)} title="Hapus modal"><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="per-unit" className="p-4 space-y-3">
          {Object.keys(allocations).length === 0 ? <div className="text-center py-8 text-gray-400 text-sm">Belum ada alokasi modal per unit.</div> : (
            <div className="space-y-4">
              {Object.entries(allocations).map(([unitCode, data]) => {
                const unit = units.find((u) => u.code === unitCode) || { name: unitCode, color: "#1a6b3c" };
                return (
                  <div key={unitCode} data-testid={`unit-alloc-${unitCode}`} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2"><div className="p-1.5 rounded" style={{ background: (unit.color || "#1a6b3c") + "20" }}><Briefcase className="w-4 h-4" style={{ color: unit.color || "#1a6b3c" }} /></div><span className="font-semibold">{unit.name}</span></div>
                      <div className="font-mono text-sm font-semibold">{formatRupiah(data.total_capital)}</div>
                    </div>
                    <div className="space-y-2">{(data.investors || []).map((row) => <div key={row.investor_id} className="flex items-center gap-2"><div className="flex-1 text-sm">{row.name}</div><div className="w-32 bg-gray-100 rounded-full h-2 overflow-hidden"><div className="h-full" style={{ width: `${row.ownership_pct}%`, background: unit.color || "#1a6b3c" }} /></div><div className="text-xs text-gray-600 font-mono w-12 text-right">{row.ownership_pct.toFixed(1)}%</div><div className="text-sm font-mono font-semibold w-28 text-right">{formatRupiah(row.capital)}</div></div>)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="dividend" className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Select value={divUnit} onValueChange={setDivUnit}><SelectTrigger data-testid="dividend-unit-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Konsolidasi (Semua Unit)</SelectItem>{units.map((u) => <SelectItem key={u.code} value={u.code}>{u.name}</SelectItem>)}</SelectContent></Select>
            <Input data-testid="dividend-profit-input" type="number" placeholder="Laba bersih" value={divProfit || ""} onChange={(e) => setDivProfit(e.target.value)} className="font-mono" />
            <Button onClick={calcDividend} data-testid="calc-dividend-btn" className="bg-[#f4a228] hover:bg-[#d98b1a]"><Calculator className="w-4 h-4 mr-1.5" /> Hitung</Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div><Label>Tanggal bayar</Label><Input type="date" value={divDate} onChange={(e) => setDivDate(e.target.value)} /></div>
            <div><Label>Metode</Label><Select value={divMethod} onValueChange={setDivMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Tunai</SelectItem><SelectItem value="transfer">Transfer</SelectItem><SelectItem value="qris">QRIS</SelectItem></SelectContent></Select></div>
            <div><Label>Catatan</Label><Input value={divNotes} onChange={(e) => setDivNotes(e.target.value)} placeholder="Opsional" /></div>
          </div>
          {divPreview && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="text-xs font-semibold text-emerald-900 uppercase mb-2">Preview Pembagian — {divPreview.unit === "all" ? "Konsolidasi" : unitLabel(divPreview.unit)}</div>
              {(divPreview.items || []).length === 0 ? <div className="text-sm text-gray-500">Tidak ada investor di unit ini.</div> : <div className="space-y-2">{divPreview.items.map((it) => <div key={it.investor_id} className="flex justify-between text-sm"><span>{it.investor_name} ({(it.ownership_pct || 0).toFixed(1)}%)</span><span className="font-mono font-semibold text-[#1a6b3c]">{formatRupiah(it.share)}</span></div>)}</div>}
              <Button onClick={distributeDividend} className="mt-4 bg-[#1a6b3c] hover:bg-[#14522d]"><HandCoins className="w-4 h-4 mr-1.5" /> Bagikan & Catat Pengeluaran</Button>
            </div>
          )}
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 font-semibold text-sm">Riwayat Dividen</div>
            {dividends.length === 0 ? <div className="p-6 text-center text-gray-400 text-sm">Belum ada dividen dibagikan</div> : <div className="divide-y divide-gray-100">{dividends.map((d) => <div key={d.id} className="p-3 flex items-start gap-3"><div className="p-2 rounded-lg bg-amber-50"><HandCoins className="w-4 h-4 text-amber-700" /></div><div className="flex-1 min-w-0"><div className="text-sm font-medium">{formatRupiah(d.amount || 0)} · {unitLabel(d.unit)}</div><div className="text-xs text-gray-500">{formatDate(d.date || d.created_at)} · {d.month}/{d.year} · {d.notes || "Pembagian dividen"}</div><div className="text-xs text-gray-500 mt-1">{(d.items || []).map(it => `${it.investor_name}: ${formatRupiah(it.share)}`).join(" · ")}</div></div><Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => deleteDividend(d)}>Batalkan</Button></div>)}</div>}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showInvForm} onOpenChange={(v) => { setShowInvForm(v); if (!v) setEditingInvestor(null); }}>
        <DialogContent><DialogHeader><DialogTitle>{editingInvestor ? "Edit Investor" : "Tambah Investor"}</DialogTitle></DialogHeader><div className="space-y-3"><div><Label>Nama</Label><Input data-testid="inv-name-input" value={invForm.name} onChange={(e) => setInvForm({ ...invForm, name: e.target.value })} /></div><div><Label>No. HP</Label><Input data-testid="inv-phone-input" value={invForm.phone} onChange={(e) => setInvForm({ ...invForm, phone: e.target.value })} /></div><div><Label>Alamat</Label><Input value={invForm.address} onChange={(e) => setInvForm({ ...invForm, address: e.target.value })} /></div><div><Label>Catatan</Label><Input value={invForm.notes} onChange={(e) => setInvForm({ ...invForm, notes: e.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => { setShowInvForm(false); setEditingInvestor(null); }}>Batal</Button><Button onClick={saveInvestor} data-testid="save-investor-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">{editingInvestor ? "Simpan Perubahan" : "Simpan"}</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={showCapForm} onOpenChange={(v) => { setShowCapForm(v); if (!v) setEditingCapital(null); }}>
        <DialogContent><DialogHeader><DialogTitle>{editingCapital ? "Edit Setoran / Alokasi Modal" : "Tambah Setoran Modal"}</DialogTitle></DialogHeader><div className="space-y-3"><div><Label>Investor</Label><Select value={capForm.investor_id} onValueChange={(v) => setCapForm({ ...capForm, investor_id: v })}><SelectTrigger data-testid="cap-investor-select"><SelectValue placeholder="Pilih investor" /></SelectTrigger><SelectContent>{investors.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Jumlah (Rp)</Label><Input data-testid="cap-amount-input" type="number" value={capForm.amount || ""} onChange={(e) => setCapForm({ ...capForm, amount: e.target.value })} /></div><div><Label>Tanggal</Label><Input type="date" value={capForm.date || todayInput()} onChange={(e) => setCapForm({ ...capForm, date: e.target.value })} /></div><div><Label>Alokasi Unit</Label><Select value={capForm.unit} onValueChange={(v) => setCapForm({ ...capForm, unit: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="umum">Umum (Lintas Unit)</SelectItem>{units.map((u) => <SelectItem key={u.code} value={u.code}>{u.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Catatan</Label><Input value={capForm.notes} onChange={(e) => setCapForm({ ...capForm, notes: e.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => { setShowCapForm(false); setEditingCapital(null); }}>Batal</Button><Button onClick={saveCapital} data-testid="save-capital-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">{editingCapital ? "Simpan Perubahan" : "Simpan"}</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
