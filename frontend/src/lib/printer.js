// ESC/POS thermal printer via Web Bluetooth
// AgriWarung 80mm stable print helper.
// Keeps the old Bluetooth UUID flow that already worked, but fixes 80mm alignment,
// business-name font weight, direct table-order QR print, and logo bitmap conversion.

const PRINTER_SERVICE = "000018f0-0000-1000-8000-00805f9b34fb";
const PRINTER_CHAR = "00002af1-0000-1000-8000-00805f9b34fb";

const ESC = 0x1b;
const GS = 0x1d;

function bytes(...arr) { return new Uint8Array(arr); }

function strBytes(s) {
  return new TextEncoder().encode(String(s ?? ""));
}

function concat(...arrays) {
  let len = 0;
  for (const a of arrays) len += a.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function connectPrinter() {
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth tidak tersedia di browser ini. Pakai fallback print browser 80mm.");
  }
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [PRINTER_SERVICE],
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(PRINTER_SERVICE);
  const characteristic = await service.getCharacteristic(PRINTER_CHAR);
  window.__awPrinter = { device, characteristic };
  localStorage.setItem("aw_printer_name", device.name || "Printer");
  device.addEventListener?.("gattserverdisconnected", () => {
    if (window.__awPrinter?.device?.id === device.id) window.__awPrinter = null;
  });
  return device.name || "Printer";
}

async function ensurePrinter() {
  let printer = window.__awPrinter;
  if (printer?.device && !printer.device.gatt?.connected) {
    try {
      const server = await printer.device.gatt.connect();
      const service = await server.getPrimaryService(PRINTER_SERVICE);
      const characteristic = await service.getCharacteristic(PRINTER_CHAR);
      printer = { device: printer.device, characteristic };
      window.__awPrinter = printer;
    } catch {
      printer = null;
      window.__awPrinter = null;
    }
  }
  if (!printer?.characteristic) {
    await connectPrinter();
    printer = window.__awPrinter;
  }
  return printer;
}

async function writeEscPos(data, opts = {}) {
  const printer = await ensurePrinter();
  const chunkSize = Number(opts.chunkSize || 128);
  const delay = Number(opts.delay || 10);
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    if (printer.characteristic.writeValueWithoutResponse) {
      await printer.characteristic.writeValueWithoutResponse(chunk);
    } else {
      await printer.characteristic.writeValue(chunk);
    }
    if (delay > 0) await sleep(delay);
  }
}

function normalizeLines(value = "") {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function wrapText(text, width = 48) {
  const raw = String(text || "").trim();
  if (!raw) return [""];
  const words = raw.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if ((line + " " + word).length <= width) line += " " + word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.flatMap((l) => l.length <= width ? [l] : l.match(new RegExp(`.{1,${width}}`, "g")) || [l]);
}

function padPair(left, right, width = 48) {
  left = String(left || ""); right = String(right || "");
  if (left.length + right.length + 1 > width) return `${left}\n${right.padStart(width, " ")}`;
  return left + " ".repeat(width - left.length - right.length) + right;
}

function align(mode = "left") {
  const map = { left: 0, center: 1, right: 2 };
  return bytes(ESC, 0x61, map[mode] ?? 0);
}

function bold(on = true) { return bytes(ESC, 0x45, on ? 1 : 0); }
function textSize(n = 0x00) { return bytes(GS, 0x21, n); }

function pushCenteredLines(cmds, text, width = 48, { uppercase = false, boldText = false, size = 0x00 } = {}) {
  const lines = normalizeLines(text).flatMap((l) => wrapText(uppercase ? l.toUpperCase() : l, width));
  if (!lines.length) return;
  cmds.push(align("center"));
  cmds.push(bold(boldText));
  cmds.push(textSize(size));
  // Important: do not manually pad spaces here. ESC/POS align center handles centering.
  for (const line of lines) cmds.push(strBytes(line + "\n"));
  cmds.push(textSize(0x00));
  cmds.push(bold(false));
}

function resolveMaybeRelativeUrl(url) {
  if (!url) return "";
  const raw = String(url);
  if (raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("http")) return raw;
  const backend = process.env.REACT_APP_BACKEND_URL || "";
  if (raw.startsWith("/api/uploads/") && backend) return `${backend}${raw}`;
  if (raw.startsWith("/")) return `${window.location.origin}${raw}`;
  return raw;
}

async function loadImageElement(url) {
  const absolute = resolveMaybeRelativeUrl(url);
  if (!absolute || typeof document === "undefined") return null;

  // Fetch-to-blob first. This usually avoids canvas tainting and is the most reliable
  // path for HF /api/uploads/* images before converting to ESC/POS raster bytes.
  try {
    const token = localStorage.getItem("aw_token") || "";
    const res = await fetch(absolute, {
      mode: "cors",
      credentials: "omit",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: "no-store",
    });
    if (res.ok) {
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = objectUrl;
      });
      img.__awObjectUrl = objectUrl;
      return img;
    }
  } catch (e) {
    console.warn("Gagal fetch logo untuk ESC/POS, coba mode image biasa.", e);
  }

  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = absolute;
    });
    return img;
  } catch (e) {
    console.warn("Logo/gambar tidak bisa dimuat untuk print thermal.", e);
    return null;
  }
}

