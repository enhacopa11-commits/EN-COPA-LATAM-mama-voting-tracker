"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Submission = {
  id: string;
  campaign_name: string;
  country_code: string;
  storage_path: string;
  original_filename: string | null;
  mime_type: string;
  size_bytes: number;
  status: "pending_review" | "reviewed" | "approved" | "rejected";
  created_at: string;
  image_url: string | null;
  participants: { x_username: string } | { x_username: string }[] | null;
};

const statusLabels: Record<Submission["status"], string> = {
  pending_review: "Pending review", reviewed: "Reviewed", approved: "Approved", rejected: "Rejected",
};

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [items, setItems] = useState<Submission[]>([]);
  const [filter, setFilter] = useState("pending_review");
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
      setItems(data.submissions || []); setAuthenticated(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load submissions."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => filter === "all" ? items : items.filter(item => item.status === filter), [items, filter]);

  async function login(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Could not sign in."); return; }
    setPassword(""); setAuthenticated(true); await load();
  }

  async function updateStatus(id: string, status: Submission["status"]) {
    setBusyId(id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/submissions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update status.");
      setItems(current => current.map(item => item.id === id ? { ...item, status } : item));
      setNotice("Submission status updated.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update status."); }
    finally { setBusyId(""); }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false); setItems([]);
  }

  const counts = {
    pending: items.filter(x => x.status === "pending_review").length,
    approved: items.filter(x => x.status === "approved").length,
    rejected: items.filter(x => x.status === "rejected").length,
  };

  return <main className="min-h-screen bg-[#0b0f19] px-4 py-8 text-white sm:px-8">
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-[#34445b] pb-6">
        <div><p className="text-xs font-bold tracking-[.25em] text-emerald-400">EN-COPA LATAM</p><h1 className="mt-2 text-3xl font-bold">Voting proof · Admin</h1><p className="mt-1 text-sm text-slate-400">Private submissions review panel</p></div>
        {authenticated && <div className="flex gap-2"><button onClick={() => void load()} className="rounded-lg border border-slate-600 px-4 py-2 text-sm">Refresh</button><button onClick={() => void logout()} className="rounded-lg bg-slate-700 px-4 py-2 text-sm">Log out</button></div>}
      </header>

      {!authenticated ? <section className="mx-auto max-w-md rounded-2xl border border-[#34445b] bg-[#1f293d] p-7">
        <h2 className="text-xl font-semibold">Admin sign in</h2><p className="mt-2 text-sm text-slate-300">Enter the private EN-COPA LATAM admin password.</p>
        <form onSubmit={login} className="mt-6 space-y-4">
          <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Admin password" className="w-full rounded-lg border border-slate-600 bg-[#111c2b] px-4 py-3 text-white" required />
          <button className="w-full rounded-lg bg-emerald-400 px-4 py-3 font-bold text-[#0b0f19]">Sign in</button>
        </form>
        {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
      </section> : <>
        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-700 bg-[#1f293d] p-4"><p className="text-sm text-slate-400">Pending review</p><p className="mt-1 text-3xl font-bold">{counts.pending}</p></div>
          <div className="rounded-xl border border-slate-700 bg-[#1f293d] p-4"><p className="text-sm text-slate-400">Approved</p><p className="mt-1 text-3xl font-bold">{counts.approved}</p></div>
          <div className="rounded-xl border border-slate-700 bg-[#1f293d] p-4"><p className="text-sm text-slate-400">Rejected</p><p className="mt-1 text-3xl font-bold">{counts.rejected}</p></div>
        </section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">{[["pending_review","Pending"],["reviewed","Reviewed"],["approved","Approved"],["rejected","Rejected"],["all","All"]].map(([value,label])=><button key={value} onClick={()=>setFilter(value)} className={`rounded-full px-4 py-2 text-sm ${filter===value?"bg-emerald-400 font-bold text-[#0b0f19]":"border border-slate-600 text-slate-200"}`}>{label}</button>)}</div>
          <span className="text-sm text-slate-400">{visible.length} submission(s)</span>
        </div>
        {loading && <p className="py-8 text-center text-slate-300">Loading submissions…</p>}
        {!loading && visible.length===0 && <div className="rounded-xl border border-dashed border-slate-600 p-10 text-center text-slate-400">No submissions in this view yet.</div>}
        <div className="grid gap-5 md:grid-cols-2">
          {visible.map(item => {
            const participant = Array.isArray(item.participants) ? item.participants[0] : item.participants;
            return <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-700 bg-[#1f293d]">
              {item.image_url ? <a href={item.image_url} target="_blank" rel="noreferrer"><img src={item.image_url} alt={item.original_filename || "Voting proof"} className="max-h-[420px] w-full bg-[#101827] object-contain" /></a> : <div className="p-8 text-center text-slate-400">Image unavailable</div>}
              <div className="space-y-2 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="text-lg font-bold">{item.campaign_name}</h2><span className="rounded-full bg-slate-700 px-3 py-1 text-xs">{statusLabels[item.status]}</span></div>
                <p className="text-sm text-slate-300">@{participant?.x_username || "Unknown"} · {item.country_code}</p>
                <p className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString()} · {item.original_filename || "image"} · {(item.size_bytes/1024/1024).toFixed(2)} MB</p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button disabled={busyId===item.id} onClick={()=>void updateStatus(item.id,"approved")} className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-bold text-[#0b0f19] disabled:opacity-50">Approve</button>
                  <button disabled={busyId===item.id} onClick={()=>void updateStatus(item.id,"rejected")} className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Reject</button>
                  <button disabled={busyId===item.id} onClick={()=>void updateStatus(item.id,"reviewed")} className="rounded-lg border border-slate-500 px-3 py-2 text-sm disabled:opacity-50">Mark reviewed</button>
                  <button disabled={busyId===item.id} onClick={()=>void updateStatus(item.id,"pending_review")} className="rounded-lg border border-slate-500 px-3 py-2 text-sm disabled:opacity-50">Pending</button>
                </div>
              </div>
            </article>;
          })}
        </div>
        {error && <p role="alert" className="mt-6 text-sm text-rose-300">{error}</p>}
        {notice && <p role="status" className="mt-6 text-sm text-emerald-300">{notice}</p>}
      </>}
    </div>
  </main>;
}
