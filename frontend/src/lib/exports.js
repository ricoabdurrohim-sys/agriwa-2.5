// Excel & PDF export utilities
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function formatRp(n) {
  if (!n) return "Rp 0";
  return "Rp " + Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// ---------- XLSX EXPORTS ----------
export function exportTransactionsXLSX(transactions) {
  const data = transactions.map((t) => ({
    "No. Transaksi": t.trx_no,
    "Tanggal": new Date(t.created_at).toLocaleString("id-ID"),
    "Unit": t.unit,
    "Metode Bayar": t.payment_method,
    "Subtotal (Rp)": t.subtotal,
    "Diskon (Rp)": t.discount,
    "Total (Rp)": t.total,
    "Kasir": t.cashier_name || "",
    "Bon": t.is_bon ? "Ya" : "Tidak",
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  // Auto column widths
  ws["!cols"] = Object.keys(data[0] || {}).map((k) => ({ wch: Math.max(k.length, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Transaksi");
  XLSX.writeFile(wb, `Transaksi_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportProfitLossXLSX(pl) {
  const rows = [];
  rows.push(["LAPORAN LABA RUGI"]);
  rows.push(["Periode", new Date().toLocaleDateString("id-ID")]);
  rows.push([]);
  rows.push(["PENDAPATAN", "Jumlah (Rp)"]);
  Object.entries(pl.revenue_by_unit || {}).forEach(([u, v]) => rows.push([`Pendapatan ${u}`, v]));
  rows.push(["Total Pendapatan", pl.total_revenue]);
  rows.push([]);
  rows.push(["HPP"]);
  rows.push(["HPP / COGS", pl.cogs || 0]);
  rows.push(["Laba Kotor", pl.gross_profit || 0]);
  rows.push([]);
  rows.push(["BIAYA OPERASIONAL"]);
  Object.entries(pl.expense_by_category || {}).forEach(([c, v]) => rows.push([c, v]));
  rows.push(["Total Biaya", pl.total_expense]);
  rows.push([]);
  rows.push(["LABA BERSIH", pl.net_profit]);
  rows.push([]);
  rows.push(["Gross Profit Margin (%)", pl.gross_profit_margin]);
  rows.push(["Net Profit Margin (%)", pl.net_profit_margin]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 32 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Laba Rugi");
  XLSX.writeFile(wb, `LabaRugi_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportInventoryXLSX(items) {
  const data = items.map((i) => ({
    "Nama": i.name,
    "Kategori": i.category,
    "Unit": i.unit,
    "Stok Saat Ini": i.current_stock,
    "Stok Min": i.min_stock,
    "Harga Pokok (Rp)": i.cost_price,
    "Harga Jual (Rp)": i.sell_price,
    "Unit Bisnis": i.business_unit,
    "Lokasi": i.location || "",
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = Object.keys(data[0] || {}).map((k) => ({ wch: Math.max(k.length, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventori");
  XLSX.writeFile(wb, `Inventori_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ---------- PDF EXPORTS ----------
function pdfHeader(doc, title) {
  doc.setFillColor(26, 107, 60);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 25, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text("AgriWarung Manager", 14, 12);
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.text("Boyolali, Jawa Tengah", 14, 18);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text(title, 14, 35);
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Dibuat: ${new Date().toLocaleString("id-ID")}`, 14, 41);
  doc.setTextColor(0, 0, 0);
}

export function exportTransactionsPDF(transactions) {
  const doc = new jsPDF();
  pdfHeader(doc, "Laporan Transaksi");
  autoTable(doc, {
    startY: 48,
    head: [["No. Transaksi", "Tanggal", "Unit", "Bayar", "Total", "Kasir"]],
    body: transactions.map((t) => [
      t.trx_no, new Date(t.created_at).toLocaleDateString("id-ID"),
      t.unit, t.payment_method, formatRp(t.total), t.cashier_name || "",
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [26, 107, 60], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [247, 248, 250] },
    columnStyles: { 4: { halign: "right", fontStyle: "bold" } },
  });
  const total = transactions.reduce((s, t) => s + (t.total || 0), 0);
  doc.setFont(undefined, "bold");
  doc.setFontSize(10);
  doc.text(`Total: ${formatRp(total)}`, 14, doc.lastAutoTable.finalY + 10);
  doc.save(`Transaksi_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportProfitLossPDF(pl) {
  const doc = new jsPDF();
  pdfHeader(doc, "Laporan Laba Rugi");

  const revRows = Object.entries(pl.revenue_by_unit || {}).map(([u, v]) => [`Pendapatan ${u}`, formatRp(v)]);
  revRows.push(["Total Pendapatan", formatRp(pl.total_revenue)]);

  autoTable(doc, {
    startY: 48,
    head: [["PENDAPATAN", "Jumlah"]],
    body: revRows,
    theme: "striped",
    headStyles: { fillColor: [26, 107, 60], textColor: 255 },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    styles: { fontSize: 9 },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 5,
    head: [["HPP & LABA KOTOR", "Jumlah"]],
    body: [
      ["HPP / COGS", formatRp(pl.cogs || 0)],
      ["Laba Kotor", formatRp(pl.gross_profit || 0)],
    ],
    theme: "striped",
    headStyles: { fillColor: [244, 162, 40], textColor: 255 },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    styles: { fontSize: 9 },
  });

  const expRows = Object.entries(pl.expense_by_category || {}).map(([c, v]) => [c, formatRp(v)]);
  expRows.push(["Total Biaya", formatRp(pl.total_expense)]);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 5,
    head: [["BIAYA OPERASIONAL", "Jumlah"]],
    body: expRows,
    theme: "striped",
    headStyles: { fillColor: [229, 62, 62], textColor: 255 },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    styles: { fontSize: 9 },
  });

  // Net Profit highlight
  const profitColor = (pl.net_profit || 0) >= 0 ? [26, 107, 60] : [229, 62, 62];
  doc.setFillColor(...profitColor);
  doc.rect(14, doc.lastAutoTable.finalY + 8, doc.internal.pageSize.getWidth() - 28, 14, "F");
  doc.setTextColor(255);
  doc.setFont(undefined, "bold");
  doc.setFontSize(12);
  doc.text("LABA BERSIH", 18, doc.lastAutoTable.finalY + 17);
  doc.text(formatRp(pl.net_profit), doc.internal.pageSize.getWidth() - 18, doc.lastAutoTable.finalY + 17, { align: "right" });

  doc.setTextColor(0);
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  const y = doc.lastAutoTable.finalY + 30;
  doc.text(`Gross Profit Margin: ${pl.gross_profit_margin}%`, 14, y);
  doc.text(`Net Profit Margin: ${pl.net_profit_margin}%`, 14, y + 5);

  doc.save(`LabaRugi_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportInventoryPDF(items) {
  const doc = new jsPDF("l");  // landscape
  pdfHeader(doc, "Laporan Inventori");
  autoTable(doc, {
    startY: 48,
    head: [["Nama", "Kategori", "Stok", "Min", "HPP", "Harga Jual", "Unit Bisnis"]],
    body: items.map((i) => [
      i.name, i.category, `${i.current_stock} ${i.unit}`, i.min_stock,
      formatRp(i.cost_price), formatRp(i.sell_price), i.business_unit,
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [26, 107, 60], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [247, 248, 250] },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2) {
        const stock = items[data.row.index].current_stock;
        const min = items[data.row.index].min_stock;
        if (stock <= min && min > 0) {
          data.cell.styles.textColor = [229, 62, 62];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });
  doc.save(`Inventori_${new Date().toISOString().slice(0, 10)}.pdf`);
}
