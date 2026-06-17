# File mana untuk mana

## Untuk GitHub / Vercel
Pakai ZIP:
`GITHUB_agriwarung_v2_5_20_print_qr_sync_patch.zip`

Copy ke repo GitHub AgriWarung.

## Untuk Hugging Face backend
Pakai ZIP:
`HF_BACKEND_agriwarung_v2_5_20_restore_server_app.zip`

Upload isi ZIP HF ke root HF Space.

## Catatan
Jangan pakai lagi `server_patched.py`.
Backend harus jalan dari:

```txt
uvicorn server:app --host 0.0.0.0 --port 7860
```
