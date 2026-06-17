import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ScanLine, Search, Camera, XCircle, Keyboard, RefreshCcw, QrCode } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const SCANNER_ID = "agriwarung-html5-qr-reader";

function normalizeWarungOrderTarget(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const fromAwPayload = (text) => {
    const m = String(text || "").match(/^aw:warung-order:([^:]+):([^:]+)$/i);
    if (!m) return null;
    const tableId = decodeURIComponent(m[1] || "");
    const orderId = decodeURIComponent(m[2] || "");
    if (!tableId || !orderId) return null;
    return `/warung?table=${encodeURIComponent(tableId)}&order=${encodeURIComponent(orderId)}&from=scan`;
  };
  const aw = fromAwPayload(value);
  if (aw) return aw;
  try {
    const url = new URL(value, window.location.origin);
    const path = url.pathname || "";
    const codeParam = url.searchParams.get("code");
    if (codeParam) {
      const nested = normalizeWarungOrderTarget(codeParam);
      if (nested) return nested;
    }
    const tableId = url.searchParams.get("table");
    const orderId = url.searchParams.get("order");
    if ((path.endsWith("/warung") || path === "/warung") && tableId && orderId) {
      return `/warung?table=${encodeURIComponent(tableId)}&order=${encodeURIComponent(orderId)}&from=scan`;
    }
  } catch {}
  return null;
}

