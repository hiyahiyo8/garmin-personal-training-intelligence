function optionalNumber(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean" || Number.isNaN(Number(value))) {
    throw new Error(`${field} harus berupa angka`);
  }
  return Number(value);
}

function assertRange(value, low, high, field) {
  if (value !== null && (value < low || value > high)) {
    throw new Error(`${field} harus berada pada rentang ${low}-${high}`);
  }
}

export function parseSnapshot(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Snapshot harus berupa object JSON");
  }
  if (typeof raw.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
    throw new Error("Field date wajib memakai format YYYY-MM-DD");
  }
  const parsedDate = new Date(`${raw.date}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== raw.date) {
    throw new Error("Tanggal tidak valid");
  }

  const symptomsRaw = raw.symptoms ?? {};
  const snapshot = {
    date: raw.date,
    sleepHours: optionalNumber(raw.sleep_hours, "sleep_hours"),
    sleepScore: optionalNumber(raw.sleep_score, "sleep_score"),
    hrvNightlyMs: optionalNumber(raw.hrv_nightly_ms, "hrv_nightly_ms"),
    hrvBaselineLowMs: optionalNumber(raw.hrv_baseline_low_ms, "hrv_baseline_low_ms"),
    hrvBaselineHighMs: optionalNumber(raw.hrv_baseline_high_ms, "hrv_baseline_high_ms"),
    restingHrBpm: optionalNumber(raw.resting_hr_bpm, "resting_hr_bpm"),
    restingHrBaselineBpm: optionalNumber(
      raw.resting_hr_baseline_bpm,
      "resting_hr_baseline_bpm",
    ),
    bodyBatteryMorning: optionalNumber(raw.body_battery_morning, "body_battery_morning"),
    stressAverage: optionalNumber(raw.stress_average, "stress_average"),
    scheduledSession: raw.scheduled_session ?? null,
    symptoms: {
      painAtRest: optionalNumber(symptomsRaw.pain_at_rest ?? 0, "pain_at_rest"),
      painWhileWalking: optionalNumber(
        symptomsRaw.pain_while_walking ?? 0,
        "pain_while_walking",
      ),
      swelling: Boolean(symptomsRaw.swelling),
      limping: Boolean(symptomsRaw.limping),
      chestPain: Boolean(symptomsRaw.chest_pain),
      faintingOrSevereDizziness: Boolean(symptomsRaw.fainting_or_severe_dizziness),
      fever: Boolean(symptomsRaw.fever),
    },
  };

  assertRange(snapshot.sleepHours, 0, 24, "sleep_hours");
  assertRange(snapshot.sleepScore, 0, 100, "sleep_score");
  assertRange(snapshot.bodyBatteryMorning, 0, 100, "body_battery_morning");
  assertRange(snapshot.stressAverage, 0, 100, "stress_average");
  assertRange(snapshot.symptoms.painAtRest, 0, 10, "pain_at_rest");
  assertRange(snapshot.symptoms.painWhileWalking, 0, 10, "pain_while_walking");
  if (
    snapshot.hrvBaselineLowMs !== null &&
    snapshot.hrvBaselineHighMs !== null &&
    snapshot.hrvBaselineLowMs > snapshot.hrvBaselineHighMs
  ) {
    throw new Error("Baseline HRV bawah tidak boleh melebihi baseline atas");
  }
  return snapshot;
}
