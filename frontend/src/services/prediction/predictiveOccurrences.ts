import type { UrbanEvent } from "../../features/overview/data/urbanEvents";
import type { PrecipitationContext } from "../weather/weatherService";

interface NeighborhoodRiskProfile {
  id: number;
  neighborhood: string;
  latitude: number;
  longitude: number;
  drainageSensitivity: "high" | "medium" | "low";
  rushHourSensitivity: "high" | "medium" | "low";
  drainageNote: string;
  trafficNote: string;
}

const CURITIBA_RISK_PROFILES: NeighborhoodRiskProfile[] = [
  {
    id: 9001,
    neighborhood: "Centro",
    latitude: -25.4302,
    longitude: -49.2718,
    drainageSensitivity: "high",
    rushHourSensitivity: "high",
    drainageNote:
      "baixa taxa de permeabilidade e escoamento pluvial limitado nas vias centrais",
    trafficNote:
      "alto volume de saída comercial e convergência de linhas troncais",
  },
  {
    id: 9002,
    neighborhood: "Alto Boqueirão",
    latitude: -25.5318,
    longitude: -49.2412,
    drainageSensitivity: "high",
    rushHourSensitivity: "medium",
    drainageNote:
      "região plana com pontos históricos de acúmulo em galerias e canaletas",
    trafficNote: "fluxo de retorno residencial pela Av. Marechal Floriano",
  },
  {
    id: 9003,
    neighborhood: "Rebouças",
    latitude: -25.4375,
    longitude: -49.2594,
    drainageSensitivity: "high",
    rushHourSensitivity: "high",
    drainageNote:
      "baixada próxima à bacia do Rio Belém sujeita a lâmina d'água",
    trafficNote:
      "corredor de ligação entre o Centro, Rodoferroviária e Linha Verde",
  },
  {
    id: 9004,
    neighborhood: "Portão",
    latitude: -25.4754,
    longitude: -49.2912,
    drainageSensitivity: "medium",
    rushHourSensitivity: "high",
    drainageNote: "acúmulo pontual em cruzamentos da Av. República Argentina",
    trafficNote:
      "gargalo viário intenso nos horários de entrada e saída do trabalho",
  },
  {
    id: 9005,
    neighborhood: "CIC (Cidade Industrial)",
    latitude: -25.4985,
    longitude: -49.3382,
    drainageSensitivity: "medium",
    rushHourSensitivity: "high",
    drainageNote:
      "elevação rápida de vazão em córregos locais após pancadas de chuva",
    trafficNote: "troca de turno industrial com grande volume de veículos",
  },
];

function parseHour(hourLabel: string): number {
  const parsed = Number.parseInt(hourLabel.split(":")[0] ?? "", 10);
  return Number.isNaN(parsed) ? 12 : parsed;
}

function getRushHourContext(hour: number): {
  isRush: boolean;
  label: string;
} {
  if (hour >= 7 && hour <= 9) {
    return { isRush: true, label: "Horário de pico (manhã)" };
  }
  if (hour >= 11 && hour <= 13) {
    return { isRush: true, label: "Pico intermediário (almoço)" };
  }
  if (hour >= 16 && hour <= 19) {
    return { isRush: true, label: "Horário de pico (saída do trabalho)" };
  }
  return { isRush: false, label: "Fluxo fora de pico" };
}

/**
 * Gera automaticamente ocorrências preditivas cruzando:
 * 1) Previsão horária Open-Meteo (ou cenário simulado)
 * 2) Janelas de horário de pico em Curitiba
 * 3) Perfil de drenagem e mobilidade de cada bairro
 */
