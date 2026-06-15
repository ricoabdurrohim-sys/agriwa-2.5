# AgriWarung v2.5.6 — Kasir Bon, HR, Stock Opname, Drawer UX Fix

## Fokus patch

1. **Kasir pelunasan bon**
   - Mode pelunasan bon sekarang membaca `remaining/payment_due` dari backend.
   - Kolom uang diterima otomatis terisi sebesar sisa bon.
   - Warning merah kurang bayar tidak muncul lagi jika nominal sudah sesuai sisa bon.
   - Transaksi awal tetap menjadi sumber riwayat utama; pelunasan bon tidak menjadi penjualan baru.
   - `cash_received` transaksi awal tidak lagi ditimpa oleh pelunasan, sehingga struk awal tetap menunjukkan DP/uang awal.
   - `cash_collected` menjadi field kanonis untuk dashboard/keuangan/laporan.

2. **Keuangan — catatan penjualan kasir**
   - Tab Penjualan Kasir menampilkan uang masuk, nilai struk, DP awal, pelunasan, dan sisa bon.
   - Bon lunas tidak lagi dicoret sebagai pemasukan 0.
   - Tab Bon Pelanggan menampilkan status Lunas tanpa mencoret nominal secara membingungkan.

3. **Reset/hapus semua data**
   - Semua tombol reset massal dihapus dari UI menu.
   - Endpoint reset massal backend tetap terkunci `410 Gone`.
   - File backup lama yang masih memuat tombol reset dihapus dari paket.

4. **Drawer / menu utama**
   - Drawer diorganisir per kelompok:
     - Ringkasan
     - Operasional
     - Stok & Produksi
     - Keuangan & Akuntansi
     - SDM & Kontrol
     - Pengaturan
   - Semua fitur tetap ada, tetapi tidak tampil sebagai daftar panjang yang melelahkan.
   - Mode edit drawer tetap bisa menyembunyikan menu non-wajib, tanpa tombol reset data.

5. **Karyawan & HR**
   - Tambah ringkasan HR: karyawan aktif, check-in hari ini, gaji belum dibayar, cuti pending.
   - Tambah field karyawan: departemen, status kerja, kuota cuti, kontak darurat.
   - Tambah modul cuti/izin sederhana: ajukan, setujui, tolak.
   - Payroll tetap otomatis masuk pengeluaran.

6. **Stock Opname**
   - Tambah ringkasan progress hitung, estimasi selisih nilai, filter item, dan filter hanya selisih.
   - Tambah tombol draft: isi kosong = stok sistem, kosong = 0.
   - Finalisasi tetap satu-satunya aksi yang mengubah stok permanen.

## File utama berubah

- backend/server.py
- frontend/src/pages/Kasir.jsx
- frontend/src/pages/Keuangan.jsx
- frontend/src/pages/Karyawan.jsx
- frontend/src/pages/StockOpname.jsx
- frontend/src/components/Layout.jsx
- frontend/src/pages/Pengaturan.jsx
- beberapa halaman lain: import/tombol ResetModuleButton dibersihkan

## Testing yang dilakukan

- `python -m py_compile backend/server.py` berhasil.
- Pencarian teks reset massal di halaman utama frontend sudah bersih.
- Pemeriksaan sederhana keseimbangan bracket JSX untuk file utama berhasil.

## Catatan deploy

Setelah push ke GitHub:

1. Tunggu HuggingFace backend rebuild/restart.
2. Tunggu Vercel redeploy.
3. Hard refresh browser agar drawer lama/cache lama hilang.
4. Test kasus bon: total 21.000, DP 10.000, pelunasan 11.000.
5. Cek Dashboard, Keuangan, Laporan, Riwayat Kasir.
