# 🚀 Panduan Deploy AgriWarung Manager ke Vercel / Netlify

> Arsitektur aplikasi ini terdiri dari **3 komponen** yang harus di-deploy terpisah:
> - **Frontend** (React) → Vercel atau Netlify (static hosting)
> - **Backend** (FastAPI) → Render.com / Railway / Fly.io (Vercel & Netlify TIDAK cocok untuk FastAPI persistent)
> - **Database** → MongoDB Atlas (free tier M0 cukup)
>
> Setup ini gratis untuk skala kecil-menengah dan bisa di-scale belakangan.

---

## 📋 Langkah 1 — Siapkan MongoDB Atlas (5 menit)

1. Buka https://www.mongodb.com/cloud/atlas → daftar (gratis, tanpa kartu kredit).
2. **Create Free Cluster M0** → pilih region terdekat (Singapore / Mumbai).
3. **Database Access** → Add User → buat username & password (catat!).
4. **Network Access** → Add IP → klik **"Allow access from anywhere"** (`0.0.0.0/0`).
5. **Connect → Drivers → Python** → copy connection string. Bentuknya:
   ```
   mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

---

## 📋 Langkah 2 — Deploy Backend ke Render.com (10 menit)

Render adalah pilihan termudah untuk FastAPI gratis. (Alternatif: Railway, Fly.io, Koyeb.)

1. Push repo ini ke GitHub (gunakan tombol **"Save to GitHub"** di chatbox Emergent).
2. Buka https://render.com → Sign up dengan GitHub.
3. **New + → Blueprint** → pilih repo Anda. Render akan otomatis baca `render.yaml`.
4. Klik **Apply** → service akan dibuat.
5. Setelah service muncul, buka **Environment** tab → set variabel berikut:
   - `MONGO_URL` → connection string Atlas dari Langkah 1
   - `DB_NAME` → `agriwarung_db`
   - `CORS_ORIGINS` → kosongkan dulu (akan diisi setelah frontend deploy)
   - `ADMIN_EMAIL` → email login owner Anda
   - `ADMIN_PASSWORD` → password kuat (min 8 karakter, akan jadi password login awal)
   - `JWT_SECRET` → biarkan auto-generate
6. Klik **Manual Deploy → Deploy latest commit**.
7. Tunggu ~3 menit hingga status hijau "Live". Catat URL backend, mis:
   ```
   https://agriwarung-backend.onrender.com
   ```
8. Test: buka `https://agriwarung-backend.onrender.com/api/health` → harus muncul `{"status":"ok","db":"connected"}`.

> ⚠ **Free tier Render tidur setelah 15 menit idle.** Pertama akses pagi hari akan lambat ~30 detik. Untuk produksi serius, upgrade ke paid plan ($7/bulan) atau pakai Railway/Fly.io.

---

## 📋 Langkah 3a — Deploy Frontend ke **Vercel** (5 menit)

1. Buka https://vercel.com → Sign up dengan GitHub.
2. **Add New → Project** → pilih repo Anda.
3. **Framework Preset**: Other (atau biarkan auto, vercel.json sudah disiapkan).
4. **Environment Variables** → tambahkan:
   - Name: `REACT_APP_BACKEND_URL`
   - Value: `https://agriwarung-backend.onrender.com` (URL dari Langkah 2)
   - Environment: ✅ Production, ✅ Preview, ✅ Development
5. Klik **Deploy**. Tunggu ~2 menit.
6. Setelah selesai, catat URL frontend, mis: `https://agriwarung-xyz.vercel.app`.

### Final Step — Update CORS di backend
1. Balik ke Render → service backend → Environment → edit `CORS_ORIGINS`:
   ```
   https://agriwarung-xyz.vercel.app
   ```
   (Untuk multiple domain pisah koma.)
2. Save → Render auto-redeploy.
3. Buka URL frontend Anda → login dengan `ADMIN_EMAIL` / `ADMIN_PASSWORD` yang Anda set.
4. Setelah login, masuk **Pengaturan → Zona Berbahaya → Reset Data Demo** untuk mulai dari nol.

---

## 📋 Langkah 3b — Atau Deploy Frontend ke **Netlify** (5 menit)

