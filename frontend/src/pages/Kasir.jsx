import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Plus, Minus, Trash2, Receipt as ReceiptIcon, CreditCard, Banknote, QrCode, Smartphone, MessageCircle, Printer, Bluetooth, Crown, X, ScanLine } from "lucide-react";
import api, { formatRupiah } from "@/lib/api";
import { printReceipt, isPrinterAvailable } from "@/lib/printer";
import { printViaIframe, thermal80Css } from "@/lib/safePrint";
import { resolveImageUrl } from "@/components/ImageUpload";
import QRCodeBox from "@/components/QRCodeBox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

const PAYMENT_METHODS = [
  { key: "cash", label: "Tunai", icon: Banknote },
  { key: "qris", label: "QRIS", icon: QrCode },
  { key: "transfer", label: "Transfer", icon: CreditCard },
  { key: "ewallet", label: "E-Wallet", icon: Smartphone },
];

export default function Kasir() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const tableId = params.get("table");
  const orderId = params.get("order");
  const bonId = params.get("bon");
  const lookupParam = params.get("lookup") || params.get("trx") || "";
  const [items, setItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [payment, setPayment] = useState("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [isBon, setIsBon] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discount, setDiscount] = useState(0);
  const [showReceipt, setShowReceipt] = useState(null);
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [member, setMember] = useState(null);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [redeemDiscount, setRedeemDiscount] = useState(0);
  const [recentTrx, setRecentTrx] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [editTrx, setEditTrx] = useState(null);
  const [settings, setSettings] = useState({ business_name: "", address: "", phone: "", receipt_footer: "", tax_rate: 11, tax_receipt_enabled: true, tax_inclusive: true });
  const [transactionType, setTransactionType] = useState("SALE");
  const [redirectAfterReceipt, setRedirectAfterReceipt] = useState(false);
  const [bonInfo, setBonInfo] = useState(null); // {id, customer_name, amount, paid, customer_phone}
  const [bizUnits, setBizUnits] = useState([]);
  const [unit, setUnit] = useState("warung");
  const [debts, setDebts] = useState([]);
  const [trxMatches, setTrxMatches] = useState([]);
  const [debtSearch, setDebtSearch] = useState("");
  const [showDebtFinder, setShowDebtFinder] = useState(false);
  const [variantPicker, setVariantPicker] = useState(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [posCategoryName, setPosCategoryName] = useState("");
  const [posCategoryItems, setPosCategoryItems] = useState([]);
  const [showProductScan, setShowProductScan] = useState(false);
  const [productScan, setProductScan] = useState("");

  const getBonRemaining = (d) => {
    if (!d) return 0;
    const explicit = d.remaining ?? d.debt_amount ?? d.open_receivable;
    if (explicit !== undefined && explicit !== null && explicit !== "") return Math.max(0, Number(explicit) || 0);
    const amount = Number(d.amount || 0);
    const paid = Number(d.paid || 0);
    // Schema baru: amount = sisa bon awal, paid = cicilan atas bon.
    // Schema lama: amount = total belanja, paid = DP. Fallback tetap aman.
    return Math.max(0, amount - paid);
  };

  const compactPrice = (v) => {
    const n = Number(v || 0);
    if (!n) return "0";
    return Number(n).toLocaleString("id-ID");
  };

  const itemPriceLabel = (item) => {
    const variants = (item?.variants || []).filter((v) => v && v.active !== false && v.name);
    if (item?.has_variants && variants.length) {
      const prices = [...new Set(variants.map((v) => Number(v.sell_price || item.sell_price || 0)).filter((n) => n > 0))].sort((a,b)=>a-b);
      if (prices.length) return `Rp ${prices.map(compactPrice).join("/")}`;
    }
    return formatRupiah(item?.sell_price || 0);
  };

  const itemScanCode = (item) => String(item?.barcode || item?.sku || item?.code || item?.id || item?.name || "").trim();

  const lookupMember = async () => {
    if (!memberQuery.trim()) return;
    try {
      const { data } = await api.get(`/members/${encodeURIComponent(memberQuery.trim())}`);
      setMember(data);
      setMemberQuery("");
      toast.success(`Member ${data.name} (${data.tier}) — ${data.points} poin`);
    } catch {
      toast.error("Member tidak ditemukan");
    }
  };

  const applyRedeem = async () => {
    if (!member || !pointsToRedeem) return;
    if (pointsToRedeem > member.points) return toast.error("Poin tidak cukup");
    try {
      const { data } = await api.post("/members/redeem", { member_id: member.id, points: pointsToRedeem });
      setRedeemDiscount(data.discount);
      toast.success(`${pointsToRedeem} poin ditukar dengan diskon ${formatRupiah(data.discount)}`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal redeem"); }
  };

  const clearMember = () => { setMember(null); setPointsToRedeem(0); setRedeemDiscount(0); };

  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    if (cart.length === 0) return toast.error("Tambahkan item dulu");
    try {
      const cartPayload = cart.map((c) => {
        const inv = items.find(x => x.id === c.item_id);
        return { item_id: c.item_id, quantity: c.quantity, unit_price: c.unit_price, category: inv?.category || "" };
      });
      const { data } = await api.post("/promos/apply", { code: promoCode, items: cartPayload });
      setDiscount(data.discount);
      setAppliedPromo(data);
      toast.success(`Promo ${data.promo_name} diterapkan: -${formatRupiah(data.discount)}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Kode tidak valid");
    }
  };

  const clearPromo = () => { setAppliedPromo(null); setPromoCode(""); setDiscount(0); };

  const load = async () => {
    const { data } = await api.get("/inventory?include_batches=false&limit=2000");
    setItems(data.filter((i) => !String(i.category || '').toLowerCase().includes('bahan baku')));
  };
  const loadBizUnits = async () => {
    try {
      const { data } = await api.get("/business-units");
      setBizUnits(data.filter((u) => u.active !== false));
    } catch (err) { /* ignore */ }
  };
  const loadRecent = async () => {
    try {
      const { data } = await api.get("/transactions");
      setRecentTrx(data.slice(0, 30));
    } catch (err) { /* ignore */ }
  };
  const loadDebts = async (q = debtSearch) => {
    try {
      const query = encodeURIComponent(q || "");
      const [debtRes, trxRes] = await Promise.all([
        api.get(`/customer-debts/search?q=${query}`),
        api.get(`/transactions/search?q=${query}&limit=30`),
      ]);
      setDebts(debtRes.data || []);
      setTrxMatches(trxRes.data || []);
    } catch (err) {
      if (showDebtFinder || String(q || "").trim()) toast.error("Gagal memuat transaksi/bon");
      setDebts([]); setTrxMatches([]);
    }
  };
  const openDebtFinder = () => { setShowDebtFinder((v) => !v); loadDebts(); };
  const openTransactionResult = async (trx) => {
    try {
      if ((Number(trx.debt_amount) || 0) > 0 || String(trx.payment_status || '').toUpperCase().includes('PARTIAL')) {
        const { data } = await api.get(`/customer-debts/search?q=${encodeURIComponent(trx.trx_no || trx.id || '')}`);
        if (data?.length) return startDebtSettlement(data[0]);
      }
      const { data } = await api.get(`/transactions/${trx.id}`);
      setShowReceipt(data);
      setShowDebtFinder(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal membuka transaksi");
    }
  };
  const startDebtSettlement = async (d) => {
    try {
      const { data } = await api.get(`/customer-debts/${d.id}`);
      const full = { ...d, ...data };
      setBonInfo(full);
      setCustomerName(full.customer_name || "");
      setCustomerPhone(full.customer_phone || "");
      setPayment("cash"); setTransactionType("SALE"); setIsBon(false);
      const due = getBonRemaining(full);
      setCashReceived(due > 0 ? String(due) : "0");
      if (full.original_items?.length) setCart(full.original_items.map((it) => ({ item_id: it.item_id, name: it.name, unit_price: it.unit_price, quantity: it.quantity, notes: it.notes || "" })));
      window.history.replaceState({}, "", `/kasir?bon=${full.id}`);
      setShowDebtFinder(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal membuka bon");
    }
  };
  useEffect(() => { load(); loadBizUnits(); loadRecent(); api.get("/settings").then(({ data }) => setSettings((p) => ({ ...p, ...data }))).catch(() => {}); }, []);

  useEffect(() => {
    const h = (e) => { const t = e.detail?.type; if (t === "transaction_created" || t === "transaction_cancelled" || t === "transaction_updated") loadRecent(); if (t === "bizunit_updated") loadBizUnits(); };
    window.addEventListener("aw:ws", h);
    return () => window.removeEventListener("aw:ws", h);
  }, []);

  // Pre-fill cart from existing order when coming from Warung.
  // Ambil 1 order saja agar buka Kasir dari meja/takeaway lebih cepat.
  useEffect(() => {
    if (orderId) {
      api.get(`/orders/${orderId}`).then(({ data: o }) => {
        if (o && o.items) {
          setCart(o.items.map((it, idx) => ({
            line_id: it.line_id || `${it.item_id || idx}::${it.variant_id || "base"}`,
            item_id: it.item_id, name: it.name, unit_price: it.unit_price, quantity: it.quantity, notes: it.notes || "",
            variant_id: it.variant_id || "", variant_name: it.variant_name || "",
          })));
          if (o.queue_no) setCustomerName(`Takeaway ${o.queue_no}`);
        }
      }).catch(() => {});
    }
  }, [orderId]);

  // Pre-fill from bon (Bayar from Keuangan)
  useEffect(() => {
    if (bonId) {
      api.get(`/customer-debts/${bonId}`).then(({ data }) => {
        setBonInfo(data);
        setCustomerName(data.customer_name || "");
        setCustomerPhone(data.customer_phone || "");
        if (data.original_items?.length) {
          setCart(data.original_items.map((it, idx) => ({
            line_id: it.line_id || `${it.item_id || idx}::${it.variant_id || "base"}`,
            item_id: it.item_id, name: it.name, unit_price: it.unit_price, quantity: it.quantity, notes: it.notes || "",
            variant_id: it.variant_id || "", variant_name: it.variant_name || "",
          })));
        }
        setIsBon(false);
        const remaining = getBonRemaining(data);
        setPayment("cash");
        setTransactionType("SALE");
        setDiscount(0);
        setCashReceived(remaining > 0 ? String(remaining) : "0");
      }).catch((e) => {
        toast.error(e?.response?.data?.detail || "Bon tidak ditemukan");
      });
    }
  }, [bonId]);

  useEffect(() => {
    if (lookupParam) {
      setShowHistory(true);
      setHistorySearch(lookupParam);
      loadRecent();
    }
  }, [lookupParam]);

  const cancelTransaction = async (trx) => {
    if (!window.confirm(`Batalkan transaksi ${trx.trx_no} (${formatRupiah(trx.total)})?\nStok akan dikembalikan.`)) return;
    try {
      await api.delete(`/transactions/${trx.id}`);
      toast.success("Transaksi dibatalkan, stok dikembalikan dan laporan disesuaikan");
      loadRecent(); load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal membatalkan");
    }
  };

  const saveEditTrx = async () => {
    if (!editTrx) return;
    try {
      await api.put(`/transactions/${editTrx.id}`, {
        customer_name: editTrx.customer_name || "",
        customer_phone: editTrx.customer_phone || "",
        notes: editTrx.notes || "",
      });
      toast.success("Transaksi diperbarui");
      setEditTrx(null); loadRecent();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal");
    }
  };

  const unitFilteredItems = items.filter((i) => (i.business_unit || "warung") === unit);

  const categories = useMemo(() => {
    const set = new Set(unitFilteredItems.map((i) => i.category).filter(Boolean));
    return ["all", ...Array.from(set).sort((a, b) => String(a).localeCompare(String(b), "id", { sensitivity: "base" }))];
  }, [unitFilteredItems]);

  const openCategoryManager = () => {
    setPosCategoryName(category === "all" ? "" : category);
    setPosCategoryItems([]);
    setShowCategoryManager(true);
  };

  const savePosCategory = async () => {
    const name = posCategoryName.trim();
    if (!name) return toast.error("Nama kategori wajib diisi");
    if (posCategoryItems.length === 0) return toast.error("Pilih minimal 1 barang untuk kategori ini");
    try {
      await Promise.all(posCategoryItems.map((id) => api.put(`/inventory/${id}`, { category: name })));
      toast.success("Kategori POS disimpan dan kategori Inventori ikut berubah");
      setShowCategoryManager(false);
      setCategory(name);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal menyimpan kategori");
    }
  };

  const filtered = unitFilteredItems.filter((i) =>
    (category === "all" || i.category === category) &&
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  // Reset category when unit changes (avoid stale category)
  useEffect(() => { setCategory("all"); setCart([]); }, [unit]);

  const currentUnitInfo = useMemo(() => bizUnits.find((u) => u.code === unit) || { code: unit, name: unit, receipt_name: "" }, [bizUnits, unit]);

  useEffect(() => {
    if (bonInfo && payment === "cash") {
      const due = getBonRemaining(bonInfo);
      if (due > 0 && (!cashReceived || Number(cashReceived) <= 0 || Number(cashReceived) !== due)) {
        setCashReceived(String(due));
      }
    }
  }, [bonInfo?.id, bonInfo?.remaining, bonInfo?.paid, payment]);

  const getReceiptConfig = (trx) => {
    const snap = trx?.receipt_snapshot || {};
    const trxUnit = bizUnits.find((u) => u.code === trx?.unit) || currentUnitInfo;
    return {
      business_name: snap.business_name || snap.name || (trxUnit.receipt_name && trxUnit.receipt_name.trim()) || trxUnit.name || "AGRIWARUNG",
      address: snap.address || trxUnit.receipt_address || "",
      phone: snap.phone || trxUnit.receipt_phone || "",
      footer: snap.footer || trxUnit.receipt_footer || "Terima kasih! 🙏",
      note: snap.note || trxUnit.receipt_note || "",
      logo_url: snap.logo_url || snap.receipt_logo || trxUnit.receipt_logo || trxUnit.receipt_logo_url || "",
    };
  };

  const buildReceiptText = (trx) => {
    const cfg = getReceiptConfig(trx);
    const trxType = (trx.transaction_type || "SALE").toUpperCase();
    const isDebtSettlement = trx.receipt_kind === "DEBT_SETTLEMENT";
    const lines = [
      `*${String(cfg.business_name).toUpperCase()}*`,
      cfg.address,
      cfg.phone ? `Telp: ${cfg.phone}` : "",
      "------------------------------",
      `No: ${trx.trx_no}`,
      trx.queue_no ? `Antrian: ${trx.queue_no}` : "",
      isDebtSettlement && trx.original_trx_no ? `Pelunasan: ${trx.original_trx_no}` : "",
      new Date(trx.created_at).toLocaleString("id-ID"),
      trx.cashier_name ? `Kasir: ${trx.cashier_name}` : "",
      trx.customer_name ? `Pelanggan: ${trx.customer_name}` : "",
      isDebtSettlement ? "Jenis: PELUNASAN BON" : (trxType !== "SALE" ? `Jenis: ${trxType === "SELF_USE" ? "PEMAKAIAN SENDIRI" : trxType}` : ""),
      "------------------------------",
      ...(trx.items || []).flatMap((i) => [i.name, `${i.quantity} x ${formatRupiah(i.unit_price)} = ${formatRupiah(i.unit_price * i.quantity)}`]),
      "------------------------------",
      trx.subtotal ? `${isDebtSettlement ? "Total Belanja" : "Subtotal"}: ${formatRupiah(trx.subtotal)}` : "",
      trx.discount && !isDebtSettlement ? `Diskon: -${formatRupiah(trx.discount)}` : "",
      isDebtSettlement ? `Sudah Dibayar: ${formatRupiah(trx.previous_paid || 0)}` : "",
      !isDebtSettlement && trxType === "SALE" && trx.tax_receipt_enabled && Number(trx.tax_amount || 0) > 0 ? `DPP: ${formatRupiah(trx.taxable_amount || 0)}` : "",
      !isDebtSettlement && trxType === "SALE" && trx.tax_receipt_enabled && Number(trx.tax_amount || 0) > 0 ? `PPN ${Number(trx.tax_rate || 0)}% ${trx.tax_inclusive ? "(termasuk)" : ""}: ${formatRupiah(trx.tax_amount || 0)}` : "",
      isDebtSettlement ? `Bayar Bon: ${formatRupiah(trx.payment_amount || 0)}` : (trxType === "SALE" ? `Total: ${formatRupiah(trx.total)}` : `Nilai HPP: ${formatRupiah(trx.cost_total || 0)}`),
      trxType === "SALE" ? `Metode: ${String(trx.payment_method || "-").toUpperCase()}` : "Pendapatan: Rp 0",
      trx.payment_method === "cash" ? `Uang Diterima: ${formatRupiah(trx.cash_received)}` : "",
      trx.payment_method === "cash" ? `Kembali: ${formatRupiah(trx.change)}` : "",
      trx.debt_amount > 0 ? `Hutang: ${formatRupiah(trx.debt_amount)}` : "",
      cfg.note ? "------------------------------" : "",
      cfg.note,
      "------------------------------",
      cfg.footer,
    ];
    return lines.filter(Boolean).join("\n");
  };

  const closeReceipt = () => {
    setShowReceipt(null);
    if (redirectAfterReceipt) {
      setRedirectAfterReceipt(false);
      nav("/warung");
    }
  };

  const addVariantToCart = (item, variant = null) => {
    const vid = variant?.id || "base";
    const lineId = `${item.id}::${vid}`;
    const price = Number(variant?.sell_price || item.sell_price || 0);
    const displayName = variant ? `${item.name} (${variant.name})` : item.name;
    setCart((c) => {
      const ex = c.find((x) => x.line_id === lineId);
      if (ex) return c.map((x) => x.line_id === lineId ? { ...x, quantity: x.quantity + 1 } : x);
      return [...c, { line_id: lineId, item_id: item.id, name: displayName, unit_price: price, quantity: 1, notes: "", variant_id: variant?.id || "", variant_name: variant?.name || "" }];
    });
    setVariantPicker(null);
  };

  const addToCart = (item) => {
    const variants = (item.variants || []).filter((v) => v && v.active !== false && v.name);
    if (item.has_variants && variants.length > 0) {
      setVariantPicker({ ...item, variants });
      return;
    }
    addVariantToCart(item, null);
  };

  const handleProductScan = () => {
    const q = String(productScan || "").trim();
    if (!q) return;
    const clean = q.replace(/^aw:(item|product):/i, "").trim().toLowerCase();
    const found = unitFilteredItems.find((i) => {
      const codes = [i.barcode, i.sku, i.code, i.id, i.name].filter(Boolean).map((x) => String(x).trim().toLowerCase());
      return codes.includes(clean) || String(i.name || "").toLowerCase().includes(clean);
    });
    if (!found) return toast.error("Produk tidak ditemukan. Cek barcode/SKU/nama barang di Inventori.");
    addToCart(found);
    setProductScan("");
    setShowProductScan(false);
    toast.success(`${found.name} ditambahkan ke keranjang`);
  };

  const updateQty = (lineId, delta) => {
    setCart((c) => c.map((x) => x.line_id === lineId ? { ...x, quantity: Math.max(0, x.quantity + delta) } : x).filter((x) => x.quantity > 0));
  };

  const removeItem = (lineId) => setCart((c) => c.filter((x) => x.line_id !== lineId));

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const total = Math.max(0, subtotal - discount - redeemDiscount);
  const taxRate = Number(settings.tax_rate || 0);
  const showTaxBreakdown = !!settings.tax_receipt_enabled && taxRate > 0 && transactionType === "SALE";
  const taxAmount = showTaxBreakdown ? Math.round(total * taxRate / (100 + taxRate)) : 0;
  const taxableAmount = showTaxBreakdown ? Math.max(0, total - taxAmount) : total;
  const bonRemaining = bonInfo ? getBonRemaining(bonInfo) : 0;
  const paymentDue = bonInfo ? bonRemaining : total;
  const cashReceivedNum = parseInt(cashReceived) || 0;
  const change = payment === "cash" ? (cashReceivedNum - paymentDue) : 0;
  const isBonUnderpaid = !!bonInfo && payment === "cash" && cashReceivedNum > 0 && cashReceivedNum < paymentDue;
  const isUnderpaid = !bonInfo && change < 0;

  const checkout = async () => {
    if (cart.length === 0) return toast.error("Keranjang kosong");
    if (transactionType === "SALE" && isBon && !customerName) return toast.error("Isi nama pelanggan untuk bon");
    if (transactionType !== "SALE" && !window.confirm("Transaksi ini bukan penjualan. Stok akan berkurang dan HPP dicatat sebagai biaya tanpa pendapatan. Lanjutkan?")) return;
    try {
      let data;
      if (bonInfo) {
        // Settle bon: bayar hanya sisa bon, tidak membuat penjualan baru dan tidak mengurangi stok lagi.
        const remaining = paymentDue;
        const receivedForDebt = payment === "cash" ? (cashReceivedNum || remaining) : remaining;
        if (payment === "cash" && Number(receivedForDebt) < Number(remaining)) {
          setCashReceived(String(remaining));
          return toast.error(`Nominal pelunasan bon harus minimal ${formatRupiah(remaining)}. Kolom sudah diisi otomatis.`);
        }
        const resp = await api.post(`/customer-debts/${bonInfo.id}/settle-via-kasir`, {
          payment_method: payment,
          cash_received: receivedForDebt,
        });
        data = resp.data;
        toast.success("Bon berhasil dilunasi — revenue dan piutang diperbarui");
      } else {
        const resp = await api.post("/transactions", {
          items: cart, discount: discount + redeemDiscount, payment_method: payment,
          cash_received: transactionType === "SALE" ? cashReceivedNum : 0, customer_name: customerName, customer_phone: customerPhone,
          is_bon: transactionType === "SALE" ? isBon : false, transaction_type: transactionType, unit: unit, table_id: tableId, order_id: orderId,
          member_id: member?.id || null, points_redeemed: pointsToRedeem || 0,
        });
        data = resp.data;
        toast.success("Transaksi berhasil!");
      }
      setShowReceipt({ ...data, customer_phone: customerPhone });
      if ((orderId || tableId) && !bonInfo) setRedirectAfterReceipt(true);
      setCart([]); setCashReceived(""); setDiscount(0); setIsBon(false); setTransactionType("SALE"); setCustomerName(""); setCustomerPhone("");
      setBonInfo(null);
      clearPromo(); clearMember();
      // Kasir harus cepat: jangan reload semua inventory setelah checkout.
      // Stok akan tersinkron saat halaman dimuat ulang / websocket / refresh manual.
      setRecentTrx((prev) => [data, ...prev.filter((x) => x.id !== data.id)].slice(0, 30));
      // Clear bon URL param after settlement so reload doesn't re-trigger
      if (bonInfo) {
        window.history.replaceState({}, "", "/kasir");
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal memproses transaksi");
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4 fade-in">
      {/* Menu */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Kasir POS</h1>
            <p className="text-sm text-gray-500 mt-0.5">{tableId ? "Pesanan untuk meja terpilih" : bonInfo ? `Pelunasan bon — ${bonInfo.customer_name}` : `Penjualan ${currentUnitInfo.name}`}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button data-testid="open-product-scan-btn" onClick={() => setShowProductScan(true)} variant="outline" className="border-emerald-300 text-emerald-800 hover:bg-emerald-50">
              <ScanLine className="w-4 h-4 mr-1.5" /> Scan Produk
            </Button>
            <Button data-testid="open-debt-finder-btn" onClick={openDebtFinder} variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50">
              <Search className="w-4 h-4 mr-1.5" /> Cari Transaksi
            </Button>
            <Button data-testid="open-history-btn" onClick={() => { setShowHistory(true); loadRecent(); }} variant="outline" className="border-gray-300">
              <ReceiptIcon className="w-4 h-4 mr-1.5" /> Riwayat / Batal
            </Button>
          </div>
        </div>

        {showProductScan && !bonInfo && (
          <div className="bg-white rounded-xl border border-emerald-200 p-3 space-y-2 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-emerald-900">Scan Produk untuk Kasir</div>
                <div className="text-xs text-emerald-700">Colok scanner USB/Bluetooth seperti keyboard, klik kolom ini, lalu scan barcode. Bisa juga ketik nama/barcode manual.</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowProductScan(false)}>Tutup</Button>
            </div>
            <div className="flex gap-2">
              <Input autoFocus value={productScan} onChange={(e) => setProductScan(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleProductScan()} placeholder="Scan barcode / ketik nama produk" className="h-11 font-mono" />
              <Button onClick={handleProductScan} className="bg-[#1a6b3c] hover:bg-[#14522d]">Tambah</Button>
            </div>
          </div>
        )}

        {showDebtFinder && !bonInfo && (
          <div className="bg-white rounded-xl border border-amber-200 p-3 space-y-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-amber-900">Cari Transaksi / Bon</div>
                <div className="text-xs text-amber-700">Cari nomor nota, nama pelanggan, atau nomor HP. Bon bisa langsung dilunasi dari Kasir.</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowDebtFinder(false)}>Tutup</Button>
            </div>
            <div className="flex gap-2">
              <Input value={debtSearch} onChange={(e) => setDebtSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadDebts()} placeholder="Nomor nota / nama pelanggan / no HP" className="h-10" />
              <Button onClick={() => loadDebts()} className="bg-amber-600 hover:bg-amber-700">Cari</Button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-amber-100 border border-amber-100 rounded-lg">
              {debts.length === 0 && trxMatches.length === 0 ? <div className="p-4 text-center text-xs text-gray-400">Tidak ada transaksi/bon cocok</div> : null}
              {debts.map((d) => (
                <button key={`debt-${d.id}`} onClick={() => startDebtSettlement(d)} className="w-full text-left p-3 hover:bg-amber-50 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{d.customer_name || 'Pelanggan'}</div>
                    <div className="text-xs text-gray-500 truncate">BON · {d.customer_phone || 'Tanpa HP'} · {d.original_trx_no || d.transaction_id || ''}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-amber-700">{formatRupiah(getBonRemaining(d))}</div>
                    <div className="text-[10px] text-gray-500">Klik bayar</div>
                  </div>
                </button>
              ))}
              {trxMatches.map((t) => (
                <button key={`trx-${t.id}`} onClick={() => openTransactionResult(t)} className="w-full text-left p-3 hover:bg-emerald-50 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{t.trx_no} · {t.customer_name || 'Pelanggan umum'}</div>
                    <div className="text-xs text-gray-500 truncate">{t.customer_phone || 'Tanpa HP'} · {new Date(t.created_at).toLocaleString('id-ID')}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-emerald-700">{formatRupiah(t.total || 0)}</div>
                    <div className="text-[10px] text-gray-500">{Number(t.debt_amount || 0) > 0 ? 'Bon aktif' : 'Lihat struk'}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Business Unit Selector */}
        {!bonInfo && (
          <div className="bg-white rounded-xl border border-gray-100 p-2.5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Pilih Unit Bisnis</span>
              <a href="/units" className="text-[11px] text-[#1a6b3c] font-semibold hover:underline">+ Kelola Unit</a>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
              {bizUnits.map((u) => {
                const active = u.code === unit;
                const count = items.filter((i) => (i.business_unit || "warung") === u.code).length;
                return (
                  <button key={u.id} data-testid={`unit-btn-${u.code}`} onClick={() => setUnit(u.code)}
                    className={`shrink-0 px-3.5 py-2 rounded-lg text-xs font-semibold border-2 transition-all flex items-center gap-2 ${
                      active ? "text-white shadow-md" : "bg-white hover:bg-gray-50 text-gray-700"
                    }`}
                    style={active ? { background: u.color, borderColor: u.color } : { borderColor: u.color + "55" }}>
                    <span>{u.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${active ? "bg-white/25" : "bg-gray-100 text-gray-600"}`}>{count}</span>
                  </button>
                );
              })}
              {bizUnits.length === 0 && <span className="text-xs text-gray-400 px-2 py-1">Memuat unit...</span>}
            </div>
            {currentUnitInfo.receipt_name && (
              <div className="text-[11px] text-gray-500 mt-2 px-1">
                <span className="font-medium">Nama struk:</span> <span className="text-gray-700">{currentUnitInfo.receipt_name}</span>
              </div>
            )}
          </div>
        )}

        {bonInfo && (
          <div data-testid="bon-mode-banner" className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-white shrink-0">
              <ReceiptIcon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-amber-900">Mode Pelunasan Bon</div>
              <div className="text-xs text-amber-800">
                {bonInfo.customer_name} · Sisa tagihan <b className="font-mono">{formatRupiah(bonRemaining)}</b>
              </div>
            </div>
            <button data-testid="cancel-bon-mode-btn" onClick={() => { setBonInfo(null); setCart([]); setCustomerName(""); setCustomerPhone(""); window.history.replaceState({}, "", "/kasir"); }}
              className="text-xs text-amber-700 hover:text-amber-900 font-semibold px-3 py-1.5 hover:bg-amber-100 rounded-lg">
              Batal Mode Bon
            </button>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input data-testid="kasir-search" placeholder="Cari menu..." value={search}
              onChange={(e) => setSearch(e.target.value)} className="pl-9 h-11 bg-gray-50 border-gray-200" />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {categories.map((c) => (
              <button key={c} onClick={() => setCategory(c)}
                data-testid={`category-${c}`}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  category === c ? "bg-[#1a6b3c] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}>
                {c === "all" ? "Semua" : c}
              </button>
            ))}
            <button onClick={openCategoryManager} data-testid="manage-pos-category-btn" className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100">+ Kategori</button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map((i) => (
            <button key={i.id} data-testid={`menu-item-${i.id}`} onClick={() => addToCart(i)}
              className="bg-white rounded-xl border border-gray-100 p-3 text-left hover:border-[#1a6b3c] hover:shadow-md transition-all">
              {i.image_url ? (
                <img src={resolveImageUrl(i.image_url)} alt={i.name} className="w-full h-20 object-cover rounded-lg mb-2" />
              ) : (
                <div className="w-full h-20 bg-gradient-to-br from-emerald-50 to-amber-50 rounded-lg mb-2 flex items-center justify-center text-2xl">🍽️</div>
              )}
              <div className="text-sm font-semibold text-gray-900 mb-1 line-clamp-2">{i.name}</div>
              <div className="text-xs text-gray-500 mb-2">{i.category}{i.has_variants ? " · ada varian" : ""}</div>
              <div className="font-mono text-base font-bold text-[#1a6b3c]">{itemPriceLabel(i)}</div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-400 text-sm">Tidak ada menu</div>
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="lg:sticky lg:top-20 lg:self-start bg-white rounded-xl border border-gray-100 shadow-sm" data-testid="cart-panel">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2" style={{ fontFamily: 'Poppins' }}>
            <ReceiptIcon className="w-5 h-5 text-[#1a6b3c]" /> Keranjang ({cart.length})
          </h2>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="px-4 py-10 text-center text-gray-400 text-sm">Keranjang kosong</div>
          ) : (
            cart.map((c) => (
              <div key={c.line_id || c.item_id} className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold truncate">{c.name}</div>
                  <div className="font-mono text-sm text-gray-500">{formatRupiah(c.unit_price)}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button data-testid={`qty-minus-${c.line_id || c.item_id}`} onClick={() => updateQty(c.line_id || c.item_id, -1)} className="w-9 h-9 rounded-lg border border-gray-200 hover:bg-gray-50"><Minus className="w-4 h-4 mx-auto" /></button>
                  <span className="w-8 text-center text-base font-bold">{c.quantity}</span>
                  <button data-testid={`qty-plus-${c.line_id || c.item_id}`} onClick={() => updateQty(c.line_id || c.item_id, 1)} className="w-9 h-9 rounded-lg border border-gray-200 hover:bg-gray-50"><Plus className="w-4 h-4 mx-auto" /></button>
                </div>
                <button title="Hapus item" onClick={() => removeItem(c.line_id || c.item_id)} className="ml-2 w-10 h-10 rounded-lg border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4.5 h-4.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Subtotal</span>
            <span className="font-mono font-medium">{formatRupiah(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-gray-600">Diskon</span>
            <Input data-testid="discount-input" type="text" inputMode="numeric" pattern="[0-9]*" value={discount || ""} onChange={(e) => setDiscount(parseInt(e.target.value) || 0)} className="h-9 w-24 text-right font-mono" />
          </div>
          {showTaxBreakdown && (
            <div className="text-xs bg-emerald-50 border border-emerald-100 rounded-lg p-2 space-y-1">
              <div className="flex justify-between"><span>DPP</span><span className="font-mono">{formatRupiah(taxableAmount)}</span></div>
              <div className="flex justify-between"><span>PPN {taxRate}% termasuk harga</span><span className="font-mono">{formatRupiah(taxAmount)}</span></div>
            </div>
          )}

          {/* Promo Code */}
          {appliedPromo ? (
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <div className="text-xs">
                <div className="font-semibold text-amber-900">{appliedPromo.promo_name}</div>
                <div className="font-mono text-amber-700">-{formatRupiah(appliedPromo.discount)}</div>
              </div>
              <button onClick={clearPromo} data-testid="clear-promo-btn" className="text-xs text-red-600 font-medium">Hapus</button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <Input data-testid="promo-code-input" value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} placeholder="Kode Promo" className="h-9 font-mono uppercase text-xs" />
              <Button data-testid="apply-promo-btn" onClick={applyPromo} size="sm" variant="outline" className="h-9">Pakai</Button>
            </div>
          )}
          {/* Member Lookup */}
          {member ? (
            <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Crown className="w-4 h-4 text-amber-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{member.name}</div>
                    <div className="text-xs text-gray-600">{member.tier} · <span className="font-mono">{member.points} poin</span></div>
                  </div>
                </div>
                <button onClick={clearMember} data-testid="clear-member-btn" className="text-gray-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex gap-1.5 mt-2">
                <Input data-testid="redeem-points-input" type="text" inputMode="numeric" pattern="[0-9]*" max={member.points} value={pointsToRedeem || ""} onChange={(e) => setPointsToRedeem(parseInt(e.target.value) || 0)} placeholder="Tukar poin" className="h-8 font-mono text-xs" />
                <Button size="sm" data-testid="apply-redeem-btn" onClick={applyRedeem} className="h-8 bg-amber-500 hover:bg-amber-600">Redeem</Button>
              </div>
              {redeemDiscount > 0 && <div className="text-xs text-amber-900 mt-1.5 font-medium">Diskon poin: -{formatRupiah(redeemDiscount)}</div>}
            </div>
          ) : (
            <div className="flex gap-1.5">
              <Input data-testid="member-query-input" value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder="Cari member (HP/ID)" className="h-9 text-xs" onKeyDown={(e) => e.key === "Enter" && lookupMember()} />
              <Button data-testid="lookup-member-btn" onClick={lookupMember} size="sm" variant="outline" className="h-9">
                <Crown className="w-3.5 h-3.5 mr-1" /> Member
              </Button>
            </div>
          )}

          {bonInfo && (
            <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-2 space-y-1">
              <div className="flex justify-between"><span>Total belanja awal</span><span className="font-mono">{formatRupiah(bonInfo.original_total || total)}</span></div>
              {bonInfo.initial_paid > 0 && <div className="flex justify-between"><span>Uang/DP sebelumnya</span><span className="font-mono">{formatRupiah(bonInfo.initial_paid)}</span></div>}
              <div className="flex justify-between font-semibold text-amber-800"><span>Sisa bon yang dibayar</span><span className="font-mono">{formatRupiah(bonRemaining)}</span></div>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold pt-2 border-t border-gray-100">
            <span>{bonInfo ? "Nominal Dibayar" : "Total"}</span>
            <span className="font-mono text-[#1a6b3c]" data-testid="cart-total">{formatRupiah(paymentDue)}</span>
          </div>

          {/* Transaction Type */}
          {!bonInfo && <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Jenis Transaksi</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                ["SALE", "Penjualan"],
                ["SELF_USE", "Pemakaian Sendiri"],
                ["WASTE", "Rusak/Hilang"],
                ["ADJUSTMENT", "Penyesuaian"],
              ].map(([key, label]) => (
                <button key={key} type="button" onClick={() => setTransactionType(key)}
                  className={`py-2 rounded-lg text-xs font-medium border ${transactionType === key ? "bg-[#1a6b3c] text-white border-[#1a6b3c]" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"}`}>
                  {label}
                </button>
              ))}
            </div>
            {transactionType !== "SALE" && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                Mode ini hanya mengurangi stok dan mencatat HPP sebagai biaya. Tidak menambah pendapatan/laba.
              </div>
            )}
          </div>}

          {/* Payment Methods */}
          {transactionType === "SALE" && <div className="grid grid-cols-4 gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button key={m.key} data-testid={`payment-${m.key}`} onClick={() => setPayment(m.key)}
                className={`flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                  payment === m.key ? "bg-[#1a6b3c] text-white" : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}>
                <m.icon className="w-4 h-4" />
                {m.label}
              </button>
            ))}
          </div>}

          {transactionType === "SALE" && payment === "cash" && !isBon && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600">{bonInfo ? "Uang Diterima untuk Pelunasan Bon" : "Uang Diterima"}</label>
                <Input data-testid="cash-received-input" type="text" inputMode="numeric" pattern="[0-9]*" value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  onFocus={() => { if (bonInfo && (!cashReceived || Number(cashReceived) <= 0)) setCashReceived(String(paymentDue)); }}
                  className="h-11 mt-1 font-mono text-right" placeholder={bonInfo ? String(paymentDue) : "0"} />
              </div>
              {cashReceivedNum > 0 && (
                <div className={`flex justify-between text-sm rounded-lg px-2.5 py-1.5 ${(isUnderpaid || isBonUnderpaid) ? "bg-red-50 border border-red-200" : ""}`}>
                  <span className={(isUnderpaid || isBonUnderpaid) ? "text-red-700 font-medium" : "text-gray-600"}>
                    {(isUnderpaid || isBonUnderpaid) ? "Kurang Bayar" : (bonInfo ? "Kembalian Pelunasan" : "Kembalian")}
                  </span>
                  <span className={`font-mono font-semibold ${(isUnderpaid || isBonUnderpaid) ? "text-red-600" : "text-[#f4a228]"}`}>
                    {(isUnderpaid || isBonUnderpaid) ? `-${formatRupiah(Math.abs(change))}` : formatRupiah(change)}
                  </span>
                </div>
              )}
              {isUnderpaid && !bonInfo && (
                <div className="text-xs text-red-600 bg-red-50 rounded px-2 py-1.5 leading-snug">
                  ⚠ Bayar tunai &lt; total. Transaksi akan otomatis tercatat sebagai <strong>BON</strong> sebesar {formatRupiah(Math.abs(change))}. Pastikan No. HP pelanggan diisi untuk penagihan.
                </div>
              )}
            </>
          )}

          {/* Customer identity (for receipt, bon search, and WhatsApp receipt) */}
          {transactionType === "SALE" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600">Nama Pelanggan (opsional, wajib untuk bon)</label>
                <Input data-testid="customer-name-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nama pelanggan" className="h-9 mt-1 text-xs" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">No. HP Pelanggan (opsional, untuk kirim struk WA)</label>
                <Input data-testid="customer-phone-input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="08xxx" className="h-9 mt-1 font-mono text-xs" />
              </div>
            </div>
          )}

          {/* Bon toggle (disabled while settling existing bon) */}
          {transactionType === "SALE" && !bonInfo && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input data-testid="bon-toggle" type="checkbox" checked={isBon} onChange={(e) => setIsBon(e.target.checked)} className="w-4 h-4 rounded accent-[#1a6b3c]" />
              <span>Catat sebagai Bon / Hutang</span>
            </label>
          )}
          {transactionType === "SALE" && isBon && !bonInfo && !customerName.trim() && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">Nama pelanggan wajib diisi agar bon bisa dicari nanti.</div>
          )}

          <Button data-testid="checkout-btn" onClick={checkout} disabled={cart.length === 0 || (bonInfo && paymentDue <= 0)}
            className="w-full h-12 bg-[#f4a228] hover:bg-[#d98b1a] text-white font-semibold text-base">
            {bonInfo ? `Lunasi Bon ${formatRupiah(paymentDue)}` : "Konfirmasi Pembayaran"}
          </Button>
        </div>
      </div>

      {/* Variant Picker */}
      <Dialog open={!!variantPicker} onOpenChange={(o) => { if (!o) setVariantPicker(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Pilih Varian</DialogTitle></DialogHeader>
          {variantPicker && <div className="space-y-2">
            <div className="text-sm font-semibold">{variantPicker.name}</div>
            <div className="grid grid-cols-1 gap-2">
              {(variantPicker.variants || []).map((v) => (
                <button key={v.id || v.name} onClick={() => addVariantToCart(variantPicker, v)} className="w-full text-left border border-gray-200 rounded-lg p-3 hover:border-[#1a6b3c] hover:bg-emerald-50">
                  <div className="font-semibold text-sm">{v.name}</div>
                  <div className="font-mono text-xs text-[#1a6b3c]">{formatRupiah(v.sell_price || variantPicker.sell_price)}</div>
                </button>
              ))}
            </div>
          </div>}
        </DialogContent>
      </Dialog>

      {/* POS Category Manager */}
      <Dialog open={showCategoryManager} onOpenChange={setShowCategoryManager}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Atur Kategori POS</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Nama kategori</label>
              <Input value={posCategoryName} onChange={(e) => setPosCategoryName(e.target.value)} placeholder="Mis. Minuman Dingin / Snack / Paket Hemat" className="mt-1" />
              <p className="text-[11px] text-gray-500 mt-1">Kategori ini langsung mengubah kategori barang di Inventori juga, jadi Kasir dan Inventori tetap sinkron.</p>
            </div>
            <div className="border rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {unitFilteredItems.map((i) => (
                <label key={i.id} className="flex items-center gap-2 p-2 text-sm hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={posCategoryItems.includes(i.id)} onChange={(e) => setPosCategoryItems((prev) => e.target.checked ? [...prev, i.id] : prev.filter((id) => id !== i.id))} className="w-4 h-4 accent-[#1a6b3c]" />
                  <span className="flex-1">{i.name}</span>
                  <span className="text-[10px] text-gray-400">{i.category}</span>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryManager(false)}>Batal</Button>
            <Button onClick={savePosCategory} className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan Kategori</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History / Cancel Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Riwayat Transaksi · Detail / Edit</DialogTitle>
          </DialogHeader>
          <div className="mb-2">
            <Input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Cari no nota / nama pelanggan / no HP" className="h-9" />
          </div>
          <div className="overflow-y-auto divide-y divide-gray-100 -mx-2">
            {recentTrx.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-10">Belum ada transaksi</div>
            ) : recentTrx.filter((t) => t.cancel_reason !== "replaced_by_payment").filter((t) => { const q = historySearch.trim().toLowerCase(); return !q || String(t.trx_no||'').toLowerCase().includes(q) || String(t.customer_name||'').toLowerCase().includes(q) || String(t.customer_phone||'').toLowerCase().includes(q); }).map((t) => (
              <div key={t.id} data-testid={`history-row-${t.id}`} className={`px-2 py-3 flex items-start gap-3 ${t.cancelled ? "opacity-60 bg-red-50/30" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{t.trx_no}</span>
                    {t.cancelled && <span className="text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">DIBATALKAN</span>}
                    {t.is_bon && <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded">BON</span>}
                    {t.transaction_type && t.transaction_type !== "SALE" && <span className="text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded">{t.transaction_type}</span>}
                    {t.payment_status && <span className="text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-200 px-1.5 py-0.5 rounded">{t.payment_status}</span>}
                    <span className="text-[10px] uppercase text-gray-500">{t.payment_method}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {new Date(t.created_at).toLocaleString("id-ID")} · {t.items?.length || 0} item
                    {t.customer_name && ` · ${t.customer_name}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-mono text-sm font-bold ${t.cancelled ? "line-through text-gray-400" : "text-[#1a6b3c]"}`}>{formatRupiah(t.total)}</div>
                  {(t.paid_amount || t.cash_collected || 0) !== (t.total || 0) && (
                    <div className="text-[10px] text-gray-500">Terbayar {formatRupiah(t.paid_amount || t.cash_collected || 0)}</div>
                  )}
                  {(t.debt_amount || 0) > 0 && <div className="text-[10px] text-amber-700">Sisa bon {formatRupiah(t.debt_amount)}</div>}
                  <div className="flex gap-2 justify-end mt-1 flex-wrap">
                    <button data-testid={`detail-trx-${t.id}`} onClick={() => setShowReceipt(t)} className="text-xs text-[#1a6b3c] font-semibold hover:underline">Detail</button>
                    {!t.cancelled && (
                      <>
                        <button data-testid={`edit-trx-${t.id}`} onClick={() => setEditTrx({ ...t })} className="text-xs text-blue-600 font-medium hover:underline">Edit</button>
                        <button data-testid={`cancel-trx-${t.id}`} onClick={() => cancelTransaction(t)} className="text-xs text-red-600 font-semibold hover:underline">Batalkan</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHistory(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Transaction Dialog */}
      <Dialog open={!!editTrx} onOpenChange={() => setEditTrx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Transaksi {editTrx?.trx_no}</DialogTitle>
          </DialogHeader>
          {editTrx && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Nama Pelanggan</label>
                <Input data-testid="edit-customer-name" value={editTrx.customer_name || ""} onChange={(e) => setEditTrx({ ...editTrx, customer_name: e.target.value })} className="h-10 mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">No. HP Pelanggan</label>
                <Input data-testid="edit-customer-phone" value={editTrx.customer_phone || ""} onChange={(e) => setEditTrx({ ...editTrx, customer_phone: e.target.value })} className="h-10 mt-1 font-mono" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Catatan</label>
                <Input data-testid="edit-notes" value={editTrx.notes || ""} onChange={(e) => setEditTrx({ ...editTrx, notes: e.target.value })} className="h-10 mt-1" />
              </div>
              <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
                <div>Total: <span className="font-mono font-semibold">{formatRupiah(editTrx.total)}</span></div>
                <div>Item & total tidak dapat diubah. Untuk mengubah item, batalkan transaksi lalu buat baru.</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTrx(null)}>Batal</Button>
            <Button data-testid="save-edit-trx-btn" onClick={saveEditTrx} className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog open={!!showReceipt} onOpenChange={(o) => { if (!o) closeReceipt(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Struk Transaksi</DialogTitle>
          </DialogHeader>
          {showReceipt && (() => {
            const cfg = getReceiptConfig(showReceipt);
            const headerName = cfg.business_name;
            return (
            <div id="receipt-content" className="font-mono text-sm space-y-1 bg-gray-50 p-4 rounded-lg">
              {cfg.logo_url && <img src={resolveImageUrl(cfg.logo_url)} alt="Logo struk" className="mx-auto max-h-16 max-w-[160px] object-contain mb-2" />}
              <div className="text-center font-semibold mb-2 uppercase" data-testid="receipt-header-name">{headerName}</div>
              {cfg.address && <div className="text-center text-xs mb-0.5">{cfg.address}</div>}
              {cfg.phone && <div className="text-center text-xs mb-2">Telp: {cfg.phone}</div>}
              <div className="border-t border-dashed border-gray-400 my-2" />
              <div className="text-xs">No: {showReceipt.trx_no}</div>
              {showReceipt.queue_no && <div className="text-xs font-semibold">Antrian: {showReceipt.queue_no}</div>}
              {showReceipt.receipt_kind === "DEBT_SETTLEMENT" && showReceipt.original_trx_no && <div className="text-xs">Pelunasan: {showReceipt.original_trx_no}</div>}
              {showReceipt.receipt_kind === "DEBT_SETTLEMENT" && <div className="text-xs font-semibold">Jenis: PELUNASAN BON</div>}
              <div className="text-xs">{new Date(showReceipt.created_at).toLocaleString("id-ID")}</div>
              {showReceipt.customer_name && <div className="text-xs">Pelanggan: {showReceipt.customer_name}</div>}
              {showReceipt.customer_phone && <div className="text-xs">HP: {showReceipt.customer_phone}</div>}
              <div className="border-t border-dashed border-gray-400 my-2" />
              {showReceipt.items.map((it, i) => (
                <div key={`${it.name}-${i}`} className="text-xs">
                  <div>{it.name}</div>
                  <div className="flex justify-between"><span>{it.quantity} x {formatRupiah(it.unit_price)}</span><span>{formatRupiah(it.unit_price * it.quantity)}</span></div>
                </div>
              ))}
              <div className="border-t border-dashed border-gray-400 my-2" />
              {showReceipt.receipt_kind === "DEBT_SETTLEMENT" ? (
                <>
                  <div className="flex justify-between text-xs"><span>Total Belanja</span><span>{formatRupiah(showReceipt.total)}</span></div>
                  <div className="flex justify-between text-xs"><span>Sudah Dibayar</span><span>{formatRupiah(showReceipt.previous_paid || 0)}</span></div>
                  <div className="flex justify-between font-semibold"><span>Bayar Bon</span><span>{formatRupiah(showReceipt.payment_amount || 0)}</span></div>
                  {showReceipt.payment_method === "cash" && <div className="flex justify-between text-xs"><span>Uang Diterima</span><span>{formatRupiah(showReceipt.cash_received)}</span></div>}
                  {showReceipt.payment_method === "cash" && <div className="flex justify-between text-xs"><span>Kembali</span><span>{formatRupiah(showReceipt.change)}</span></div>}
                  <div className="flex justify-between text-xs"><span>Sisa Hutang</span><span>{formatRupiah(showReceipt.debt_amount || 0)}</span></div>
                </>
              ) : (
                <>
                  <div className="flex justify-between text-xs"><span>Subtotal</span><span>{formatRupiah(showReceipt.subtotal)}</span></div>
                  {showReceipt.discount > 0 && <div className="flex justify-between text-xs"><span>Diskon</span><span>-{formatRupiah(showReceipt.discount)}</span></div>}
                  {showReceipt.tax_receipt_enabled && Number(showReceipt.tax_amount || 0) > 0 && (
                    <>
                      <div className="flex justify-between text-xs"><span>DPP</span><span>{formatRupiah(showReceipt.taxable_amount || 0)}</span></div>
                      <div className="flex justify-between text-xs"><span>PPN {Number(showReceipt.tax_rate || 0)}% termasuk</span><span>{formatRupiah(showReceipt.tax_amount || 0)}</span></div>
                    </>
                  )}
                  <div className="flex justify-between font-semibold"><span>Total</span><span>{formatRupiah(showReceipt.total)}</span></div>
                  {showReceipt.payment_method === "cash" && (
                    <>
                      <div className="flex justify-between text-xs"><span>Bayar</span><span>{formatRupiah(showReceipt.cash_received)}</span></div>
                      <div className="flex justify-between text-xs"><span>Kembali</span><span>{formatRupiah(showReceipt.change)}</span></div>
                    </>
                  )}
                  {showReceipt.debt_amount > 0 && <div className="flex justify-between text-xs text-red-700"><span>Hutang</span><span>{formatRupiah(showReceipt.debt_amount)}</span></div>}
                </>
              )}
              {showReceipt.transaction_type && showReceipt.transaction_type !== "SALE" && <div className="flex justify-between text-xs"><span>HPP</span><span>{formatRupiah(showReceipt.cost_total || 0)}</span></div>}
              {showReceipt.payment_status && <div className="flex justify-between text-xs"><span>Status</span><span>{showReceipt.payment_status}</span></div>}
              <div className="border-t border-dashed border-gray-400 my-2" />
              {showReceipt.trx_no && (
                <div className="text-center my-2">
                  <QRCodeBox value={showReceipt.trx_no} size={118} label={`Scan QR / ketik: ${showReceipt.trx_no}`} />
                </div>
              )}
              {cfg.note && <div className="text-center text-xs whitespace-pre-line">{cfg.note}</div>}
              <div className="text-center text-xs whitespace-pre-line">{cfg.footer || "Terima kasih! 🙏"}</div>
            </div>
            );
          })()}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {showReceipt && (
              <>
                <Button data-testid="receipt-bluetooth-btn" variant="outline" className="flex-1 w-full" onClick={async () => {
                  const cfg = getReceiptConfig(showReceipt);
                  const fallbackThermal = () => {
                    printViaIframe({
                      title: `Struk ${showReceipt.trx_no}`,
                      css: thermal80Css(),
                      preferWindow: true,
                      buildBody: (doc) => {
                        const wrap = doc.createElement('div');
                        wrap.className = 'thermal-print';
                        const rows = (showReceipt.items || []).map((it) => `<div>${it.name}</div><div class="row"><span>${it.quantity} x ${formatRupiah(it.unit_price)}</span><b>${formatRupiah(it.quantity * it.unit_price)}</b></div>`).join('');
                        const qr = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(showReceipt.trx_no || '')}`;
                        wrap.innerHTML = `<div class="center big">${cfg.business_name || 'AGRIWARUNG'}</div>${cfg.address ? `<div class="center small">${cfg.address}</div>` : ''}<div class="line"></div><div>No: ${showReceipt.trx_no}</div>${showReceipt.queue_no ? `<div>Antrian: ${showReceipt.queue_no}</div>` : ''}<div>${new Date(showReceipt.created_at).toLocaleString('id-ID')}</div><div class="line"></div>${rows}<div class="line"></div><div class="row"><span>Subtotal</span><b>${formatRupiah(showReceipt.subtotal || 0)}</b></div>${showReceipt.discount ? `<div class="row"><span>Diskon</span><b>-${formatRupiah(showReceipt.discount)}</b></div>` : ''}<div class="row big"><span>Total</span><b>${formatRupiah(showReceipt.total || 0)}</b></div><div>Metode: ${String(showReceipt.payment_method || '').toUpperCase()}</div><div class="line"></div><div class="center"><img class="qr" src="${qr}"/><div class="small">Scan QR / ketik ${showReceipt.trx_no || ''}</div></div><div class="line"></div><div class="center small">${cfg.footer || 'Terima kasih!'}</div>`;
                        doc.body.appendChild(wrap);
                      }
                    });
                  };
                  try {
                    if (!isPrinterAvailable()) {
                      fallbackThermal();
                      toast.info("Web Bluetooth tidak tersedia di browser ini. Dibuka mode print browser ukuran 80mm.");
                      return;
                    }
                    await printReceipt(showReceipt, {
                      headerName: cfg.business_name,
                      subLine: cfg.address || "",
                      phone: cfg.phone || "",
                      footer: cfg.footer || "Terima kasih!",
                    });
                    toast.success("Struk dikirim ke printer thermal");
                  } catch (e) {
                    fallbackThermal();
                    toast.error((e?.message || "Gagal cetak Bluetooth") + ". Dibuka fallback print browser.");
                  }
                }}>
                  <Bluetooth className="w-4 h-4 mr-1.5" /> Thermal / 80mm
                </Button>
                <Button data-testid="receipt-whatsapp-btn" variant="outline" className="flex-1 w-full" onClick={async () => {
                  let phone = (showReceipt.customer_phone || "").replace(/[^\d]/g, "");
                  if (!phone) {
                    const manual = window.prompt("Masukkan nomor WhatsApp pelanggan (contoh 08123456789):", "");
                    phone = (manual || "").replace(/[^\d]/g, "");
                  }
                  if (!phone) return toast.error("Nomor WhatsApp belum diisi");
                  try {
                    const { data } = await api.post(`/transactions/${showReceipt.id}/send-whatsapp`, { phone });
                    if (data.sent) return toast.success("Struk benar-benar terkirim via WhatsApp API");
                    if (data.wa_url) {
                      window.open(data.wa_url, "_blank");
                      return toast.info("WhatsApp API belum aktif. Jendela WhatsApp dibuka, tekan Kirim manual.");
                    }
                    toast.error(data.error || data.message || "Gagal mengirim WhatsApp");
                  } catch (e) {
                    const text = encodeURIComponent(buildReceiptText(showReceipt));
                    let p = phone; if (p.startsWith("0")) p = "62" + p.slice(1); else if (p && !p.startsWith("62")) p = "62" + p;
                    window.open(`https://wa.me/${p}?text=${text}`, "_blank");
                    toast.info("Gagal akses API. WhatsApp dibuka untuk kirim manual.");
                  }
                }}>
                  <MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp{showReceipt?.customer_phone ? " Pelanggan" : ""}
                </Button>
                <Button data-testid="receipt-print-btn" variant="outline" className="flex-1 w-full" onClick={() => {
                  const html = document.getElementById("receipt-content")?.innerHTML || "";
                  printViaIframe({
                    title: `Struk ${showReceipt.trx_no}`,
                    css: thermal80Css(),
                    bodyHtml: `<div class="thermal-print">${html}</div>`,
                    preferWindow: true,
                  });
                }}>
                  <Printer className="w-4 h-4 mr-1.5" /> Print
                </Button>
              </>
            )}
            <Button onClick={closeReceipt} className="w-full sm:flex-1 bg-[#1a6b3c] hover:bg-[#14522d]">Selesai</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
