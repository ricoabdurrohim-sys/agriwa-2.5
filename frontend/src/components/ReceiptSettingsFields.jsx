import React, { useState } from 'react';
import { API_URL } from '@/lib/api';

const API_BASE = API_URL.replace(/\/api$/, '');

function tokenHeaders() {
  const token = localStorage.getItem('aw_token') || localStorage.getItem('token') || localStorage.getItem('access_token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ReceiptSettingsFields({ form, setForm }) {
  const [uploading, setUploading] = useState('');
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const uploadImage = async (file, key) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      setUploading(key);
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        headers: tokenHeaders(),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.message || 'Upload gagal');
      update(key, data.url || data.file_url || data.path);
    } catch (err) {
      console.error(err);
      alert(err?.message || 'Upload gambar gagal');
    } finally {
      setUploading('');
    }
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium">Nama usaha di struk</span>
        <textarea
          className="w-full border rounded p-2 min-h-[52px]"
          rows={2}
          value={form.receipt_name || form.name || ''}
          onChange={(e) => update('receipt_name', e.target.value)}
          placeholder={'Contoh:\nWarung Makan Pak Riko'}
        />
        <small>Enter bisa dipakai untuk menurunkan teks ke baris berikutnya.</small>
      </label>

      <label className="block">
        <span className="text-sm font-medium">Alamat / header struk</span>
        <textarea
          className="w-full border rounded p-2 min-h-[72px]"
          rows={3}
          value={form.receipt_address || form.address || ''}
          onChange={(e) => update('receipt_address', e.target.value)}
          placeholder={'Contoh:\nJl. Raya Sumberejo\nBuka 08.00 - 21.00'}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Catatan/footer struk</span>
        <textarea
          className="w-full border rounded p-2 min-h-[88px]"
          rows={4}
          value={form.receipt_footer || ''}
          onChange={(e) => update('receipt_footer', e.target.value)}
          placeholder={'Contoh:\nTerima kasih\nBarang yang sudah dibeli tidak dapat dikembalikan'}
        />
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium">Logo/gambar atas struk</span>
          <input type="file" accept="image/*" onChange={(e) => uploadImage(e.target.files?.[0], 'receipt_logo_url')} />
          {uploading === 'receipt_logo_url' && <small>Mengupload...</small>}
          {form.receipt_logo_url && <small className="block break-all">{form.receipt_logo_url}</small>}
        </label>

        <label className="block">
          <span className="text-sm font-medium">Gambar footer struk</span>
          <input type="file" accept="image/*" onChange={(e) => uploadImage(e.target.files?.[0], 'receipt_footer_image_url')} />
          {uploading === 'receipt_footer_image_url' && <small>Mengupload...</small>}
          {form.receipt_footer_image_url && <small className="block break-all">{form.receipt_footer_image_url}</small>}
        </label>
      </div>
    </div>
  );
}
