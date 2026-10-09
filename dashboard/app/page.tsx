"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  DatasetKind,
  GarminBundle,
  HrvPoint,
  ParsedDataset,
  SleepPoint,
  TrendPoint,
  activityPaceSeconds,
  combineDatasets,
  mean,
  median,
  paceLabel,
  parseGarminFile,
  parseGpsXmlFile,
} from "./garmin-data";
import { analyzeFitSession } from "./fit-analysis";
import { parseGarminMcpJson } from "./garmin-mcp-import";
import type { FitSession } from "./fit-data";
import { recommendSession } from "./recommendation";
import { clearHistory, loadHistory, saveHistory } from "./history-store";
import { checkInSchema, datasetSchema, fitSchema, profileSchema, snapshotSchema, type CheckIn } from "./validation";

type CalibratedActivity = Activity & {
  rpe: number | null;
  hrr: number | null;
  load: number | null;
  loadMethod: "session-RPE" | "HR proxy" | "—";
  intensity: "easy" | "moderate" | "hard" | "unknown";
};

type Week = {
  label: string;
  sessions: number;
  duration: number;
  distance: number;
  rpeLoad: number;
  hrProxyLoad: number;
  hardSessions: number;
};

const sampleCsv = `Jenis Aktivitas,Tanggal,Jarak,Kalori,Waktu,Rata2 HR,Denyut Jantung Maks,AEROBIK TE,Rata-rata Cadence Lari,Rata-rata Panjang Langkah
Berlari,2026-09-08 06:30:00,4.20,450,00:38:20,146,170,2.6,158,0.71
Jalan kaki,2026-09-10 07:00:00,3.60,280,00:44:00,121,139,1.8,112,0.65
Berlari,2026-09-15 06:20:00,5.00,510,00:39:10,151,176,3.1,162,0.78
Strength Training,2026-09-18 17:30:00,0,330,00:42:00,128,158,0.7,--,--
Jalan kaki,2026-09-21 06:40:00,4.20,310,00:48:00,126,145,2.0,114,0.67
Berlari,2026-09-23 06:15:00,5.00,560,00:35:40,166,182,4.0,166,0.84`;

const KIND_LABELS: Record<DatasetKind, string> = {
  activities: "Aktivitas",
  sleep: "Tidur",
  hrv: "HRV",
  vo2: "VO₂max",
  fitnessAge: "Usia kebugaran",
  monthlyDistance: "Jarak bulanan",
  monthlyDuration: "Durasi bulanan",
  monthlyCalories: "Kalori aktivitas",
  monthlyPace: "Pace bulanan",
  monthlySpeed: "Kecepatan bulanan",
  monthlyAvgHr: "HR rata-rata",
  monthlyMaxHr: "HR maksimum",
  ftp: "Functional threshold power",
  dailyHealth: "Daily health MCP",
  trainingLoad: "Training load MCP",
  unknown: "Tidak dikenali",
};

function isoWeek(date: string) {
  const day = new Date(`${date}T00:00:00Z`);
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const start = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((day.getTime() - start.getTime()) / 86400000) + 1) / 7);
  return `${day.getUTCFullYear()} · W${String(week).padStart(2, "0")}`;
}

function calibrateActivities(activities: Activity[], maxHr: number, restingHr: number, checkIns: CheckIn[]): CalibratedActivity[] {
  const checkInMap = new Map(checkIns.map((checkIn) => [checkIn.activityId, checkIn]));
  const reserve = maxHr > restingHr ? maxHr - restingHr : null;
  return activities.map((activity) => {
    const checkIn = checkInMap.get(activity.id);
    const rpe = checkIn?.rpe ?? null;
    const hrr = activity.avgHr !== null && reserve ? Math.max(0, Math.min(1, (activity.avgHr - restingHr) / reserve)) : null;
    const aerobic = ["run", "walk", "racket"].includes(activity.category);
    const factor = hrr === null ? null : hrr < 0.6 ? 1 : hrr < 0.7 ? 2 : hrr < 0.8 ? 3 : hrr < 0.9 ? 4 : 5;
    const load = activity.durationMin === null ? null : rpe !== null ? activity.durationMin * rpe : aerobic && factor !== null ? activity.durationMin * factor : null;
    const loadMethod = rpe !== null ? "session-RPE" : aerobic && factor !== null ? "HR proxy" : "—";
    const intensity = rpe !== null
      ? rpe >= 7 ? "hard" : rpe >= 4 ? "moderate" : "easy"
      : !aerobic || hrr === null ? "unknown" : hrr >= 0.8 ? "hard" : hrr >= 0.7 ? "moderate" : "easy";
    return { ...activity, rpe, hrr, load, loadMethod, intensity };
  });
}

function summarizeWeeks(activities: CalibratedActivity[]): Week[] {
  if (!activities.length) return [];
  const monday = (date: string) => {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
    return value;
  };
  const anchor = monday(activities.reduce((last, activity) => activity.date > last ? activity.date : last, activities[0].date));
  const weeks = Array.from({ length: 12 }, (_, index) => {
    const start = new Date(anchor);
    start.setUTCDate(start.getUTCDate() - (11 - index) * 7);
    return { key: start.toISOString().slice(0, 10), week: { label: isoWeek(start.toISOString().slice(0, 10)), sessions: 0, duration: 0, distance: 0, rpeLoad: 0, hrProxyLoad: 0, hardSessions: 0 } satisfies Week };
  });
  const map = new Map(weeks.map(item => [item.key, item.week]));
  for (const activity of activities) {
    const current = map.get(monday(activity.date).toISOString().slice(0, 10));
    if (!current) continue;
    current.sessions += 1;
    current.duration += activity.durationMin ?? 0;
    if (["run", "walk"].includes(activity.category)) current.distance += activity.distanceKm ?? 0;
    if (activity.loadMethod === "session-RPE") current.rpeLoad += activity.load ?? 0;
    if (activity.loadMethod === "HR proxy") current.hrProxyLoad += activity.load ?? 0;
    if (activity.intensity === "hard") current.hardSessions += 1;
  }
  return weeks.map(item => item.week);
}

function fitActivity(session: FitSession): Activity {
  const sport = session.sport.toLowerCase();
  const category = sport.includes("run") ? "run" : sport.includes("walk") || sport.includes("hike") ? "walk" : sport.includes("strength") ? "strength" : sport.includes("tennis") || sport.includes("badminton") ? "racket" : "other";
  return { id: session.id, date: session.date, type: session.sport, category, durationMin: session.durationMin, distanceKm: session.distanceKm, avgHr: session.avgHr, maxHr: session.maxHr, calories: null, aerobicTe: null, cadence: null, strideLength: null, verticalRatio: null, verticalOscillation: null, groundContactTime: null, gapSeconds: null, avgPower: null, maxPower: null, steps: null, bodyBatteryDrained: null, respiration: null, stressChange: null, stressStart: null, stressEnd: null };
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours ? `${hours}j ${rest}m` : `${rest}m`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function csvCell(value: string | number | null) {
  const raw = value === null ? "" : String(value);
  const text = typeof value === "string" && /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replaceAll('"', '""')}"`;
}

