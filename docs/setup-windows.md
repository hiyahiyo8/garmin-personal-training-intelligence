# Setup Windows: workflow export Garmin

## 1. Ekspor data

Di Garmin Connect, ekspor data sebagai CSV, FIT, TCX, GPX, atau ZIP. ZIP dapat langsung ditarik ke dashboard selama hanya berisi format yang didukung.

Salin file aktivitas ke:

```text
C:\Users\USER\Documents\Garmin\data\imports
```

Jangan menaruh password, token, atau credential Garmin di folder project.

## 2. Buat profil HR lokal

```powershell
Copy-Item config/athlete-profile.example.json config/athlete-profile.json
```

Isi `max_hr_bpm` dan `resting_hr_bpm` dengan nilai personal yang kamu pilih. File tersebut masuk `.gitignore`.

## 3. Jalankan evaluasi

Untuk satu file:

```powershell
node src/cli.js import --input data/imports/activities.csv --profile config/athlete-profile.json --output reports/private/evaluation.md
```

Untuk semua CSV/JSON dalam folder:

```powershell
node src/cli.js import --input data/imports --profile config/athlete-profile.json --output reports/private/evaluation.md
```

## 4. Cara membaca hasil

- Tabel aktivitas menunjukkan metrik yang benar-benar ada di file.
- `%HRR` hanya muncul jika HRmax dan HRrest tersedia.
- `load proxy` adalah indikator internal sederhana, bukan diagnosis dan bukan pengganti session-RPE.
- Gunakan minimal 3–4 minggu data untuk melihat tren.
- Jika ada nyeri, bengkak, atau pincang, hentikan progresi impact dan evaluasi secara klinis.
