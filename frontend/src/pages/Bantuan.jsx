import React, { useEffect, useMemo, useState } from "react";
import { HelpCircle, BookOpen, Video, MessageCircle, Plus, Edit2, Trash2, ExternalLink, Save } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

const init = { type: "GUIDE", title: "", content: "", youtube_url: "", wa_url: "", active: true, sort_order: 0 };
const TYPES = {
  GUIDE: { label: "Panduan", icon: BookOpen, color: "text-emerald-700", bg: "bg-emerald-50" },
  VIDEO: { label: "Video Tutorial", icon: Video, color: "text-blue-700", bg: "bg-blue-50" },
  FAQ: { label: "FAQ", icon: HelpCircle, color: "text-amber-700", bg: "bg-amber-50" },
  SUPPORT: { label: "Dukungan", icon: MessageCircle, color: "text-purple-700", bg: "bg-purple-50" },
};

export default function Bantuan() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [edit, setEdit] = useState(null);

  const load = async () => {
    const { data } = await api.get("/help-contents");
    setItems(data);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => items.filter((i) => filter === "ALL" || i.type === filter), [items, filter]);
  const groupedCounts = useMemo(() => Object.keys(TYPES).reduce((acc, k) => ({ ...acc, [k]: items.filter((i) => i.type === k).length }), {}), [items]);

  const save = async () => {
    if (!edit?.title) return toast.error("Judul wajib diisi");
    try {
      if (edit.id) await api.put(`/help-contents/${edit.id}`, edit);
      else await api.post("/help-contents", edit);
      toast.success("Konten bantuan disimpan");
      setEdit(null); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal menyimpan"); }
  };

  const remove = async (it) => {
    if (!window.confirm(`Hapus konten bantuan \"${it.title}\"?`)) return;
    await api.delete(`/help-contents/${it.id}`);
    toast.success("Dihapus"); load();
  };

  const openLink = (url) => {
    if (!url) return;
    let u = url;
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    window.open(u, "_blank");
  };

  return (
    <div className="space-y-5 fade-in max-w-5xl">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Tutorial & Bantuan</h1>
          <p className="text-sm text-gray-500 mt-0.5">CMS mini: tambah panduan, link video YouTube, FAQ, dan kontak WA Super Admin</p>
        </div>
        <Button data-testid="add-help-btn" onClick={() => setEdit({ ...init, sort_order: items.length + 1 })} className="bg-[#1a6b3c] hover:bg-[#14522d]">
          <Plus className="w-4 h-4 mr-1.5" /> Tambah Konten
        </Button>
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        {Object.entries(TYPES).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button key={key} onClick={() => setFilter(key)} className={`text-left rounded-xl border p-4 transition ${filter === key ? "border-[#1a6b3c] bg-emerald-50" : "border-gray-100 bg-white hover:border-gray-200"}`}>
              <div className={`w-10 h-10 rounded-lg ${cfg.bg} flex items-center justify-center mb-3`}><Icon className={`w-5 h-5 ${cfg.color}`} /></div>
              <div className="font-semibold text-gray-900">{cfg.label}</div>
              <div className="text-sm text-gray-500 mt-0.5">{groupedCounts[key] || 0} konten</div>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button size="sm" variant={filter === "ALL" ? "default" : "outline"} onClick={() => setFilter("ALL")}>Semua</Button>
        {Object.entries(TYPES).map(([key, cfg]) => <Button key={key} size="sm" variant={filter === key ? "default" : "outline"} onClick={() => setFilter(key)}>{cfg.label}</Button>)}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">Belum ada konten bantuan</div>
        ) : filtered.map((it) => {
          const cfg = TYPES[it.type] || TYPES.GUIDE;
          const Icon = cfg.icon;
          return (
            <div key={it.id} data-testid={`help-row-${it.id}`} className={`p-4 flex items-start gap-3 ${it.active === false ? "opacity-60" : ""}`}>
              <div className={`p-2 rounded-lg ${cfg.bg} shrink-0`}><Icon className={`w-5 h-5 ${cfg.color}`} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-gray-900">{it.title}</h2>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-bold">{cfg.label}</span>
                  {it.active === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">NONAKTIF</span>}
                </div>
                {it.content && <p className="text-sm text-gray-600 mt-1 whitespace-pre-line leading-relaxed">{it.content}</p>}
                <div className="flex flex-wrap gap-2 mt-3">
                  {it.youtube_url && <Button size="sm" variant="outline" onClick={() => openLink(it.youtube_url)}><Video className="w-3.5 h-3.5 mr-1" /> YouTube <ExternalLink className="w-3 h-3 ml-1" /></Button>}
                  {it.wa_url && <Button size="sm" variant="outline" onClick={() => openLink(it.wa_url)}><MessageCircle className="w-3.5 h-3.5 mr-1" /> WhatsApp <ExternalLink className="w-3 h-3 ml-1" /></Button>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => setEdit({ ...init, ...it })} className="p-1.5 text-gray-500 hover:text-[#1a6b3c]" title="Edit"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => remove(it)} className="p-1.5 text-gray-500 hover:text-red-600" title="Hapus"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{edit?.id ? "Edit Konten Bantuan" : "Tambah Konten Bantuan"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Tipe</Label>
                  <Select value={edit.type} onValueChange={(v) => setEdit({ ...edit, type: v })}>
                    <SelectTrigger data-testid="help-type-select"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Urutan</Label>
                  <Input type="number" value={edit.sort_order || 0} onChange={(e) => setEdit({ ...edit, sort_order: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div><Label>Judul</Label><Input data-testid="help-title-input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
              <div><Label>Isi Panduan / FAQ</Label><Textarea data-testid="help-content-input" rows={6} value={edit.content || ""} onChange={(e) => setEdit({ ...edit, content: e.target.value })} /></div>
              <div><Label>Link YouTube</Label><Input data-testid="help-youtube-input" value={edit.youtube_url || ""} onChange={(e) => setEdit({ ...edit, youtube_url: e.target.value })} placeholder="https://youtube.com/..." /></div>
              <div><Label>Link WhatsApp Support</Label><Input data-testid="help-wa-input" value={edit.wa_url || ""} onChange={(e) => setEdit({ ...edit, wa_url: e.target.value })} placeholder="https://wa.me/628..." /></div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} className="w-4 h-4 rounded accent-[#1a6b3c]" /> Aktif
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Batal</Button>
            <Button onClick={save} data-testid="save-help-btn" className="bg-[#1a6b3c] hover:bg-[#14522d]"><Save className="w-4 h-4 mr-1" /> Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
