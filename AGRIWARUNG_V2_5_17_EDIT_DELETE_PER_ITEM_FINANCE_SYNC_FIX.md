# AgriWarung v2.5.17 — Edit/Delete Per Item & Finance Sync Fix

Patch ini dibuat dari v2.5.16 dengan fokus pada permintaan terbaru:

## Perubahan utama

1. Investor bisa diedit dan dihapus per item dari menu Investor.
   - Edit aman walaupun investor sudah dipakai di setoran modal/dividen.
   - Hapus investor ditolak jika investor sudah terhubung ke setoran modal/sewa/dividen, agar laporan tidak rusak.

2. Pemasukan dan pengeluaran manual di menu Keuangan bisa diedit dan dihapus.
   - Edit/hapus otomatis menghapus cache ringkasan keuangan.
   - Dashboard, Keuangan, dan Laporan akan membaca angka baru dari satu sumber yang sama.
   - Pemasukan/pengeluaran yang berasal dari modul lain ditolak untuk diedit/hapus dari Keuangan; harus diedit dari modul asal agar tidak desinkron.

3. Tombol Reset Transaksi & Keuangan di Pengaturan dihapus.
   - Endpoint reset transaksi juga dikunci HTTP 410 agar tidak ada penghapusan data massal tidak sengaja.
   - Koreksi data dilakukan melalui edit/hapus per item.

4. Sinkronisasi frontend diperbaiki.
   - Setelah edit/hapus pemasukan/pengeluaran, cache finance frontend dibersihkan.
   - Halaman Laporan dan Dashboard mendengar event perubahan finance sehingga angka tidak tertinggal cache lama.

## Endpoint backend baru/diubah

- `PUT /api/investors/{investor_id}`
- `DELETE /api/investors/{investor_id}`
- `PUT /api/incomes/{income_id}`
- `DELETE /api/incomes/{income_id}`
- `PUT /api/expenses/{eid}`
- `DELETE /api/expenses/{eid}`
- `POST /api/system/reset-transaction-finance-data` sekarang dikunci permanen.

## Test singkat

1. Investor → tambah investor test → edit nama/HP → simpan.
2. Investor → hapus investor test yang belum ada setoran modal.
3. Investor → coba hapus investor yang sudah punya setoran modal; harus ditolak dengan pesan jelas.
4. Keuangan → tambah pemasukan manual → edit jumlah → cek total berubah.
5. Keuangan → hapus pemasukan manual → cek hilang dari Keuangan/Laporan.
6. Keuangan → tambah pengeluaran manual → edit jumlah/kategori → cek Dashboard dan Laporan ikut berubah.
7. Pengaturan → pastikan tidak ada tombol Reset Transaksi & Keuangan.
8. Buka `/openapi.json`, cari `PUT /api/incomes`, `PUT /api/expenses`, dan reset endpoint tetap ada tapi terkunci.

## Catatan

Backend Python sudah dicek dengan `python -m py_compile backend/server.py`.
Build React tetap harus dicek dari log Vercel setelah push.
