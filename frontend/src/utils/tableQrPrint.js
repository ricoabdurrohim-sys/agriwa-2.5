import { printTableQr80mm } from './receiptPrint80mm';

function buildSelfOrderUrl(tableId) {
  const id = encodeURIComponent(tableId);
  return `${window.location.origin}/self-order/table/${id}`;
}

export async function printTableQr(table, options = {}) {
  const tableId = table?.id || table?.table_id;
  if (!tableId) throw new Error('Data meja tidak lengkap');
  const meta = {
    id: tableId,
    name: table?.name || table?.table_name || `Meja ${tableId}`,
    table_name: table?.table_name || table?.name || `Meja ${tableId}`,
    url: table?.url || buildSelfOrderUrl(tableId),
  };
  return printTableQr80mm(meta, {
    ...options,
    businessName: options.businessName || options.receiptName || 'AgriWarung',
    qrSizeMm: options.qrSizeMm || 30,
  });
}
