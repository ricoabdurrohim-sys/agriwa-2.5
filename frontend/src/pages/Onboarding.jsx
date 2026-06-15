import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ArrowRight, ArrowLeft, Sparkles, Users, Building2, UtensilsCrossed, Package, Briefcase } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const STEPS = [
  { key: "welcome", title: "Selamat Datang", icon: Sparkles },
  { key: "business", title: "Profil Bisnis", icon: Building2 },
  { key: "investors", title: "Data Investor", icon: Users },
  { key: "tables", title: "Meja Warung", icon: UtensilsCrossed },
  { key: "inventory", title: "Item Pertama", icon: Package },
  { key: "done", title: "Selesai", icon: CheckCircle2 },
];

export default function Onboarding() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [biz, setBiz] = useState({ business_name: "", address: "", phone: "" });
  const [investorList, setInvestorList] = useState([{ name: "", phone: "", initial_capital: 0 }]);
  const [tableNames, setTableNames] = useState("Meja 1, Meja 2, Meja 3, Meja 4");
  const [firstItem, setFirstItem] = useState({ name: "", category: "Bahan Baku Warung", unit: "kg", current_stock: 0, cost_price: 0 });

  useEffect(() => {
    (async () => {
      const { data } = await api.get("/onboarding/status");
      if (data.completed) {
        toast.info("Onboarding sudah selesai");
        nav("/");
      }
    })();
    // eslint-disable-next-line
  }, []);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const saveBusiness = async () => {
    if (!biz.business_name) return toast.error("Nama bisnis wajib");
    next();
  };

  const saveInvestors = async () => {
    const valid = investorList.filter((i) => i.name);
    if (valid.length < 1) return toast.error("Minimal 1 investor");
    for (const inv of valid) {
      const { data: created } = await api.post("/investors", { name: inv.name, phone: inv.phone });
      if (parseInt(inv.initial_capital) > 0) {
        await api.post("/capital-injections", { investor_id: created.id, amount: parseInt(inv.initial_capital), unit: "umum", notes: "Modal awal" });
      }
    }
    toast.success(`${valid.length} investor ditambahkan`);
    next();
  };

  const saveTables = async () => {
    const names = tableNames.split(",").map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return toast.error("Tambah minimal 1 meja");
    for (const name of names) await api.post("/tables", { name });
    toast.success(`${names.length} meja ditambahkan`);
    next();
  };

  const saveFirstItem = async () => {
    if (!firstItem.name) { next(); return; }
    await api.post("/inventory", { ...firstItem, current_stock: parseFloat(firstItem.current_stock), cost_price: parseInt(firstItem.cost_price) });
    toast.success("Item pertama ditambahkan");
    next();
  };

  const completeOnboarding = async () => {
    await api.post("/onboarding/complete", biz);
    toast.success("Onboarding selesai!");
    nav("/");
  };

  const cur = STEPS[step];

  return (
    <div className="min-h-screen bg-[#f7f8fa] py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Progress steps */}
        <div className="flex justify-between mb-8 overflow-x-auto">
          {STEPS.map((s, i) => (
            <div key={s.key} className={`flex flex-col items-center gap-1 min-w-[60px] ${i === step ? "" : "opacity-50"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${
                i < step ? "bg-emerald-500" : i === step ? "bg-[#1a6b3c]" : "bg-gray-300"
              }`}>
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
              </div>
              <span className="text-[10px] text-center font-medium">{s.title}</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8" data-testid={`onboarding-step-${cur.key}`}>
          {cur.key === "welcome" && (
            <div className="text-center py-6">
              <Sparkles className="w-12 h-12 text-[#f4a228] mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins' }}>Selamat Datang di AgriWarung Manager!</h2>
              <p className="text-gray-600 max-w-md mx-auto">Mari kita setup bisnis Anda dalam 5 langkah singkat. Anda bisa skip langkah mana saja dan menambahkannya kemudian.</p>
              <Button onClick={next} data-testid="onboarding-start-btn" className="mt-6 bg-[#1a6b3c] hover:bg-[#14522d] h-12 px-8">
                Mulai Setup <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
              <button onClick={() => nav("/")} className="block mx-auto mt-4 text-xs text-gray-500 hover:underline">Lewati setup, langsung ke dashboard</button>
            </div>
          )}

          {cur.key === "business" && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Poppins' }}>Profil Bisnis</h2>
              <p className="text-sm text-gray-500 mb-5">Informasi dasar bisnis Anda</p>
              <div className="space-y-3">
                <div><Label>Nama Bisnis *</Label><Input data-testid="onb-bizname" value={biz.business_name} onChange={(e) => setBiz({ ...biz, business_name: e.target.value })} placeholder="AgriWarung Boyolali" /></div>
                <div><Label>Alamat</Label><Input value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} placeholder="Jl. Pahlawan No. 1, Boyolali" /></div>
                <div><Label>No. Telepon</Label><Input value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} placeholder="081234567890" /></div>
              </div>
            </>
          )}

          {cur.key === "investors" && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Poppins' }}>Data Investor</h2>
              <p className="text-sm text-gray-500 mb-5">Tambahkan investor dan modal awal masing-masing</p>
              <div className="space-y-2">
                {investorList.map((inv, idx) => (
                  <div key={idx} className="grid grid-cols-7 gap-2 items-end">
                    <Input className="col-span-3" placeholder="Nama" value={inv.name} onChange={(e) => { const ns = [...investorList]; ns[idx] = { ...ns[idx], name: e.target.value }; setInvestorList(ns); }} />
                    <Input className="col-span-2" placeholder="No. HP" value={inv.phone} onChange={(e) => { const ns = [...investorList]; ns[idx] = { ...ns[idx], phone: e.target.value }; setInvestorList(ns); }} />
                    <Input className="col-span-2 font-mono" placeholder="Modal awal" type="number" value={inv.initial_capital || ""} onChange={(e) => { const ns = [...investorList]; ns[idx] = { ...ns[idx], initial_capital: e.target.value }; setInvestorList(ns); }} />
                  </div>
                ))}
                <button onClick={() => setInvestorList([...investorList, { name: "", phone: "", initial_capital: 0 }])} className="text-xs text-[#1a6b3c] font-medium">+ Tambah Investor</button>
              </div>
            </>
          )}

          {cur.key === "tables" && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Poppins' }}>Meja Warung</h2>
              <p className="text-sm text-gray-500 mb-5">Pisahkan nama meja dengan koma. Bisa diatur ulang nanti.</p>
              <Input value={tableNames} onChange={(e) => setTableNames(e.target.value)} placeholder="Meja 1, Meja 2, Meja VIP, Takeaway" />
              <p className="text-xs text-gray-500 mt-2">Lewati langkah ini jika Anda tidak punya warung makan.</p>
            </>
          )}

          {cur.key === "inventory" && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Poppins' }}>Item Inventori Pertama</h2>
              <p className="text-sm text-gray-500 mb-5">Opsional — tambahkan satu item untuk mulai. Sisanya bisa diisi nanti.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Nama Item</Label><Input value={firstItem.name} onChange={(e) => setFirstItem({ ...firstItem, name: e.target.value })} placeholder="Beras Premium" /></div>
                <div><Label>Satuan</Label><Input value={firstItem.unit} onChange={(e) => setFirstItem({ ...firstItem, unit: e.target.value })} /></div>
                <div><Label>Stok Awal</Label><Input type="number" step="any" value={firstItem.current_stock || ""} onChange={(e) => setFirstItem({ ...firstItem, current_stock: e.target.value })} /></div>
                <div className="col-span-2"><Label>Harga Pokok (Rp)</Label><Input type="number" value={firstItem.cost_price || ""} onChange={(e) => setFirstItem({ ...firstItem, cost_price: e.target.value })} /></div>
              </div>
            </>
          )}

          {cur.key === "done" && (
            <div className="text-center py-6">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins' }}>Setup Selesai! 🎉</h2>
              <p className="text-gray-600 max-w-md mx-auto">Bisnis Anda siap dikelola. Mulai dengan menambahkan menu, mencatat transaksi pertama, atau atur resep BOM.</p>
              <Button onClick={completeOnboarding} data-testid="onboarding-done-btn" className="mt-6 bg-[#1a6b3c] hover:bg-[#14522d] h-12 px-8">
                Ke Dashboard <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          )}

          {step > 0 && step < STEPS.length - 1 && (
            <div className="flex justify-between mt-6 pt-5 border-t border-gray-100">
              <Button variant="outline" onClick={prev} data-testid="onb-prev-btn"><ArrowLeft className="w-4 h-4 mr-1.5" /> Kembali</Button>
              <Button data-testid="onb-next-btn"
                onClick={() => {
                  if (cur.key === "business") saveBusiness();
                  else if (cur.key === "investors") saveInvestors();
                  else if (cur.key === "tables") saveTables();
                  else if (cur.key === "inventory") saveFirstItem();
                  else next();
                }}
                className="bg-[#1a6b3c] hover:bg-[#14522d]">
                Lanjut <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
