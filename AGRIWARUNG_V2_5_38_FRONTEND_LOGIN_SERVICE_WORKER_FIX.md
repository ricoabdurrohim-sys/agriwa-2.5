# AgriWarung v2.5.38 - Frontend Login / Service Worker Fix

Tanggal: 2026-06-24

## Masalah
Login dari HF `/api/auth/login` berhasil `200`, artinya backend, MongoDB, user, dan password aman. Namun login dari aplikasi Vercel tetap gagal. Console browser menunjukkan error dari `service-worker.js`:

```text
Failed to convert value to 'Response'
```

Ini menunjukkan masalah berada di frontend/browser service worker, bukan di MongoDB atau password.

## Perbaikan
- `frontend/src/index.js`
  - Stop registrasi service worker baru.
  - Unregister service worker lama.
  - Hapus cache lama bernama `agriwarung*`.

- `frontend/public/service-worker.js`
  - Diganti menjadi service worker pembersih legacy.
  - Tidak lagi intercept request/fetch.
  - Menghapus cache lama dan unregister dirinya sendiri.

- `frontend/src/lib/api.js`
  - Menormalisasi `REACT_APP_BACKEND_URL`.
  - Jika env kosong atau salah berakhiran `/api`, frontend tetap memanggil backend yang benar.
  - Fallback aman ke HF Space aktif: `https://rikoabd-agriwarung-2-5.hf.space`.

## File yang perlu dipush ke GitHub/Vercel
```text
frontend/src/index.js
frontend/src/lib/api.js
frontend/public/service-worker.js
AGRIWARUNG_V2_5_38_FRONTEND_LOGIN_SERVICE_WORKER_FIX.md
```

## Catatan deploy
Ini perubahan frontend. Push ke GitHub lalu tunggu Vercel redeploy. HF/backend tidak perlu diupdate untuk patch ini.
