import axios from "axios";

const FALLBACK_BACKEND_URL = "https://rikoabd-agriwarung-2-5.hf.space";

function normalizeBackendUrl(rawValue) {
  let value = (rawValue || "").trim();

  // Vercel env can be missing on a deployment preview, or accidentally set to /api.
  // Keep the app usable by falling back to the active HF Space, then normalize it.
  if (!value || value === "undefined" || value === "null") {
    value = FALLBACK_BACKEND_URL;
  }

  value = value.replace(/\/+$/, "");

  // REACT_APP_BACKEND_URL must be the backend origin only.
  // If it was set to https://...hf.space/api, remove the duplicate /api suffix.
  if (value.endsWith("/api")) {
    value = value.slice(0, -4);
  }

  return value || FALLBACK_BACKEND_URL;
}

export const BACKEND_URL = normalizeBackendUrl(process.env.REACT_APP_BACKEND_URL);
export const API_URL = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,  // send httpOnly session_token cookie for Google Auth
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("aw_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

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
