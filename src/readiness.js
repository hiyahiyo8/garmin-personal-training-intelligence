const WEIGHTS = {
  sleep: 0.3,
  hrv: 0.25,
  bodyBattery: 0.2,
  restingHr: 0.15,
  stress: 0.1,
};

const clamp = (value, low = 0, high = 100) => Math.max(low, Math.min(high, value));

function sleepComponent(snapshot) {
  if (snapshot.sleepScore !== null) {
    return {
      name: "sleep",
      score: snapshot.sleepScore,
      weight: WEIGHTS.sleep,
      detail: `Sleep Score Garmin ${snapshot.sleepScore.toFixed(0)}/100`,
    };
  }
  if (snapshot.sleepHours === null) return null;
  const hours = snapshot.sleepHours;
  let score;
  if (hours >= 8) score = 100;
  else if (hours >= 7) score = 85 + (hours - 7) * 15;
  else if (hours >= 6) score = 65 + (hours - 6) * 20;
  else if (hours >= 5) score = 40 + (hours - 5) * 25;
  else score = (hours / 5) * 40;
  return {
    name: "sleep",
    score: clamp(score),
    weight: WEIGHTS.sleep,
    detail: `Durasi tidur ${hours.toFixed(1)} jam (estimasi skor)`,
  };
}

function hrvComponent(snapshot) {
  const value = snapshot.hrvNightlyMs;
  const low = snapshot.hrvBaselineLowMs;
  const high = snapshot.hrvBaselineHighMs;
  if (value === null || low === null || high === null || low <= 0) return null;
  let score;
  let detail;
  if (value < low) {
    score = 70 * (value / low);
    detail = `HRV ${value.toFixed(0)} ms di bawah baseline ${low.toFixed(0)}-${high.toFixed(0)} ms`;
  } else if (value <= high) {
    score = 85;
    detail = `HRV ${value.toFixed(0)} ms berada dalam baseline`;
  } else {
    score = 80;
    detail = `HRV ${value.toFixed(0)} ms di atas baseline; interpretasikan bersama tren`;
  }
  return { name: "hrv", score: clamp(score), weight: WEIGHTS.hrv, detail };
}

function bodyBatteryComponent(snapshot) {
  if (snapshot.bodyBatteryMorning === null) return null;
  return {
    name: "body_battery",
    score: snapshot.bodyBatteryMorning,
    weight: WEIGHTS.bodyBattery,
    detail: `Body Battery pagi ${snapshot.bodyBatteryMorning.toFixed(0)}/100`,
  };
}

function restingHrComponent(snapshot) {
  const value = snapshot.restingHrBpm;
  const baseline = snapshot.restingHrBaselineBpm;
  if (value === null || baseline === null) return null;
  const delta = value - baseline;
  const score = 90 - Math.max(0, delta) * 7 + Math.max(0, -delta) * 1.5;
  const signedDelta = `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}`;
  return {
    name: "resting_hr",
    score: clamp(score),
    weight: WEIGHTS.restingHr,
    detail: `Resting HR ${value.toFixed(0)} bpm (${signedDelta} dari baseline)`,
  };
}

function stressComponent(snapshot) {
  if (snapshot.stressAverage === null) return null;
  return {
    name: "stress",
    score: clamp(100 - snapshot.stressAverage),
    weight: WEIGHTS.stress,
    detail: `Rata-rata stress Garmin ${snapshot.stressAverage.toFixed(0)}/100`,
  };
}

function safetyFlags(snapshot) {
  const symptoms = snapshot.symptoms;
  const flags = [];
  if (symptoms.chestPain) flags.push("nyeri dada");
  if (symptoms.faintingOrSevereDizziness) flags.push("pingsan atau pusing berat");
  if (symptoms.fever) flags.push("demam");
  if (symptoms.painAtRest >= 4) {
    flags.push(`nyeri saat istirahat ${symptoms.painAtRest.toFixed(0)}/10`);
  }
  if (symptoms.painWhileWalking >= 4) {
    flags.push(`nyeri saat berjalan ${symptoms.painWhileWalking.toFixed(0)}/10`);
  }
  if (symptoms.swelling) flags.push("bengkak");
  if (symptoms.limping) flags.push("berjalan pincang");
  return flags;
}

export function analyzeSnapshot(snapshot) {
  const components = [
    sleepComponent(snapshot),
    hrvComponent(snapshot),
    bodyBatteryComponent(snapshot),
    restingHrComponent(snapshot),
    stressComponent(snapshot),
  ].filter(Boolean);
  const availableWeight = components.reduce((sum, component) => sum + component.weight, 0);
  let score = availableWeight
    ? components.reduce(
        (sum, component) => sum + component.score * component.weight,
        0,
      ) / availableWeight
    : 0;
  const confidence = availableWeight;
  const reasons = [];
  const flags = safetyFlags(snapshot);
  let status;
  let recommendation;

  if (flags.includes("nyeri dada") || flags.includes("pingsan atau pusing berat")) {
    status = "STOP";
    recommendation =
      "Jangan berlatih. Cari penilaian medis segera, terutama bila gejala sedang berlangsung.";
    reasons.push("Red flag gejala mengalahkan seluruh metrik wearable.");
  } else if (flags.length) {
    status = "PROTECT";
    recommendation =
      "Hentikan lari, lompatan, dan latihan yang memicu gejala. Gunakan aktivitas harian seperlunya dan pertimbangkan pemeriksaan tenaga kesehatan bila nyeri/bengkak menetap.";
    reasons.push("Ada gejala muskuloskeletal/sistemik yang tidak aman dinilai dari jam saja.");
  } else {
    if (snapshot.sleepHours !== null && snapshot.sleepHours < 5) {
      score = Math.min(score, 49);
      reasons.push("Tidur <5 jam membatasi rekomendasi ke recovery.");
    }
    if (
      snapshot.restingHrBpm !== null &&
      snapshot.restingHrBaselineBpm !== null &&
      snapshot.restingHrBpm - snapshot.restingHrBaselineBpm >= 10
    ) {
      score = Math.min(score, 49);
      reasons.push("Resting HR >=10 bpm di atas baseline.");
    }
    if (
      snapshot.hrvNightlyMs !== null &&
      snapshot.hrvBaselineLowMs !== null &&
      snapshot.hrvNightlyMs < 0.85 * snapshot.hrvBaselineLowMs
    ) {
      score = Math.min(score, 54);
      reasons.push("HRV jauh di bawah baseline pribadi.");
    }

    if (score >= 75) {
      status = "READY";
      recommendation = "Jalankan sesi terjadwal, tetap gunakan RPE/RIR dan teknik sebagai batas.";
    } else if (score >= 55) {
      status = "CAUTION";
      recommendation =
        "Jalankan versi ringan: kurangi durasi/volume sekitar 20-30% dan hindari intensitas tinggi.";
    } else {
      status = "RECOVER";
      recommendation =
        "Pilih istirahat atau recovery ringan; tunda tempo, interval, dan strength berat.";
    }
  }

  if (confidence < 0.6) reasons.push("Confidence rendah karena banyak metrik belum tersedia.");
  return {
    readinessScore: Number(score.toFixed(1)),
    confidence: Number(confidence.toFixed(2)),
    status,
    recommendation,
    components,
    reasons,
    safetyFlags: flags,
  };
}
