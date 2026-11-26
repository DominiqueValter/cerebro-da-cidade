import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bus,
  CarFront,
  Check,
  CloudRain,
  Download,
  Droplets,
  MapPin,
  RotateCcw,
  Search,
  Sparkles,
  Thermometer,
  Waves,
  Wind,
  X,
} from "lucide-react";

import { urbanEvents } from "../overview/data/urbanEvents";
import type { UrbanEvent } from "../overview/data/urbanEvents";
import {
  CURITIBA_NEIGHBORHOODS,
  CURITIBA_REGIONALS,
  CURITIBA_WATERSHEDS,
} from "./data/curitibaNeighborhoods";
import type {
  CuritibaWatershed,
  HistoricalFloodTier,
} from "./data/curitibaNeighborhoods";
import { KoppenMap } from "../../components/dashboard/KoppenMap";
import {
  getCurrentAirQuality,
  getCurrentWeather,
  getPrecipitationContext,
  getRegionalWeatherSnapshot,
} from "../../services/weather/weatherService";
import type {
  AirQualityData,
  CurrentWeather,
  PrecipitationContext,
  RegionalWeatherSnapshot,
} from "../../services/weather/weatherService";
import { getNearbyTransitImpact } from "../../services/mobility/transitService";
import type { NearbyTransitImpact } from "../../services/mobility/transitService";
import { evaluateClimateRisk } from "../../services/indicators/urbanIndicators";
import { generatePredictiveOccurrences } from "../../services/prediction/predictiveOccurrences";

interface RiskAnalysisProps {
  onOpenInMap: (event: UrbanEvent) => void;
}

type RiskScenarioId =
  | "realtime"
  | "evening-storm"
  | "saturated-soil"
  | "center-blockade";

type ClimateTab = "climogram" | "koppen";

interface RegionalRiskRow {
  neighborhood: string;
  regional: string;
  watershed: CuritibaWatershed;
  historicalFloodTier: HistoricalFloodTier;
  latitude: number;
  longitude: number;
  drainageScore: number;
  trafficScore: number;
  incidentScore: number;
  compositeScore: number;
  level: "high" | "medium" | "low";
  primaryFactor: string;
  activeCount: number;
  predictiveCount: number;
  representativeEvent: UrbanEvent;
}

const SCENARIO_OPTIONS: Array<{
  id: RiskScenarioId;
  label: string;
  description: string;
}> = [
  {
    id: "realtime",
    label: "Tempo real (Open-Meteo)",
    description: "Leitura ao vivo da meteorologia e ocorrências monitoradas",
  },
  {
    id: "evening-storm",
    label: "Tempestade no pico (17h)",
    description: "Chuva forte de 6,2 mm coincidindo com a saída comercial",
  },
  {
    id: "saturated-soil",
    label: "Chuva contínua + Solo saturado",
    description: "46 mm acumulados em 5 dias reduzindo absorção pluvial",
  },
  {
    id: "center-blockade",
    label: "Bloqueio viário no Centro",
    description: "Interferência severa em corredores troncais e semáforos",
  },
];

// Normais climatológicas de Curitiba (INMET / SIMEPAR) — Climograma
const CURITIBA_CLIMOGRAM = [
  { month: "Jan", rainMm: 218, tempC: 20.9 },
  { month: "Fev", rainMm: 166, tempC: 21.0 },
  { month: "Mar", rainMm: 147, tempC: 19.9 },
  { month: "Abr", rainMm: 96, tempC: 17.7 },
  { month: "Mai", rainMm: 113, tempC: 14.6 },
  { month: "Jun", rainMm: 112, tempC: 13.4 },
  { month: "Jul", rainMm: 106, tempC: 13.2 },
  { month: "Ago", rainMm: 82, tempC: 14.6 },
  { month: "Set", rainMm: 135, tempC: 15.8 },
  { month: "Out", rainMm: 151, tempC: 17.4 },
  { month: "Nov", rainMm: 131, tempC: 18.8 },
  { month: "Dez", rainMm: 165, tempC: 20.2 },
];

// Pesos empíricos baseados no estudo ENAU/ABRHidro (204 ocorrências 2020–2024)
const HISTORICAL_TIER_BONUS: Record<HistoricalFloodTier, number> = {
  critical: 16,
  high: 11,
  moderate: 6,
  low: 0,
};

const HISTORICAL_TIER_LABELS: Record<HistoricalFloodTier, string> = {
  critical: "Reincidência Crítica (15–19 reg.)",
  high: "Reincidência Alta (10–15 reg.)",
  moderate: "Reincidência Moderada (5–10 reg.)",
  low: "Histórico Baixo (0–5 reg.)",
};

