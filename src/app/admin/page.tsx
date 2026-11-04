"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Status = "pending_review" | "reviewed" | "approved" | "rejected";
type Submission = {
  id: string;
  campaign_name: string;
  country_code: string;
  original_filename: string | null;
  size_bytes: number;
  status: Status;
  created_at: string;
  image_url: string | null;
  participants: { x_username: string } | { x_username: string }[] | null;
};
type Filter = Status | "all";

const labels: Record<Status, string> = {
  pending_review: "Pendientes",
  reviewed: "Revisados",
  approved: "Aprobados",
  rejected: "Rechazados",
};

const filters: { value: Filter; label: string }[] = [
  { value: "pending_review", label: "Pendientes" },
  { value: "approved", label: "Aprobados" },
  { value: "rejected", label: "Rechazados" },
  { value: "reviewed", label: "Revisados" },
  { value: "all", label: "Todos" },
];

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [items, setItems] = useState<Submission[]>([]);
  const [filter, setFilter] = useState<Filter>("pending_review");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/submissions", { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) {
        setAuthenticated(false);
        setItems([]);
        return;
      }
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar los comprobantes.");
      setItems(data.submissions || []);
      setAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los comprobantes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    pending: items.filter(item => item.status === "pending_review").length,
    approved: items.filter(item => item.status === "approved").length,
    rejected: items.filter(item => item.status === "rejected").length,
    reviewed: items.filter(item => item.status === "reviewed").length,
  }), [items]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter(item => {
      const participant = Array.isArray(item.participants) ? item.participants[0] : item.participants;
      const matchesFilter = filter === "all" || item.status === filter;
      const matchesSearch = !term || [
        item.campaign_name,
        item.country_code,
        participant?.x_username || "",
        item.original_filename || "",
      ].some(value => value.toLowerCase().includes(term));
      return matchesFilter && matchesSearch;
    });
  }, [items, filter, search]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoggingIn(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo iniciar sesión.");
      setPassword("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setLoggingIn(false);
    }
  }

  async function updateStatus(id: string, status: Status) {
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/submissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar el comprobante.");
      setItems(current => current.map(item => item.id === id ? { ...item, status } : item));
      setNotice("Estado del comprobante actualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el comprobante.");
    } finally {
      setBusyId("");
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
    setItems([]);
    setSearch("");
    setFilter("pending_review");
  }

  return (
    <main className="min-h-screen bg-[#0b0f19] px-4 py-7 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-[#34445b] pb-6">
          <div>
            <p className="text-xs font-bold tracking-[.25em] text-emerald-400">EN-COPA LATAM</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Panel de administración</h1>
            <p className="mt-2 text-sm text-slate-400">Revisión privada de comprobantes de votación</p>
          </div>
          {authenticated && (
            <div className="flex gap-2">
              <button onClick={() => void load()} disabled={loading} className="rounded-lg border border-slate-600 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-50">Actualizar</button>
              <button onClick={() => void logout()} className="rounded-lg bg-slate-700 px-4 py-2 text-sm hover:bg-slate-600">Cerrar sesión</button>
            </div>
          )}
        </header>

        {!authenticated ? (
          <section className="mx-auto max-w-md rounded-2xl border border-[#34445b] bg-[#172338] p-7 shadow-xl">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">●</div>
            <h2 className="text-xl font-semibold">Acceso privado</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">Ingresa la contraseña administrativa para revisar los comprobantes.</p>
            <form onSubmit={login} className="mt-6 space-y-4">
              <label className="block text-sm text-slate-300" htmlFor="admin-password">Contraseña</label>
              <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Contraseña de administración" className="w-full rounded-lg border border-slate-600 bg-[#0b1422] px-4 py-3 text-white outline-none focus:border-emerald-400" required />
              <button disabled={loggingIn} className="w-full rounded-lg bg-emerald-400 px-4 py-3 font-bold text-[#0b0f19] hover:bg-emerald-300 disabled:opacity-60">{loggingIn ? "Verificando…" : "Entrar al panel"}</button>
            </form>
            {error && <p role="alert" className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
          </section>
        ) : (
          <>
            <section className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Pendientes", value: counts.pending, hint: "Esperando revisión", color: "text-amber-300" },
                { label: "Aprobados", value: counts.approved, hint: "Incluidos en el ranking", color: "text-emerald-300" },
                { label: "Rechazados", value: counts.rejected, hint: "Excluidos del ranking", color: "text-rose-300" },
                { label: "Revisados", value: counts.reviewed, hint: "Marcados como revisados", color: "text-sky-300" },
              ].map(card => (
                <div key={card.label} className="rounded-xl border border-slate-700 bg-[#172338] p-5">
                  <p className="text-sm text-slate-400">{card.label}</p>
                  <p className={`mt-2 text-3xl font-bold ${card.color}`}>{card.value}</p>
                  <p className="mt-1 text-xs text-slate-500">{card.hint}</p>
                </div>
              ))}
            </section>

            <section className="rounded-2xl border border-slate-700 bg-[#111c2b] p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Comprobantes</h2>
                  <p className="mt-1 text-sm text-slate-400">Revisa cada imagen y actualiza su estado.</p>
                </div>
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar usuario, país o votación…" className="w-full rounded-lg border border-slate-600 bg-[#0b1422] px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-400 lg:max-w-sm" />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {filters.map(item => (
                  <button key={item.value} onClick={() => setFilter(item.value)} className={`rounded-full px-4 py-2 text-sm transition ${filter === item.value ? "bg-emerald-400 font-semibold text-[#0b0f19]" : "border border-slate-600 text-slate-300 hover:bg-slate-800"}`}>{item.label}</button>
                ))}
                <span className="ml-auto self-center text-xs text-slate-500">{visible.length} resultado(s)</span>
              </div>
            </section>

            {loading && <p className="py-12 text-center text-slate-300">Cargando comprobantes…</p>}
            {!loading && visible.length === 0 && (
              <div className="mt-5 rounded-xl border border-dashed border-slate-600 p-12 text-center text-slate-400">
                {items.length === 0 ? "Todavía no hay comprobantes enviados." : "No hay comprobantes que coincidan con esta búsqueda."}
              </div>
            )}
            <section className="mt-5 grid gap-5 lg:grid-cols-2">
              {visible.map(item => {
                const participant = Array.isArray(item.participants) ? item.participants[0] : item.participants;
                return (
                  <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-700 bg-[#172338]">
                    <div className="flex min-h-56 items-center justify-center bg-[#0b1422]">
                      {item.image_url ? (
                        <a href={item.image_url} target="_blank" rel="noreferrer" className="block w-full">
                          <img src={item.image_url} alt={item.original_filename || "Comprobante de votación"} className="max-h-[440px] w-full object-contain" />
                        </a>
                      ) : <p className="p-8 text-sm text-slate-500">La imagen no está disponible o expiró el enlace temporal.</p>}
                    </div>
                    <div className="space-y-3 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div><h3 className="text-lg font-bold">{item.campaign_name}</h3><p className="mt-1 text-sm text-slate-300">@{participant?.x_username || "Usuario desconocido"} · {item.country_code}</p></div>
                        <span className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-200">{labels[item.status]}</span>
                      </div>
                      <p className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString("es-MX")} · {item.original_filename || "imagen"} · {(item.size_bytes / 1024 / 1024).toFixed(2)} MB</p>
                      <div className="flex flex-wrap gap-2 border-t border-slate-700 pt-4">
                        <button disabled={busyId === item.id} onClick={() => void updateStatus(item.id, "approved")} className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-bold text-[#0b0f19] hover:bg-emerald-300 disabled:opacity-50">Aprobar</button>
                        <button disabled={busyId === item.id} onClick={() => void updateStatus(item.id, "rejected")} className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-white hover:bg-rose-400 disabled:opacity-50">Rechazar</button>
                        <button disabled={busyId === item.id} onClick={() => void updateStatus(item.id, "reviewed")} className="rounded-lg border border-slate-500 px-4 py-2 text-sm hover:bg-slate-700 disabled:opacity-50">Marcar revisado</button>
                        {item.status !== "pending_review" && <button disabled={busyId === item.id} onClick={() => void updateStatus(item.id, "pending_review")} className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50">Volver a pendientes</button>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
            {error && <p role="alert" className="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
            {notice && <p role="status" className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</p>}
          </>
        )}
      </div>
    </main>
  );
}
