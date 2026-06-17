// ESC/POS thermal printer via Web Bluetooth
// Stabilized for AgriWarung 80mm receipts. Keeps the original Bluetooth flow,
// adds 80mm text layout, smaller QR, optional logo bitmap, and fast chunk writes.

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

async function writeEscPos(data) {
  const printer = await ensurePrinter();
  const chunkSize = 160;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    if (printer.characteristic.writeValueWithoutResponse) {
      await printer.characteristic.writeValueWithoutResponse(chunk);
    } else {
      await printer.characteristic.writeValue(chunk);
    }
    await sleep(12);
  }
}

function normalizeLines(value = "") {
  return String(value || "").replace(/\r\n/g, "\n").split("\n").map((s) => s.trim()).filter(Boolean);
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

function centerText(s, width = 48) {
  s = String(s || "");
  if (s.length >= width) return s;
  return " ".repeat(Math.floor((width - s.length) / 2)) + s;
}

async function imageUrlToEscposRaster(url, maxWidth = 256) {
  if (!url || typeof document === "undefined") return new Uint8Array([]);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const ratio = Math.min(1, maxWidth / (img.naturalWidth || maxWidth));
    const w = Math.max(8, Math.floor((img.naturalWidth || maxWidth) * ratio));
    const h = Math.max(8, Math.floor((img.naturalHeight || 80) * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const bytesPerRow = Math.ceil(w / 8);
    const raster = new Uint8Array(bytesPerRow * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (data[idx + 3] > 40 && lum < 160) {
          raster[y * bytesPerRow + (x >> 3)] |= (0x80 >> (x & 7));
        }
      }
    }
    return concat(
      bytes(ESC, 0x61, 0x01),
      bytes(GS, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff),
      raster,
      strBytes("\n")
    );
  } catch (e) {
    console.warn("Logo/gambar struk tidak bisa dikonversi ke ESC/POS, struk tetap dicetak teks.", e);
    return new Uint8Array([]);
  }
}

export async function printReceipt(receipt, opts = {}) {
  const width = Number(opts.width || 48); // 80mm = ±48 chars in normal font
  const headerName = (opts.headerName || opts.businessName || "AGRIWARUNG");
  const subLine = opts.subLine || opts.address || "";
  const phoneLine = opts.phone || "";
  const footer = opts.footer || "Terima kasih!";
  const note = opts.note || "";
  const logoUrl = opts.logoUrl || opts.logo_url || "";
  const cmds = [];

  cmds.push(bytes(ESC, 0x40));
  cmds.push(bytes(ESC, 0x74, 0x00)); // codepage default
  const logo = await imageUrlToEscposRaster(logoUrl, 220);
  if (logo.length) cmds.push(logo);

  cmds.push(bytes(ESC, 0x61, 0x01));
  cmds.push(bytes(GS, 0x21, 0x00)); // jangan double size agar nama usaha tidak kegedean
  for (const line of normalizeLines(headerName).flatMap((l) => wrapText(l.toUpperCase(), width))) cmds.push(strBytes(centerText(line, width) + "\n"));
  for (const line of normalizeLines(subLine).flatMap((l) => wrapText(l, width))) cmds.push(strBytes(centerText(line, width) + "\n"));
  if (phoneLine) for (const line of wrapText("Telp: " + phoneLine, width)) cmds.push(strBytes(centerText(line, width) + "\n"));
  cmds.push(strBytes("-".repeat(width) + "\n"));
  cmds.push(bytes(ESC, 0x61, 0x00));
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
  cmds.push(bytes(ESC, 0x45, 0x01));
  cmds.push(strBytes(padPair("TOTAL", formatRp(receipt.total || 0), width) + "\n"));
  cmds.push(bytes(ESC, 0x45, 0x00));
  if (receipt.payment_method === "cash") {
    cmds.push(strBytes(padPair("Bayar", formatRp(receipt.cash_received || 0), width) + "\n"));
    cmds.push(strBytes(padPair("Kembali", formatRp(receipt.change || 0), width) + "\n"));
  } else if (receipt.payment_method) {
    cmds.push(strBytes(`Metode: ${String(receipt.payment_method).toUpperCase()}\n`));
  }
  if (receipt.trx_no) {
    cmds.push(strBytes("-".repeat(width) + "\n"));
    cmds.push(bytes(ESC, 0x61, 0x01));
    cmds.push(escposQr(String(receipt.trx_no), 4)); // lebih kecil untuk 80mm
    cmds.push(strBytes(String(receipt.trx_no) + "\n"));
  }
  cmds.push(strBytes("-".repeat(width) + "\n"));
  cmds.push(bytes(ESC, 0x61, 0x01));
  for (const line of normalizeLines(note).flatMap((l) => wrapText(l, width))) cmds.push(strBytes(centerText(line, width) + "\n"));
  for (const line of normalizeLines(footer).flatMap((l) => wrapText(l, width))) cmds.push(strBytes(centerText(line, width) + "\n"));
  cmds.push(strBytes("\n\n\n"));
  cmds.push(bytes(GS, 0x56, 0x00));

  await writeEscPos(concat(...cmds));
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
  cmds.push(bytes(ESC, 0x61, 0x01));
  cmds.push(bytes(GS, 0x21, 0x00));
  cmds.push(strBytes(String(title || "LABEL").slice(0, 42).toUpperCase() + "\n"));
  if (subtitle) cmds.push(strBytes(String(subtitle).slice(0, 48) + "\n"));
  cmds.push(strBytes("-".repeat(48) + "\n"));
  cmds.push(bytes(ESC, 0x61, 0x00));
  for (const line of safeLines) for (const l of wrapText(line, 48)) cmds.push(strBytes(l + "\n"));
  if (qrData) {
    cmds.push(strBytes("-".repeat(48) + "\n"));
    cmds.push(bytes(ESC, 0x61, 0x01));
    cmds.push(escposQr(qrData, 4));
  }
  if (barcodeData) cmds.push(escposCode128(barcodeData));
  if (footer) cmds.push(strBytes(String(footer).slice(0, 48) + "\n"));
  cmds.push(strBytes("\n\n\n"));
  cmds.push(bytes(GS, 0x56, 0x00));
  await writeEscPos(concat(...cmds));
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
