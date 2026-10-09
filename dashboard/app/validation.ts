import { z } from "zod";

const text = z.string().max(500);
const id = z.string().trim().min(1).max(1000);
const date = z.iso.date();
const number = z.number().finite().nullable();
const positive = z.number().finite().nonnegative().nullable();
export const profileSchema = z.strictObject({ maxHr: z.number().min(100).max(230), restingHr: z.number().min(30).max(120) }).refine(p => p.maxHr > p.restingHr);
const rating = z.number().min(0).max(10);
export const checkInSchema = z.strictObject({ id, activityId: id, date, rpe: rating, pain: rating, soreness: rating, fatigue: rating, sleepQuality: rating, stress: rating, mood: rating, painLocation: text });
export type CheckIn = z.infer<typeof checkInSchema>;
export const activitySchema = z.strictObject({
  id, date, type: text, category: z.enum(["run", "walk", "strength", "recovery", "racket", "other"]),
  durationMin: positive, distanceKm: positive, avgHr: positive, maxHr: positive, calories: positive,
  aerobicTe: positive, cadence: positive, strideLength: positive, verticalRatio: positive,
  verticalOscillation: positive, groundContactTime: positive, gapSeconds: positive, avgPower: positive,
  maxPower: positive, steps: positive, bodyBatteryDrained: number, respiration: positive,
  stressChange: number, stressStart: positive, stressEnd: positive,
});
export const datasetSchema = z.strictObject({
  name: text, kind: z.enum(["activities", "sleep", "hrv", "vo2", "fitnessAge", "monthlyDistance", "monthlyDuration", "monthlyCalories", "monthlyPace", "monthlySpeed", "monthlyAvgHr", "monthlyMaxHr", "ftp", "dailyHealth", "trainingLoad", "unknown"]),
  recordCount: z.number().int().nonnegative().max(200000),
  activities: z.array(activitySchema).max(50000),
  sleep: z.array(z.strictObject({ date, label: text, score: number, quality: text, durationHours: positive, needHours: positive })).max(50000),
  hrv: z.array(z.strictObject({ date, nightly: positive, baselineLow: positive, baselineHigh: positive, sevenDayAverage: positive })).max(50000),
  trends: z.array(z.strictObject({ date, label: text, value: number, activityType: text.optional(), display: text.optional() })).max(50000),
  dailyHealth: z.array(z.strictObject({ date, steps: positive, restingHr: positive, avgStress: positive, bodyBatteryCurrent: positive, bodyBatteryHigh: positive, bodyBatteryLow: positive, wakingRespiration: positive })).max(50000).optional(),
  trainingLoad: z.array(z.strictObject({ date, atl: number, ctl: number, tsb: number, acwr: number, status: text })).max(50000).optional(),
  warning: text.optional(),
});
const timestamp = z.number().finite().min(0).max(8.64e15);
export const fitSchema = z.strictObject({
  id, name: text, date, sport: text, durationMin: positive, distanceKm: positive, avgHr: positive, maxHr: positive,
  records: z.array(z.strictObject({ timestampMs: timestamp, heartRate: number, speedMps: number })).min(1).max(200000),
  timerStopMs: timestamp.nullable(),
  laps: z.array(z.strictObject({ startMs: timestamp, endMs: timestamp, durationMin: positive, distanceKm: positive, avgHr: positive, intensity: text })).max(10000).optional(),
});
export const snapshotSchema = z.strictObject({
  version: z.literal(1), profile: profileSchema,
  datasets: z.array(datasetSchema).max(200), fitSessions: z.array(fitSchema).max(200), checkIns: z.array(checkInSchema).max(50000),
}).refine(s => s.fitSessions.reduce((n, f) => n + f.records.length, 0) <= 1000000);
export type Snapshot = z.infer<typeof snapshotSchema>;
