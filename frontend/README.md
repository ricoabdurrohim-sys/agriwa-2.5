---
title: AgriWarung Manager
emoji: 🍇
colorFrom: green
colorTo: amber
sdk: static
pinned: false
license: mit
short_description: Aplikasi manajemen multi-bisnis untuk grup agribisnis
---

# AgriWarung Manager — Frontend (Hugging Face Static Space)

Frontend React static yang dideploy di Hugging Face Spaces.

## Cara Setup (Hugging Face Static Space)

1. **Build lokal**:
   ```bash
   cd frontend
   yarn install
   REACT_APP_BACKEND_URL=https://USERNAME-agriwarung-backend.hf.space yarn build
   ```
2. **Upload isi folder `frontend/build/`** ke root Space ini. Caranya:
   - Buat Space baru → SDK: **Static** → Visibility: Public/Private
   - Drag & drop semua file dari `frontend/build/` ke tab "Files"
   - Atau push via git: `git clone https://huggingface.co/spaces/USERNAME/SPACE_NAME` lalu copy build files & push

3. **Configure**: tidak perlu env runtime — `REACT_APP_BACKEND_URL` di-bake saat build (env var Create-React-App).

## Catatan

- Hugging Face Static Space **gratis selamanya**, tanpa sleep, dengan custom domain support.
- Build size limit: 5 GB. React build kita ~5-10 MB, sangat aman.
- Lihat panduan lengkap di `/DEPLOY.md` (root repo).
