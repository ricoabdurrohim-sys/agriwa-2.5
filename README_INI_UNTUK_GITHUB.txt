INI FILE UNTUK GITHUB / VERCEL
================================

Nama paket:
GITHUB_agriwarung_v2_5_20_print_qr_sync_patch.zip

Upload/copy isi ZIP ini ke REPO GITHUB AgriWarung kamu.
Ini untuk frontend Vercel + konfigurasi backend di repo.

JANGAN upload ZIP ini ke Hugging Face.

Isi utama:
- frontend/src/utils/printReceipt.js
- frontend/src/utils/receiptPrint80mm.js
- frontend/src/utils/tableQrPrint.js
- frontend/src/components/TableQrPrintButton.jsx
- frontend/src/components/ReceiptSettingsFields.jsx
- frontend/src/pages/TableSelfOrder.jsx
- frontend/src/styles/agriwarung-print-80mm.css
- backend/Dockerfile
- backend/requirements.txt
- docs/*

Catatan penting:
- Patch ini tidak mengganti server.py penuh karena server.py asli tetap dipakai dari backend kamu.
- Dockerfile sudah dikembalikan ke uvicorn server:app, bukan server_patched:app.
- Tidak ada server_patched.py di patch ini.

Commit summary GitHub:
Fix receipt print layout and table QR self order
