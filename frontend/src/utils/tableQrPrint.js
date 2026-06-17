import { printTableQr80mm } from './receiptPrint80mm';

const API_BASE = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/$/, '');

function getToken() {
  return localStorage.getItem('token') || localStorage.getItem('access_token') || '';
}

export async function fetchTableQrMeta(tableId) {
  if (!tableId) throw new Error('tableId kosong');
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/tables/${tableId}/qr-meta`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Gagal mengambil data QR meja');
  }
  return res.json();
}

export async function printTableQr(table, options = {}) {
  const meta = table.url ? table : await fetchTableQrMeta(table.id || table.table_id);
  return printTableQr80mm(meta, {
    ...options,
    businessName: options.businessName || options.receiptName || 'AgriWarung',
    qrSizeMm: options.qrSizeMm || 34,
  });
}
