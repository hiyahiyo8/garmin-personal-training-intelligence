import { Decoder, Stream } from "@garmin/fitsdk";
import type { EventMesg, RecordMesg, SessionMesg } from "@garmin/fitsdk";

const MAX_FIT_BYTES = 25 * 1024 * 1024;
const MAX_RECORDS = 200_000;

export type FitRecord = {
  timestampMs: number;
  heartRate: number | null;
  speedMps: number | null;
};

export type FitSession = {
  id: string;
  name: string;
  date: string;
  sport: string;
  durationMin: number | null;
  distanceKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  records: FitRecord[];
  timerStopMs: number | null;
  laps?: Array<{ startMs: number; endMs: number; durationMin: number | null; distanceKm: number | null; avgHr: number | null; intensity: string }>;
};

function timestampMs(value: RecordMesg["timestamp"]) {
  if (value instanceof Date) return value.getTime();
  return typeof value === "number" ? (value + 631065600) * 1000 : null;
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function lastTimerStop(events: EventMesg[]) {
  return events.reduce<number | null>((latest, event) => {
    if (event.event !== "timer" || !["stop", "stopAll"].includes(String(event.eventType))) return latest;
    const time = timestampMs(event.timestamp);
    return time === null || (latest !== null && time < latest) ? latest : time;
  }, null);
}

function sessionDate(session: SessionMesg | undefined, records: FitRecord[]) {
  const time = timestampMs(session?.startTime) ?? records[0]?.timestampMs;
  return time ? new Date(time).toISOString().slice(0, 10) : "unknown";
}

export function parseFitBuffer(name: string, buffer: ArrayBuffer): FitSession {
  if (buffer.byteLength > MAX_FIT_BYTES) throw new Error(`${name}: file FIT melebihi batas 25 MB.`);
  if (buffer.byteLength < 14) throw new Error(`${name}: file terlalu kecil untuk format FIT.`);

  const stream = Stream.fromArrayBuffer(buffer);
  if (!Decoder.isFIT(stream)) throw new Error(`${name}: signature FIT tidak valid.`);
  const decoder = new Decoder(stream);
  if (!decoder.checkIntegrity()) throw new Error(`${name}: pemeriksaan CRC FIT gagal.`);

  const { messages, errors } = decoder.read();
  if (errors.length) throw new Error(`${name}: decoder FIT melaporkan ${errors[0].message}`);
  if ((messages.sessionMesgs?.length ?? 0) > 1) throw new Error("FIT multisport belum didukung. Ekspor setiap sesi secara terpisah agar data olahraga tidak tercampur.");
  const sourceRecords = messages.recordMesgs ?? [];
  if (!sourceRecords.length) throw new Error(`${name}: tidak berisi rekaman aktivitas per detik.`);
  if (sourceRecords.length > MAX_RECORDS) throw new Error(`${name}: jumlah rekaman melampaui batas aman.`);

  const records = sourceRecords.flatMap((record) => {
    const time = timestampMs(record.timestamp);
    if (time === null) return [];
    return [{
      timestampMs: time,
      heartRate: finite(record.heartRate),
      speedMps: finite(record.enhancedSpeed) ?? finite(record.speed),
    }];
  });
  if (!records.length) throw new Error(`${name}: timestamp aktivitas tidak dapat dibaca.`);

  const session = messages.sessionMesgs?.[0];
  const sport = typeof session?.sport === "string" ? session.sport : "activity";
  const date = sessionDate(session, records);
  return {
    id: `fit-${sport}-${records[0].timestampMs}-${records.at(-1)!.timestampMs}`,
    name,
    date,
    sport,
    durationMin: finite(session?.totalTimerTime) === null ? (records.at(-1)!.timestampMs - records[0].timestampMs) / 60_000 : finite(session?.totalTimerTime)! / 60,
    distanceKm: finite(session?.totalDistance) === null ? null : finite(session?.totalDistance)! / 1000,
    avgHr: finite(session?.avgHeartRate),
    maxHr: finite(session?.maxHeartRate),
    records,
    timerStopMs: lastTimerStop(messages.eventMesgs ?? []),
    laps: (messages.lapMesgs ?? []).flatMap((lap) => {
      const startMs = timestampMs(lap.startTime);
      const endMs = timestampMs(lap.timestamp);
      if (startMs === null || endMs === null || endMs < startMs) return [];
      return [{ startMs, endMs, durationMin: finite(lap.totalTimerTime) === null ? null : finite(lap.totalTimerTime)! / 60, distanceKm: finite(lap.totalDistance) === null ? null : finite(lap.totalDistance)! / 1000, avgHr: finite(lap.avgHeartRate), intensity: typeof lap.intensity === "string" ? lap.intensity : "unknown" }];
    }),
  };
}

export async function parseFitFile(file: File) {
  if (file.size > MAX_FIT_BYTES) throw new Error(`${file.name}: file FIT melebihi batas 25 MB.`);
  return parseFitBuffer(file.name, await file.arrayBuffer());
}
