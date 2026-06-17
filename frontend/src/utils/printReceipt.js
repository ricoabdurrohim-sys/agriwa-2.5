import { escapeHtml, normalizeReceiptImage } from './receiptImageHelpers';
import { buildTextReceipt, sendToRawBtPrinter } from './thermalPrinter';

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function buildItemsHtml(items = []) {
  return items.map((item) => {
    const qty = Number(item.qty || item.quantity || 0);
    const price = Number(item.price || item.unit_price || 0);
    const total = qty * price;
    return `
      <div class="item-row">
        <div class="item-name">${escapeHtml(item.name || item.product_name || 'Item')}</div>
        <div class="item-meta">
          <span>${qty} x ${formatCurrency(price)}</span>
          <span>${formatCurrency(total)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function buildReceiptHtml(transaction, options = {}) {
  const footerLines = Array.isArray(options.footerLines) ? options.footerLines : [];
  const footerText = footerLines.map((line) => `<div class="footer-line">${escapeHtml(line)}</div>`).join('');
  const headerImage = options.headerImageDataUrl
    ? `<div class="receipt-image-wrap"><img class="receipt-image" src="${options.headerImageDataUrl}" alt="header" /></div>`
    : '';
  const footerImage = options.footerImageDataUrl
    ? `<div class="receipt-image-wrap"><img class="receipt-image" src="${options.footerImageDataUrl}" alt="footer" /></div>`
    : '';

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt 80mm</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  html, body {
    margin: 0;
    padding: 0;
    width: 80mm;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-family: "Courier New", Courier, monospace;
  }
  * { box-sizing: border-box; }
  .receipt {
    width: 72mm;
    margin: 0 auto;
    padding: 3mm 0 8mm;
    color: #000;
    font-size: 11px;
    line-height: 1.3;
  }
  .center { text-align: center; }
  .title { font-weight: 700; font-size: 16px; }
  .muted { font-size: 10px; }
  .line {
    border-top: 1px dashed #000;
    margin: 6px 0;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .item-row { margin-bottom: 5px; }
  .item-name {
    white-space: normal;
    word-break: break-word;
    font-weight: 700;
  }
  .item-meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .receipt-image-wrap {
    text-align: center;
    margin: 4px 0 8px;
    page-break-inside: avoid;
  }
  .receipt-image {
    display: inline-block;
    max-width: 100%;
    width: auto;
    max-height: 120px;
    object-fit: contain;
  }
  .footer-block {
    margin-top: 8px;
    text-align: center;
    page-break-inside: avoid;
  }
  .footer-line {
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
</head>
<body>
  <div class="receipt">
    ${headerImage}
    <div class="center title">${escapeHtml(options.storeName || 'WARUNG')}</div>
    ${options.address ? `<div class="center muted">${escapeHtml(options.address)}</div>` : ''}
    ${options.phone ? `<div class="center muted">${escapeHtml(options.phone)}</div>` : ''}

    <div class="line"></div>
    <div class="row"><span>No. Transaksi</span><span>${escapeHtml(transaction?.invoice_no || transaction?.id || '-')}</span></div>
    <div class="row"><span>Tanggal</span><span>${escapeHtml(transaction?.created_at_label || transaction?.created_at || '-')}</span></div>
    <div class="line"></div>

    ${buildItemsHtml(transaction?.items || [])}

    <div class="line"></div>
    <div class="row"><strong>TOTAL</strong><strong>${formatCurrency(transaction?.total || 0)}</strong></div>
    ${transaction?.cash != null ? `<div class="row"><span>TUNAI</span><span>${formatCurrency(transaction.cash)}</span></div>` : ''}
    ${transaction?.change != null ? `<div class="row"><span>KEMBALI</span><span>${formatCurrency(transaction.change)}</span></div>` : ''}
    <div class="line"></div>

    <div class="footer-block">
      ${footerText}
      ${footerImage}
    </div>
  </div>
</body>
</html>`;
}

async function openPrintWindowAndWait(html) {
  const win = window.open('', '_blank', 'width=420,height=900');
  if (!win) throw new Error('Popup print diblokir browser');

  win.document.open();
  win.document.write(html);
  win.document.close();

  await new Promise((resolve) => {
    const tryPrint = async () => {
      const images = Array.from(win.document.images || []);
      await Promise.all(images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((res) => {
          img.onload = () => res();
          img.onerror = () => res();
        });
      }));
      setTimeout(resolve, 250);
    };

    if (win.document.readyState === 'complete') {
      tryPrint();
    } else {
      win.onload = tryPrint;
    }
  });

  win.focus();
  win.print();
  setTimeout(() => win.close(), 1200);
}

/**
 * Main print function.
 * modes:
 * - browser80mm: recommended when receipt contains uploaded image/logo.
 * - rawBluetooth: text-focused mode, image output depends on printer/app support.
 */
export async function printReceipt(transaction, options = {}) {
  const mode = options.mode || 'browser80mm';
  const headerImageDataUrl = await normalizeReceiptImage(options.headerImageUrl || options.logoUrl || null);
  const footerImageDataUrl = await normalizeReceiptImage(options.footerImageUrl || null);

  if (mode === 'rawBluetooth') {
    const payload = buildTextReceipt(transaction, options);
    if ((options.headerImageUrl || options.footerImageUrl) && !options.allowImageDropWarningShown) {
      console.warn('Mode rawBluetooth aktif: gambar/logo mungkin tidak tercetak jika printer/app tidak mendukung bitmap image ESC/POS. Gunakan browser80mm agar gambar pasti muncul.');
    }
    return await sendToRawBtPrinter(payload, options.printerDevice);
  }

  const html = buildReceiptHtml(transaction, {
    ...options,
    headerImageDataUrl,
    footerImageDataUrl,
  });
  return await openPrintWindowAndWait(html);
}
