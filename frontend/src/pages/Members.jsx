import React, { useEffect, useState } from "react";
import { Plus, Search, Crown, Award, Star, User, Phone, Mail, Gift, Settings as SettingsIcon } from "lucide-react";
import api, { formatRupiah, formatDate } from "@/lib/api";
import ResetModuleButton from "@/components/ResetModuleButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const TIER_CONFIG = {
  Bronze: { color: "bg-amber-100 text-amber-800", icon: Star },
  Silver: { color: "bg-gray-200 text-gray-700", icon: Award },
  Gold: { color: "bg-yellow-100 text-yellow-800", icon: Crown },
};

export default function Members() {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");
  const [show, setShow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [settings, setSettings] = useState({ earn_rate: 1000, redeem_rate: 100, tier_silver_at: 100, tier_gold_at: 500 });

  const load = async () => {
    const { data } = await api.get(`/members${search ? `?search=${search}` : ""}`);
    setMembers(data);
  };
  const loadSettings = async () => {
    const { data } = await api.get("/loyalty/settings");
    setSettings(data);
  };
  useEffect(() => { load(); loadSettings(); }, []);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [search]);

  const save = async () => {
    if (!form.name || !form.phone) return toast.error("Nama dan no. HP wajib");
    try {
      await api.post("/members", form);
      toast.success("Member terdaftar");
      setShow(false); setForm({ name: "", phone: "", email: "", address: "" }); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  const saveSettings = async () => {
    await api.put("/loyalty/settings", settings);
    toast.success("Pengaturan loyalty disimpan");
    setShowSettings(false);
  };

  const totalMembers = members.length;
  const totalPoints = members.reduce((s, m) => s + (m.points || 0), 0);
  const goldCount = members.filter(m => m.tier === "Gold").length;

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Member & Loyalty</h1>
          <p className="text-sm text-gray-500 mt-0.5">{totalMembers} member · {totalPoints.toLocaleString("id-ID")} total poin · {goldCount} Gold tier</p>
        </div>
        <div className="flex gap-2">
          <ResetModuleButton module="members" label="Member" />
          <Button variant="outline" onClick={() => setShowSettings(true)} data-testid="loyalty-settings-btn">
            <SettingsIcon className="w-4 h-4 mr-1.5" /> Aturan Poin
          </Button>
          <Button data-testid="add-member-btn" onClick={() => setShow(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]">
            <Plus className="w-4 h-4 mr-1.5" /> Daftar Member
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <div className="text-xs uppercase font-semibold text-gray-500">Total Member</div>
          <div className="font-mono text-2xl font-bold text-[#1a6b3c]">{totalMembers}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <div className="text-xs uppercase font-semibold text-gray-500">Total Poin Beredar</div>
          <div className="font-mono text-2xl font-bold text-[#f4a228]">{totalPoints.toLocaleString("id-ID")}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <div className="text-xs uppercase font-semibold text-gray-500">Total Belanja Member</div>
          <div className="font-mono text-lg font-bold text-gray-900">{formatRupiah(members.reduce((s, m) => s + (m.total_spent || 0), 0))}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <div className="text-xs uppercase font-semibold text-gray-500">Gold Tier</div>
          <div className="font-mono text-2xl font-bold text-yellow-600">{goldCount}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input data-testid="member-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama atau nomor HP..." className="pl-9 h-10 bg-gray-50 border-gray-200" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-4 py-3 text-left">Member ID</th>
              <th className="px-4 py-3 text-left">Nama</th>
              <th className="px-4 py-3 text-left">HP</th>
              <th className="px-4 py-3 text-center">Tier</th>
              <th className="px-4 py-3 text-right">Poin</th>
              <th className="px-4 py-3 text-right">Total Belanja</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-gray-400 text-sm">Belum ada member</td></tr>
            ) : members.map((m) => {
              const tier = TIER_CONFIG[m.tier || "Bronze"];
              const Icon = tier.icon;
              return (
                <tr key={m.id} data-testid={`member-row-${m.id}`}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{m.member_id}</td>
                  <td className="px-4 py-3 font-medium">{m.name}</td>
                  <td className="px-4 py-3 text-gray-600">{m.phone}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${tier.color}`}>
                      <Icon className="w-3 h-3" /> {m.tier || "Bronze"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-[#f4a228]">{(m.points || 0).toLocaleString("id-ID")}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatRupiah(m.total_spent || 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* New Member */}
      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent>
          <DialogHeader><DialogTitle>Daftar Member Baru</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nama Lengkap</Label><Input data-testid="member-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>No. HP / WhatsApp</Label><Input data-testid="member-phone-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Email (opsional)</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Alamat (opsional)</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded p-2">Member akan mendapat ID otomatis dan mulai dari tier Bronze (0 poin).</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShow(false)}>Batal</Button>
            <Button onClick={save} data-testid="save-member-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Daftarkan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loyalty Settings */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader><DialogTitle>Aturan Loyalty Points</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Earn Rate (Rp per 1 poin)</Label>
              <Input data-testid="earn-rate-input" type="number" value={settings.earn_rate} onChange={(e) => setSettings({ ...settings, earn_rate: parseInt(e.target.value) || 0 })} className="font-mono" />
              <p className="text-xs text-gray-500 mt-1">Misal: 1000 = belanja Rp 1000 dapat 1 poin</p>
            </div>
            <div>
              <Label>Redeem Rate (Rp diskon per 1 poin)</Label>
              <Input data-testid="redeem-rate-input" type="number" value={settings.redeem_rate} onChange={(e) => setSettings({ ...settings, redeem_rate: parseInt(e.target.value) || 0 })} className="font-mono" />
              <p className="text-xs text-gray-500 mt-1">Misal: 100 = 1 poin bisa ditukar Rp 100 diskon</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tier Silver (mulai poin)</Label>
                <Input type="number" value={settings.tier_silver_at} onChange={(e) => setSettings({ ...settings, tier_silver_at: parseInt(e.target.value) || 0 })} className="font-mono" />
              </div>
              <div>
                <Label>Tier Gold (mulai poin)</Label>
                <Input type="number" value={settings.tier_gold_at} onChange={(e) => setSettings({ ...settings, tier_gold_at: parseInt(e.target.value) || 0 })} className="font-mono" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettings(false)}>Batal</Button>
            <Button onClick={saveSettings} data-testid="save-loyalty-settings-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
