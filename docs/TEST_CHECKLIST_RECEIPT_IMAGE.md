# TEST CHECKLIST - RECEIPT IMAGE / LOGO PRINT FIX

## 1. Test data
- Upload logo/header struk.
- Upload gambar/footer banner jika ada.
- Isi footer teks 2-5 baris.
- Buat transaksi dengan 3-6 item.

## 2. Browser print 80mm
- Pilih mode `browser80mm`.
- Print preview harus menampilkan:
  - logo/header
  - nama warung
  - item lengkap
  - total
  - footer teks lengkap
  - footer image/banner (kalau ada)
- Tidak boleh terpotong di tengah.

## 3. Raw Bluetooth
- Pilih mode `rawBluetooth`.
- Pastikan teks tetap tercetak.
- Jika gambar tidak muncul, itu batasan mode printer/app, bukan bug receipt HTML.

## 4. Browser print settings
- Paper size: 80mm
- Scale: 100%
- Margins: none/default thermal
- Headers and footers browser: OFF

## 5. Hal yang perlu dicek bila gambar tetap hilang
- URL gambar valid dan bisa diakses browser.
- Gambar tidak butuh token/cookie yang diblokir.
- Print dipanggil setelah image loaded.
- Jika storage private, ubah ke URL yang bisa di-fetch dari frontend.
