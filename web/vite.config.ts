import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base: "./",
  envDir: "..",
  plugins: [react()],
  resolve: {
    alias: {
      // Use the library source directly; its sole dependency resolves from this package.
      timeplace: here("../js/src/index.ts"),
      "tz-lookup": here("./node_modules/tz-lookup"),
    },
  },
  server: { fs: { allow: [here("..")] } },
});
