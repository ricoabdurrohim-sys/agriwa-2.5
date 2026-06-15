import React, { useState, useEffect, useMemo } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, UtensilsCrossed, Calculator, Package, FileBarChart,
  Grape, Sprout, Warehouse, Users, HandCoins, ShoppingCart, Settings,
  HelpCircle, Menu, LogOut, Bell, Wifi, ChefHat, Beaker, Truck,
  Briefcase, ClipboardCheck, Building2, Sparkles, Tag, Layers,
  Shield, MessageCircle, Activity, Crown, Building, Eye, EyeOff, Sliders, Check,
  ArrowUp, ArrowDown,
} from "lucide-react";
import { useWebSocket } from "@/lib/useWebSocket";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";

const mainNav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/warung", label: "Warung", icon: UtensilsCrossed, testid: "nav-warung" },
  { to: "/kasir", label: "Kasir", icon: Calculator, testid: "nav-kasir" },
  { to: "/inventori", label: "Inventori", icon: Package, testid: "nav-inventori" },
  { to: "/laporan", label: "Laporan", icon: FileBarChart, testid: "nav-laporan" },
];

const allModules = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, essential: true },
  { to: "/warung", label: "Warung", icon: UtensilsCrossed, essential: true },
  { to: "/kasir", label: "Kasir POS", icon: Calculator, essential: true },
  { to: "/kds", label: "Dapur (KDS)", icon: ChefHat },
  { to: "/inventori", label: "Inventori & Gudang", icon: Warehouse, essential: true },
  { to: "/bom", label: "Resep & BOM", icon: Package },
  { to: "/pupuk", label: "Produksi Pupuk", icon: Beaker },
  { to: "/anggur", label: "Kebun Anggur & B2B", icon: Grape },
  { to: "/pembelian", label: "Pembelian & Supplier", icon: Truck },
  { to: "/keuangan", label: "Keuangan", icon: HandCoins, essential: true },
  { to: "/bank", label: "Import Bank", icon: Building2 },
  { to: "/karyawan", label: "Karyawan & HR", icon: Briefcase },
  { to: "/opname", label: "Stock Opname", icon: ClipboardCheck },
  { to: "/investor", label: "Investor & Modal", icon: Users },
  { to: "/units", label: "Lini Bisnis", icon: Layers, essential: true },
  { to: "/branches", label: "Cabang/Lokasi", icon: Building },
  { to: "/members", label: "Member & Loyalty", icon: Crown },
  { to: "/promo", label: "Promo & Diskon", icon: Tag },
  { to: "/laporan", label: "Laporan", icon: FileBarChart, essential: true },
  { to: "/notifications", label: "Notifikasi WA", icon: MessageCircle },
  { to: "/users", label: "Manajemen User", icon: Shield },
  { to: "/audit", label: "Audit Log", icon: Activity },
  { to: "/onboarding", label: "Setup Wizard", icon: Sparkles },
  { to: "/pengaturan", label: "Pengaturan", icon: Settings },
  { to: "/bantuan", label: "Tutorial & Bantuan", icon: HelpCircle },
];

