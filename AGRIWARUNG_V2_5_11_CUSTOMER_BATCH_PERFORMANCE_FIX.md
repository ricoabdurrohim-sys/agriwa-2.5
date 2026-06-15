# AgriWarung v2.5.11 — Customer Bon, Batch Inventory & Performance Fix

## Fokus patch

1. Mempercepat Dashboard, Keuangan, dan Laporan
- Cache ringkasan finance dinaikkan menjadi 120 detik.
- Repair bon legacy tidak dijalankan terus-menerus pada setiap buka halaman.
- Query ringkasan finance dibatasi dengan `FINANCE_MAX_DOCS` default 3000 agar HF Free tidak terlalu berat.
- Cache otomatis di-invalidate saat transaksi kasir, pelunasan bon, pemasukan, atau pengeluaran baru dibuat.

## 2. Nama pelanggan & pencarian bon langsung di Kasir
- Kasir punya tombol **Cari Bon**.
- Bisa cari berdasarkan nama pelanggan atau nomor HP.
- Dari hasil pencarian, klik pelanggan langsung masuk mode pelunasan bon.
- Nama pelanggan tetap tampil di struk, riwayat kasir, dan ledger keuangan.

## 3. Batch inventori tidak tertumpuk
- Saat tambah stok barang yang sama, item tetap digabung, tapi batch baru selalu dibuat sebagai dokumen terpisah.
- Batch menyimpan `quantity`, `remaining_quantity`, supplier, tanggal beli/panen, invoice/ref, link pembelian, dan catatan.
- Saat barang keluar lewat kasir/self-use/waste/adjustment, sistem mengurangi batch FIFO sehingga sisa batch lama bisa dilihat.
- Menu Inventori sekarang punya tombol **Lihat batch** per barang.

## 4. Nomor batch otomatis
- Kalau No Batch kosong, backend membuat otomatis dengan format:
  - singkatan nama barang + tanggal ddmmyy + urutan 3 digit.
  - Contoh: `GP150626001` untuk Gula Pasir, 15 Juni 2026, pembelian pertama hari itu.

## 5. Tambah inventori dari barang yang sudah ada
- Form inventori sekarang bisa memilih barang lama sebagai template.
- Nama, kategori, satuan, harga, unit bisnis, lokasi, dan supplier terakhir otomatis terisi.
- User tinggal isi stok masuk baru dan detail pembelian yang berubah.

## 6. Panen multi-komoditas
- Panen tidak lagi otomatis bernama “Anggur Panen Grade A”.
- Nama inventori panen otomatis memakai varietas/jenis plot + grade, misalnya:
  - `Jupiter Grade A`
  - `Kelengkeng Grade A`
  - `Telur Grade B`
- Panen otomatis membuat batch inventori dengan format batch yang sama.

## 7. HR lintas bisnis
- Karyawan bisa memilih unit `Lintas Bisnis / Kantor Pusat`.
- Jabatan umum ditambahkan: Akuntan, Finance, HR, Admin, Supervisor, Owner, dll.
- Tetap bisa tulis jabatan manual.

## File utama berubah
- `backend/server.py`
- `frontend/src/pages/Kasir.jsx`
- `frontend/src/pages/Inventori.jsx`
- `frontend/src/pages/Anggur.jsx`
- `frontend/src/pages/Karyawan.jsx`
- `AGRIWARUNG_V2_5_11_CUSTOMER_BATCH_PERFORMANCE_FIX.md`

## Perlu update platform
Karena patch ini mengubah backend dan frontend:
1. Update GitHub → Vercel redeploy.
2. Update HuggingFace backend (`Dockerfile`, `backend/server.py`, `backend/requirements.txt`, `backend/.env.example`) → rebuild/restart.
3. Hard refresh browser.

## Test wajib
1. Kasir normal.
2. Kasir bon partial dengan nama pelanggan.
3. Cari Bon di Kasir berdasarkan nama.
4. Lunasi bon dari Kasir.
5. Cek Dashboard/Keuangan/Laporan masih match.
6. Inventori tambah barang baru tanpa batch → batch otomatis.
7. Inventori tambah barang sama → batch baru terpisah.
8. Lihat Batch → batch lama dan sisa tampil.
9. Jual item batch → sisa batch berkurang.
10. Panen dari plot dengan varietas → nama inventori varietas + grade, batch otomatis.
11. Karyawan jabatan Akuntan/HR/Finance + unit Lintas Bisnis.
