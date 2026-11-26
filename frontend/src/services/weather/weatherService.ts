export interface CurrentWeather {
  temperature: number;
  apparentTemperature: number;
  relativeHumidity: number;
  precipitation: number;
  windSpeed: number;
  weatherCode: number;
  isDay: number;
  time: string;
}

export interface DailyPrecipitationPoint {
  date: string;
  precipitationSum: number;
  probabilityMax: number | null;
}

export interface HourlyPrecipitationPoint {
  time: string;
  hourLabel: string;
  precipitationMm: number;
  probabilityPercent: number | null;
}

export interface PrecipitationContext {
  last5DaysTotalMm: number;
  todayProbabilityPercent: number | null;
  todayForecastMm: number;
  history: DailyPrecipitationPoint[];
  next6Hours: HourlyPrecipitationPoint[];
}

export interface AirQualityData {
  europeanAqi: number;
  categoryLabel: string;
  categoryVariant: "good" | "warning" | "danger";
  pm25: number;
  pm10: number;
  ozone: number;
  time: string;
}

const CURITIBA_COORDINATES = {
  latitude: -25.4284,
  longitude: -49.2733,
};

export async function getCurrentWeather(): Promise<CurrentWeather> {
  const { latitude, longitude } = CURITIBA_COORDINATES;

  const url = new URL("https://api.open-meteo.com/v1/forecast");

  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation",
      "wind_speed_10m",
      "weather_code",
      "is_day",
    ].join(","),
    timezone: "America/Sao_Paulo",
  }).toString();

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Não foi possível obter os dados meteorológicos.");
  }

  const data = await response.json();

  return {
    temperature: data.current.temperature_2m,
    apparentTemperature: data.current.apparent_temperature,
    relativeHumidity: data.current.relative_humidity_2m,
    precipitation: data.current.precipitation,
    windSpeed: data.current.wind_speed_10m,
    weatherCode: data.current.weather_code,
    isDay: data.current.is_day,
    time: data.current.time,
  };
}

export async function getPrecipitationContext(): Promise<PrecipitationContext> {
  const { latitude, longitude } = CURITIBA_COORDINATES;

  const url = new URL("https://api.open-meteo.com/v1/forecast");

  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: "precipitation_sum,precipitation_probability_max",
    hourly: "precipitation,precipitation_probability",
    past_days: "5",
    forecast_days: "2",
    timezone: "America/Sao_Paulo",
  }).toString();

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Não foi possível obter o histórico de precipitação.");
  }

  const data = await response.json();
  const times: string[] = data.daily?.time ?? [];
  const sums: number[] = data.daily?.precipitation_sum ?? [];
  const probs: (number | null)[] =
    data.daily?.precipitation_probability_max ?? [];

  const allDays: DailyPrecipitationPoint[] = times.map((date, index) => ({
    date,
    precipitationSum: Number(sums[index] ?? 0),
    probabilityMax:
      probs[index] !== null && probs[index] !== undefined
        ? Number(probs[index])
        : null,
  }));

  // 5 dias anteriores (índices 0..4) e dia atual (índice 5)
  const pastDays = allDays.slice(0, 5);
  const today = allDays[5] ?? allDays[allDays.length - 1];

  const last5DaysTotalMm = Number(
    pastDays.reduce((acc, day) => acc + day.precipitationSum, 0).toFixed(1),
  );

  // Próximas 6 horas a partir do horário atual
  const hourlyTimes: string[] = data.hourly?.time ?? [];
  const hourlyPrecip: number[] = data.hourly?.precipitation ?? [];
  const hourlyProb: (number | null)[] =
    data.hourly?.precipitation_probability ?? [];

  const nowMs = Date.now();
  let startIndex = hourlyTimes.findIndex((t) => new Date(t).getTime() >= nowMs);
  if (startIndex < 0) startIndex = Math.max(0, hourlyTimes.length - 6);

  const next6Hours: HourlyPrecipitationPoint[] = hourlyTimes
    .slice(startIndex, startIndex + 6)
    .map((time, idx) => {
      const realIdx = startIndex + idx;
      const hourPart = time.split("T")[1]?.slice(0, 2) ?? "--";
      return {
        time,
        hourLabel: `${hourPart}h`,
        precipitationMm: Number((hourlyPrecip[realIdx] ?? 0).toFixed(1)),
        probabilityPercent:
          hourlyProb[realIdx] !== null && hourlyProb[realIdx] !== undefined
            ? Number(hourlyProb[realIdx])
            : null,
      };
    });

  return {
    last5DaysTotalMm,
    todayProbabilityPercent: today?.probabilityMax ?? null,
    todayForecastMm: Number((today?.precipitationSum ?? 0).toFixed(1)),
    history: pastDays,
    next6Hours,
  };
}

