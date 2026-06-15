import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Grape, Loader2, MessageCircle, KeyRound } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import api from "@/lib/api";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [fpStep, setFpStep] = useState(1); // 1 phone, 2 otp + new password
  const [fpPhone, setFpPhone] = useState("");
  const [fpOtp, setFpOtp] = useState("");
  const [fpNewPw, setFpNewPw] = useState("");
  const [fpLoading, setFpLoading] = useState(false);
  const [manualWaUrl, setManualWaUrl] = useState("");

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Selamat datang!");
      nav("/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Gagal masuk");
    } finally { setLoading(false); }
  };

  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  const onGoogleLogin = () => {
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const requestOtp = async () => {
    if (!fpPhone.trim()) return toast.error("Masukkan nomor WhatsApp");
    setFpLoading(true);
    setManualWaUrl("");
    try {
      const { data } = await api.post("/auth/request-wa-otp", { phone: fpPhone });
      const waUrl = data?.wa?.wa_url || "";
      if (waUrl) setManualWaUrl(waUrl);
      toast.success(data.message || "Jika nomor terdaftar, OTP dikirim ke WhatsApp");
      setFpStep(2);
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal meminta OTP"); }
    finally { setFpLoading(false); }
  };

  const doResetPassword = async () => {
    if (!fpPhone || !fpOtp || !fpNewPw) return toast.error("Nomor WA, OTP, dan password baru wajib");
    if (fpNewPw.length < 6) return toast.error("Password baru minimal 6 karakter");
    setFpLoading(true);
    try {
      await api.post("/auth/reset-password-wa", { phone: fpPhone, otp: fpOtp, new_password: fpNewPw });
      toast.success("Password berhasil di-reset. Silakan login.");
      setShowForgot(false); setFpStep(1);
      setFpPhone(""); setFpOtp(""); setFpNewPw(""); setManualWaUrl("");
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal reset password"); }
    finally { setFpLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-amber-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1a6b3c] text-white mb-3 shadow-md">
            <Grape className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: "Poppins" }}>AgriWarung</h1>
          <p className="text-sm text-gray-500 mt-1">Aplikasi manajemen multi-bisnis</p>
        </div>

        <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div>
            <Label htmlFor="email" className="text-xs text-gray-600">Email</Label>
            <Input id="email" data-testid="login-email-input" type="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-11" placeholder="nama@email.com" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs text-gray-600">Password</Label>
              <button type="button" data-testid="forgot-password-link"
                onClick={() => { setShowForgot(true); setFpStep(1); }}
                className="text-xs text-[#1a6b3c] hover:underline font-medium">
                Lupa password?
              </button>
            </div>
            <Input id="password" data-testid="login-password-input" type="password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 h-11" placeholder="••••••••" />
          </div>
          <Button type="submit" data-testid="login-submit-btn" disabled={loading}
            className="w-full h-11 bg-[#1a6b3c] hover:bg-[#14522d] text-white font-semibold">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Masuk"}
          </Button>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
            <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-gray-400">atau</span></div>
          </div>

          <Button type="button" data-testid="google-login-btn" onClick={onGoogleLogin}
            variant="outline" className="w-full h-11 border-gray-300 hover:bg-gray-50">
            Lanjutkan dengan Google
          </Button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          v2.5 · Reset password aman via WhatsApp OTP + Super Admin
        </p>
      </div>

      <Dialog open={showForgot} onOpenChange={(o) => { setShowForgot(o); if (!o) { setFpStep(1); setManualWaUrl(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5 text-amber-600" /> Reset Password WhatsApp OTP</DialogTitle>
            <DialogDescription>
              {fpStep === 1
                ? "Masukkan nomor WhatsApp yang terdaftar pada user Anda. Sistem tidak lagi menampilkan token reset di layar."
                : "Masukkan OTP yang dikirim ke WhatsApp dan password baru."}
            </DialogDescription>
          </DialogHeader>

          {fpStep === 1 ? (
            <div className="space-y-3">
              <div>
                <Label>No. WhatsApp</Label>
                <Input data-testid="forgot-phone-input" value={fpPhone}
                  onChange={(e) => setFpPhone(e.target.value)} placeholder="08xxxxxxxxxx" className="font-mono" />
              </div>
              <div className="text-xs text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
                Pastikan Super Admin sudah mengisi nomor WhatsApp di menu Manajemen Pengguna. Jika nomor tidak terdaftar, hubungi Super Admin untuk reset manual.
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowForgot(false)}>Batal</Button>
                <Button data-testid="forgot-request-btn" onClick={requestOtp} disabled={fpLoading || !fpPhone}
                  className="bg-[#1a6b3c] hover:bg-[#14522d]">
                  {fpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><MessageCircle className="w-4 h-4 mr-1.5" /> Kirim OTP WA</>}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm">
                <div className="text-emerald-800 font-medium">OTP dikirim ke WhatsApp jika nomor terdaftar.</div>
                <div className="text-xs text-emerald-700 mt-1">OTP berlaku 10 menit dan hanya bisa dipakai sekali.</div>
                {manualWaUrl && (
                  <button onClick={() => window.open(manualWaUrl, "_blank")} className="text-xs text-[#1a6b3c] font-semibold underline mt-2">
                    Buka WhatsApp manual (mode tanpa WA API)
                  </button>
                )}
              </div>
              <div>
                <Label>OTP</Label>
                <Input data-testid="forgot-otp-input" value={fpOtp} onChange={(e) => setFpOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 digit" className="font-mono tracking-widest" />
              </div>
              <div>
                <Label>Password Baru (min 6 karakter)</Label>
                <Input data-testid="forgot-newpw-input" type="password" value={fpNewPw} onChange={(e) => setFpNewPw(e.target.value)} />
              </div>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setFpStep(1)}>← Kembali</Button>
                <Button data-testid="forgot-submit-btn" onClick={doResetPassword} disabled={fpLoading} className="bg-amber-500 hover:bg-amber-600">
                  {fpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reset Password"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