1. Buka https://app.netlify.com → Sign up dengan GitHub.
2. **Add new site → Import existing project → GitHub** → pilih repo.
3. Netlify akan auto-detect `netlify.toml`. Biarkan default.
4. **Site settings → Environment variables** → tambahkan:
   - Key: `REACT_APP_BACKEND_URL`
   - Value: `https://agriwarung-backend.onrender.com`
5. **Deploys → Trigger deploy → Clear cache and deploy site**.
6. Setelah selesai, update `CORS_ORIGINS` di Render seperti instruksi Vercel di atas.

---

## 📋 Langkah 3c — Atau Deploy ke **Hugging Face Spaces** (100% Gratis Selamanya)

Hugging Face Spaces lebih cocok kalau Anda ingin **gratis tanpa cold start / tanpa sleep** dengan custom domain. Kita pakai 2 Space terpisah: Static untuk frontend, Docker untuk backend.

### 3c.1 — Backend ke Docker Space (FastAPI + MongoDB Atlas)

1. Buka https://huggingface.co → sign up gratis.
2. **+ New Space** → Name: `agriwarung-backend` → SDK: **Docker** → Hardware: CPU basic (free).
3. Push repo lewat git:
   ```bash
   git clone https://huggingface.co/spaces/USERNAME/agriwarung-backend
   cd agriwarung-backend
   # Copy file dari repo asli ke folder ini:
   cp -r /path/to/agriwarung/{Dockerfile,backend} .
   git add . && git commit -m "Initial backend" && git push
   ```
   File `Dockerfile` di root sudah dibuat dan port-nya sudah 7860 (HF Spaces standard).
4. Di HF Spaces dashboard → **Settings → Variables and secrets**, tambahkan:
   - `MONGO_URL` (dari Atlas)
   - `DB_NAME` → `agriwarung_db`
   - `JWT_SECRET` (random 32 byte)
   - `CORS_ORIGINS` → `https://USERNAME-agriwarung-frontend.hf.space`
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`
   - `RESEND_API_KEY` (opsional, untuk email reset password)
   - `SENDER_EMAIL` → `onboarding@resend.dev`
5. Restart Space. URL backend: `https://USERNAME-agriwarung-backend.hf.space`
6. Test: `curl https://USERNAME-agriwarung-backend.hf.space/api/health` → harus `{"status":"ok"}`.

### 3c.2 — Frontend ke Static Space (React build)

1. Build React lokal dengan URL backend HF:
   ```bash
   cd frontend
   yarn install
   REACT_APP_BACKEND_URL=https://USERNAME-agriwarung-backend.hf.space yarn build
   ```
2. Di Hugging Face → **+ New Space** → Name: `agriwarung-frontend` → SDK: **Static**.
3. Push isi `frontend/build/` ke Space:
   ```bash
   git clone https://huggingface.co/spaces/USERNAME/agriwarung-frontend
   cd agriwarung-frontend
   cp -r /path/to/agriwarung/frontend/build/* .
   git add . && git commit -m "Initial frontend" && git push
   ```
4. URL frontend: `https://USERNAME-agriwarung-frontend.hf.space`
5. Login → mulai pakai aplikasi.

### Keunggulan HF Spaces vs Vercel/Render
| Aspek | HF Spaces | Vercel + Render |
|---|---|---|
| Cold start | ❌ Tidak ada | Render free tidur 15 mnt |
| Biaya | 100% free | Free tier |
| Custom domain | Free | Free |
| Auto-deploy git | ✅ Native | ✅ Native |
| Resource | 2 vCPU, 16GB RAM (CPU basic) | 0.5 vCPU, 512MB |

---

## 📧 (Opsional) Setup Resend untuk Email Reset Password — 5 menit

Tanpa setup ini, fitur "Lupa Password" jalan dalam **demo mode** (token muncul di layar).
Dengan setup ini, token dikirim ke email user.

1. Daftar gratis di https://resend.com (3000 email/bulan free, tanpa kartu kredit).
2. Dashboard → **API Keys → Create API Key** → copy key (formatnya `re_xxxxxx`).
3. (Opsional, untuk pakai email domain Anda sendiri): **Domains → Add Domain** → ikuti DNS verification (5 menit). Skip jika OK pakai `onboarding@resend.dev`.
4. Set env vars di Render/HF Spaces backend:
   - `RESEND_API_KEY` → key dari step 2
   - `SENDER_EMAIL` → `onboarding@resend.dev` (atau domain Anda kalau sudah diverify)
