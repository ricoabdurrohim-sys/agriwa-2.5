AGRIWARUNG v2.5.30 - QR WARUNG DIRECT, AI INSIGHT, PRINT CLEANUP

UNTUK: GITHUB / VERCEL

PERBAIKAN UTAMA:
1. QR pesanan dari menu Warung sekarang langsung mengarah ke /warung?table=...&order=...
   sehingga tidak masuk pencarian umum lintas lini bisnis/menu.
2. Scan QR Warung tetap didukung dari halaman Pintasan Scan, tetapi mode warung-order tidak akan mencari global.
3. Selama transaksi belum diselesaikan di Kasir, order tetap aktif di meja.
4. Nomor transaksi di bawah QR code struk pembayaran dihapus karena sudah ada di bagian atas nota.
5. Dialog desktop dibuat lebar, tetap scroll, dan tidak sempit kiri-kanan.
6. Operasional Pro ditambah AI Insight Operasional.
   - Jika AI_GATEWAY_API_KEY diisi di HF, rekomendasi memakai Vercel AI Gateway.
   - Jika belum diisi, sistem tetap menampilkan rekomendasi lokal berbasis rule dari data aktif.

ENV OPSIONAL HF UNTUK AI:
AI_GATEWAY_API_KEY = isi dari Vercel AI Gateway API Key
AI_GATEWAY_MODEL = default openai/gpt-5.4, boleh diganti sesuai model di Vercel AI Gateway

ENV WAJIB TETAP:
MONGO_URL
DB_NAME
JWT_SECRET
FRONTEND_PUBLIC_URL

VERCEL ENV WAJIB:
REACT_APP_BACKEND_URL=https://URL-HF-KAMU.hf.space

COMMIT SUMMARY GITHUB:
Fix warung QR direct scan and add AI operational insights
