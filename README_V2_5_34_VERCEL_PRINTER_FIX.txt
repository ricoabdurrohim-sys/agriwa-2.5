AGRIWARUNG V2.5.34 - GITHUB / VERCEL

INI UNTUK GITHUB / VERCEL.

Perbaikan dari v2.5.32/2.5.33:
- Fix Vercel build error: frontend/src/lib/printer.js Unterminated string constant baris 277.
- Tidak mengubah flow Warung/Kasir/Split Bill/Panggil Pelayan.
- Setting QR struk per Lini Bisnis tetap ada.

Commit summary GitHub:
Fix printer build syntax and keep QR receipt setting

Setelah push, Vercel build harus melewati error printer.js baris 277.
