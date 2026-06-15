import React, { useEffect, useState } from "react";
import { Plus, UserPlus, Edit2, Trash2, KeyRound, Shield } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const ROLES = [
  { value: "super_admin", label: "Super Admin", color: "bg-red-100 text-red-700" },
  { value: "investor", label: "Investor", color: "bg-purple-100 text-purple-700" },
  { value: "manager", label: "Manager", color: "bg-blue-100 text-blue-700" },
  { value: "kasir", label: "Kasir", color: "bg-emerald-100 text-emerald-700" },
  { value: "staff_gudang", label: "Staff Gudang", color: "bg-amber-100 text-amber-700" },
  { value: "koki", label: "Koki / Dapur", color: "bg-orange-100 text-orange-700" },
];

const initNew = { name: "", email: "", phone: "", password: "", role: "kasir" };

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [showReset, setShowReset] = useState(null);
  const [newForm, setNewForm] = useState(initNew);
  const [editForm, setEditForm] = useState({ name: "", role: "", phone: "", active: true });
  const [newPassword, setNewPassword] = useState("");

  const load = async () => { const { data } = await api.get("/users"); setUsers(data); };
  useEffect(() => { load(); }, []);

  const createUser = async () => {
    if (!newForm.name || !newForm.email || !newForm.password) return toast.error("Lengkapi semua field");
    if (newForm.password.length < 6) return toast.error("Password minimal 6 karakter");
    try {
      await api.post("/users", newForm);
      toast.success("User dibuat");
      setShowNew(false); setNewForm(initNew); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  const saveEdit = async () => {
    try {
      await api.put(`/users/${showEdit.id}`, editForm);
      toast.success("Tersimpan"); setShowEdit(null); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  const doReset = async () => {
    if (newPassword.length < 6) return toast.error("Password minimal 6 karakter");
    try {
      await api.post(`/users/${showReset.id}/reset-password`, { new_password: newPassword });
      toast.success(`Password ${showReset.name} direset`);
      setShowReset(null); setNewPassword("");
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  const deleteUser = async (u) => {
    if (!window.confirm(`Hapus user ${u.name}?`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast.success("User dihapus"); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  const isSuperAdmin = currentUser?.role === "super_admin";
  const roleConfig = (r) => ROLES.find(x => x.value === r) || ROLES[3];

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Manajemen Pengguna</h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} user · {users.filter(u => u.active !== false).length} aktif</p>
        </div>
        {isSuperAdmin && (
          <Button data-testid="add-user-btn" onClick={() => setShowNew(true)} className="bg-[#1a6b3c] hover:bg-[#14522d]">
            <UserPlus className="w-4 h-4 mr-1.5" /> User Baru
          </Button>
        )}
      </div>

      {!isSuperAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
          Hanya Super Admin yang dapat mengelola pengguna. Anda hanya bisa melihat daftar.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-4 py-3 text-left">Nama</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">WhatsApp</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-center">Status</th>
              {isSuperAdmin && <th className="px-4 py-3 text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => {
              const rc = roleConfig(u.role);
              return (
                <tr key={u.id} data-testid={`user-row-${u.id}`}>
                  <td className="px-4 py-3 font-medium flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center text-sm font-semibold">{u.name?.charAt(0)?.toUpperCase()}</div>
                    {u.name}
                    {u.id === currentUser?.id && <Badge variant="outline" className="ml-1">Anda</Badge>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{u.email}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{u.phone || "—"}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rc.color}`}>{rc.label}</span></td>
                  <td className="px-4 py-3 text-center">
                    {u.active === false ? <Badge variant="secondary">Nonaktif</Badge> : <Badge className="bg-emerald-100 text-emerald-700">Aktif</Badge>}
                  </td>
                  {isSuperAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => { setShowEdit(u); setEditForm({ name: u.name, role: u.role, phone: u.phone || "", active: u.active !== false }); }} data-testid={`edit-user-${u.id}`} className="p-1.5 text-gray-500 hover:text-[#1a6b3c]" title="Edit"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => setShowReset(u)} data-testid={`reset-pw-${u.id}`} className="p-1.5 text-gray-500 hover:text-amber-600" title="Reset password"><KeyRound className="w-4 h-4" /></button>
                        {u.id !== currentUser?.id && <button onClick={() => deleteUser(u)} className="p-1.5 text-gray-500 hover:text-red-600" title="Hapus"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* New User Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>User Baru</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nama Lengkap</Label><Input data-testid="new-user-name" value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} /></div>
            <div><Label>Email</Label><Input data-testid="new-user-email" type="email" value={newForm.email} onChange={(e) => setNewForm({ ...newForm, email: e.target.value.toLowerCase() })} /></div>
            <div><Label>No. WhatsApp untuk OTP</Label><Input data-testid="new-user-phone" value={newForm.phone} onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })} placeholder="08xxxxxxxxxx" className="font-mono" /></div>
            <div><Label>Password (min 6)</Label><Input data-testid="new-user-password" type="password" value={newForm.password} onChange={(e) => setNewForm({ ...newForm, password: e.target.value })} /></div>
            <div>
              <Label>Role</Label>
              <Select value={newForm.role} onValueChange={(v) => setNewForm({ ...newForm, role: v })}>
                <SelectTrigger data-testid="new-user-role"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Batal</Button>
            <Button onClick={createUser} data-testid="save-new-user-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Buat User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!showEdit} onOpenChange={(o) => !o && setShowEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User: {showEdit?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nama</Label><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
            <div><Label>No. WhatsApp untuk OTP</Label><Input value={editForm.phone || ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="08xxxxxxxxxx" className="font-mono" /></div>
            <div>
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
              <div>
                <div className="text-sm font-medium">Status Aktif</div>
                <div className="text-xs text-gray-500">Nonaktifkan user untuk mencegah login</div>
              </div>
              <Switch checked={editForm.active} onCheckedChange={(c) => setEditForm({ ...editForm, active: c })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(null)}>Batal</Button>
            <Button onClick={saveEdit} data-testid="save-edit-user-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!showReset} onOpenChange={(o) => !o && setShowReset(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset Password: {showReset?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
              <Shield className="w-4 h-4 mt-0.5 shrink-0" />
              <div>Password lama akan langsung diganti oleh Super Admin. Ini adalah jalur aman cadangan jika user tidak bisa menerima OTP WhatsApp.</div>
            </div>
            <div><Label>Password Baru (min 6 karakter)</Label><Input data-testid="reset-pw-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReset(null)}>Batal</Button>
            <Button onClick={doReset} data-testid="confirm-reset-btn" className="bg-amber-500 hover:bg-amber-600">Reset Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
