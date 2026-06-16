# AgriWarung v2.5.15 — Cancel, Production History, Invoice Delete & Stability Fix

Patch ini dibuat dari v2.5.14 dan fokus pada bug nyata yang dilaporkan setelah test.

## Fokus perbaikan

1. Kasir / Riwayat Transaksi
   - Pembatalan transaksi tidak lagi dibatasi hanya role tertentu.
   - Transaksi bon dapat dibatalkan dari Riwayat Kasir.
   - Transaksi yang dibatalkan diberi `cancel_reason=manual_cancel` agar tidak lagi dihitung di Keuangan, Dashboard, dan Laporan.
   - Piutang bon terkait dibatalkan.
   - Pembayaran bon terkait ditandai `voided`.
   - Stok dan batch yang sudah terpakai dikembalikan bila data batch tersedia.
   - Cache finance dihapus setelah pembatalan supaya angka cepat berubah.

2. Produksi
   - Riwayat produksi bisa diedit untuk label batch/catatan.
   - Riwayat produksi bisa dihapus/dibatalkan.
   - Saat produksi dihapus: stok barang jadi dikurangi, bahan baku dikembalikan, batch bahan baku direstore bila ada data batch consumption.
   - Jika barang jadi sudah terpakai sehingga stok tidak cukup, penghapusan diblokir agar stok tidak negatif.

3. Kebun / Invoice
   - Tombol hapus invoice sekarang memiliki handler frontend yang benar.
   - Jika invoice sudah memiliki pembayaran, backend tetap menolak penghapusan langsung agar audit aman.

4. Drawer
   - Tombol Atur Menu digeser menjadi tombol lebar di bawah pintasan Dashboard/Warung/Kasir, tidak lagi mepet tombol X.

5. Performa
   - Kasir tidak lagi mengambil seluruh riwayat batch inventori saat load barang.
   - Endpoint inventory mendukung `include_batches=false` untuk halaman ringan seperti Kasir.
   - Tambahan index untuk transaksi, customer debt, production batch, dan invoice.

## Catatan penting

Patch ini tidak melakukan reset database otomatis. Jika ingin mulai data bersih, lakukan reset manual di MongoDB setelah backup karena reset otomatis dari aplikasi sengaja tidak dihidupkan agar tidak salah pencet.

## File penting yang berubah

- `backend/server.py`
- `frontend/src/pages/Kasir.jsx`
- `frontend/src/pages/Pupuk.jsx`
- `frontend/src/pages/Anggur.jsx`
- `frontend/src/components/Layout.jsx`

## Test minimal setelah deploy

1. Kasir → buat transaksi normal → batalkan dari Riwayat.
2. Kasir → buat transaksi bon → batalkan dari Riwayat.
3. Cek Dashboard/Keuangan/Laporan angka berubah dan tidak double.
4. Produksi → buat batch → edit catatan → hapus batch.
5. Kebun → buat invoice belum dibayar → hapus invoice.
6. Drawer → tombol Atur Menu tidak mepet X.
7. Kasir harus lebih cepat membuka daftar barang.
