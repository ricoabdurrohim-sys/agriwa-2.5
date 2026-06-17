# AgriWarung v2.5.22 — Warung/POS Speed, Barcode & Print Fallback Fix

Fokus patch ini adalah mempercepat Warung/Kasir tanpa mengubah rumus finance:

## Perubahan utama

1. **Warung/meja dibuat lebih cepat**
   - Menu Warung tidak lagi memuat semua batch inventori.
   - Tambah/kurang item meja tidak lagi reload meja + order + inventori.
   - Update pesanan dibuat optimistik: UI langsung berubah, backend disimpan di belakang.
   - Refresh otomatis meja dibuat lebih ringan, tiap 15 detik hanya memuat meja/order aktif.

2. **Kasir dari Warung lebih cepat**
   - Saat lanjut bayar dari meja/takeaway, Kasir mengambil satu order saja melalui endpoint baru `GET /api/orders/{order_id}`.
   - Setelah checkout, Kasir tidak lagi reload semua inventori; riwayat lokal diperbarui langsung.

3. **Barcode struk diperbaiki**
   - Barcode struk sekarang berisi nomor nota langsung, contoh `AW-170626-0001`, bukan payload panjang `aw:trx:...`.
   - Tampilan barcode diperbesar agar lebih mudah discan.
   - Thermal receipt ESC/POS juga mencetak barcode nomor nota.

4. **Fallback print thermal di HP/tablet**
   - Jika Web Bluetooth tidak tersedia, tombol Thermal tidak berhenti di error.
   - App membuka fallback print browser ukuran 80mm.
   - Ini bisa dipakai untuk printer yang terhubung lewat sistem Android/desktop atau print dialog browser.

## Catatan offline

Offline penuh untuk Kasir/Warung belum diaktifkan di patch ini karena transaksi memengaruhi stok, batch, bon/piutang, jurnal, laporan, dan audit. Kalau dipaksakan tanpa conflict handling, risiko dobel transaksi atau stok tidak sinkron cukup besar.

Roadmap aman untuk offline:
1. PWA + IndexedDB lokal.
2. Nomor nota offline dengan prefix device/kasir.
3. Queue transaksi lokal.
4. Sync satu arah saat online.
5. Conflict check stok/batch saat sinkron.
6. Tanda transaksi `offline_synced` di audit log.

## File yang berubah

- `backend/server.py`
- `frontend/src/pages/Warung.jsx`
- `frontend/src/pages/Kasir.jsx`
- `frontend/src/lib/printer.js`

## Deploy

Karena ada endpoint backend baru, update GitHub/Vercel dan HuggingFace.
