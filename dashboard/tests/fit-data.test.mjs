import assert from "node:assert/strict";
import test from "node:test";
import { Encoder, Profile } from "@garmin/fitsdk";
import { analyzeFitSession } from "../app/fit-analysis.ts";
import { parseFitBuffer } from "../app/fit-data.ts";

test("decodes a valid Garmin FIT activity", () => {
  const encoder = new Encoder();
  const start = new Date("2026-09-26T00:00:00Z");
  encoder.onMesg(Profile.MesgNum.FILE_ID, { type: "activity", manufacturer: "development", product: 1, timeCreated: start });
  for (let second = 0; second < 120; second += 1) {
    encoder.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(start.getTime() + second * 1000), heartRate: 120 + second % 5, enhancedSpeed: 2.5, distance: second * 2.5 });
  }
  encoder.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(start.getTime() + 120_000), startTime: start, sport: "running", totalTimerTime: 120, totalDistance: 300, avgHeartRate: 122, maxHeartRate: 124, event: "session", eventType: "stop" });
  encoder.onMesg(Profile.MesgNum.LAP, { timestamp: new Date(start.getTime() + 120_000), startTime: start, totalTimerTime: 120, totalDistance: 300, avgHeartRate: 122, intensity: "active" });
  const bytes = encoder.close();
  const session = parseFitBuffer("run.fit", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.equal(session.sport, "running");
  assert.equal(session.records.length, 120);
  assert.equal(session.durationMin, 2);
  assert.equal(session.distanceKm, 0.3);
  assert.equal(session.laps.length, 1);
  assert.equal(session.laps[0].durationMin, 2);
  assert.equal(parseFitBuffer("renamed.fit", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).id, session.id);
});

test("rejects data without a FIT signature", () => {
  assert.throws(() => parseFitBuffer("fake.fit", new ArrayBuffer(20)), /signature FIT tidak valid/);
});

test("rejects multi-session FIT files instead of mixing sports", () => {
  const encoder = new Encoder();
  const start = new Date("2026-09-26T00:00:00Z");
  encoder.onMesg(Profile.MesgNum.FILE_ID, { type: "activity", manufacturer: "development", product: 1, timeCreated: start });
  encoder.onMesg(Profile.MesgNum.RECORD, { timestamp: start, heartRate: 120, enhancedSpeed: 2 });
  encoder.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(start.getTime() + 60_000), startTime: start, sport: "running", totalTimerTime: 60, event: "session", eventType: "stop" });
  encoder.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(start.getTime() + 120_000), startTime: new Date(start.getTime() + 60_000), sport: "cycling", totalTimerTime: 60, event: "session", eventType: "stop" });
  const bytes = encoder.close();
  assert.throws(() => parseFitBuffer("multisport.fit", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), /multisport belum didukung/);
});

test("calculates HRR zones and Pa:HR drift from timestamped records", () => {
  const start = Date.parse("2026-09-26T00:00:00Z");
  const records = Array.from({ length: 1_201 }, (_, second) => ({ timestampMs: start + second * 1000, heartRate: second < 600 ? 120 : 140, speedMps: 2 }));
  const analysis = analyzeFitSession({ id: "one", name: "one.fit", date: "2026-09-26", sport: "running", durationMin: 20, distanceKm: 2.4, avgHr: 130, maxHr: 140, records, timerStopMs: null }, 200, 50);
  assert.equal(analysis.zoneTotalMin, 20);
  assert.ok(analysis.zoneMinutes[0] > 9.9);
  assert.ok(analysis.zoneMinutes[1] > 9.9);
  assert.ok(Math.abs(analysis.paHrDriftPercent - 14.29) < 0.1);
  assert.equal(analysis.recoveryHr60, null);
  assert.equal(analysis.quality, "valid");
  assert.equal(analysis.segments.length, 1);
  const incomplete = { id: "gap", sport: "running", timerStopMs: null, records: records.filter((_, index) => index < 400 || index > 600) };
  assert.equal(analyzeFitSession(incomplete, 200, 50).paHrDriftPercent, null);
  assert.equal(analyzeFitSession({ ...incomplete, records: [...records, records.at(-1)] }, 200, 50).paHrDriftPercent, null);
  assert.equal(analyzeFitSession({ ...incomplete, records }, 40, 50).zoneTotalMin, 0);
  assert.equal(analyzeFitSession({ ...incomplete, records: records.map((record) => ({ ...record, heartRate: 0 })) }, 200, 50).paHrDriftPercent, null);
});
