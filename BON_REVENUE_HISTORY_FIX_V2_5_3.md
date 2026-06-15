# AgriWarung v2.5.3 — Bon Revenue & History Canonical Fix

Patch ini memperbaiki bug lanjutan pada pembayaran bon:

- Saat pembayaran sebagian, pendapatan kasir bertambah sesuai uang yang diterima.
- Saat bon dilunasi, pendapatan kasir menjadi total transaksi asli, bukan 0 dan bukan hanya nominal pelunasan.
- Dashboard memakai rumus revenue yang sama dengan Keuangan.
- Riwayat Kasir menampilkan transaksi asli, bukan receipt pelunasan Rp11.000 sebagai transaksi utama.
- Transaksi pelunasan bon legacy ditandai sebagai receipt-only agar tidak dihitung sebagai penjualan baru.
- Data lama dari patch awal yang sempat membatalkan transaksi asli diperbaiki otomatis saat backend restart.

## Prinsip baru

Sumber kebenaran transaksi bon adalah:

1. `transactions` = transaksi asli, menyimpan total belanja dan item.
2. `customer_debts` = sisa bon/piutang.
3. `debt_payments` = riwayat cicilan/pelunasan bon.

Revenue cash-basis dihitung dari:

`DP awal + semua pembayaran bon`, dibatasi maksimal `total transaksi asli`.

Contoh:

- Total belanja: Rp21.000
- DP awal: Rp10.000
- Sisa bon: Rp11.000
- Setelah lunas: revenue kasir = Rp21.000
- Piutang bon = Rp0

## File yang berubah

- `backend/server.py`
- `frontend/src/pages/Kasir.jsx`
- `frontend/src/pages/Keuangan.jsx`
- `frontend/src/pages/Dashboard.jsx`

## Setelah deploy

Restart HuggingFace backend agar migrasi otomatis berjalan.
Lalu redeploy Vercel frontend.
