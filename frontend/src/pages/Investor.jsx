import React, { useEffect, useState } from "react";
import { Plus, HandCoins, TrendingUp, Users, Briefcase } from "lucide-react";
import api, { formatRupiah, formatDate } from "@/lib/api";
import ResetModuleButton from "@/components/ResetModuleButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { toast } from "sonner";

const COLORS = ["#1a6b3c", "#f4a228", "#6b46c1", "#2563eb"];

export default function Investor() {
  const [investors, setInvestors] = useState([]);
  const [injections, setInjections] = useState([]);
  const [dividends, setDividends] = useState([]);
  const [allocations, setAllocations] = useState({});
  const [units, setUnits] = useState([]);
  const [showInvForm, setShowInvForm] = useState(false);
  const [showCapForm, setShowCapForm] = useState(false);
  const [invForm, setInvForm] = useState({ name: "", phone: "", address: "" });
  const [capForm, setCapForm] = useState({ investor_id: "", amount: 0, unit: "umum", notes: "" });
  const [divPreview, setDivPreview] = useState(null);
  const [divProfit, setDivProfit] = useState(0);
  const [divUnit, setDivUnit] = useState("all");

  const load = async () => {
    const [a, b, d, al, u] = await Promise.all([
      api.get("/investors"),
      api.get("/capital-injections"),
      api.get("/dividends"),
      api.get("/investors/allocations"),
      api.get("/business-units"),
    ]);
    setInvestors(a.data); setInjections(b.data); setDividends(d.data);
    setAllocations(al.data); setUnits(u.data);
  };
  useEffect(() => { load(); }, []);

  const addInvestor = async () => {
    if (!invForm.name) return toast.error("Nama wajib");
    await api.post("/investors", invForm);
    setInvForm({ name: "", phone: "", address: "" });
    setShowInvForm(false); load(); toast.success("Investor ditambahkan");
  };

  const addCapital = async () => {
    if (!capForm.investor_id || !capForm.amount) return toast.error("Lengkapi data");
    await api.post("/capital-injections", { ...capForm, amount: parseInt(capForm.amount) });
    setCapForm({ investor_id: "", amount: 0, unit: "umum", notes: "" });
    setShowCapForm(false); load(); toast.success("Setoran modal dicatat");
  };

  const calcDividend = async () => {
    if (!divProfit) return toast.error("Masukkan laba bersih");
    const now = new Date();
    const { data } = await api.post("/dividends/calculate-by-unit", {
      unit: divUnit, month: now.getMonth() + 1, year: now.getFullYear(), total_profit: parseInt(divProfit),
    });
    setDivPreview(data);
  };

  const totalCapital = investors.reduce((s, i) => s + (i.total_capital || 0), 0);
  const equityData = investors.map((i, idx) => ({
    name: i.name, value: i.total_capital, color: COLORS[idx % COLORS.length],
  }));

  return (
    <div className="space-y-5 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Investor & Modal</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola investor, modal disetor, dan dividen</p>
        </div>
        <div className="flex gap-2">
          <ResetModuleButton module="investor" label="Investor" />
          <Button variant="outline" data-testid="add-investor-btn" onClick={() => setShowInvForm(true)}>
            <Users className="w-4 h-4 mr-1.5" /> Investor
          </Button>
          <Button data-testid="add-capital-btn" onClick={() => setShowCapForm(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]">
            <Plus className="w-4 h-4 mr-1.5" /> Tambah Modal
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs uppercase font-semibold text-gray-500 tracking-wider mb-1">Total Modal Disetor</div>
          <div className="font-mono text-3xl font-bold text-[#1a6b3c]" data-testid="total-capital">{formatRupiah(totalCapital)}</div>
          <div className="text-sm text-gray-500 mt-1">Dari {investors.length} investor</div>

          <div className="grid sm:grid-cols-2 gap-3 mt-5">
            {investors.map((i, idx) => (
              <div key={i.id} data-testid={`investor-${i.id}`} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                       style={{ background: COLORS[idx % COLORS.length] }}>
                    {i.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{i.name}</div>
                    <div className="text-xs text-gray-500">{i.phone || "—"}</div>
                  </div>
                </div>
                <div className="font-mono font-semibold text-[#1a6b3c]">{formatRupiah(i.total_capital)}</div>
                <div className="text-xs text-gray-500 font-mono">{i.ownership_pct.toFixed(1)}% kepemilikan</div>
              </div>
            ))}
            {investors.length === 0 && (
              <div className="col-span-full text-center py-8 text-gray-400 text-sm">Belum ada investor</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Komposisi Kepemilikan</h3>
          {equityData.length === 0 ? (
            <div className="text-sm text-gray-400 py-10 text-center">Belum ada data</div>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={equityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(d) => `${d.name}`} labelLine={false}>
                    {equityData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatRupiah(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <Tabs defaultValue="history" className="bg-white rounded-xl border border-gray-100">
        <TabsList className="bg-gray-50 m-1">
          <TabsTrigger value="history" data-testid="tab-history">Riwayat Setoran</TabsTrigger>
          <TabsTrigger value="per-unit" data-testid="tab-per-unit">Alokasi Per Unit</TabsTrigger>
          <TabsTrigger value="dividend" data-testid="tab-dividend">Kalkulator Dividen</TabsTrigger>
        </TabsList>
        <TabsContent value="history" className="p-4">
          {injections.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Belum ada setoran modal</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {injections.map((c) => {
                const inv = investors.find((i) => i.id === c.investor_id);
                return (
                  <div key={c.id} className="flex items-center gap-3 py-3">
                    <div className="p-2 bg-emerald-50 rounded-lg"><TrendingUp className="w-4 h-4 text-emerald-700" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{inv?.name || "—"}</div>
                      <div className="text-xs text-gray-500">{formatDate(c.date)} · {c.notes || "Setoran modal"}</div>
                    </div>
                    <div className="font-mono font-semibold text-[#1a6b3c]">{formatRupiah(c.amount)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
        <TabsContent value="per-unit" className="p-4 space-y-3">
          {Object.keys(allocations).length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Belum ada alokasi modal per unit. Tambah setoran modal dengan memilih unit spesifik.</div>
          ) : (
            <div className="space-y-4">
              {Object.entries(allocations).map(([unitCode, data]) => {
                const unit = units.find((u) => u.code === unitCode) || { name: unitCode, color: "#1a6b3c" };
                return (
                  <div key={unitCode} data-testid={`unit-alloc-${unitCode}`} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded" style={{ background: (unit.color || "#1a6b3c") + "20" }}>
                          <Briefcase className="w-4 h-4" style={{ color: unit.color || "#1a6b3c" }} />
                        </div>
                        <span className="font-semibold">{unit.name}</span>
                      </div>
                      <div className="font-mono text-sm font-semibold">{formatRupiah(data.total_capital)}</div>
                    </div>
                    <div className="space-y-2">
                      {data.investors.map((row) => (
                        <div key={row.investor_id} className="flex items-center gap-2">
                          <div className="flex-1 text-sm">{row.name}</div>
                          <div className="w-32 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div className="h-full" style={{ width: `${row.ownership_pct}%`, background: unit.color || "#1a6b3c" }} />
                          </div>
                          <div className="text-xs text-gray-600 font-mono w-12 text-right">{row.ownership_pct.toFixed(1)}%</div>
                          <div className="text-sm font-mono font-semibold w-28 text-right">{formatRupiah(row.capital)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="dividend" className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Select value={divUnit} onValueChange={setDivUnit}>
              <SelectTrigger data-testid="dividend-unit-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Konsolidasi (Semua Unit)</SelectItem>
                {units.map((u) => <SelectItem key={u.code} value={u.code}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input data-testid="dividend-profit-input" type="number" placeholder="Laba bersih" value={divProfit || ""}
              onChange={(e) => setDivProfit(e.target.value)} className="font-mono" />
            <Button onClick={calcDividend} data-testid="calc-dividend-btn" className="bg-[#f4a228] hover:bg-[#d98b1a]">Hitung Pembagian</Button>
          </div>
          {divPreview && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="text-xs font-semibold text-emerald-900 uppercase mb-2">
                Pembagian Dividen — {divPreview.unit === "all" ? "Konsolidasi" : (units.find(u=>u.code===divPreview.unit)?.name || divPreview.unit)}
              </div>
              {divPreview.items.length === 0 ? <div className="text-sm text-gray-500">Tidak ada investor di unit ini.</div> :
                <div className="space-y-2">
                  {divPreview.items.map((it) => (
                    <div key={it.investor_id} className="flex justify-between text-sm">
                      <span>{it.investor_name} ({it.ownership_pct.toFixed(1)}%)</span>
                      <span className="font-mono font-semibold text-[#1a6b3c]">{formatRupiah(it.share)}</span>
                    </div>
                  ))}
                </div>}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Investor */}
      <Dialog open={showInvForm} onOpenChange={setShowInvForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah Investor</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nama</Label><Input data-testid="inv-name-input" value={invForm.name} onChange={(e) => setInvForm({ ...invForm, name: e.target.value })} /></div>
            <div><Label>No. HP</Label><Input data-testid="inv-phone-input" value={invForm.phone} onChange={(e) => setInvForm({ ...invForm, phone: e.target.value })} /></div>
            <div><Label>Alamat</Label><Input value={invForm.address} onChange={(e) => setInvForm({ ...invForm, address: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvForm(false)}>Batal</Button>
            <Button onClick={addInvestor} data-testid="save-investor-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Capital */}
      <Dialog open={showCapForm} onOpenChange={setShowCapForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah Setoran Modal</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Investor</Label>
              <Select value={capForm.investor_id} onValueChange={(v) => setCapForm({ ...capForm, investor_id: v })}>
                <SelectTrigger data-testid="cap-investor-select"><SelectValue placeholder="Pilih investor" /></SelectTrigger>
                <SelectContent>{investors.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Jumlah (Rp)</Label><Input data-testid="cap-amount-input" type="number" value={capForm.amount || ""} onChange={(e) => setCapForm({ ...capForm, amount: e.target.value })} /></div>
            <div>
              <Label>Alokasi Unit</Label>
              <Select value={capForm.unit} onValueChange={(v) => setCapForm({ ...capForm, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="umum">Umum (Lintas Unit)</SelectItem>
                  {units.map((u) => <SelectItem key={u.code} value={u.code}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Catatan</Label><Input value={capForm.notes} onChange={(e) => setCapForm({ ...capForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCapForm(false)}>Batal</Button>
            <Button onClick={addCapital} data-testid="save-capital-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
