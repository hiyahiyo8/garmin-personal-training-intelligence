import assert from "node:assert/strict";
import test from "node:test";

import { parseSnapshot } from "../src/models.js";
import { analyzeSnapshot } from "../src/readiness.js";

function baseRaw(overrides = {}) {
  return {
    date: "2026-09-23",
    sleep_hours: 7.5,
    sleep_score: 86,
    hrv_nightly_ms: 48,
    hrv_baseline_low_ms: 40,
    hrv_baseline_high_ms: 55,
    resting_hr_bpm: 52,
    resting_hr_baseline_bpm: 54,
    body_battery_morning: 88,
    stress_average: 18,
    symptoms: {},
    ...overrides,
  };
}

test("good metrics allow the scheduled session", () => {
  const result = analyzeSnapshot(parseSnapshot(baseRaw()));
  assert.equal(result.status, "READY");
  assert.ok(result.readinessScore >= 75);
  assert.equal(result.confidence, 1);
});

test("injury symptoms override good wearable metrics", () => {
  const result = analyzeSnapshot(
    parseSnapshot(baseRaw({ symptoms: { pain_while_walking: 6, swelling: true } })),
  );
  assert.equal(result.status, "PROTECT");
  assert.ok(result.safetyFlags.includes("bengkak"));
  assert.ok(result.safetyFlags.includes("nyeri saat berjalan 6/10"));
});

test("chest pain stops training", () => {
  const result = analyzeSnapshot(
    parseSnapshot(baseRaw({ symptoms: { chest_pain: true } })),
  );
  assert.equal(result.status, "STOP");
  assert.match(result.recommendation, /medis segera/);
});

test("missing data lowers confidence", () => {
  const result = analyzeSnapshot(
    parseSnapshot({ date: "2026-09-23", sleep_hours: 6.5 }),
  );
  assert.equal(result.confidence, 0.3);
  assert.ok(result.reasons.some((reason) => reason.includes("Confidence rendah")));
});

test("short sleep caps recommendation", () => {
  const result = analyzeSnapshot(parseSnapshot(baseRaw({ sleep_hours: 4.5 })));
  assert.equal(result.status, "RECOVER");
  assert.ok(result.readinessScore <= 49);
});

test("invalid pain scale is rejected", () => {
  assert.throws(
    () => parseSnapshot(baseRaw({ symptoms: { pain_at_rest: 12 } })),
    /rentang 0-10/,
  );
});
