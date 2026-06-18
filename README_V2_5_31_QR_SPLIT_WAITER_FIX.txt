AGRIWARUNG v2.5.31 - QR WARUNG, SPLIT BILL, PANGGIL PELAYAN, RECEIPT FIX

INI ZIP UNTUK GITHUB / VERCEL.

PERBAIKAN UTAMA:
1. QR Pesanan Meja dari menu Warung dibuat lebih pendek agar printer tidak mencetak error "QR creat err".
2. QR Pesanan Meja sekarang berisi format: aw:warung-order:ORDER_ID.
3. Saat discan lewat Pintasan Scan AgriWarung, backend resolve ke meja + order aktif yang benar.
4. Tidak lagi jatuh ke pencarian global lintas lini bisnis.
5. Dialog struk desktop dibuat lebih lebar dan scroll supaya tidak terpotong.
6. Nomor transaksi di bawah QR preview struk dihilangkan jika label kosong.
7. Footer default "Terima kasih" dihilangkan; struk mengikuti pengaturan Lini Bisnis.
8. Emoji/header/footer di thermal dicoba rasterize ke bitmap agar tidak keluar kode aneh.
9. Menu utama baru: Split Bill.
10. Split Bill membayar sebagian item dari order aktif; sisa order tetap aktif di meja.
11. Self-order QR meja ditambah tombol Panggil Pelayan dan Minta Bill.

UPLOAD GITHUB:
1. Extract ZIP.
2. Copy semua isi folder ini ke repo GitHub AgriWarung.
3. Replace file lama.
4. Commit summary:
   Fix warung QR scan split bill waiter receipt
5. Push ke GitHub.
6. Tunggu Vercel redeploy.

UPLOAD HF:
Gunakan ZIP HF_BACKEND v2.5.31 yang terpisah.

CATATAN:
Untuk QR pesanan Warung, scan lewat menu Pintasan Scan di aplikasi AgriWarung.
Payload QR sengaja pendek agar printer thermal murah tidak error saat membuat QR.
