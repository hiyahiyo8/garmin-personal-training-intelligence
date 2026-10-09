# Garmin Personal Training Intelligence

Sistem lokal untuk mengevaluasi file export Garmin dengan pendekatan sport science yang transparan. MCP bersifat opsional; alur export manual tetap dapat digunakan tanpa koneksi langsung ke akun Garmin.

## Alur utama

```text
Garmin Connect
      ↓ export CSV
dashboard lokal
      ↓
parser multi-file + normalisasi
      ↓
volume, recovery, performance, dan subjective check-in
```

## Dashboard drag-and-drop

Klik dua kali `scripts\start-dashboard.cmd`, lalu buka `http://localhost:4174`.

1. Pilih atau tarik file CSV, FIT, TCX, GPX, ZIP Garmin, atau output JSON Taxuspt/garmin_mcp sekaligus.
2. Isi HR maksimum dan resting HR.
3. Periksa volume, intensity estimate, sleep, HRV, VO₂max, dan running dynamics.
4. Isi check-in setelah latihan untuk menambahkan RPE dan respons subjektif.
5. Unduh backup JSON, laporan Markdown, CSV longitudinal FIT, atau cetak ke PDF.

Seluruh parsing berlangsung di browser. File tidak diunggah ke server eksternal. Daftar export yang didukung ada di [dashboard/README.md](dashboard/README.md).

### Akses privat dari perangkat lain

Untuk membuka dashboard dari HP/laptop saat berada di luar jaringan rumah, gunakan [Tailscale Personal](https://tailscale.com/pricing) (gratis untuk penggunaan personal). [Pasang Tailscale](https://tailscale.com/download) dan login pada komputer host serta perangkat yang akan mengakses menggunakan akun yang sama. Lalu jalankan `scripts\start-private-dashboard.cmd`; script membangun versi production, memasang Tailscale Serve, lalu menjalankan server pada `127.0.0.1:4174`. Buka alamat HTTPS `.ts.net` yang ditampilkan Tailscale. Pada penggunaan pertama, ikuti prompt untuk mengaktifkan HTTPS/MagicDNS pada tailnet. Dashboard serta MCP tetap berjalan pada komputer host; komputer harus menyala. Script memakai Tailscale Serve privat, bukan Funnel publik.

Untuk menghentikan route Garmin Lab saja, jalankan `scripts\stop-private-dashboard.cmd`. Script ini tidak menghapus route Serve lain. Dashboard yang sedang berjalan dihentikan terpisah dengan Ctrl+C. Tailscale Serve berjalan privat di tailnet; gunakan hanya perangkat tepercaya yang login ke akun Tailscale Anda. Panduan paket Personal dan Serve: [Tailscale pricing](https://tailscale.com/pricing) · [Serve CLI](https://tailscale.com/docs/reference/tailscale-cli/serve).

## Integrasi MCP opsional

Source [Taxuspt/garmin_mcp](https://github.com/Taxuspt/garmin_mcp) di-clone ke `vendor/Taxuspt-garmin_mcp` dan dipakai sebagai kontrak format untuk data health/training tambahan. Dashboard menerima JSON dari `get_stats`, `get_stats_range`, `get_sleep_summary_range`, `get_hrv_trend`, `get_vo2max_trend`, dan `get_training_load_trend`.

Python 3.12 dan `uv` belum menjadi prasyarat dashboard. Jika keduanya belum tersedia, jalur CSV/FIT tetap berfungsi penuh; JSON MCP bisa diimpor ketika output tool sudah tersedia dari client MCP lain. Password/token Garmin tidak disimpan di repository atau frontend.

Integrasi Garmin MCP langsung dinonaktifkan di project ini: konfigurasi server Codex project dihapus dan route `/api/live` tidak lagi menjalankan MCP. Token autentikasi yang mungkin tersimpan di profil Windows berada di luar repository dan tidak ikut dihapus. Untuk mencabut token tersimpan, hapus `%USERPROFILE%\.garmin-mcp` atau cabut sesi aplikasi dari pengaturan akun Garmin.

## Jalur command-line lama

Parser aktivitas berbasis terminal tetap tersedia untuk CSV/JSON aktivitas:

```powershell
Copy-Item config/athlete-profile.example.json config/athlete-profile.json
node src/cli.js import --input data/imports --profile config/athlete-profile.json --output reports/private/garmin-evaluation.md
```

## Prinsip akademik dan keselamatan

- Data Garmin diperlakukan sebagai observasi, bukan diagnosis.
- Session-RPE diprioritaskan untuk internal load; HR proxy hanya dipakai pada aktivitas aerobik.
- Sleep dan HRV dibandingkan dengan tren/baseline personal, bukan digabung menjadi skor otomatis.
- Perubahan volume ditampilkan secara deskriptif, bukan sebagai prediksi cedera.
- Running dynamics tidak diberi target universal seperti cadence 180.
- Nyeri, bengkak, pincang, nyeri dada, atau gejala lain mengalahkan skor wearable.

FIT aktivitas diproses untuk time-in-zone berbasis %HRR, Pa:HR drift proxy, lap aktual, dan recovery HR 60 detik bila jam merekam fase setelah timer berhenti. TCX/GPX didukung untuk ringkasan rute; FIT tetap diperlukan untuk analisis time-series lengkap.

## Pengujian

```powershell
cd dashboard
npm.cmd test
npm.cmd run test:e2e
```

Daftar referensi dan batasan metode ada di [docs/evidence.md](docs/evidence.md).
