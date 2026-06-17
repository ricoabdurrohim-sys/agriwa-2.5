# Cara pasang tombol QR Meja jika belum otomatis muncul

Patch ini menyediakan komponen siap pakai:

```jsx
import TableQrPrintButton from '../components/TableQrPrintButton';
```

Di card/list meja pada halaman Warung, tambahkan:

```jsx
<TableQrPrintButton table={table} businessName="AgriWarung" />
```

Untuk halaman customer setelah scan QR, tambahkan route ke `App.jsx` atau file router:

```jsx
import TableSelfOrder from './pages/TableSelfOrder';
```

Lalu tambahkan route:

```jsx
<Route path="/self-order/table/:tableId" element={<TableSelfOrder />} />
```

Jika project masih memakai React Router v5:

```jsx
<Route path="/self-order/table/:tableId" component={TableSelfOrder} />
```

Endpoint backend yang dipakai:

- `GET /api/tables/{table_id}/qr-meta`
- `GET /api/public/tables/{table_id}`
- `POST /api/public/tables/{table_id}/orders`
