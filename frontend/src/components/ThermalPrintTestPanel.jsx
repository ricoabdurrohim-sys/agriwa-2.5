import React from 'react';
import { printReceipt80mm } from '../utils/receiptPrint80mm';

export default function ThermalPrintTestPanel({ businessUnit }) {
  const test = () => {
    printReceipt80mm({
      trx_no: 'TEST-80MM',
      table_name: 'Meja 1',
      created_at_label: new Date().toLocaleString('id-ID'),
      items: [
        { name: 'Soto ayam dengan nama menu panjang', quantity: 1, unit_price: 15000 },
        { name: 'Gorengan', quantity: 3, unit_price: 1000 },
        { name: 'Kerupuk', quantity: 2, unit_price: 1500 },
      ],
      total: 21000,
      cash: 25000,
      change: 4000,
    }, {
      businessUnit,
      qrSizeMm: 15,
      footerText: businessUnit?.receipt_footer || 'Terima kasih\nSilakan datang kembali',
    });
  };

  return <button type="button" onClick={test}>Test Print 80mm</button>;
}
