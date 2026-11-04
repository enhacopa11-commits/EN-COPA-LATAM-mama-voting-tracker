"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AuditEntry = { id: string; submission_id: string; previous_status: string; new_status: string; reason: string | null; admin_actor: string; created_at: string };
type Submission = {
  id: string; campaign_name: string; country_code: string; storage_path: string;
  original_filename: string | null; mime_type: string; size_bytes: number;
  status: "counted" | "rejected"; created_at: string; image_url: string | null;
  duplicate_flag: boolean; duplicate_match_ids: string[]; perceptual_hash: string | null;
  rejection_reason: string | null; rejected_at: string | null; rejected_by: string | null;
  ocr_text: string | null;
  participants: { x_username: string } | { x_username: string }[] | null;
};
const statusLabels: Record<Submission["status"], string> = { counted: "COUNTED · 1 VOTE", rejected: "REJECTED" };

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [adminName, setAdminName] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [items, setItems] = useState<Submission[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState("duplicates");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/submissions", { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { setAuthenticated(false); return; }
      if (!response.ok) throw new Error(data.error || "Could not load submissions.");
      setItems(data.submissions || []); setAudit(data.audit || []); setAuthenticated(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load submissions."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "duplicates") return items.filter(item => item.duplicate_flag);
    return items.filter(item => item.status === filter);
  }, [items, filter]);

  async function login(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const response = await fetch("/api/admin/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, adminName }),
    });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Could not sign in."); return; }
    setPassword(""); await load();
  }

  async function updateStatus(id: string, status: Submission["status"]) {
    const reason = status === "rejected" ? window.prompt("Why is this image being rejected?") : "";
    if (status === "rejected" && (!reason || reason.trim().length < 3)) return;
    setBusyId(id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/submissions", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update status.");
      setItems(current => current.map(item => item.id === id ? {
        ...item, status, rejection_reason: status === "rejected" ? reason : null,
        rejected_by: status === "rejected" ? adminName : null,
      } : item));
      setNotice(status === "rejected" ? "Image rejected. Exactly one vote was removed." : "Image counted again. One vote was restored.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update status."); }
    finally { setBusyId(""); }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false); setItems([]);
  }

  const counts = {
    counted: items.filter(x => x.status === "counted").length,
    duplicates: items.filter(x => x.duplicate_flag).length,
    rejected: items.filter(x => x.status === "rejected").length,
  };

  return <main className="min-h-screen bg-[#0b0f19] px-4 py-8 text-white sm:px-8">
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-[#34445b] pb-6">
        <div><p className="text-xs font-bold tracking-[.25em] text-emerald-400">EN-COPA LATAM</p><h1 className="mt-2 text-3xl font-bold">Voting proof · Admin</h1><p className="mt-1 text-sm text-slate-400">Every image counts immediately. Similar images are flagged for manual review.</p></div>
        {authenticated && <div className="flex gap-2"><button onClick={() => void load()} className="rounded-lg border border-slate-600 px-4 py-2 text-sm">Refresh</button><button onClick={() => void logout()} className="rounded-lg bg-slate-700 px-4 py-2 text-sm">Log out</button></div>}
      </header>
      {!authenticated ? <section className="mx-auto max-w-md rounded-2xl border border-[#34445b] bg-[#1f293d] p-7">
        <h2 className="text-xl font-semibold">Admin sign in</h2>
        <form onSubmit={login} className="mt-6 space-y-4">
          <input value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Your admin name" maxLength={60} className="w-full rounded-lg border border-slate-600 bg-[#111c2b] px-4 py-3 text-white" required />
          <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Admin password" className="w-full rounded-lg border border-slate-600 bg-[#111c2b] px-4 py-3 text-white" required />
          <button className="w-full rounded-lg bg-emerald-400 px-4 py-3 font-bold text-[#0b0f19]">Sign in</button>
        </form>
        {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
      </section> : <>
        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-700 bg-[#1f293d] p-4"><p className="text-sm text-slate-400">Counted votes</p><p className="mt-1 text-3xl font-bold">{counts.counted}</p></div>
          <div className="rounded-xl border border-amber-700/50 bg-[#1f293d] p-4"><p className="text-sm text-amber-300">Possible duplicates</p><p className="mt-1 text-3xl font-bold">{counts.duplicates}</p></div>
          <div className="rounded-xl border border-rose-700/50 bg-[#1f293d] p-4"><p className="text-sm text-rose-300">Rejected images</p><p className="mt-1 text-3xl font-bold">{counts.rejected}</p></div>
        </section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">{[["duplicates","Possible duplicates"],["counted","Counted"],["rejected","Rejected"],["all","All images"]].map(([value,label]) =>
            <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-4 py-2 text-sm ${filter===value?"bg-emerald-400 font-bold text-[#0b0f19]":"border border-slate-600 text-slate-200"}`}>{label}</button>)}</div>
          <span className="text-sm text-slate-400">{visible.length} image(s)</span>
        </div>
        {loading && <p className="py-8 text-center text-slate-300">Loading images…</p>}
        {!loading && visible.length===0 && <div className="rounded-xl border border-dashed border-slate-600 p-10 text-center text-slate-400">No images in this view.</div>}
        <div className="grid gap-5 md:grid-cols-2">
          {visible.map(item => {
            const participant = Array.isArray(item.participants) ? item.participants[0] : item.participants;
            return <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-700 bg-[#1f293d]">
              {item.image_url ? <a href={item.image_url} target="_blank" rel="noreferrer"><img src={item.image_url} alt={item.original_filename || "Voting proof"} className="max-h-[420px] w-full bg-[#101827] object-contain" /></a> : <div className="p-8 text-center text-slate-400">Image unavailable</div>}
              <div className="space-y-2 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="text-lg font-bold">{item.campaign_name}</h2><span className={`rounded-full px-3 py-1 text-xs ${item.status==="counted"?"bg-emerald-900 text-emerald-200":"bg-rose-900 text-rose-200"}`}>{statusLabels[item.status]}</span></div>
                <p className="text-sm text-slate-300">@{participant?.x_username || "Unknown"} · {item.country_code}</p>
                <p className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString()} · {item.original_filename || "image"} · {(item.size_bytes/1024/1024).toFixed(2)} MB</p>
                {item.duplicate_flag && <div className="rounded-lg border border-amber-500/50 bg-amber-950/40 p-3 text-sm text-amber-200"><strong>Possible duplicate</strong><p className="mt-1">A matching image was detected through exact file hash, visual similarity, or OCR text. Review manually; this image is still counted.</p></div>}
                {item.perceptual_hash && <p className="text-[11px] text-slate-500">pHash: {item.perceptual_hash}</p>}
                {item.rejection_reason && <p className="text-xs text-rose-300">Rejected by {item.rejected_by || "admin"} · {item.rejection_reason}</p>}
                <div className="flex flex-wrap gap-2 pt-2">
                  {item.status==="counted" ? <button disabled={busyId===item.id} onClick={()=>void updateStatus(item.id,"rejected")} className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Reject · remove 1 vote</button> : <button disabled={busyId===item.id} onClick={()=>void updateStatus(item.id,"counted")} className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-bold text-[#0b0f19] disabled:opacity-50">Restore · count 1 vote</button>}
                </div>
              </div>
            </article>;
          })}
        </div>
        <section className="mt-10 overflow-hidden rounded-2xl border border-slate-700 bg-[#1f293d]">
          <div className="border-b border-slate-700 px-5 py-4"><h2 className="text-lg font-bold">Moderation history</h2><p className="text-xs text-slate-400">Every count/rejection action, reviewer and timestamp.</p></div>
          {audit.length===0 ? <p className="p-5 text-sm text-slate-400">No moderation actions recorded yet.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-400"><tr><th className="p-3">DATE</th><th className="p-3">ADMIN</th><th className="p-3">IMAGE ID</th><th className="p-3">ACTION</th><th className="p-3">REASON</th></tr></thead><tbody>{audit.map(entry=><tr key={entry.id} className="border-t border-slate-700"><td className="p-3">{new Date(entry.created_at).toLocaleString()}</td><td className="p-3">{entry.admin_actor}</td><td className="p-3 font-mono">{entry.submission_id.slice(0,8)}</td><td className="p-3">{entry.previous_status} → {entry.new_status}</td><td className="p-3">{entry.reason || "—"}</td></tr>)}</tbody></table></div>}
        </section>
        {error && <p role="alert" className="mt-6 text-sm text-rose-300">{error}</p>}
        {notice && <p role="status" className="mt-6 text-sm text-emerald-300">{notice}</p>}
      </>}
    </div>
  </main>;
}