const riskLabels: Record<"high" | "medium" | "low", string> = {
  high: "Risco Alto",
  medium: "Risco Médio",
  low: "Risco Baixo",
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getLevelFromScore(score: number): "high" | "medium" | "low" {
  if (score >= 68) return "high";
  if (score >= 42) return "medium";
  return "low";
}

function parseHour(hourLabel: string): number {
  const parsed = Number.parseInt(hourLabel.split(":")[0] ?? "", 10);
  return Number.isNaN(parsed) ? 12 : parsed;
}

function isPeakHour(hour: number): boolean {
  return (
    (hour >= 7 && hour <= 9) ||
    (hour >= 11 && hour <= 13) ||
    (hour >= 16 && hour <= 19)
  );
}

function formatShortDate(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

export function RiskAnalysis({ onOpenInMap }: RiskAnalysisProps) {
  const explorerRef = useRef<HTMLElement | null>(null);

  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [precipContext, setPrecipContext] =
    useState<PrecipitationContext | null>(null);
  const [airQuality, setAirQuality] = useState<AirQualityData | null>(null);

  const [scenario, setScenario] = useState<RiskScenarioId>("realtime");
  const [climateTab, setClimateTab] = useState<ClimateTab>("climogram");
  const [levelFilter, setLevelFilter] = useState<
    "all" | "high" | "medium" | "low"
  >("all");
  const [regionalFilter, setRegionalFilter] = useState<string>("all");
  const [watershedFilter, setWatershedFilter] = useState<string>("all");
  const [tableSearch, setTableSearch] = useState<string>("");
  const [exportedFeedback, setExportedFeedback] = useState(false);

  // Bairro selecionado pelo usuário entre os 75 oficiais
  const [selectedRegionName, setSelectedRegionName] =
    useState<string>("Portão");
  const [regionalWeather, setRegionalWeather] =
    useState<RegionalWeatherSnapshot | null>(null);
  const [regionalLoading, setRegionalLoading] = useState(false);

  // Impacto GTFS nos top 3 bairros mais críticos
  const [transitImpacts, setTransitImpacts] = useState<
    Record<string, NearbyTransitImpact>
  >({});
  const [transitLoading, setTransitLoading] = useState(false);

  const currentMonthIndex = new Date().getMonth();
  const isConvectiveSeason = [0, 2, 10, 11].includes(currentMonthIndex);

  useEffect(() => {
    let cancelled = false;

    getCurrentWeather()
      .then((data) => {
        if (!cancelled) setWeather(data);
      })
      .catch((err) => console.error("Erro clima análise de risco:", err));

    getPrecipitationContext()
      .then((data) => {
        if (!cancelled) setPrecipContext(data);
      })
      .catch((err) => console.error("Erro chuva análise de risco:", err));

    getCurrentAirQuality()
      .then((data) => {
        if (!cancelled) setAirQuality(data);
      })
      .catch((err) => console.error("Erro QA análise de risco:", err));

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRegion = useMemo(
    () =>
      CURITIBA_NEIGHBORHOODS.find((r) => r.name === selectedRegionName) ??
      CURITIBA_NEIGHBORHOODS[0],
    [selectedRegionName],
  );

  useEffect(() => {
    let cancelled = false;
    setRegionalLoading(true);

    getRegionalWeatherSnapshot(
      selectedRegion.latitude,
      selectedRegion.longitude,
    )
      .then((data) => {
        if (!cancelled) setRegionalWeather(data);
      })
      .catch((err) => {
        console.error("Erro ao consultar clima da região:", err);
        if (!cancelled) setRegionalWeather(null);
      })
      .finally(() => {
        if (!cancelled) setRegionalLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRegion.latitude, selectedRegion.longitude]);

  const simulateEveningStorm =
    scenario === "evening-storm" || scenario === "saturated-soil";

  const predictiveEvents = useMemo(
    () => generatePredictiveOccurrences(precipContext, simulateEveningStorm),
    [precipContext, simulateEveningStorm],
  );

  const combinedEvents = useMemo(() => {
    if (scenario === "center-blockade") {
      const syntheticBlockade: UrbanEvent = {
        id: 9501,
        title: "Interdição crítica na Av. Marechal Deodoro e Praça Rui Barbosa",
        neighborhood: "Centro",
        conditionLabel: "Bloqueio Severo + Desvio Troncal",
        time: "Cenário",
        description:
          "Simulação de bloqueio em eixo central com impacto imediato na circulação das linhas troncais e acesso viário.",
        category: "incident",
        severity: "high",
        latitude: -25.4302,
        longitude: -49.2718,
        isPredictive: true,
      };
      return [syntheticBlockade, ...predictiveEvents, ...urbanEvents];
    }
    return [...predictiveEvents, ...urbanEvents];
  }, [predictiveEvents, scenario]);

  const climateAssessment = useMemo(
    () => (weather ? evaluateClimateRisk(weather) : null),
    [weather],
  );

  const soilSaturation = useMemo(() => {
    const baseHistory = precipContext?.history ?? [];
    const history =
      scenario === "saturated-soil" && baseHistory.length > 0
        ? baseHistory.map((d, idx) => ({
            ...d,
            precipitationSum: Number(
              (
                d.precipitationSum + [6.5, 11.2, 8.4, 12.1, 7.8][idx % 5]
              ).toFixed(1),
            ),
          }))
        : baseHistory;

    const totalMm = Number(
      history.reduce((sum, d) => sum + d.precipitationSum, 0).toFixed(1),
    );

    const status =
      totalMm >= 35
        ? {
            label: "Solo saturado",
            variant: "high" as const,
            detail:
              "Capacidade de absorção reduzida; chuvas moderadas geram escoamento superficial rápido.",
          }
        : totalMm >= 15
          ? {
              label: "Umidade moderada",
              variant: "medium" as const,
              detail:
                "Galerias pluviais operando parcialmente carregadas; atenção em fundos de vale.",
            }
          : {
              label: "Solo drenante",
              variant: "low" as const,
              detail:
                "Boa capacidade de infiltração e absorção pluvial nas bacias urbanas.",
            };

    const maxDayMm = Math.max(1, ...history.map((d) => d.precipitationSum));

    return { history, totalMm, status, maxDayMm };
  }, [precipContext, scenario]);

  const vectors = useMemo(() => {
    const rain5d = soilSaturation.totalMm;
    const peakNextRain =
      scenario === "evening-storm"
        ? 6.2
        : scenario === "saturated-soil"
          ? 4.1
          : Math.max(
              0,
              ...(precipContext?.next6Hours.map((h) => h.precipitationMm) ?? [
                0,
              ]),
            );

    const weatherBoost =
      climateAssessment?.variant === "danger"
        ? 32
        : climateAssessment?.variant === "warning"
          ? 18
          : 6;

    const seasonalBoost = isConvectiveSeason ? 6 : 0;

    const drainageRisk = clampScore(
      22 +
        rain5d * 0.85 +
        peakNextRain * 6.5 +
        weatherBoost * 0.6 +
        seasonalBoost,
    );

    const trafficEvents = combinedEvents.filter(
      (e) => e.category === "traffic" || e.isPredictive,
    );
    const highTrafficCount = trafficEvents.filter(
      (e) => e.severity === "high",
    ).length;

    const mobilityRisk = clampScore(
      28 +
        trafficEvents.length * 5.5 +
        highTrafficCount * 9 +
        (scenario === "evening-storm"
          ? 20
          : scenario === "center-blockade"
            ? 26
            : peakNextRain * 3),
    );

    const incidentEvents = combinedEvents.filter(
      (e) => e.category === "incident",
    );
    const operationalRisk = clampScore(
      20 +
        incidentEvents.length * 11 +
        incidentEvents.filter((e) => e.severity === "high").length * 14 +
        (scenario === "center-blockade" ? 22 : 0),
    );

    const aqiValue = airQuality?.europeanAqi ?? 22;
    const environmentalRisk = clampScore(
      aqiValue * 1.15 + (rain5d < 2 ? 8 : 0),
    );

    const globalScore = clampScore(
      drainageRisk * 0.35 +
        mobilityRisk * 0.35 +
        operationalRisk * 0.18 +
        environmentalRisk * 0.12,
    );

    return {
      globalScore,
      globalLevel: getLevelFromScore(globalScore),
      drainageRisk,
      mobilityRisk,
      operationalRisk,
      environmentalRisk,
      peakNextRain,
    };
  }, [
    soilSaturation.totalMm,
    scenario,
    precipContext,
    climateAssessment,
    isConvectiveSeason,
    combinedEvents,
    airQuality,
  ]);

  const regionalMatrix = useMemo<RegionalRiskRow[]>(() => {
    const rainBoost =
      scenario === "evening-storm"
        ? 24
        : scenario === "saturated-soil"
          ? 20
          : vectors.peakNextRain * 4.5;

    const soilBoost = soilSaturation.totalMm >= 35 ? 12 : 0;

    return CURITIBA_NEIGHBORHOODS.map((region) => {
      const regionEvents = combinedEvents.filter(
        (e) =>
          e.neighborhood === region.name ||
          (region.name === "Cidade Industrial de Curitiba" &&
            e.neighborhood.startsWith("CIC")),
      );

      const floodEvents = regionEvents.filter((e) => e.category === "flood");
      const trafficEvents = regionEvents.filter(
        (e) => e.category === "traffic",
      );
      const incidentEvents = regionEvents.filter(
        (e) => e.category === "incident",
      );

      const severityWeight = (list: UrbanEvent[]) =>
        list.reduce(
          (acc, ev) =>
            acc +
            (ev.severity === "high" ? 24 : ev.severity === "medium" ? 14 : 6),
          0,
        );

      const historicalBonus = HISTORICAL_TIER_BONUS[region.historicalFloodTier];

      const drainageScore = clampScore(
        region.baseDrainage +
          historicalBonus +
          severityWeight(floodEvents) +
          (region.baseDrainage >= 45
            ? rainBoost + soilBoost
            : rainBoost * 0.5 + soilBoost * 0.5),
      );

      const centerBlockadeBoost =
        scenario === "center-blockade" && region.regional === "Matriz" ? 22 : 0;

      const trafficScore = clampScore(
        region.baseTraffic +
          severityWeight(trafficEvents) +
          centerBlockadeBoost +
          (region.baseTraffic >= 45 ? rainBoost * 0.8 : rainBoost * 0.4),
      );

      const incidentScore = clampScore(
        18 + severityWeight(incidentEvents) + centerBlockadeBoost * 0.8,
      );

      const compositeScore = clampScore(
        drainageScore * 0.44 + trafficScore * 0.38 + incidentScore * 0.18,
      );

      const level = getLevelFromScore(compositeScore);
      const predictiveCount = regionEvents.filter((e) => e.isPredictive).length;

      const primaryFactor =
        drainageScore >= trafficScore && drainageScore >= incidentScore
          ? `${region.watershed} · Drenagem`
          : trafficScore >= incidentScore
            ? "Gargalo de fluxo viário"
            : "Ocorrência operacional em via";

      const fallbackEvent: UrbanEvent = regionEvents[0] ?? {
        ...urbanEvents[0],
        neighborhood: region.name,
        latitude: region.latitude,
        longitude: region.longitude,
        description: `${region.watershed} — ${region.soilNote}`,
      };

      return {
        neighborhood: region.name,
        regional: region.regional,
        watershed: region.watershed,
        historicalFloodTier: region.historicalFloodTier,
        latitude: region.latitude,
        longitude: region.longitude,
        drainageScore,
        trafficScore,
        incidentScore,
        compositeScore,
        level,
        primaryFactor,
        activeCount: regionEvents.length,
        predictiveCount,
        representativeEvent: fallbackEvent,
      };
    }).sort((a, b) => b.compositeScore - a.compositeScore);
  }, [combinedEvents, scenario, vectors.peakNextRain, soilSaturation.totalMm]);

  const watershedSummary = useMemo(() => {
    return CURITIBA_WATERSHEDS.map((ws) => {
      const rows = regionalMatrix.filter((r) => r.watershed === ws);
      const avgDrainage =
        rows.length > 0
          ? Math.round(
              rows.reduce((sum, r) => sum + r.drainageScore, 0) / rows.length,
            )
          : 0;
      const highCount = rows.filter((r) => r.level === "high").length;
      const topNeighborhood = rows[0]?.neighborhood ?? "-";
      return {
        watershed: ws,
        neighborhoodCount: rows.length,
        avgDrainage,
        highCount,
        topNeighborhood,
      };
    }).sort((a, b) => b.avgDrainage - a.avgDrainage);
  }, [regionalMatrix]);

  const top3RegionsKey = useMemo(
    () =>
      regionalMatrix
        .slice(0, 3)
        .map((r) => r.neighborhood)
        .join("|"),
    [regionalMatrix],
  );

  useEffect(() => {
    const top3 = regionalMatrix.slice(0, 3);
    if (top3.length === 0) return;

    let cancelled = false;
    setTransitLoading(true);

    Promise.all(
      top3.map(async (region) => {
        try {
          const impact = await getNearbyTransitImpact(
            region.latitude,
            region.longitude,
            500,
          );
          return [region.neighborhood, impact] as const;
        } catch {
          return null;
        }
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        const nextMap: Record<string, NearbyTransitImpact> = {};
        for (const entry of entries) {
          if (entry) {
            nextMap[entry[0]] = entry[1];
          }
        }
        setTransitImpacts(nextMap);
      })
      .finally(() => {
        if (!cancelled) setTransitLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [top3RegionsKey]);

  const transitSummary = useMemo(() => {
    const top3 = regionalMatrix.slice(0, 3);
    const routeMap = new Map<string, { shortName: string; longName: string }>();
    let totalStops = 0;

    for (const region of top3) {
      const impact = transitImpacts[region.neighborhood];
      if (!impact) continue;
      totalStops += impact.nearbyStopsCount;
      for (const route of impact.affectedRoutes) {
        if (!routeMap.has(route.id)) {
          routeMap.set(route.id, {
            shortName: route.shortName,
            longName: route.longName,
          });
        }
      }
    }

    return {
      totalStops,
      uniqueRoutesCount: routeMap.size,
      sampleRoutes: Array.from(routeMap.values()).slice(0, 12),
      regionsAnalyzed: top3.map((r) => r.neighborhood),
    };
  }, [regionalMatrix, transitImpacts]);

  const filteredMatrix = useMemo(() => {
    const term = tableSearch.trim().toLowerCase();
    return regionalMatrix.filter((row) => {
      if (levelFilter !== "all" && row.level !== levelFilter) return false;
      if (regionalFilter !== "all" && row.regional !== regionalFilter) {
        return false;
      }
      if (watershedFilter !== "all" && row.watershed !== watershedFilter) {
        return false;
      }
      if (term) {
        const hay =
          `${row.neighborhood} ${row.regional} ${row.watershed}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [
    regionalMatrix,
    levelFilter,
    regionalFilter,
    watershedFilter,
    tableSearch,
  ]);

  const hourlyProjection = useMemo(() => {
    const slots =
      scenario === "evening-storm"
        ? [
            {
              hourLabel: "14:00",
              precipitationMm: 0.2,
              probabilityPercent: 25,
            },
            {
              hourLabel: "15:00",
              precipitationMm: 1.1,
              probabilityPercent: 55,
            },
            {
              hourLabel: "16:00",
              precipitationMm: 3.4,
              probabilityPercent: 85,
            },
            {
              hourLabel: "17:00",
              precipitationMm: 6.2,
              probabilityPercent: 92,
            },
            {
              hourLabel: "18:00",
              precipitationMm: 2.8,
              probabilityPercent: 78,
            },
            {
              hourLabel: "19:00",
              precipitationMm: 0.6,
              probabilityPercent: 40,
            },
          ]
        : scenario === "saturated-soil"
          ? [
              {
                hourLabel: "14:00",
                precipitationMm: 1.8,
                probabilityPercent: 75,
              },
              {
                hourLabel: "15:00",
                precipitationMm: 2.4,
                probabilityPercent: 80,
              },
              {
                hourLabel: "16:00",
                precipitationMm: 3.1,
                probabilityPercent: 85,
              },
              {
                hourLabel: "17:00",
                precipitationMm: 4.1,
                probabilityPercent: 90,
              },
              {
                hourLabel: "18:00",
                precipitationMm: 2.2,
                probabilityPercent: 75,
              },
              {
                hourLabel: "19:00",
                precipitationMm: 1.4,
                probabilityPercent: 65,
              },
            ]
          : (precipContext?.next6Hours ?? []);

    return slots.map((slot) => {
      const hour = parseHour(slot.hourLabel);
      const peak = isPeakHour(hour);
      const prob = slot.probabilityPercent ?? 0;
      const blockadeBonus = scenario === "center-blockade" && peak ? 18 : 0;

      const riskScore = clampScore(
        22 +
          slot.precipitationMm * 8.5 +
          prob * 0.22 +
          (peak ? 22 : 0) +
          (peak && slot.precipitationMm >= 1 ? 14 : 0) +
          blockadeBonus,
      );

      return {
        hourLabel: slot.hourLabel,
        precipitationMm: slot.precipitationMm,
        probabilityPercent: prob,
        isPeak: peak,
        riskScore,
        level: getLevelFromScore(riskScore),
      };
    });
  }, [precipContext, scenario]);

  const recommendations = useMemo(() => {
    const items: Array<{
      id: string;
      priority: "high" | "medium" | "low";
      title: string;
      detail: string;
      area: string;
    }> = [];

    const topHighRegions = regionalMatrix.filter((r) => r.level === "high");

    if (topHighRegions.length > 0) {
      items.push({
        id: "rec-drainage",
        priority: "high",
        title: `Prontidão nas bacias do Barigui e Belém (${topHighRegions
          .slice(0, 3)
          .map((r) => r.neighborhood)
          .join(", ")})`,
        detail:
          "Posicionar equipes de drenagem em fundos de vale e pontos históricos (ENAU/ABRHidro) antes das pancadas convectivas.",
        area: "Bacias & Drenagem",
      });
    }

    if (vectors.mobilityRisk >= 52) {
      items.push({
        id: "rec-mobility",
        priority: vectors.mobilityRisk >= 68 ? "high" : "medium",
        title: "Sincronização semafórica em corredores de pico",
        detail:
          "Ajustar tempos de verde nas avenidas República Argentina, Marechal Floriano e Sete de Setembro para absorver lentidão causada por pista molhada.",
        area: "Mobilidade Urbana",
      });
    }

    items.push({
      id: "rec-gtfs",
      priority: transitSummary.uniqueRoutesCount >= 15 ? "medium" : "low",
      title: `Contingência para ${transitSummary.uniqueRoutesCount} linhas GTFS em zona crítica`,
      detail:
        "Monitorar regularidade das linhas que cruzam o raio de 500m dos pontos críticos e acionar desvios operacionais caso haja lâmina d'água.",
      area: "Transporte Coletivo",
    });

    return items;
  }, [regionalMatrix, vectors.mobilityRisk, transitSummary.uniqueRoutesCount]);

  function handleExportBulletin() {
    const activeScenario =
      SCENARIO_OPTIONS.find((s) => s.id === scenario)?.label ?? scenario;
    const nowStr = new Date().toLocaleString("pt-BR");
    const top3Lines = regionalMatrix
      .slice(0, 3)
      .map(
        (r, idx) =>
          `${idx + 1}. ${r.neighborhood} (${r.regional} · ${r.watershed}) — Score ${r.compositeScore}% (${riskLabels[r.level]})`,
      )
      .join("\n");

    const routesList =
      transitSummary.sampleRoutes.length > 0
        ? transitSummary.sampleRoutes
            .map((r) => `${r.shortName} (${r.longName})`)
            .join(", ")
        : "Consultando feed GTFS";

    const recsList = recommendations
      .map(
        (rec) => `- [${riskLabels[rec.priority]}] ${rec.title}: ${rec.detail}`,
      )
      .join("\n");

    const markdown = [
      `# BOLETIM OPERACIONAL DE RISCO URBANO — CURITIBA (75 BAIRROS / 6 BACIAS)`,
      `Emitido em: ${nowStr}`,
      `Cenário avaliado: ${activeScenario}`,
      `Classificação Climática: Köppen Cfb (Subtropical Úmido Mesotérmico)`,
      ``,
      `## 1. INDICADORES CONSOLIDADOS`,
      `- Índice Geral de Risco: ${vectors.globalScore}/100 (${riskLabels[vectors.globalLevel]})`,
      `- Risco Hídrico / Drenagem: ${vectors.drainageRisk}% (${soilSaturation.status.label} — ${soilSaturation.totalMm} mm em 5 dias)`,
      `- Risco de Mobilidade: ${vectors.mobilityRisk}%`,
      `- Risco Ambiental (Ar): ${vectors.environmentalRisk}%`,
      ``,
      `## 2. REGIÕES PRIORITÁRIAS (TOP 3)`,
      top3Lines,
      ``,
      `## 3. IMPACTO NO TRANSPORTE COLETIVO (GTFS · RAIO 500M)`,
      `- Paradas em zona crítica: ${transitSummary.totalStops}`,
      `- Linhas distintas impactadas: ${transitSummary.uniqueRoutesCount}`,
      `- Principais linhas: ${routesList}`,
      ``,
      `## 4. PLANO DE AÇÃO RECOMENDADO`,
      recsList,
    ].join("\n");

    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `boletim-risco-curitiba-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportedFeedback(true);
    window.setTimeout(() => setExportedFeedback(false), 2600);
  }

  function handleInspectNeighborhoodRow(neighborhood: string) {
    setSelectedRegionName(neighborhood);
    explorerRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }

  const selectedRegionMatrixRow = useMemo(
    () =>
      regionalMatrix.find((r) => r.neighborhood === selectedRegion.name) ??
      regionalMatrix[0],
    [regionalMatrix, selectedRegion.name],
  );

  const regionalSoilPercent = useMemo(() => {
    const base = regionalWeather?.soilMoistureIndex ?? 52;
    if (scenario === "saturated-soil") return Math.min(98, base + 26);
    if (scenario === "evening-storm") return Math.min(95, base + 14);
    return base;
  }, [regionalWeather, scenario]);

  const hasMatrixFilters =
    levelFilter !== "all" ||
    regionalFilter !== "all" ||
    watershedFilter !== "all" ||
    tableSearch.trim() !== "";

  return (
    <div className="risk-analysis-page">
      <section className="page-heading">
        <div>
          <span className="page-eyebrow">
            DIAGNÓSTICO HIDROLÓGICO · 75 BAIRROS · 6 BACIAS HIDROGRÁFICAS
          </span>
          <h1>Análise de riscos</h1>
          <p>
            Avaliação cruzada de bacias hidrográficas, histórico de alagamentos
            (2020–2024), saturação do solo e climatologia nos 75 bairros.
          </p>
        </div>

        <div className="occurrences-heading-actions">
          <button
            type="button"
            className="occurrences-primary-btn"
            onClick={handleExportBulletin}
          >
            {exportedFeedback ? <Check size={15} /> : <Download size={15} />}
            <span>
              {exportedFeedback ? "Boletim exportado!" : "Exportar boletim"}
            </span>
          </button>
        </div>
      </section>

      {/* SIMULADOR DE CENÁRIOS ("E SE...") */}
      <section className="panel risk-scenarios-bar">
        <div className="risk-scenarios-header">
          <span className="page-eyebrow">
            SIMULADOR DE CENÁRIOS OPERACIONAIS
          </span>
          <small>
            {SCENARIO_OPTIONS.find((item) => item.id === scenario)?.description}
          </small>
        </div>

        <div className="risk-scenarios-pills">
          {SCENARIO_OPTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`risk-scenario-pill ${
                scenario === item.id ? "active" : ""
              }`}
              onClick={() => setScenario(item.id)}
            >
              <CloudRain size={13} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* VETORES DE RISCO */}
      <section className="risk-vectors-grid">
        <article className="panel risk-master-card">
          <div className="occurrence-kpi-top">
            <span>Índice geral de risco</span>
            <span className={`risk-pill-badge ${vectors.globalLevel}`}>
              {riskLabels[vectors.globalLevel]}
            </span>
          </div>

          <div className="risk-master-score">
            <strong>{vectors.globalScore}</strong>
            <span>/100</span>
          </div>

          <div className="urban-index-bar">
            <span
              style={{
                width: `${vectors.globalScore}%`,
                backgroundColor:
                  vectors.globalLevel === "high"
                    ? "#E12D53"
                    : vectors.globalLevel === "medium"
                      ? "#E3962D"
                      : "#4E7861",
              }}
            />
          </div>

          <small>
            {isConvectiveSeason
              ? "Período convectivo (Nov–Mar): pico histórico de alagamentos"
              : "Calibrado com base empírica ENAU/ABRHidro (2020–2024)"}
          </small>
        </article>

        <article className="panel occurrence-kpi-card">
          <div className="occurrence-kpi-top">
            <span>Risco hídrico / bacias</span>
            <div className="metric-icon metric-icon-default">
              <Waves size={16} />
            </div>
          </div>
          <strong>{vectors.drainageRisk}%</strong>
          <small>
            {soilSaturation.status.label} · {soilSaturation.totalMm} mm (5d)
          </small>
        </article>

        <article className="panel occurrence-kpi-card">
          <div className="occurrence-kpi-top">
            <span>Risco de mobilidade</span>
            <div className="metric-icon metric-icon-warning">
              <CarFront size={16} />
            </div>
          </div>
          <strong>{vectors.mobilityRisk}%</strong>
          <small>
            {transitSummary.uniqueRoutesCount} linhas GTFS em áreas críticas
          </small>
        </article>

        <article className="panel occurrence-kpi-card">
          <div className="occurrence-kpi-top">
            <span>Risco ambiental (Ar)</span>
            <div className="metric-icon metric-icon-default">
              <Wind size={16} />
            </div>
          </div>
          <strong>{vectors.environmentalRisk}%</strong>
          <small>
            {airQuality
              ? `EAQI ${airQuality.europeanAqi} · ${airQuality.categoryLabel}`
              : "Consultando Open-Meteo..."}
          </small>
        </article>
      </section>

      {/* CONSULTA DETALHADA POR BAIRRO (TODOS OS 75 BAIRROS) */}
      <section ref={explorerRef} className="panel regional-explorer-panel">
        <div className="panel-header">
          <div>
            <span className="panel-eyebrow">
              REGIONAL {selectedRegion.regional.toUpperCase()} ·{" "}
              {selectedRegion.watershed.toUpperCase()}
            </span>
            <h2>Previsão de chuva e precipitação no solo por bairro</h2>
          </div>

          <div className="regional-selector-controls">
            <label className="regional-select-box">
              <MapPin size={14} />
              <select
                value={selectedRegionName}
                onChange={(e) => setSelectedRegionName(e.target.value)}
                aria-label="Selecionar bairro de Curitiba"
              >
                {CURITIBA_REGIONALS.map((regionalName) => (
                  <optgroup key={regionalName} label={regionalName}>
                    {CURITIBA_NEIGHBORHOODS.filter(
                      (n) => n.regional === regionalName,
                    ).map((neighborhood) => (
                      <option key={neighborhood.name} value={neighborhood.name}>
                        {neighborhood.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            {selectedRegionMatrixRow && (
              <button
                type="button"
                className="occurrence-action-btn"
                onClick={() =>
                  onOpenInMap(selectedRegionMatrixRow.representativeEvent)
                }
              >
                <MapPin size={13} />
                <span>Ver {selectedRegion.name} no mapa</span>
              </button>
            )}
          </div>
        </div>

        <div className="regional-explorer-grid">
          <div className="regional-metrics-cards">
            <div className="regional-mini-card">
              <span>Chuva prevista (próximas 6h)</span>
              <strong>
                {regionalLoading
                  ? "..."
                  : scenario === "evening-storm"
                    ? "14.3 mm"
                    : scenario === "saturated-soil"
                      ? "15.0 mm"
                      : `${regionalWeather?.next6HoursTotalMm ?? 0} mm`}
              </strong>
              <small>
                Probabilidade máx.:{" "}
                {scenario === "evening-storm"
                  ? "92%"
                  : `${regionalWeather?.maxNext6HoursProb ?? 0}%`}
              </small>
            </div>

            <div className="regional-mini-card">
              <span>Acumulado de precipitação (5 dias)</span>
              <strong>
                {regionalLoading
                  ? "..."
                  : `${
                      scenario === "saturated-soil"
                        ? (
                            (regionalWeather?.last5DaysTotalMm ?? 0) + 38
                          ).toFixed(1)
                        : (regionalWeather?.last5DaysTotalMm ?? 0)
                    } mm`}
              </strong>
              <small>
                {HISTORICAL_TIER_LABELS[selectedRegion.historicalFloodTier]}
              </small>
            </div>

            <div className="regional-mini-card">
              <span>Nível de saturação do solo (0–7cm)</span>
              <strong>{regionalSoilPercent}%</strong>
              <div className="urban-index-bar">
                <span
                  style={{
                    width: `${regionalSoilPercent}%`,
                    backgroundColor:
                      regionalSoilPercent >= 75
                        ? "#E12D53"
                        : regionalSoilPercent >= 50
                          ? "#E3962D"
                          : "#287CB5",
                  }}
                />
              </div>
            </div>

            <div className="regional-mini-card">
              <span>Bacia hidrográfica e drenagem local</span>
              <strong>
                {selectedRegion.watershed.replace("Bacia do ", "")}
              </strong>
              <small>{selectedRegion.soilNote}</small>
            </div>
          </div>

          <div className="regional-hourly-box">
            <div className="regional-hourly-header">
              <strong>Janela horária de chuva em {selectedRegion.name}</strong>
              <span className="smart-real-badge">
                {regionalLoading
                  ? "Consultando..."
                  : `${regionalWeather?.temperatureC ?? 19}°C · Vento ${regionalWeather?.windSpeedKmh ?? 12} km/h`}
              </span>
            </div>

            <div className="regional-hourly-slots">
              {(scenario === "evening-storm"
                ? [
                    {
                      hourLabel: "14:00",
                      precipitationMm: 0.2,
                      probabilityPercent: 25,
                    },
                    {
                      hourLabel: "15:00",
                      precipitationMm: 1.1,
                      probabilityPercent: 55,
                    },
                    {
                      hourLabel: "16:00",
                      precipitationMm: 3.4,
                      probabilityPercent: 85,
                    },
                    {
                      hourLabel: "17:00",
                      precipitationMm: 6.2,
                      probabilityPercent: 92,
                    },
                    {
                      hourLabel: "18:00",
                      precipitationMm: 2.8,
                      probabilityPercent: 78,
                    },
                    {
                      hourLabel: "19:00",
                      precipitationMm: 0.6,
                      probabilityPercent: 40,
                    },
                  ]
                : (regionalWeather?.hourlySlots ?? [])
              ).map((slot) => (
                <div key={slot.hourLabel} className="regional-slot-pill">
                  <span>{slot.hourLabel}</span>
                  <strong>{slot.precipitationMm.toFixed(1)} mm</strong>
                  <small>{slot.probabilityPercent}%</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* BACIAS HIDROGRÁFICAS + BASE EMPÍRICA DE ALAGAMENTOS (2020–2024) */}
      <section className="panel risk-watersheds-panel">
        <div className="panel-header">
          <div>
            <span className="panel-eyebrow">
              HIDROLOGIA URBANA · ESTUDO ENAU / ABRHIDRO (204 OCORRÊNCIAS
              2020–2024)
            </span>
            <h2>Vulnerabilidade por Bacia Hidrográfica de Curitiba</h2>
          </div>

          {watershedFilter !== "all" ? (
            <button
              type="button"
              className="smart-clear-filters-btn"
              onClick={() => setWatershedFilter("all")}
            >
              <RotateCcw size={12} />
              <span>Mostrar todas as 6 bacias</span>
            </button>
          ) : (
            <span className="smart-real-badge">Clique para filtrar tabela</span>
          )}
        </div>

        <div className="watersheds-grid">
          {watershedSummary.map((ws) => {
            const isFiltered = watershedFilter === ws.watershed;
            return (
              <button
                key={ws.watershed}
                type="button"
                className={`watershed-card ${isFiltered ? "active" : ""}`}
                onClick={() =>
                  setWatershedFilter(isFiltered ? "all" : ws.watershed)
                }
              >
                <div className="watershed-card-top">
                  <strong>{ws.watershed}</strong>
                  <span>{ws.avgDrainage}%</span>
                </div>

                <div className="urban-index-bar">
                  <span
                    style={{
                      width: `${ws.avgDrainage}%`,
                      backgroundColor:
                        ws.avgDrainage >= 60
                          ? "#E12D53"
                          : ws.avgDrainage >= 45
                            ? "#E3962D"
                            : "#287CB5",
                    }}
                  />
                </div>

                <small>
                  {ws.neighborhoodCount} bairros · Ponto crítico:{" "}
                  <strong>{ws.topNeighborhood}</strong>
                </small>
              </button>
            );
          })}
        </div>
      </section>

      {/* PROJEÇÃO HORÁRIA + PLANO PREVENTIVO */}
      <section className="risk-middle-grid">
        <article className="panel risk-timeline-panel">
          <div className="panel-header">
            <div>
              <span className="panel-eyebrow">JANELA DE ANTECIPAÇÃO (6H)</span>
              <h2>Evolução horária do risco urbano</h2>
            </div>
            <span className="smart-real-badge">
              {scenario === "realtime" ? "Open-Meteo" : "Simulado"}
            </span>
          </div>

          {hourlyProjection.length === 0 ? (
            <div className="smart-routes-empty">
              Carregando curva horária de risco...
            </div>
          ) : (
            <div className="risk-hourly-grid">
              {hourlyProjection.map((slot) => (
                <div
                  key={slot.hourLabel}
                  className={`risk-hour-card ${slot.level}`}
                >
                  <div className="risk-hour-top">
                    <strong>{slot.hourLabel}</strong>
                    {slot.isPeak && <span className="risk-peak-tag">Pico</span>}
                  </div>

                  <div className="risk-hour-meter">
                    <span
                      style={{
                        height: `${slot.riskScore}%`,
                      }}
                    />
                  </div>

                  <div className="risk-hour-score">{slot.riskScore}%</div>
                  <small>
                    {slot.precipitationMm.toFixed(1)} mm ·{" "}
                    {slot.probabilityPercent}%
                  </small>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel risk-actions-panel">
          <div className="panel-header">
            <div>
              <span className="panel-eyebrow">RESPOSTA ANTECIPADA</span>
              <h2>Recomendações operacionais</h2>
            </div>
            <Sparkles size={16} color="#244B40" />
          </div>

          <div className="risk-recommendations-list">
            {recommendations.map((rec) => (
              <div key={rec.id} className={`risk-rec-item ${rec.priority}`}>
                <div className="risk-rec-top">
                  <span className="occurrence-row-category-tag">
                    {rec.area}
                  </span>
                  <span className={`risk-pill-badge ${rec.priority}`}>
                    {riskLabels[rec.priority]}
                  </span>
                </div>
                <strong>{rec.title}</strong>
                <p>{rec.detail}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      {/* SATURAÇÃO DO SOLO + IMPACTO GTFS + CLIMATOLOGIA EM ABAS */}
      <section className="risk-insights-grid">
        <article className="panel risk-soil-panel">
          <div className="panel-header">
            <div>
              <span className="panel-eyebrow">
                CORRELAÇÃO PLUVIOMÉTRICA (5 DIAS)
              </span>
              <h2>Saturação hídrica do solo</h2>
            </div>
            <span
              className={`risk-pill-badge ${soilSaturation.status.variant}`}
            >
              {soilSaturation.status.label}
            </span>
          </div>

          <p className="risk-soil-description">
            {soilSaturation.status.detail}
          </p>

          {soilSaturation.history.length > 0 ? (
            <div className="risk-soil-bars">
              {soilSaturation.history.map((day) => {
                const heightPct = Math.max(
                  10,
                  Math.round(
                    (day.precipitationSum / soilSaturation.maxDayMm) * 100,
                  ),
                );
                return (
                  <div className="risk-soil-col" key={day.date}>
                    <strong>{day.precipitationSum.toFixed(1)} mm</strong>
                    <div className="risk-soil-track">
                      <span
                        style={{
                          height: `${day.precipitationSum > 0 ? heightPct : 8}%`,
                          opacity: day.precipitationSum > 0 ? 1 : 0.3,
                        }}
                      />
                    </div>
                    <span>{formatShortDate(day.date)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="smart-routes-empty">
              Carregando histórico de precipitação...
            </div>
          )}

          <div className="risk-soil-footer">
            <Droplets size={13} />
            <span>
              Acumulado total no período:{" "}
              <strong>{soilSaturation.totalMm} mm</strong>
            </span>
          </div>
        </article>

        <article className="panel risk-transit-panel">
          <div className="panel-header">
            <div>
              <span className="panel-eyebrow">
                CRUZAMENTO ESPACIAL GTFS · RAIO 500M
              </span>
              <h2>Impacto no transporte coletivo</h2>
            </div>
            <span className="smart-real-badge">GTFS Real</span>
          </div>

          <p className="risk-soil-description">
            Linhas e paradas localizadas em um raio de 500m das 3 regiões com
            maior índice de risco (
            <strong>{transitSummary.regionsAnalyzed.join(", ")}</strong>):
          </p>

          <div className="risk-transit-stats">
            <div>
              <span>Paradas em zona crítica</span>
              <strong>
                {transitLoading ? "..." : transitSummary.totalStops}
              </strong>
            </div>
            <div>
              <span>Linhas distintas afetadas</span>
              <strong>
                {transitLoading ? "..." : transitSummary.uniqueRoutesCount}
              </strong>
            </div>
          </div>

          <div className="risk-transit-chips">
            {transitLoading ? (
              <span className="smart-routes-empty">
                Cruzando paradas e itinerários no backend...
              </span>
            ) : transitSummary.sampleRoutes.length > 0 ? (
              transitSummary.sampleRoutes.map((route) => (
                <span
                  key={`${route.shortName}-${route.longName}`}
                  className="risk-transit-chip"
                  title={route.longName}
                >
                  <Bus size={11} />
                  <strong>{route.shortName}</strong>
                  <span>{route.longName}</span>
                </span>
              ))
            ) : (
              <span className="smart-routes-empty">
                Nenhuma linha localizada no raio analisado.
              </span>
            )}
          </div>
        </article>
      </section>

      {/* CLIMATOLOGIA DE CURITIBA (CLIMOGRAMA × MAPA DE KÖPPEN EM ABAS) */}
      <section className="panel risk-climogram-panel">
        <div className="panel-header">
          <div>
            <span className="panel-eyebrow">
              NORMAIS CLIMATOLÓGICAS · INMET / SIMEPAR & KÖPPEN-GEIGER
            </span>
            <h2>
              {climateTab === "climogram"
                ? "Gráfico climático mensal (Chuva × Temperatura)"
                : "Mapa climático de Köppen-Geiger (Paraná e RMC)"}
            </h2>
          </div>

          <div className="regional-selector-controls">
            <div
              className="smart-env-tabs"
              role="tablist"
              aria-label="Visualização climatológica"
            >
              <button
                type="button"
                role="tab"
                aria-selected={climateTab === "climogram"}
                className={`smart-env-tab ${
                  climateTab === "climogram" ? "active" : ""
                }`}
                onClick={() => setClimateTab("climogram")}
              >
                <Thermometer size={13} />
                <span>Climograma</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={climateTab === "koppen"}
                className={`smart-env-tab ${
                  climateTab === "koppen" ? "active" : ""
                }`}
                onClick={() => setClimateTab("koppen")}
              >
                <MapPin size={13} />
                <span>Mapa Köppen</span>
              </button>
            </div>

            <span className="koppen-code-badge">
              {climateTab === "climogram"
                ? `Mês atual: ${CURITIBA_CLIMOGRAM[currentMonthIndex]?.month}`
                : "Curitiba: Cfb"}
            </span>
          </div>
        </div>

        {climateTab === "climogram" ? (
          <>
            <div className="climogram-chart">
              {CURITIBA_CLIMOGRAM.map((item, idx) => {
                const rainPct = Math.round((item.rainMm / 230) * 100);
                const isCurrentMonth = idx === currentMonthIndex;
                return (
                  <div
                    key={item.month}
                    className={`climogram-col ${isCurrentMonth ? "current" : ""}`}
                  >
                    <span className="climogram-temp">
                      {item.tempC.toFixed(0)}°
                    </span>
                    <div className="climogram-bar-track">
                      <span
                        style={{ height: `${rainPct}%` }}
                        title={`${item.month}: ${item.rainMm} mm · ${item.tempC}°C`}
                      />
                    </div>
                    <strong>{item.rainMm}</strong>
                    <span>{item.month}</span>
                  </div>
                );
              })}
            </div>

            <div className="climogram-legend">
              <span>
                <i className="climogram-dot rain" /> Precipitação média mensal
                (mm) · Pico: Nov–Mar
              </span>
              <span>
                <Thermometer size={12} /> Temperatura média (°C) · Total anual:
                1.522 mm
              </span>
            </div>
          </>
        ) : (
          <KoppenMap />
        )}
      </section>

      {/* MATRIZ DE VULNERABILIDADE DOS 75 BAIRROS */}
      <section className="panel risk-matrix-panel">
        <div className="panel-header">
          <div>
            <span className="panel-eyebrow">
              RANKING TERRITORIAL · {filteredMatrix.length} DE 75 BAIRROS
              EXIBIDOS
            </span>
            <h2>Vulnerabilidade por bairro, bacia e regional</h2>
          </div>

          <div className="regional-selector-controls">
            <div className="risk-table-search">
              <Search size={13} />
              <input
                type="text"
                placeholder="Filtrar bairro..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
              />
              {tableSearch && (
                <button
                  type="button"
                  onClick={() => setTableSearch("")}
                  aria-label="Limpar busca"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <label className="regional-select-box">
              <select
                value={watershedFilter}
                onChange={(e) => setWatershedFilter(e.target.value)}
                aria-label="Filtrar por Bacia Hidrográfica"
              >
                <option value="all">Todas as 6 bacias</option>
                {CURITIBA_WATERSHEDS.map((ws) => (
                  <option key={ws} value={ws}>
                    {ws}
                  </option>
                ))}
              </select>
            </label>

            <label className="regional-select-box">
              <select
                value={regionalFilter}
                onChange={(e) => setRegionalFilter(e.target.value)}
                aria-label="Filtrar por Administração Regional"
              >
                <option value="all">Todas as 10 regionais</option>
                {CURITIBA_REGIONALS.map((reg) => (
                  <option key={reg} value={reg}>
                    Regional {reg}
                  </option>
                ))}
              </select>
            </label>

            <div
              className="filter-pill-group"
              role="group"
              aria-label="Filtrar nível"
            >
              {(
                [
                  { id: "all", label: "Todos" },
                  { id: "high", label: "Alto" },
                  { id: "medium", label: "Médio" },
                  { id: "low", label: "Baixo" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={levelFilter === item.id ? "active" : ""}
                  onClick={() => setLevelFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {hasMatrixFilters && (
              <button
                type="button"
                className="smart-clear-filters-btn"
                onClick={() => {
                  setLevelFilter("all");
                  setRegionalFilter("all");
                  setWatershedFilter("all");
                  setTableSearch("");
                }}
              >
                <RotateCcw size={12} />
                <span>Limpar</span>
              </button>
            )}
          </div>
        </div>

        <div className="risk-table-wrapper risk-table-scroll">
          <table className="risk-matrix-table">
            <thead>
              <tr>
                <th>Bairro</th>
                <th>Bacia Hidrográfica</th>
                <th>Histórico (2020–2024)</th>
                <th>Drenagem</th>
                <th>Trânsito</th>
                <th>Score geral</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredMatrix.map((row) => {
                const isInspected = selectedRegionName === row.neighborhood;
                return (
                  <tr
                    key={row.neighborhood}
                    className={isInspected ? "is-selected-row" : ""}
                  >
                    <td>
                      <button
                        type="button"
                        className="risk-region-cell risk-region-btn"
                        onClick={() =>
                          handleInspectNeighborhoodRow(row.neighborhood)
                        }
                        title="Carregar previsão detalhada deste bairro"
                      >
                        <span className={`risk-dot-indicator ${row.level}`} />
                        <div>
                          <strong>{row.neighborhood}</strong>
                          <small className="risk-sub-regional">
                            {row.regional}
                          </small>
                        </div>
                      </button>
                    </td>
                    <td>
                      <span className="occurrence-row-category-tag">
                        {row.watershed.replace("Bacia do ", "")}
                      </span>
                    </td>
                    <td className="risk-factor-cell">
                      {HISTORICAL_TIER_LABELS[row.historicalFloodTier]}
                    </td>
                    <td>
                      <div className="risk-mini-bar-cell">
                        <span>{row.drainageScore}%</span>
                        <div className="urban-index-bar">
                          <span
                            style={{
                              width: `${row.drainageScore}%`,
                              backgroundColor: "#287CB5",
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="risk-mini-bar-cell">
                        <span>{row.trafficScore}%</span>
                        <div className="urban-index-bar">
                          <span
                            style={{
                              width: `${row.trafficScore}%`,
                              backgroundColor: "#D97732",
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`risk-pill-badge ${row.level}`}>
                        {row.compositeScore}% · {riskLabels[row.level]}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="occurrence-action-btn"
                        onClick={() => onOpenInMap(row.representativeEvent)}
                      >
                        <MapPin size={12} />
                        <span>Mapa</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
