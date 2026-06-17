export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function preloadImage(src) {
  if (!src) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ ok: true, width: img.naturalWidth, height: img.naturalHeight, src });
    img.onerror = () => resolve({ ok: false, src });
    img.src = src;
  });
}

export async function imageUrlToDataUrl(url) {
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'include' });
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } catch (error) {
    console.error('imageUrlToDataUrl error:', error);
    return null;
  }
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function normalizeReceiptImage(src) {
  if (!src) return null;
  if (String(src).startsWith('data:')) return src;
  const preflight = await preloadImage(src);
  if (!preflight?.ok) return null;
  return await imageUrlToDataUrl(src);
}
