AGRIWARUNG v2.5.27 STABLE RECOVERY

SUMBER PERBAIKAN
- Dibangun ulang dari agriwa-2.5.zip yang dikirim user.
- Base dikembalikan ke commit stabil v2.5.25: Optimize warung dinein table speed.
- Tidak memakai server_patched.py.
- Backend utama tetap backend/server.py.
- HF backend menjalankan uvicorn server:app.

FOKUS PATCH
1. Mengembalikan koneksi printer thermal ke flow Web Bluetooth lama yang sudah pernah connect.
2. Merapikan format struk 80mm: font lebih kecil, nama usaha tidak terlalu besar, QR lebih kecil, teks panjang wrap.
3. Menghapus tulisan "Scan QR / ketik nomor nota" di struk.
4. Logo/gambar struk dicoba cetak via ESC/POS raster; kalau printer tidak mendukung, fallback browser print tetap menampilkan gambar.
5. Header/alamat/footer/catatan struk di Lini Bisnis memakai textarea agar tombol Enter bisa turun baris.
6. Mempercepat klik item di Warung dengan optimistic local cart agar klik cepat tidak hilang/balik jumlah.
7. Menambah Print QR Pesanan Meja dari detail meja/pesanan di menu Warung.
8. Scan QR Pesanan membuka /warung?table=...&order=... agar staf langsung masuk ke meja terkait dan bisa tambah item.
9. Konfirmasi pembayaran Kasir diberi guard agar tidak double submit dan tombol menampilkan Memproses.
10. Tidak mengubah skema MongoDB dan tidak menghapus interkoneksi finance/inventory/order yang sudah ada.

CATATAN PRINT GAMBAR
- Printer thermal Bluetooth murah tidak semuanya mendukung bitmap image dengan stabil.
- Patch ini mencoba cetak logo via ESC/POS raster di mode Bluetooth.
- Jika gagal karena firmware printer, browser fallback 80mm tetap menampilkan logo/gambar.

TEST MINIMAL
1. HF /docs terbuka.
2. Vercel login berhasil.
3. Warung klik item 10x cepat, quantity tidak hilang/balik.
4. Print thermal connect lagi.
5. Struk 80mm rapi, QR kecil, footer multiline tampil.
6. Lini Bisnis bisa pakai Enter untuk nama/footer struk.
7. Warung > meja > isi pesanan > Print QR Pesanan Meja.
8. Scan QR Pesanan membuka meja yang sama.
9. Lanjut Bayar ke Kasir cepat dan tidak double submit.
