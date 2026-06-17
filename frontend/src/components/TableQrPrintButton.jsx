import React, { useState } from 'react';
import { printTableQr } from '../utils/tableQrPrint';

export default function TableQrPrintButton({ table, businessName, className = '' }) {
  const [loading, setLoading] = useState(false);

  const handlePrint = async () => {
    if (!table?.id && !table?.table_id) {
      alert('Data meja tidak lengkap');
      return;
    }
    try {
      setLoading(true);
      await printTableQr(table, { businessName, qrSizeMm: 30 });
    } catch (err) {
      console.error(err);
      alert(err?.message || 'Gagal print QR meja');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button type="button" className={className || 'btn btn-sm btn-outline-primary'} onClick={handlePrint} disabled={loading}>
      {loading ? 'Menyiapkan QR...' : 'Print QR Meja'}
    </button>
  );
}
