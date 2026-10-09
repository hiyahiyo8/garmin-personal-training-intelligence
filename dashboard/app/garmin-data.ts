export type DatasetKind =
  | "activities"
  | "sleep"
  | "hrv"
  | "vo2"
  | "fitnessAge"
  | "monthlyDistance"
  | "monthlyDuration"
  | "monthlyCalories"
  | "monthlyPace"
  | "monthlySpeed"
  | "monthlyAvgHr"
  | "monthlyMaxHr"
  | "ftp"
  | "dailyHealth"
  | "trainingLoad"
  | "unknown";

export type ActivityCategory = "run" | "walk" | "strength" | "recovery" | "racket" | "other";

export type Activity = {
  id: string;
  date: string;
  type: string;
  category: ActivityCategory;
  durationMin: number | null;
  distanceKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  calories: number | null;
  aerobicTe: number | null;
  cadence: number | null;
  strideLength: number | null;
  verticalRatio: number | null;
  verticalOscillation: number | null;
  groundContactTime: number | null;
  gapSeconds: number | null;
  avgPower: number | null;
  maxPower: number | null;
  steps: number | null;
  bodyBatteryDrained: number | null;
  respiration: number | null;
  stressChange: number | null;
  stressStart: number | null;
  stressEnd: number | null;
};

export type SleepPoint = {
  date: string;
  label: string;
  score: number | null;
  quality: string;
  durationHours: number | null;
  needHours: number | null;
};

export type HrvPoint = {
  date: string;
  nightly: number | null;
  baselineLow: number | null;
  baselineHigh: number | null;
  sevenDayAverage: number | null;
};

export type TrendPoint = {
  date: string;
  label: string;
  value: number | null;
  activityType?: string;
  display?: string;
};

export type ParsedDataset = {
  name: string;
  kind: DatasetKind;
  recordCount: number;
  activities: Activity[];
  sleep: SleepPoint[];
  hrv: HrvPoint[];
  trends: TrendPoint[];
  dailyHealth?: DailyHealthPoint[];
  trainingLoad?: TrainingLoadPoint[];
  warning?: string;
};

export type GarminBundle = {
  activities: Activity[];
  sleep: SleepPoint[];
  hrv: HrvPoint[];
  dailyHealth: DailyHealthPoint[];
  trainingLoad: TrainingLoadPoint[];
  trends: Partial<Record<DatasetKind, TrendPoint[]>>;
  sources: ParsedDataset[];
};

export type DailyHealthPoint = {
  date: string;
  steps: number | null;
  restingHr: number | null;
  avgStress: number | null;
  bodyBatteryCurrent: number | null;
  bodyBatteryHigh: number | null;
  bodyBatteryLow: number | null;
  wakingRespiration: number | null;
};

export type TrainingLoadPoint = {
  date: string;
  atl: number | null;
  ctl: number | null;
  tsb: number | null;
  acwr: number | null;
  status: string;
};

type RawRow = Record<string, string>;

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1,
  feb: 2, februari: 2,
  mar: 3, maret: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6,
  jul: 7, juli: 7,
  ags: 8, agu: 8, agustus: 8, aug: 8,
  sep: 9, september: 9,
  okt: 10, oktober: 10, oct: 10,
  nov: 11, november: 11,
  des: 12, desember: 12, dec: 12,
};

export function normalizeKey(value: string) {
  return value
    .trim()
    .replace(/\uFEFF/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyFile(name: string, text = ""): DatasetKind {
  const key = normalizeKey(name.replace(/\.csv$/i, ""));
  const first = normalizeKey(text.split(/\r?\n/, 1)[0] ?? "");
  const source = `${key} ${first}`;
  if (source.includes("activities") || source.includes("jenis aktivitas tanggal")) return "activities";
  if (source.includes("status hrv") || source.includes("hrv semalaman")) return "hrv";
  if (source.includes("tidur") || source.includes("rata2 skor")) return "sleep";
  if (source.includes("usia kebugaran")) return "fitnessAge";
  if (source.includes("vo2 maks") || source.includes("vo2 max") || source.includes("vo maks")) return "vo2";
  if (source.includes("total waktu aktivitas")) return "monthlyDuration";
  if (source.includes("total jarak")) return "monthlyDistance";
  if (source.includes("kalori aktivitas")) return "monthlyCalories";
  if (source.includes("rata2 pace")) return "monthlyPace";
  if (source.includes("kecepatan rata2")) return "monthlySpeed";
  if (source.includes("rata2 denyut jantung")) return "monthlyAvgHr";
  if (source.includes("denyut jantung maks")) return "monthlyMaxHr";
  if (source.includes("daya ambang batas fungsional")) return "ftp";
  return "unknown";
}

export function csvRows(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  if (cell || row.length) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); }
  return rows;
}

