# AgriWarung v2.5.25 — Warung Dine-in Speed Fix

Fokus patch ini adalah mempercepat menu **Warung/meja/dine-in**. Takeaway dan self-order sudah relatif cepat, jadi perbaikan diarahkan ke alur meja biasa.

## Perbaikan utama

1. **Tambah/kurang/hapus item meja dibuat instan**
   - Sebelumnya setiap klik `+`, `-`, atau hapus item langsung `PUT /orders/{id}/items`, lalu backend broadcast `order_updated`, lalu Warung reload order aktif lagi.
   - Sekarang layar Warung berubah dulu secara lokal, kemudian sync ke backend memakai debounce.
   - Backend menerima `quiet=true` agar update cepat dari device sendiri tidak memicu reload berat setiap klik.

2. **Order meja kosong tidak menunggu server setiap klik pertama**
   - Saat meja kosong diklik lalu tambah item, cart lokal langsung berubah.
   - Backend membuat order setelah jeda pendek, lalu state lokal disambungkan ke order asli.

3. **Tambah/Edit/Hapus Meja dibuat ringan**
   - Sebelumnya tambah/hapus meja memanggil `load()` yang ikut mengambil menu inventori besar.
   - Sekarang daftar meja diperbarui lokal dulu, lalu refresh ringan.
   - Endpoint `/tables?light=true` ditambahkan agar Warung bisa mengambil daftar meja tanpa hitung order aktif dobel.

4. **Refresh websocket lebih tenang**
   - Event `order_updated` tidak langsung memicu reload berat setiap klik.
   - Refresh order dibuat debounce supaya tidak spam request saat banyak klik cepat.

## File penting yang berubah

- `frontend/src/pages/Warung.jsx`
- `backend/server.py`

## Catatan

Patch ini tetap menjaga integrasi:
- saat lanjut ke Kasir, perubahan order yang belum tersimpan akan di-flush dulu ke backend;
- order tetap tersimpan di MongoDB;
- layar lain tetap sinkron lewat refresh ringan/order event.

## Test singkat

1. Warung → buka meja kosong.
2. Klik menu beberapa kali cepat.
3. Pastikan item langsung masuk tanpa delay panjang.
4. Klik +, -, hapus/kurangi sampai 0.
5. Pastikan tidak sering error.
6. Lanjut Bayar ke Kasir.
7. Pastikan item yang dibayar sesuai isi order terakhir.
8. Tambah meja baru.
9. Edit nama meja.
10. Hapus meja kosong.