export function generatePredictiveOccurrences(
  precipContext: PrecipitationContext | null,
  simulateEveningStorm = false,
): UrbanEvent[] {
  const hourlySlots = simulateEveningStorm
    ? [
        {
          time: "simulated-16",
          hourLabel: "16:00",
          precipitationMm: 3.4,
          probabilityPercent: 85,
        },
        {
          time: "simulated-17",
          hourLabel: "17:00",
          precipitationMm: 6.2,
          probabilityPercent: 92,
        },
      ]
    : (precipContext?.next6Hours ?? []);

  if (hourlySlots.length === 0) return [];

  const soilSaturated = (precipContext?.last5DaysTotalMm ?? 0) >= 20;

  // Encontra o horário mais crítico nas próximas 6 horas
  const peakRainSlot = [...hourlySlots].sort(
    (a, b) =>
      b.precipitationMm * 10 +
      (b.probabilityPercent ?? 0) -
      (a.precipitationMm * 10 + (a.probabilityPercent ?? 0)),
  )[0];

  const hasSignificantRain =
    peakRainSlot &&
    (peakRainSlot.precipitationMm >= 0.4 ||
      (peakRainSlot.probabilityPercent ?? 0) >= 55);

  const generated: UrbanEvent[] = [];

  for (const profile of CURITIBA_RISK_PROFILES) {
    // Escolhe a janela horária mais relevante para este bairro
    const targetSlot =
      profile.neighborhood === "Alto Boqueirão"
        ? (hourlySlots.find(
            (s) =>
              s.precipitationMm >= 0.3 || (s.probabilityPercent ?? 0) >= 50,
          ) ?? peakRainSlot)
        : (hourlySlots.find((s) => {
            const h = parseHour(s.hourLabel);
            return (
              getRushHourContext(h).isRush &&
              (s.precipitationMm >= 0.3 || (s.probabilityPercent ?? 0) >= 50)
            );
          }) ?? peakRainSlot);

    if (!targetSlot) continue;

    const targetHour = parseHour(targetSlot.hourLabel);
    const rush = getRushHourContext(targetHour);
    const prob = targetSlot.probabilityPercent ?? 0;
    const rainMm = targetSlot.precipitationMm;

    // Caso 1: Chuva prevista + Bairro sensível (com ou sem horário de pico)
    if (hasSignificantRain) {
      const combinedCompoundRisk =
        rush.isRush &&
        profile.drainageSensitivity === "high" &&
        profile.rushHourSensitivity === "high";

      const severity =
        rainMm >= 4 || (combinedCompoundRisk && (rainMm >= 1.2 || prob >= 70))
          ? "high"
          : rainMm >= 1 || prob >= 60 || rush.isRush
            ? "medium"
            : "low";

      // Evita ruído: só gera alerta de baixo risco se houver pelo menos 55% de chance de chuva
      if (severity === "low" && prob < 55) continue;

      const factors: string[] = [
        `Chuva prevista às ${targetSlot.hourLabel} (${rainMm.toFixed(1)} mm · ${prob}%)`,
      ];

      if (rush.isRush) {
        factors.push(rush.label);
      }

      if (profile.drainageSensitivity === "high") {
        factors.push("Baixo escoamento / risco de acúmulo");
      }

      if (soilSaturated) {
        factors.push(
          `Solo úmido (${precipContext?.last5DaysTotalMm.toFixed(0)} mm em 5d)`,
        );
      }

      const conditionLabel = combinedCompoundRisk
        ? "Alerta Preditivo: Alagamento + Trânsito Forte"
        : profile.drainageSensitivity === "high"
          ? "Alerta Preditivo: Risco de Alagamento"
          : "Alerta Preditivo: Retenção Viária com Chuva";

      const description = combinedCompoundRisk
        ? `Previsão de chuva às ${targetSlot.hourLabel} (${rainMm.toFixed(1)} mm) coincidirá com ${profile.trafficNote}. Devido à ${profile.drainageNote}, há alta probabilidade de retenção severa e acúmulo de água.`
        : profile.drainageSensitivity === "high"
          ? `Monitoramento antecipado indica precipitação às ${targetSlot.hourLabel} (${rainMm.toFixed(1)} mm) em região com ${profile.drainageNote}. Equipes preventivas recomendadas antes do início da chuva.`
          : `Combinação de pista molhada às ${targetSlot.hourLabel} (${rainMm.toFixed(1)} mm) com ${profile.trafficNote}, elevando o tempo de deslocamento no corredor.`;

      const confidence = Math.min(
        96,
        Math.max(
          58,
          Math.round(prob * 0.72 + (rush.isRush ? 18 : 8) + rainMm * 2),
        ),
      );

      generated.push({
        id: profile.id,
        title: `${profile.neighborhood} · ${conditionLabel}`,
        neighborhood: profile.neighborhood,
        conditionLabel,
        time: `Previsto ${targetSlot.hourLabel}`,
        description,
        category: profile.drainageSensitivity === "high" ? "flood" : "traffic",
        severity,
        latitude: profile.latitude,
        longitude: profile.longitude,
        isPredictive: true,
        predictionHorizon: `Janela das ${targetSlot.hourLabel}`,
        predictionFactors: factors,
        confidencePercent: confidence,
      });
    } else if (rush.isRush && profile.rushHourSensitivity === "high") {
      // Caso 2: Sem chuva prevista, mas há janela de horário de pico nas próximas 6h
      generated.push({
        id: profile.id,
        title: `${profile.neighborhood} · Pico de Fluxo Previsto`,
        neighborhood: profile.neighborhood,
        conditionLabel: "Predição de Fluxo Intenso (Tempo Seco)",
        time: `Previsto ${targetSlot.hourLabel}`,
        description: `Projeção de aumento gradual de tráfego às ${targetSlot.hourLabel} devido ao ${profile.trafficNote}. Pista seca e drenagem operando normalmente.`,
        category: "traffic",
        severity: "low",
        latitude: profile.latitude,
        longitude: profile.longitude,
        isPredictive: true,
        predictionHorizon: `Janela das ${targetSlot.hourLabel}`,
        predictionFactors: [rush.label, "Tempo firme (0.0 mm)"],
        confidencePercent: 78,
      });
    }
  }

  // Ordena por gravidade (Alta -> Média -> Baixa)
  const weight: Record<UrbanEvent["severity"], number> = {
    high: 3,
    medium: 2,
    low: 1,
  };

  return generated.sort((a, b) => weight[b.severity] - weight[a.severity]);
}
