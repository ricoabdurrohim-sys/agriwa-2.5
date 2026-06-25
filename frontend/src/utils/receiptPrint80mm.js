/* AgriWarung v2.5.19 - stable 80mm receipt + QR print helper.
   Backend tetap pakai server.py asli. Tidak membutuhkan server_patched.py. */
import { BACKEND_URL } from '@/lib/api';

const BACKEND_BASE = BACKEND_URL.replace(/\/$/, '');

export function rupiah(value) {
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  } catch (_) {
    return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
  }
}

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function resolveAssetUrl(url) {
  if (!url) return '';
  const src = String(url).trim();
  if (!src) return '';
  if (src.startsWith('data:') || src.startsWith('blob:') || /^https?:\/\//i.test(src)) return src;
  if (src.startsWith('/')) {
    if (BACKEND_BASE) return `${BACKEND_BASE}${src}`;
    return `${window.location.origin}${src}`;
  }
  return src;
}

function normalizeLines(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

function getOption(options, keys, fallback = '') {
  for (const key of keys) {
    if (options[key] !== undefined && options[key] !== null && options[key] !== '') return options[key];
    if (options.businessUnit && options.businessUnit[key] !== undefined && options.businessUnit[key] !== null && options.businessUnit[key] !== '') return options.businessUnit[key];
    if (options.receipt && options.receipt[key] !== undefined && options.receipt[key] !== null && options.receipt[key] !== '') return options.receipt[key];
    if (options.settings && options.settings[key] !== undefined && options.settings[key] !== null && options.settings[key] !== '') return options.settings[key];
  }
  return fallback;
}

function buildQrImage(qrData, qrImageUrl, size = 140) {
  const raw = qrImageUrl || qrData;
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) && !qrData) return resolveAssetUrl(raw);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(raw)}`;
}

function lineHtml(lines, className = '') {
  return normalizeLines(lines)
    .map((line) => `<div class="${className}">${escapeHtml(line)}</div>`)
    .join('');
}

function itemRowsHtml(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const name = item.name || item.product_name || item.item_name || 'Item';
    const qty = Number(item.qty ?? item.quantity ?? 0);
    const price = Number(item.price ?? item.unit_price ?? item.sell_price ?? 0);
    const total = Number(item.total ?? qty * price);
    const notes = item.notes ? `<div class="item-note">${escapeHtml(item.notes)}</div>` : '';
    return `
      <div class="item">
        <div class="item-name">${escapeHtml(name)}</div>
        <div class="item-meta"><span>${qty} x ${rupiah(price)}</span><span>${rupiah(total)}</span></div>
        ${notes}
      </div>`;
  }).join('');
}

async function waitForPrintAssets(win) {
  const images = Array.from(win.document.images || []);
  await Promise.all(images.map((img) => {
    if (img.complete && img.naturalWidth !== 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => resolve();
      img.onload = done;
      img.onerror = done;
      setTimeout(done, 3500);
    });
  }));

  if (win.document.fonts && win.document.fonts.ready) {
    try { await win.document.fonts.ready; } catch (_) {}
  }

  await new Promise((resolve) => setTimeout(resolve, 400));
}

function openAndPrint(html) {
  const win = window.open('', '_blank', 'width=420,height=900');
  if (!win) throw new Error('Popup print diblokir browser. Izinkan popup untuk AgriWarung.');
  win.document.open();
  win.document.write(html);
  win.document.close();

  return waitForPrintAssets(win).then(() => {
    win.focus();
    win.print();
    setTimeout(() => {
      try { win.close(); } catch (_) {}
    }, 1400);
    return true;
  });
}

export function buildReceipt80mmHtml(transaction = {}, options = {}) {
  const businessName = getOption(options, ['receipt_name', 'receiptName', 'business_name', 'businessName', 'name'], 'WARUNG');
  const address = getOption(options, ['receipt_address', 'address'], '');
  const phone = getOption(options, ['receipt_phone', 'phone'], '');
  const headerText = getOption(options, ['receipt_header', 'headerText'], '');
  const receiptNote = getOption(options, ['receipt_note', 'note', 'receiptNote'], '');
  const rawFooterText = getOption(options, ['receipt_footer', 'footerText', 'footer'], 'Terima kasih');
  const footerText = [receiptNote, rawFooterText].filter((x) => String(x || '').trim()).join('\n');
  const logoUrl = resolveAssetUrl(getOption(options, ['receipt_logo', 'receipt_logo_url', 'logo_url', 'logoUrl', 'image_url'], ''));
  const footerImageUrl = resolveAssetUrl(getOption(options, ['receipt_footer_image', 'receipt_footer_image_url', 'footerImageUrl'], ''));
  const qrUrl = buildQrImage(options.qrData, options.qrImageUrl, 110);
  const qrSizeMm = Math.max(8, Math.min(Number(options.qrSizeMm || 11), 18));

  const invoice = transaction.trx_no || transaction.invoice_no || transaction.invoice || transaction.id || '-';
  const dateLabel = transaction.created_at_label || transaction.date_label || transaction.created_at || new Date().toLocaleString('id-ID');
  const total = Number(transaction.total || transaction.grand_total || transaction.amount || 0);
  const cash = transaction.cash ?? transaction.cash_received ?? transaction.paid_amount;
  const change = transaction.change ?? transaction.change_amount;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>AgriWarung Receipt 80mm</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  html, body {
    width: 80mm;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-family: Consolas, "Courier New", monospace;
  }
  * { box-sizing: border-box; }
  .receipt {
    width: 70mm;
    margin: 0 auto;
    padding: 2mm 0 14mm;
    font-size: 9.4px;
    line-height: 1.2;
    overflow: visible;
  }
  .center { text-align: center; }
  .store-name {
    font-size: 10.2px;
    line-height: 1.12;
    font-weight: 700;
    word-break: break-word;
    margin: .8mm 0 .6mm;
  }
  .small { font-size: 8.8px; line-height: 1.16; word-break: break-word; }
  .preline { white-space: pre-line; word-break: break-word; }
  .dash { border-top: 1px dashed #000; margin: 3.5px 0; height: 0; }
  .row { display: flex; justify-content: space-between; gap: 5px; align-items: flex-start; }
  .row > span:last-child { text-align: right; }
  .item { margin: 0 0 3.5px; page-break-inside: avoid; }
  .item-name { font-weight: 700; white-space: normal; word-break: break-word; }
  .item-meta { display: flex; justify-content: space-between; gap: 5px; }
  .item-note { font-size: 8.8px; padding-left: 3mm; word-break: break-word; }
  .logo-wrap, .footer-img-wrap, .qr-wrap { text-align: center; page-break-inside: avoid; }
  .logo { max-width: 34mm; max-height: 12mm; object-fit: contain; margin-bottom: .8mm; }
  .footer-img { max-width: 50mm; max-height: 15mm; object-fit: contain; margin-top: 1.5mm; }
  .qr-img { width: ${qrSizeMm}mm; height: ${qrSizeMm}mm; object-fit: contain; margin: 1.5mm auto .5mm; }
  .footer { margin-top: 4px; text-align: center; page-break-inside: avoid; }
</style>
</head>
<body>
  <div class="receipt">
    ${logoUrl ? `<div class="logo-wrap"><img class="logo" src="${escapeHtml(logoUrl)}" /></div>` : ''}
    <div class="center store-name preline">${escapeHtml(businessName)}</div>
    ${address ? `<div class="center small preline">${escapeHtml(address)}</div>` : ''}
    ${phone ? `<div class="center small preline">${escapeHtml(phone)}</div>` : ''}
    ${headerText ? `<div class="center small preline">${lineHtml(headerText, 'small preline')}</div>` : ''}

    <div class="dash"></div>
    <div class="row"><span>No.</span><span>${escapeHtml(invoice)}</span></div>
    <div class="row"><span>Tanggal</span><span>${escapeHtml(dateLabel)}</span></div>
    ${transaction.table_name ? `<div class="row"><span>Meja</span><span>${escapeHtml(transaction.table_name)}</span></div>` : ''}
    <div class="dash"></div>

    ${itemRowsHtml(transaction.items || transaction.order_items || [])}

    <div class="dash"></div>
    <div class="row"><strong>TOTAL</strong><strong>${rupiah(total)}</strong></div>
    ${cash !== undefined && cash !== null ? `<div class="row"><span>Bayar</span><span>${rupiah(cash)}</span></div>` : ''}
    ${change !== undefined && change !== null ? `<div class="row"><span>Kembali</span><span>${rupiah(change)}</span></div>` : ''}
    <div class="dash"></div>

    ${qrUrl ? `<div class="qr-wrap"><img class="qr-img" src="${escapeHtml(qrUrl)}" /></div>` : ''}

    <div class="footer small preline">
      ${lineHtml(footerText, 'small preline')}
      ${footerImageUrl ? `<div class="footer-img-wrap"><img class="footer-img" src="${escapeHtml(footerImageUrl)}" /></div>` : ''}
    </div>
  </div>
</body>
</html>`;
}

