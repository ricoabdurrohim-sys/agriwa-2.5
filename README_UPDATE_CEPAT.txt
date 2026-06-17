AGRIWARUNG V2.5.16 - PRINT 80MM + QR MEJA

UPLOAD KE GITHUB
1. Extract ZIP ini.
2. Copy folder frontend dan backend ke repo GitHub AgriWarung.
3. Replace file lama kalau diminta.
4. Commit summary:
   Fix 80mm receipt print and add table QR self order
5. Push ke GitHub.
6. Tunggu Vercel redeploy.

UPLOAD KE HUGGING FACE
Karena patch ini menambah endpoint QR meja, HF juga perlu update.
Upload/replace di HF Space backend:
- server_patched.py
- Dockerfile

Jangan hapus:
- server.py
- requirements.txt
- uploads

Commit summary HF:
Add table QR self order backend v2.5.16

SETTING PENTING DI HF
Tambahkan secret/variable jika belum ada:
FRONTEND_PUBLIC_URL=https://domain-vercel-kamu.vercel.app

Contoh:
FRONTEND_PUBLIC_URL=https://agriwarung.vercel.app

Kalau variable ini kosong, backend akan mencoba pakai Origin dari frontend saat tombol Print QR dipanggil.

CATATAN
- Untuk struk dengan gambar/logo, gunakan mode browser print/80mm.
- Di printer settings: paper 80mm, scale 100%, margin none/default, browser header-footer OFF.
