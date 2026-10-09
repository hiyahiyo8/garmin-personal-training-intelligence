"use client";

import { useCallback, useEffect, useState } from "react";

type JsonObject = Record<string, unknown>;
type LivePayload = {
  source: string;
  generated_at: string;
  date: string;
  stats: JsonObject;
  sleep: JsonObject;
  hrv: JsonObject;
  training_load: JsonObject;
  activities: JsonObject | JsonObject[];
};

const number = (value: unknown, digits = 0) => typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
const text = (value: unknown, fallback = "—") => value == null ? fallback : String(value);
const latest = (value: unknown) => Array.isArray(value) ? value.at(-1) as JsonObject | undefined : undefined;

export default function LiveMonitoring() {
  const [snapshot, setSnapshot] = useState<LivePayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/live?date=${new Date().toISOString().slice(0, 10)}`, { cache: "no-store" });
      const body = await response.json() as LivePayload & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Live monitoring gagal.");
      setSnapshot(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Live monitoring gagal.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refresh]);

  const stats = snapshot?.stats ?? {};
  const sleep = snapshot?.sleep ?? {};
  const hrv = snapshot?.hrv ?? {};
  const load = snapshot?.training_load ?? {};
  const hrvLatest = latest(hrv.trend);
  const loadLatest = latest(load.trend);
  const activityPayload = snapshot?.activities;
  const nestedActivities = !Array.isArray(activityPayload) ? activityPayload?.activities : undefined;
  const activities = Array.isArray(activityPayload)
    ? activityPayload
    : Array.isArray(nestedActivities)
      ? nestedActivities as JsonObject[]
      : [];

  return <section className="livePanel" aria-labelledby="live-title">
    <div className="liveHeader">
      <div><span className="sectionLabel">Live MCP monitoring</span><h2 id="live-title">Kondisi Garmin saat ini</h2><p>Read-only dari Garmin MCP lokal. Metrik Garmin adalah konteks, bukan diagnosis.</p></div>
      <div className="liveActions"><label className="toggleLabel"><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /> Auto-refresh 60 dtk</label><button className="primaryButton" onClick={() => void refresh()} disabled={loading}>{loading ? "Memuat…" : "Refresh sekarang"}</button></div>
    </div>
    {error && <div className="errorBanner" role="alert"><strong>Live MCP dinonaktifkan.</strong><span>{error} Gunakan file export Garmin untuk analisis di dashboard.</span></div>}
    {loading && !snapshot && <div className="liveLoading" role="status" aria-busy="true">Mengambil statistik, tidur, HRV, training load, dan aktivitas terakhir…</div>}
    {snapshot && <>
      <div className="liveMeta"><span><i className="statusDot" /> Terhubung · {new Date(snapshot.generated_at).toLocaleTimeString("id-ID")}</span><span>{snapshot.source}</span></div>
      <div className="metricGrid five liveMetrics">
        <article><span>Resting HR</span><strong>{number(stats.resting_heart_rate_bpm)}<i> bpm</i></strong><small>hari ini</small></article>
        <article><span>Body Battery</span><strong>{number(stats.body_battery_current)}</strong><small>nilai terakhir</small></article>
        <article><span>Langkah</span><strong>{stats.total_steps == null ? "—" : Number(stats.total_steps).toLocaleString("id-ID")}</strong><small>hari ini</small></article>
        <article><span>Tidur</span><strong>{number(sleep.sleep_hours, 1)}<i> jam</i></strong><small>skor {number(sleep.sleep_score)}</small></article>
        <article><span>HRV nightly</span><strong>{number(hrvLatest?.last_night_avg_hrv_ms)}<i> ms</i></strong><small>7 hari terakhir</small></article>
      </div>
      <div className="liveGrid">
        <article className="tableCard"><div className="cardHeading"><div><span>Garmin training status</span><h3>Load terbaru</h3></div><small>{text(loadLatest?.date)}</small></div><div className="liveLoadRows"><span>ATL <b>{number(loadLatest?.atl, 1)}</b></span><span>CTL <b>{number(loadLatest?.ctl, 1)}</b></span><span>TSB <b>{number(loadLatest?.tsb, 1)}</b></span><span>ACWR <b>{number(loadLatest?.acwr, 2)}</b></span></div><p className="cardNote">ATL/CTL/TSB/ACWR ditampilkan sebagai metrik Garmin deskriptif; jangan gunakan sebagai ambang cedera otomatis.</p></article>
        <article className="tableCard"><div className="cardHeading"><div><span>Recent activity</span><h3>Aktivitas terakhir</h3></div><small>{activities.length} sesi</small></div>{activities.length ? <div className="tableScroll"><table><caption>Aktivitas Garmin terbaru</caption><thead><tr><th>Tanggal</th><th>Jenis</th><th>Durasi</th><th>Jarak</th></tr></thead><tbody>{activities.slice(0, 5).map((activity, index) => <tr key={`${String(activity.activityId ?? activity.activityName ?? "activity")}-${index}`}><td>{String(activity.startTimeLocal ?? activity.beginTimestamp ?? "—").slice(0, 10)}</td><td>{text(activity.activityName ?? activity.activityType)}</td><td>{activity.duration == null ? "—" : `${number(Number(activity.duration) / 60)} min`}</td><td>{activity.distance == null ? "—" : `${number(Number(activity.distance) / 1000, 2)} km`}</td></tr>)}</tbody></table></div> : <p className="liveEmpty">Belum ada aktivitas terbaru dari Garmin.</p>}</article>
      </div>
    </>}
  </section>;
}
