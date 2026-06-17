AGRIWARUNG V2.5.15 - RECEIPT IMAGE / LOGO PRINT FIX

MASALAH YANG DIPERBAIKI
1. Gambar/logo upload tidak ikut tercetak.
2. Footer gambar atau banner bawah tidak tampil.
3. Print dipanggil terlalu cepat sebelum image selesai dimuat.
4. Mode raw Bluetooth hanya mencetak teks sehingga user mengira gambar rusak.

FILE YANG DISEDIAKAN
- frontend/src/utils/receiptImageHelpers.js
- frontend/src/utils/thermalPrinter.js
- frontend/src/utils/printReceipt.js
- docs/TEST_CHECKLIST_RECEIPT_IMAGE.md

LANGKAH CEPAT
1. Extract ZIP.
2. Copy file ke repo frontend AgriWarung.
3. Replace file lama kalau ada.
4. Pada pemanggil printReceipt(...), kirim opsi:
   - mode: 'browser80mm'
   - logoUrl/headerImageUrl: URL gambar header/logo upload
   - footerImageUrl: URL gambar footer upload (kalau ada)
   - footerLines: array string footer teks
5. Commit dan push ke GitHub.
6. Tunggu Vercel redeploy.

PENTING
- Untuk receipt yang ada gambar, pakai MODE browser80mm.
- Mode rawBluetooth tetap bisa dipakai, tetapi fokus untuk teks.
- Banyak printer thermal murah tidak stabil untuk bitmap image langsung via Bluetooth browser.
