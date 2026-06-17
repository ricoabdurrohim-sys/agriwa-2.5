AGRIWARUNG v2.5.28 - PRINT ALIGNMENT + QR PESANAN THERMAL FIX

INI UNTUK GITHUB / VERCEL
- Copy semua isi ZIP GITHUB ke repo AgriWarung.
- Replace file lama.
- Commit dan push.
- Vercel akan redeploy.

PERUBAHAN AMAN / MINIMAL
1. Tidak mengubah alur backend transaksi, order, kasir, dashboard, keuangan.
2. Tidak memakai server_patched.py.
3. Printer thermal tetap memakai Web Bluetooth UUID lama yang sebelumnya sudah bisa connect.
4. Tombol Print QR Pesanan Meja sekarang mencoba langsung cetak thermal seperti tombol Thermal di Kasir.
5. Kalau printer belum connect / perangkat tidak support Bluetooth, fallback otomatis buka print browser 80mm.
6. Nama lini bisnis di struk thermal dibuat lebih besar dan bold.
7. Nama lini bisnis, alamat/header, catatan, dan footer di thermal tidak lagi mepet kanan karena double-centering dihapus.
8. Dialog desktop/laptop diberi max-height dan overflow-y-auto agar tombol tidak ketutupan.
9. Logo/gambar thermal diperbaiki dengan fetch-to-blob + raster ESC/POS + ordered dithering.

CATATAN LOGO THERMAL
- Banyak printer thermal murah support teks dan QR tetapi beda-beda dukungan gambar bitmap.
- Patch ini sudah mengirim logo sebagai ESC/POS raster image (GS v 0).
- Jika model printer tetap tidak mencetak logo, fallback browser print 80mm tetap menampilkan logo.

COMMIT SUMMARY GITHUB
Fix thermal print alignment and order QR direct print
