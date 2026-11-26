import type { UrbanEvent } from "../../features/overview/data/urbanEvents";

export interface AiResolutionPlan {
  summary: string;
  estimatedResponseWindow: string;
  immediateActions: string[];
  mobilityMitigation: string[];
  agenciesToNotify: string[];
  nearbyStopsCount?: number;
  affectedGtfsRoutes?: string[];
  source: "api" | "heuristic-engine";
}

function buildContextualPlan(event: UrbanEvent): AiResolutionPlan {
  const isHigh = event.severity === "high";
  const isMedium = event.severity === "medium";

  if (event.category === "flood") {
    return {
      summary: `Protocolo de drenagem e contenção hídrica para ${event.neighborhood} (${event.conditionLabel}).`,
      immediateActions: [
        isHigh
          ? `Acionar equipe de desobstrução de bocas de lobo e galerias em ${event.neighborhood} com prioridade máxima.`
          : `Realizar vistoria preventiva nas grelhas e canaletas de drenagem próximas a ${event.neighborhood}.`,
        "Isolar trechos com lâmina d'água acima de 15 cm para evitar pane mecânica de veículos.",
        event.isPredictive
          ? "Posicionar viatura de monitoramento antes do início da janela de precipitação prevista."
          : "Registrar nível da lâmina d'água e verificar refluxo de córregos ou canais próximos.",
      ],
      mobilityMitigation: [
        "Desviar linhas de ônibus troncais/alimentadoras para vias paralelas de cota mais alta.",
        "Emitir alerta de rota alternativa nos painéis viários e aplicativos de mobilidade.",
      ],
      agenciesToNotify: [
        "Defesa Civil de Curitiba (199)",
        "Secretaria Municipal de Obras Públicas (SMOP)",
        "SETRAN / URBS",
      ],
      estimatedResponseWindow: isHigh ? "15 a 30 min" : "45 a 90 min",
      source: "heuristic-engine",
    };
  }

  if (event.category === "traffic") {
    return {
      summary: `Plano de fluidez e redistribuição de fluxo viário em ${event.neighborhood}.`,
      immediateActions: [
        `Reprogramar tempos semafóricos (onda verde) nos corredores de acesso a ${event.neighborhood}.`,
        isHigh || isMedium
          ? "Deslocar agentes de trânsito para operação manual nos cruzamentos com retenção crítica."
          : "Manter monitoramento por câmeras da Central de Controle Operacional (CCO).",
        "Remover veículos imobilizados ou obstáculos na faixa de rolamento com apoio de guincho.",
      ],
      mobilityMitigation: [
        "Priorizar circulação nas canaletas exclusivas do transporte coletivo para evitar efeito cascata.",
        "Sugerir rotas de contorno pelos eixos estruturais adjacentes.",
      ],
      agenciesToNotify: [
        "SETRAN (Superintendência de Trânsito)",
        "URBS — Controle Operacional",
      ],
      estimatedResponseWindow: isHigh ? "20 a 40 min" : "40 a 60 min",
      source: "heuristic-engine",
    };
  }

  // category === "incident"
  return {
    summary: `Protocolo de resposta operacional e segurança viária em ${event.neighborhood}.`,
    immediateActions: [
      `Sinalizar o perímetro da ocorrência em ${event.neighborhood} com cones e viatura de apoio.`,
      isHigh
        ? "Acionar equipe de manutenção emergencial (elétrica, poda ou limpeza urbana) para liberação imediata da via."
        : "Agendar intervenção técnica corretiva fora do horário de pico.",
      "Verificar integridade da rede semafórica e fiação aérea no entorno imediato.",
    ],
    mobilityMitigation: [
      "Implantar desvio local em faixa reversível caso haja bloqueio parcial.",
      "Atualizar status dos pontos de parada num raio de 500m no sistema GTFS.",
    ],
    agenciesToNotify: [
      "SETRAN",
      "Central 156 / Equipe de Manutenção Urbana",
      ...(isHigh ? ["Corpo de Bombeiros / COPEL"] : []),
    ],
    estimatedResponseWindow: isHigh ? "25 a 45 min" : "60 a 120 min",
    source: "heuristic-engine",
  };
}

export async function generateOccurrenceAiIdeas(
  event: UrbanEvent,
): Promise<AiResolutionPlan> {
  try {
    const response = await fetch("/api/ai/occurrence-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });

    if (response.ok) {
      const data = (await response.json()) as AiResolutionPlan;
      return { ...data, source: "api" };
    }
  } catch {
    // Fallback silencioso para o motor contextual local
  }

  // Simula pequeno tempo de processamento para feedback visual natural
  await new Promise((resolve) => window.setTimeout(resolve, 450));
  return buildContextualPlan(event);
}