const LS_HIDDEN_KEY = "aw_drawer_hidden";
const LS_FULLVIEW_KEY = "aw_drawer_fullview";
const LS_ORDER_KEY = "aw_drawer_order";

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
  const [order, setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_ORDER_KEY) || "null");
      return Array.isArray(saved) && saved.length ? saved : allModules.map((m) => m.to);
    } catch { return allModules.map((m) => m.to); }
  });

  const moveItem = (path, direction) => {
    setOrder((prev) => {
      const idx = prev.indexOf(path);
      if (idx < 0) return prev;
      const swap = direction === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      localStorage.setItem(LS_ORDER_KEY, JSON.stringify(next));
      return next;
    });
  };

  const resetOrder = () => {
    const defaultOrder = allModules.map((m) => m.to);
    setOrder(defaultOrder);
    localStorage.setItem(LS_ORDER_KEY, JSON.stringify(defaultOrder));
  };

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
    const byPath = Object.fromEntries(allModules.map((m) => [m.to, m]));
    // ordered union: items in `order` first, then any new module not in order
    const ordered = order.map((p) => byPath[p]).filter(Boolean);
    const missing = allModules.filter((m) => !order.includes(m.to));
    const full = [...ordered, ...missing];
    if (fullView) return full;
    return full.filter((m) => !hidden.has(m.to));
  }, [fullView, hidden, order]);

  const orderedAll = useMemo(() => {
    const byPath = Object.fromEntries(allModules.map((m) => [m.to, m]));
    const ordered = order.map((p) => byPath[p]).filter(Boolean);
    const missing = allModules.filter((m) => !order.includes(m.to));
    return [...ordered, ...missing];
  }, [order]);

  useWebSocket((msg) => {
    if (msg.type === "connected") setWsStatus("connected");
    // Dispatch custom event so pages can listen
    if (msg.type && msg.type !== "connected") {
      window.dispatchEvent(new CustomEvent("aw:ws", { detail: msg }));
    }
  });

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 h-14 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button
                  data-testid="open-drawer-btn"
                  className="p-2 -ml-2 rounded-md hover:bg-gray-100"
                >
                  <Menu className="w-5 h-5 text-gray-700" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72 bg-[#1a6b3c] border-0">
                <div className="flex flex-col h-full text-white">
                  <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Grape className="w-7 h-7 text-[#f4a228] shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold tracking-tight truncate" style={{ fontFamily: 'Poppins' }}>AgriWarung</div>
                        <div className="text-xs text-white/60">Boyolali Manager</div>
                      </div>
                    </div>
                    <button data-testid="edit-drawer-btn" onClick={() => setEditMode((v) => !v)}
                      className={`p-1.5 rounded-md transition-colors ${editMode ? "bg-[#f4a228] text-white" : "bg-white/10 text-white/80 hover:bg-white/20"}`}
                      title={editMode ? "Selesai mengedit" : "Edit drawer"}>
                      <Sliders className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="px-3 pt-3 pb-1 flex items-center justify-between border-b border-white/5">
                    <button data-testid="toggle-fullview-btn" onClick={toggleFullView}
                      className="flex-1 flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/85">
                      {fullView ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      <span className="font-medium">{fullView ? "Tampilan Penuh ON" : "Tampilan Sederhana"}</span>
                      <span className="ml-auto text-[10px] text-white/60">{visibleModules.length}/{allModules.length}</span>
                    </button>
                  </div>
                  <nav className="flex-1 px-3 py-2 overflow-y-auto">
                    {editMode && (
                      <div className="flex items-center justify-between mb-2 px-1">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-white/50">Atur Urutan & Visibilitas</span>
                        <button data-testid="reset-order-btn" onClick={resetOrder} className="text-[10px] text-amber-300 hover:text-amber-200 font-semibold">
                          Reset Urutan
                        </button>
                      </div>
                    )}
                    {(editMode ? orderedAll : visibleModules).map((m, idx, arr) => {
                      const isHidden = hidden.has(m.to);
                      if (editMode) {
                        return (
                          <div key={m.to} className={`flex items-center gap-2 px-2 py-2 rounded-lg mb-1 text-sm transition-colors ${
                            isHidden ? "bg-white/5 text-white/40" : "bg-white/10 text-white"
                          } ${m.essential ? "opacity-80" : ""}`}>
                            <div className="flex flex-col gap-0.5 shrink-0">
                              <button data-testid={`drawer-up-${m.to.replace("/", "") || "dashboard"}`} onClick={() => moveItem(m.to, "up")} disabled={idx === 0} className="text-white/60 hover:text-white disabled:opacity-30">
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button data-testid={`drawer-down-${m.to.replace("/", "") || "dashboard"}`} onClick={() => moveItem(m.to, "down")} disabled={idx === arr.length - 1} className="text-white/60 hover:text-white disabled:opacity-30">
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            </div>
                            <button data-testid={`drawer-edit-${m.to.replace("/", "") || "dashboard"}`}
                              onClick={() => toggleHidden(m.to)}
                              disabled={m.essential}
                              className="flex-1 flex items-center gap-3 text-left">
                              <m.icon className="w-5 h-5 shrink-0" />
                              <span className="flex-1 truncate">{m.label}</span>
                              {m.essential ? (
                                <span className="text-[9px] uppercase font-bold bg-amber-500/30 text-amber-200 px-1.5 py-0.5 rounded">wajib</span>
                              ) : isHidden ? (
                                <EyeOff className="w-4 h-4 text-white/40" />
                              ) : (
                                <Check className="w-4 h-4 text-emerald-400" />
                              )}
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
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-3 rounded-lg mb-1 text-sm transition-colors ${
                              isActive ? "bg-[#f4a228] text-white font-medium" : "text-white/85 hover:bg-white/10"
                            }`
                          }
                        >
                          <m.icon className="w-5 h-5" />
                          <span>{m.label}</span>
                        </NavLink>
                      );
                    })}
                  </nav>
                  <div className="px-4 py-3 border-t border-white/10">
                    <div className="text-xs text-white/60 mb-1">Masuk sebagai</div>
                    <div className="text-sm font-medium">{user?.name}</div>
                    <div className="text-xs text-white/60 capitalize mb-3">{user?.role?.replace("_", " ")}</div>
                    <button
                      data-testid="logout-btn"
                      onClick={async () => { await logout(); nav("/login"); }}
                      className="flex items-center gap-2 text-sm text-white/85 hover:text-white"
                    >
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
            <div className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
              wsStatus === "connected" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`} data-testid="ws-status">
              <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === "connected" ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
              {wsStatus === "connected" ? "Live · Tersinkronisasi" : "Menyambung..."}
            </div>
            <button className="p-2 rounded-md hover:bg-gray-100 relative" data-testid="notifications-btn">
              <Bell className="w-5 h-5 text-gray-700" />
            </button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-7xl mx-auto pb-24 lg:pb-6 px-3 sm:px-4 lg:px-6 pt-4">
        <Outlet />
      </main>

      {/* Bottom nav (mobile/tablet) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 lg:hidden z-30"
           style={{ boxShadow: "0 -4px 12px -2px rgba(0,0,0,0.06)" }}>
        <div className="grid grid-cols-5 max-w-xl mx-auto">
          {mainNav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              data-testid={n.testid}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${
                  isActive ? "text-[#1a6b3c]" : "text-gray-500"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <n.icon className={`w-5 h-5 ${isActive ? "fill-[#1a6b3c]/10" : ""}`} strokeWidth={isActive ? 2.5 : 2} />
                  <span className="text-[10px] font-medium">{n.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
