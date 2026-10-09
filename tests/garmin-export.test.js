import test from "node:test";
import assert from "node:assert/strict";

import { parseCsv, summarizeActivities, summarizeWeeks } from "../src/garmin-export.js";

test("parses common Garmin CSV fields and time format", () => {
  const rows = parseCsv("Activity Type,Date,Distance,Time,Avg HR,Max HR\nRun,2026-09-20,5.00,00:38:20,152,174\n");
  const activities = summarizeActivities(rows.map((row, index) => ({
    date: row.Date,
    activityType: row["Activity Type"],
    durationSec: 2300,
    distanceKm: Number(row.Distance),
    avgHrBpm: Number(row["Avg HR"]),
    maxHrBpm: Number(row["Max HR"]),
    calories: null,
    sessionRpe: null,
    sourceFile: "fixture.csv",
    sourceRow: index + 2,
  })), { max_hr_bpm: 197, resting_hr_bpm: 50 });
  assert.equal(activities[0].durationMin, 2300 / 60);
  assert.equal(Math.round(activities[0].intensityFraction * 100), 69);
  assert.ok(activities[0].internalLoadProxy > 0);
});

test("groups activity load by ISO week", () => {
  const activities = summarizeActivities([
    { date: "2026-09-21", activityType: "Run", durationSec: 1800, distanceKm: 4, avgHrBpm: 140, maxHrBpm: 170, calories: null, sessionRpe: null },
    { date: "2026-09-23", activityType: "Walk", durationSec: 2400, distanceKm: 3, avgHrBpm: 120, maxHrBpm: 140, calories: null, sessionRpe: null },
  ], { max_hr_bpm: 197, resting_hr_bpm: 50 });
  const weeks = summarizeWeeks(activities);
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].sessions, 2);
  assert.equal(weeks[0].distanceKm, 7);
});
