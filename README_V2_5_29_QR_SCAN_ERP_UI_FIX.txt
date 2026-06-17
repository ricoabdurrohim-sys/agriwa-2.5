AGRIWARUNG v2.5.29 - QR Scan Pesanan Warung + Desktop UI + Operasional Pro

UNTUK GITHUB / VERCEL.

PERBAIKAN UTAMA:
1. QR pesanan dari menu Warung sekarang memakai payload khusus: aw:warung-order:TABLE_ID:ORDER_ID.
2. Scan QR pesanan tidak lagi mencari data global lintas lini bisnis.
3. Scan QR langsung membuka /warung?table=...&order=... dan menampilkan order aktif meja tersebut.
4. Order tetap aktif selama belum diselesaikan di Kasir.
5. Dialog desktop dibuat lebih lebar tapi tetap scroll agar tombol tidak ketutupan.
6. Tambah menu Operasional Pro untuk pusat kontrol F&B/ritel modern: Warung, Kasir, KDS, Promo, Member, Inventori, dan roadmap fitur ERP aman.
7. Flow cepat v2.5.27/2.5.28 dipertahankan: tidak memakai server_patched.py.

CATATAN:
- Backend tetap server.py penuh.
- HF backend perlu upload ZIP HF v2.5.29 juga agar endpoint scan/resolve memahami aw:warung-order.
- Jangan hapus variable/secret lama.
