# AgriWarung v2.5.14 — Drawer, Scan, Batch FIFO & Kasir Cleanup Fix

Patch ini melanjutkan v2.5.13 tanpa mengubah rumus finance yang sudah match.

## Perubahan utama

1. Drawer dibersihkan
- Setup Wizard dihapus dari drawer dan route aktif.
- Pintasan drawer atas dibuat tetap: Dashboard, Warung, Kasir.
- Scan QR tetap tersedia sekali saja di header atas dekat notifikasi.

2. Scanner QR diperbaiki
- Scanner tidak lagi bergantung pada `BarcodeDetector` browser.
- Diganti ke `html5-qrcode`, sehingga browser memunculkan dialog izin kamera seperti aplikasi scanner umum.
- Tetap ada input manual jika kamera tidak tersedia.

3. Kasir
- Tombol Scan QR di dalam Kasir dihapus karena sudah ada scan global di header.
- Error merah `Gagal memuat transaksi/bon` setelah transaksi normal berhasil dihilangkan.
- Tombol Print Ulang di list Riwayat Kasir dihapus. Print ulang cukup dari tombol Detail.

4. Inventori
- Tombol Scan QR di dalam Inventori dihapus karena sudah ada scan global di header.
- Nomor batch otomatis diperbaiki agar counter dipisah per item + tanggal.
  Contoh:
  - Gula Pasir 16-06-2026 pertama = GP160626001
  - Mie Goreng 16-06-2026 pertama = MG160626001
  - Gula Pasir lagi 16-06-2026 = GP160626002
- Detail batch sekarang melakukan rekonsiliasi sisa batch dari stock movements supaya sisa batch lama berkurang sesuai pemakaian.

5. Produksi dan FIFO batch
- Konsumsi bahan baku memakai batch FIFO otomatis jika batch tidak dipilih.
- Pada produksi dari Inventori dan menu Produksi, user dapat memilih batch bahan baku tertentu.
- Jika batch tertentu dipilih dan kurang, sisa kebutuhan otomatis dilanjutkan FIFO.

## Catatan deploy
Patch ini mengubah frontend dan backend.
Wajib update GitHub/Vercel dan HuggingFace backend.
