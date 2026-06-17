# AgriWarung v2.5.16 - Print 80mm, Gambar Struk, QR Meja

## Fokus patch

1. Rapikan print struk 80mm.
2. Kecilkan font nama usaha.
3. Header/footer di Lini Bisnis bisa pakai Enter/multi-baris.
4. Gambar/logo upload ikut tampil di kertas print.
5. QR code di struk dikecilkan.
6. Teks “scan QR/ketik nomor nota” dihilangkan.
7. Tambah fitur print QR meja untuk self-order.
8. Customer scan QR meja → tambah pesanan ke meja itu → kasir lanjut checkout.

## Catatan penting print gambar

Mode yang paling aman untuk gambar/logo adalah print HTML 80mm/browser print. Raw Bluetooth ESC/POS sering hanya stabil untuk teks. Patch ini membuat browser menunggu gambar selesai dimuat sebelum memanggil `print()`.

## Backend baru

`server_patched.py` menambah endpoint:

- `GET /api/tables/{table_id}/qr-meta`
- `GET /api/public/tables/{table_id}`
- `POST /api/public/tables/{table_id}/orders`

Endpoint ini tidak menghapus endpoint lama.

## Frontend baru

- `receiptPrint80mm.js`: renderer struk 80mm baru.
- `printReceipt.js`: re-export supaya import lama tetap jalan.
- `tableQrPrint.js`: helper print QR meja.
- `TableQrPrintButton.jsx`: tombol print QR meja.
- `TableSelfOrder.jsx`: halaman public customer setelah scan QR.
- `ReceiptSettingsFields.jsx`: textarea multi-line dan upload gambar receipt.

## Review integrasi

- Warung tetap pusat order meja.
- QR meja hanya menambah order ke meja terkait.
- Kasir tetap titik pembayaran.
- Transaksi keuangan tetap dibuat saat checkout kasir, bukan saat customer scan QR.
- Gambar upload memakai `/api/uploads/...` dari backend dan otomatis diubah menjadi URL penuh saat print.