function numberValue(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "--") return null;
  const text = raw.replace(/^'+/, "").replace(/\s/g, "").replace(/(?:bpm|ms|watt|kpj)$/i, "");
  const normalized = text.includes(",") && !text.includes(".") ? text.replace(",", ".") : text.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function durationMinutes(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!text || text === "--") return null;
  if (/^\d+(?::\d{1,2}){1,2}(?:\.\d+)?$/.test(text)) {
    const parts = text.split(":").map(Number);
    const seconds = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
    return seconds / 60;
  }
  const numeric = numberValue(text);
  return numeric === null ? null : numeric;
}

function hoursValue(value: unknown): number | null {
  const text = String(value ?? "").trim().toLowerCase();
  const hours = Number(text.match(/(\d+)\s*j/)?.[1] ?? 0);
  const minutes = Number(text.match(/(\d+)\s*mnt/)?.[1] ?? 0);
  if (!hours && !minutes) return null;
  return hours + minutes / 60;
}

function paceSeconds(value: unknown): number | null {
  const text = String(value ?? "").trim();
  const match = text.match(/(\d{1,3}):(\d{2})/);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  const decimal = numberValue(value);
  return decimal === null ? null : Math.round(decimal * 60);
}

function dateOnly(value: unknown): string | null {
  const text = String(value ?? "").trim();
  const iso = text.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const month = first > 12 ? second : first;
  const day = first > 12 ? first : second;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthDate(value: unknown, anchorYear: number): string | null {
  const fullDate = dateOnly(value);
  if (fullDate) return fullDate;
  const text = normalizeKey(String(value ?? ""));
  const monthName = Object.keys(MONTHS).find((candidate) => new RegExp(`(^| )${candidate}( |$)`).test(text));
  if (!monthName) return null;
  const year = Number(text.match(/\b(20\d{2})\b/)?.[1] ?? anchorYear);
  return `${year}-${String(MONTHS[monthName]).padStart(2, "0")}-01`;
}

function shortDate(value: unknown, anchorYear: number): string | null {
  const text = normalizeKey(String(value ?? ""));
  const monthName = Object.keys(MONTHS).find((candidate) => text.startsWith(`${candidate} `));
  if (!monthName) return null;
  const day = Number(text.match(/\b(\d{1,2})\b/)?.[1]);
  const year = Number(text.match(/\b(20\d{2})\b/)?.[1] ?? anchorYear);
  if (!day) return null;
  return `${year}-${String(MONTHS[monthName]).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function sleepPeriodEnd(value: string, anchorYear: number): string | null {
  const cleaned = normalizeKey(value);
  const year = Number(cleaned.match(/\b(20\d{2})\b/)?.[1] ?? anchorYear);
  const tokens = cleaned.replace(/\b20\d{2}\b/g, "").trim().split(/\s+/).filter(Boolean);
  const monthIndexes = tokens.map((token, index) => MONTHS[token] ? index : -1).filter((index) => index >= 0);
  if (!monthIndexes.length) return null;
  const monthIndex = monthIndexes.at(-1)!;
  const month = MONTHS[tokens[monthIndex]];
  const numbersAfterMonth = tokens.slice(monthIndex + 1).map(Number).filter((item) => Number.isFinite(item) && item >= 1 && item <= 31);
  const fallbackNumbers = tokens.map(Number).filter((item) => Number.isFinite(item) && item >= 1 && item <= 31);
  const day = numbersAfterMonth.at(-1) ?? fallbackNumbers.at(-1);
  if (!day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function rowsToObjects(rows: string[][]): RawRow[] {
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header.trim(), values[index] ?? ""])));
}

function findValue(row: RawRow, names: string[]) {
  const map = new Map(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
  for (const name of names) {
    const found = map.get(normalizeKey(name));
    if (found !== undefined && found !== null && String(found).trim() !== "") return found;
  }
  return "";
}

function activityCategory(type: string): ActivityCategory {
  const key = normalizeKey(type);
  if (key.includes("berlari") || key === "run" || key.includes("running")) return "run";
  if (key.includes("jalan") || key.includes("walk")) return "walk";
  if (key.includes("strength") || key.includes("kekuatan")) return "strength";
  if (key.includes("breathwork") || key.includes("napas") || key.includes("yoga")) return "recovery";
  if (key.includes("raket") || key.includes("tenis") || key.includes("badminton")) return "racket";
  return "other";
}

function parseActivities(rows: string[][]): Activity[] {
  const records = rowsToObjects(rows);
  return records.map((row, index) => {
    const date = dateOnly(findValue(row, ["tanggal", "date", "activity date"]));
    if (!date) return null;
    const type = findValue(row, ["jenis aktivitas", "activity type", "type"]) || "Aktivitas";
    const distance = numberValue(findValue(row, ["jarak", "distance"]));
    return {
      id: `${date}-${normalizeKey(type)}-${index}`,
      date,
      type,
      category: activityCategory(type),
      durationMin: durationMinutes(findValue(row, ["waktu", "time", "duration"])),
      distanceKm: distance !== null && distance > 100 ? distance / 1000 : distance,
      avgHr: numberValue(findValue(row, ["rata2 hr", "avg hr", "average heart rate"])),
      maxHr: numberValue(findValue(row, ["denyut jantung maks", "max hr"])),
      calories: numberValue(findValue(row, ["kalori", "calories"])),
      aerobicTe: numberValue(findValue(row, ["aerobik te", "aerobic te"])),
      cadence: numberValue(findValue(row, ["rata rata cadence lari", "rata2 cadence lari", "average run cadence"])),
      strideLength: numberValue(findValue(row, ["rata rata panjang langkah", "average stride length"])),
      verticalRatio: numberValue(findValue(row, ["rasio vertikal rata rata", "average vertical ratio"])),
      verticalOscillation: numberValue(findValue(row, ["rata rata osilasi vertikal", "average vertical oscillation"])),
      groundContactTime: numberValue(findValue(row, ["rata2 waktu kontak tanah", "average ground contact time"])),
      gapSeconds: paceSeconds(findValue(row, ["rata2 gap", "average gap"])),
      avgPower: numberValue(findValue(row, ["daya rata rata", "average power"])),
      maxPower: numberValue(findValue(row, ["maks daya", "max power"])),
      steps: numberValue(findValue(row, ["langkah", "steps"])),
      bodyBatteryDrained: numberValue(findValue(row, ["body battery terkuras", "body battery drained"])),
      respiration: numberValue(findValue(row, ["resp rata rata", "resp rata-rata", "average respiration"])),
      stressChange: numberValue(findValue(row, ["perubahan stres", "stress change"])),
      stressStart: numberValue(findValue(row, ["awal stres", "starting stress"])),
      stressEnd: numberValue(findValue(row, ["akhir stres", "ending stress"])),
    } satisfies Activity;
  }).filter((activity): activity is Activity => activity !== null).sort((a, b) => a.date.localeCompare(b.date));
}

function parseSleep(rows: string[][], anchorYear: number): SleepPoint[] {
  const headerLength = rows[0]?.length ?? 7;
  return rows.slice(1).map((original) => {
    const row = [...original];
    while (row.length > headerLength) row.splice(0, 2, `${row[0]}, ${row[1]}`);
    const date = sleepPeriodEnd(row[0] ?? "", anchorYear);
    if (!date) return null;
    return {
      date,
      label: row[0],
      score: numberValue(row[1]),
      quality: row[2] ?? "",
      durationHours: hoursValue(row[3]),
      needHours: hoursValue(row[4]),
    };
  }).filter((point): point is SleepPoint => point !== null).sort((a, b) => a.date.localeCompare(b.date));
}

function parseHrv(rows: string[][], anchorYear: number): HrvPoint[] {
  return rows.slice(1).map((row) => {
    const date = shortDate(row[0], anchorYear);
    if (!date) return null;
    const baseline = String(row[2] ?? "").match(/(\d+)\s*ms\s*-\s*(\d+)\s*ms/i);
    return {
      date,
      nightly: numberValue(row[1]),
      baselineLow: baseline ? Number(baseline[1]) : null,
      baselineHigh: baseline ? Number(baseline[2]) : null,
      sevenDayAverage: numberValue(row[3]),
    };
  }).filter((point): point is HrvPoint => point !== null).sort((a, b) => a.date.localeCompare(b.date));
}

function parseMonthly(rows: string[][], kind: DatasetKind, anchorYear: number): TrendPoint[] {
  const dataRows = rows.slice(rows.length && rows[0].some((cell) => normalizeKey(cell).includes("nilai")) ? 1 : 2);
  return dataRows.map((row): TrendPoint | null => {
    const date = monthDate(row[0], anchorYear);
    if (!date) return null;
    const numericCells = row.map(numberValue);
    let value = numericCells.find((item, index) => index > 0 && item !== null) ?? null;
    const display = row.at(-1) ?? "";
    if (kind === "vo2") value = numberValue(row.at(-1));
    if (kind === "monthlyPace") value = paceSeconds(row.at(-1)) ?? paceSeconds(row[1]);
    const activityType = ["monthlyDistance", "monthlyDuration", "monthlyCalories"].includes(kind) ? row[1] : undefined;
    if (activityType) value = numberValue(row[2]);
    return { date, label: row[0], value, activityType, display } satisfies TrendPoint;
  }).filter((point): point is TrendPoint => point !== null && point.value !== null).sort((a, b) => a.date.localeCompare(b.date));
}

function parseFitnessAge(rows: string[][]): TrendPoint[] {
  return rows.slice(1).map((row): TrendPoint | null => {
    const date = dateOnly(row[0]);
    const value = numberValue(row[1]);
    return date && value !== null ? { date, label: date, value } : null;
  }).filter((point): point is TrendPoint => point !== null).sort((a, b) => a.date.localeCompare(b.date));
}

function parseFtp(rows: string[][]): TrendPoint[] {
  return rows.slice(1).map((row): TrendPoint | null => {
    const date = dateOnly(row[0]);
    const value = numberValue(row[1]);
    return date && value !== null ? { date, label: date, value, display: row[1] } : null;
  }).filter((point): point is TrendPoint => point !== null).sort((a, b) => a.date.localeCompare(b.date));
}

export function parseGarminFile(name: string, text: string, anchorYear = new Date().getFullYear()): ParsedDataset {
  const kind = classifyFile(name, text);
  const rows = csvRows(text);
  let activities: Activity[] = [];
  let sleep: SleepPoint[] = [];
  let hrv: HrvPoint[] = [];
  let trends: TrendPoint[] = [];
  if (kind === "activities") activities = parseActivities(rows);
  else if (kind === "sleep") sleep = parseSleep(rows, anchorYear);
  else if (kind === "hrv") hrv = parseHrv(rows, anchorYear);
  else if (kind === "fitnessAge") trends = parseFitnessAge(rows);
  else if (kind === "ftp") trends = parseFtp(rows);
  else if (kind !== "unknown") trends = parseMonthly(rows, kind, anchorYear);
  const recordCount = activities.length + sleep.length + hrv.length + trends.length;
  return {
    name,
    kind,
    recordCount,
    activities,
    sleep,
    hrv,
    trends,
    warning: kind === "unknown" ? "Jenis file belum dikenali." : recordCount ? undefined : "Format dikenali, tetapi tidak ada data yang dapat dibaca.",
  };
}

export function parseGpsXmlFile(name: string, text: string): ParsedDataset {
  const empty = { name, kind: "activities" as DatasetKind, recordCount: 0, activities: [] as Activity[], sleep: [], hrv: [], trends: [] };
  if (typeof DOMParser === "undefined") return { ...empty, warning: "Parser XML hanya tersedia di browser." };
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) return { ...empty, warning: "DOCTYPE/ENTITY tidak didukung." };
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror")) return { ...empty, warning: "File TCX/GPX tidak valid." };
  const elements = (root: Document | Element, localName: string) => [...root.getElementsByTagNameNS("*", localName)];
  const tcx = document.documentElement.localName === "TrainingCenterDatabase";
  const gpx = document.documentElement.localName.toLowerCase() === "gpx";
  if (!tcx && !gpx) return { ...empty, warning: "Root XML bukan TCX atau GPX." };
  const points = tcx ? elements(document, "Trackpoint") : elements(document, "trkpt");
  const times = points.flatMap(point => {
    const node = elements(point, tcx ? "Time" : "time")[0];
    const value = Date.parse(node?.textContent ?? "");
    return Number.isFinite(value) ? [value] : [];
  }).sort((a, b) => a - b);
  const haversine = (a: Element, b: Element) => {
    const rad = Math.PI / 180;
    const [lat1, lon1, lat2, lon2] = [a.getAttribute("lat"), a.getAttribute("lon"), b.getAttribute("lat"), b.getAttribute("lon")].map(Number);
    if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 0;
    const dLat = (lat2 - lat1) * rad; const dLon = (lon2 - lon1) * rad;
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  };
  const tcxDistances = points.map(point => Number(elements(point, "DistanceMeters")[0]?.textContent)).filter(Number.isFinite);
  const gpxDistance = elements(document, "trkseg").reduce((total, segment) => {
    const segmentPoints = elements(segment, "trkpt");
    return total + segmentPoints.slice(1).reduce((sum, point, index) => sum + haversine(segmentPoints[index], point), 0);
  }, 0);
  const distanceKm = tcxDistances.length ? Math.max(...tcxDistances) / 1000 : gpxDistance || null;
  const hrValues = points.flatMap(point => elements(point, tcx ? "HeartRateBpm" : "hr").map(node => Number(tcx ? elements(node, "Value")[0]?.textContent : node.textContent))).filter(value => Number.isFinite(value) && value >= 30 && value <= 240);
  const durationMin = times.length > 1 ? (times.at(-1)! - times[0]) / 60000 : null;
  const date = times.length ? new Date(times[0]).toISOString().slice(0, 10) : "";
  if (!date) return { ...empty, warning: "TCX/GPX tidak memiliki timestamp aktivitas." };
  const recordedType = tcx ? elements(document, "Activity")[0]?.getAttribute("Sport") ?? "TCX activity" : elements(document, "name")[0]?.textContent?.trim() || "GPX activity";
  const category = tcx ? activityCategory(recordedType) : "other";
  const activity: Activity = { id: `xml-${date}-${times[0]}-${normalizeKey(recordedType)}`, date, type: recordedType, category, durationMin, distanceKm, avgHr: hrValues.length ? hrValues.reduce((sum, value) => sum + value, 0) / hrValues.length : null, maxHr: hrValues.length ? Math.max(...hrValues) : null, calories: null, aerobicTe: null, cadence: null, strideLength: null, verticalRatio: null, verticalOscillation: null, groundContactTime: null, gapSeconds: null, avgPower: null, maxPower: null, steps: null, bodyBatteryDrained: null, respiration: null, stressChange: null, stressStart: null, stressEnd: null };
  return { ...empty, recordCount: 1, activities: [activity] };
}

export function combineDatasets(sources: ParsedDataset[]): GarminBundle {
  const unique = sources.filter((source) => source.kind !== "unknown");
  const dedupe = <T extends { date: string }>(rows: T[], key: (row: T) => string) => [...new Map(rows.map(row => [key(row), row])).values()].sort((a, b) => a.date.localeCompare(b.date));
  const trends: Partial<Record<DatasetKind, TrendPoint[]>> = {};
  for (const source of unique) if (source.trends.length) trends[source.kind] = dedupe([...(trends[source.kind] ?? []), ...source.trends], p => `${p.date}-${p.activityType ?? ""}`);
  return {
    activities: dedupe(unique.flatMap(source => source.activities), a => a.id),
    sleep: dedupe(unique.flatMap(source => source.sleep), p => p.date),
    hrv: dedupe(unique.flatMap(source => source.hrv), p => p.date),
    dailyHealth: dedupe(unique.flatMap(source => source.dailyHealth ?? []), p => p.date),
    trainingLoad: dedupe(unique.flatMap(source => source.trainingLoad ?? []), p => p.date),
    trends,
    sources: unique,
  };
}

export function paceLabel(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

export function activityPaceSeconds(activity: Activity) {
  if (!activity.distanceKm || !activity.durationMin) return null;
  return activity.durationMin * 60 / activity.distanceKm;
}

export function mean(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

export function median(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}