export default function Scan() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const initialCode = params.get("code") || "";
  const mode = params.get("mode") || "all";
  const scannerRef = useRef(null);
  const resolvingRef = useRef(false);
  const [code, setCode] = useState(initialCode);
  const [status, setStatus] = useState(initialCode ? "Membuka hasil scan..." : "Klik Mulai Scan untuk membuka kamera");
  const [scanning, setScanning] = useState(false);
  const [manualOnly, setManualOnly] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");

  const stopCamera = async () => {
    try {
      if (scannerRef.current) {
        const s = scannerRef.current;
        scannerRef.current = null;
        await s.stop().catch(() => {});
        await s.clear().catch(() => {});
      }
    } catch {}
    setScanning(false);
  };

  const resolve = async (raw) => {
    const value = String(raw || "").trim();
    if (!value) return toast.error("Kode kosong");
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setStatus("Membuka hasil scan...");
    const directWarungTarget = normalizeWarungOrderTarget(value);
    if (directWarungTarget) {
      await stopCamera();
      toast.success("QR pesanan Warung ditemukan");
      nav(directWarungTarget);
      return;
    }
    setStatus("Mencari data...");
    try {
      const { data } = await api.get(`/scan/resolve?code=${encodeURIComponent(value)}`);
      await stopCamera();
      toast.success(`Ditemukan: ${data.kind}`);
      nav(data.target || "/kasir");
    } catch (e) {
      resolvingRef.current = false;
      setStatus("Tidak ditemukan. Coba scan ulang atau ketik nomor nota/batch.");
      toast.error(e?.response?.data?.detail || "Kode tidak ditemukan");
    }
  };

  const startCamera = async (cameraIdOverride = "") => {
    if (scanning && !cameraIdOverride) return;
    setManualOnly(false);
    setStatus("Menyiapkan kamera...");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setManualOnly(true);
        setStatus("Browser belum memberi akses kamera. Pastikan buka aplikasi lewat HTTPS Vercel dan izinkan kamera, atau input kode manual.");
        return;
      }
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      const foundCameras = await Html5Qrcode.getCameras();
      setCameras(foundCameras || []);
      if (!foundCameras?.length) {
        setManualOnly(true);
        setStatus("Kamera tidak ditemukan. Cek izin kamera Windows/Edge/Chrome, atau input kode manual.");
        return;
      }
      await stopCamera();
      const scanner = new Html5Qrcode(SCANNER_ID, { verbose: false, formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
      ] });
      scannerRef.current = scanner;
      const preferred = foundCameras.find((c) => /back|rear|environment|belakang/i.test(c.label || "")) || foundCameras[foundCameras.length - 1] || foundCameras[0];
      const cameraId = cameraIdOverride || selectedCameraId || preferred.id;
      setSelectedCameraId(cameraId);
      await scanner.start(
        cameraId,
        { fps: 8, qrbox: { width: 240, height: 240 }, aspectRatio: 1.333 },
        (decodedText) => resolve(decodedText),
        () => {}
      );
      setScanning(true);
      setStatus("Kamera aktif. Arahkan QR code ke kotak scan.");
    } catch (e) {
      console.error(e);
      setManualOnly(true);
      setScanning(false);
      setStatus("Kamera tidak bisa dibuka. Klik ikon gembok di address bar → Camera → Allow, lalu reload. Input manual tetap bisa dipakai.");
      toast.error("Kamera tidak bisa dibuka");
    }
  };

  const switchCamera = async () => {
    if (!cameras.length) return startCamera();
    const idx = cameras.findIndex((c) => c.id === selectedCameraId);
    const next = cameras[(idx + 1 + cameras.length) % cameras.length] || cameras[0];
    setSelectedCameraId(next.id);
    await startCamera(next.id);
    setStatus(`Kamera diganti: ${next.label || "kamera lain"}`);
  };

  useEffect(() => {
    if (initialCode) resolve(initialCode);
    return () => { stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  const modeLabel = mode === "transaction" ? "Transaksi / Struk" : mode === "inventory" ? "Inventori / Batch" : "Semua kode";

  return (
    <div className="max-w-xl mx-auto space-y-4 fade-in">
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center"><ScanLine className="w-6 h-6 text-[#1a6b3c]" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Pintasan Scan</h1>
            <p className="text-sm text-gray-500">Mode: {modeLabel}</p>
          </div>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">Scan QR pesanan Warung, struk, batch, panen, produksi, kegiatan kebun, atau riwayat lain untuk membuka detail terkait. QR pesanan Warung langsung membuka meja dan order aktif, tidak lagi mencari lintas lini bisnis.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="rounded-xl bg-gray-900 overflow-hidden min-h-[320px] flex items-center justify-center relative">
          <div id={SCANNER_ID} className="w-full min-h-[320px] flex items-center justify-center text-white/80" />
          {!scanning && <div className="absolute inset-0 flex items-center justify-center text-center text-white/80 p-6 pointer-events-none"><div><QrCode className="w-12 h-12 mx-auto mb-3 opacity-70" /><div className="text-sm">Kamera belum aktif</div><div className="text-xs text-white/55 mt-1">Klik Mulai Scan lalu arahkan QR code</div></div></div>}
        </div>
        <div className={`text-xs rounded-lg p-2 ${manualOnly ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-gray-50 text-gray-600"}`}>{status}</div>
        <div className="grid grid-cols-3 gap-2">
          <Button onClick={() => startCamera()} className="bg-[#1a6b3c] hover:bg-[#14522d]" disabled={scanning}><Camera className="w-4 h-4 mr-1.5" /> Mulai Scan</Button>
          <Button variant="outline" onClick={stopCamera} disabled={!scanning}><XCircle className="w-4 h-4 mr-1.5" /> Stop</Button>
          <Button variant="outline" onClick={switchCamera} disabled={cameras.length < 2}><RefreshCcw className="w-4 h-4 mr-1.5" /> Kamera</Button>
        </div>
        {cameras.length > 1 && <select value={selectedCameraId} onChange={async (e) => { setSelectedCameraId(e.target.value); await startCamera(e.target.value); }} className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm">
          {cameras.map((c, idx) => <option key={c.id} value={c.id}>{c.label || `Kamera ${idx + 1}`}</option>)}
        </select>}
        {manualOnly && <Button variant="ghost" size="sm" onClick={() => window.location.reload()} className="w-full"><RefreshCcw className="w-4 h-4 mr-1" /> Reload setelah izin kamera diubah</Button>}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
        <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><Keyboard className="w-4 h-4" /> Input manual</div>
        <div className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && resolve(code)} placeholder="Nomor nota / batch / kode QR" className="font-mono" />
          <Button variant="outline" onClick={() => resolve(code)}><Search className="w-4 h-4 mr-1" /> Cari</Button>
        </div>
        <div className="text-[11px] text-gray-500">Contoh input manual: AW-170626-0001, GP160626001, aw:batch:GP160626001, atau aw:warung-order:MEJA_ID:ORDER_ID.</div>
      </div>
    </div>
  );
}
