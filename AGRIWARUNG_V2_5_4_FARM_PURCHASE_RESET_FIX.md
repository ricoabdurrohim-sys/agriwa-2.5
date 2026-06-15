# AgriWarung v2.5.4 — Reset Safety, Vineyard, Purchase & Supplier Fix

## Fokus patch
1. **Reset data massal dinonaktifkan**
   - Tombol reset massal per modul disembunyikan.
   - Zona reset data demo di Pengaturan disembunyikan.
   - Endpoint backend `/api/system/reset-module/{module}` dan `/api/system/reset-data` dikunci dengan HTTP 410 agar tidak bisa menghapus data walaupun tombol lama masih tersimpan di cache browser.

2. **Data satuan tetap bisa diedit/hapus**
   - Meja Warung sekarang bisa edit nama dan hapus satu meja saja.
   - Delete meja ditolak jika masih ada order aktif.
   - Supplier bisa edit dan hapus satuan.
   - Plot kebun bisa edit dan hapus satuan; hapus plot ditolak jika sudah punya panen/aktivitas/input terkait.

3. **Kebun Anggur diintegrasikan ke Inventori/Gudang**
   - Catat panen sekarang otomatis menambah stok ke inventory item Anggur Panen Grade A/B/C atau item inventori yang dipilih.
   - Hapus catatan panen otomatis mengurangi kembali stok panen.
   - Ditambah menu Aktivitas Kebun: pemangkasan, pemupukan, penyiraman, pengendalian hama, dll.
   - Ditambah menu Input Kebun: pemakaian pupuk/obat/bahan dari inventori dan otomatis mengurangi stok.
   - Biaya aktivitas kebun masuk ke expenses unit `anggur`.

4. **Pembelian & Supplier lebih lengkap**
   - PO dan order online punya invoice/bukti pembelian, bukti bayar, link pembelian/marketplace, jatuh tempo, dan pembayaran awal.
   - PO/order online bisa detail, print bukti pembelian, edit, hapus, bayar sebagian, dan pelunasan.
   - Pembayaran supplier dicatat sebagai cash out sesuai nominal yang benar-benar dibayar, bukan selalu total PO.
   - Penerimaan stok dan pembayaran dipisahkan: barang bisa diterima dulu, pembayaran bisa sebagian/lunas belakangan.

## File utama berubah
- `backend/server.py`
- `frontend/src/components/ResetModuleButton.jsx`
- `frontend/src/pages/Pengaturan.jsx`
- `frontend/src/pages/Warung.jsx`
- `frontend/src/pages/Anggur.jsx`
- `frontend/src/pages/Pembelian.jsx`

## Test manual yang disarankan sebelum deploy production
1. Tambah 3 meja, edit 1 meja, hapus 1 meja kosong, pastikan meja lain tidak hilang.
2. Buat plot kebun anggur, catat panen 5 kg Grade A, cek Inventori/Gudang bertambah.
3. Hapus panen tadi, cek stok berkurang kembali.
4. Catat pemakaian input kebun dari inventori, cek stok input berkurang.
5. Buat PO Rp100.000, bayar awal Rp40.000, terima stok, lalu bayar Rp60.000.
6. Cek Keuangan: pengeluaran supplier masuk Rp40.000 lalu bertambah menjadi Rp100.000 setelah pelunasan.
7. Print bukti PO dan buka link pembelian eksternal.
