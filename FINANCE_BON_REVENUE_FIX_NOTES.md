# AgriWarung v2.5.2 - Finance Bon Revenue Fix

Patch ini memperbaiki mismatch antara Kasir/Struk dan Keuangan setelah pelunasan bon.

## Contoh yang diperbaiki
- Total transaksi: Rp21.000
- DP/titip awal: Rp10.000
- Sisa bon: Rp11.000
- Setelah pelanggan bayar Rp11.000, Pemasukan Kasir harus menjadi Rp21.000, bukan Rp11.000.

## Perubahan backend
- Menambahkan normalisasi finansial untuk transaksi penjualan asli.
- Menandai receipt pelunasan bon sebagai `financial_exclude` agar tidak dihitung sebagai penjualan baru.
- Memperbaiki update `paid_amount` transaksi asal agar memakai total transaksi asli + pembayaran bon, bukan hanya nominal pelunasan terakhir.
- Menambahkan migration/repair otomatis saat backend startup untuk data lama yang sempat dibuat oleh versi sebelumnya: transaksi awal yang dicancel karena pelunasan bon akan dipulihkan, dan transaksi pelunasan lama dikeluarkan dari revenue.
- Laporan profit-loss, balance-sheet, cash-flow, dan cash-balance sekarang memakai helper cash-basis yang sama.

## Perubahan frontend
- Menu Keuangan sekarang mengecualikan dokumen pelunasan bon receipt-only dari Pendapatan Kasir.
- Pendapatan Kasir menghitung `paid_amount` transaksi asal.
- Baris transaksi menampilkan kas masuk dari transaksi tersebut dan info total belanja/sisa bon jika berbeda.

## Cara update
1. Copy/replace file dari ZIP ini ke repository GitHub.
2. Commit: `Fix finance revenue after bon settlement`.
3. Push.
4. HuggingFace backend akan rebuild/restart.
5. Vercel frontend redeploy.
6. Setelah backend restart, migration otomatis memperbaiki data lama.

## File berubah
- `backend/server.py`
- `frontend/src/pages/Keuangan.jsx`
