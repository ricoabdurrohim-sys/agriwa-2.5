AGRIWARUNG V2.5.33 BUILD FIX

INI UNTUK GITHUB / VERCEL.

Perbaikan kecil dari v2.5.32:
- Memperbaiki syntax error di frontend/src/lib/printer.js baris 277.
- Penyebab Vercel gagal build: string newline pada strBytes terpotong menjadi dua baris.
- Tidak mengubah alur Warung, Kasir, Split Bill, Panggil Pelayan, QR pesanan meja, atau backend.

Commit summary GitHub:
Fix printer syntax build error

HF:
- Tidak wajib update HF karena error ini frontend/Vercel saja.
- ZIP HF tetap disediakan hanya agar versi paket tetap sinkron.
