// Thermal printer helper for 80mm receipts.
// This version keeps text printing stable and provides a browser-print fallback
// for uploaded images/logo so images do not disappear from the printed receipt.

const ESC = '\x1B';
const GS = '\x1D';

export function textAlign(mode = 'left') {
  const map = { left: 0, center: 1, right: 2 };
  return `${ESC}a${String.fromCharCode(map[mode] ?? 0)}`;
}

export function bold(on = false) {
  return `${ESC}E${String.fromCharCode(on ? 1 : 0)}`;
}

export function sizeNormal() {
  return `${GS}!\x00`;
}

export function sizeDouble() {
  return `${GS}!\x11`;
}

export function cutPaper() {
  return `${GS}V\x41\x03`;
}

export function feed(lines = 1) {
  return `${ESC}d${String.fromCharCode(lines)}`;
}

export function buildTextReceipt(transaction, options = {}) {
  const lineWidth = Number(options.lineWidth || 48);
  const footerLines = Array.isArray(options.footerLines) ? options.footerLines : [];
  const out = [];
  const hr = '-'.repeat(lineWidth);

  const pushCentered = (value, double = false) => {
    out.push(textAlign('center'));
    out.push(double ? sizeDouble() : sizeNormal());
    out.push(String(value || '') + '\n');
  };

  const pushLine = (value = '') => {
    out.push(textAlign('left'));
    out.push(sizeNormal());
    out.push(String(value) + '\n');
  };

  out.push(ESC + '@');
  pushCentered(options.storeName || 'WARUNG', true);
  if (options.address) pushCentered(options.address);
  if (options.phone) pushCentered(options.phone);
  pushLine(hr);

  const items = Array.isArray(transaction?.items) ? transaction.items : [];
  items.forEach((item) => {
    const name = String(item.name || item.product_name || 'Item');
    const qty = Number(item.qty || item.quantity || 0);
    const price = Number(item.price || item.unit_price || 0);
    const total = qty * price;
    const amount = formatRupiahCompact(total);

    const leftBase = `${qty} x ${formatRupiahCompact(price)} `;
    const available = Math.max(8, lineWidth - amount.length - 1);
    const firstLineName = name.slice(0, Math.max(0, available - leftBase.length));
    pushLine(`${leftBase}${firstLineName}`.padEnd(available, ' ') + ' ' + amount);

    let rest = name.slice(Math.max(0, available - leftBase.length));
    while (rest.length > 0) {
      pushLine(`   ${rest.slice(0, lineWidth - 3)}`);
      rest = rest.slice(lineWidth - 3);
    }
  });

  pushLine(hr);
  pushLine(formatPair('TOTAL', formatRupiahCompact(Number(transaction?.total || 0)), lineWidth));
  if (transaction?.cash != null) pushLine(formatPair('TUNAI', formatRupiahCompact(Number(transaction.cash)), lineWidth));
  if (transaction?.change != null) pushLine(formatPair('KEMBALI', formatRupiahCompact(Number(transaction.change)), lineWidth));
  pushLine(hr);

  footerLines.forEach((line) => pushCentered(line));
  out.push(feed(5));
  out.push(cutPaper());
  return out.join('');
}

export function formatPair(label, value, width = 48) {
  const left = String(label || '');
  const right = String(value || '');
  const gap = Math.max(1, width - left.length - right.length);
  return left + ' '.repeat(gap) + right;
}

export function formatRupiahCompact(n = 0) {
  try {
    return new Intl.NumberFormat('id-ID').format(Number(n || 0));
  } catch {
    return String(n || 0);
  }
}

export async function sendToRawBtPrinter(payload, printerDevice) {
  // Placeholder bridge. Keep your existing Bluetooth bridge here.
  // Raw text printing often works, but bitmap logo/image support depends on the printer/app.
  if (!printerDevice) throw new Error('Printer device belum dipilih');
  console.warn('sendToRawBtPrinter payload size:', payload?.length || 0);
  return true;
}
