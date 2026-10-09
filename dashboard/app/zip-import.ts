import { Unzip, UnzipInflate } from "fflate";

// ZIP files never reach the filesystem. Stream small compressed chunks so a
// malicious declared size cannot bypass the actual expanded-byte budget.
export function expandZip(bytes: Uint8Array): { name: string; bytes: Uint8Array<ArrayBuffer> }[] {
  if (bytes.length > 25 * 1024 * 1024 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("ZIP tidak valid atau melebihi 25 MB.");
  const results: { name: string; bytes: Uint8Array<ArrayBuffer> }[] = [];
  let total = 0;
  let entries = 0;
  let completed = 0;
  const unzip = new Unzip(file => {
    if (++entries > 100) throw new Error("ZIP melebihi 100 entri.");
    if (file.name.endsWith("/")) { completed++; return; }
    if (file.name.length > 500 || file.name.includes("\\") || file.name.startsWith("/") || file.name.split("/").includes("..")) throw new Error("Nama entri ZIP tidak aman.");
    if (!/\.(fit|csv|tcx|gpx)$/i.test(file.name)) throw new Error("ZIP hanya boleh berisi CSV, FIT, TCX, dan GPX; ZIP bertingkat tidak didukung.");
    if ((file.originalSize ?? 0) > 25 * 1024 * 1024) throw new Error("Isi ZIP terlalu besar.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    file.ondata = (error, chunk, final) => {
      if (error) throw new Error("ZIP rusak atau metode kompresi tidak didukung.");
      size += chunk.length; total += chunk.length;
      if (size > 25 * 1024 * 1024 || total > 100 * 1024 * 1024) { file.terminate(); throw new Error("Hasil dekompresi ZIP melewati batas aman."); }
      chunks.push(chunk);
      if (final) {
        const output = new Uint8Array(size);
        let offset = 0;
        for (const part of chunks) { output.set(part, offset); offset += part.length; }
        results.push({ name: file.name.split("/").at(-1)!, bytes: output }); completed++;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < bytes.length; offset += 1024) unzip.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length);
  if (completed !== entries || !results.length) throw new Error("ZIP kosong atau tidak lengkap.");
  return results;
}
