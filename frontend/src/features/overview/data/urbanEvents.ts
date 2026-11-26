export type UrbanEventCategory = "traffic" | "flood" | "incident";

export type UrbanEventSeverity = "low" | "medium" | "high";

export interface UrbanEvent {
  id: number;
  title: string;
  neighborhood: string;
  conditionLabel: string;
  time: string;
  description: string;
  category: UrbanEventCategory;
  severity: UrbanEventSeverity;
  latitude: number;
  longitude: number;
  isPredictive?: boolean;
  predictionHorizon?: string;
  predictionFactors?: string[];
  confidencePercent?: number;
}

export const urbanEvents: UrbanEvent[] = [
  {
    id: 1,
    title: "Alagamento e retenção no Centro",
    neighborhood: "Centro",
    conditionLabel: "Alagamento + Trânsito Intenso",
    time: "14:42",
    description:
      "Ponto crítico na Av. Marechal Deodoro / Rua XV. Retenção de água na pista e velocidade média de 8 km/h.",
    category: "flood",
    severity: "high",
    latitude: -25.4302,
    longitude: -49.2718,
  },
  {
    id: 2,
    title: "Acúmulo de água na canaleta do Boqueirão",
    neighborhood: "Boqueirão",
    conditionLabel: "Chuva Intensa / Drenagem",
    time: "14:35",
    description:
      "Acúmulo de água na canaleta do Expresso e bueiros com vazão reduzida próximo ao terminal.",
    category: "flood",
    severity: "high",
    latitude: -25.5162,
    longitude: -49.2305,
  },
  {
    id: 3,
    title: "Gargalo viário na Av. República Argentina",
    neighborhood: "Portão",
    conditionLabel: "Fluxo Elevado de Veículos",
    time: "14:18",
    description:
      "Gargalo viário na Av. República Argentina com pistas molhadas e lentidão entre os cruzamentos semafóricos.",
    category: "traffic",
    severity: "medium",
    latitude: -25.4754,
    longitude: -49.2912,
  },
  {
    id: 4,
    title: "Precipitação branda no Água Verde",
    neighborhood: "Água Verde",
    conditionLabel: "Chuva Leve",
    time: "13:55",
    description:
      "Precipitação branda com boa absorção pluvial. Vias arteriais com tráfego operando sem retenção.",
    category: "flood",
    severity: "low",
    latitude: -25.4548,
    longitude: -49.2816,
  },
  {
    id: 5,
    title: "Monitoramento preventivo de córrego na CIC",
    neighborhood: "CIC (Cidade Industrial)",
    conditionLabel: "Alerta Preventivo de Vazão",
    time: "13:20",
    description:
      "Acompanhamento do córrego local em monitoramento prévio devido a chuvas registradas na cabeceira.",
    category: "flood",
    severity: "medium",
    latitude: -25.4985,
    longitude: -49.3382,
  },
  {
    id: 6,
    title: "Interferência na Av. Sete de Setembro",
    neighborhood: "Rebouças",
    conditionLabel: "Bloqueio Parcial de Faixa",
    time: "13:08",
    description:
      "Atendimento operacional na faixa direita próximo à Rodoferroviária com desvio gradual do fluxo.",
    category: "incident",
    severity: "high",
    latitude: -25.4375,
    longitude: -49.2594,
  },
  {
    id: 7,
    title: "Tráfego intenso na Av. do Batel",
    neighborhood: "Batel",
    conditionLabel: "Lentidão em Corredor",
    time: "12:50",
    description:
      "Volume acima da média nos acessos à Praça do Japão, com tempo de percurso ampliado em 18%.",
    category: "traffic",
    severity: "medium",
    latitude: -25.4426,
    longitude: -49.2895,
  },
  {
    id: 8,
    title: "Ocorrência de sinalização semafórica",
    neighborhood: "Cabral",
    conditionLabel: "Semáforo em Alerta",
    time: "12:34",
    description:
      "Conjunto semafórico em modo intermitente na Av. Paraná; equipe técnica acionada para normalização.",
    category: "incident",
    severity: "medium",
    latitude: -25.4068,
    longitude: -49.2524,
  },
  {
    id: 9,
    title: "Fluidez moderada na Linha Verde",
    neighborhood: "Pinheirinho",
    conditionLabel: "Trânsito Fluindo com Atenção",
    time: "12:15",
    description:
      "Circulação estável nos dois sentidos nas proximidades do Terminal Pinheirinho, sem ocorrências na pista.",
    category: "traffic",
    severity: "low",
    latitude: -25.5124,
    longitude: -49.2958,
  },
  {
    id: 10,
    title: "Queda de galho em via secundária",
    neighborhood: "Cajuru",
    conditionLabel: "Obstrução Parcial",
    time: "11:48",
    description:
      "Galho de médio porte ocupando o acostamento próximo à Av. Prefeito Maurício Fruet, aguardando remoção.",
    category: "incident",
    severity: "low",
    latitude: -25.4482,
    longitude: -49.2165,
  },
];
