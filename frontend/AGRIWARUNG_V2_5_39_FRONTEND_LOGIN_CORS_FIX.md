# AgriWarung v2.5.39 - Frontend Login CORS Fix

Tanggal: 2026-06-24

## Diagnosis
Login langsung di Hugging Face `/api/auth/login` berhasil `200`, jadi backend, MongoDB, akun, dan password aman.
Masalah ada di browser aplikasi Vercel yang memanggil backend HF lintas domain.

Penyebab yang paling mungkin: `axios` frontend memakai `withCredentials: true`. Untuk login manual AgriWarung kita memakai token Bearer di `localStorage`, bukan cookie. Saat request lintas domain Vercel -> HuggingFace mengirim mode credentials, browser bisa memblokir request kalau CORS backend masih wildcard.

## Perbaikan
- `frontend/src/lib/api.js`
  - `withCredentials` diubah dari `true` menjadi `false`.
  - Tetap menyimpan dan mengirim token `aw_token` lewat header `Authorization: Bearer ...`.
  - Tetap menormalisasi `REACT_APP_BACKEND_URL` agar tidak dobel `/api`.
  - Tambah console warning agar error login mudah dibaca.

- `frontend/src/index.js`
  - Tetap membersihkan service worker lama.

- `frontend/public/service-worker.js`
  - Tetap tidak intercept fetch.

- `frontend/src/pages/Login.jsx`
  - Pesan error login dibuat lebih jelas di console.

## File yang perlu dipush ke GitHub/Vercel
```text
frontend/src/lib/api.js
frontend/src/index.js
frontend/public/service-worker.js
frontend/src/pages/Login.jsx
AGRIWARUNG_V2_5_39_FRONTEND_LOGIN_CORS_FIX.md
```

## Deploy
Ini hanya frontend. Push ke GitHub yang terhubung ke Vercel, lalu tunggu redeploy.
HF/backend tidak perlu update untuk patch ini.

Summary GitHub:
```text
v2.5.39 frontend login cors fix
```