function classifyEuropeanAqi(aqi: number): {
  label: string;
  variant: "good" | "warning" | "danger";
} {
  if (aqi <= 20) return { label: "Boa", variant: "good" };
  if (aqi <= 40) return { label: "Razoável", variant: "good" };
  if (aqi <= 60) return { label: "Moderada", variant: "warning" };
  if (aqi <= 80) return { label: "Ruim", variant: "danger" };
  return { label: "Muito ruim", variant: "danger" };
}

export async function getCurrentAirQuality(): Promise<AirQualityData> {
  const { latitude, longitude } = CURITIBA_COORDINATES;

  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");

  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "european_aqi,pm10,pm2_5,ozone",
    timezone: "America/Sao_Paulo",
  }).toString();

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Não foi possível obter os dados de qualidade do ar.");
  }

  const data = await response.json();
  const aqi = Math.round(Number(data.current?.european_aqi ?? 0));
  const classification = classifyEuropeanAqi(aqi);

  return {
    europeanAqi: aqi,
    categoryLabel: classification.label,
    categoryVariant: classification.variant,
    pm25: Number((data.current?.pm2_5 ?? 0).toFixed(1)),
    pm10: Number((data.current?.pm10 ?? 0).toFixed(1)),
    ozone: Math.round(Number(data.current?.ozone ?? 0)),
    time: String(data.current?.time ?? ""),
  };
}

export interface RegionalWeatherSnapshot {
  temperatureC: number;
  windSpeedKmh: number;
  last5DaysTotalMm: number;
  next6HoursTotalMm: number;
  maxNext6HoursProb: number;
  soilMoistureIndex: number;
  hourlySlots: Array<{
    hourLabel: string;
    precipitationMm: number;
    probabilityPercent: number;
  }>;
}

export async function getRegionalWeatherSnapshot(
  latitude: number,
  longitude: number,
): Promise<RegionalWeatherSnapshot> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("current", "temperature_2m,wind_speed_10m");
  url.searchParams.set(
    "hourly",
    "precipitation,precipitation_probability,soil_moisture_0_to_7cm",
  );
  url.searchParams.set("daily", "precipitation_sum");
  url.searchParams.set("past_days", "5");
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set("timezone", "America/Sao_Paulo");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error("Falha ao consultar meteorologia regional");
  }

  const data = await res.json();

  const dailySums: number[] = Array.isArray(data?.daily?.precipitation_sum)
    ? data.daily.precipitation_sum
        .slice(0, 5)
        .map((v: unknown) => Number(v) || 0)
    : [];

  const last5DaysTotalMm = Number(
    dailySums.reduce((acc, v) => acc + v, 0).toFixed(1),
  );

  const hourlyTimes: string[] = data?.hourly?.time ?? [];
  const hourlyPrecip: number[] = data?.hourly?.precipitation ?? [];
  const hourlyProb: number[] = data?.hourly?.precipitation_probability ?? [];
  const hourlySoil: number[] = data?.hourly?.soil_moisture_0_to_7cm ?? [];

  const nowIsoPrefix = new Date().toISOString().slice(0, 13);
  let startIndex = hourlyTimes.findIndex((t) => t >= nowIsoPrefix);
  if (startIndex < 0) startIndex = Math.max(0, hourlyTimes.length - 12);

  const hourlySlots = Array.from({ length: 6 }, (_, idx) => {
    const i = startIndex + idx;
    const rawTime = hourlyTimes[i] ?? "";
    const hourLabel = rawTime.includes("T")
      ? rawTime.split("T")[1].slice(0, 5)
      : `${idx}h`;
    return {
      hourLabel,
      precipitationMm: Number((Number(hourlyPrecip[i]) || 0).toFixed(1)),
      probabilityPercent: Math.round(Number(hourlyProb[i]) || 0),
    };
  });

  const next6HoursTotalMm = Number(
    hourlySlots.reduce((acc, s) => acc + s.precipitationMm, 0).toFixed(1),
  );
  const maxNext6HoursProb = Math.max(
    0,
    ...hourlySlots.map((s) => s.probabilityPercent),
  );

  // Umidade volumétrica do solo (0–7cm) convertida em percentual operacional
  const rawSoil = Number(hourlySoil[startIndex]) || 0.28;
  const soilMoistureIndex = Math.min(
    100,
    Math.max(10, Math.round(rawSoil * 220)),
  );

  return {
    temperatureC: Math.round(Number(data?.current?.temperature_2m) || 19),
    windSpeedKmh: Math.round(Number(data?.current?.wind_speed_10m) || 12),
    last5DaysTotalMm,
    next6HoursTotalMm,
    maxNext6HoursProb,
    soilMoistureIndex,
    hourlySlots,
  };
}
