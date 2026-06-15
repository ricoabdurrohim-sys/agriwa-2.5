import React, { useState } from "react";
import { Trash2, ShieldAlert, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";

/**
 * Reusable button to wipe all data of one module (super_admin only).
 * Props:
 *  - module: backend module key (e.g. "inventori", "pembelian", ...)
 *  - label:  human-readable module name (e.g. "Inventori")
 *  - onDone: optional callback after successful reset
 *  - variant: "icon" (default) renders red Trash icon button; "full" renders text button
 */
export default function ResetModuleButton({ module, label, onDone, variant = "icon" }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  if (user?.role !== "super_admin") return null;

  const doReset = async () => {
    if (confirm !== "RESET") return toast.error('Ketik "RESET" untuk konfirmasi');
    setLoading(true);
    try {
      const { data } = await api.post(`/system/reset-module/${module}`);
      toast.success(`${data.total_deleted} data ${label} terhapus`);
      setOpen(false); setConfirm("");
      if (onDone) onDone();
      else setTimeout(() => window.location.reload(), 800);
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal reset"); }
    finally { setLoading(false); }
  };

  return (
    <>
      {variant === "full" ? (
        <Button onClick={() => setOpen(true)} variant="outline" size="sm"
          data-testid={`reset-module-${module}-btn`}
          className="border-red-200 text-red-600 hover:bg-red-50">
          <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Reset Data
        </Button>
      ) : (
        <button onClick={() => setOpen(true)} title={`Reset semua data ${label}`}
          data-testid={`reset-module-${module}-btn`}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition">
          <Trash2 className="w-4 h-4" />
        </button>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirm(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <ShieldAlert className="w-5 h-5" /> Reset Data {label}
            </DialogTitle>
            <DialogDescription>
              Tindakan ini <strong>tidak bisa dibatalkan</strong>. Semua data {label} akan dihapus permanen.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Ketik <code className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded">RESET</code> untuk konfirmasi</Label>
            <Input data-testid={`reset-module-${module}-confirm-input`}
              value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="RESET" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button data-testid={`reset-module-${module}-confirm-btn`}
              onClick={doReset} disabled={confirm !== "RESET" || loading}
              className="bg-red-600 hover:bg-red-700">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : `Hapus Semua ${label}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
