function fmt(value, digits = 1) {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function pace(distanceKm, durationMin) {
  if (!distanceKm || !durationMin) return "—";
  const sec = Math.round((durationMin * 60) / distanceKm);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}/km`;
}

function evidenceNotes(activities, weeks) {
  const notes = [
    "Deskriptif: durasi, jarak, pace, denyut jantung, dan frekuensi sesi berasal dari file export Garmin.",
    "Turunan: bila RPE sesi tersedia, beban memakai durasi × RPE (session-RPE); jika tidak, digunakan proxy durasi × kelas intensitas %HRR. Ini bukan diagnosis.",
    "Interpretasi: evaluasi menekankan progressive overload, distribusi intensitas, dan kenaikan beban bertahap; keputusan harus dikonfirmasi dengan RPE, gejala, dan pemulihan.",
  ];
  if (weeks.length >= 2) {
    const latest = weeks.at(-1);
    const previous = weeks.at(-2);
    if (previous.loadProxy > 0 && latest.loadProxy / previous.loadProxy > 1.3) {
      notes.push(`Guardrail beban: proxy beban minggu terakhir naik ${(latest.loadProxy / previous.loadProxy * 100 - 100).toFixed(0)}% dari minggu sebelumnya; pertimbangkan menahan progresi.`);
    }
  }
  if (activities.some((activity) => activity.intensityFraction !== null && activity.intensityFraction >= 0.8)) {
    notes.push("Ada sesi dengan rata-rata HR ≥80% HRR; jangan menganggap seluruh aktivitas sebagai easy aerobic.");
  }
  return notes;
}

export function renderExportReport(activities, weeks, profile = {}, inputLabel = "Garmin export") {
  const lines = [
    `# Garmin Export Evaluation`,
    "",
    `- Sumber: **${inputLabel}**`,
    `- Aktivitas terbaca: **${activities.length}**`,
    `- Minggu terbaca: **${weeks.length}**`,
    `- Profil HR: max ${profile.max_hr_bpm ?? "—"} bpm; resting ${profile.resting_hr_bpm ?? "—"} bpm`,
    "",
    "> Laporan ini adalah analisis latihan berbasis data observasional. Ia tidak mendiagnosis cedera dan tidak menggantikan dokter/fisioterapis.",
    "",
    "## Aktivitas",
    "",
    "| Tanggal | Jenis | Durasi | Jarak | Pace | Avg HR | %HRR | Load | Metode |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---|",
  ];
  for (const activity of activities.slice().sort((a, b) => a.date.localeCompare(b.date))) {
    const hrrPercent = activity.intensityFraction === null ? "—" : `${(activity.intensityFraction * 100).toFixed(0)}%`;
    lines.push(`| ${activity.date} | ${activity.activityType} | ${fmt(activity.durationMin)} min | ${fmt(activity.distanceKm, 2)} km | ${pace(activity.distanceKm, activity.durationMin)} | ${fmt(activity.avgHrBpm, 0)} | ${hrrPercent} | ${fmt(activity.internalLoadProxy)} | ${activity.loadMethod ?? "—"} |`);
  }
  lines.push("", "## Ringkasan mingguan", "", "| Minggu | Sesi | Durasi | Jarak | Load proxy | Sesi ≥80% HRR |", "|---|---:|---:|---:|---:|---:|");
  for (const week of weeks) lines.push(`| ${week.week} | ${week.sessions} | ${fmt(week.durationMin)} min | ${fmt(week.distanceKm, 2)} km | ${fmt(week.loadProxy)} | ${week.vigorousSessions} |`);
  lines.push("", "## Interpretasi berbasis sport science", "");
  for (const note of evidenceNotes(activities, weeks)) lines.push(`- ${note}`);
  lines.push("", "## Apa yang perlu dikumpulkan berikutnya", "", "- RPE sesi (0–10) untuk menghitung session-RPE yang lebih personal.", "- Tidur, nyeri, bengkak, dan resting HR untuk menghubungkan beban eksternal dengan recovery.", "- Minimal 3–4 minggu data sebelum menarik kesimpulan tren.", "");
  return lines.join("\n");
}
