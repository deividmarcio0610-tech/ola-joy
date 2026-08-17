import { createFileRoute } from "@tanstack/react-router";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const Route = createFileRoute("/api/public/weather/geocode")({
  server: {
    handlers: {
      OPTIONS: async () => new Response("ok", { headers: cors }),
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const q = url.searchParams.get("q");
          if (!q || q.trim().length < 2) {
            return new Response(JSON.stringify({ success: false, error: "consulta muito curta" }), {
              status: 400,
              headers: { ...cors, "Content-Type": "application/json" },
            });
          }
          const base =
            process.env.OPEN_METEO_GEOCODING_URL || "https://geocoding-api.open-meteo.com";
          const endpoint = `${base}/v1/search?name=${encodeURIComponent(q)}&count=8&language=pt&format=json`;
          // Sem timeout, um provedor lento segura o worker até o limite do runtime.
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10_000);
          let res: Response;
          try {
            res = await fetch(endpoint, {
              headers: { Accept: "application/json" },
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timer);
          }
          if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
          const data = await res.json();
          return new Response(JSON.stringify({ success: true, results: data.results ?? [] }), {
            status: 200,
            headers: {
              ...cors,
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=600",
            },
          });
        } catch (err) {
          return new Response(
            JSON.stringify({ success: false, error: err instanceof Error ? err.message : "erro" }),
            { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
