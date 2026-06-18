AGRIWARUNG v2.5.35 - SPLIT BILL ODOO STYLE DI KASIR

INI UNTUK GITHUB / VERCEL.

Perubahan utama:
1. Menu Split Bill terpisah dihapus dari drawer dan router.
2. Split Bill dipindahkan ke Kasir seperti flow POS restoran/Odoo.
3. Dari Warung pilih meja -> Lanjut Bayar ke Kasir -> tombol Split Bill muncul di panel keranjang.
4. Pilih item/qty yang dibayar sekarang.
5. Konfirmasi pembayaran hanya untuk item terpilih.
6. Backend tetap mengurangi item terbayar dari order meja aktif.
7. Sisa item tetap aktif di Warung sampai dibayar berikutnya.

Commit summary GitHub:
Move split bill into Kasir order flow

Test wajib:
1. Warung -> Meja -> tambah 3 item.
2. Lanjut Bayar ke Kasir.
3. Di Kasir klik Split Bill dari Order Meja.
4. Pilih 1 item/qty.
5. Bayar.
6. Kembali ke Warung, meja masih aktif dengan sisa item.
7. Bayar sisa item dari Kasir tanpa split atau split lagi.
8. Setelah semua item dibayar, meja harus kosong/paid.
