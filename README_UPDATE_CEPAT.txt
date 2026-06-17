AGRIWARUNG v2.5.19 - SYNC FULL SAFE FIX

INI PATCH KOREKSI DARI PATCH SEBELUMNYA.
Jangan pakai lagi server_patched.py sebagai start app.

YANG BENAR:
- Backend HF berjalan dari server.py asli.
- Dockerfile menjalankan uvicorn server:app.
- QR meja memakai endpoint public yang sudah ada di server.py asli.
- Frontend saja yang disesuaikan untuk print QR meja dan self-order.

CARA GITHUB:
1. Extract ZIP.
2. Copy isi folder ini ke repo AgriWarung.
3. Replace file yang sama.
4. Commit summary:
   Sync backend and frontend without server_patched wrapper
5. Push GitHub.
6. Tunggu Vercel redeploy.

CARA HF:
1. Dari repo GitHub hasil update, masuk folder backend.
2. Upload semua ISI folder backend ke HF root.
3. Pastikan root HF berisi server.py, requirements.txt, Dockerfile.
4. Commit summary HF:
   Restore full backend server app

CATATAN:
- Kalau HF root tidak ada server.py, runtime pasti error.
- Paket ini tidak menyertakan server.py penuh karena server.py asli harus diambil dari backend repo kamu agar semua endpoint lama tetap utuh.
- Jangan membuat server.py baru yang minimal karena akan mematikan menu lama.
