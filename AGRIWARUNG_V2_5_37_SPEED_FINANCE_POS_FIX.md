# AgriWarung v2.5.37 — Speed Finance, POS, Warung & Self-Order Fix

Tanggal patch: 18 Juni 2026

## Target patch

Patch ini fokus mempercepat area yang masih terasa lelet tanpa membongkar integrasi besar yang sudah jalan:

- penyelesaian transaksi dari Kasir,
- refresh Dashboard setelah transaksi,
- Keuangan dan Laporan yang sebelumnya sering menghitung ulang data besar,
- Warung / self-order agar order update tidak memicu reload berat,
- varian menu agar tetap muncul walaupun data lama punya flag `has_variants` yang salah.

## File yang berubah

- `backend/server.py`
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/pages/Keuangan.jsx`
- `frontend/src/pages/Laporan.jsx`

## Isi perbaikan utama

### 1. Transaksi kasir lebih ringan

Sebelumnya, saat transaksi dibuat, backend memproses stok item satu per satu dengan banyak query berurutan:

- cari item,
- update stok,
- konsumsi batch,
- baca stok ulang,
- tulis stock movement,
- cek low stock.

Sekarang proses stok dibuat lebih ringan:

- inventory item diambil sekaligus,
- pengurangan stok memakai `bulk_write`,
- stock movement ditulis memakai `insert_many`,
- cek low-stock tetap jalan di background.

Tujuannya agar tombol konfirmasi Kasir tidak ikut menunggu operasi database yang terlalu banyak.

### 2. Finance summary tidak langsung dibuang setiap transaksi

Sebelumnya cache ringkasan finance langsung dihapus setelah transaksi. Akibatnya Dashboard, Keuangan, dan Laporan bisa memaksa backend menghitung ulang semua transaksi/debt/expense/income lagi.

Sekarang dipakai pola `stale-while-revalidate`:

- transaksi selesai dulu,
- cache lama boleh dipakai sebentar,
- backend menyegarkan finance summary di background,
- frontend mengambil ulang data setelah beberapa detik.

Ini menjaga integrasi angka tetap dari sumber yang sama, tetapi tidak membuat alur Warung/Kasir ikut berat.

### 3. Dashboard tidak refresh gara-gara order meja biasa

Dashboard tidak lagi reload saat event `order_created` / `order_updated` biasa. Dashboard hanya refresh untuk event yang memang mengubah angka:

- `transaction_created`,
- `transaction_cancelled`,
- `transaction_updated`,
- `bizunit_updated`.

Refresh juga dibuat debounce agar tidak terpanggil berkali-kali dalam waktu dekat.

### 4. Keuangan dan Laporan tidak lagi force-refresh berat setiap event transaksi

Keuangan dan Laporan sekarang:

- tidak memakai `force=true` otomatis setiap transaksi,
- membersihkan cache frontend seperlunya,
- mengambil data cepat dulu,
- mengambil ulang sekali lagi setelah cache background backend kemungkinan selesai.

### 5. Varian menu lama tetap muncul

Data lama bisa punya `variants`, tetapi `has_variants` masih `false`. Itu membuat varian tidak keluar di Kasir/Warung/self-order.

Sekarang backend menormalkan data:

- jika item punya varian valid, `has_variants` otomatis dianggap `true`,
- endpoint `/public/menu` juga menentukan `has_variants` dari varian aktif, bukan dari flag lama saja.

### 6. Dashboard low-stock lebih ringan

Dashboard tidak lagi menarik semua inventory hanya untuk mencari stok rendah. Backend sekarang mengambil item low-stock langsung dari query MongoDB dengan projection kecil.

## Cara deploy ke Hugging Face Space

Kalau memakai repo HF langsung:

```bash
git clone https://huggingface.co/spaces/rikoabd/agriwarung-2.5
cd agriwarung-2.5
```

Lalu copy file patch ini ke repo HF:

```text
backend/server.py
frontend/src/pages/Dashboard.jsx
frontend/src/pages/Keuangan.jsx
frontend/src/pages/Laporan.jsx
AGRIWARUNG_V2_5_37_SPEED_FINANCE_POS_FIX.md
```

Commit dan push:

```bash
git add backend/server.py frontend/src/pages/Dashboard.jsx frontend/src/pages/Keuangan.jsx frontend/src/pages/Laporan.jsx AGRIWARUNG_V2_5_37_SPEED_FINANCE_POS_FIX.md
git commit -m "v2.5.37 speed finance pos warung fix"
git push
```

## Cara deploy frontend ke Vercel

Karena file frontend berubah, Vercel juga perlu redeploy.

Pastikan Vercel tetap memakai:

```text
Root Directory: frontend
Build Command: yarn build
Output Directory: build
Install Command: yarn install --frozen-lockfile
```

Environment frontend tetap:

```text
REACT_APP_BACKEND_URL=https://rikoabd-agriwarung-backend.hf.space
```

Jika backend HF Space yang dipakai berbeda, sesuaikan URL tersebut.

## Checklist test setelah deploy

Urutan test yang disarankan:

1. Login.
2. Buka Warung.
3. Tambah item ke meja, tambah qty, kurangi qty, hapus item.
4. Tambah meja dan hapus meja.
5. Scan QR meja / buka link self-order.
6. Pastikan menu lengkap dan varian muncul.
7. Submit self-order.
8. Pastikan order masuk ke Warung.
9. Pastikan badge notifikasi berubah dan suara berbunyi.
10. Kirim order ke Kasir.
11. Selesaikan transaksi tunai normal.
12. Cek Dashboard, Keuangan, dan Laporan.
13. Ulangi dengan transaksi bon/sebagian jika perlu.

## Catatan validasi

Backend sudah dicek dengan:

```bash
python3 -m py_compile backend/server.py
```

Frontend belum dibuild di environment patch ini karena dependency `node_modules`/lockfile build tidak tersedia di ZIP kerja. Build final tetap perlu dicek oleh Vercel saat deploy.
