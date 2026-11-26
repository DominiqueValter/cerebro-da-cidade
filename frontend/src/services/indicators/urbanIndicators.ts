import type { CurrentWeather } from "../weather/weatherService";
import type { UrbanEvent } from "../../features/overview/data/urbanEvents";
import { getWeatherDescription } from "../../components/dashboard/WeatherMetric";

export type DataProvenance = "real" | "calculated" | "demonstrative";

export type RiskVariant = "default" | "warning" | "danger";

export interface ClimateAssessment {
  riskLevel: "Baixo" | "Moderado" | "Alto";
  score: number;
  summary: string;
  variant: RiskVariant;
  provenance: DataProvenance;
  impacts: {
    mobility: string;
    drainage: string;
    visibility: string;
  };
}

export interface UrbanSubIndex {
  key: "climate" | "drainage" | "mobility" | "incidents";
  label: string;
  weight: number;
  score: number;
  color: string;
  provenance: DataProvenance;
}

export interface UrbanIndexResult {
  score: number;
  status: {
    label: "Estável" | "Atenção" | "Crítico";
    variant: "good" | "warning" | "danger";
  };
  subIndices: UrbanSubIndex[];
  realSharePercent: number;
  demonstrativeSharePercent: number;
  weatherConnected: boolean;
}

export const INDICATOR_WEIGHTS = {
  climate: 0.3,
  drainage: 0.3,
  mobility: 0.25,
  incidents: 0.15,
} as const;

const SEVERITY_PENALTIES: Record<UrbanEvent["severity"], number> = {
  high: 25,
  medium: 12,
  low: 5,
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Avalia o risco climático operacional com base nos dados reais da Open-Meteo.
 * Critérios:
 * - Alto: tempestade (WMO 95, 96, 99), chuva >= 5 mm/h ou vento >= 45 km/h
 * - Moderado: chuva > 0 mm/h, garoa, neblina (WMO 45, 48) ou vento >= 28 km/h
 * - Baixo: condições sem precipitação ou rajadas relevantes
 */
export function evaluateClimateRisk(
  weather: CurrentWeather | null,
): ClimateAssessment {
  if (!weather) {
    return {
      riskLevel: "Baixo",
      score: 100,
      summary: "Aguardando leitura meteorológica",
      variant: "default",
      provenance: "calculated",
      impacts: {
        mobility: "Normal",
        drainage: "Normal",
        visibility: "Boa",
      },
    };
  }

  const { weatherCode, precipitation, windSpeed } = weather;

  const isStorm = [95, 96, 99].includes(weatherCode);
  const isHeavyRain = [65, 67, 82].includes(weatherCode) || precipitation >= 5;
  const isModerateRain =
    [51, 53, 55, 56, 57, 61, 63, 66, 80, 81].includes(weatherCode) ||
    precipitation > 0;
  const isFog = [45, 48].includes(weatherCode);
  const isStrongWind = windSpeed >= 45;
  const isModerateWind = windSpeed >= 28;

  if (isStorm || isHeavyRain || isStrongWind) {
    return {
      riskLevel: "Alto",
      score: 25,
      summary: isStorm
        ? "Tempestade com potencial de impacto"
        : isHeavyRain
          ? "Chuva intensa em Curitiba"
          : "Rajadas fortes de vento",
      variant: "danger",
      provenance: "calculated",
      impacts: {
        mobility: "Impactada",
        drainage: isHeavyRain || isStorm ? "Alerta" : "Normal",
        visibility: "Reduzida",
      },
    };
  }

  if (isModerateRain || isFog || isModerateWind) {
    return {
      riskLevel: "Moderado",
      score: 65,
      summary: isFog
        ? "Neblina com redução de visibilidade"
        : isModerateRain
          ? `${getWeatherDescription(weatherCode)} · Pista molhada`
          : "Vento moderado em observação",
      variant: "warning",
      provenance: "calculated",
      impacts: {
        mobility: "Atenção",
        drainage: isModerateRain ? "Monitorar" : "Normal",
        visibility: isFog || isModerateRain ? "Parcial" : "Boa",
      },
    };
  }

  return {
    riskLevel: "Baixo",
    score: 100,
    summary: `${getWeatherDescription(weatherCode)} · Sem alertas climáticos`,
    variant: "default",
    provenance: "calculated",
    impacts: {
      mobility: "Normal",
      drainage: "Normal",
      visibility: "Boa",
    },
  };
}

function computeCategoryPenalty(
  events: UrbanEvent[],
  category: UrbanEvent["category"],
): number {
  return events
    .filter((event) => event.category === category)
    .reduce((sum, event) => sum + SEVERITY_PENALTIES[event.severity], 0);
}

/**
 * Calcula o Índice Urbano Composto (0 a 100) combinando 4 eixos ponderados:
 * - Clima (30%): dado real Open-Meteo
 * - Drenagem (30%): eventos de alagamento + precipitação real
 * - Mobilidade (25%): eventos de trânsito
 * - Ocorrências (15%): eventos urbanos gerais
 */
export function calculateUrbanIndex(
  events: UrbanEvent[],
  weather: CurrentWeather | null,
): UrbanIndexResult {
  const climateAssessment = evaluateClimateRisk(weather);
  const climateScore = climateAssessment.score;

  // Fator adicional de precipitação real sobre a drenagem urbana
  const rainPenalty = weather
    ? weather.precipitation >= 5
      ? 30
      : weather.precipitation > 0
        ? 12
        : 0
    : 0;

  const drainageScore = clampScore(
    100 - computeCategoryPenalty(events, "flood") - rainPenalty,
  );
  const mobilityScore = clampScore(
    100 - computeCategoryPenalty(events, "traffic"),
  );
  const incidentsScore = clampScore(
    100 - computeCategoryPenalty(events, "incident"),
  );

  const subIndices: UrbanSubIndex[] = [
    {
      key: "climate",
      label: "Clima",
      weight: INDICATOR_WEIGHTS.climate,
      score: climateScore,
      color: "#587C69",
      provenance: weather ? "real" : "calculated",
    },
    {
      key: "drainage",
      label: "Drenagem",
      weight: INDICATOR_WEIGHTS.drainage,
      score: drainageScore,
      color: "#287CB5",
      provenance: "calculated",
    },
    {
      key: "mobility",
      label: "Mobilidade",
      weight: INDICATOR_WEIGHTS.mobility,
      score: mobilityScore,
      color: "#D97732",
      provenance: "demonstrative",
    },
    {
      key: "incidents",
      label: "Ocorrências",
      weight: INDICATOR_WEIGHTS.incidents,
      score: incidentsScore,
      color: "#B94D4D",
      provenance: "demonstrative",
    },
  ];

  const weightedSum = subIndices.reduce(
    (total, item) => total + item.score * item.weight,
    0,
  );

  const score = clampScore(weightedSum);

  const status: UrbanIndexResult["status"] =
    score >= 80
      ? { label: "Estável", variant: "good" }
      : score >= 50
        ? { label: "Atenção", variant: "warning" }
        : { label: "Crítico", variant: "danger" };

  return {
    score,
    status,
    subIndices,
    realSharePercent: weather ? 30 : 0,
    demonstrativeSharePercent: weather ? 70 : 100,
    weatherConnected: Boolean(weather),
  };
}
