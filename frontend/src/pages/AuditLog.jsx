import React, { useEffect, useState } from "react";
import { Activity, Calendar, RefreshCw, Eye, ExternalLink } from "lucide-react";
import api, { formatDateTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";

const ACTION_COLOR = {
  create: "bg-emerald-100 text-emerald-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-red-100 text-red-700",
};

export default function AuditLog() {
  const nav = useNavigate();
  const [logs, setLogs] = useState([]);
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const params = [];
    if (entityFilter !== "all") params.push(`entity_type=${entityFilter}`);
    if (actionFilter !== "all") params.push(`action=${actionFilter}`);
    const { data } = await api.get(`/audit-logs${params.length ? "?" + params.join("&") : ""}`);
    setLogs(data);
    setLoading(false);
  };
  useEffect(() => { load(); }, [entityFilter, actionFilter]);

  const openDetail = async (log) => {
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/audit-logs/${log.id}/detail`);
      setDetail(data);
    } catch (err) {
      setDetail({ log, related: null, shortcut: null, error: err?.response?.data?.detail || "Gagal memuat detail" });
    } finally {
      setDetailLoading(false);
    }
  };

  const goShortcut = () => {
    if (detail?.shortcut?.path) {
      const p = detail.shortcut.path;
      setDetail(null);
      nav(p);
    }
  };


  const entityTypes = Array.from(new Set(logs.map((l) => l.entity_type))).filter(Boolean);
  const actions = Array.from(new Set(logs.map((l) => l.action))).filter(Boolean);

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Audit Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">Riwayat aktivitas pengguna dalam sistem ({logs.length} record)</p>
        </div>
        <Button data-testid="refresh-audit-btn" onClick={load} variant="outline" size="sm">
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-3 grid grid-cols-2 gap-2">
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger data-testid="entity-filter"><SelectValue placeholder="Filter Entity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Entity</SelectItem>
            {["transaction", "member", "user", "inventory", "promo", "expense"].map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger data-testid="action-filter"><SelectValue placeholder="Filter Action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Action</SelectItem>
            <SelectItem value="create">Create</SelectItem>
            <SelectItem value="update">Update</SelectItem>
            <SelectItem value="delete">Delete</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100">
        {logs.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            Belum ada aktivitas tercatat
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {logs.map((l) => (
              <div key={l.id} data-testid={`log-${l.id}`} className="flex items-start gap-3 p-3 hover:bg-gray-50">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {l.user_name?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="font-semibold">{l.user_name || "—"}</span>
                    <Badge className={ACTION_COLOR[l.action] || "bg-gray-100"}>{l.action}</Badge>
                    <span className="text-gray-500">{l.entity_type}</span>
                    {l.entity_id && <span className="text-[11px] text-gray-400 font-mono">#{String(l.entity_id).slice(0, 8)}</span>}
                  </div>
                  {l.payload && Object.keys(l.payload).length > 0 && (
                    <div className="text-xs text-gray-600 mt-1 font-mono">
                      {Object.entries(l.payload).slice(0, 3).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ")}
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {formatDateTime(l.timestamp)}
                    {l.user_role && <span>· {l.user_role}</span>}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => openDetail(l)} disabled={detailLoading} data-testid={`audit-detail-${l.id}`}>
                  <Eye className="w-3.5 h-3.5 mr-1" /> Detail
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Detail Audit Log</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              {detail.error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{detail.error}</div>}
              <div className="grid sm:grid-cols-2 gap-2">
                <InfoBox label="User" value={`${detail.log?.user_name || "—"} (${detail.log?.user_role || "—"})`} />
                <InfoBox label="Waktu" value={formatDateTime(detail.log?.timestamp)} />
                <InfoBox label="Aksi" value={detail.log?.action} />
                <InfoBox label="Entity" value={`${detail.log?.entity_type || "—"} · ${detail.log?.entity_id || "—"}`} />
              </div>
              <div>
                <div className="font-semibold mb-1">Payload Audit</div>
                <pre className="bg-gray-950 text-gray-100 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap">{JSON.stringify(detail.log?.payload || {}, null, 2)}</pre>
              </div>
              <div>
                <div className="font-semibold mb-1">Data Terkait Saat Ini</div>
                {detail.related ? <pre className="bg-gray-50 border rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap">{JSON.stringify(detail.related, null, 2)}</pre> : <div className="text-xs text-gray-500 bg-gray-50 border rounded-lg p-3">Data terkait tidak ditemukan atau sudah dihapus. Payload audit tetap bisa dipakai untuk melacak.</div>}
              </div>
            </div>
          )}
          <DialogFooter>
            {detail?.shortcut && <Button variant="outline" onClick={goShortcut}><ExternalLink className="w-4 h-4 mr-1" />{detail.shortcut.label}</Button>}
            <Button onClick={() => setDetail(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoBox({ label, value }) {
  return <div className="bg-gray-50 rounded-lg border p-2"><div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">{label}</div><div className="font-medium break-all">{value || "—"}</div></div>;
}
