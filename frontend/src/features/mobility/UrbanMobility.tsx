import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bus,
  CarFront,
  CloudRain,
  Gauge,
  MapPin,
  Route,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import { urbanEvents } from "../overview/data/urbanEvents";
import type { UrbanEvent } from "../overview/data/urbanEvents";
import {
  getCurrentWeather,
  getPrecipitationContext,
} from "../../services/weather/weatherService";
import type {
  CurrentWeather,
  PrecipitationContext,
} from "../../services/weather/weatherService";
import { generatePredictiveOccurrences } from "../../services/prediction/predictiveOccurrences";
import { getNearbyTransitImpact } from "../../services/mobility/transitService";
import type { NearbyTransitImpact } from "../../services/mobility/transitService";
import {
  evaluateStructuralCorridors,
  type CorridorStatus,
  type StructuralCorridor,
} from "../../services/mobility/mobilityCorridorsService";

interface UrbanMobilityProps {
  onOpenInMap: (event: UrbanEvent) => void;
}

const statusLabels: Record<CorridorStatus, string> = {
  normal: "Operação Normal",
  moderate: "Atenção / Lentidão",
  critical: "Impacto Crítico",
};

const statusBadgeMap: Record<CorridorStatus, "low" | "medium" | "high"> = {
  normal: "low",
  moderate: "medium",
  critical: "high",
};

