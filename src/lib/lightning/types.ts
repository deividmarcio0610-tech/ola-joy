export type LightningStrike = {
  id: string;
  provider: string;
  latitude: number;
  longitude: number;
  occurredAt: string;
  receivedAt: string;
  distanceKm: number;
  bearingDegrees?: number;
  type?: "cloud_ground" | "intra_cloud" | "unknown";
  polarity?: "positive" | "negative" | "unknown";
  intensityKa?: number;
  quality?: number;
};

export interface LightningProvider {
  name: string;
  fetchRecentStrikes(params: {
    latitude: number;
    longitude: number;
    radiusKm: number;
    minutes: number;
  }): Promise<LightningStrike[]>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}
