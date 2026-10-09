import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps file analysis local and supports accessible upload", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /onDrop=/);
  assert.match(page, /aria-label="File Garmin atau backup" multiple accept="\.csv,\.fit/);
  assert.match(page, /<button type="button" disabled=\{!storageReady \|\| busy\}/);
  assert.match(page, /parseFitFile/);
  assert.match(page, /loadHistory/);
  assert.match(page, /snapshotSchema/);
  assert.match(page, /expandZip/);
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|FormData/);
  assert.match(layout, /Garmin Lab — Training Intelligence/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
