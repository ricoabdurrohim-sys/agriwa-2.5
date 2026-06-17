# Cara pasang route Self Order Table

Tambahkan route ini di router React kamu jika belum ada:

```jsx
import TableSelfOrder from './pages/TableSelfOrder';

<Route path="/self-order/table/:tableId" element={<TableSelfOrder />} />
```

Kalau project masih memakai React Router v5:

```jsx
<Route path="/self-order/table/:tableId" component={TableSelfOrder} />
```

Komponen print QR meja memakai URL:

```txt
https://domain-vercel-kamu/self-order/table/{table_id}
```

Endpoint backend yang dipakai adalah endpoint yang sudah ada di `server.py` asli:

```txt
GET  /api/public/tables/{table_id}
GET  /api/public/menu
POST /api/public/orders
```
