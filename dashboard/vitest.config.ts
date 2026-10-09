import { defineConfig } from "vitest/config";

// Pure domain tests intentionally do not start vinext/Cloudflare workers.
export default defineConfig({ test: { environment: "node", include: ["app/**/*.test.ts"], restoreMocks: true } });
