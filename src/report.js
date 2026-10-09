export function renderMarkdown(snapshot, result) {
  const lines = [
    `# Daily Training Check — ${snapshot.date}`,
    "",
    `- Status: **${result.status}**`,
    `- Readiness observasional: **${result.readinessScore.toFixed(1)}/100**`,
    `- Kelengkapan data: **${(result.confidence * 100).toFixed(0)}%**`,
    `- Sesi terjadwal: **${snapshot.scheduledSession ?? "Tidak dicantumkan"}**`,
    "",
    "## Rekomendasi",
    "",
    result.recommendation,
    "",
    "## Komponen",
    "",
  ];
  if (result.components.length) {
    for (const component of result.components) {
      lines.push(`- ${component.name}: ${component.score.toFixed(1)}/100 — ${component.detail}`);
    }
  } else {
    lines.push("- Belum ada metrik wearable yang cukup.");
  }
  if (result.safetyFlags.length) {
    lines.push("", "## Safety flags", "");
    for (const flag of result.safetyFlags) lines.push(`- ${flag}`);
  }
  if (result.reasons.length) {
    lines.push("", "## Catatan keputusan", "");
    for (const reason of result.reasons) lines.push(`- ${reason}`);
  }
  lines.push(
    "",
    "> Ini bukan diagnosis medis. Gejala nyata dan penilaian klinis lebih penting daripada skor wearable.",
    "",
  );
  return lines.join("\n");
}
