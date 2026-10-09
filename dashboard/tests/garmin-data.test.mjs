import assert from "node:assert/strict";
import test from "node:test";
import { combineDatasets, parseGarminFile } from "../app/garmin-data.ts";
import { parseGarminMcpJson } from "../app/garmin-mcp-import.ts";

test("parses Indonesian Activities export with running dynamics", () => {
  const csv = `Jenis Aktivitas,Tanggal,Jarak,Kalori,Waktu,Rata2 HR,Denyut Jantung Maks,AEROBIK TE,Rata-rata Cadence Lari,Rata-rata Panjang Langkah,Rata2 Waktu Kontak Tanah,Perubahan Stres
Berlari,2026-09-22 04:36:51,4.00,319,00:58:34,112,122,2.2,100,0.73,280,--`;
  const dataset = parseGarminFile("Activities.csv", csv, 2026);
  assert.equal(dataset.kind, "activities");
  assert.equal(dataset.recordCount, 1);
  assert.equal(dataset.activities[0].distanceKm, 4);
  assert.equal(dataset.activities[0].durationMin.toFixed(2), "58.57");
  assert.equal(dataset.activities[0].cadence, 100);
});

test("repairs unquoted comma in legacy sleep period", () => {
  const csv = `Tanggal,Rata2 Skor,Rata2 Kualitas,Rata-rata Durasi,Rata2 Kebutuhan Tidur,Rata-Rata Waktu Tidur,Rata-Rata Waktu Bangun
Sep 20-26,53,Buruk,5j 13mnt,8j 26mnt,12:35 AM,5:50 AM
Okt 5-11, 2025,42,Buruk,4j 1mnt,8j 28mnt,12:49 AM,5:20 AM`;
  const dataset = parseGarminFile("Tidur.csv", csv, 2026);
  assert.equal(dataset.recordCount, 2);
  assert.equal(dataset.sleep[0].date, "2025-10-11");
  assert.equal(dataset.sleep[1].date, "2026-09-26");
  assert.ok(Math.abs(dataset.sleep[1].durationHours - 5.2167) < 0.01);
});

test("parses HRV baseline and two-header monthly reports", () => {
  const hrv = parseGarminFile("Status HRV.csv", `Tanggal,HRV Semalaman,Dasar,Rata2 7h
Sep 26,44ms,64ms - 96ms,58ms`, 2026);
  const vo2 = parseGarminFile("VO₂ Maks.csv", `VO₂ Maks,
,VO2 Max
Okt 2025,VO₂ Maks,32.5
Sep 2026,VO₂ Maks,28.9`, 2026);
  const distance = parseGarminFile("Total Jarak.csv", `Total Jarak
,Jenis Aktivitas,Nilai
Okt 2025,Berlari,5.97
Sep 2026,Berlari,18.35`, 2026);
  assert.deepEqual(hrv.hrv[0], { date: "2026-09-26", nightly: 44, baselineLow: 64, baselineHigh: 96, sevenDayAverage: 58 });
  assert.equal(vo2.trends.at(-1).value, 28.9);
  assert.equal(distance.trends.at(-1).activityType, "Berlari");
  assert.equal(combineDatasets([hrv, vo2, distance]).sources.length, 3);
});

test("parses fitness age, maximum HR, pace, and FTP exports", () => {
  const age = parseGarminFile("Usia Kebugaran.csv", `,Usia Kebugaran
2026-09-20,24`, 2026);
  const maxHr = parseGarminFile("Denyut Jantung Maks.csv", `Denyut Jantung Maks.
,Nilai,Denyut Jantung
2026-09-01,160,160 bpm`, 2026);
  const pace = parseGarminFile("Rata2 Pace.csv", `Rata2 Pace
,Nilai,Pace
2026-09-01,14.67,14:40 /km`, 2026);
  const ftp = parseGarminFile("Daya Ambang Batas Fungsional.csv", `Daya Ambang Batas Fungsional,Bersepeda Watt,Cross Country Skiing Watt
08/23/2026,250 Watt,150 Watt`, 2026);
  assert.equal(age.trends[0].value, 24);
  assert.equal(maxHr.trends[0].value, 160);
  assert.equal(pace.trends[0].value, 880);
  assert.equal(ftp.trends[0].value, 250);
});

test("parses curated Taxuspt Garmin MCP recovery outputs", () => {
  const sleep = parseGarminMcpJson("sleep.json", JSON.stringify({
    start_date: "2026-10-01",
    end_date: "2026-10-02",
    nights: [
      { date: "2026-10-01", sleep_hours: 6.5, sleep_score: 72, sleep_score_qualifier: "FAIR", avg_overnight_hrv: 47 },
      { date: "2026-10-02", sleep_seconds: 25200, sleep_score: 80, avg_overnight_hrv: 51 },
    ],
  }));
  const hrv = parseGarminMcpJson("hrv.json", JSON.stringify({
    trend: [{ date: "2026-10-02", last_night_avg_hrv_ms: 51, weekly_avg_hrv_ms: 48 }],
  }));
  assert.equal(sleep[0].sleep[1].durationHours, 7);
  assert.equal(sleep[0].hrv[0].nightly, 47);
  assert.equal(hrv[0].hrv[0].sevenDayAverage, 48);
});

test("parses Taxuspt Garmin MCP daily health and training load", () => {
  const stats = parseGarminMcpJson("stats.json", JSON.stringify({
    date: "2026-10-05",
    total_steps: 8123,
    resting_heart_rate_bpm: 55,
    avg_stress_level: 31,
    body_battery_current: 68,
    body_battery_highest: 83,
    body_battery_lowest: 22,
  }));
  const load = parseGarminMcpJson("load.json", JSON.stringify({
    trend: [{ date: "2026-10-05", atl: 320.4, ctl: 280.1, tsb: -40.3, acwr: 1.14, training_status: "PRODUCTIVE" }],
  }));
  const bundle = combineDatasets([...stats, ...load]);
  assert.equal(bundle.dailyHealth[0].steps, 8123);
  assert.equal(bundle.trainingLoad[0].status, "PRODUCTIVE");
  assert.equal(bundle.trainingLoad[0].acwr, 1.14);
});

test("rejects unrelated JSON instead of treating it as Garmin MCP data", () => {
  assert.throws(() => parseGarminMcpJson("other.json", '{"hello":"world"}'), /format belum dikenali/);
});
