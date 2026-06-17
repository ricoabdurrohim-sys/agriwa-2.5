# Cara upload HF yang benar untuk v2.5.19

Patch ini membatalkan pola `server_patched.py`.
Backend HF harus kembali menjalankan `server.py` asli:

```txt
uvicorn server:app --host 0.0.0.0 --port 7860
```

## Upload ke HF

Di GitHub repo kamu, masuk folder `backend`. Upload SEMUA isi folder backend ke HF root.
Jangan upload folder `backend`-nya, tapi isi file di dalamnya.

Root HF harus berisi minimal:

```txt
Dockerfile
requirements.txt
server.py
uploads/   optional kalau sudah ada
```

Kalau masih ada `server_patched.py` tidak masalah, tapi Dockerfile v2.5.19 tidak memakainya.

## Hapus penyebab error sebelumnya

Pastikan Dockerfile tidak berisi:

```txt
server_patched:app
```

Harus berisi:

```txt
server:app
```

## Secrets HF tetap sama

```txt
MONGO_URL
DB_NAME
JWT_SECRET
ADMIN_EMAIL
ADMIN_PASSWORD
```

## Commit summary HF

```txt
Restore full backend server app
```
