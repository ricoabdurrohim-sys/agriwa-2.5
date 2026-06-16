# AgriWarung v2.5.16 — Inventory A-Z, Cancel Sync & Performance Fix

Tanggal: 2026-06-16

## Fokus patch

1. Inventori ditampilkan urut A-Z agar barang lebih mudah dicari.
2. Pembatalan transaksi/bon disinkronkan ke Keuangan, Dashboard, dan Laporan.
3. Data bon/piutang yang terkait transaksi dibatalkan otomatis ditandai `cancelled` dan pelunasan terkait ditandai `voided`.
4. Finance summary tidak lagi menghitung `customer_debts` berstatus `cancelled`, `void`, atau `deleted`.
5. Repair legacy bon tidak lagi menghidupkan ulang transaksi yang sudah dibatalkan manual.
6. Ditambah reset khusus transaksi & keuangan operasional dari menu Pengaturan dengan konfirmasi `RESET TRANSAKSI`.
7. Proses transaksi kasir dipercepat dengan memindahkan notifikasi/audit/low-stock check ke background task setelah response transaksi.
8. Keuangan dan Laporan memakai response lebih kecil (`limit=500`) dan cache frontend 30 detik agar pindah halaman tidak menghitung/menarik data berat berulang-ulang.

## Reset khusus yang tersedia

Endpoint/UI reset ini menghapus:

- transaksi kasir,
- piutang/bon pelanggan,
- pelunasan bon,
- pemasukan,
- pengeluaran,
- jurnal,
- bank transaction/reconciliation,
- notifikasi,
- order test.

Inventori master, user, supplier, lini bisnis, dan pengaturan tidak dihapus.

Sebelum menghapus transaksi, sistem mencoba mengembalikan stok dari transaksi yang belum dibatalkan supaya data inventori tidak makin kacau.

## File penting berubah

- backend/server.py
- frontend/src/pages/Inventori.jsx
- frontend/src/pages/Keuangan.jsx
- frontend/src/pages/Laporan.jsx
- frontend/src/pages/Pengaturan.jsx

## Verifikasi lokal

- `python3 -m py_compile backend/server.py` berhasil.
- Full build React tetap harus dicek dari Vercel setelah push.
