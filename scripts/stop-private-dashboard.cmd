@echo off
setlocal

set "TAILSCALE="
for /f "delims=" %%I in ('where.exe tailscale 2^>nul') do if not defined TAILSCALE set "TAILSCALE=%%I"
if not defined TAILSCALE if exist "%ProgramFiles%\Tailscale\tailscale.exe" set "TAILSCALE=%ProgramFiles%\Tailscale\tailscale.exe"
if not defined TAILSCALE (
  echo Tailscale CLI tidak ditemukan. Tidak ada konfigurasi yang diubah.
  pause
  exit /b 1
)

call "%TAILSCALE%" serve --bg http://127.0.0.1:4174 off
if errorlevel 1 (
  echo Route Garmin Lab gagal dihentikan. Konfigurasi Tailscale lain tidak diubah.
  pause
  exit /b 1
)

echo Akses Tailscale Serve untuk Garmin Lab sudah dihentikan.
echo Server lokal tidak dihentikan; tutup jendela server dengan Ctrl+C bila masih berjalan.
pause
