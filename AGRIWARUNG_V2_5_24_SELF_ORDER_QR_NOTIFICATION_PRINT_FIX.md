# AgriWarung v2.5.24 — Self Order QR Notification Print Fix

## Fokus patch

1. Self-order QR meja sekarang memakai menu publik yang sama logikanya dengan Warung/Kasir.
2. Item varian dikirim ke halaman self-order sehingga pelanggan dapat memilih varian.
3. Item dengan harga dasar 0 tetapi punya harga varian tetap muncul di self-order.
4. Submit self-order memvalidasi varian di backend agar harga struk/order tidak salah.
5. Notifikasi self-order baru sekarang menambah badge di ikon notifikasi aplikasi.
6. Self-order baru mencoba membunyikan beep pendek di aplikasi staff.
7. Print iPhone/iPad dibuat lebih aman dengan halaman print 80mm khusus dan tombol Cetak manual.
8. QR tetap dipakai untuk struk/label/catatan yang dicetak thermal.

## Catatan kompatibilitas print

- Android/Desktop Chrome: Web Bluetooth bisa dipakai bila browser/perangkat/printer mendukung.
- iPhone/iPad: browser tidak dapat memakai Web Bluetooth langsung. Solusi yang realistis adalah halaman print khusus 80mm via AirPrint/dialog print sistem.
- Jika auto-print diblokir iOS, halaman print sekarang menampilkan tombol hijau `Cetak Struk / Label`.

## File penting yang berubah

- backend/server.py
- frontend/src/pages/PublicOrder.jsx
- frontend/src/components/Layout.jsx
- frontend/src/lib/safePrint.js

## Wajib deploy

Patch ini mengubah backend dan frontend, jadi harus update:

1. GitHub/Vercel
2. HuggingFace backend

## Test cepat

1. Warung → print QR meja.
2. Scan QR meja dari HP pelanggan.
3. Pastikan item varian muncul dan bisa dipilih.
4. Submit order.
5. Di aplikasi staff, ikon notifikasi harus muncul badge merah.
6. Jika browser mengizinkan audio, akan terdengar beep pendek.
7. Buka Warung/KDS, order masuk.
8. iPhone → Print struk/manual → harus membuka halaman khusus struk/label 80mm saja.
