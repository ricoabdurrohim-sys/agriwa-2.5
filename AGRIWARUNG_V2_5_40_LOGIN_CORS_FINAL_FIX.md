# AgriWarung v2.5.40 - Login CORS Final Fix + Cleanup

Tanggal: 2026-06-25

## Diagnosis utama
Aplikasi gagal login bukan karena MongoDB atau HuggingFace rusak. Backend dan DB bisa tetap sehat, tetapi browser Vercel memblokir request login lintas domain.

Penyebab yang ditemukan di ZIP:

1. Patch login/CORS v2.5.39 sudah ada, tetapi tersimpan di folder salah: `frontend/frontend/src/...`.
2. Vercel build memakai folder benar: `frontend/src/...`, jadi patch tersebut tidak pernah aktif.
3. `frontend/src/lib/api.js` masih memakai `withCredentials: true`, padahal login manual AgriWarung memakai Bearer token `aw_token` di localStorage, bukan cookie.
4. Beberapa file frontend masih membaca `process.env.REACT_APP_BACKEND_URL` langsung. Kalau env kosong/salah/terisi `/api`, beberapa fitur bisa memanggil URL `undefined/api` atau dobel `/api/api`.

## Perbaikan yang dilakukan

### Frontend
- Memindahkan patch login/CORS ke folder yang benar: `frontend/src/...`.
- `frontend/src/lib/api.js`:
  - `withCredentials` diubah menjadi `false`.
  - `timeout` request ditambah 30 detik.
  - normalisasi `REACT_APP_BACKEND_URL` tetap aman jika kosong, ada trailing slash, atau terisi `/api`.
  - token lama dihapus otomatis bila `/auth/me` kena 401 agar user tidak stuck.
  - debug ringan ditampilkan di console DevTools.
- `frontend/src/pages/Login.jsx`:
  - pesan error login dibuat lebih jelas.
  - console debug menampilkan API base yang dipakai.
- `frontend/src/lib/useWebSocket.js`, `PublicOrder.jsx`, `TableSelfOrder.jsx`, `ReceiptSettingsFields.jsx`, `ImageUpload.jsx`, `receiptPrint80mm.js`:
  - semua memakai URL backend hasil normalisasi dari `src/lib/api.js`.
- `ReceiptSettingsFields.jsx`:
  - upload gambar struk memakai token `aw_token`.
  - `credentials: include` dihapus agar tidak kena blok CORS.
- `receiptImageHelpers.js`:
  - fetch gambar struk tidak lagi mengirim credentials lintas domain.
- Folder salah `frontend/frontend/` dihapus agar tidak membingungkan lagi.

### Backend
- `backend/server.py`:
  - CORS dibuat lebih aman: kalau `CORS_ORIGINS=*`, backend tidak mengaktifkan credentials sehingga request browser Vercel ke HF tidak diblokir.
  - kalau nanti `CORS_ORIGINS` diisi domain spesifik Vercel, credentials otomatis boleh aktif.
- `/reports/sales-analytics` dioptimalkan:
  - hanya mengambil field yang diperlukan, bukan seluruh dokumen transaksi/receipt besar.

## File utama yang berubah
```text
backend/server.py
frontend/src/lib/api.js
frontend/src/pages/Login.jsx
frontend/src/lib/useWebSocket.js
frontend/src/pages/PublicOrder.jsx
frontend/src/pages/TableSelfOrder.jsx
frontend/src/components/ReceiptSettingsFields.jsx
frontend/src/components/ImageUpload.jsx
frontend/src/utils/receiptPrint80mm.js
frontend/src/utils/receiptImageHelpers.js
AGRIWARUNG_V2_5_40_LOGIN_CORS_FINAL_FIX.md
```

## Tes yang dilakukan
- `python -m py_compile backend/server.py` sukses.
- `python -m compileall -q backend` sukses.
- `node --check` untuk file JS non-JSX yang diubah sukses:
  - `frontend/src/lib/api.js`
  - `frontend/src/lib/useWebSocket.js`
  - `frontend/src/utils/receiptPrint80mm.js`
  - `frontend/src/utils/receiptImageHelpers.js`

Build React penuh tidak dijalankan di sandbox ini karena dependency `node_modules` tidak tersedia di ZIP dan internet sandbox tidak aktif.

## Catatan deploy
- Push ZIP ini ke GitHub.
- Vercel akan redeploy frontend.
- Karena backend juga ada patch CORS, push ke GitHub yang terhubung ke HuggingFace juga tetap direkomendasikan.
- Pastikan env Vercel `REACT_APP_BACKEND_URL` berisi origin HF saja, contoh:
  `https://rikoabd-agriwarung-2-5.hf.space`
  Jangan pakai `/api` di belakangnya.

## Summary GitHub
```text
v2.5.40 fix active login cors patch and normalized backend url
```
