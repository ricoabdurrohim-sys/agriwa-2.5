# AgriWarung v2.5.20 — POS, Report, AI, Queue, Barcode & Mobile Fix

## Fokus patch
- Kasir lebih rapi: tombol hapus item diperbesar/dijauhkan dari tombol tambah, font keranjang diperbesar.
- Harga kartu menu POS memakai range varian, contoh `3k/5k/7k`, bukan Rp 0 saat item utama hanya menjadi induk varian.
- Scan produk khusus Kasir untuk barcode produk/sku tanpa mengganggu scan global lintas menu.
- Struk dan label batch memakai barcode CODE128, masih bisa diinput manual dari halaman Scan.
- Thermal print receipt/label menambahkan barcode bila printer mendukung ESC/POS CODE128.
- Laporan ditambah tab Mingguan/Bulanan/Tahunan dan tab AI Rekomendasi.
- AI insight berjalan lokal tanpa API; OpenAI API opsional via `OPENAI_API_KEY`.
- Warung menambah mode Takeaway/Antrian yang terhubung ke KDS dan Kasir.
- Lini Bisnis bisa upload logo/gambar struk per unit.
- Pengaturan: dialog reset massal dinonaktifkan dihapus dari UI.
- Cabang/Lokasi diberi penjelasan agar tidak membingungkan untuk pemakaian satu tempat.
- Scan kamera mendukung QR dan beberapa format barcode umum via html5-qrcode.

## Catatan integrasi
- Tidak mengubah rumus utama Finance/Dashboard/Laporan yang sudah match.
- Barcode transaksi tetap mengarah ke `/scan` dan resolve backend `/api/scan/resolve`.
- Barcode produk di Kasir membaca `barcode`, `sku`, `code`, `id`, atau nama item.
- Harga varian tetap tersimpan di item transaksi; stok tetap mengurangi item induk.
- Queue takeaway tersimpan di order sebagai `queue_no`, lalu ikut masuk struk saat checkout.

## Update wajib
Patch mengubah frontend dan backend, jadi perlu update GitHub/Vercel dan HuggingFace.
