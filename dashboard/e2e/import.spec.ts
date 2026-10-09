import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { readFile } from "node:fs/promises";

const csv = `Jenis Aktivitas,Tanggal,Jarak,Waktu,Rata2 HR,Denyut Jantung Maks
Berlari,2026-09-23 06:15:00,5.00,00:35:40,166,182`;

test("imports Garmin CSV, persists it, and exports a restorable backup", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Dari data wearable/ })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/Siap|dipulihkan|Tersimpan/);
  await page.getByLabel("File Garmin atau backup", { exact: true }).setInputFiles({ name: "Activities.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("1 rekaman siap dianalisis")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Tersimpan");

  await page.reload();
  await expect(page.getByText("1 rekaman siap dianalisis")).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh backup JSON" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("garmin-lab-backup.json");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Hapus semua data" }).click();
  await expect(page.getByText("Tarik semua export Garmin")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("File Garmin atau backup", { exact: true }).setInputFiles({ name: "garmin-lab-backup.json", mimeType: "application/json", buffer: await readFile(await download.path()) });
  await expect(page.getByText("1 rekaman siap dianalisis")).toBeVisible();
});

test("imports supported files from a Garmin ZIP export", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText(/Siap|dipulihkan|Tersimpan/);
  const archive = zipSync({ "Activities.csv": strToU8(csv) });
  await page.getByLabel("File Garmin atau backup", { exact: true }).setInputFiles({ name: "garmin-export.zip", mimeType: "application/zip", buffer: Buffer.from(archive) });
  await expect(page.getByText("1 rekaman siap dianalisis")).toBeVisible();
});

test("reads GPX distance without assuming the sport is running", async ({ page }) => {
  const gpx = `<?xml version="1.0"?><gpx version="1.1"><trk><name>Morning route</name><trkseg>
  <trkpt lat="-6.2000" lon="106.8000"><time>2026-09-26T00:00:00Z</time></trkpt>
  <trkpt lat="-6.2000" lon="106.8100"><time>2026-09-26T00:10:00Z</time></trkpt>
  </trkseg></trk></gpx>`;
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText(/Siap|dipulihkan|Tersimpan/);
  await page.getByLabel("File Garmin atau backup", { exact: true }).setInputFiles({ name: "route.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from(gpx) });
  await expect(page.getByText("Morning route").last()).toBeVisible();
  await expect(page.getByText("1.11 km").last()).toBeVisible();
});

test("imports Taxuspt Garmin MCP JSON without treating it as a backup", async ({ page }) => {
  const stats = JSON.stringify({
    date: "2026-10-05",
    total_steps: 8123,
    resting_heart_rate_bpm: 55,
    avg_stress_level: 31,
    body_battery_current: 68,
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText(/Siap|dipulihkan|Tersimpan/);
  await page.getByLabel("File Garmin atau backup", { exact: true }).setInputFiles({ name: "get-stats.json", mimeType: "application/json", buffer: Buffer.from(stats) });
  await expect(page.getByText("Daily health MCP", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("55 bpm")).toBeVisible();
  await expect(page.getByText(/Body Battery 68/)).toBeVisible();
});

test("keeps the disabled Live MCP notice on its own responsive page", async ({ page }) => {
  for (const viewport of [{ width: 360, height: 640 }, { width: 1600, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/live");
    await expect(page.getByRole("heading", { name: "Kondisi Garmin saat ini" })).toBeVisible();
    await expect(page.getByText("Live MCP dinonaktifkan.")).toBeVisible();
    await expect(page.getByText("Akses Garmin MCP dinonaktifkan untuk project ini.")).toBeVisible();
    await expect(page.getByText("Tarik semua export Garmin")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
