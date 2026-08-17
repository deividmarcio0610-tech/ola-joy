import { createFileRoute } from "@tanstack/react-router";
import { getLightningProvider } from "@/lib/lightning/router.server";
import { calculateDistanceKm, calculateBearing } from "@/lib/lightning/distance";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const Route = createFileRoute("/api/public/lightning/recent")({
  server: {
    handlers: {
      OPTIONS: async () => new Response("ok", { headers: cors }),
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const latitude = Number(url.searchParams.get("latitude"));
          const longitude = Number(url.searchParams.get("longitude"));
          const radiusKm = Number(url.searchParams.get("radiusKm") ?? 50);
          const minutes = Number(url.searchParams.get("minutes") ?? 60);
          if (
            !Number.isFinite(latitude) ||
            latitude < -90 ||
            latitude > 90 ||
            !Number.isFinite(longitude) ||
            longitude < -180 ||
            longitude > 180
          ) {
            return new Response(
              JSON.stringify({ success: false, error: "coordenadas inválidas", strikes: [] }),
              { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
            );
          }
          const provider = getLightningProvider();
          const health = await provider.healthCheck();
          if (!health.ok) {
            return new Response(
              JSON.stringify({
                success: true,
                provider: provider.name,
                enabled: false,
                message: health.message,
                strikes: [],
              }),
              { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
            );
          }
          const raw = await provider.fetchRecentStrikes({ latitude, longitude, radiusKm, minutes });
          // Recalcular distância no servidor — nunca confiar no fornecedor.
          const strikes = raw.map((s) => ({
            ...s,
            distanceKm: calculateDistanceKm(latitude, longitude, s.latitude, s.longitude),
            bearingDegrees: calculateBearing(latitude, longitude, s.latitude, s.longitude),
          }));
          return new Response(
            JSON.stringify({ success: true, provider: provider.name, enabled: true, strikes }),
            { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
          );
        } catch (err) {
          return new Response(
            JSON.stringify({
              success: false,
              error: err instanceof Error ? err.message : "erro",
              strikes: [],
            }),
            { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