async function imageUrlToEscposRaster(url, maxWidth = 256) {
  const img = await loadImageElement(url);
  if (!img) return new Uint8Array([]);
  try {
    const ratio = Math.min(1, maxWidth / (img.naturalWidth || img.width || maxWidth));
    let w = Math.max(8, Math.floor((img.naturalWidth || img.width || maxWidth) * ratio));
    let h = Math.max(8, Math.floor((img.naturalHeight || img.height || 80) * ratio));
    // ESC/POS raster rows are cleaner when width is divisible by 8.
    w = Math.max(8, Math.floor(w / 8) * 8);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;

    // Simple ordered dithering so colored logos still have visible detail on 1-bit thermal print.
    const bayer = [
      [15, 135, 45, 165],
      [195, 75, 225, 105],
      [60, 180, 30, 150],
      [240, 120, 210, 90],
    ];
    const bytesPerRow = Math.ceil(w / 8);
    const raster = new Uint8Array(bytesPerRow * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const alpha = rgba[idx + 3];
        const lum = 0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2];
        const threshold = bayer[y % 4][x % 4];
        if (alpha > 40 && lum < threshold) {
          raster[y * bytesPerRow + (x >> 3)] |= (0x80 >> (x & 7));
        }
      }
    }
    try { if (img.__awObjectUrl) URL.revokeObjectURL(img.__awObjectUrl); } catch {}
    return concat(
      align("center"),
      bytes(GS, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff),
      raster,
      strBytes("\n")
    );
  } catch (e) {
    console.warn("Logo/gambar struk tidak bisa dikonversi ke ESC/POS. Browser print tetap bisa menampilkan gambar.", e);
    return new Uint8Array([]);
  }
}

function hasThermalUnsupportedChars(text = "") {
  // Thermal printer codepages usually cannot print emoji/Unicode. Rasterize them so emoticon/footer tetap terlihat.
  return /[^ -]/.test(String(text || ""));
}

