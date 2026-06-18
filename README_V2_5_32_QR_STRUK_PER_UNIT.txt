AGRIWARUNG V2.5.32 - QR STRUK PER LINI BISNIS

UNTUK GITHUB / VERCEL
- Tambah pengaturan di Lini Bisnis: Tampilkan QR code di struk transaksi.
- Default aktif agar perilaku lama tidak berubah.
- Jika dimatikan, preview struk dan print thermal/browser tidak menampilkan QR nota transaksi.
- Header, footer, logo, dan format 80mm dari v2.5.31 tetap dipertahankan.

LANGKAH
1. Extract ZIP GitHub.
2. Copy semua isi ke repo GitHub.
3. Commit: Add per business unit receipt QR setting
4. Push dan tunggu Vercel redeploy.

TEST
1. Lini Bisnis -> Warung Makan -> matikan QR struk -> simpan.
2. Buat transaksi kasir lini Warung.
3. Preview struk tidak menampilkan QR.
4. Print thermal tidak menampilkan QR.
5. Aktifkan lagi QR struk -> transaksi baru kembali menampilkan QR.
