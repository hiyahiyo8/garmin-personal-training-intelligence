type Dated = { date: string };
type Context = {
  today: string;
  checkIn?: Dated & { pain: number; fatigue: number; soreness: number; stress: number; rpe: number };
  sleep?: Dated & { durationHours: number | null };
  hrv?: Dated & { nightly: number | null; baselineLow: number | null };
  activity?: Dated & { intensity: string };
};

// Product heuristics for discussion, not validated readiness or injury scores.
export function recommendSession({ today, checkIn, sleep, hrv, activity }: Context) {
  const fresh = (point: Dated | undefined) => {
    const age = point ? (Date.parse(today) - Date.parse(point.date)) / 86_400_000 : NaN;
    return Number.isFinite(age) && age >= 0 && age <= 1;
  };
  if (fresh(checkIn) && checkIn && checkIn.pain >= 4) return { title: "Tunda latihan yang memicu nyeri", body: `Check-in ${checkIn.date}: nyeri ${checkIn.pain}/10. Jangan memaksakan lari. Bengkak, pincang, atau nyeri menetap memerlukan pemeriksaan langsung.` };
  if (!fresh(checkIn) || !fresh(sleep) || sleep?.durationHours === null) return { title: "Data terkini belum cukup", body: "Lengkapi check-in dan data tidur hari ini atau kemarin. Riwayat lama tidak menunjukkan kesiapan hari ini." };
  const reasons: string[] = [];
  if (sleep && sleep.durationHours !== null && sleep.durationHours < 6) reasons.push(`tidur ${sleep.durationHours} jam`);
  if (checkIn && (checkIn.fatigue >= 7 || checkIn.soreness >= 7 || checkIn.stress >= 7 || checkIn.rpe >= 7)) reasons.push("respons subjektif berat");
  if (fresh(activity) && activity?.intensity === "hard") reasons.push("sesi berat dalam dua tanggal terakhir");
  if (fresh(hrv) && hrv?.nightly !== null && hrv?.baselineLow !== null && hrv && hrv.nightly < hrv.baselineLow) reasons.push("HRV di bawah baseline Garmin; satu malam bukan diagnosis");
  if (reasons.length) return { title: "Pertimbangkan recovery atau sesi mudah", body: `${reasons.join("; ")}. Sesuaikan dengan gejala dan rencana; tidak ada perubahan otomatis pada jadwal.` };
  return { title: "Tinjau sesi terjadwal", body: "Data tidur dan check-in terkini tidak memicu aturan kehati-hatian ini. Ini bukan izin medis atau jaminan kesiapan. Konfirmasi kondisi tubuh sebelum mengikuti rencana." };
}
