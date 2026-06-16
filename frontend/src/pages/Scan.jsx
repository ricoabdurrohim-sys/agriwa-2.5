import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ScanLine, Search, Camera, XCircle } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Scan() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const initialCode = params.get("code") || "";
  const mode = params.get("mode") || "all";
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const timerRef = useRef(null);
  const [code, setCode] = useState(initialCode);
  const [status, setStatus] = useState(initialCode ? "Membuka hasil scan..." : "Siap scan QR / barcode");
  const [scanning, setScanning] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(true);

  const stopCamera = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    try { streamRef.current?.getTracks?.().forEach((t) => t.stop()); } catch {}
    streamRef.current = null;
    setScanning(false);
  };

  const resolve = async (raw) => {
    const value = String(raw || "").trim();
    if (!value) return toast.error("Kode kosong");
    setStatus("Mencari data...");
    try {
      const { data } = await api.get(`/scan/resolve?code=${encodeURIComponent(value)}`);
      stopCamera();
      toast.success(`Ditemukan: ${data.kind}`);
      nav(data.target || "/kasir");
    } catch (e) {
      setStatus("Tidak ditemukan. Coba scan ulang atau ketik nomor nota/batch.");
      toast.error(e?.response?.data?.detail || "Kode tidak ditemukan");
    }
  };

  const startCamera = async () => {
    if (!("BarcodeDetector" in window)) {
      setCameraSupported(false);
      setStatus("Browser ini belum mendukung kamera scanner. Ketik nomor nota/batch manual.");
      return;
    }
    try {
      detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code", "code_128", "ean_13", "ean_8"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setScanning(true);
      setStatus("Arahkan kamera ke QR/barcode");
      timerRef.current = setInterval(async () => {
        try {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          const codes = await detectorRef.current.detect(videoRef.current);
          if (codes?.length) {
            const raw = codes[0].rawValue;
            if (raw) resolve(raw);
          }
        } catch {}
      }, 650);
    } catch (e) {
      setCameraSupported(false);
      setStatus("Kamera tidak bisa dibuka. Pastikan izin kamera aktif atau gunakan input manual.");
      toast.error("Kamera tidak bisa dibuka");
    }
  };

  useEffect(() => {
    if (initialCode) resolve(initialCode);
    return stopCamera;
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
        <p className="text-xs text-gray-500 leading-relaxed">Scan QR struk untuk membuka detail transaksi, scan QR batch untuk membuka inventori/batch, atau ketik nomor nota/batch secara manual.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="aspect-[4/3] rounded-xl bg-gray-900 overflow-hidden flex items-center justify-center relative">
          <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${scanning ? "block" : "hidden"}`} />
          {!scanning && <div className="text-center text-white/80 p-6"><Camera className="w-12 h-12 mx-auto mb-3 opacity-70" /><div className="text-sm">Kamera belum aktif</div></div>}
          <div className="absolute inset-8 border-2 border-white/70 rounded-2xl pointer-events-none" />
        </div>
        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2">{status}</div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={startCamera} className="bg-[#1a6b3c] hover:bg-[#14522d]" disabled={scanning}><Camera className="w-4 h-4 mr-1.5" /> Mulai Scan</Button>
          <Button variant="outline" onClick={stopCamera} disabled={!scanning}><XCircle className="w-4 h-4 mr-1.5" /> Stop</Button>
        </div>
        {!cameraSupported && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">Gunakan Chrome/Edge terbaru dan izinkan kamera. Di desktop, QR scanner kamera tergantung dukungan browser; input manual tetap bisa dipakai.</div>}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
        <div className="text-sm font-semibold text-gray-900">Input manual</div>
        <div className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && resolve(code)} placeholder="Nomor nota / batch / kode QR" className="font-mono" />
          <Button variant="outline" onClick={() => resolve(code)}><Search className="w-4 h-4 mr-1" /> Cari</Button>
        </div>
      </div>
    </div>
  );
}
