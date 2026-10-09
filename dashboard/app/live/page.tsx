import type { Metadata } from "next";
import Link from "next/link";
import LiveMonitoring from "../live-monitoring";

export const metadata: Metadata = {
  title: "Live MCP — Garmin Lab",
  description: "Monitoring read-only data Garmin terbaru melalui MCP lokal.",
};

export default function LivePage() {
  return (
    <main className="livePage">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Kembali ke Garmin Lab dashboard">
          <span className="brandMark">GL</span>
          <span><strong>Garmin Lab</strong><small>Live monitoring</small></span>
        </Link>
        <nav className="topnav" aria-label="Navigasi utama">
          <Link className="pageLink" href="/">Dashboard <span aria-hidden="true">↗</span></Link>
        </nav>
        <div className="privacyPill"><span className="statusDot" /> Read-only lokal</div>
      </header>

      <LiveMonitoring />

      <footer><span>Garmin Lab · Live MCP</span><p>Untuk edukasi dan refleksi latihan. Bukan alat diagnosis medis.</p></footer>
    </main>
  );
}
