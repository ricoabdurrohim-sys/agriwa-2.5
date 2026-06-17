# Review integrasi v2.5.19

## Kesimpulan penting

Backend asli sudah punya fitur self-order publik. Jadi patch QR meja tidak perlu wrapper baru.
Paket sebelumnya yang memakai `server_patched.py` harus dihentikan.

## Yang disentuh

- Print struk 80mm frontend
- Gambar/logo/footer struk frontend
- Input struk multi-baris via textarea frontend
- Print QR meja frontend
- Halaman self-order frontend memakai endpoint publik lama
- Dockerfile HF dikembalikan ke `server:app`

## Yang tidak disentuh

- Perhitungan keuangan backend
- Dashboard summary backend
- Transaksi kasir backend
- Database MongoDB
- Koleksi lama

## Test wajib

1. HF buka `/api/health` atau `/docs`.
2. Vercel login.
3. Menu Warung terbuka.
4. Print QR meja.
5. Scan QR meja.
6. Halaman self-order tampil nama meja.
7. Menu publik tampil.
8. Kirim tambahan gorengan/kerupuk.
9. Pesanan masuk ke menu warung/kasir.
10. Struk 80mm: font tidak besar, QR kecil, tidak ada tulisan scan/ketik nota.
11. Logo/header/footer gambar tampil di preview dan kertas.
