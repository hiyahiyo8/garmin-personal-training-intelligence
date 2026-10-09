import type { FitSession } from "./fit-data";

export type FitAnalysis = {
  zoneMinutes: [number, number, number, number, number];
  zoneTotalMin: number;
  paHrDriftPercent: number | null;
  recoveryHr60: number | null;
  quality: "valid" | "limited" | "insufficient data";
  qualityFlags: string[];
  segments: Array<{ startMs: number; endMs: number; durationMin: number }>;
};

export function analyzeFitSession(session: FitSession, maxHr: number, restingHr: number): FitAnalysis {
  const reserve = maxHr - restingHr;
  const qualityFlags: string[] = [];
  const validHr = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 30 && value <= 240;
  const validSpeed = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0.5 && value <= 12;
  const ordered = session.records.every((record, index) => Number.isFinite(record.timestampMs) && (index === 0 || record.timestampMs > session.records[index - 1].timestampMs));
  const profileValid = Number.isFinite(maxHr) && Number.isFinite(restingHr) && maxHr > restingHr && maxHr <= 240 && restingHr >= 30;
  if (!ordered) qualityFlags.push("Timestamp duplikat atau tidak berurutan; metrik waktu tidak dihitung.");
  if (!profileValid) qualityFlags.push("Profil HR tidak valid; zona tidak dihitung.");
  if (session.records.some((record) => record.heartRate !== null && !validHr(record.heartRate))) qualityFlags.push("HR tidak valid dikeluarkan dari perhitungan.");
  if (session.records.length < 60) qualityFlags.push("record kurang dari 60 titik");
  const gaps = session.records.slice(1).filter((record, index) => record.timestampMs - session.records[index].timestampMs > 10_000).length;
  if (gaps > 0) qualityFlags.push(`${gaps} jeda data >10 detik`);
  const zoneSeconds = [0, 0, 0, 0, 0];
  if (profileValid && ordered) {
    for (let index = 1; index < session.records.length; index += 1) {
      const current = session.records[index];
      const previous = session.records[index - 1];
      const seconds = (current.timestampMs - previous.timestampMs) / 1000;
      if (!validHr(current.heartRate) || seconds <= 0 || seconds > 10) continue;
      const hrr = (current.heartRate - restingHr) / reserve;
      const zone = hrr < 0.6 ? 0 : hrr < 0.7 ? 1 : hrr < 0.8 ? 2 : hrr < 0.9 ? 3 : 4;
      zoneSeconds[zone] += seconds;
    }
  }

  const start = session.records[0]?.timestampMs ?? 0;
  const end = session.records.at(-1)?.timestampMs ?? 0;
  const midpoint = start + (end - start) / 2;
  const moving = session.records.filter((record) => validHr(record.heartRate) && validSpeed(record.speedMps));
  // Engineering eligibility gate, not a validated physiological threshold.
  const sufficientCoverage = session.records.length > 0 && moving.length / session.records.length >= 0.9;
  const efficiency = (from: number, to: number) => {
    let speedTime = 0, hrTime = 0, seconds = 0;
    for (let index = 1; index < session.records.length; index += 1) {
      const record = session.records[index - 1];
      const next = session.records[index];
      const duration = (Math.min(to, next.timestampMs) - Math.max(from, record.timestampMs)) / 1000;
      if (duration <= 0 || next.timestampMs - record.timestampMs > 10_000 || !validHr(record.heartRate) || !validSpeed(record.speedMps)) continue;
      speedTime += record.speedMps * duration;
      hrTime += record.heartRate * duration;
      seconds += duration;
    }
    return seconds >= (to - from) / 1000 * 0.9 && hrTime > 0 ? speedTime / hrTime : null;
  };
  const first = efficiency(start, midpoint);
  const second = efficiency(midpoint, end);
  const paHrDriftPercent = ordered && gaps === 0 && sufficientCoverage && ["running", "walking"].includes(session.sport) && (end - start) / 60_000 >= 20 && first !== null && second !== null && first > 0 ? (first - second) / first * 100 : null;
  if (paHrDriftPercent === null) qualityFlags.push("Pa:HR memerlukan sesi ≥20 menit dan data speed+HR cukup");
  const segments: FitAnalysis["segments"] = [];
  let segmentStart = session.records[0]?.timestampMs ?? 0;
  for (let index = 1; index < session.records.length; index += 1) {
    const gap = session.records[index].timestampMs - session.records[index - 1].timestampMs;
    if (gap > 30_000) {
      segments.push({ startMs: segmentStart, endMs: session.records[index - 1].timestampMs, durationMin: (session.records[index - 1].timestampMs - segmentStart) / 60_000 });
      segmentStart = session.records[index].timestampMs;
    }
  }
  if (session.records.length) segments.push({ startMs: segmentStart, endMs: end, durationMin: (end - segmentStart) / 60_000 });

  let recoveryHr60: number | null = null;
  if (session.timerStopMs !== null) {
    const stopMs = session.timerStopMs;
    const stop = session.records.filter((record) => validHr(record.heartRate) && record.timestampMs <= stopMs && stopMs - record.timestampMs <= 10_000).at(-1);
    const after = session.records.find((record) => validHr(record.heartRate) && record.timestampMs >= stopMs + 55_000 && record.timestampMs <= stopMs + 75_000);
    if (stop?.heartRate !== null && stop?.heartRate !== undefined && after?.heartRate !== null && after?.heartRate !== undefined) recoveryHr60 = stop.heartRate - after.heartRate;
  }

  const zoneMinutes = zoneSeconds.map((seconds) => seconds / 60) as FitAnalysis["zoneMinutes"];
  return { zoneMinutes, zoneTotalMin: zoneMinutes.reduce((sum, minutes) => sum + minutes, 0), paHrDriftPercent, recoveryHr60, quality: qualityFlags.length ? (paHrDriftPercent === null && session.records.length < 60 ? "insufficient data" : "limited") : "valid", qualityFlags, segments };
}
