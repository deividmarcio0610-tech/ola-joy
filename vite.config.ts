// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Alvo do deploy: VPS com Node (PM2 na porta 3002). Sem fixar aqui, um `npm run build`
  // feito sem a variável NITRO_PRESET sai como módulo estilo Cloudflare Worker
  // (`export default { fetch }`), que não abre porta nenhuma. O deploy-vision já exporta
  // NITRO_PRESET=node_server; esta linha garante o mesmo resultado num build manual.
  nitro: { preset: process.env.NITRO_PRESET || "node-server" },
});
