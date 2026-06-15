// ESC/POS thermal printer via Web Bluetooth
// Compatible with most 58mm/80mm Bluetooth thermal printers

const PRINTER_SERVICE = "000018f0-0000-1000-8000-00805f9b34fb";
const PRINTER_CHAR = "00002af1-0000-1000-8000-00805f9b34fb";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

function bytes(...arr) { return new Uint8Array(arr); }

function strBytes(s) {
  const enc = new TextEncoder();
  return enc.encode(s);
}

function concat(...arrays) {
  let len = 0;
  for (const a of arrays) len += a.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

export async function connectPrinter() {
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth tidak didukung di browser ini. Gunakan Chrome/Edge Android atau desktop.");
  }
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [PRINTER_SERVICE],
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(PRINTER_SERVICE);
  const characteristic = await service.getCharacteristic(PRINTER_CHAR);
  // Save for later use (in-memory only)
  window.__awPrinter = { device, characteristic };
  localStorage.setItem("aw_printer_name", device.name || "Printer");
  return device.name;
}

export async function printReceipt(receipt, opts = {}) {
  let printer = window.__awPrinter;
  if (!printer?.characteristic) {
    await connectPrinter();
    printer = window.__awPrinter;
  }
  const headerName = (opts.headerName || "AGRIWARUNG").toUpperCase();
  const subLine = opts.subLine || "";
  const phoneLine = opts.phone || "";
  const footer = opts.footer || "Terima kasih!";
  const cmds = [];
  // Initialize
  cmds.push(bytes(ESC, 0x40));
  // Center, big
  cmds.push(bytes(ESC, 0x61, 0x01));
  cmds.push(bytes(GS, 0x21, 0x11));
  cmds.push(strBytes(headerName + "\n"));
  cmds.push(bytes(GS, 0x21, 0x00));
  if (subLine) cmds.push(strBytes(subLine + "\n"));
  if (phoneLine) cmds.push(strBytes("Telp: " + phoneLine + "\n"));
  cmds.push(strBytes("--------------------------------\n"));
  // Left align
  cmds.push(bytes(ESC, 0x61, 0x00));
  cmds.push(strBytes(`No: ${receipt.trx_no}\n`));
  cmds.push(strBytes(`${new Date(receipt.created_at).toLocaleString("id-ID")}\n`));
  cmds.push(strBytes("--------------------------------\n"));
  for (const it of receipt.items) {
    cmds.push(strBytes(`${it.name}\n`));
    cmds.push(strBytes(`  ${it.quantity}x ${formatRp(it.unit_price)} = ${formatRp(it.unit_price * it.quantity)}\n`));
  }
  cmds.push(strBytes("--------------------------------\n"));
  cmds.push(strBytes(`Subtotal : ${formatRp(receipt.subtotal)}\n`));
  if (receipt.discount > 0) cmds.push(strBytes(`Diskon   : -${formatRp(receipt.discount)}\n`));
  cmds.push(bytes(ESC, 0x45, 0x01));
  cmds.push(strBytes(`TOTAL    : ${formatRp(receipt.total)}\n`));
  cmds.push(bytes(ESC, 0x45, 0x00));
  if (receipt.payment_method === "cash") {
    cmds.push(strBytes(`Bayar    : ${formatRp(receipt.cash_received)}\n`));
    cmds.push(strBytes(`Kembali  : ${formatRp(receipt.change)}\n`));
  } else {
    cmds.push(strBytes(`Bayar    : ${receipt.payment_method.toUpperCase()}\n`));
  }
  cmds.push(strBytes("--------------------------------\n"));
  cmds.push(bytes(ESC, 0x61, 0x01));
  // Multi-line footer support
  for (const line of String(footer).split("\n")) {
    cmds.push(strBytes(line + "\n"));
  }
  cmds.push(strBytes("\n\n"));
  // Cut
  cmds.push(bytes(GS, 0x56, 0x00));

  const data = concat(...cmds);
  // Send in chunks of 100 bytes (BLE MTU limit)
  const chunkSize = 100;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    await printer.characteristic.writeValueWithoutResponse(chunk);
    await new Promise(r => setTimeout(r, 30));
  }
}

function formatRp(n) {
  const abs = Math.abs(Math.round(n));
  return "Rp" + abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function isPrinterAvailable() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

export function getSavedPrinterName() {
  return localStorage.getItem("aw_printer_name");
}
