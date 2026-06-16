# AgriWarung v2.5.19 — POS Variant, Category & Tax Receipt Fix

## Fokus patch
- Kasir dibuat lebih sederhana untuk produk banyak: filter kategori A-Z dan kategori POS bisa dikelola langsung dari Kasir.
- Kategori manual di Inventori: user bisa mengetik kategori sendiri, tidak dibatasi pilihan lama.
- Kategori yang diubah dari Kasir ikut mengubah kategori item di Inventori supaya sinkron.
- Produk dapat memiliki varian POS seperti Es/Hangat, Kecil/Besar, tanpa membuat item inventory terpisah.
- Saat produk bervarian diklik di Kasir, aplikasi meminta pilih varian dulu; jika tidak ada varian langsung masuk keranjang.
- Varian masuk ke struk dan riwayat transaksi, tetapi stok tetap mengurangi item utama.
- Struk menampilkan DPP dan PPN bila pengaturan pajak diaktifkan.
- Mode pajak default: harga jual sudah termasuk pajak, sehingga total bayar tidak berubah.

## Catatan pajak
Fitur pajak ini adalah pemecahan tampilan struk, bukan pengganti konsultasi pajak. Untuk UMKM non-PKP, PPN biasanya tidak dipungut sebagai PKP. Gunakan tampilan PPN hanya jika bisnis memang perlu menampilkan rincian pajak.

## File utama diubah
- backend/server.py
- frontend/src/pages/Kasir.jsx
- frontend/src/pages/Inventori.jsx
- frontend/src/pages/Pengaturan.jsx

## Test checklist
1. Inventori → tambah kategori manual, simpan.
2. Kasir → kategori baru muncul.
3. Kasir → + Kategori → pilih beberapa item → simpan → cek kategori Inventori berubah.
4. Inventori → edit item → aktifkan varian POS → tambah Es/Hangat atau Kecil/Besar.
5. Kasir → klik item bervarian → pilih varian → cek masuk keranjang.
6. Checkout → cek struk menampilkan nama varian.
7. Pengaturan → aktifkan rincian pajak dan harga termasuk pajak.
8. Kasir → checkout → cek DPP + PPN muncul di struk tanpa mengubah total bayar.