async function centeredTextToEscposRaster(text, widthDots = 384, { fontSize = 20, boldText = false } = {}) {
  if (!text || typeof document === "undefined") return new Uint8Array([]);
  try {
    const lines = normalizeLines(text).flatMap((l) => wrapText(l, 28));
    if (!lines.length) return new Uint8Array([]);
    const lineHeight = Math.ceil(fontSize * 1.45);
    const paddingY = 4;
    const canvas = document.createElement("canvas");
    canvas.width = widthDots;
    canvas.height = Math.max(12, lines.length * lineHeight + paddingY * 2);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${boldText ? "700" : "400"} ${fontSize}px Arial, Helvetica, "Noto Color Emoji", "Apple Color Emoji", sans-serif`;
    lines.forEach((line, idx) => ctx.fillText(line, widthDots / 2, paddingY + lineHeight * idx + lineHeight / 2));
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const bytesPerRow = Math.ceil(canvas.width / 8);
    const raster = new Uint8Array(bytesPerRow * canvas.height);
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        const alpha = rgba[i + 3];
        const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
        if (alpha > 40 && lum < 170) raster[y * bytesPerRow + (x >> 3)] |= (0x80 >> (x & 7));
      }
    }
    return concat(
      align("center"),
      bytes(GS, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, canvas.height & 0xff, (canvas.height >> 8) & 0xff),
      raster,
      strBytes("
")
    );
  } catch (e) {
    console.warn("Gagal rasterize teks unicode untuk thermal", e);
    return new Uint8Array([]);
  }
}

async function pushCenteredLinesSmart(cmds, text, width = 48, opts = {}) {
  if (!String(text || "").trim()) return;
  if (hasThermalUnsupportedChars(text)) {
    const raster = await centeredTextToEscposRaster(text, 384, { fontSize: opts.size === 0x10 ? 24 : 19, boldText: !!opts.boldText });
    if (raster.length) { cmds.push(raster); return; }
  }
  pushCenteredLines(cmds, text, width, opts);
}

export async function printReceipt(receipt, opts = {}) {
  const width = Number(opts.width || 48); // 80mm = ±48 chars in normal font
  const headerName = (opts.headerName || opts.businessName || "AGRIWARUNG");
  const subLine = opts.subLine || opts.address || "";
  const phoneLine = opts.phone || "";
  const footer = opts.footer == null ? "" : String(opts.footer || "");
  const note = opts.note == null ? "" : String(opts.note || "");
  const logoUrl = opts.logoUrl || opts.logo_url || "";
  const cmds = [];

  cmds.push(bytes(ESC, 0x40));
  cmds.push(bytes(ESC, 0x74, 0x00)); // codepage default
  const logo = await imageUrlToEscposRaster(logoUrl, 256);
  if (logo.length) cmds.push(logo);

  // Nama lini bisnis: lebih besar dan bold, tapi tidak double-width agar tetap muat 80mm.
  await pushCenteredLinesSmart(cmds, headerName, width, { uppercase: true, boldText: true, size: 0x10 });
  await pushCenteredLinesSmart(cmds, subLine, width, { uppercase: false, boldText: false, size: 0x00 });
  if (phoneLine) await pushCenteredLinesSmart(cmds, "Telp: " + phoneLine, width, { uppercase: false, boldText: false, size: 0x00 });

  cmds.push(align("left"));
  cmds.push(strBytes("-".repeat(width) + "\n"));
  cmds.push(strBytes(`No: ${receipt.trx_no || receipt.id || "-"}\n`));
  if (receipt.queue_no) cmds.push(strBytes(`Antrian: ${receipt.queue_no}\n`));
  cmds.push(strBytes(`${receipt.created_at ? new Date(receipt.created_at).toLocaleString("id-ID") : new Date().toLocaleString("id-ID")}\n`));
  if (receipt.customer_name) cmds.push(strBytes(`Pelanggan: ${receipt.customer_name}\n`));
  cmds.push(strBytes("-".repeat(width) + "\n"));

  for (const it of receipt.items || []) {
    for (const line of wrapText(it.name, width)) cmds.push(strBytes(line + "\n"));
    cmds.push(strBytes(padPair(`  ${it.quantity} x ${formatRp(it.unit_price)}`, formatRp(Number(it.unit_price || 0) * Number(it.quantity || 0)), width) + "\n"));
  }
  cmds.push(strBytes("-".repeat(width) + "\n"));
  cmds.push(strBytes(padPair("Subtotal", formatRp(receipt.subtotal || receipt.total || 0), width) + "\n"));
  if (Number(receipt.discount || 0) > 0) cmds.push(strBytes(padPair("Diskon", "-" + formatRp(receipt.discount), width) + "\n"));
  cmds.push(bold(true));
  cmds.push(strBytes(padPair("TOTAL", formatRp(receipt.total || 0), width) + "\n"));
  cmds.push(bold(false));
  if (receipt.payment_method === "cash") {
    cmds.push(strBytes(padPair("Bayar", formatRp(receipt.cash_received || 0), width) + "\n"));
    cmds.push(strBytes(padPair("Kembali", formatRp(receipt.change || 0), width) + "\n"));
  } else if (receipt.payment_method) {
    cmds.push(strBytes(`Metode: ${String(receipt.payment_method).toUpperCase()}\n`));
  }
  if (receipt.trx_no) {
    cmds.push(strBytes("-".repeat(width) + "\n"));
    cmds.push(align("center"));
    cmds.push(escposQr(String(receipt.trx_no), 3)); // kecil dan rapi untuk 80mm
  }
  cmds.push(strBytes("-".repeat(width) + "\n"));
  await pushCenteredLinesSmart(cmds, note, width, { uppercase: false, boldText: false, size: 0x00 });
  await pushCenteredLinesSmart(cmds, footer, width, { uppercase: false, boldText: false, size: 0x00 });
  cmds.push(strBytes("\n\n\n"));
  cmds.push(bytes(GS, 0x56, 0x00));

  await writeEscPos(concat(...cmds), { chunkSize: logo.length ? 96 : 160, delay: logo.length ? 14 : 8 });
}

function escposQr(data, size = 4) {
  const payload = strBytes(String(data || ""));
  const storeLen = payload.length + 3;
  const pL = storeLen % 256;
  const pH = Math.floor(storeLen / 256);
  return concat(
    bytes(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00),
    bytes(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.max(3, Math.min(6, size))),
    bytes(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31),
    bytes(GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30),
    payload,
    bytes(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30),
    strBytes("\n")
  );
}

function escposCode128(data) {
  const text = String(data || '').slice(0, 60);
  if (!text) return new Uint8Array([]);
  const payload = concat(bytes(0x7b, 0x42), strBytes(text));
  return concat(
    bytes(GS, 0x68, 0x50),
    bytes(GS, 0x77, 0x02),
    bytes(GS, 0x48, 0x02),
    bytes(GS, 0x6b, 0x49, payload.length),
    payload
  );
}

export async function printThermalLabel({ title = "LABEL", subtitle = "", lines = [], qrData = "", barcodeData = "", footer = "" } = {}) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const cmds = [];
  cmds.push(bytes(ESC, 0x40));
  pushCenteredLines(cmds, title || "LABEL", 48, { uppercase: true, boldText: true, size: 0x10 });
  if (subtitle) pushCenteredLines(cmds, subtitle, 48, { uppercase: false, boldText: false, size: 0x00 });
  cmds.push(align("left"));
  cmds.push(strBytes("-".repeat(48) + "\n"));
  for (const line of safeLines) for (const l of wrapText(line, 48)) cmds.push(strBytes(l + "\n"));
  if (qrData) {
    cmds.push(strBytes("-".repeat(48) + "\n"));
    cmds.push(align("center"));
    cmds.push(escposQr(qrData, 3));
  }
  if (barcodeData) cmds.push(escposCode128(barcodeData));
  if (footer) pushCenteredLines(cmds, footer, 48, { uppercase: false, boldText: false, size: 0x00 });
  cmds.push(strBytes("\n\n\n"));
  cmds.push(bytes(GS, 0x56, 0x00));
  await writeEscPos(concat(...cmds), { chunkSize: 128, delay: 8 });
}

export async function printThermalOrderQr({ tableName = "Meja", orderCode = "", items = [], total = 0, qrData = "", footer = "" } = {}) {
  const cmds = [];
  cmds.push(bytes(ESC, 0x40));
  pushCenteredLines(cmds, "QR PESANAN", 48, { uppercase: true, boldText: true, size: 0x10 });
  pushCenteredLines(cmds, tableName, 48, { uppercase: false, boldText: true, size: 0x00 });
  if (orderCode) pushCenteredLines(cmds, String(orderCode), 48, { uppercase: false, boldText: false, size: 0x00 });
  cmds.push(align("left"));
  cmds.push(strBytes("-".repeat(48) + "\n"));
  for (const it of items || []) {
    for (const line of wrapText(it.name, 48)) cmds.push(strBytes(line + "\n"));
    cmds.push(strBytes(padPair(`  ${it.quantity} x ${formatRp(it.unit_price)}`, formatRp(Number(it.unit_price || 0) * Number(it.quantity || 0)), 48) + "\n"));
  }
  cmds.push(strBytes("-".repeat(48) + "\n"));
  cmds.push(bold(true));
  cmds.push(strBytes(padPair("Total", formatRp(total), 48) + "\n"));
  cmds.push(bold(false));
  if (qrData) {
    cmds.push(strBytes("-".repeat(48) + "\n"));
    cmds.push(align("center"));
    cmds.push(escposQr(qrData, 3));
  }
  pushCenteredLines(cmds, footer, 48, { uppercase: false, boldText: false, size: 0x00 });
  cmds.push(strBytes("\n\n\n"));
  cmds.push(bytes(GS, 0x56, 0x00));
  await writeEscPos(concat(...cmds), { chunkSize: 128, delay: 8 });
}

function formatRp(n) {
  const abs = Math.abs(Math.round(Number(n || 0)));
  return "Rp" + abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function isPrinterAvailable() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

export function getSavedPrinterName() {
  return localStorage.getItem("aw_printer_name");
}
