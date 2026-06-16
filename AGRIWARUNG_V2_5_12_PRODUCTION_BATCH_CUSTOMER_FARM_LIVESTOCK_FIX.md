# AgriWarung v2.5.12 — Production Batch, Customer Debt Search, Farm/Livestock Fix

## Fokus patch
- Tidak mengubah rumus finance yang sudah match.
- Produksi barang jadi sekarang bisa membuat batch inventori otomatis sesuai policy Lini Bisnis.
- Cari transaksi/bon dari Kasir berdasarkan nomor nota, nama pelanggan, atau nomor HP.
- Nama pelanggan selalu bisa diisi di Kasir dan ikut tampil di struk.
- QR di struk mengarah ke pencarian transaksi di Kasir.
- Inventori bisa print label batch thermal dengan QR.
- Kebun dibuat lebih general, bukan hanya Anggur.
- Tambah menu Peternakan untuk ayam/telur/hasil ternak dan batch otomatis.
- Lini Bisnis punya pengaturan batch otomatis per unit.
- Watermark Made with Emergent di index.html dihapus.

## Catatan penting
Patch ini mengubah backend dan frontend. Setelah upload ke GitHub/Vercel, backend HuggingFace juga wajib di-update.

## Test minimum
1. Kasir: isi nama + no HP, transaksi bon, lalu Cari Bon dari Kasir.
2. Kasir: scan/cari nomor nota dari QR struk.
3. Produksi: hasil produksi menambah stok dan membuat batch jika Lini Bisnis mengaktifkan batch produksi.
4. Inventori: buka Lihat Batch, cek sisa batch lama, print label.
5. Kebun: tambah plot umum, panen, batch panen masuk inventori.
6. Peternakan: tambah aset ternak, catat telur/hasil ternak, batch masuk inventori.
7. Pupuk/Produksi: barang jadi dengan harga jual dan unit bisnis benar bisa muncul di Kasir.
