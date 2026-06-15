# AgriWarung v2.5 — Patch Notes

## Ringkasan
Versi ini memakai `code v2 agriwarung github` sebagai basis utama dan menambahkan perbaikan kritis untuk kasir, keamanan reset password, struk, notifikasi, payment gateway abstraction, bantuan/tutorial CMS, self-use inventory, supplier terms, dan laporan ringan ala Odoo.

## Backend
- Reset password token lama dinonaktifkan (`/api/auth/forgot-password` dan `/api/auth/reset-password-with-token` mengembalikan HTTP 410).
- Reset password baru via WhatsApp OTP:
  - `POST /api/auth/request-wa-otp`
  - `POST /api/auth/reset-password-wa`
- Super Admin reset password tetap ada sebagai fallback aman dan dicatat ke audit log.
- User sekarang menyimpan nomor WhatsApp (`phone`) untuk OTP.
- Checkout kasir uang kurang tidak lagi ditolak; otomatis menjadi `DEBT`/`PARTIAL` dengan `debt_amount`.
- Ditambahkan `transaction_type`: `SALE`, `SELF_USE`, `WASTE`, `ADJUSTMENT`.
- Self-use/rusak/penyesuaian mengurangi stok dan mencatat HPP sebagai biaya tanpa pendapatan.
- Setiap transaksi menyimpan `receipt_snapshot`, sehingga print ulang struk tetap memakai nama/alamat/footer saat transaksi dibuat.
- Endpoint detail/receipt/WA struk:
  - `GET /api/transactions/{trx_id}`
  - `GET /api/transactions/{trx_id}/receipt`
  - `POST /api/transactions/{trx_id}/send-whatsapp`
- Stok movement ditambah `balance_after` dan notifikasi low-stock.
- Notification center baru:
  - `GET /api/notifications`
  - `PUT /api/notifications/{nid}/read`
  - `POST /api/notifications/manual`
- Tutorial/Bantuan CMS:
  - `GET/POST/PUT/DELETE /api/help-contents`
- Payment gateway abstraction:
  - `GET/POST/PUT /api/payment-gateways`
  - `POST /api/payment-webhooks/{provider}`
- Supplier `payment_terms` dinormalisasi hanya ke: `cash`, `transfer`, `qris`, `bon`.
- Laporan keuangan lebih ringan ala Odoo: pendapatan hanya dari `SALE`, self-use/waste masuk beban, HPP memakai `cost_total` bila ada.
- Index MongoDB ditambah untuk users, OTP TTL, transaksi, stock movement, notifikasi, dan audit log.

## Frontend
- Login reset password berubah ke WhatsApp OTP; token reset lama dihapus dari UI.
- Manajemen User mendukung nomor WhatsApp dan reset password Super Admin.
- Kasir:
  - uang kurang bisa checkout dan otomatis tercatat hutang/bon,
  - jenis transaksi: Penjualan, Pemakaian Sendiri, Rusak/Hilang, Penyesuaian,
  - riwayat punya Detail dan Print Ulang,
  - struk menampilkan status/hutang/HPP,
  - WhatsApp struk memakai generator yang sama dengan tampilan struk,
  - checkout dari order/meja mengarahkan kembali ke Warung setelah struk ditutup.
- Lini Bisnis punya pengaturan struk per bisnis: alamat, telepon, footer, catatan.
- Tutorial & Bantuan menjadi CMS mini untuk panduan, FAQ, video YouTube, dan link WA support.
- Notifikasi menampilkan pusat notifikasi realtime/persisten.
- Pengaturan punya menu Payment Gateway/QRIS untuk Midtrans, Xendit, Duitku, atau Custom.
- Supplier/PO hanya menampilkan termin: Tunai, Transfer, QRIS, Bon.

## Catatan penting
- WhatsApp OTP bisa otomatis jika `WHATSAPP_API_URL` dan `WHATSAPP_API_KEY` diisi. Jika belum, backend mengembalikan link `wa.me` manual agar tetap bisa dipakai saat awal deploy.
- Payment gateway belum mengunci ke provider tertentu. Setelah punya Midtrans/Xendit/Duitku, isi konfigurasi di menu Pengaturan dan arahkan webhook ke `/api/payment-webhooks/{provider}`.
- Migrasi database bersifat bertahap: field lama diberi default oleh backend, tidak perlu drop database.
