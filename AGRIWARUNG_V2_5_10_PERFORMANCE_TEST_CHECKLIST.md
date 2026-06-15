# AgriWarung v2.5.10 - Performance & Final Test Checklist

Patch ini menambahkan cache singkat untuk ringkasan Keuangan/Dashboard/Laporan agar backend HuggingFace tidak menghitung ulang data yang sama berkali-kali saat menu dibuka berurutan.

## Perubahan teknis
- `GET /api/finance/system-summary` sekarang mendukung parameter `refresh=true`.
- `POST /api/finance/refresh-summary` untuk memaksa ringkasan dihitung ulang.
- Cache default 20 detik lewat `FINANCE_CACHE_TTL_SECONDS`.
- `uvicorn[standard]` + `websockets` ditambahkan agar WebSocket `/api/ws` tidak spam warning.

## Checklist test sebelum dipakai
1. Login admin.
2. Buka Dashboard, Keuangan, Laporan Keuangan. Pastikan tidak NotFound dan tidak blank.
3. Buat transaksi kasir normal.
4. Buka Keuangan. Jika angka belum langsung berubah dalam beberapa detik, tunggu maksimal 20 detik atau buka `/api/finance/system-summary?refresh=true` dari browser setelah login/token tersedia.
5. Buat bon partial, lalu lunasi. Cek Dashboard, Keuangan, Laporan, Riwayat Kasir.
6. Test Inventori: tambah item baru, tambah item nama sama dari supplier berbeda, cek batch/catatan.
7. Test Pembelian Supplier: tambah order online, scroll modal, upload/link bukti, pembayaran sebagian, pelunasan, print.
8. Test Kebun Anggur: add plot baru, buat item inventori otomatis, catat panen, cek stok inventori bertambah.
9. Test Stock Opname: hitung item, finalisasi satu item kecil, cek stok berubah.
10. Test HR: tambah karyawan, cuti/izin, payroll.
11. Test Audit Log: klik detail pada aksi transaksi/pembelian/stok.
12. Buka Pengaturan dan pastikan tidak ada reset data massal atau setting struk global.

## Catatan performa
HuggingFace Free punya cold start dan CPU terbatas. Loading pertama setelah restart bisa lambat. Loading berikutnya harus jauh lebih cepat karena cache ringkasan finance.