5. Restart backend. Test: di halaman Login klik "Lupa password?" → masukkan email → seharusnya tidak ada token muncul di UI lagi, melainkan toast "Cek email Anda".

⚠ **Catatan testing mode Resend**: tanpa domain verified, Resend hanya mengirim ke email yang sama dengan akun Resend Anda. Untuk kirim ke email user manapun, verifikasi domain dulu.

---

## 🔒 Checklist Keamanan Sebelum Go-Live

- [ ] Ganti `ADMIN_PASSWORD` default → password kuat unik per owner.
- [ ] `JWT_SECRET` minimum 32 byte random (jangan pakai contoh).
- [ ] `CORS_ORIGINS` HANYA berisi domain frontend Anda (bukan `*`).
- [ ] MongoDB Atlas → buat user khusus dengan role `readWrite` saja (jangan `atlasAdmin`).
- [ ] Login sebagai admin → ganti email & password lewat **Pengaturan → Profil Saya & Ganti Password**.
- [ ] Reset data demo → mulai entry data bisnis Anda yang asli.

---

## 🔑 Login dengan Google (Emergent OAuth)

Aplikasi ini sudah dilengkapi tombol **"Lanjutkan dengan Google"** di halaman login. Fitur ini **tidak butuh setup tambahan** — sudah otomatis bekerja di domain Vercel/Netlify Anda karena memakai Emergent-managed OAuth.

### Cara kerja
1. User klik tombol → redirect ke `https://auth.emergentagent.com/?redirect=<domain-anda>/`
2. Setelah login Google sukses → redirect kembali ke domain Anda dengan `#session_id=xxx`
3. Frontend otomatis kirim ke backend `POST /api/auth/google-session`
4. Backend validasi via Emergent Auth API → buat/update user di MongoDB → set cookie + JWT
5. User auto-login

### Kebijakan akun
- Akun Google baru → otomatis dibuat dengan role **kasir** (paling restrictive).
- Super admin bisa upgrade role lewat menu **Pengguna**.
- Email Google yang sama dengan akun email/password existing → akan ter-link otomatis.

### Lupa Password (untuk akun email/password)
- Klik "Lupa password?" di Login → masukkan email → token reset muncul di layar (demo mode).
- Untuk produksi: integrasikan SMTP (SendGrid/Resend) supaya token dikirim via email.

---

## 🛠 Troubleshooting

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| `Network Error` di frontend | CORS belum di-update | Edit `CORS_ORIGINS` di Render → tambahkan URL Vercel/Netlify |
| `db unreachable` di /api/health | IP belum di-whitelist di Atlas | Tambahkan `0.0.0.0/0` di Atlas Network Access |
| Backend cold start lambat | Render free tier idle | Upgrade ke paid atau pakai cron-ping service |
| Login admin 401 | `ADMIN_EMAIL`/`ADMIN_PASSWORD` di Render belum ter-set sebelum first start | Set env vars → Manual Deploy ulang → admin akan auto-seed |
| PWA tidak install | HTTPS belum aktif | Vercel/Netlify auto HTTPS — tunggu ~2 menit pasca deploy |

---

## 🔁 Update Code di Production

Setiap push ke branch utama GitHub akan otomatis:
- Render → rebuild backend
- Vercel/Netlify → rebuild frontend

Tidak perlu deploy manual lagi. 🚀

---

## 📊 Skala & Biaya

| Komponen | Tier Gratis | Cukup Untuk | Paid Lanjutan |
|---|---|---|---|
| MongoDB Atlas M0 | 512 MB | ~10K transaksi | $9/bln M2 (2GB) |
| Render Web Service | 750 jam/bln + sleep | Demo & UMKM kecil | $7/bln always-on |
| Vercel / Netlify | Unlimited static | Semua frontend | $20/bln Pro |

Total awal: **Rp 0/bulan**. Saat bisnis tumbuh tinggal upgrade per layer.

Selamat deploy! 🎉