export async function printReceipt80mm(transaction = {}, options = {}) {
  const html = buildReceipt80mmHtml(transaction, {
    ...options,
    qrSizeMm: options.qrSizeMm || 11,
  });
  return openAndPrint(html);
}

export async function printReceipt(transaction = {}, options = {}) {
  return printReceipt80mm(transaction, options);
}

export function buildTableQr80mmHtml(table = {}, options = {}) {
  const tableName = table.table_name || table.name || options.tableName || 'Meja';
  const qrData = table.url || options.url || options.qrData || '';
  const qrUrl = buildQrImage(qrData, options.qrImageUrl, 180);
  const businessName = options.businessName || options.receiptName || 'AgriWarung';
  const qrSizeMm = Math.max(22, Math.min(Number(options.qrSizeMm || 30), 38));

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>QR Meja</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  html, body { width:80mm; margin:0; padding:0; background:#fff; color:#000; font-family:Consolas,"Courier New",monospace; }
  * { box-sizing:border-box; }
  .qr-ticket { width:72mm; margin:0 auto; padding:4mm 0 10mm; text-align:center; }
  .brand { font-size:10.4px; font-weight:700; word-break:break-word; white-space:pre-line; }
  .title { font-size:12px; font-weight:800; margin-top:2mm; }
  .table { font-size:17px; font-weight:900; margin:2mm 0; word-break:break-word; }
  .qr { width:${qrSizeMm}mm; height:${qrSizeMm}mm; object-fit:contain; margin:1mm auto 2mm; }
  .url { font-size:7.5px; word-break:break-all; }
  .dash { border-top:1px dashed #000; margin:3mm 0; }
</style>
</head>
<body>
  <div class="qr-ticket">
    <div class="brand">${escapeHtml(businessName)}</div>
    <div class="dash"></div>
    <div class="title">QR MEJA</div>
    <div class="table">${escapeHtml(tableName)}</div>
    ${qrUrl ? `<img class="qr" src="${escapeHtml(qrUrl)}" />` : ''}
    ${options.showUrl === true ? `<div class="url">${escapeHtml(qrData)}</div>` : ''}
    <div class="dash"></div>
  </div>
</body>
</html>`;
}

export async function printTableQr80mm(table = {}, options = {}) {
  const html = buildTableQr80mmHtml(table, options);
  return openAndPrint(html);
}
