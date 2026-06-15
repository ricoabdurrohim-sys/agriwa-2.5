# AgriWarung v2.5.9 — Stabilization Audit Fix

Patch ini dibuat sebelum deploy ulang untuk menstabilkan menu yang sebelumnya banyak ditambal.

## Fokus utama

1. **Anti blank page**
   - Menambahkan `ErrorBoundary` global di layout.
   - Jika satu menu crash, aplikasi tidak blank; muncul panel error, tombol coba lagi, dashboard, dan reload.

2. **Reset/hapus massal benar-benar diamankan**
   - UI Pengaturan tidak lagi memiliki dialog reset data.
   - Endpoint `/api/system/reset-module/{module}` dan `/api/system/reset-data` tetap ada untuk kompatibilitas, tetapi hanya mengembalikan HTTP 410 dan tidak memiliki kode penghapus tersembunyi yang bisa terpanggil.
   - Data tetap hanya bisa diedit/hapus per item di menu masing-masing.

3. **Pengaturan struk global tetap dihapus**
   - Menu Pengaturan hanya menyimpan pajak umum, profil, password, dan payment gateway.
   - Nama/alamat/footer/catatan struk hanya ada di Lini Bisnis agar tidak bentrok antar unit.

4. **Dashboard lebih tahan gagal**
   - Jika API dashboard gagal, dashboard tidak stuck blank/loading selamanya.
   - Listener websocket duplikat dibersihkan agar tidak refresh dua kali.

5. **Backend integration health**
   - Menambahkan endpoint `GET /api/system/integration-health` untuk mengecek hitungan cepat lintas modul.
   - Endpoint ini membantu melihat jumlah transaksi, bon, payment, inventori, kebun, pembelian, HR, opname, dan audit log.

## File yang berubah

- `backend/server.py`
- `frontend/src/components/ErrorBoundary.jsx`
- `frontend/src/components/Layout.jsx`
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/pages/Pengaturan.jsx`

## Setelah deploy

Tes cepat:

1. Login.
2. Buka semua menu utama dari drawer.
3. Buat transaksi kasir normal.
4. Buat transaksi bon partial lalu lunasi.
5. Buka Dashboard, Keuangan, Laporan, Riwayat Kasir.
6. Buka Pengaturan dan pastikan tidak ada reset data massal serta tidak ada pengaturan struk global.
7. Buka `/api/system/integration-health` di backend untuk cek ringkasan modul.

## Catatan

Patch ini tidak menambah library berat dan tidak mengubah struktur deploy. Backend tetap FastAPI di HuggingFace, frontend tetap React di Vercel, database tetap MongoDB Atlas.
