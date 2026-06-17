# AgriWarung v2.5.21 — Warung POS, Dashboard Profit, Scanner Camera, WhatsApp Setup

Patch ini melanjutkan v2.5.20 dengan perubahan terarah:

## Perbaikan

1. **Warung memakai menu yang sama dengan Kasir**
   - Item yang punya varian sekarang bisa dipilih variannya dari Warung.
   - Harga item varian tampil ringkas: `Rp 7.000/5.000/3.000`.
   - Item dengan harga dasar 0 tetapi punya harga varian tetap muncul dengan benar.

2. **Takeaway memakai keranjang dahulu**
   - Klik menu tidak langsung membuat antrian.
   - Pilih semua menu dulu, baru klik `Proses ke Antrian / Dapur`.
   - Antrian aktif bisa dibuka lagi untuk melihat detail dan lanjut bayar ke Kasir.

3. **Pelanggan B2B bisa edit/hapus**
   - Pelanggan B2B bisa diedit.
   - Pelanggan B2B bisa dihapus jika belum punya invoice.

4. **Input angka lebih nyaman di HP**
   - Input uang/qty/harga yang relevan memakai numeric keypad di mobile.

5. **Scanner bisa pilih kamera**
   - Halaman Scan punya tombol `Kamera` dan dropdown kamera.
   - Bisa pindah kamera depan/belakang jika browser mendeteksi lebih dari satu kamera.

6. **Dashboard profit disamakan dengan laporan**
   - Net profit hari ini sekarang menghitung HPP/COGS.
   - Revenue dan net profit tidak lagi otomatis sama saat ada HPP.

7. **Nomor transaksi dibuat lebih seperti retail**
   - Format baru: `AW-DDMMYY-0001`, contoh `AW-170626-0001`.
   - Tanggal/jam transaksi tetap tampil terpisah di struk.
   - Nomor lebih pendek, mudah dicari, dan urut per hari.

8. **OpenAI API tidak dipakai**
   - Env contoh OpenAI dihapus agar tidak bingung.
   - Fitur rekomendasi lokal tetap bisa dipakai tanpa API.

## Catatan WhatsApp API

Backend tetap mendukung WhatsApp Business Cloud API resmi dengan env:

- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_GRAPH_VERSION`

Kalau env belum diisi, struk tetap memakai fallback `wa.me` manual.
