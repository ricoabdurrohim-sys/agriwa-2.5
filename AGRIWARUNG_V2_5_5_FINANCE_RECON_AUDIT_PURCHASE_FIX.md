# AgriWarung v2.5.5 — Finance Match, Rekonsiliasi, Audit, Pembelian Fix

## Fokus patch

1. Menyamakan sumber data Keuangan, Dashboard, dan Laporan.
2. Memperbaiki bug Pemasukan Kasir yang hilang/0 setelah bon lunas.
3. Membuat Import Bank & Rekonsiliasi lebih jelas dan lebih berguna.
4. Membuat Audit Log bisa dibuka detailnya langsung tanpa bolak-balik ke menu lain.
5. Membuat modal Tambah Order Online/Purchase Order bisa discroll dan tidak terpotong.
6. Menambah alur pembelian ala ERP/olshop: buat order → terima stok → bayar sebagian/lunas → simpan link dan bukti.

## Perbaikan Keuangan

Backend sekarang memiliki endpoint baru:

```text
GET /api/finance/summary
```

Endpoint ini menjadi sumber kebenaran untuk halaman Keuangan:

- transaksi pelunasan bon tidak dihitung sebagai penjualan baru,
- transaksi asli tetap ditampilkan,
- `cash_collected` = DP awal + pembayaran bon,
- `open_receivable` = sisa piutang,
- `transaction_total` = nilai struk asli.

Contoh:

```text
Total belanja       Rp21.000
DP awal             Rp10.000
Pelunasan bon       Rp11.000

Keuangan setelah DP:      Pemasukan Kasir Rp10.000, Piutang Rp11.000
Keuangan setelah lunas:   Pemasukan Kasir Rp21.000, Piutang Rp0
Riwayat Kasir:            Tetap struk asli Rp21.000
```

## Perbaikan Import Bank & Rekonsiliasi

- Parser CSV lebih toleran untuk kolom Indonesia/Inggris.
- Matching otomatis tidak hanya berdasarkan total transaksi, tetapi juga:
  - transaksi kasir,
  - DP awal bon,
  - pembayaran/pelunasan bon,
  - pemasukan non-kasir,
  - pengeluaran.
- Mutasi yang belum cocok bisa dibuka dan dipilih kandidatnya.
- Ada icon info kecil untuk menjelaskan menu.

Endpoint baru:

```text
GET /api/bank/transactions/{id}/candidates
```

## Perbaikan Audit Log

Audit Log sekarang punya tombol Detail.

Endpoint baru:

```text
GET /api/audit-logs/{log_id}/detail
```

Detail menampilkan:

- user,
- waktu,
- action,
- entity,
- payload audit,
- data terkait saat ini,
- shortcut ke menu terkait jika ada.

## Perbaikan Pembelian & Supplier

- Modal order online dan PO sekarang bisa discroll.
- Tambah kartu panduan alur pembelian.
- Tetap mendukung invoice/bukti bayar/link marketplace/pembayaran parsial/print bukti.

## File yang berubah

```text
backend/server.py
frontend/src/pages/Keuangan.jsx
frontend/src/pages/BankImport.jsx
frontend/src/pages/AuditLog.jsx
frontend/src/pages/Pembelian.jsx
```

## Catatan test

- `backend/server.py` lolos syntax check Python.
- Full Vercel build tetap perlu dicek setelah push karena environment ini tidak menginstall dependency frontend.
