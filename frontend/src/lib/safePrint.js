// Safe iframe-based printing utility.
// Avoids `document.write` with unsanitized template strings (XSS-safe).

const escapeMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => escapeMap[c]);
}

/**
 * Print arbitrary HTML safely via a hidden iframe.
 *
 * @param {Object} opts
 * @param {string} opts.title          - Document title (auto-escaped)
 * @param {string} [opts.bodyHtml]     - Pre-rendered HTML (e.g. from React-controlled DOM)
 * @param {(doc: Document) => void} [opts.buildBody] - Optional callback to build body via DOM API
 * @param {string} [opts.css]          - Optional <style> CSS content
 */
export function printViaIframe({ title, bodyHtml = "", buildBody, css = "" }) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  // Static shell — title escaped, css inserted as-is (caller is trusted for CSS).
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body></body></html>`
  );
  doc.close();

  if (buildBody) {
    buildBody(doc);
  } else if (bodyHtml) {
    // SECURITY: bodyHtml must come from a trusted source (e.g. React-rendered DOM
    // that React has already escaped). Callers passing user-supplied HTML MUST
    // sanitize via DOMPurify first. We strip <script> tags and event handlers
    // below as defense-in-depth.
    doc.body.innerHTML = bodyHtml;
  }
  // Strip any <script> tags AND event-handler attributes (defense-in-depth).
  doc.querySelectorAll("script").forEach((s) => s.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes || [])) {
      if (attr.name.startsWith("on")) el.removeAttribute(attr.name);
      if (attr.name === "href" && /^javascript:/i.test(attr.value || "")) el.removeAttribute("href");
    }
  });

  const win = iframe.contentWindow;
  const imgs = Array.from(doc.images || []);
  const waitImgs = imgs.length
    ? Promise.all(
        imgs.map((img) =>
          img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; })
        )
      )
    : Promise.resolve();

  waitImgs.then(() => {
    try {
      win.focus();
      win.print();
    } catch (e) {
      // ignore print errors
    }
    // Cleanup after a delay (let print dialog use the iframe).
    setTimeout(() => {
      try { iframe.remove(); } catch (e) { /* noop */ }
    }, 2000);
  });
}
