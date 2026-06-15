import React, { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    (async () => {
      try {
        const hash = location.hash || window.location.hash;
        const m = /session_id=([^&]+)/.exec(hash);
        if (!m) {
          toast.error("Token sesi tidak ditemukan");
          navigate("/login", { replace: true });
          return;
        }
        const session_id = decodeURIComponent(m[1]);
        const { data } = await api.post("/auth/google-session", { session_id });
        if (data?.token) localStorage.setItem("aw_token", data.token);
        if (data?.user && setUser) setUser(data.user);
        // Clean URL fragment
        window.history.replaceState({}, "", "/");
        toast.success(`Selamat datang, ${data?.user?.name || "User"}!`);
        navigate("/", { replace: true });
      } catch (e) {
        toast.error(e?.response?.data?.detail || "Login Google gagal");
        navigate("/login", { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-amber-50">
      <div className="text-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#1a6b3c] mx-auto mb-3" />
        <div className="text-gray-700 font-medium">Memproses login Google...</div>
        <div className="text-xs text-gray-400 mt-1">Mohon tunggu sebentar</div>
      </div>
    </div>
  );
}
