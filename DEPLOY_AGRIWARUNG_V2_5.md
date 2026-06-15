# Panduan Deploy AgriWarung v2.5

## 1. Siapkan MongoDB Atlas
1. Buka MongoDB Atlas.
2. Buat database/cluster jika belum ada.
3. Buat database user.
4. Ambil connection string `mongodb+srv://...`.
5. Pastikan IP access diizinkan untuk cloud deployment. Untuk mudah awal deploy, gunakan `0.0.0.0/0` lalu perketat setelah stabil.

## 2. Deploy Backend ke HuggingFace Space
1. Buat Space baru atau pakai Space lama.
2. Pilih SDK: **Docker**.
3. Upload isi project ini ke repo Space.
4. Pastikan file `Dockerfile` berada di root project.
5. Di menu Settings/Secrets HuggingFace, isi:
   - `MONGO_URL`
   - `DB_NAME`
   - `JWT_SECRET`
   - `CORS_ORIGINS`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - opsional: `WHATSAPP_API_URL`, `WHATSAPP_API_KEY`
6. Tunggu build selesai.
7. Tes API:
   - buka `https://<space>.hf.space/api/openapi.json`
   - pastikan muncul OpenAPI JSON.

## 3. Deploy Frontend ke Vercel
1. Push project ke GitHub.
2. Import repo di Vercel.
3. Pastikan konfigurasi dari `vercel.json` dipakai.
4. Tambahkan Environment Variable:
   - `REACT_APP_BACKEND_URL=https://<space>.hf.space`
5. Build command sudah ada di `vercel.json`:
   - `cd frontend && yarn install --frozen-lockfile && yarn build`
6. Deploy.

## 4. Login Awal
1. Buka URL Vercel.
2. Login dengan `ADMIN_EMAIL` dan `ADMIN_PASSWORD` dari backend secret.
3. Segera ganti password di Pengaturan.
4. Masuk Manajemen Pengguna dan isi nomor WhatsApp untuk akun yang boleh reset password via OTP.

## 5. Setup Lini Bisnis dan Struk
1. Buka menu **Lini Bisnis**.
2. Untuk setiap bisnis (Warung, Pupuk, dll), isi:
   - nama struk,
   - alamat,
   - telepon,
   - footer,
   - catatan struk.
3. Saat checkout, struk otomatis mengikuti unit bisnis aktif.

## 6. Setup WhatsApp OTP
Tanpa provider WA:
- Biarkan `WHATSAPP_API_URL` dan `WHATSAPP_API_KEY` kosong.
- Saat request OTP, sistem akan memberi link `wa.me` manual.

Dengan provider WA:
- Isi `WHATSAPP_API_URL` dan `WHATSAPP_API_KEY` di HuggingFace Secrets.
- Format request backend generik:
  - header `Authorization: <WHATSAPP_API_KEY>`
  - JSON berisi `target`, `phone`, dan `message`.
- Jika provider berbeda format, sesuaikan fungsi `send_whatsapp_message()` di `backend/server.py`.

## 7. Setup Payment Gateway/QRIS
1. Buka menu **Pengaturan > Payment Gateway / QRIS**.
2. Pilih provider: Midtrans, Xendit, Duitku, atau Custom.
3. Isi Server Key, Client Key, Webhook Secret jika sudah punya.
4. Aktifkan gateway.
5. Di dashboard provider, arahkan webhook ke:
   - `https://<space>.hf.space/api/payment-webhooks/midtrans`
   - atau `/xendit`, `/duitku`, `/custom`
6. Saat ada payload sukses, sistem menyimpan webhook dan membuat notifikasi pembayaran.

## 8. Checklist Setelah Deploy
- Login sukses.
- Buat user baru dengan nomor WA.
- Coba reset password via WA OTP.
- Coba kasir dengan uang tunai kurang dari total; harus berhasil dan tercatat hutang.
- Coba transaksi Pemakaian Sendiri; stok berkurang dan pendapatan tetap Rp 0.
- Coba Detail dan Print Ulang struk dari Riwayat Kasir.
- Isi Bantuan/Tutorial lalu pastikan tampil.
- Cek Notifikasi setelah stok melewati minimum.
- Cek Laporan Keuangan.

## 9. Catatan Keamanan
- Jangan commit file `.env` asli.
- Gunakan `JWT_SECRET` panjang dan acak.
- Ganti `ADMIN_PASSWORD` setelah login pertama.
- Jangan simpan kredensial payment gateway di frontend.
- Untuk produksi, gunakan domain HTTPS Vercel di `CORS_ORIGINS`.
