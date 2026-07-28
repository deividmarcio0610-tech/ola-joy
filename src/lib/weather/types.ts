export type WeatherStatus =
  | "NORMAL"
  | "ATENCAO"
  | "ALERTA"
  | "SUSPENSAO"
  | "EMERGENCIA"
  | "INDISPONIVEL";

export type WeatherCurrent = {
  temperature_2m: number;
  apparent_temperature: number;
  relative_humidity_2m: number;
  is_day: number;
  precipitation: number;
  rain: number;
  showers: number;
  weather_code: number;
  cloud_cover: number;
  pressure_msl: number;
  surface_pressure: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
  wind_gusts_10m: number;
  time: string;
};

export type WeatherHourly = {
  time: string[];
  temperature_2m: number[];
  relative_humidity_2m: number[];
  apparent_temperature: number[];
  precipitation_probability: number[];
  precipitation: number[];
  rain: number[];
  showers: number[];
  weather_code: number[];
  cloud_cover: number[];
  visibility: number[];
  wind_speed_10m: number[];
  wind_direction_10m: number[];
  wind_gusts_10m: number[];
  uv_index: number[];
  cape?: number[];
  lifted_index?: number[];
};

export type WeatherDaily = {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  apparent_temperature_max: number[];
  apparent_temperature_min: number[];
  sunrise: string[];
  sunset: string[];
  uv_index_max: number[];
  precipitation_sum: number[];
  rain_sum: number[];
  showers_sum: number[];
  precipitation_probability_max: number[];
  wind_speed_10m_max: number[];
  wind_gusts_10m_max: number[];
};

export type WeatherResponse = {
  success: boolean;
  provider: "open-meteo";
  fetchedAt: string;
  /** Quando true, os dados vêm do cache/último snapshot válido porque o provedor falhou. */
  stale?: boolean;
  /** Motivo amigável quando `stale=true` (ex.: limite temporário da API). */
  staleReason?: string;
  location: { latitude: number; longitude: number; timezone: string };
  current: WeatherCurrent;
  hourly: WeatherHourly;
  daily: WeatherDaily;
  error?: string;
};


export type WeatherLocation = {
  id: string;
  name: string;
  contract: string | null;
  unit: string | null;
  latitude: number;
  longitude: number;
  lightning_radius_km: number;
  warning_radius_km: number;
  responsible_name: string | null;
  responsible_phone: string | null;
  responsible_email: string | null;
  timezone: string;
  is_primary: boolean;
  enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export const WEATHER_CODE_LABEL: Record<number, string> = {
  0: "Céu limpo",
  1: "Predominantemente limpo",
  2: "Parcialmente nublado",
  3: "Encoberto",
  45: "Névoa",
  48: "Névoa com geada",
  51: "Garoa leve",
  53: "Garoa moderada",
  55: "Garoa densa",
  61: "Chuva leve",
  63: "Chuva moderada",
  65: "Chuva forte",
  71: "Neve leve",
  73: "Neve moderada",
  75: "Neve forte",
  80: "Aguaceiros leves",
  81: "Aguaceiros moderados",
  82: "Aguaceiros violentos",
  95: "Trovoada",
  96: "Trovoada com granizo leve",
  99: "Trovoada com granizo forte",
};
