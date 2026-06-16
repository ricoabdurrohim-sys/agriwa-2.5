import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Warung from "@/pages/Warung";
import Kasir from "@/pages/Kasir";
import Inventori from "@/pages/Inventori";
import BOM from "@/pages/BOM";
import Investor from "@/pages/Investor";
import Laporan from "@/pages/Laporan";
import Keuangan from "@/pages/Keuangan";
import Pengaturan from "@/pages/Pengaturan";
import Bantuan from "@/pages/Bantuan";
import Pupuk from "@/pages/Pupuk";
import Anggur from "@/pages/Anggur";
import Peternakan from "@/pages/Peternakan";
import Pembelian from "@/pages/Pembelian";
import KDS from "@/pages/KDS";
import Karyawan from "@/pages/Karyawan";
import StockOpname from "@/pages/StockOpname";
import BankImport from "@/pages/BankImport";
import Onboarding from "@/pages/Onboarding";
import BusinessUnits from "@/pages/BusinessUnits";
import Promo from "@/pages/Promo";
import UserManagement from "@/pages/UserManagement";
import Notifications from "@/pages/Notifications";
import Branches from "@/pages/Branches";
import Members from "@/pages/Members";
import AuditLog from "@/pages/AuditLog";
import PublicOrder from "@/pages/PublicOrder";
import AuthCallback from "@/pages/AuthCallback";

function AppRouter() {
  // Synchronously route to AuthCallback if URL hash contains a session_id from Emergent OAuth
  if (typeof window !== "undefined" && window.location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/order/:tableId" element={<PublicOrder />} />
      <Route path="/kds" element={<ProtectedRoute><KDS /></ProtectedRoute>} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/warung" element={<Warung />} />
        <Route path="/kasir" element={<Kasir />} />
        <Route path="/inventori" element={<Inventori />} />
        <Route path="/bom" element={<BOM />} />
        <Route path="/keuangan" element={<Keuangan />} />
        <Route path="/investor" element={<Investor />} />
        <Route path="/laporan" element={<Laporan />} />
        <Route path="/pupuk" element={<Pupuk />} />
        <Route path="/anggur" element={<Anggur />} />
        <Route path="/kebun" element={<Anggur />} />
        <Route path="/peternakan" element={<Peternakan />} />
        <Route path="/pembelian" element={<Pembelian />} />
        <Route path="/karyawan" element={<Karyawan />} />
        <Route path="/opname" element={<StockOpname />} />
        <Route path="/bank" element={<BankImport />} />
        <Route path="/units" element={<BusinessUnits />} />
        <Route path="/promo" element={<Promo />} />
        <Route path="/users" element={<UserManagement />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/branches" element={<Branches />} />
        <Route path="/members" element={<Members />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/pengaturan" element={<Pengaturan />} />
        <Route path="/bantuan" element={<Bantuan />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <AppRouter />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