export function UrbanMobility({ onOpenInMap }: UrbanMobilityProps) {
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [precipContext, setPrecipContext] =
    useState<PrecipitationContext | null>(null);
  const [simulateRainPeak, setSimulateRainPeak] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CorridorStatus>(
    "all",
  );

  // Impacto GTFS consultado para os pontos críticos da cidade
  const [gtfsByEventId, setGtfsByEventId] = useState<
    Record<number, NearbyTransitImpact>
  >({});
  const [gtfsLoading, setGtfsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getCurrentWeather()
      .then((data) => {
        if (!cancelled) setWeather(data);
      })
      .catch((err) => console.error("Erro clima mobilidade:", err));

    getPrecipitationContext()
      .then((data) => {
        if (!cancelled) setPrecipContext(data);
      })
      .catch((err) => console.error("Erro chuva mobilidade:", err));

    return () => {
      cancelled = true;
    };
  }, []);

  const predictiveEvents = useMemo(
    () => generatePredictiveOccurrences(precipContext, simulateRainPeak),
    [precipContext, simulateRainPeak],
  );

  const activeEvents = useMemo(
    () => [...predictiveEvents, ...urbanEvents],
    [predictiveEvents],
  );

  const isRaining = useMemo(() => {
    if (simulateRainPeak) return true;
    const nextRain = precipContext?.next6Hours?.[0]?.precipitationMm ?? 0;
    return (weather?.precipitation ?? 0) > 0 || nextRain >= 0.8;
  }, [simulateRainPeak, precipContext, weather]);

  const corridors = useMemo(
    () => evaluateStructuralCorridors(activeEvents, isRaining),
    [activeEvents, isRaining],
  );

  // Consulta GTFS para os 4 eventos mais críticos
  const topCriticalEvents = useMemo(
    () =>
      activeEvents
        .filter((e) => e.severity === "high" || e.category === "flood")
        .slice(0, 4),
    [activeEvents],
  );

  const criticalEventsKey = useMemo(
    () => topCriticalEvents.map((e) => e.id).join("|"),
    [topCriticalEvents],
  );

  useEffect(() => {
    if (topCriticalEvents.length === 0) return;

    let cancelled = false;
    setGtfsLoading(true);

    Promise.all(
      topCriticalEvents.map(async (ev) => {
        try {
          const impact = await getNearbyTransitImpact(
            ev.latitude,
            ev.longitude,
            500,
          );
          return [ev.id, impact] as const;
        } catch {
          return null;
        }
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        const map: Record<number, NearbyTransitImpact> = {};
        for (const entry of entries) {
          if (entry) map[entry[0]] = entry[1];
        }
        setGtfsByEventId(map);
      })
      .finally(() => {
        if (!cancelled) setGtfsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [criticalEventsKey]);

  const metrics = useMemo(() => {
    const avgSpeed =
      corridors.length > 0
        ? Math.round(
            corridors.reduce((sum, c) => sum + c.currentSpeedKmh, 0) /
              corridors.length,
          )
        : 28;

    const baseAvg =
      corridors.length > 0
        ? Math.round(
            corridors.reduce((sum, c) => sum + c.baseSpeedKmh, 0) /
              corridors.length,
          )
        : 30;

    const fluidityPercent = Math.min(
      100,
      Math.max(25, Math.round((avgSpeed / baseAvg) * 100)),
    );

    const criticalCorridors = corridors.filter(
      (c) => c.status === "critical",
    ).length;

    const routeSet = new Set<string>();
    let totalStops = 0;

    Object.values(gtfsByEventId).forEach((impact) => {
      totalStops += impact.nearbyStopsCount;
      impact.affectedRoutes.forEach((r) => routeSet.add(r.id));
    });

    return {
      avgSpeed,
      fluidityPercent,
      criticalCorridors,
      affectedRoutesCount: routeSet.size,
      totalStops,
    };
  }, [corridors, gtfsByEventId]);

  const filteredCorridors = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return corridors.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!term) return true;
      const haystack =
        `${c.name} ${c.axis} ${c.mainLines.join(" ")} ${c.neighborhoods.join(" ")}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [corridors, statusFilter, searchQuery]);

  function handleOpenCorridorInMap(corridor: StructuralCorridor) {
    const linkedEvent = activeEvents.find((ev) =>
      corridor.neighborhoods.some(
        (n) =>
          ev.neighborhood.toLowerCase().includes(n.toLowerCase()) ||
          n.toLowerCase().includes(ev.neighborhood.toLowerCase()),
      ),
    );

    if (linkedEvent) {
      onOpenInMap(linkedEvent);
      return;
    }

    onOpenInMap({
      id: 8800,
      title: corridor.name,
      neighborhood: corridor.neighborhoods[0] ?? "Centro",
      conditionLabel: statusLabels[corridor.status],
      time: "Agora",
      description: `${corridor.axis} — ${corridor.impactNote}`,
      category: "traffic",
      severity: statusBadgeMap[corridor.status],
      latitude: corridor.latitude,
      longitude: corridor.longitude,
    });
  }

  return (
    <div className="mobility-page">
      <section className="page-heading">
        <div>
          <span className="page-eyebrow">
            REDE INTEGRADA DE TRANSPORTE (RIT) · CORREDORES & GTFS
          </span>
          <h1>Mobilidade urbana</h1>
          <p>
            Monitoramento da fluidez nos eixos estruturais de Curitiba,
            canaletas exclusivas e linhas de ônibus impactadas por ocorrências.
          </p>
        </div>

        <div className="occurrences-heading-actions">
          <button
            type="button"
            className={`occurrences-sim-btn ${simulateRainPeak ? "active" : ""}`}
            onClick={() => setSimulateRainPeak((prev) => !prev)}
          >
            <CloudRain size={15} />
            <span>
              {simulateRainPeak
                ? "Simulação ativa (chuva no pico)"
                : "Simular impacto de chuva"}
            </span>
          </button>
        </div>
      </section>

      {/* KPIS DE MOBILIDADE */}
      <section className="occurrences-kpis">
        <article className="panel occurrence-kpi-card">
          <div className="occurrence-kpi-top">
            <span>Índice de fluidez viária</span>
            <div className="metric-icon metric-icon-default">
              <Gauge size={16} />
            </div>
          </div>
          <strong>{metrics.fluidityPercent}%</strong>
          <small>Velocidade média: {metrics.avgSpeed} km/h nos eixos</small>
        </article>

        <article className="panel occurrence-kpi-card">
          <div className="occurrence-kpi-top">
            <span>Corredores em alerta</span>
            <div className="metric-icon metric-icon-danger">
              <AlertTriangle size={16} />
            </div>
          </div>
          <strong>{String(metrics.criticalCorridors).padStart(2, "0")}</strong>
          <small>De {corridors.length} eixos estruturais monitorados</small>
        </article>

        <article className="panel occurrence-kpi-card">
          <div className="occurrence-kpi-top">
            <span>Linhas GTFS em zona crítica</span>
            <div className="metric-icon metric-icon-warning">
              <Bus size={16} />
            </div>
          </div>
          <strong>
            {gtfsLoading
              ? "..."
              : String(metrics.affectedRoutesCount).padStart(2, "0")}
          </strong>
          <small>Raio de 500m de alagamentos e bloqueios</small>
        </article>

        <article className="panel occurrence-kpi-card">
          <div className="occurrence-kpi-top">
            <span>Pontos / Estações-tubo</span>
            <div className="metric-icon metric-icon-default">
              <Route size={16} />
            </div>
          </div>
          <strong>
            {gtfsLoading ? "..." : String(metrics.totalStops).padStart(2, "0")}
          </strong>
          <small>Paradas próximas às ocorrências prioritárias</small>
        </article>
      </section>

      {/* FILTRO DE CORREDORES E LINHAS */}
      <section className="panel occurrences-filter-bar">
        <div className="occurrences-search">
          <Search size={15} />
          <input
            type="text"
            placeholder="Buscar corredor, bairro ou linha (ex: 203, 303, 503, Inter 2)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="occurrences-filter-groups">
          <div className="filter-pill-group" role="group" aria-label="Status">
            {(
              [
                { id: "all", label: "Todos os eixos" },
                { id: "critical", label: "Críticos" },
                { id: "moderate", label: "Atenção" },
                { id: "normal", label: "Normais" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                className={statusFilter === item.id ? "active" : ""}
                onClick={() => setStatusFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* CORREDORES ESTRUTURAIS E CANALETAS */}
      <section className="panel mobility-corridors-panel">
        <div className="panel-header">
          <div>
            <span className="panel-eyebrow">
              EIXOS TRONCAIS E CANALETAS EXCLUSIVAS
            </span>
            <h2>Desempenho por corredor estrutural</h2>
          </div>
          <span className="smart-real-badge">
            {isRaining ? "Operação sob chuva" : "Tempo seco"}
          </span>
        </div>

        <div className="mobility-corridors-grid">
          {filteredCorridors.map((corridor) => (
            <article
              key={corridor.id}
              className={`mobility-corridor-card ${corridor.status}`}
            >
              <div className="mobility-corridor-top">
                <div>
                  <strong>{corridor.name}</strong>
                  <small>{corridor.axis}</small>
                </div>
                <span
                  className={`risk-pill-badge ${statusBadgeMap[corridor.status]}`}
                >
                  {statusLabels[corridor.status]}
                </span>
              </div>

              <div className="mobility-speed-row">
                <span>
                  <CarFront size={13} /> Velocidade média:{" "}
                  <strong>{corridor.currentSpeedKmh} km/h</strong> (ref.{" "}
                  {corridor.baseSpeedKmh} km/h)
                </span>
              </div>

              <p className="mobility-corridor-note">{corridor.impactNote}</p>

              <div className="mobility-corridor-footer">
                <div className="mobility-lines-chips">
                  {corridor.mainLines.map((line) => (
                    <span key={line} className="occurrence-factor-chip">
                      Linha {line}
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  className="occurrence-action-btn"
                  onClick={() => handleOpenCorridorInMap(corridor)}
                >
                  <MapPin size={12} />
                  <span>Mapa</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* CRUZAMENTO GTFS POR OCORRÊNCIA CRÍTICA */}
      <section className="panel mobility-gtfs-panel">
        <div className="panel-header">
          <div>
            <span className="panel-eyebrow">
              INTEGRAÇÃO BACKEND GTFS · RAIO 500M
            </span>
            <h2>Linhas impactadas por ocorrências prioritárias</h2>
          </div>
          <Sparkles size={16} color="#244B40" />
        </div>

        <div className="mobility-gtfs-list">
          {topCriticalEvents.map((ev) => {
            const impact = gtfsByEventId[ev.id];
            return (
              <div key={ev.id} className="mobility-gtfs-item">
                <div className="mobility-gtfs-item-head">
                  <div>
                    <strong>
                      {ev.neighborhood} — {ev.conditionLabel}
                    </strong>
                    <small>{ev.description}</small>
                  </div>

                  <button
                    type="button"
                    className="occurrence-action-btn"
                    onClick={() => onOpenInMap(ev)}
                  >
                    <MapPin size={13} />
                    <span>Ver ponto</span>
                  </button>
                </div>

                <div className="risk-transit-chips">
                  {gtfsLoading ? (
                    <span className="smart-routes-empty">
                      Consultando itinerários GTFS...
                    </span>
                  ) : impact && impact.affectedRoutes.length > 0 ? (
                    impact.affectedRoutes.slice(0, 10).map((route) => (
                      <span
                        key={route.id}
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
                      Nenhuma linha afetada no raio de 500m.
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