function latest<T extends { date: string }>(points: T[]) {
  return [...points].sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? null;
}

function storedJson(key: string, fallback: unknown) {
  try { return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback)); }
  catch { return fallback; }
}

function trendDelta(points: TrendPoint[]) {
  const valid = points.filter((point) => point.value !== null);
  if (valid.length < 2) return null;
  return (valid.at(-1)?.value ?? 0) - (valid[0].value ?? 0);
}

function completenessLabel(bundle: GarminBundle) {
  const activity = bundle.activities.length >= 10;
  const recovery = (bundle.sleep.length >= 4 && bundle.hrv.length >= 7) || bundle.dailyHealth.length >= 7;
  const performance = (bundle.trends.vo2?.length ?? 0) >= 3;
  const score = Number(activity) + Number(recovery) + Number(performance);
  return score === 3 ? "Tinggi" : score >= 1 ? "Sedang" : "Rendah";
}

function MiniLineChart({ points, color = "#1e5b46", format = (value: number) => value.toFixed(0) }: { points: TrendPoint[]; color?: string; format?: (value: number) => string }) {
  const valid = points.filter((point): point is TrendPoint & { value: number } => point.value !== null);
  if (valid.length < 2) return <div className="chartEmpty">Belum cukup titik data.</div>;
  const values = valid.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const coordinates = valid.map((point, index) => {
    const x = valid.length === 1 ? 50 : index / (valid.length - 1) * 100;
    const y = 88 - ((point.value - min) / range) * 72;
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="miniChart">
      <div className="miniChartMeta"><span>{valid[0].label}</span><strong>{format(valid.at(-1)?.value ?? 0)}</strong><span>{valid.at(-1)?.label}</span></div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Grafik tren">
        <line x1="0" y1="88" x2="100" y2="88" className="chartBaseline" />
        <polyline points={coordinates} fill="none" stroke={color} strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="chartRange"><span>Min {format(min)}</span><span>Maks {format(max)}</span></div>
    </div>
  );
}

function sleepTrend(points: SleepPoint[]): TrendPoint[] {
  return points.map((point) => ({ date: point.date, label: point.label, value: point.score }));
}

function hrvTrend(points: HrvPoint[]): TrendPoint[] {
  return points.map((point) => ({ date: point.date, label: formatDate(point.date), value: point.nightly }));
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState("Memuat histori lokal…");
  const [busy, setBusy] = useState(false);
  const [datasets, setDatasets] = useState<ParsedDataset[]>([]);
  const [fitSessions, setFitSessions] = useState<FitSession[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [maxHr, setMaxHr] = useState(197);
  const [restingHr, setRestingHr] = useState(50);
  const [fitSport, setFitSport] = useState("all");
  const [fitFrom, setFitFrom] = useState("");
  const [fitTo, setFitTo] = useState("");
  const [form, setForm] = useState({ activityId: "", rpe: "4", pain: "0", soreness: "2", fatigue: "3", sleepQuality: "5", stress: "3", mood: "7", painLocation: "" });

  useEffect(() => {
    let cancelled = false;
    void loadHistory().then(saved => {
      if (cancelled) return;
      if (saved) {
        setDatasets(saved.datasets); setFitSessions(saved.fitSessions); setCheckIns(saved.checkIns);
        setMaxHr(saved.profile.maxHr); setRestingHr(saved.profile.restingHr);
      } else {
        const profile = profileSchema.safeParse(storedJson("garmin-lab-profile", null));
        if (profile.success) { setMaxHr(profile.data.maxHr); setRestingHr(profile.data.restingHr); }
        const old = checkInSchema.array().max(50000).safeParse(storedJson("garmin-lab-checkins", []));
        if (old.success) setCheckIns(old.data);
      }
      setStorageStatus(saved ? "Histori lokal dipulihkan." : "Siap. Histori lama yang hanya berupa metadata perlu diimpor ulang.");
      setStorageReady(true);
    }).catch(() => { if (!cancelled) setStorageStatus("Histori gagal dibaca. Muat ulang sebelum mengimpor agar data lama tidak tertimpa."); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const snapshot = snapshotSchema.safeParse({ version: 1, datasets, fitSessions, checkIns, profile: { maxHr, restingHr } });
      if (!snapshot.success) { setStorageStatus("Belum disimpan: periksa profil HR atau batas jumlah data."); return; }
      void saveHistory(snapshot.data).then(() => { if (!cancelled) setStorageStatus("Tersimpan di browser ini. Unduh backup untuk salinan terpisah."); }).catch(() => { if (!cancelled) setStorageStatus("Gagal menyimpan (ruang penyimpanan/izin browser). Unduh backup sebelum menutup halaman."); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [datasets, fitSessions, checkIns, maxHr, restingHr, storageReady]);

  const bundle = useMemo(() => combineDatasets(datasets), [datasets]);
  const fitAnalyses = useMemo(() => fitSessions.map((session) => ({ session, analysis: analyzeFitSession(session, maxHr, restingHr) })), [fitSessions, maxHr, restingHr]);
  const latestFit = fitAnalyses.at(-1) ?? null;
  const fitTimeline = useMemo(() => fitAnalyses.map(({ session, analysis }) => ({
    session,
    analysis,
  })), [fitAnalyses]);
  const fitSports = useMemo(() => [...new Set(fitTimeline.map(({ session }) => session.sport))].sort(), [fitTimeline]);
  const filteredFitTimeline = useMemo(() => fitTimeline.filter(({ session }) => (fitSport === "all" || session.sport === fitSport) && (!fitFrom || session.date >= fitFrom) && (!fitTo || session.date <= fitTo)), [fitFrom, fitSport, fitTimeline, fitTo]);
  const fitTotalDistance = filteredFitTimeline.reduce((total, { session }) => total + (session.distanceKm ?? 0), 0);
  const fitDrifts = filteredFitTimeline.map(({ analysis }) => analysis.paHrDriftPercent).filter((value): value is number => value !== null);
  const fitMeanDrift = fitDrifts.length ? mean(fitDrifts) : null;
  const sourceActivities = useMemo(() => {
    const result = [...bundle.activities];
    for (const session of fitSessions) {
      const candidate = fitActivity(session);
      const duplicate = result.some(activity => activity.date === candidate.date && activity.category === candidate.category && ((activity.durationMin !== null && candidate.durationMin !== null && Math.abs(activity.durationMin - candidate.durationMin) <= 2) || (activity.distanceKm !== null && candidate.distanceKm !== null && Math.abs(activity.distanceKm - candidate.distanceKm) <= 0.05)));
      if (!duplicate) result.push(candidate);
    }
    return result.sort((a, b) => a.date.localeCompare(b.date));
  }, [bundle.activities, fitSessions]);
  const activities = useMemo(() => calibrateActivities(sourceActivities, maxHr, restingHr, checkIns), [sourceActivities, maxHr, restingHr, checkIns]);
  const weeks = useMemo(() => summarizeWeeks(activities), [activities]);

  const selectedActivityId = form.activityId || activities.at(-1)?.id || "";

  const totals = useMemo(() => activities.reduce((sum, activity) => ({
    duration: sum.duration + (activity.durationMin ?? 0),
    distance: sum.distance + (["run", "walk"].includes(activity.category) ? activity.distanceKm ?? 0 : 0),
    rpeLoad: sum.rpeLoad + (activity.loadMethod === "session-RPE" ? activity.load ?? 0 : 0),
    hrProxyLoad: sum.hrProxyLoad + (activity.loadMethod === "HR proxy" ? activity.load ?? 0 : 0),
  }), { duration: 0, distance: 0, rpeLoad: 0, hrProxyLoad: 0 }), [activities]);

  const intensity = useMemo(() => ({
    easy: activities.filter((activity) => activity.intensity === "easy").length,
    moderate: activities.filter((activity) => activity.intensity === "moderate").length,
    hard: activities.filter((activity) => activity.intensity === "hard").length,
    unknown: activities.filter((activity) => activity.intensity === "unknown").length,
  }), [activities]);

  const latestSleep = latest(bundle.sleep);
  const latestHrv = latest(bundle.hrv);
  const latestDailyHealth = latest(bundle.dailyHealth);
  const latestTrainingLoad = latest(bundle.trainingLoad);
  const vo2Points = bundle.trends.vo2 ?? [];
  const fitnessAgePoints = bundle.trends.fitnessAge ?? [];
  const latestVo2 = latest(vo2Points);
  const latestFitnessAge = latest(fitnessAgePoints);
  const latestCheckIn = latest(checkIns);
  const recoveryRows = useMemo(() => activities.filter((activity) => activity.rpe !== null || checkIns.some((checkIn) => checkIn.activityId === activity.id)).slice(-10).reverse(), [activities, checkIns]);

  const recoveryContext = useMemo(() => {
    const reasons: string[] = [];
    if (latestCheckIn?.pain !== undefined && latestCheckIn.pain >= 4) reasons.push(`Nyeri subjektif ${latestCheckIn.pain}/10`);
    if (latestSleep?.durationHours !== null && latestSleep?.durationHours !== undefined && latestSleep.durationHours < 6) reasons.push(`Tidur terbaru ${latestSleep.durationHours.toFixed(1)} jam`);
    if (latestHrv?.nightly !== null && latestHrv?.nightly !== undefined && latestHrv.baselineLow !== null && latestHrv.nightly < latestHrv.baselineLow) reasons.push("HRV semalaman di bawah baseline Garmin");
    return reasons.length ? { tone: "watch", title: "Perlu perhatian pada data terakhir", reasons } : { tone: "neutral", title: "Konteks data terakhir", reasons: ["Tanggal sumber dapat berbeda. Tidak adanya flag bukan jaminan kesiapan hari ini."] };
  }, [latestCheckIn, latestSleep, latestHrv]);
  const trainingRecommendation = useMemo(() => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return recommendSession({ today, checkIn: latestCheckIn ?? undefined, sleep: latestSleep ?? undefined, hrv: latestHrv ?? undefined, activity: activities.at(-1) });
  }, [activities, latestCheckIn, latestHrv, latestSleep]);

  const runningComparison = useMemo(() => {
    const runs = activities.filter((activity) => activity.category === "run" && activityPaceSeconds(activity) !== null);
    const recent = runs.slice(-3);
    const reference = median(recent.map(activityPaceSeconds));
    const previousPool = runs.slice(0, -3).filter((activity) => {
      const pace = activityPaceSeconds(activity);
      return pace !== null && reference !== null && Math.abs(pace - reference) / reference <= 0.15;
    });
    const previous = previousPool.slice(-3);
    const metric = (key: keyof Activity) => ({ recent: median(recent.map((activity) => activity[key] as number | null)), previous: median(previous.map((activity) => activity[key] as number | null)) });
    return { recent, previous, cadence: metric("cadence"), stride: metric("strideLength"), gct: metric("groundContactTime"), verticalRatio: metric("verticalRatio") };
  }, [activities]);

  const breathwork = useMemo(() => {
    const sessions = activities.filter((activity) => activity.category === "recovery");
    return {
      sessions: sessions.length,
      stressChange: mean(sessions.map((activity) => activity.stressChange)),
      respiration: mean(sessions.map((activity) => activity.respiration)),
    };
  }, [activities]);

  const insights = useMemo(() => {
    const items: { tone: "good" | "watch" | "neutral"; label: string; title: string; body: string }[] = [];
    const latestWeek = weeks.at(-1);
    const previousWeek = weeks.at(-2);
    if (latestWeek && previousWeek && previousWeek.duration > 0) {
      const change = (latestWeek.duration / previousWeek.duration - 1) * 100;
      items.push({
        tone: Math.abs(change) > 30 ? "watch" : "neutral",
        label: "Perubahan volume",
        title: `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`,
        body: "Perubahan durasi bersifat deskriptif, bukan prediksi cedera. Konfirmasi dengan recovery, pain check-in, dan toleransi aktual.",
      });
    }
    items.push({ tone: recoveryContext.tone as "good" | "watch", label: "Recovery", title: recoveryContext.title, body: recoveryContext.reasons.join(" · ") });
    const rpeCoverage = activities.length ? activities.filter((activity) => activity.rpe !== null).length / activities.length * 100 : 0;
    items.push({ tone: rpeCoverage >= 60 ? "good" : "neutral", label: "Session-RPE", title: `${rpeCoverage.toFixed(0)}% tercatat`, body: "Session-RPE setelah latihan memperkuat estimasi beban, terutama untuk strength yang tidak cocok dinilai dari HR saja." });
    return items;
  }, [activities, recoveryContext, weeks]);

  async function readFiles(files: FileList | File[]) {
    if (!storageReady || busy) return;
    let selected = [...files];
    if (!selected.length) return;
    setError("");
    setBusy(true);
    try {
      if (selected.length > 100 || selected.some(file => file.size > 25 * 1024 * 1024) || selected.reduce((n, file) => n + file.size, 0) > 100 * 1024 * 1024) throw new Error("Batas import: 100 file, 25 MB per file, 100 MB total.");
      const expanded: File[] = [];
      for (const file of selected) {
        if (/\.zip$/i.test(file.name)) {
          const { expandZip } = await import("./zip-import");
          expanded.push(...expandZip(new Uint8Array(await file.arrayBuffer())).map(entry => new File([entry.bytes], entry.name)));
        } else expanded.push(file);
        if (expanded.length > 100 || expanded.reduce((n, item) => n + item.size, 0) > 100 * 1024 * 1024) throw new Error("Batch hasil ekstraksi melewati batas 100 file / 100 MB.");
      }
      selected = expanded;
      if (selected.length === 1 && selected[0].name.toLowerCase().endsWith(".json")) {
        const jsonText = await selected[0].text();
        let jsonValue: unknown;
        try { jsonValue = JSON.parse(jsonText); } catch { throw new Error("JSON tidak valid."); }
        const restored = snapshotSchema.safeParse(jsonValue);
        if (restored.success) {
          if (!window.confirm("Pulihkan backup dan ganti data dashboard saat ini?")) return;
          await saveHistory(restored.data);
          setDatasets(restored.data.datasets); setFitSessions(restored.data.fitSessions); setCheckIns(restored.data.checkIns);
          setMaxHr(restored.data.profile.maxHr); setRestingHr(restored.data.profile.restingHr);
          return;
        }
      }
      const csvFiles = selected.filter((file) => file.name.toLowerCase().endsWith(".csv"));
      const xmlFiles = selected.filter((file) => /\.(tcx|gpx)$/i.test(file.name));
      const fitFiles = selected.filter((file) => file.name.toLowerCase().endsWith(".fit"));
      const jsonFiles = selected.filter((file) => file.name.toLowerCase().endsWith(".json"));
      if (csvFiles.length + xmlFiles.length + fitFiles.length + jsonFiles.length !== selected.length) throw new Error("Gunakan CSV, FIT, TCX, GPX, ZIP, backup JSON, atau output JSON Taxuspt/garmin_mcp.");
      const parsed = [
        ...await Promise.all(csvFiles.map(async (file) => parseGarminFile(file.name, await file.text()))),
        ...await Promise.all(xmlFiles.map(async (file) => parseGpsXmlFile(file.name, await file.text()))),
        ...(await Promise.all(jsonFiles.map(async (file) => parseGarminMcpJson(file.name, await file.text())))).flat(),
      ];
      const incomingFits = fitFiles.length ? await Promise.all(fitFiles.map(async (file) => (await import("./fit-data")).parseFitFile(file))) : [];
      if (parsed.some(dataset => !datasetSchema.safeParse(dataset).success) || incomingFits.some(session => !fitSchema.safeParse(session).success)) throw new Error("Data mengandung nilai/tanggal tidak valid atau melewati batas aman.");
      const recognized = parsed.filter((dataset) => dataset.kind !== "unknown" && dataset.recordCount > 0);
      if (!recognized.length && !incomingFits.length) throw new Error("Tidak ada format Garmin yang dikenali dalam file pilihan.");
      const warnings = parsed.filter((dataset) => dataset.warning).map((dataset) => `${dataset.name}: ${dataset.warning}`);
      setStorageStatus("Menyimpan perubahan…");
      setDatasets((current) => {
        return [...current, ...recognized];
      });
      setFitSessions((current) => {
        const incomingIds = new Set(incomingFits.map((session) => session.id));
        return [...current.filter((session) => !incomingIds.has(session.id)), ...incomingFits].sort((a, b) => a.date.localeCompare(b.date));
      });
      if (warnings.length) setError(warnings.join(" "));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "File tidak dapat dibaca.");
    } finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    void readFiles(event.dataTransfer.files);
  }

  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void readFiles(event.target.files);
  }

  function loadSample() {
    setDatasets([parseGarminFile("Activities.csv", sampleCsv)]);
    setFitSessions([]);
    setError("");
  }

  function clearData() {
    void handleClearHistory();
  }

  async function handleClearHistory() {
    if (!window.confirm("Hapus semua data, check-in, dan histori lokal? Tidak bisa dibatalkan tanpa backup.")) return;
    try {
      await clearHistory();
      localStorage.removeItem("garmin-lab-checkins"); localStorage.removeItem("garmin-lab-profile");
      setDatasets([]); setFitSessions([]); setCheckIns([]); setError("");
      if (inputRef.current) inputRef.current.value = "";
    } catch { setError("Histori gagal dihapus. Data saat ini tetap dipertahankan."); }
  }

  function saveCheckIn() {
    const activity = activities.find((item) => item.id === selectedActivityId);
    if (!activity) return;
    const value = (key: keyof typeof form) => form[key].trim() === "" ? NaN : Number(form[key]);
    const checkIn: CheckIn = {
      id: `${activity.id}-${Date.now()}`,
      activityId: activity.id,
      date: activity.date,
      rpe: value("rpe"),
      pain: value("pain"),
      soreness: value("soreness"),
      fatigue: value("fatigue"),
      sleepQuality: value("sleepQuality"),
      stress: value("stress"),
      mood: value("mood"),
      painLocation: form.painLocation.trim(),
    };
    const validated = checkInSchema.safeParse(checkIn);
    if (!validated.success) { setError("Isi seluruh skor check-in dengan angka 0–10 dan lokasi nyeri maksimal 500 karakter."); return; }
    setCheckIns((current) => [...current.filter((item) => item.activityId !== activity.id), validated.data]);
    setError("");
  }

  function downloadSummary() {
    const result = snapshotSchema.safeParse({ version: 1, profile: { maxHr, restingHr }, datasets, fitSessions, checkIns });
    if (!result.success) { setError("Perbaiki profil HR/data sebelum mengunduh backup."); return; }
    const payload = result.data;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "garmin-lab-backup.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadFitCsv() {
    const header = ["date", "sport", "duration_min", "distance_km", "avg_hr_bpm", "zone_2_min", "pa_hr_drift_percent"];
    const rows = filteredFitTimeline.map(({ session, analysis }) => [session.date, session.sport, session.durationMin?.toFixed(1) ?? null, session.distanceKm?.toFixed(2) ?? null, session.avgHr?.toFixed(0) ?? null, analysis.zoneMinutes[1].toFixed(1), analysis.paHrDriftPercent?.toFixed(2) ?? null]);
    const csv = [header, ...rows].map((row) => row.map((value) => csvCell(value)).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`${csv}\n`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "garmin-fit-longitudinal.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadMarkdown() {
    const lines = ["# Garmin Sport Science Evaluation", "", `Generated: ${new Date().toISOString()}`, `Profile: HRmax ${maxHr} bpm, HRrest ${restingHr} bpm`, "", "## Weekly trend", "", "| Week | Sessions | Duration (min) | Distance (km) | sRPE load | HR proxy | Hard sessions |", "|---|---:|---:|---:|---:|---:|---:|", ...weeks.map((week) => `| ${week.label} | ${week.sessions} | ${week.duration.toFixed(0)} | ${week.distance.toFixed(2)} | ${week.rpeLoad.toFixed(0)} | ${week.hrProxyLoad.toFixed(0)} | ${week.hardSessions} |`), "", "## Recovery check-ins", "", "| Date | Activity | RPE | Pain | Sleep quality | Load |", "|---|---|---:|---:|---:|---:|", ...recoveryRows.map((activity) => { const checkIn = checkIns.find((item) => item.activityId === activity.id); return `| ${activity.date} | ${activity.type.replaceAll("|", "\\|")} | ${checkIn?.rpe ?? "—"} | ${checkIn?.pain ?? "—"} | ${checkIn?.sleepQuality ?? "—"} | ${activity.load?.toFixed(0) ?? "—"} |`; }), "", "Interpretation is descriptive and not a medical diagnosis."];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "garmin-sport-science-report.md";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const chartMax = Math.max(1, ...weeks.map((week) => week.duration));
  const dataReady = bundle.sources.length > 0 || fitSessions.length > 0;
  const inputCount = bundle.sources.reduce((sum, source) => sum + source.recordCount, 0) + fitSessions.reduce((sum, session) => sum + session.records.length, 0);
  const sourceCount = bundle.sources.length + fitSessions.length;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Garmin Training Lab home">
          <span className="brandMark">GL</span>
          <span><strong>Garmin Lab</strong><small>Sport-science review</small></span>
        </a>
        <nav className="topnav" aria-label="Navigasi utama">
          {dataReady && <><a href="#recovery">Recovery</a><a href="#training">Training</a><a href="#performance">Performance</a></>}
          <Link className="pageLink" href="/live">Live MCP <span aria-hidden="true">↗</span></Link>
        </nav>
        <div className="privacyPill"><span className="statusDot" /> Diproses lokal</div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">Garmin export · evidence-informed analysis</div>
        <h1>Dari data wearable<br /><em>menjadi konteks latihan.</em></h1>
        <p>Masukkan seluruh export Garmin sekaligus. Dashboard memisahkan fakta, metrik turunan, dan interpretasi agar keputusan tetap transparan.</p>
      </section>

      <section className="workspace" aria-label="Garmin analysis workspace">
        <div className="uploadPanel">
          <input ref={inputRef} type="file" aria-label="File Garmin atau backup" multiple accept=".csv,.fit,.tcx,.gpx,.zip,.json" onChange={onFileInput} hidden />
          <button type="button" disabled={!storageReady || busy} className={`dropZone ${dragging ? "dragging" : ""} ${dataReady ? "hasFile" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()} aria-label="Pilih atau tarik file Garmin atau backup">
            <div className="dropIcon"><span /><span /><span /></div>
            {dataReady ? <>
              <span className="fileBadge">{sourceCount} FILE TERBACA</span>
              <h2>{inputCount} rekaman siap dianalisis</h2>
              <p>Tarik file tambahan untuk melengkapi atau mengganti kategori data.</p>
            </> : <>
              <h2>Tarik semua export Garmin</h2>
              <p>CSV/FIT Garmin serta output JSON Taxuspt/garmin_mcp dapat dipilih sekaligus.</p>
              <div className="fileTypes"><span>Multi-file</span><span>CSV + FIT</span><span>Local only</span></div>
            </>}
          </button>
          <p role="status">{busy ? "Memproses file…" : storageStatus}</p>
          <p>Backup JSON dapat dipulihkan lewat pemilih file yang sama. Data lokal dapat hilang jika penyimpanan browser dibersihkan.</p>
          {error && <div className="errorBanner" role="alert"><strong>Catatan import.</strong><span>{error}</span></div>}
          <div className="uploadActions"><button className="textButton" disabled={!storageReady || busy} onClick={loadSample}>Coba data contoh</button>{dataReady && <button className="textButton danger" disabled={busy} onClick={clearData}>Hapus semua data</button>}</div>
        </div>

        <aside className="profileCard">
          <div className="sectionLabel">01 · Profil fisiologis</div>
          <h3>Kalibrasi intensitas</h3>
          <p>HR bulanan tertinggi bukan selalu HRmax fisiologis. Nilai profil tetap kamu kendalikan.</p>
          <label><span>Maximum heart rate</span><div className="inputUnit"><input type="number" min="100" max="230" value={maxHr} onChange={(event) => setMaxHr(Number(event.target.value))} /><small>bpm</small></div></label>
          <label><span>Resting heart rate</span><div className="inputUnit"><input type="number" min="30" max="120" value={restingHr} onChange={(event) => setRestingHr(Number(event.target.value))} /><small>bpm</small></div></label>
          <div className="formula"><span>Heart-rate reserve</span><strong>{Math.max(0, maxHr - restingHr)} bpm</strong></div>
          <p className="tinyNote">HR proxy hanya dipakai untuk aktivitas aerobik. Strength dan breathwork tidak diberi load dari HR tanpa session-RPE.</p>
        </aside>
      </section>

      {dataReady ? <section className="results" aria-live="polite">
        <div className="resultsHeader">
          <div><div className="sectionLabel">02 · Ringkasan data</div><h2>Training overview</h2><p>{bundle.activities[0]?.date ?? bundle.sources[0]?.name} — {bundle.activities.at(-1)?.date ?? `${bundle.sources.length} sumber`}</p></div>
          <button className="primaryButton" onClick={downloadSummary}>Unduh backup JSON</button>
          <button className="secondaryButton" onClick={downloadMarkdown}>Unduh laporan Markdown</button>
          <button className="secondaryButton" onClick={() => window.print()}>Cetak / PDF</button>
        </div>

        <div className="sourceRail" aria-label="Sumber data yang terbaca">
          {bundle.sources.map((source) => <div key={`${source.kind}-${source.name}`}><span className="sourceCheck">✓</span><span><strong>{KIND_LABELS[source.kind]}</strong><small>{source.recordCount} rekaman</small></span></div>)}
          {fitSessions.map((session) => <div key={session.id}><span className="sourceCheck">FIT</span><span><strong>{session.sport}</strong><small>{session.records.length} titik data</small></span></div>)}
        </div>

        <div className="metricGrid five">
          <article><span>Total sesi</span><strong>{activities.length}</strong><small>{weeks.length} minggu aktivitas</small></article>
          <article><span>Durasi</span><strong>{formatDuration(totals.duration)}</strong><small>{(totals.duration / Math.max(1, weeks.length)).toFixed(0)} menit/minggu</small></article>
          <article><span>Jarak run + walk</span><strong>{totals.distance.toFixed(1)}<i> km</i></strong><small>external load terukur</small></article>
          <article><span>Internal load</span><strong>{totals.rpeLoad.toFixed(0)}<i> sRPE AU</i></strong><small>HR proxy terpisah: {totals.hrProxyLoad.toFixed(0)} AU</small></article>
          <article><span>Kelengkapan data</span><strong className="wordMetric">{completenessLabel(bundle)}</strong><small>cakupan input, bukan confidence klinis</small></article>
        </div>

        <section className="reportSection" id="recovery">
          <div className="sectionHeading"><div><span>Recovery context</span><h2>Tidur, HRV, dan respons subjektif</h2></div><p>Tidak digabung menjadi satu skor kesiapan otomatis.</p></div>
          <div className="recoveryGrid">
            <article className="signalCard">
              <span className="signalLabel">Tidur terbaru</span>
              <strong>{latestSleep?.durationHours !== null && latestSleep?.durationHours !== undefined ? `${latestSleep.durationHours.toFixed(1)} jam` : "—"}</strong>
              <p>{latestSleep ? `Skor ${latestSleep.score ?? "—"}/100 · kebutuhan ${latestSleep.needHours?.toFixed(1) ?? "—"} jam` : "Import Tidur.csv untuk melihat tren."}</p>
              <MiniLineChart points={sleepTrend(bundle.sleep)} color="#6f60aa" />
            </article>
            <article className="signalCard">
              <span className="signalLabel">HRV semalaman</span>
              <strong>{latestHrv?.nightly !== null && latestHrv?.nightly !== undefined ? `${latestHrv.nightly.toFixed(0)} ms` : "—"}</strong>
              <p>{latestHrv?.baselineLow !== null && latestHrv?.baselineLow !== undefined ? `Baseline Garmin ${latestHrv.baselineLow}–${latestHrv.baselineHigh} ms` : "Import Status HRV.csv untuk melihat baseline."}</p>
              <MiniLineChart points={hrvTrend(bundle.hrv)} color="#1e5b46" format={(value) => `${value.toFixed(0)} ms`} />
            </article>
            <article className="signalCard">
              <span className="signalLabel">Daily health MCP</span>
              <strong>{latestDailyHealth?.restingHr !== null && latestDailyHealth?.restingHr !== undefined ? `${latestDailyHealth.restingHr.toFixed(0)} bpm` : "—"}</strong>
              <p>{latestDailyHealth ? `Body Battery ${latestDailyHealth.bodyBatteryCurrent ?? "—"} · stres ${latestDailyHealth.avgStress ?? "—"} · ${latestDailyHealth.steps?.toLocaleString("id-ID") ?? "—"} langkah` : "Import output get_stats dari Taxuspt/garmin_mcp."}</p>
              <MiniLineChart points={bundle.dailyHealth.map((point) => ({ date: point.date, label: formatDate(point.date), value: point.restingHr }))} color="#b2603b" format={(value) => `${value.toFixed(0)} bpm`} />
            </article>
            <article className={`contextCard ${recoveryContext.tone}`}>
              <span className="signalLabel">Interpretasi hari ini</span>
              <strong>{recoveryContext.title}</strong>
              <ul>{recoveryContext.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              <small>Gejala dan penilaian klinis selalu mengalahkan data wearable.</small>
            </article>
            <article className="contextCard neutral">
              <span className="signalLabel">Rekomendasi sesi</span>
              <strong>{trainingRecommendation.title}</strong>
              <p>{trainingRecommendation.body}</p>
              <small>Rekomendasi informasional; konfirmasi dengan kondisi tubuh.</small>
            </article>
          </div>
        </section>

        <section className="reportSection" id="training">
          <div className="sectionHeading"><div><span>Training load</span><h2>Volume dan distribusi intensitas</h2></div><p>Perubahan load ditampilkan secara deskriptif, bukan sebagai injury-risk score.</p></div>
          <div className="analysisGrid">
            <article className="chartCard">
              <div className="cardHeading"><div><span>External volume</span><h3>Durasi aktivitas per minggu</h3></div><small>menit</small></div>
              <div className="barChart" aria-label="Grafik durasi latihan mingguan">
                {weeks.map((week) => <div className="barColumn" key={week.label}><span className="barValue">{week.duration.toFixed(0)}</span><div className="barTrack"><div className="barFill" style={{ height: `${Math.max(8, week.duration / chartMax * 100)}%` }} /></div><small>{week.label.replace(" · ", " ")}</small></div>)}
              </div>
              <div className="chartLegend"><span><i className="legendBlock" /> Semua durasi aktivitas</span><span>Bandingkan bersama jenis sesi dan recovery</span></div>
            </article>
            <article className="distributionCard">
              <div className="cardHeading"><div><span>Session classification</span><h3>Intensitas dominan</h3></div><small>berdasarkan avg HR/RPE</small></div>
              {(["easy", "moderate", "hard", "unknown"] as const).map((key) => {
                const value = intensity[key];
                const width = activities.length ? value / activities.length * 100 : 0;
                return <div className="distributionRow" key={key}><div><span>{key === "easy" ? "Easy" : key === "moderate" ? "Moderate" : key === "hard" ? "Hard" : "Belum diklasifikasi"}</span><strong>{value} sesi</strong></div><div className="distributionTrack"><span className={key} style={{ width: `${width}%` }} /></div></div>;
              })}
              <p className="cardNote">CSV hanya menyediakan HR rata-rata, bukan time-in-zone. Klasifikasi ini adalah estimasi dominan sesi.</p>
            </article>
            {latestTrainingLoad && <article className="distributionCard">
              <div className="cardHeading"><div><span>Garmin MCP</span><h3>Training-load trend terbaru</h3></div><small>{formatDate(latestTrainingLoad.date)}</small></div>
              <div className="distributionRow"><div><span>Acute load (ATL)</span><strong>{latestTrainingLoad.atl?.toFixed(1) ?? "—"}</strong></div></div>
              <div className="distributionRow"><div><span>Chronic load (CTL)</span><strong>{latestTrainingLoad.ctl?.toFixed(1) ?? "—"}</strong></div></div>
              <div className="distributionRow"><div><span>Balance (TSB)</span><strong>{latestTrainingLoad.tsb?.toFixed(1) ?? "—"}</strong></div></div>
              <div className="distributionRow"><div><span>ACWR</span><strong>{latestTrainingLoad.acwr?.toFixed(2) ?? "—"}</strong></div></div>
              <p className="cardNote">Metrik turunan Garmin ditampilkan apa adanya sebagai konteks deskriptif; bukan batas aman cedera atau instruksi latihan otomatis.</p>
            </article>}
          </div>
          <article className="tableCard fullWidth">
            <div className="cardHeading"><div><span>4–12 week trend</span><h3>Tren volume dan beban mingguan</h3></div><small>{Math.min(12, weeks.length)} minggu terakhir</small></div>
            <div className="tableScroll"><table><caption>Tren volume dan beban mingguan; minggu tanpa rekaman ditampilkan sebagai nol</caption><thead><tr><th scope="col">Minggu</th><th scope="col">Sesi</th><th scope="col">Durasi</th><th scope="col">Jarak</th><th scope="col">sRPE</th><th scope="col">HR proxy</th><th scope="col">Sesi hard</th></tr></thead><tbody>{[...weeks].reverse().map((week) => <tr key={week.label}><td>{week.label}</td><td>{week.sessions}</td><td>{week.duration.toFixed(0)} min</td><td>{week.distance.toFixed(2)} km</td><td>{week.rpeLoad.toFixed(0)}</td><td>{week.hrProxyLoad.toFixed(0)}</td><td>{week.hardSessions}</td></tr>)}</tbody></table></div>
            <p className="cardNote">Load mengutamakan Session-RPE bila tersedia; jika tidak, digunakan proxy HR untuk aktivitas aerobik. Perubahan volume bukan prediksi cedera.</p>
          </article>
          {latestFit && <div className="analysisGrid">
            <article className="distributionCard">
              <div className="cardHeading"><div><span>FIT per-second data</span><h3>Time in heart-rate zones</h3></div><small>%HRR personal</small></div>
              {latestFit.analysis.zoneMinutes.map((minutes, index) => {
                const width = latestFit.analysis.zoneTotalMin ? minutes / latestFit.analysis.zoneTotalMin * 100 : 0;
                const tone = index < 2 ? "easy" : index === 2 ? "moderate" : "hard";
                return <div className="distributionRow" key={`zone-${index + 1}`}><div><span>Zone {index + 1}</span><strong>{minutes.toFixed(1)} min</strong></div><div className="distributionTrack"><span className={tone} style={{ width: `${width}%` }} /></div></div>;
              })}
              <p className="cardNote">Dihitung dari record HR FIT dengan zona HRR profilmu. Jeda data lebih dari 10 detik tidak diimputasi.</p>
            </article>
            <article className="signalCard compactStats">
              <span className="signalLabel">FIT session terbaru</span><strong>{latestFit.session.sport}<i> · {latestFit.session.date}</i></strong>
              <div><span>Pa:HR drift proxy</span><b>{latestFit.analysis.paHrDriftPercent === null ? "—" : `${latestFit.analysis.paHrDriftPercent.toFixed(1)}%`}</b></div>
              <div><span>Recovery HR 60 detik</span><b>{latestFit.analysis.recoveryHr60 === null ? "—" : `${latestFit.analysis.recoveryHr60} bpm`}</b></div>
              <div><span>Record terbaca</span><b>{latestFit.session.records.length}</b></div>
              <div><span>Kualitas data</span><b>{latestFit.analysis.quality}</b></div>
              <ul>{latestFit.analysis.qualityFlags.map((flag) => <li key={flag}>{flag}</li>)}</ul>
              <details><summary>Lap FIT ({latestFit.session.laps?.length ?? 0})</summary>
                <p>Lap berasal dari rekaman Garmin. Jeda timestamp pada tabel longitudinal bukan bukti auto-pause atau interval.</p>
                <table><caption>Lap sesi FIT terbaru</caption><thead><tr><th scope="col">Lap</th><th scope="col">Durasi (min)</th><th scope="col">Jarak (km)</th><th scope="col">Avg HR</th><th scope="col">Intensitas rekaman</th></tr></thead><tbody>{latestFit.session.laps?.map((lap, index) => <tr key={`${lap.startMs}-${index}`}><th scope="row">{index + 1}</th><td>{lap.durationMin?.toFixed(1) ?? "—"}</td><td>{lap.distanceKm?.toFixed(2) ?? "—"}</td><td>{lap.avgHr ?? "—"}</td><td>{lap.intensity}</td></tr>)}</tbody></table>
              </details>
              <p>Pa:HR hanya muncul untuk sesi ≥20 menit dengan speed + HR dan cakupan data yang memadai. Recovery HR hanya muncul jika FIT merekam 60 detik setelah timer berhenti.</p>
            </article>
          </div>}
          {fitTimeline.length > 1 && <article className="tableCard fullWidth">
            <div className="cardHeading"><div><span>FIT longitudinal analysis</span><h3>Perbandingan sesi dari waktu ke waktu</h3></div><small>{filteredFitTimeline.length} dari {fitTimeline.length} sesi</small></div>
            <div className="fitFilters" aria-label="Filter analisis longitudinal FIT">
              <label><span>Olahraga</span><select value={fitSport} onChange={(event) => setFitSport(event.target.value)}><option value="all">Semua olahraga</option>{fitSports.map((sport) => <option key={sport} value={sport}>{sport}</option>)}</select></label>
              <label><span>Dari tanggal</span><input type="date" value={fitFrom} onChange={(event) => setFitFrom(event.target.value)} /></label>
              <label><span>Sampai tanggal</span><input type="date" value={fitTo} onChange={(event) => setFitTo(event.target.value)} /></label>
              <button type="button" className="secondaryButton" onClick={() => { setFitSport("all"); setFitFrom(""); setFitTo(""); }}>Reset filter</button>
              <button type="button" className="secondaryButton" onClick={downloadFitCsv} disabled={!filteredFitTimeline.length}>Ekspor CSV</button>
              <button type="button" className="secondaryButton" onClick={downloadMarkdown}>Ekspor Markdown</button>
            </div>
            <div className="metricGrid five">
              <div className="signalCard compactStats"><span className="signalLabel">Sesi</span><strong>{filteredFitTimeline.length}</strong><p>File FIT yang dianalisis</p></div>
              <div className="signalCard compactStats"><span className="signalLabel">Total jarak</span><strong>{fitTotalDistance.toFixed(1)}<i> km</i></strong><p>Jika jarak tersedia</p></div>
              <div className="signalCard compactStats"><span className="signalLabel">Rata-rata Pa:HR</span><strong>{fitMeanDrift === null ? "—" : `${fitMeanDrift.toFixed(1)}%`}</strong><p>Hanya sesi ≥20 menit</p></div>
            </div>
            <div className="tableScroll"><table><caption>Perbandingan longitudinal sesi FIT</caption><thead><tr><th scope="col">Tanggal</th><th scope="col">Olahraga</th><th scope="col">Durasi</th><th scope="col">Jarak</th><th scope="col">Avg HR</th><th scope="col">Zona 2</th><th scope="col">Pa:HR drift</th><th scope="col">Kualitas</th><th scope="col">Segmen</th></tr></thead><tbody>{[...filteredFitTimeline].reverse().map(({ session, analysis }) => <tr key={session.id}><td>{session.date}</td><td>{session.sport}</td><td>{session.durationMin === null ? "—" : `${session.durationMin.toFixed(0)} min`}</td><td>{session.distanceKm === null ? "—" : `${session.distanceKm.toFixed(2)} km`}</td><td>{session.avgHr === null ? "—" : `${session.avgHr.toFixed(0)} bpm`}</td><td>{analysis.zoneMinutes[1].toFixed(1)} min</td><td>{analysis.paHrDriftPercent === null ? "—" : `${analysis.paHrDriftPercent.toFixed(1)}%`}</td><td>{analysis.quality}</td><td>{analysis.segments.length}</td></tr>)}</tbody></table></div>
            <p className="cardNote">Pa:HR adalah proxy deskriptif berbasis kecepatan dan HR; bandingkan terutama pada rute, durasi, intensitas, dan kondisi yang serupa.</p>
          </article>}
          <article className="insightCard fullWidth">
            <div className="cardHeading"><div><span>Evidence-informed</span><h3>Interpretasi utama</h3></div><div className="labBadge">LAB</div></div>
            <div className="insightList horizontal">{insights.map((insight) => <div className={`insight ${insight.tone}`} key={insight.label}><div><span>{insight.label}</span><strong>{insight.title}</strong></div><p>{insight.body}</p></div>)}</div>
          </article>
        </section>

        <section className="reportSection" id="performance">
          <div className="sectionHeading"><div><span>Performance trends</span><h2>Kapasitas aerobik dan running dynamics</h2></div><p>Tren personal lebih penting daripada target universal.</p></div>
          <div className="performanceGrid">
            <article className="signalCard">
              <span className="signalLabel">VO₂max Garmin</span><strong>{latestVo2?.value?.toFixed(1) ?? "—"}</strong>
              <p>{trendDelta(vo2Points) !== null ? `${trendDelta(vo2Points)! >= 0 ? "+" : ""}${trendDelta(vo2Points)!.toFixed(1)} dari titik pertama` : "Belum cukup titik untuk tren."}</p>
              <MiniLineChart points={vo2Points} color="#1e5b46" format={(value) => value.toFixed(1)} />
            </article>
            <article className="signalCard">
              <span className="signalLabel">Usia kebugaran Garmin</span><strong>{latestFitnessAge?.value?.toFixed(0) ?? "—"}<i> tahun</i></strong>
              <p>Metrik proprietary Garmin. Gunakan sebagai konteks tren, bukan hasil laboratorium.</p>
              <MiniLineChart points={fitnessAgePoints} color="#dd8d2e" />
            </article>
            <article className="signalCard compactStats">
              <span className="signalLabel">Breathwork response</span><strong>{breathwork.sessions}<i> sesi</i></strong>
              <div><span>Perubahan stress rata-rata</span><b>{breathwork.stressChange !== null ? `${breathwork.stressChange.toFixed(1)}` : "—"}</b></div>
              <div><span>Respiration rata-rata</span><b>{breathwork.respiration !== null ? `${breathwork.respiration.toFixed(1)}/min` : "—"}</b></div>
              <p>Respons akut observasional. Bukan klaim efek terapeutik.</p>
            </article>
          </div>

          <article className="dynamicsCard">
            <div className="cardHeading"><div><span>Pace-matched approximation</span><h3>Running dynamics terbaru vs sesi sebanding</h3></div><small>{runningComparison.recent.length} terbaru · {runningComparison.previous.length} pembanding</small></div>
            <div className="dynamicsGrid">
              {[
                ["Cadence", runningComparison.cadence, "spm"],
                ["Panjang langkah", runningComparison.stride, "m"],
                ["Ground contact", runningComparison.gct, "ms"],
                ["Vertical ratio", runningComparison.verticalRatio, "%"],
              ].map(([label, values, unit]) => {
                const metric = values as { recent: number | null; previous: number | null };
                const delta = metric.recent !== null && metric.previous !== null ? metric.recent - metric.previous : null;
                return <div key={label as string}><span>{label as string}</span><strong>{metric.recent !== null ? metric.recent.toFixed(unit === "m" ? 2 : 1) : "—"}<i> {unit as string}</i></strong><small>{delta !== null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(unit === "m" ? 2 : 1)} vs pembanding` : "Data pembanding belum cukup"}</small></div>;
              })}
            </div>
            <p className="cardNote">Perubahan cadence atau biomekanik tidak otomatis baik atau buruk. Interpretasi dibatasi pada sesi dengan pace ±15% dari kelompok terbaru.</p>
          </article>
        </section>

        <section className="reportSection checkInSection" id="checkin">
          <div className="sectionHeading"><div><span>Subjective monitoring</span><h2>Check-in setelah latihan</h2></div><p>Input tersimpan hanya di browser ini.</p></div>
          <div className="checkInCard">
            <label className="wide"><span>Aktivitas</span><select value={selectedActivityId} onChange={(event) => setForm({ ...form, activityId: event.target.value })}>{[...activities].reverse().map((activity) => <option key={activity.id} value={activity.id}>{activity.date} · {activity.type} · {activity.durationMin?.toFixed(0) ?? "—"} min</option>)}</select></label>
            {([ ["rpe", "Session-RPE"], ["pain", "Nyeri"], ["soreness", "Soreness"], ["fatigue", "Fatigue"], ["sleepQuality", "Kualitas tidur"], ["stress", "Stress"], ["mood", "Mood"] ] as const).map(([key, label]) => <label key={key}><span>{label} <small>0–10</small></span><input type="number" min="0" max="10" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}
            <label className="wide"><span>Lokasi nyeri, bila ada</span><input type="text" placeholder="Contoh: telapak kaki kanan" value={form.painLocation} onChange={(event) => setForm({ ...form, painLocation: event.target.value })} /></label>
            <button className="primaryButton" onClick={saveCheckIn}>Simpan check-in</button>
          </div>
          {recoveryRows.length > 0 && <article className="tableCard recoveryTable">
            <div className="cardHeading"><div><span>Objective × subjective</span><h3>Respons latihan terbaru</h3></div><small>{recoveryRows.length} check-in</small></div>
            <div className="tableScroll"><table><caption>Perbandingan check-in subjektif dengan beban aktivitas</caption><thead><tr><th scope="col">Tanggal</th><th scope="col">Aktivitas</th><th scope="col">RPE</th><th scope="col">Nyeri</th><th scope="col">Tidur</th><th scope="col">Load</th><th scope="col">Metode load</th></tr></thead><tbody>{recoveryRows.map((activity) => { const checkIn = checkIns.find((item) => item.activityId === activity.id); return <tr key={activity.id}><td>{activity.date}</td><td>{activity.type}</td><td>{checkIn?.rpe ?? "—"}/10</td><td>{checkIn?.pain ?? "—"}/10</td><td>{checkIn?.sleepQuality ?? "—"}/10</td><td>{activity.load?.toFixed(0) ?? "—"}</td><td>{activity.loadMethod}</td></tr>; })}</tbody></table></div>
            <p className="cardNote">Gunakan tabel ini untuk menemukan ketidaksesuaian—misalnya load objektif rendah tetapi RPE/nyeri tinggi—bukan untuk menghasilkan diagnosis otomatis.</p>
          </article>}
        </section>

        <article className="tableCard">
          <div className="cardHeading"><div><span>Activity log</span><h3>Aktivitas yang terbaca</h3></div><small>{activities.length} baris</small></div>
          <div className="tableScroll"><table><thead><tr><th>Tanggal</th><th>Aktivitas</th><th>Durasi</th><th>Jarak</th><th>Pace</th><th>Avg HR</th><th>Intensitas</th><th>Load</th></tr></thead><tbody>{[...activities].reverse().map((activity) => <tr key={activity.id}><td>{activity.date}</td><td><span className="activityType">{activity.type}</span></td><td>{activity.durationMin ? `${activity.durationMin.toFixed(0)} min` : "—"}</td><td>{activity.distanceKm ? `${activity.distanceKm.toFixed(2)} km` : "—"}</td><td>{paceLabel(activityPaceSeconds(activity))}</td><td>{activity.avgHr ? `${activity.avgHr.toFixed(0)} bpm` : "—"}</td><td><span className={`intensityTag ${activity.intensity}`}>{activity.intensity}</span></td><td><strong>{activity.load?.toFixed(0) ?? "—"}</strong><small className="method">{activity.loadMethod}</small></td></tr>)}</tbody></table></div>
        </article>

        <div className="methodology">
          <div className="sectionLabel">03 · Metode dan batasan</div>
          <div className="methodGrid">
            <div><strong>Load sesuai jenis aktivitas</strong><p>Session-RPE diprioritaskan. HR proxy hanya digunakan pada aktivitas aerobik dan tidak diklaim sebagai TRIMP tervalidasi.</p></div>
            <div><strong>Recovery tanpa skor tunggal</strong><p>Sleep dan HRV dibaca terhadap baseline personal bersama check-in subjektif. Satu malam tidak menentukan sesi secara otomatis.</p></div>
            <div><strong>Tidak memprediksi cedera</strong><p>Perubahan volume adalah konteks untuk diskusi. Nyeri, bengkak, pincang, atau gejala medis memerlukan keputusan manusia dan penilaian yang sesuai.</p></div>
          </div>
        </div>
      </section> : <section className="emptyBrief">
        <div><span>01</span><strong>Masukkan semua export</strong><p>Pilih CSV dan FIT sekaligus. File tetap berada di browser.</p></div>
        <div><span>02</span><strong>Validasi konteks</strong><p>Aktivitas, sleep, HRV, dan performa dibaca terpisah.</p></div>
        <div><span>03</span><strong>Catat respons tubuh</strong><p>RPE, nyeri, fatigue, stress, dan mood melengkapi wearable.</p></div>
      </section>}

      <footer><span>Garmin Lab · Local analysis</span><p>Untuk edukasi dan refleksi latihan. Bukan alat diagnosis medis.</p></footer>
    </main>
  );
}
