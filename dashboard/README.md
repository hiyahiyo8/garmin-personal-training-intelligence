# Garmin Lab dashboard

Dashboard lokal untuk menganalisis file CSV, FIT, TCX, GPX, ZIP Garmin, dan output JSON dari [Taxuspt/garmin_mcp](https://github.com/Taxuspt/garmin_mcp). Semua parsing berlangsung di browser; file tidak dikirim ke layanan eksternal.

## Menjalankan

```powershell
npm.cmd install
npm.cmd run dev
```

Buka `http://localhost:4174`, lalu tarik seluruh file export Garmin ke area upload.

## Export yang didukung

- Activities
- Tidur
- Status HRV
- VO₂ Maks
- Usia Kebugaran
- Total Jarak
- Total Waktu Aktivitas
- Kalori Aktivitas
- Rata2 Pace
- Kecepatan Rata2
- Rata2 Denyut Jantung
- Denyut Jantung Maks
- Daya Ambang Batas Fungsional

Importer menerima format Indonesia Garmin, termasuk laporan dengan dua baris header dan rentang tanggal lama di `Tidur.csv`.

File aktivitas `.fit` juga didukung. Importer memeriksa signature dan CRC, membatasi ukuran ke 25 MB, dan menolak file tanpa record aktivitas. Garmin FIT SDK dimuat hanya ketika file FIT dipilih.

ZIP diperiksa sebelum ekstraksi dan hanya menerima CSV/FIT/TCX/GPX. Histori tersimpan di IndexedDB browser dan dapat dipindahkan melalui backup JSON.

### Output Taxuspt/garmin_mcp

Dashboard mengenali respons JSON mentah dari tool berikut. Simpan respons tool sebagai file `.json`, lalu drag-and-drop bersama export Garmin lain:

- `get_stats` atau `get_stats_range` — langkah dan, untuk `get_stats`, resting HR, stress, Body Battery, serta respirasi.
- `get_sleep_summary_range` — durasi/skor tidur dan HRV semalaman yang tersedia.
- `get_hrv_trend` — HRV nightly dan rolling average.
- `get_vo2max_trend` — tren VO₂max Garmin.
- `get_training_load_trend` — ATL, CTL, TSB, dan ACWR Garmin.

Repo MCP disimpan terpisah di `../vendor/Taxuspt-garmin_mcp`; Python/`uv` tidak menjadi dependency dashboard. Kredensial dan token Garmin tidak pernah dibaca oleh frontend. Nilai training load dan Body Battery tetap diberi label sebagai metrik Garmin dan tidak dipakai sebagai diagnosis atau batas cedera.

## Analitik

- External volume: sesi, durasi, jarak, dan tren mingguan.
- Internal load: session-RPE bila diisi; fallback HR proxy hanya untuk aktivitas aerobik.
- Sleep dan HRV terhadap baseline personal tanpa readiness score tunggal.
- Tren VO₂max, fitness age, breathwork response, dan running dynamics.
- Check-in lokal: RPE, pain, soreness, fatigue, sleep quality, stress, mood.
- FIT time-series: time-in-zone %HRR, Pa:HR drift proxy untuk sesi minimal 20 menit, dan recovery HR 60 detik bila record pasca-berhenti tersedia.
- Kelengkapan data dan batasan metode ditampilkan bersama hasil.

## Pengujian

```powershell
npm.cmd test
npm.cmd run test:unit
npm.cmd run test:e2e
npm.cmd run lint
npm.cmd run typecheck
```

Pengujian mencakup build, validasi input, decoding FIT, analisis HR time-series, format Activities Indonesia, Sleep dengan koma tidak terkutip, HRV, laporan dua-header, pace, HR, fitness age, FTP, ZIP/GPX, persistensi browser, serta backup dan restore.

## Status milestone

| Milestone | Status |
|---|---|
| 1. Import CSV Garmin Indonesia | Selesai |
| 2. Dashboard sport-science lokal | Selesai |
| 3. FIT longitudinal analysis | Selesai |
| 4. Weekly load dan session-RPE | Selesai |
| 5. Sleep, HRV, VO2max, dan running dynamics | Selesai |
| 6. Rekomendasi berbasis aturan dan guardrail gejala | Selesai |
| 7. ZIP, TCX, dan GPX | Selesai |
| 8. IndexedDB, backup, dan restore | Selesai |
| 9. Validasi, keamanan import, dan quality gates | Selesai |
| 10. Ekspor Markdown/CSV serta cetak PDF | Selesai |
| 11. Import output JSON Taxuspt/garmin_mcp | Selesai |
