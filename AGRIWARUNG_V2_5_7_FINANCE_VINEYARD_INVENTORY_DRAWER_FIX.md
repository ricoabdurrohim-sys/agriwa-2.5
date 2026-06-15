# AgriWarung v2.5.7 — Finance, Vineyard, Inventory Batch, Receipt & Drawer Fix

## Fokus patch

1. **Keuangan/Dashboard/Laporan/Kasir dibuat satu sumber data**
   - Backend memperkuat canonical cash collected untuk transaksi bon.
   - `finance/summary` sekarang melakukan repair ringan bon legacy saat dibuka.
   - Keuangan memakai `cashier_ledger` dari backend, bukan hitung manual yang bisa beda.
   - Transaksi bon lama yang pernah `cancelled/replaced` tetap diperlakukan sebagai transaksi asli jika sudah terkait customer debt.

2. **Modal Edit Lini Bisnis dibuat scrollable**
   - Dialog edit/tambah lini bisnis memakai `max-h-[85vh] overflow-y-auto` agar tidak terpotong di laptop.

3. **Pengaturan struk global dihapus dari menu Pengaturan**
   - Nama/alamat/telepon/footer/catatan struk hanya diatur di menu **Lini Bisnis**.
   - Backend dan frontend receipt tidak lagi memakai alamat/telepon/footer global sebagai fallback.

4. **Kebun Anggur: Plot terhubung ke Inventori**
   - Saat membuat plot, user bisa memilih:
     - buat item inventori tanaman otomatis,
     - gunakan item inventori yang sudah ada,
     - atau tidak catat ke inventori.
   - Jumlah tanaman/pohon masuk ke inventori sebagai stok aset tanaman.
   - Saat jumlah tanaman diedit, inventory hanya menyesuaikan selisihnya.

5. **Inventori batch/supplier tracking**
   - Jika menambah barang dengan nama+unit+unit bisnis yang sama, sistem tidak membuat duplikat.
   - Stok akan digabung ke item lama dan membuat catatan batch baru.
   - Batch menyimpan supplier, no batch/invoice, link pembelian, ref pembelian, tanggal kadaluarsa/evaluasi, dan notes.
   - Berguna untuk retur atau menelusuri supplier bermasalah.

6. **Kasir pelunasan bon**
   - Input pelunasan bon otomatis mengikuti sisa tagihan.
   - Warning merah hanya muncul kalau nominal benar-benar kurang.
   - Receipt tetap mengikuti Lini Bisnis.

7. **Drawer lebih rapi**
   - Tampilan drawer dibuat lebih modern dengan grup modul, quick actions, count per grup, mode ringkas/lengkap, dan tampilan visual yang lebih jelas.

## File utama berubah

- `backend/server.py`
- `frontend/src/pages/BusinessUnits.jsx`
- `frontend/src/pages/Pengaturan.jsx`
- `frontend/src/pages/Kasir.jsx`
- `frontend/src/pages/Keuangan.jsx`
- `frontend/src/pages/Anggur.jsx`
- `frontend/src/pages/Inventori.jsx`
- `frontend/src/components/Layout.jsx`

## Catatan deploy

Setelah push ke GitHub:

1. Tunggu HuggingFace rebuild/restart backend.
2. Tunggu Vercel redeploy frontend.
3. Hard refresh browser: `Ctrl + F5` atau buka InPrivate.
4. Test cepat:
   - Lini Bisnis → edit struk, pastikan modal bisa discroll.
   - Pengaturan → pastikan tidak ada form alamat/footer struk global.
   - Kebun Anggur → Plot Baru → pilih integrasi inventori.
   - Inventori → tambah barang sama → cek stok merge dan batch supplier.
   - Kasir bon partial/lunas → cek Keuangan, Dashboard, Laporan, Riwayat Kasir.
