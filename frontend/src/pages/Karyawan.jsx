import React, { useEffect, useState } from "react";
import { Plus, UserCircle, Clock, CheckCircle2, Trash2, Edit2, FileText, Wallet, RotateCcw } from "lucide-react";
import api, { formatRupiah, formatDate, formatDateTime } from "@/lib/api";
import ResetModuleButton from "@/components/ResetModuleButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const initEmp = {
  name: "", nik: "", role: "", unit: "warung",
  salary_type: "monthly", base_salary: 0, overtime_rate: 0,
  bank_account: "", phone: "", active: true,
};

export default function Karyawan() {
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initEmp);
  const [payTarget, setPayTarget] = useState(null);
  const [payForm, setPayForm] = useState({ amount: 0, payment_method: "cash", notes: "" });
  const [bizUnits, setBizUnits] = useState([]);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const load = async () => {
    const [e, a, p] = await Promise.all([
      api.get("/employees"),
      api.get(`/attendance?month=${month}&year=${year}`),
      api.get(`/payroll?month=${month}&year=${year}`),
    ]);
    setEmployees(e.data); setAttendance(a.data); setPayroll(p.data);
  };
  useEffect(() => { load(); }, [month, year]);
  useEffect(() => {
    api.get("/business-units").then(({ data }) => {
      setBizUnits(data.filter((u) => u.active !== false).map((u) => ({ code: u.code, name: u.name })));
    }).catch(() => {});
  }, []);

  const save = async () => {
    if (!form.name || !form.role) return toast.error("Lengkapi nama dan posisi");
    try {
      if (editing) await api.put(`/employees/${editing.id}`, form);
      else await api.post("/employees", form);
      setShowForm(false); setEditing(null); setForm(initEmp); load();
      toast.success("Tersimpan");
    } catch (e) { toast.error("Gagal menyimpan"); }
  };

  const checkIn = async (emp_id) => {
    try {
      await api.post("/attendance", { employee_id: emp_id, type: "check_in" });
      load(); toast.success("Check-in dicatat");
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  const checkOut = async (emp_id) => {
    const ot = window.prompt("Jam lembur (kosongkan jika tidak lembur):", "0");
    if (ot === null) return;
    try {
      await api.post("/attendance", { employee_id: emp_id, type: "check_out", overtime_hours: parseFloat(ot) || 0 });
      load(); toast.success("Check-out dicatat");
    } catch (e) { toast.error("Gagal check-out"); }
  };

  const generatePayroll = async () => {
    if (!window.confirm(`Hitung gaji untuk ${month}/${year}? Jika sudah ada, akan mengembalikan data yang sudah dihitung.`)) return;
    try {
      await api.post("/payroll/generate", { month, year });
      load(); toast.success("Penggajian dihitung");
    } catch (e) { toast.error("Gagal hitung gaji"); }
  };

  const openPay = (p) => {
    setPayTarget(p);
    setPayForm({ amount: p.net_salary, payment_method: "cash", notes: "" });
  };

  const confirmPay = async () => {
    if (!payTarget) return;
    const amt = parseInt(payForm.amount) || 0;
    if (amt <= 0) return toast.error("Nominal harus > 0");
    try {
      const { data } = await api.post(`/payroll/${payTarget.id}/pay`, {
        amount: amt, payment_method: payForm.payment_method, notes: payForm.notes,
      });
      toast.success(`Gaji ${payTarget.employee_name} dibayar — Rp ${data.amount.toLocaleString("id-ID")} dicatat di pengeluaran`);
      setPayTarget(null); load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal");
    }
  };

  const unpay = async (id, name) => {
    if (!window.confirm(`Batalkan status BAYAR gaji ${name}? Pengeluaran terkait akan dihapus.`)) return;
    try {
      await api.post(`/payroll/${id}/unpay`);
      toast.success("Status dibatalkan, pengeluaran dihapus");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  const today = new Date().toISOString().slice(0, 10);
  const todayAttendance = attendance.filter((a) => a.date === today);
  const isCheckedIn = (emp_id) => todayAttendance.find((a) => a.employee_id === emp_id && !a.check_out);
  const hasCheckedOut = (emp_id) => todayAttendance.find((a) => a.employee_id === emp_id && a.check_out);

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Karyawan & HR</h1>
          <p className="text-sm text-gray-500 mt-0.5">{employees.length} karyawan · Periode {month}/{year}</p>
        </div>
        <div className="flex gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={String(m)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="w-24 font-mono" />
          <ResetModuleButton module="karyawan" label="Karyawan" />
          <Button data-testid="add-employee-btn" onClick={() => { setEditing(null); setForm(initEmp); setShowForm(true); }} className="bg-[#1a6b3c] hover:bg-[#14522d]">
            <Plus className="w-4 h-4 mr-1.5" /> Karyawan
          </Button>
        </div>
      </div>

      <Tabs defaultValue="emp" className="bg-white rounded-xl border border-gray-100">
        <TabsList className="bg-gray-50 m-1 overflow-x-auto">
          <TabsTrigger value="emp" data-testid="tab-employees">Daftar Karyawan</TabsTrigger>
          <TabsTrigger value="att" data-testid="tab-attendance">Absensi Hari Ini</TabsTrigger>
          <TabsTrigger value="pay" data-testid="tab-payroll">Penggajian</TabsTrigger>
        </TabsList>

        <TabsContent value="emp" className="p-2">
          <div className="divide-y divide-gray-100">
            {employees.length === 0 ? <div className="py-10 text-center text-gray-400 text-sm">Belum ada karyawan</div> :
              employees.map((e) => (
                <div key={e.id} data-testid={`emp-${e.id}`} className="flex items-center gap-3 py-3 px-2">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold">
                    {e.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{e.name}</div>
                    <div className="text-xs text-gray-500">{e.role} · {e.unit} · {e.salary_type}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm">{formatRupiah(e.base_salary)}</div>
                    <div className="text-xs text-gray-500">{e.phone || "—"}</div>
                  </div>
                  <button onClick={() => { setEditing(e); setForm({ ...initEmp, ...e }); setShowForm(true); }} className="p-1.5 text-gray-500 hover:text-[#1a6b3c]"><Edit2 className="w-4 h-4" /></button>
                </div>
              ))}
          </div>
        </TabsContent>

        <TabsContent value="att" className="p-2">
          <div className="divide-y divide-gray-100">
            {employees.length === 0 ? <div className="py-10 text-center text-gray-400 text-sm">Tambahkan karyawan dulu</div> :
              employees.filter((e) => e.active).map((e) => {
                const inAtt = isCheckedIn(e.id);
                const outAtt = hasCheckedOut(e.id);
                return (
                  <div key={e.id} className="flex items-center gap-3 py-3 px-2">
                    <UserCircle className="w-7 h-7 text-gray-400" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold">{e.name}</div>
                      <div className="text-xs text-gray-500">
                        {outAtt ? `Masuk ${formatDateTime(outAtt.check_in)} · Keluar ${formatDateTime(outAtt.check_out)}` :
                         inAtt ? `Masuk ${formatDateTime(inAtt.check_in)}` : "Belum check-in"}
                      </div>
                    </div>
                    {outAtt ? (
                      <Badge className="bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3 mr-1" /> Selesai</Badge>
                    ) : inAtt ? (
                      <Button size="sm" data-testid={`checkout-${e.id}`} onClick={() => checkOut(e.id)} className="bg-amber-500 hover:bg-amber-600">Check-Out</Button>
                    ) : (
                      <Button size="sm" data-testid={`checkin-${e.id}`} onClick={() => checkIn(e.id)} className="bg-[#1a6b3c] hover:bg-[#14522d]">Check-In</Button>
                    )}
                  </div>
                );
              })}
          </div>
        </TabsContent>

        <TabsContent value="pay" className="p-4 space-y-3">
          <Button data-testid="generate-payroll-btn" onClick={generatePayroll} className="bg-[#f4a228] hover:bg-[#d98b1a]" disabled={employees.length === 0}>
            <FileText className="w-4 h-4 mr-1.5" /> Hitung Gaji {month}/{year}
          </Button>
          {payroll.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">Belum ada penggajian untuk periode ini. Klik "Hitung Gaji" untuk memulai.</div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Karyawan</th>
                    <th className="px-3 py-2 text-right">Hari</th>
                    <th className="px-3 py-2 text-right">Lembur</th>
                    <th className="px-3 py-2 text-right">Bruto</th>
                    <th className="px-3 py-2 text-right">PPh21</th>
                    <th className="px-3 py-2 text-right">Bersih</th>
                    <th className="px-3 py-2 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payroll.map((p) => (
                    <tr key={p.id} data-testid={`payroll-${p.id}`}>
                      <td className="px-3 py-2">{p.employee_name}</td>
                      <td className="px-3 py-2 text-right font-mono">{p.days_worked}</td>
                      <td className="px-3 py-2 text-right font-mono">{p.overtime_hours}j</td>
                      <td className="px-3 py-2 text-right font-mono">{formatRupiah(p.gross_salary)}</td>
                      <td className="px-3 py-2 text-right font-mono text-red-600">-{formatRupiah(p.pph21)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-[#1a6b3c]">{formatRupiah(p.net_salary)}</td>
                      <td className="px-3 py-2 text-right">
                        {p.paid ? (
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Lunas {p.paid_amount && p.paid_amount !== p.net_salary ? `(${formatRupiah(p.paid_amount)})` : ""}
                            </Badge>
                            {p.payment_method && <span className="text-[10px] uppercase font-bold text-gray-500">{p.payment_method}</span>}
                            <button onClick={() => unpay(p.id, p.employee_name)} data-testid={`unpay-${p.id}`} title="Batalkan pembayaran" className="text-gray-400 hover:text-red-600">
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => openPay(p)} data-testid={`pay-${p.id}`} className="inline-flex items-center gap-1 text-xs text-white bg-[#1a6b3c] hover:bg-[#14522d] px-2.5 py-1.5 rounded font-semibold">
                            <Wallet className="w-3.5 h-3.5" /> Bayar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Karyawan" : "Karyawan Baru"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Nama Lengkap</Label><Input data-testid="emp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>NIK / ID</Label><Input value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value })} /></div>
            <div><Label>No. HP</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Posisi/Jabatan</Label><Input data-testid="emp-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Koki, Pelayan, Penjaga Kebun" /></div>
            <div>
              <Label>Unit</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(bizUnits.length ? bizUnits : ["warung", "anggur", "pupuk", "pembibitan", "gudang"].map(c => ({code:c, name:c}))).map((u) => <SelectItem key={u.code} value={u.code}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipe Gaji</Label>
              <Select value={form.salary_type} onValueChange={(v) => setForm({ ...form, salary_type: v })}>
                <SelectTrigger data-testid="emp-salary-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Bulanan</SelectItem>
                  <SelectItem value="weekly">Mingguan</SelectItem>
                  <SelectItem value="daily">Harian</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Gaji Pokok (Rp)</Label><Input data-testid="emp-salary" type="number" value={form.base_salary || ""} onChange={(e) => setForm({ ...form, base_salary: parseInt(e.target.value) || 0 })} /></div>
            <div><Label>Tarif Lembur/jam</Label><Input type="number" value={form.overtime_rate || ""} onChange={(e) => setForm({ ...form, overtime_rate: parseInt(e.target.value) || 0 })} /></div>
            <div className="col-span-2"><Label>Rekening Bank</Label><Input value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} placeholder="BCA 1234567890" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
            <Button onClick={save} data-testid="save-emp-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay Payroll Dialog */}
      <Dialog open={!!payTarget} onOpenChange={() => setPayTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wallet className="w-5 h-5 text-[#1a6b3c]" /> Bayar Gaji {payTarget?.employee_name}</DialogTitle>
          </DialogHeader>
          {payTarget && (
            <div className="space-y-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs">
                <div className="flex justify-between"><span className="text-gray-600">Periode</span><span className="font-mono">{String(payTarget.month).padStart(2,"0")}/{payTarget.year}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Hari Kerja</span><span className="font-mono">{payTarget.days_worked} hari</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Bruto</span><span className="font-mono">{formatRupiah(payTarget.gross_salary)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">PPh21</span><span className="font-mono text-red-600">-{formatRupiah(payTarget.pph21)}</span></div>
                <div className="flex justify-between border-t border-emerald-200 mt-1 pt-1 font-semibold"><span>Net Salary</span><span className="font-mono text-[#1a6b3c]">{formatRupiah(payTarget.net_salary)}</span></div>
              </div>
              <div>
                <Label>Nominal Dibayar (Rp)</Label>
                <Input data-testid="pay-amount-input" type="number" value={payForm.amount || ""}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
                <p className="text-[11px] text-gray-500 mt-1">Bisa diisi custom (mis. cicilan, kasbon, dipotong, dll). Default = Net Salary.</p>
              </div>
              <div>
                <Label>Metode Pembayaran</Label>
                <Select value={payForm.payment_method} onValueChange={(v) => setPayForm({ ...payForm, payment_method: v })}>
                  <SelectTrigger data-testid="pay-method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">💵 Tunai</SelectItem>
                    <SelectItem value="transfer">🏦 Transfer Bank</SelectItem>
                    <SelectItem value="qris">📱 QRIS / E-Wallet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Catatan (opsional)</Label>
                <Input data-testid="pay-notes" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} placeholder="Mis. cicilan 1 dari 2, dipotong kasbon, dll" />
              </div>
              <div className="text-[11px] text-gray-500 bg-gray-50 rounded p-2">
                Setelah simpan: gaji ditandai LUNAS, otomatis dicatat di Pengeluaran (kategori "Gaji Karyawan") dan journal Kas berkurang.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>Batal</Button>
            <Button data-testid="confirm-pay-btn" onClick={confirmPay} className="bg-[#1a6b3c] hover:bg-[#14522d]">
              <Wallet className="w-4 h-4 mr-1.5" /> Bayar Sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
