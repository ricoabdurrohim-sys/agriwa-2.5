import React, { useState, useMemo } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, UtensilsCrossed, Calculator, FileBarChart,
  Grape, Warehouse, Users, HandCoins, Settings,
  HelpCircle, Menu, LogOut, Bell, ChefHat, Beaker, Truck,
  Briefcase, ClipboardCheck, Building2, Tag, Layers,
  Shield, MessageCircle, Activity, Crown, Building, Eye, EyeOff, Sliders, Check,
  Package, ScanLine,
} from "lucide-react";
import { useWebSocket } from "@/lib/useWebSocket";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";

const mainNav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/warung", label: "Warung", icon: UtensilsCrossed, testid: "nav-warung" },
  { to: "/kasir", label: "Kasir", icon: Calculator, testid: "nav-kasir" },
  { to: "/inventori", label: "Inventori", icon: Warehouse, testid: "nav-inventori" },
  { to: "/laporan", label: "Laporan", icon: FileBarChart, testid: "nav-laporan" },
];

const allModules = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, group: "Ringkasan", essential: true },
  { to: "/notifications", label: "Notifikasi", icon: MessageCircle, group: "Ringkasan" },
  { to: "/scan", label: "Pintasan Scan", icon: ScanLine, group: "Ringkasan" },
  { to: "/warung", label: "Warung & Meja", icon: UtensilsCrossed, group: "Operasional", essential: true },
  { to: "/kasir", label: "Kasir POS", icon: Calculator, group: "Operasional", essential: true },
  { to: "/kds", label: "Dapur / KDS", icon: ChefHat, group: "Operasional" },
  { to: "/members", label: "Member & Loyalty", icon: Crown, group: "Operasional" },
  { to: "/promo", label: "Promo & Diskon", icon: Tag, group: "Operasional" },

  { to: "/inventori", label: "Inventori & Gudang", icon: Warehouse, group: "Stok & Produksi", essential: true },
  { to: "/opname", label: "Stock Opname", icon: ClipboardCheck, group: "Stok & Produksi" },
  { to: "/bom", label: "Resep / BOM", icon: Package, group: "Stok & Produksi" },
  { to: "/pupuk", label: "Produksi", icon: Beaker, group: "Stok & Produksi" },
  { to: "/kebun", label: "Kebun & B2B", icon: Grape, group: "Stok & Produksi" },
  { to: "/peternakan", label: "Peternakan", icon: Activity, group: "Stok & Produksi" },

  { to: "/pembelian", label: "Pembelian & Supplier", icon: Truck, group: "Keuangan & Akuntansi" },
  { to: "/keuangan", label: "Keuangan", icon: HandCoins, group: "Keuangan & Akuntansi", essential: true },
  { to: "/bank", label: "Import Bank & Rekonsiliasi", icon: Building2, group: "Keuangan & Akuntansi" },
  { to: "/laporan", label: "Laporan Keuangan", icon: FileBarChart, group: "Keuangan & Akuntansi", essential: true },
  { to: "/investor", label: "Investor & Modal", icon: Users, group: "Keuangan & Akuntansi" },

  { to: "/karyawan", label: "Karyawan & HR", icon: Briefcase, group: "SDM & Kontrol" },
  { to: "/users", label: "Manajemen User", icon: Shield, group: "SDM & Kontrol" },
  { to: "/audit", label: "Audit Log", icon: Activity, group: "SDM & Kontrol" },

  { to: "/units", label: "Lini Bisnis", icon: Layers, group: "Pengaturan", essential: true },
  { to: "/branches", label: "Cabang / Lokasi", icon: Building, group: "Pengaturan" },
  { to: "/pengaturan", label: "Pengaturan Sistem", icon: Settings, group: "Pengaturan" },
  { to: "/bantuan", label: "Tutorial & Bantuan", icon: HelpCircle, group: "Pengaturan" },
];

