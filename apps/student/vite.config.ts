import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function resolveBasePath(): string {
  const candidate = process.env.VITE_BASE_PATH?.trim();
  if (!candidate) {
    return "/";
  }

  const withLeadingSlash = candidate.startsWith("/") ? candidate : `/${candidate}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default defineConfig({
  plugins: [react()],
  base: resolveBasePath(),
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist",
  },
});
