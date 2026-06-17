// Safe print utility for receipts/labels.
// Uses a dedicated print document on iPhone/iPad so the browser does not print the whole app.

const escapeMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => escapeMap[c]);
}

function isIOSLike() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // Chrome on iPhone/iPad still uses iOS WebKit, so treat it like Safari for print/Bluetooth limits.
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

/**
 * Print arbitrary HTML safely.
 * On iPhone/iPad, hidden iframe printing can accidentally print the whole app,
 * so we open a dedicated print document/window that contains ONLY the receipt/label.
 */
export function printViaIframe({ title, bodyHtml = "", buildBody, css = "", preferWindow = false }) {
  const shell = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${css}</style></head><body></body></html>`;

  if (preferWindow || isIOSLike()) {
    const win = window.open("", "_blank", "noopener,noreferrer,width=420,height=720");
    if (win && win.document) {
      const doc = win.document;
      doc.open(); doc.write(shell); doc.close();
      if (buildBody) buildBody(doc); else if (bodyHtml) doc.body.innerHTML = bodyHtml;
      sanitizePrintedDocument(doc);
      waitImages(doc).then(() => setTimeout(() => { try { win.focus(); win.print(); } catch {} }, 250));
      return;
    }
    // If popup is blocked, fall back to iframe below.
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open(); doc.write(shell); doc.close();
  if (buildBody) buildBody(doc); else if (bodyHtml) doc.body.innerHTML = bodyHtml;
  sanitizePrintedDocument(doc);
  const win = iframe.contentWindow;
  waitImages(doc).then(() => {
    try { win.focus(); win.print(); } catch {}
    setTimeout(() => { try { iframe.remove(); } catch {} }, 2000);
  });
}

export function thermal80Css(extra = "") {
  return `@page{size:80mm auto;margin:2mm}html,body{margin:0;padding:0;background:white}.thermal-print{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;line-height:1.28;width:76mm;max-width:76mm;margin:0 auto;color:#111}.center{text-align:center}.line{border-top:1px dashed #555;margin:6px 0}.row{display:flex;justify-content:space-between;gap:8px}.big{font-weight:700;font-size:15px}.small{font-size:10px}.qr{width:96px;height:96px;display:block;margin:6px auto}img{max-width:100%}@media print{body *{visibility:visible!important}}${extra}`;
}
