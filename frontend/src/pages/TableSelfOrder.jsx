import React, { useEffect, useMemo, useState } from 'react';
import { rupiah, resolveAssetUrl } from '../utils/receiptPrint80mm';

const API_BASE = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/$/, '');

function getTableIdFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[parts.length - 1];
}

export default function TableSelfOrder() {
  const tableId = getTableIdFromPath();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState(null);
  const [cart, setCart] = useState({});
  const [notes, setNotes] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/public/tables/${tableId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || 'Gagal membuka meja');
      setData(json);
    } catch (err) {
      alert(err?.message || 'Gagal membuka QR meja');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  const items = data?.menu_items || [];
  const cartRows = useMemo(() => {
    return Object.entries(cart)
      .map(([id, row]) => ({ ...row, item_id: id }))
      .filter((row) => row.quantity > 0);
  }, [cart]);
  const totalQty = cartRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);

  const add = (item, delta) => {
    setCart((prev) => {
      const current = prev[item.id] || { name: item.name, quantity: 0, notes: '' };
      const nextQty = Math.max(0, Number(current.quantity || 0) + delta);
      return { ...prev, [item.id]: { ...current, quantity: nextQty } };
    });
  };

  const submit = async () => {
    if (!cartRows.length) {
      alert('Pilih menu dulu');
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE}/api/public/tables/${tableId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes,
          items: cartRows.map((row) => ({ item_id: row.item_id, quantity: row.quantity, notes: row.notes || '' })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || 'Gagal mengirim pesanan');
      setCart({});
      setNotes('');
      alert('Pesanan tambahan sudah masuk ke kasir/warung');
      load();
    } catch (err) {
      alert(err?.message || 'Gagal mengirim pesanan');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div style={{ padding: 20 }}>Membuka menu meja...</div>;
  if (!data?.table) return <div style={{ padding: 20 }}>Meja tidak ditemukan.</div>;

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ position: 'sticky', top: 0, background: '#fff', paddingBottom: 12, borderBottom: '1px solid #eee', zIndex: 1 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>Meja {data.table.name}</h1>
        <div style={{ color: '#666', fontSize: 14 }}>Tambah pesanan, nanti lanjut bayar ke kasir.</div>
        {data.active_orders?.length > 0 && (
          <div style={{ marginTop: 8, padding: 10, background: '#fff7ed', borderRadius: 8, fontSize: 13 }}>
            Ada pesanan aktif di meja ini. Pesanan baru akan ditambahkan ke nota yang sama.
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {items.map((item) => {
          const qty = cart[item.id]?.quantity || 0;
          return (
            <div key={item.id} style={{ display: 'grid', gridTemplateColumns: item.image_url ? '72px 1fr auto' : '1fr auto', gap: 12, alignItems: 'center', border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
              {item.image_url && <img src={resolveAssetUrl(item.image_url)} alt="" style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover' }} />}
              <div>
                <div style={{ fontWeight: 700 }}>{item.name}</div>
                <div style={{ color: '#555' }}>{rupiah(item.sell_price)}</div>
                <div style={{ color: '#888', fontSize: 12 }}>Stok: {item.available_stock}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => add(item, -1)} style={{ width: 34, height: 34 }}>-</button>
                <strong style={{ minWidth: 22, textAlign: 'center' }}>{qty}</strong>
                <button onClick={() => add(item, 1)} style={{ width: 34, height: 34 }}>+</button>
              </div>
            </div>
          );
        })}
      </div>

      <label style={{ display: 'block', marginTop: 16 }}>
        Catatan tambahan
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }} placeholder="Contoh: gorengan dipisah, jangan pedas" />
      </label>

      <button onClick={submit} disabled={submitting || totalQty === 0} style={{ position: 'sticky', bottom: 12, width: '100%', padding: 14, borderRadius: 12, border: 0, background: totalQty ? '#16a34a' : '#aaa', color: '#fff', fontWeight: 800, marginTop: 16 }}>
        {submitting ? 'Mengirim...' : `Kirim Pesanan Tambahan (${totalQty})`}
      </button>
    </div>
  );
}
