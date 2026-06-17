function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}

export function isIOSLike() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function sanitizePrintedDocument(doc) {
  doc.querySelectorAll("script").forEach((s) => s.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes || [])) {
      if (attr.name.startsWith("on")) el.removeAttribute(attr.name);
      if (attr.name === "href" && /^javascript:/i.test(attr.value || "")) el.removeAttribute("href");
    }
  });
}

function waitImages(doc) {
  const imgs = Array.from(doc.images || []);
  return imgs.length
    ? Promise.all(imgs.map((img) => img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; })))
    : Promise.resolve();
}

function writeBody(doc, { bodyHtml, buildBody }) {
  if (buildBody) buildBody(doc); else if (bodyHtml) doc.body.innerHTML = bodyHtml;
  sanitizePrintedDocument(doc);
}

/**
 * Print arbitrary HTML safely.
 * iPhone/iPad cannot use Web Bluetooth from browser and often blocks automatic print() calls.
 * For iOS we open a dedicated 80mm receipt page with a visible "Cetak" button, so only
 * the receipt/label is printed and the user can trigger AirPrint manually.
 */
export function printViaIframe({ title, bodyHtml = "", buildBody, css = "", preferWindow = false }) {
  const printableCss = `${css}\n.no-print{font-family:system-ui,-apple-system,Segoe UI,sans-serif}.print-toolbar{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:10px;z-index:10}.print-btn{width:100%;border:0;border-radius:12px;background:#1a6b3c;color:white;font-weight:700;padding:12px 14px;font-size:15px}.print-hint{font-size:12px;color:#555;margin-top:6px;line-height:1.35}@media print{.no-print{display:none!important}.print-toolbar{display:none!important}html,body{background:white!important}}`;
  const shell = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><title>${escapeHtml(title)}</title><style>${printableCss}</style></head><body></body></html>`;

  if (isIOSLike()) {
    const win = window.open("", "_blank");
    if (win && win.document) {
      const doc = win.document;
      doc.open(); doc.write(shell); doc.close();
      const toolbar = doc.createElement("div");
      toolbar.className = "no-print print-toolbar";
      toolbar.innerHTML = `<button class="print-btn" type="button">Cetak Struk / Label</button><div class="print-hint">Mode iPhone/iPad: halaman ini hanya berisi struk/label 80mm. Jika dialog print belum muncul, tekan tombol hijau ini lalu pilih printer/AirPrint.</div>`;
      doc.body.appendChild(toolbar);
      const wrap = doc.createElement("main");
      doc.body.appendChild(wrap);
      if (buildBody) {
        // Build into a temporary document body, then move generated receipt nodes after toolbar.
        const tmp = doc.implementation.createHTMLDocument(title || "Print");
        buildBody(tmp);
        wrap.innerHTML = tmp.body.innerHTML;
      } else {
        wrap.innerHTML = bodyHtml || "";
      }
      sanitizePrintedDocument(doc);
      const doPrint = () => waitImages(doc).then(() => { try { win.focus(); win.print(); } catch {} });
      toolbar.querySelector("button")?.addEventListener("click", doPrint);
      // Try once for Android-like behavior; iOS users still have the visible button fallback.
      setTimeout(doPrint, 650);
      return;
    }
  }

  if (preferWindow) {
    const win = window.open("", "_blank", "noopener,noreferrer,width=420,height=720");
    if (win && win.document) {
      const doc = win.document;
      doc.open(); doc.write(shell); doc.close();
      writeBody(doc, { bodyHtml, buildBody });
      waitImages(doc).then(() => setTimeout(() => { try { win.focus(); win.print(); } catch {} }, 250));
      return;
    }
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open(); doc.write(shell); doc.close();
  writeBody(doc, { bodyHtml, buildBody });
  const win = iframe.contentWindow;
  waitImages(doc).then(() => {
    try { win.focus(); win.print(); } catch {}
    setTimeout(() => { try { iframe.remove(); } catch {} }, 2000);
  });
}

export function thermal80Css(extra = "") {
  return `@page{size:80mm auto;margin:1.5mm}html,body{margin:0!important;padding:0!important;background:white}.thermal-print{font-family:"Courier New",ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;line-height:1.25;width:74mm;max-width:74mm;margin:0 auto;color:#111;word-break:break-word}.center{text-align:center}.line{border-top:1px dashed #555;margin:5px 0}.row{display:flex;justify-content:space-between;gap:8px}.title{font-weight:700;font-size:13px;line-height:1.15}.big,.total{font-weight:700;font-size:13px}.small{font-size:9.5px}.multiline{white-space:pre-line}.item-name{font-weight:600;white-space:normal;word-break:break-word}.qr{width:86px!important;height:86px!important;display:block;margin:5px auto}.logo{max-width:42mm;max-height:18mm;object-fit:contain;display:block;margin:0 auto 5px}img{max-width:100%}@media print{body>*:not(.thermal-print):not(main){display:none!important}.thermal-print{display:block!important}}${extra}`;
}
