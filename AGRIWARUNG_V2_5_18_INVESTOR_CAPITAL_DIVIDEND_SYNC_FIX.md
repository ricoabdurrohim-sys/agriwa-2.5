# AgriWarung v2.5.18 — Investor Capital Dividend Sync Fix

## Fokus patch
- Investor tetap bisa diedit saat tahap building.
- Investor dan setoran/alokasi modal bisa dihapus/diedit selama belum ada dividen aktif.
- Setoran modal punya tombol edit/hapus per item.
- Pembagian dividen terintegrasi ke:
  - riwayat dividen di menu Investor,
  - pengeluaran di menu Keuangan,
  - Dashboard dan Laporan Keuangan.
- Jika pengeluaran dividen dihapus dari Keuangan, catatan dividen ikut hilang.
- Jika dividen dibatalkan dari Investor, pengeluaran dividen ikut hilang.

## Aturan kunci data
Data investor/modal mulai dikunci hanya setelah ada pembagian dividen aktif. Jika masih tahap building dan belum ada dividen, investor/modal masih dapat diedit atau dihapus.

## Endpoint baru/perubahan
- PUT `/api/capital-injections/{capital_id}`
- DELETE `/api/capital-injections/{capital_id}`
- POST `/api/dividends/distribute`
- DELETE `/api/dividends/{dividend_id}`

## Deployment
Patch ini mengubah frontend dan backend, jadi perlu update GitHub/Vercel dan HuggingFace.
