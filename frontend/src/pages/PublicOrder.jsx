import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Search, Plus, Minus, Trash2, Send, UtensilsCrossed, Check, X } from "lucide-react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const formatRupiah = (n) => `Rp ${(n || 0).toLocaleString("id-ID")}`;

export default function PublicOrder() {
  const { tableId } = useParams();
  const [tableInfo, setTableInfo] = useState(null);
  const [menu, setMenu] = useState([]);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [t, m] = await Promise.all([
          axios.get(`${API}/public/tables/${tableId}`),
          axios.get(`${API}/public/menu`),
        ]);
        if (!mounted) return;
        setTableInfo(t.data);
        setMenu(m.data);
      } catch (e) {
        setError(e?.response?.data?.detail || "Tidak dapat memuat menu");
      }
    })();
    return () => { mounted = false; };
  }, [tableId]);

  const categories = useMemo(() => ["all", ...Array.from(new Set(menu.map((i) => i.category)))], [menu]);
  const filtered = menu.filter((i) =>
    (category === "all" || i.category === category) &&
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const addToCart = (item) => {
    setCart((c) => {
      const ex = c.find((x) => x.item_id === item.id);
      if (ex) return c.map((x) => x.item_id === item.id ? { ...x, quantity: x.quantity + 1 } : x);
      return [...c, { item_id: item.id, name: item.name, unit_price: item.sell_price, quantity: 1, notes: "" }];
    });
  };

  const updateQty = (id, delta) => {
    setCart((c) => c.map((x) => x.item_id === id ? { ...x, quantity: Math.max(0, x.quantity + delta) } : x).filter((x) => x.quantity > 0));
  };

  const total = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const submit = async () => {
    if (cart.length === 0) return toast.error("Tambahkan menu dulu");
    setSubmitting(true);
    try {
      const { data } = await axios.post(`${API}/public/orders`, {
        table_id: tableId,
        items: cart.map((c) => ({ item_id: c.item_id, name: c.name, quantity: c.quantity, unit_price: c.unit_price, notes: c.notes })),
        customer_name: name,
        customer_phone: phone,
        notes: notes,
      });
      setDone(data);
      setCart([]);
      setCartOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal mengirim pesanan");
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm text-center border border-red-100">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
            <X className="w-8 h-8 text-red-600" />
          </div>
          <div className="text-lg font-semibold text-gray-900 mb-1">Oops!</div>
          <div className="text-sm text-gray-600">{error}</div>
        </div>
      </div>
    );
  }

  if (!tableInfo) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Memuat menu...</div>;
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm text-center border border-emerald-100 fade-in">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-emerald-500 flex items-center justify-center">
            <Check className="w-10 h-10 text-white" strokeWidth={3} />
          </div>
          <div className="text-xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Poppins' }}>Pesanan Terkirim!</div>
          <div className="text-sm text-gray-600 mb-4">Pesanan Anda untuk <b>{done.table_name}</b> sudah diteruskan ke dapur. Mohon tunggu, tim kami sedang menyiapkan.</div>
          <div className="bg-emerald-50 rounded-lg p-3 mb-4">
            <div className="text-xs text-emerald-700 mb-1">Nomor Pesanan</div>
            <div className="font-mono text-sm font-semibold text-emerald-900 truncate">{done.order_id}</div>
          </div>
          <button data-testid="order-again-btn" onClick={() => setDone(null)} className="w-full py-3 rounded-xl bg-[#1a6b3c] text-white font-semibold hover:bg-[#14522d]">
            Pesan Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/40 to-white pb-32">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1a6b3c] rounded-xl flex items-center justify-center text-white">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-gray-900 truncate" style={{ fontFamily: 'Poppins' }}>{tableInfo.business_name}</div>
              <div className="text-xs text-gray-500">Self-Order · <span className="font-semibold text-[#1a6b3c]">{tableInfo.name}</span></div>
            </div>
          </div>
          <div className="relative mt-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input data-testid="public-search" placeholder="Cari menu..." value={search}
              onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10 bg-gray-50 border-gray-200" />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar mt-2 pb-1">
            {categories.map((c) => (
              <button key={c} data-testid={`public-cat-${c}`} onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  category === c ? "bg-[#1a6b3c] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}>
                {c === "all" ? "Semua" : c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Menu grid */}
      <div className="max-w-2xl mx-auto px-4 py-4 grid grid-cols-2 gap-3">
        {filtered.map((i) => {
          const inCart = cart.find((c) => c.item_id === i.id);
          return (
            <button key={i.id} data-testid={`public-menu-${i.id}`} onClick={() => addToCart(i)}
              className="bg-white rounded-2xl border border-gray-100 p-3 text-left hover:border-[#1a6b3c] hover:shadow-md transition-all relative active:scale-95">
              {i.image_url ? (
                <img src={i.image_url.startsWith("http") ? i.image_url : `${BACKEND_URL}${i.image_url}`} alt={i.name} className="w-full h-24 object-cover rounded-xl mb-2" />
              ) : (
                <div className="w-full h-24 bg-gradient-to-br from-emerald-50 to-amber-50 rounded-xl mb-2 flex items-center justify-center text-3xl">🍽️</div>
              )}
              <div className="text-sm font-semibold text-gray-900 mb-1 line-clamp-2">{i.name}</div>
              <div className="text-[10px] text-gray-500 mb-1.5 uppercase tracking-wide">{i.category}</div>
              <div className="flex items-center justify-between">
                <div className="font-mono text-sm font-bold text-[#1a6b3c]">{formatRupiah(i.sell_price)}</div>
                {inCart && (
                  <span className="bg-[#f4a228] text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">{inCart.quantity}</span>
                )}
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-16 text-gray-400 text-sm">Tidak ada menu yang cocok</div>
        )}
      </div>

      {/* Floating cart bar */}
      {cartCount > 0 && !cartOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-30 p-3 bg-gradient-to-t from-white via-white to-transparent">
          <button data-testid="open-cart-btn" onClick={() => setCartOpen(true)} className="w-full max-w-2xl mx-auto flex items-center justify-between bg-[#1a6b3c] hover:bg-[#14522d] text-white rounded-2xl px-5 py-3.5 shadow-lg">
            <span className="flex items-center gap-2 font-semibold">
              <UtensilsCrossed className="w-5 h-5" />
              {cartCount} item · Lihat Pesanan
            </span>
            <span className="font-mono font-bold">{formatRupiah(total)}</span>
          </button>
        </div>
      )}

      {/* Cart sheet */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-end" onClick={() => setCartOpen(false)}>
          <div className="bg-white w-full max-w-2xl mx-auto rounded-t-3xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="font-bold text-lg" style={{ fontFamily: 'Poppins' }}>Pesanan Anda</div>
              <button onClick={() => setCartOpen(false)} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-sm">Keranjang masih kosong</div>
              ) : cart.map((c) => (
                <div key={c.item_id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="font-mono text-xs text-gray-500">{formatRupiah(c.unit_price)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button data-testid={`public-minus-${c.item_id}`} onClick={() => updateQty(c.item_id, -1)} className="w-8 h-8 rounded-full border border-gray-200 hover:bg-gray-50"><Minus className="w-4 h-4 mx-auto" /></button>
                    <span className="w-8 text-center text-sm font-semibold">{c.quantity}</span>
                    <button data-testid={`public-plus-${c.item_id}`} onClick={() => updateQty(c.item_id, 1)} className="w-8 h-8 rounded-full border border-gray-200 hover:bg-gray-50"><Plus className="w-4 h-4 mx-auto" /></button>
                  </div>
                  <div className="font-mono text-sm font-semibold w-20 text-right">{formatRupiah(c.unit_price * c.quantity)}</div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-100 space-y-3 bg-gray-50">
              <div className="grid grid-cols-2 gap-2">
                <Input data-testid="public-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama (opsional)" className="h-11 bg-white" />
                <Input data-testid="public-phone-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="No. HP (opsional)" className="h-11 bg-white font-mono" />
              </div>
              <Input data-testid="public-notes-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Catatan (mis. tidak pedas)" className="h-11 bg-white" />
              <div className="flex justify-between text-sm pt-1">
                <span className="text-gray-600">Total</span>
                <span className="font-mono font-bold text-lg text-[#1a6b3c]" data-testid="public-cart-total">{formatRupiah(total)}</span>
              </div>
              <Button data-testid="public-submit-btn" onClick={submit} disabled={submitting || cart.length === 0}
                className="w-full h-12 bg-[#f4a228] hover:bg-[#d98b1a] text-white font-semibold text-base">
                <Send className="w-4 h-4 mr-1.5" />
                {submitting ? "Mengirim..." : "Kirim Pesanan ke Dapur"}
              </Button>
              <div className="text-[11px] text-center text-gray-500">Pembayaran dilakukan di kasir setelah selesai makan</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
