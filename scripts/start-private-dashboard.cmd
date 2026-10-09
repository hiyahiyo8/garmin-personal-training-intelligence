@echo off
setlocal

set "TAILSCALE="
for /f "delims=" %%I in ('where.exe tailscale 2^>nul') do if not defined TAILSCALE set "TAILSCALE=%%I"
if not defined TAILSCALE if exist "%ProgramFiles%\Tailscale\tailscale.exe" set "TAILSCALE=%ProgramFiles%\Tailscale\tailscale.exe"
if not defined TAILSCALE (
  echo Tailscale belum terpasang atau belum ada di PATH.
  echo Install Tailscale di komputer ini dan perangkat yang akan mengakses dashboard.
  echo Login keduanya menggunakan akun Tailscale yang sama, lalu jalankan ulang script ini.
  pause
  exit /b 1
)

call "%TAILSCALE%" status >nul 2>&1
if errorlevel 1 (
  echo Tailscale belum aktif atau belum login. Buka aplikasinya, login, lalu jalankan ulang script ini.
  pause
  exit /b 1
)

cd /d "%~dp0..\dashboard"
if errorlevel 1 exit /b 1

echo Menyiapkan production build Garmin Lab...
call npm.cmd run build
if errorlevel 1 (
  echo Build gagal. Tailscale Serve belum diubah.
  pause
  exit /b 1
)

echo Membagikan dashboard secara privat ke perangkat dalam tailnet Tailscale...
call "%TAILSCALE%" serve status 2>nul | findstr /I /C:"http://127.0.0.1:4174" >nul
if errorlevel 1 (
  call "%TAILSCALE%" serve status 2>nul | findstr /I /C:"https://" /C:"http://" /C:"tcp://" >nul
  if not errorlevel 1 (
    echo Konfigurasi Tailscale Serve lain terdeteksi.
    echo Script berhenti agar tidak menimpa layanan yang sudah ada. Periksa: "%TAILSCALE%" serve status
    pause
    exit /b 1
  )
)

call "%TAILSCALE%" serve --bg http://127.0.0.1:4174
if errorlevel 1 (
  echo Gagal mengaktifkan Tailscale Serve. Periksa status Tailscale dan izin HTTPS Serve.
  pause
  exit /b 1
)

echo.
echo URL privat ditampilkan oleh perintah Tailscale Serve di atas.
echo PC ini harus tetap menyala dan dashboard tetap berjalan agar dapat diakses.
echo Tekan Ctrl+C untuk menghentikan dashboard. Untuk menghentikan route Garmin Lab saja, jalankan scripts\stop-private-dashboard.cmd.
echo.

call npm.cmd run start -- --hostname 127.0.0.1 --port 4174
