import { expect, test } from "vitest";
import { checkInSchema, profileSchema, snapshotSchema } from "./validation";
import { recommendSession } from "./recommendation";
import { expandZip } from "./zip-import";
import { zipSync, strToU8 } from "fflate";

test("missing subjective data and stale history never become readiness clearance", () => {
  expect(checkInSchema.safeParse({}).success).toBe(false);
  expect(checkInSchema.safeParse({ id: "one", activityId: "run", date: "2026-09-26", rpe: Number.NaN, pain: 0, soreness: 0, fatigue: 0, sleepQuality: 0, stress: 0, mood: 0, painLocation: "" }).success).toBe(false);
  expect(profileSchema.safeParse({ maxHr: 100, restingHr: 110 }).success).toBe(false);
  expect(profileSchema.safeParse({ maxHr: 197, restingHr: 50, admin: true }).success).toBe(false);
  expect(recommendSession({ today: "2026-09-26" }).title).toBe("Data terkini belum cukup");
  expect(snapshotSchema.safeParse({ version: 2 }).success).toBe(false);
});

test("ZIP extracts supported files and refuses nested archives and unsafe names", () => {
  expect(expandZip(zipSync({ "Activities.csv": strToU8("a,b\n1,2") }))[0].name).toBe("Activities.csv");
  expect(() => expandZip(zipSync({ "../Activities.csv": strToU8("x") }))).toThrow(/aman/);
  expect(() => expandZip(zipSync({ "nested.zip": strToU8("x") }))).toThrow(/bertingkat/);
  expect(() => expandZip(new Uint8Array([1, 2, 3]))).toThrow();
});
