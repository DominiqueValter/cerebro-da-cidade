import type { UrbanEvent } from "../../features/overview/data/urbanEvents";

export type CorridorStatus = "normal" | "moderate" | "critical";

export interface StructuralCorridor {
  id: string;
  name: string;
  axis: string;
  mainLines: string[];
  neighborhoods: string[];
  baseSpeedKmh: number;
  currentSpeedKmh: number;
  status: CorridorStatus;
  impactNote: string;
  latitude: number;
  longitude: number;
}

const BASE_CORRIDORS: Array<
  Omit<StructuralCorridor, "currentSpeedKmh" | "status" | "impactNote">
> = [
  {
    id: "norte-sul",
    name: "Eixo Norte–Sul (República Argentina / Paraná)",
    axis: "Santa Cândida ↔ Pinheirinho",
    mainLines: ["203", "603", "202", "602"],
    neighborhoods: [
      "Centro",
      "Água Verde",
      "Portão",
      "Capão Raso",
      "Pinheirinho",
    ],
    baseSpeedKmh: 28,
    latitude: -25.4754,
    longitude: -49.2912,
  },
  {
    id: "leste-oeste",
    name: "Eixo Leste–Oeste (Sete de Setembro / Padre Anchieta)",
    axis: "Centenário ↔ Campo Comprido",
    mainLines: ["303", "302", "304"],
    neighborhoods: [
      "Cajuru",
      "Cristo Rei",
      "Centro",
      "Batel",
      "Bigorrilho",
      "Campina do Siqueira",
    ],
    baseSpeedKmh: 26,
    latitude: -25.4328,
    longitude: -49.3025,
  },
  {
    id: "boqueirao",
    name: "Eixo Boqueirão (Av. Marechal Floriano Peixoto)",
    axis: "Praça Carlos Gomes ↔ Terminal Boqueirão",
    mainLines: ["503", "502", "505", "507"],
    neighborhoods: ["Centro", "Rebouças", "Parolin", "Hauer", "Boqueirão"],
    baseSpeedKmh: 25,
    latitude: -25.5162,
    longitude: -49.2305,
  },
  {
    id: "linha-verde",
    name: "Corredor Linha Verde (BR-476)",
    axis: "Atuba ↔ Pinheirinho",
    mainLines: ["508", "350", "550", "600"],
    neighborhoods: [
      "Atuba",
      "Bairro Alto",
      "Tarumã",
      "Jardim Botânico",
      "Fanny",
      "Xaxim",
      "Pinheirinho",
    ],
    baseSpeedKmh: 38,
    latitude: -25.4785,
    longitude: -49.2665,
  },
  {
    id: "inter-2",
    name: "Anel Perimetral Inter 2",
    axis: "Circular (Cabral / Campina do Siqueira / Hauer / Capão da Imbuia)",
    mainLines: ["020", "021", "022", "023"],
    neighborhoods: [
      "Cabral",
      "Mercês",
      "Campina do Siqueira",
      "Portão",
      "Hauer",
      "Capão da Imbuia",
    ],
    baseSpeedKmh: 29,
    latitude: -25.4368,
    longitude: -49.3125,
  },
  {
    id: "cic-barigui",
    name: "Corredor Industrial / CIC (Juscelino Kubitschek)",
    axis: "Fazendinha ↔ Cidade Industrial / Tatuquara",
    mainLines: ["607", "658", "654", "619"],
    neighborhoods: [
      "Fazendinha",
      "Cidade Industrial de Curitiba",
      "CIC",
      "Tatuquara",
    ],
    baseSpeedKmh: 31,
    latitude: -25.4985,
    longitude: -49.3382,
  },
];

export function evaluateStructuralCorridors(
  events: UrbanEvent[],
  isRaining: boolean,
): StructuralCorridor[] {
  return BASE_CORRIDORS.map((corridor) => {
    const matchingEvents = events.filter((ev) =>
      corridor.neighborhoods.some(
        (n) =>
          ev.neighborhood.toLowerCase().includes(n.toLowerCase()) ||
          n.toLowerCase().includes(ev.neighborhood.toLowerCase()),
      ),
    );

    const highCount = matchingEvents.filter(
      (e) => e.severity === "high",
    ).length;
    const mediumCount = matchingEvents.filter(
      (e) => e.severity === "medium",
    ).length;

    const speedDrop = highCount * 7 + mediumCount * 3.5 + (isRaining ? 4 : 0);
    const currentSpeedKmh = Math.max(
      11,
      Math.round(corridor.baseSpeedKmh - speedDrop),
    );

    const status: CorridorStatus =
      highCount >= 1 || currentSpeedKmh <= 16
        ? "critical"
        : mediumCount >= 1 || isRaining
          ? "moderate"
          : "normal";

    const impactNote =
      matchingEvents.length > 0
        ? `${matchingEvents.length} ocorrência(s) no eixo (${matchingEvents[0].neighborhood}: ${matchingEvents[0].conditionLabel}).`
        : isRaining
          ? "Pista molhada: redução preventiva de velocidade nas canaletas."
          : "Operação regular e intervalos dentro da programação GTFS.";

    return {
      ...corridor,
      currentSpeedKmh,
      status,
      impactNote,
    };
  });
}
