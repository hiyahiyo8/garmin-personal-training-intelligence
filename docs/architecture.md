# Arsitektur export-based

## Lapisan sistem

1. **Source** — file CSV, FIT, TCX, GPX, ZIP, atau backup JSON hasil export Garmin Connect.
2. **Normalization** — kolom Garmin diubah menjadi kontrak aktivitas internal.
3. **Derived metrics** — durasi, jarak, pace, %HRR, dan internal-load proxy dihitung secara deterministik.
4. **Evaluation** — beban mingguan, distribusi intensitas, dan guardrail progresi dirangkum.
5. **Report** — hasil ditulis sebagai Markdown yang dapat diaudit.

```text
Garmin export CSV/JSON
          ↓
     normalized activities
          ↓
  derived metrics + weekly buckets
          ↓
     sport-science report
```

## Mengapa tidak memakai skor AI langsung?

- LLM tidak boleh menjadi sumber angka utama.
- Setiap perhitungan harus dapat direproduksi dari file input.
- Data kosong tidak boleh dianggap normal.
- Wearable tidak dapat mendiagnosis cedera.
- Interpretasi harus menyebut asumsi dan keterbatasan.

## Metrik yang digunakan

| Metrik | Status | Catatan |
|---|---|---|
| Durasi, jarak, pace, HR | Data export | Deskriptif |
| %HRR | Turunan | Membutuhkan HRmax dan HRrest personal |
| Internal-load proxy | Turunan | Durasi × kelas intensitas; bukan TRIMP tervalidasi |
| Beban mingguan | Turunan | Untuk melihat perubahan antar-minggu |
| Guardrail kenaikan >30% | Heuristik konservatif | Bukan diagnosis overtraining |
| Time-in-zone FIT | Turunan | Durasi per zona %HRR dari record bertimestamp |
| Pa:HR drift proxy | Turunan | Perubahan efficiency factor speed/HR antarparuh sesi |

## Guardrail

Laporan memberi peringatan bila beban minggu terakhir naik tajam dibanding minggu sebelumnya atau terdapat sesi dengan rata-rata HR tinggi. Gejala seperti nyeri, bengkak, pincang, nyeri dada, pingsan, atau demam harus dimasukkan dalam catatan terpisah dan selalu mengalahkan interpretasi wearable.

## Roadmap selesai

- Import multi-file dan ZIP dengan batas ukuran/entri.
- Normalisasi CSV Garmin Indonesia, FIT, TCX, dan GPX.
- Analisis mingguan 12 pekan termasuk minggu tanpa aktivitas.
- Session-RPE dipisahkan dari HR proxy.
- FIT longitudinal: zona %HRR, Pa:HR, lap, dan recovery HR bila tersedia.
- Sleep, HRV, VO2max, fitness age, dan running dynamics sebagai tren terpisah.
- Check-in subjektif serta rekomendasi berbasis aturan yang tunduk pada pain guardrail.
- Histori IndexedDB dan backup/restore JSON tervalidasi.
- Ekspor laporan Markdown, CSV longitudinal FIT, serta cetak/PDF.
- Lint, typecheck, unit/integration test, browser E2E, build, dan audit dependency.

SQLite dan model AI eksternal sengaja tidak ditambahkan: IndexedDB sudah memenuhi kebutuhan single-user lokal, sedangkan aturan deterministik lebih mudah diaudit untuk data kesehatan.
