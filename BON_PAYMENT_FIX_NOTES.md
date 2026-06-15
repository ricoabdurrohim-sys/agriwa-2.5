# AgriWarung v2.5.1 - Fix Pelunasan Bon Kasir

## Bug yang diperbaiki
Contoh kasus:
- Total soto 3 porsi = Rp21.000
- DP/titip uang awal = Rp10.000
- Sisa bon = Rp11.000

Sebelumnya:
- Customer debt menyimpan `amount = 21000` dan `paid = 10000`, sehingga menu keuangan terlihat bon Rp21.000.
- Mode pelunasan bon di kasir masih menghitung kembalian dari total awal Rp21.000, bukan sisa bon Rp11.000.
- Endpoint `/customer-debts/{id}/settle-via-kasir` membatalkan transaksi lama lalu membuat transaksi baru senilai sisa bon saja, sehingga revenue setelah pelunasan hanya terlihat Rp11.000.

Sekarang:
- Customer debt baru menyimpan `amount = sisa_bon`, contoh Rp11.000, dan `paid = 0`.
- Transaksi awal tetap disimpan, tidak dibatalkan saat pelunasan.
- Pelunasan bon hanya menaikkan `paid_amount` transaksi awal dan menurunkan `debt_amount`.
- Mode kasir pelunasan bon menampilkan `Nominal Dibayar = sisa bon`, bukan total awal.
- Struk pelunasan menampilkan Total Belanja, Sudah Dibayar, Bayar Bon, Uang Diterima, Kembali, dan Sisa Hutang.
- Menu Keuangan menghitung pemasukan kasir berbasis uang yang benar-benar diterima (`paid_amount`).

## File yang berubah
- `backend/server.py`
- `frontend/src/pages/Kasir.jsx`
- `frontend/src/pages/Keuangan.jsx`

## Cara deploy
Upload/push file-file di atas ke GitHub, lalu:
1. HuggingFace backend rebuild/restart.
2. Vercel frontend redeploy.
3. Test ulang kasus: total 21.000, DP 10.000, pelunasan 11.000.
