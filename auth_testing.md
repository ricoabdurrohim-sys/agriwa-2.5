# Auth Testing Notes — v2.5

Reset password token lama sudah dinonaktifkan. Endpoint berikut sekarang mengembalikan HTTP 410:

- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password-with-token`

Flow produksi yang dipakai:

## WhatsApp OTP
1. Pastikan user punya field `phone` di Manajemen Pengguna.
2. Request OTP:
   - `POST /api/auth/request-wa-otp`
   - body: `{ "phone": "08xxxxxxxxxx" }`
3. Reset password:
   - `POST /api/auth/reset-password-wa`
   - body: `{ "phone": "08xxxxxxxxxx", "otp": "123456", "new_password": "passwordbaru" }`

OTP berlaku 10 menit, tersimpan sebagai hash, dan hanya bisa dipakai sekali.

## Super Admin Reset
Super admin dapat reset password user dari menu Manajemen Pengguna:

- `POST /api/users/{uid}/reset-password`
- body: `{ "new_password": "passwordbaru" }`

Aksi ini dicatat ke audit log dan menghasilkan notifikasi keamanan.
