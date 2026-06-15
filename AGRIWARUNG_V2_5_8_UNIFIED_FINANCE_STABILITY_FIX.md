# AgriWarung v2.5.8 — Unified Finance Stability Fix

Patch ini dibuat karena Keuangan, Dashboard, Laporan, dan Kasir sebelumnya masih memakai rumus berbeda-beda sehingga mudah tidak sinkron dan pada kasus tertentu halaman Keuangan blank setelah transaksi kasir.

## Perubahan utama

### 1. Satu sumber kebenaran backend
Ditambahkan endpoint baru:

```text
GET /api/finance/system-summary
```

Endpoint ini menjadi sumber data resmi untuk:

- Keuangan
- Dashboard
- Laporan Keuangan
- Riwayat kasir/ledger kasir

Prinsip hitungnya:

- transaksi asli tetap menyimpan item dan nilai struk;
- pembayaran bon tidak menjadi transaksi penjualan baru;
- pelunasan bon menambah `cash_collected` pada transaksi asli;
- receipt pelunasan bon hanya dokumen bukti, bukan revenue baru;
- satu transaksi rusak tidak boleh membuat seluruh halaman Keuangan crash.

### 2. Keuangan tidak blank lagi
`Keuangan.jsx` ditulis ulang agar:

- membaca `/finance/system-summary`;
- tidak menghitung rumus sendiri;
- jika backend error, halaman tetap tampil pesan error, bukan blank;
- tab Penjualan Kasir menampilkan nilai struk, uang masuk, dan sisa bon dari ledger resmi.

### 3. Laporan memakai ringkasan yang sama
`Laporan.jsx` ditulis ulang agar memakai `/finance/system-summary`, sehingga angka revenue, profit, cashflow, dan transaksi sama dengan Keuangan.

### 4. Dashboard tetap cocok
Endpoint `/dashboard/summary` sekarang mengambil data dari builder yang sama, bukan rumus sendiri.

### 5. Endpoint laporan lama tetap tersedia
Endpoint lama tetap ada, tetapi sekarang mengambil data dari ringkasan resmi:

- `/reports/profit-loss`
- `/reports/balance-sheet`
- `/reports/cash-flow`
- `/reports/cash-balance`

### 6. Tombol muat data contoh diamankan
Endpoint `/seed/sample-data` sekarang dimatikan secara default. Data contoh hanya bisa dipakai kalau environment variable berikut disetel:

```env
ALLOW_SAMPLE_SEED=true
```

Default-nya false agar data asli tidak terhapus.

## File berubah

```text
backend/server.py
frontend/src/pages/Keuangan.jsx
frontend/src/pages/Laporan.jsx
frontend/src/pages/Dashboard.jsx
AGRIWARUNG_V2_5_8_UNIFIED_FINANCE_STABILITY_FIX.md
```

## Test manual setelah deploy

1. Buat transaksi kasir normal.
2. Buka Keuangan, Dashboard, Laporan.
3. Buat transaksi bon partial.
4. Cek Keuangan: pemasukan kasir harus sebesar uang yang sudah diterima.
5. Lunasi bon via Kasir.
6. Cek Keuangan/Dashboard/Laporan: nilai harus sama dan tidak blank.
7. Cek Riwayat Kasir: transaksi asli tetap tampil dengan item lengkap.
