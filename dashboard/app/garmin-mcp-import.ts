import type { DailyHealthPoint, HrvPoint, ParsedDataset, SleepPoint, TrainingLoadPoint, TrendPoint } from "./garmin-data";

type JsonRecord = Record<string, unknown>;

const empty = (name: string, kind: ParsedDataset["kind"]): ParsedDataset => ({ name, kind, recordCount: 0, activities: [], sleep: [], hrv: [], trends: [] });
const record = (value: unknown): JsonRecord | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const isoDate = (value: unknown): string | null => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
const rows = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.map(record).filter((item): item is JsonRecord => item !== null) : [];

function sleepDataset(name: string, payload: JsonRecord): ParsedDataset | null {
  const source = rows(payload.nights);
  if (!source.length) return null;
  const sleep: SleepPoint[] = source.flatMap((item) => {
    const date = isoDate(item.date);
    if (!date) return [];
    const seconds = finite(item.sleep_seconds);
    return [{ date, label: date, score: finite(item.sleep_score), quality: typeof item.sleep_score_qualifier === "string" ? item.sleep_score_qualifier : "", durationHours: finite(item.sleep_hours) ?? (seconds === null ? null : seconds / 3600), needHours: null }];
  });
  const hrv: HrvPoint[] = source.flatMap((item) => {
    const date = isoDate(item.date);
    const nightly = finite(item.avg_overnight_hrv);
    return date && nightly !== null ? [{ date, nightly, baselineLow: null, baselineHigh: null, sevenDayAverage: null }] : [];
  });
  return { ...empty(name, "sleep"), recordCount: sleep.length, sleep, hrv };
}

function hrvDataset(name: string, payload: JsonRecord): ParsedDataset | null {
  const source = rows(payload.trend);
  if (!source.some((item) => "last_night_avg_hrv_ms" in item)) return null;
  const hrv: HrvPoint[] = source.flatMap((item) => {
    const date = isoDate(item.date);
    return date ? [{ date, nightly: finite(item.last_night_avg_hrv_ms), baselineLow: null, baselineHigh: null, sevenDayAverage: finite(item.weekly_avg_hrv_ms) }] : [];
  });
  return { ...empty(name, "hrv"), recordCount: hrv.length, hrv };
}

function vo2Dataset(name: string, payload: JsonRecord): ParsedDataset | null {
  const source = rows(payload.trend);
  if (!source.some((item) => "vo2_max" in item)) return null;
  const trends: TrendPoint[] = source.flatMap((item) => {
    const date = isoDate(item.date);
    const value = finite(item.vo2_max);
    return date && value !== null ? [{ date, label: date, value, activityType: typeof payload.sport === "string" ? payload.sport : undefined }] : [];
  });
  return { ...empty(name, "vo2"), recordCount: trends.length, trends };
}

function trainingLoadDataset(name: string, payload: JsonRecord): ParsedDataset | null {
  const source = rows(payload.trend);
  if (!source.some((item) => "atl" in item || "ctl" in item || "acwr" in item)) return null;
  const trainingLoad: TrainingLoadPoint[] = source.flatMap((item) => {
    const date = isoDate(item.date);
    return date ? [{ date, atl: finite(item.atl), ctl: finite(item.ctl), tsb: finite(item.tsb), acwr: finite(item.acwr), status: typeof item.training_status === "string" ? item.training_status : "" }] : [];
  });
  return { ...empty(name, "trainingLoad"), recordCount: trainingLoad.length, trainingLoad };
}

function statsDataset(name: string, payload: JsonRecord): ParsedDataset | null {
  const source = Array.isArray(payload.days) ? rows(payload.days).filter((item) => item.has_data !== false) : [payload];
  if (!source.some((item) => "total_steps" in item || "steps" in item || "resting_heart_rate_bpm" in item || "body_battery_current" in item)) return null;
  const dailyHealth: DailyHealthPoint[] = source.flatMap((item) => {
    const date = isoDate(item.date);
    return date ? [{ date, steps: finite(item.total_steps) ?? finite(item.steps), restingHr: finite(item.resting_heart_rate_bpm), avgStress: finite(item.avg_stress_level), bodyBatteryCurrent: finite(item.body_battery_current), bodyBatteryHigh: finite(item.body_battery_highest), bodyBatteryLow: finite(item.body_battery_lowest), wakingRespiration: finite(item.avg_waking_respiration) }] : [];
  });
  return { ...empty(name, "dailyHealth"), recordCount: dailyHealth.length, dailyHealth };
}

export function parseGarminMcpJson(name: string, text: string): ParsedDataset[] {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error(`${name}: JSON tidak valid.`); }
  const payload = record(parsed);
  if (!payload) throw new Error(`${name}: output Garmin MCP harus berupa objek JSON.`);
  const candidates = [sleepDataset(name, payload), hrvDataset(name, payload), vo2Dataset(name, payload), trainingLoadDataset(name, payload), statsDataset(name, payload)]
    .filter((item): item is ParsedDataset => item !== null && item.recordCount > 0);
  if (!candidates.length) throw new Error(`${name}: format belum dikenali. Gunakan output get_stats/get_stats_range, get_sleep_summary_range, get_hrv_trend, get_vo2max_trend, atau get_training_load_trend dari Taxuspt/garmin_mcp.`);
  return candidates;
}
