import assert from "node:assert/strict";
import test from "node:test";
import { recommendSession } from "../app/recommendation.ts";

test("withholds readiness for missing or stale data and prioritizes reported pain", () => {
  const today = "2026-09-26";
  assert.equal(recommendSession({ today }).title, "Data terkini belum cukup");
  const checkIn = { date: today, pain: 0, fatigue: 1, soreness: 1, stress: 1, rpe: 2 };
  const sleep = { date: today, durationHours: 8 };
  assert.equal(recommendSession({ today, checkIn, sleep: { ...sleep, date: "2026-08-01" } }).title, "Data terkini belum cukup");
  assert.equal(recommendSession({ today, checkIn: { ...checkIn, pain: 6 }, sleep }).title, "Tunda latihan yang memicu nyeri");
  assert.equal(recommendSession({ today, checkIn, sleep }).title, "Tinjau sesi terjadwal");
  assert.equal(recommendSession({ today, checkIn, sleep: { ...sleep, durationHours: 5 } }).title, "Pertimbangkan recovery atau sesi mudah");
});
