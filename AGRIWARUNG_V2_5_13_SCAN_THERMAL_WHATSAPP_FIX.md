# AgriWarung v2.5.13 — Scan, Thermal Label, WhatsApp API Fix

Patch ini dibuat dari v2.5.12 dan tidak mengubah rumus finance yang sudah match. Fokusnya adalah traceability dan operasional cepat.

## Perubahan utama

1. Kasir
   - Tombol `Cari Bon` diganti menjadi `Cari Transaksi`.
   - `Cari Transaksi` menampilkan transaksi biasa dan bon aktif.
   - Tombol `Scan QR` ditambahkan di Kasir.
   - QR struk diarahkan ke `/scan?code=aw:trx:<nomor_nota>`.
   - Print ulang WhatsApp sekarang memanggil backend `/api/transactions/{id}/send-whatsapp`.
   - Jika WhatsApp API belum dikonfigurasi, aplikasi membuka `wa.me` dan menampilkan instruksi bahwa user tetap perlu menekan Kirim manual.

2. Pintasan Scan Universal
   - Halaman baru `/scan`.
   - Bisa scan QR/barcode dengan kamera jika browser mendukung `BarcodeDetector`.
   - Fallback input manual jika kamera/browser tidak mendukung.
   - Resolver backend baru `/api/scan/resolve` mengarahkan kode ke:
     - transaksi/struk → Kasir,
     - batch inventori → Inventori,
     - produksi → Produksi,
     - panen/kegiatan kebun → Kebun,
     - hasil peternakan → Peternakan.

3. Inventori
   - Tombol Scan QR di halaman Inventori.
   - Batch label print punya dua opsi: Browser dan Thermal.
   - Thermal label memakai printer Bluetooth ESC/POS dan mencetak QR untuk cek detail batch.

4. Produksi
   - Riwayat batch produksi bisa print label thermal.
   - QR produksi diarahkan ke halaman Produksi dan highlight batch terkait.

5. Kebun
   - Riwayat kegiatan dapat print thermal QR, edit, dan hapus.
   - Riwayat panen dapat print thermal QR dan hapus.
   - Scan QR kegiatan/panen diarahkan ke tab Kebun yang terkait.

6. Peternakan
   - Label hasil ternak memakai QR scan universal.
   - Scan hasil ternak diarahkan ke riwayat produksi peternakan terkait.

7. WhatsApp
   - Mendukung WhatsApp Business Cloud API resmi lewat env HuggingFace:
     - `WHATSAPP_PHONE_NUMBER_ID`
     - `WHATSAPP_ACCESS_TOKEN`
     - `WHATSAPP_GRAPH_VERSION`
   - Tetap mendukung gateway custom lama:
     - `WHATSAPP_API_URL`
     - `WHATSAPP_API_KEY`
   - Jika semua kosong, sistem fallback ke `wa.me` manual.

## Catatan WhatsApp penting

`wa.me` tidak bisa mengirim pesan otomatis. Ia hanya membuka WhatsApp dengan isi pesan siap kirim. Agar struk benar-benar terkirim otomatis tanpa klik Kirim manual, backend harus memakai WhatsApp Business Cloud API atau penyedia gateway WhatsApp.

## Test setelah deploy

1. Kasir → tombol `Cari Transaksi` muncul.
2. Kasir → tombol `Scan QR` muncul.
3. Buat transaksi → struk menampilkan QR.
4. Scan QR struk lewat `/scan` → diarahkan ke detail transaksi di Kasir.
5. Inventori → Lihat Batch → tombol Browser dan Thermal muncul.
6. Print Thermal batch → label keluar dengan QR.
7. Scan QR batch → diarahkan ke Inventori dan batch terkait.
8. Produksi → Riwayat Batch → Thermal print.
9. Kebun → Aktivitas → edit/hapus/print QR.
10. Kebun → Panen → print QR.
11. Peternakan → produksi hasil → print QR → scan.
12. WhatsApp print ulang:
    - tanpa env WA API: membuka WhatsApp manual;
    - dengan env Cloud API: pesan terkirim otomatis.

