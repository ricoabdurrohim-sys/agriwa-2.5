import axios from "axios";

// HF backend AgriWarung yang sedang aktif.
const FALLBACK_BACKEND_URL = "https://rikoabd-agriwarung-2-5.hf.space";

function normalizeBackendUrl(rawValue) {
  let value = (rawValue || "").trim();

  // Vercel env kadang kosong di preview/deployment tertentu.
  if (!value || value === "undefined" || value === "null") {
    value = FALLBACK_BACKEND_URL;
  }

  value = value.replace(/\/+$/, "");

  // REACT_APP_BACKEND_URL harus origin backend saja, tanpa /api.
  // Kalau terlanjur diisi ...hf.space/api, hapus suffix /api agar tidak jadi /api/api.
  if (value.endsWith("/api")) {
    value = value.slice(0, -4);
  }

  return value || FALLBACK_BACKEND_URL;
}

export const BACKEND_URL = normalizeBackendUrl(process.env.REACT_APP_BACKEND_URL);
export const API_URL = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_URL,
  // v2.5.39 IMPORTANT:
  // Login manual memakai Bearer token di localStorage, bukan cookie.
  // Jangan kirim credentials lintas domain Vercel -> HuggingFace, karena kalau CORS HF masih wildcard (*)
  // browser bisa menolak request meskipun endpoint HF /docs berhasil 200.
  withCredentials: false,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("aw_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Catatan ringan untuk debug di DevTools tanpa mengganggu user.
    if (typeof window !== "undefined") {
      console.warn("AgriWarung API error", {
        baseURL: API_URL,
        url: error?.config?.url,
        method: error?.config?.method,
        status: error?.response?.status,
        detail: error?.response?.data?.detail,
        message: error?.message,
      });
    }
    return Promise.reject(error);
  },
);

export default api;

export function formatRupiah(n) {
  if (n === null || n === undefined || isNaN(n)) return "Rp 0";
  const abs = Math.abs(Math.round(n));
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (n < 0 ? "-Rp " : "Rp ") + formatted;
}

export function formatDate(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