const GROUP_ORDER = ["Ringkasan", "Operasional", "Stok & Produksi", "Keuangan & Akuntansi", "SDM & Kontrol", "Pengaturan"];
const LS_HIDDEN_KEY = "aw_drawer_hidden_v2";
const LS_FULLVIEW_KEY = "aw_drawer_fullview_v2";

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [wsStatus, setWsStatus] = useState("connecting");
  const [editMode, setEditMode] = useState(false);
  const [fullView, setFullView] = useState(() => localStorage.getItem(LS_FULLVIEW_KEY) === "true");
  const [hidden, setHidden] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(LS_HIDDEN_KEY) || "[]")); }
    catch { return new Set(); }
  });

  const toggleHidden = (path) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      localStorage.setItem(LS_HIDDEN_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const toggleFullView = () => {
    const v = !fullView;
    setFullView(v);
    localStorage.setItem(LS_FULLVIEW_KEY, String(v));
  };

  const visibleModules = useMemo(() => {
    if (fullView || editMode) return allModules;
    return allModules.filter((m) => !hidden.has(m.to));
  }, [fullView, hidden, editMode]);

  const grouped = useMemo(() => {
    const out = {};
    GROUP_ORDER.forEach((g) => { out[g] = []; });
    visibleModules.forEach((m) => { (out[m.group] ||= []).push(m); });
    return out;
  }, [visibleModules]);

  useWebSocket((msg) => {
    if (msg.type === "connected") setWsStatus("connected");
    if (msg.type && msg.type !== "connected") {
      window.dispatchEvent(new CustomEvent("aw:ws", { detail: msg }));
    }
  });

  const renderModule = (m) => {
    const isHidden = hidden.has(m.to);
    if (editMode) {
      return (
        <div key={m.to} className={`flex items-center gap-2 px-2 py-2 rounded-lg mb-1 text-sm ${isHidden ? "bg-white/5 text-white/40" : "bg-white/10 text-white"}`}>
          <button
            data-testid={`drawer-edit-${m.to.replace("/", "") || "dashboard"}`}
            onClick={() => toggleHidden(m.to)}
            disabled={m.essential}
            className="flex-1 flex items-center gap-3 text-left disabled:cursor-not-allowed"
            title={m.essential ? "Menu wajib tidak bisa disembunyikan" : "Tampilkan/sembunyikan menu"}
          >
            <m.icon className="w-5 h-5 shrink-0" />
            <span className="flex-1 truncate">{m.label}</span>
            {m.essential ? <span className="text-[9px] uppercase font-bold bg-amber-500/30 text-amber-200 px-1.5 py-0.5 rounded">wajib</span> : isHidden ? <EyeOff className="w-4 h-4" /> : <Check className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      );
    }
    return (
      <NavLink
        key={m.to}
        to={m.to}
        end={m.to === "/"}
        onClick={() => setOpen(false)}
        data-testid={`drawer-${m.to.replace("/", "") || "dashboard"}`}
        className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1.5 text-sm transition-all ${isActive ? "bg-white text-[#155f38] font-semibold shadow-md" : "text-white/86 hover:bg-white/10 hover:translate-x-0.5"}`}
      >
        <m.icon className="w-5 h-5 shrink-0" />
        <span className="truncate">{m.label}</span>
      </NavLink>
    );
  };

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 h-14 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button data-testid="open-drawer-btn" className="p-2 -ml-2 rounded-md hover:bg-gray-100">
                  <Menu className="w-5 h-5 text-gray-700" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[22rem] bg-gradient-to-b from-[#0f5130] via-[#155f38] to-[#0b2f1d] border-0">
                <div className="flex flex-col h-full text-white">
                  <div className="px-5 py-5 border-b border-white/10">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shadow-inner">
                          <Grape className="w-6 h-6 text-[#f4a228] shrink-0" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold tracking-tight truncate text-lg" style={{ fontFamily: 'Poppins' }}>AgriWarung</div>
                          <div className="text-xs text-white/65">Mini ERP · POS · Kebun · Ternak</div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-4">
                      {[
                        { to: "/", label: "Dashboard", icon: LayoutDashboard },
                        { to: "/warung", label: "Warung", icon: UtensilsCrossed },
                        { to: "/kasir", label: "Kasir", icon: Calculator },
                      ].map((m) => (
                        <NavLink key={m.to} to={m.to} end={m.to === "/"} onClick={() => setOpen(false)} className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-2 py-2 text-center text-[11px] font-semibold text-white/90">
                          <m.icon className="w-4 h-4 mx-auto mb-1 text-[#f4a228]" />{m.label}
                        </NavLink>
                      ))}
                    </div>
                    <button data-testid="edit-drawer-btn" onClick={() => setEditMode((v) => !v)} className={`mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border border-white/10 transition-colors ${editMode ? "bg-[#f4a228] text-white" : "bg-white/10 text-white/85 hover:bg-white/20"}`} title="Atur tampilan menu">
                      <Sliders className="w-4 h-4" /> {editMode ? "Selesai Atur Menu" : "Atur Menu"}
                    </button>
                  </div>
                  <div className="px-4 pt-3 pb-2 border-b border-white/5">
                    <button data-testid="toggle-fullview-btn" onClick={toggleFullView} className="w-full flex items-center gap-2 text-xs px-3 py-2.5 rounded-xl bg-white/8 hover:bg-white/12 border border-white/10 text-white/90">
                      {fullView ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      <span className="font-medium">{fullView ? "Mode Lengkap" : "Mode Ringkas"}</span>
                      <span className="ml-auto text-[10px] text-white/60">{visibleModules.length}/{allModules.length}</span>
                    </button>
                    {editMode && <div className="text-[11px] text-white/65 mt-2 px-1 leading-relaxed">Pilih menu yang ingin tampil. Reset/hapus data massal tidak tersedia; data dihapus satu per satu dari detail masing-masing.</div>}
                  </div>
                  <nav className="flex-1 px-3 py-3 overflow-y-auto">
                    {GROUP_ORDER.map((g) => grouped[g]?.length ? (
                      <details key={g} open={editMode || g === "Ringkasan" || g === "Operasional" || g === "Keuangan & Akuntansi"} className="mb-2 group rounded-2xl bg-black/5 border border-white/5 px-1 py-1">
                        <summary className="cursor-pointer list-none px-3 py-2 text-[11px] uppercase font-bold tracking-wider text-white/65 hover:text-white/90 flex items-center justify-between">
                          <span>{g}</span><span className="text-[10px] font-mono text-white/40">{grouped[g].length}</span>
                        </summary>
                        <div className="pb-1">{grouped[g].map(renderModule)}</div>
                      </details>
                    ) : null)}
                  </nav>
                  <div className="px-4 py-3 border-t border-white/10">
                    <div className="text-xs text-white/60 mb-1">Masuk sebagai</div>
                    <div className="text-sm font-medium">{user?.name}</div>
                    <div className="text-xs text-white/60 capitalize mb-3">{user?.role?.replace("_", " ")}</div>
                    <button data-testid="logout-btn" onClick={async () => { await logout(); nav("/login"); }} className="flex items-center gap-2 text-sm text-white/85 hover:text-white">
                      <LogOut className="w-4 h-4" /> Keluar
                    </button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <div className="flex items-center gap-2">
              <Grape className="w-6 h-6 text-[#1a6b3c]" />
              <span className="font-semibold text-gray-900" style={{ fontFamily: 'Poppins' }}>AgriWarung</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${wsStatus === "connected" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`} data-testid="ws-status">
              <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === "connected" ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
              {wsStatus === "connected" ? "Live · Sinkron" : "Menyambung..."}
            </div>
            <NavLink to="/scan" className="p-2 rounded-md hover:bg-gray-100 relative" data-testid="scan-shortcut-btn"><ScanLine className="w-5 h-5 text-gray-700" /></NavLink>
            <NavLink to="/notifications" className="p-2 rounded-md hover:bg-gray-100 relative" data-testid="notifications-btn"><Bell className="w-5 h-5 text-gray-700" /></NavLink>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto pb-24 lg:pb-6 px-3 sm:px-4 lg:px-6 pt-4"><ErrorBoundary><Outlet /></ErrorBoundary></main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 lg:hidden z-30" style={{ boxShadow: "0 -4px 12px -2px rgba(0,0,0,0.06)" }}>
        <div className="grid grid-cols-5 max-w-xl mx-auto">
          {mainNav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} data-testid={n.testid} className={({ isActive }) => `flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${isActive ? "text-[#1a6b3c]" : "text-gray-500"}`}>
              {({ isActive }) => (<><n.icon className={`w-5 h-5 ${isActive ? "fill-[#1a6b3c]/10" : ""}`} strokeWidth={isActive ? 2.5 : 2} /><span className="text-[10px] font-medium">{n.label}</span></>)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
