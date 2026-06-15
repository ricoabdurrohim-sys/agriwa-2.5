import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Jangan biarkan 1 menu blank total. Log tetap masuk console untuk debugging.
    console.error("AgriWarung UI error", error, info);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="max-w-3xl mx-auto my-8 bg-white border border-red-100 rounded-2xl shadow-sm p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: "Poppins" }}>Menu ini gagal ditampilkan</h2>
            <p className="text-sm text-gray-600 mt-1 leading-relaxed">
              Aplikasi tidak dibuat blank. Coba muat ulang menu ini. Jika masih muncul, kirim pesan error di bawah agar bisa langsung diperbaiki.
            </p>
            <pre className="mt-3 max-h-40 overflow-auto bg-gray-950 text-red-100 rounded-xl p-3 text-xs whitespace-pre-wrap">
              {String(this.state.error?.message || this.state.error || "Unknown error")}
            </pre>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button onClick={this.reset} className="bg-[#1a6b3c] hover:bg-[#14522d]"><RefreshCw className="w-4 h-4 mr-1.5" /> Coba Lagi</Button>
              <Button variant="outline" onClick={() => { window.location.href = "/"; }}><Home className="w-4 h-4 mr-1.5" /> Dashboard</Button>
              <Button variant="outline" onClick={() => window.location.reload()}>Hard Reload Halaman</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
