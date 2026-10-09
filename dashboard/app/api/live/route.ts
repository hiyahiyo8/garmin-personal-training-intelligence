export async function GET() {
  return Response.json(
    { error: "Akses Garmin MCP dinonaktifkan untuk project ini." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
