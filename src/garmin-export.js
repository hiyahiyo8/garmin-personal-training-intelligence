import { readFile, stat, readdir } from "node:fs/promises";
import { extname, resolve } from "node:path";

const DATE_KEYS = ["date", "activity date", "start time", "timestamp", "datetime", "tanggal"];
const TYPE_KEYS = ["activity type", "activity", "sport", "sport type", "type", "jenis aktivitas"];
const DURATION_KEYS = ["time", "elapsed time", "duration", "duration seconds", "total time", "waktu", "waktu bergerak", "waktu terlewati"];
const DISTANCE_KEYS = ["distance", "distance km", "distance (km)", "distance_km", "jarak"];
const AVG_HR_KEYS = ["avg hr", "average heart rate", "avg heart rate", "average hr", "avg_hr", "rata2 hr", "rata-rata hr"];
const MAX_HR_KEYS = ["max hr", "maximum heart rate", "max heart rate", "max_hr", "denyut jantung maks", "hr maksimum", "hr maks"];
const CALORIE_KEYS = ["calories", "calories burned", "kcal", "kalori"];
const RPE_KEYS = ["rpe", "session rpe", "s-rpe"];

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\uFEFF]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function findValue(row, keys) {
  const entries = Object.entries(row);
  for (const key of keys) {
    const normalized = normalizeKey(key);
    const found = entries.find(([candidate]) => normalizeKey(candidate) === normalized);
    if (found && String(found[1] ?? "").trim() !== "") return found[1];
  }
  return null;
}

function numberValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const text = String(value).trim().replace(/\s/g, "");
  const normalized = text.includes(",") && !text.includes(".") ? text.replace(",", ".") : text.replace(/,/g, "");
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

function durationSeconds(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (/^\d+(?::\d{1,2}){1,2}$/.test(text)) {
    const parts = text.split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  const numeric = numberValue(text);
  if (numeric === null) return null;
  return numeric > 86400 ? numeric / 1000 : numeric;
}

function dateOnly(value) {
  const text = String(value ?? "").trim();
  const iso = text.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    const first = Number(dmy[1]);
    const second = Number(dmy[2]);
    const month = first > 12 ? second : second > 12 ? first : second;
    const day = first > 12 ? first : second > 12 ? second : first;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${dmy[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
}

function distanceKm(value, keyHint = "") {
  const numeric = numberValue(value);
  if (numeric === null) return null;
  const hint = normalizeKey(keyHint);
  if (hint.includes("mile")) return numeric * 1.609344;
  if (hint.includes("meter") || hint.includes(" m")) return numeric / 1000;
  if (numeric > 100) return numeric / 1000;
  return numeric;
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  return candidates.sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
}

export function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { row.push(cell); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function normalizeRow(row, sourceFile, sourceRow) {
  const dateValue = findValue(row, DATE_KEYS);
  const date = dateOnly(dateValue);
  if (!date) return null;
  const durationKey = Object.keys(row).find((key) => DURATION_KEYS.map(normalizeKey).includes(normalizeKey(key))) ?? "";
  const distanceKey = Object.keys(row).find((key) => DISTANCE_KEYS.map(normalizeKey).includes(normalizeKey(key))) ?? "";
  const type = findValue(row, TYPE_KEYS);
  return {
    date,
    activityType: type ? String(type).trim() : "Unknown",
    durationSec: durationSeconds(findValue(row, DURATION_KEYS)),
    distanceKm: distanceKm(findValue(row, DISTANCE_KEYS), distanceKey),
    avgHrBpm: numberValue(findValue(row, AVG_HR_KEYS)),
    maxHrBpm: numberValue(findValue(row, MAX_HR_KEYS)),
    calories: numberValue(findValue(row, CALORIE_KEYS)),
    sessionRpe: numberValue(findValue(row, RPE_KEYS)),
    sourceFile,
    sourceRow,
  };
}

function rowsFromJson(raw) {
  if (Array.isArray(raw)) return raw;
  for (const key of ["activities", "activityList", "data", "records"]) {
    if (Array.isArray(raw?.[key])) return raw[key];
  }
  return raw && typeof raw === "object" ? [raw] : [];
}

export async function importGarminFile(filePath) {
  const extension = extname(filePath).toLowerCase();
  const text = await readFile(filePath, "utf8");
  const rows = extension === ".json" ? rowsFromJson(JSON.parse(text)) : extension === ".csv" ? parseCsv(text) : [];
  if (!rows.length) throw new Error(`Tidak ada baris aktivitas yang dapat dibaca dari ${filePath}`);
  return rows.map((row, index) => normalizeRow(row, filePath, index + 2)).filter(Boolean);
}

export async function importGarminPath(inputPath) {
  const path = resolve(inputPath);
  const info = await stat(path);
  if (info.isFile()) return importGarminFile(path);
  const entries = await readdir(path, { withFileTypes: true });
  const activities = [];
  for (const entry of entries) {
    if (!entry.isFile() || ![".csv", ".json"].includes(extname(entry.name).toLowerCase())) continue;
    activities.push(...await importGarminFile(resolve(path, entry.name)));
  }
  if (!activities.length) throw new Error("Folder tidak berisi CSV/JSON Garmin yang dapat dibaca.");
  return activities;
}

export function summarizeActivities(activities, profile = {}) {
  const resting = numberValue(profile.resting_hr_bpm);
  const max = numberValue(profile.max_hr_bpm);
  const hrr = max !== null && resting !== null && max > resting ? max - resting : null;
  return activities.map((activity) => {
    const durationMin = activity.durationSec === null ? null : activity.durationSec / 60;
    const intensity = activity.avgHrBpm !== null && hrr ? Math.max(0, Math.min(1, (activity.avgHrBpm - resting) / hrr)) : null;
    const loadFactor = intensity === null ? null : intensity < 0.6 ? 1 : intensity < 0.7 ? 2 : intensity < 0.8 ? 3 : intensity < 0.9 ? 4 : 5;
    const validRpe = activity.sessionRpe !== null && activity.sessionRpe >= 0 && activity.sessionRpe <= 10;
    const internalLoadProxy = durationMin === null
      ? null
      : validRpe
        ? durationMin * activity.sessionRpe
        : durationMin !== null && loadFactor !== null
          ? durationMin * loadFactor
          : null;
    return {
      ...activity,
      durationMin,
      intensityFraction: intensity,
      internalLoadProxy,
      loadMethod: validRpe ? "session-RPE" : loadFactor === null ? null : "HR-zone proxy",
    };
  });
}

function isoWeek(date) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function summarizeWeeks(activities) {
  const buckets = new Map();
  for (const activity of activities) {
    const key = isoWeek(activity.date);
    const bucket = buckets.get(key) ?? { week: key, sessions: 0, durationMin: 0, distanceKm: 0, loadProxy: 0, vigorousSessions: 0 };
    bucket.sessions += 1;
    bucket.durationMin += activity.durationMin ?? 0;
    bucket.distanceKm += activity.distanceKm ?? 0;
    bucket.loadProxy += activity.internalLoadProxy ?? 0;
    if ((activity.intensityFraction ?? 0) >= 0.8) bucket.vigorousSessions += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.week.localeCompare(b.week));
}
