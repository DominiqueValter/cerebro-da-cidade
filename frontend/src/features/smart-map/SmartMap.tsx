import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Circle,
  CircleMarker,
  Polyline,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { geoJSON, latLngBounds } from "leaflet";
import type { PathOptions } from "leaflet";
import {
  Bus,
  Clock,
  CloudRain,
  Compass,
  Crosshair,
  Filter,
  Layers,
  MapPin,
  Navigation,
  RotateCcw,
  Route,
  Search,
  Sparkles,
  Wind,
  X,
} from "lucide-react";

import { urbanEvents } from "../overview/data/urbanEvents";
import type {
  UrbanEvent,
  UrbanEventCategory,
} from "../overview/data/urbanEvents";
import { TransitLayer } from "../../components/dashboard/TransitLayer";
import {
  getTransitStops,
  getTransitRoutes,
  getRouteShape,
  getNearbyTransitImpact,
} from "../../services/mobility/transitService";
import type {
  TransitStop,
  TransitRoute,
  RouteShapeResponse,
  NearbyTransitImpact,
} from "../../services/mobility/transitService";
import {
  getPrecipitationContext,
  getCurrentAirQuality,
} from "../../services/weather/weatherService";
import type {
  PrecipitationContext,
  AirQualityData,
} from "../../services/weather/weatherService";
import { generatePredictiveOccurrences } from "../../services/prediction/predictiveOccurrences";

import "leaflet/dist/leaflet.css";

type SeverityFilter = "all" | UrbanEvent["severity"];
type BaseMapStyle = "clean" | "osm";
type EnvTab = "rain" | "air";

interface InspectedPoint {
  type: "event" | "custom";
  title: string;
  subtitle: string;
  neighborhood?: string;
  latitude: number;
  longitude: number;
  event?: UrbanEvent;
}

interface FlyTarget {
  latitude: number;
  longitude: number;
  zoom: number;
  nonce: number;
}

interface SmartMapProps {
  initialEvent?: UrbanEvent | null;
}

const INSPECTION_RADIUS_METERS = 500;

const categoryLabels: Record<UrbanEventCategory, string> = {
  traffic: "Trânsito",
  flood: "Alagamentos",
  incident: "Ocorrências",
};

const categoryColors: Record<UrbanEventCategory, string> = {
  traffic: "#D97732",
  flood: "#287CB5",
  incident: "#B94D4D",
};

const riskLabels: Record<UrbanEvent["severity"], string> = {
  low: "Risco Baixo",
  medium: "Risco Médio",
  high: "Risco Alto",
};

const riskAccentColors: Record<UrbanEvent["severity"], string> = {
  low: "#4E7861",
  medium: "#E3962D",
  high: "#E12D53",
};

function formatShortDate(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

function MapController({
  boundary,
  routeShape,
  flyTarget,
  resetNonce,
  skipInitialBoundaryFit,
  onMapClick,
}: {
  boundary: GeoJSON.GeoJsonObject | null;
  routeShape: RouteShapeResponse | null;
  flyTarget: FlyTarget | null;
  resetNonce: number;
  skipInitialBoundaryFit: boolean;
  onMapClick: (lat: number, lng: number) => void;
}) {
  const map = useMap();
  const hasFittedInitialRef = useRef(false);

  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });

  useEffect(() => {
    if (routeShape && routeShape.shapes.length > 0) {
      const allCoords = routeShape.shapes.flatMap((shape) => shape.coordinates);
      if (allCoords.length > 1) {
        const bounds = latLngBounds(allCoords);
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [44, 44], maxZoom: 14 });
        }
      }
    }
  }, [routeShape, map]);

  useEffect(() => {
    if (!flyTarget) return;
    map.flyTo([flyTarget.latitude, flyTarget.longitude], flyTarget.zoom, {
      duration: 0.65,
    });
  }, [flyTarget, map]);

  useEffect(() => {
    if (!boundary) return;
    if (!hasFittedInitialRef.current && skipInitialBoundaryFit) {
      hasFittedInitialRef.current = true;
      return;
    }
    hasFittedInitialRef.current = true;

    const bounds = geoJSON(boundary).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12 });
    }
  }, [boundary, resetNonce, skipInitialBoundaryFit, map]);

  return null;
}

export function SmartMap({ initialEvent }: SmartMapProps) {
  const [boundary, setBoundary] = useState<GeoJSON.GeoJsonObject | null>(null);
  const [baseStyle, setBaseStyle] = useState<BaseMapStyle>("clean");
  const [resetNonce, setResetNonce] = useState(0);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [envTab, setEnvTab] = useState<EnvTab>("rain");

  // Camadas e filtros de eventos
  const [activeCategories, setActiveCategories] = useState<
    Record<UrbanEventCategory, boolean>
  >({
    traffic: true,
    flood: true,
    incident: true,
  });
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [showStops, setShowStops] = useState(false);

  // Paradas e linhas GTFS
  const [stops, setStops] = useState<TransitStop[]>([]);
  const [routes, setRoutes] = useState<TransitRoute[]>([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [routesError, setRoutesError] = useState(false);
  const [routeQuery, setRouteQuery] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState<string>("");
  const [selectedShape, setSelectedShape] = useState<RouteShapeResponse | null>(
    null,
  );
  const [shapeLoading, setShapeLoading] = useState(false);

  // Ponto ou evento inspecionado + impacto nas linhas GTFS
  const [inspected, setInspected] = useState<InspectedPoint | null>(null);
  const [nearbyImpact, setNearbyImpact] = useState<NearbyTransitImpact | null>(
    null,
  );
  const [nearbyLoading, setNearbyLoading] = useState(false);

  // Dados reais Open-Meteo (Chuva + Qualidade do Ar)
  const [precipContext, setPrecipContext] =
    useState<PrecipitationContext | null>(null);
  const [airQuality, setAirQuality] = useState<AirQualityData | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(
      "https://servicodados.ibge.gov.br/api/v3/malhas/municipios/4106902?formato=application/vnd.geo+json&qualidade=intermediaria",
    )
      .then((res) => {
        if (!res.ok) throw new Error("Falha ao carregar malha IBGE");
        return res.json();
      })
      .then((data: GeoJSON.GeoJsonObject) => {
        if (!cancelled) setBoundary(data);
      })
      .catch((err) => console.error("Erro malha Curitiba:", err));

    getTransitStops()
      .then((data) => {
        if (!cancelled) setStops(data);
      })
      .catch((err) => console.error("Erro ao carregar paradas GTFS:", err));

    getTransitRoutes()
      .then((data) => {
        if (!cancelled) {
          setRoutes(data);
          setRoutesError(false);
        }
      })
      .catch((err) => {
        console.error("Erro ao carregar linhas GTFS:", err);
        if (!cancelled) setRoutesError(true);
      })
      .finally(() => {
        if (!cancelled) setRoutesLoading(false);
      });

    getPrecipitationContext()
      .then((data) => {
        if (!cancelled) setPrecipContext(data);
      })
      .catch((err) =>
        console.error("Erro ao carregar histórico pluviométrico:", err),
      );

    getCurrentAirQuality()
      .then((data) => {
        if (!cancelled) setAirQuality(data);
      })
      .catch((err) => console.error("Erro ao carregar qualidade do ar:", err));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedRouteId) {
      setSelectedShape(null);
      return;
    }

    let cancelled = false;
    setShapeLoading(true);

    getRouteShape(selectedRouteId)
      .then((data) => {
        if (!cancelled) setSelectedShape(data);
      })
      .catch((err) => {
        console.error("Erro ao buscar itinerário da linha:", err);
        if (!cancelled) setSelectedShape(null);
      })
      .finally(() => {
        if (!cancelled) setShapeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRouteId]);

  useEffect(() => {
    if (!inspected) {
      setNearbyImpact(null);
      return;
    }

    let cancelled = false;
    setNearbyLoading(true);

    getNearbyTransitImpact(
      inspected.latitude,
      inspected.longitude,
      INSPECTION_RADIUS_METERS,
    )
      .then((data) => {
        if (!cancelled) setNearbyImpact(data);
      })
      .catch((err) => {
        console.error("Erro ao consultar linhas próximas:", err);
        if (!cancelled) setNearbyImpact(null);
      })
      .finally(() => {
        if (!cancelled) setNearbyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [inspected]);

  const predictiveEvents = useMemo(() => {
    return generatePredictiveOccurrences(precipContext, false);
  }, [precipContext]);

  const allEvents = useMemo(() => {
    return [...predictiveEvents, ...urbanEvents];
  }, [predictiveEvents]);

  const filteredEvents = useMemo(() => {
    return allEvents.filter((event) => {
      if (!activeCategories[event.category]) return false;
      if (severityFilter !== "all" && event.severity !== severityFilter) {
        return false;
      }
      return true;
    });
  }, [allEvents, activeCategories, severityFilter]);

  const filteredRoutes = useMemo(() => {
    const term = routeQuery.trim().toLowerCase();
    if (!term) return routes.slice(0, 35);

    return routes
      .filter(
        (route) =>
          route.shortName.toLowerCase().includes(term) ||
          route.longName.toLowerCase().includes(term),
      )
      .slice(0, 35);
  }, [routes, routeQuery]);

  const hasCustomFilters =
    !activeCategories.traffic ||
    !activeCategories.flood ||
    !activeCategories.incident ||
    severityFilter !== "all";

  function resetFilters() {
    setActiveCategories({ traffic: true, flood: true, incident: true });
    setSeverityFilter("all");
  }

  function toggleCategory(category: UrbanEventCategory) {
    setActiveCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  }

  const handleInspectEvent = useCallback((event: UrbanEvent) => {
    setInspected({
      type: "event",
      title: `${event.neighborhood} · ${event.conditionLabel}`,
      subtitle: `${categoryLabels[event.category]} · ${riskLabels[event.severity]} · ${event.time}`,
      neighborhood: event.neighborhood,
      latitude: event.latitude,
      longitude: event.longitude,
      event,
    });
    setFlyTarget({
      latitude: event.latitude,
      longitude: event.longitude,
      zoom: 15,
      nonce: Date.now(),
    });
  }, []);

  useEffect(() => {
    if (!initialEvent) return;
    handleInspectEvent(initialEvent);
  }, [initialEvent, handleInspectEvent]);

  function handleMapClick(lat: number, lng: number) {
    setInspected({
      type: "custom",
      title: "Ponto selecionado no mapa",
      subtitle: "Análise de proximidade e linhas no raio de 500m",
      latitude: lat,
      longitude: lng,
    });
  }

  const boundaryStyle: PathOptions = {
    color: "#244B40",
    weight: 2.2,
    opacity: 0.9,
    fillColor: "#587C69",
    fillOpacity: 0.04,
  };

  const maxHourlyRain = useMemo(() => {
    if (!precipContext?.next6Hours.length) return 1;
    return Math.max(
      1,
      ...precipContext.next6Hours.map((h) => h.precipitationMm),
    );
  }, [precipContext]);

  const maxHistoryRain = useMemo(() => {
    if (!precipContext?.history.length) return 1;
    return Math.max(1, ...precipContext.history.map((d) => d.precipitationSum));
  }, [precipContext]);

  return (
    <div className="smart-map-page">
      <section className="page-heading">
        <div>
          <span className="page-eyebrow">EXPLORAÇÃO GEOGRÁFICA</span>
          <h1>Mapa inteligente</h1>
          <p>
            Cruze ocorrências urbanas por região, condições ambientais e
            itinerários do transporte coletivo em Curitiba.
          </p>
        </div>

        <div className="smart-map-header-badges">
          <div className="smart-map-summary-pill">
            <MapPin size={14} />
            <span>{filteredEvents.length} ocorrências visíveis</span>
          </div>

          {stops.length > 0 && (
            <div className="smart-map-summary-pill">
              <Bus size={14} />
              <span>{stops.length.toLocaleString("pt-BR")} paradas GTFS</span>
            </div>
          )}
        </div>
      </section>

      <div className="smart-map-layout">
        {/* COLUNA LATERAL COMPACTA E PRIORIZADA */}
        <aside className="smart-map-sidebar">
          {/* 1. CAMADAS E FILTROS */}
          <article className="panel smart-map-card">
            <div className="smart-map-card-header">
              <div className="smart-map-card-title">
                <Layers size={15} />
                <h2>Camadas e filtros</h2>
              </div>

              {hasCustomFilters && (
                <button
                  type="button"
                  className="smart-clear-filters-btn"
                  onClick={resetFilters}
                  title="Restaurar todas as camadas"
                >
                  <RotateCcw size={12} />
                  <span>Limpar</span>
                </button>
              )}
            </div>

            <div className="smart-map-toggles">
              {(Object.keys(categoryLabels) as UrbanEventCategory[]).map(
                (category) => {
                  const active = activeCategories[category];
                  return (
                    <button
                      key={category}
                      type="button"
                      className={`smart-layer-chip ${active ? "active" : ""}`}
                      onClick={() => toggleCategory(category)}
                    >
                      <span
                        className="legend-dot"
                        style={{ backgroundColor: categoryColors[category] }}
                      />
                      <span>{categoryLabels[category]}</span>
                    </button>
                  );
                },
              )}

              <button
                type="button"
                className={`smart-layer-chip ${showStops ? "active" : ""}`}
                onClick={() => setShowStops((prev) => !prev)}
              >
                <Bus size={13} />
                <span>Paradas GTFS</span>
              </button>
            </div>

            <div className="smart-map-severity">
              <span className="smart-map-sublabel">
                <Filter size={12} />
                Nível de risco
              </span>

              <div className="smart-severity-group">
                {(
                  [
                    { id: "all", label: "Todos" },
                    { id: "low", label: "Baixo" },
                    { id: "medium", label: "Médio" },
                    { id: "high", label: "Alto" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`smart-severity-btn ${
                      severityFilter === item.id ? "active" : ""
                    }`}
                    onClick={() => setSeverityFilter(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </article>

          {/* 2. ITINERÁRIOS DE ÔNIBUS (GTFS) */}
          <article className="panel smart-map-card">
            <div className="smart-map-card-header">
              <div className="smart-map-card-title">
                <Route size={15} />
                <h2>Itinerários de ônibus</h2>
              </div>
              <span className="smart-real-badge">GTFS</span>
            </div>

            <div className="smart-route-search">
              <Search size={14} />
              <input
                type="text"
                placeholder="Buscar código ou linha (ex: 010, Interbairros)"
                value={routeQuery}
                onChange={(e) => setRouteQuery(e.target.value)}
              />
              {routeQuery && (
                <button
                  type="button"
                  onClick={() => setRouteQuery("")}
                  aria-label="Limpar busca"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {selectedRouteId && (
              <div className="smart-selected-route">
                <div>
                  <strong>
                    Linha {selectedShape?.route.shortName ?? selectedRouteId}
                  </strong>
                  <span>
                    {shapeLoading
                      ? "Carregando itinerário..."
                      : selectedShape
                        ? `${selectedShape.route.longName} · ${selectedShape.shapes[0]?.coordinates.length ?? 0} pts`
                        : "Itinerário indisponível"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedRouteId("")}
                  title="Remover linha do mapa"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="smart-routes-list">
              {routesLoading && (
                <div className="smart-routes-empty">
                  Carregando catálogo de linhas...
                </div>
              )}

              {!routesLoading && routesError && (
                <div className="smart-routes-empty">
                  Não foi possível consultar o backend de mobilidade.
                </div>
              )}

              {!routesLoading &&
                !routesError &&
                filteredRoutes.map((route) => {
                  const isSelected = route.id === selectedRouteId;
                  return (
                    <button
                      key={route.id}
                      type="button"
                      className={`smart-route-item ${isSelected ? "active" : ""}`}
                      onClick={() =>
                        setSelectedRouteId(isSelected ? "" : route.id)
                      }
                    >
                      <span
                        className="smart-route-code"
                        style={{
                          backgroundColor: route.color,
                          color: route.textColor,
                        }}
                      >
                        {route.shortName}
                      </span>
                      <span className="smart-route-name">{route.longName}</span>
                    </button>
                  );
                })}
            </div>
          </article>

          {/* 3. CONTEXTO AMBIENTAL UNIFICADO (CHUVA + QUALIDADE DO AR) */}
          {/* 3. CONTEXTO AMBIENTAL UNIFICADO (CHUVA + QUALIDADE DO AR) */}
          <article className="panel smart-map-card">
            <div className="smart-map-card-header smart-env-header">
              <div
                className="smart-env-tabs"
                role="tablist"
                aria-label="Indicadores ambientais"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={envTab === "rain"}
                  className={`smart-env-tab ${envTab === "rain" ? "active" : ""}`}
                  onClick={() => setEnvTab("rain")}
                >
                  <CloudRain size={13} />
                  <span>Chuva (6h)</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={envTab === "air"}
                  className={`smart-env-tab ${envTab === "air" ? "active" : ""}`}
                  onClick={() => setEnvTab("air")}
                >
                  <Wind size={13} />
                  <span>Qualidade do ar</span>
                </button>
              </div>

              <span className="smart-real-badge smart-nowrap">Open-Meteo</span>
            </div>

            {envTab === "rain" ? (
              precipContext ? (
                <div className="smart-rain-body">
                  <div className="smart-rain-metrics">
                    <div className="smart-rain-stat-box">
                      <span>Acumulado (5 dias)</span>
                      <strong>{precipContext.last5DaysTotalMm} mm</strong>
                    </div>
                    <div className="smart-rain-stat-box">
                      <span>Probabilidade hoje</span>
                      <strong>
                        {precipContext.todayProbabilityPercent !== null
                          ? `${precipContext.todayProbabilityPercent}%`
                          : "--"}
                      </strong>
                    </div>
                  </div>

                  {precipContext.next6Hours.length > 0 && (
                    <div className="smart-hourly-rain">
                      <span className="smart-map-sublabel">
                        Previsão horária (próximas 6h)
                      </span>
                      <div className="smart-hourly-bars">
                        {precipContext.next6Hours.map((hour) => {
                          const heightPct = Math.max(
                            10,
                            Math.round(
                              (hour.precipitationMm / maxHourlyRain) * 100,
                            ),
                          );
                          return (
                            <div className="smart-hourly-col" key={hour.time}>
                              <span className="smart-hourly-prob">
                                {hour.probabilityPercent !== null
                                  ? `${hour.probabilityPercent}%`
                                  : "--"}
                              </span>
                              <div className="smart-hourly-track">
                                <span
                                  style={{
                                    height: `${hour.precipitationMm > 0 ? heightPct : 8}%`,
                                    opacity:
                                      hour.precipitationMm > 0 ? 1 : 0.35,
                                  }}
                                />
                              </div>
                              <strong>{hour.precipitationMm.toFixed(1)}</strong>
                              <span>{hour.hourLabel}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="smart-rain-history-section">
                    <span className="smart-map-sublabel">
                      Histórico diário (últimos 5 dias)
                    </span>
                    <div className="smart-rain-history">
                      {precipContext.history.map((day) => {
                        const barWidth = Math.max(
                          6,
                          Math.round(
                            (day.precipitationSum / maxHistoryRain) * 100,
                          ),
                        );

                        return (
                          <div className="smart-rain-day" key={day.date}>
                            <span className="smart-rain-day-date">
                              {formatShortDate(day.date)}
                            </span>
                            <div className="smart-rain-day-track">
                              <span
                                style={{
                                  width: `${day.precipitationSum > 0 ? barWidth : 0}%`,
                                }}
                              />
                            </div>
                            <strong className="smart-rain-day-value">
                              {day.precipitationSum.toFixed(1)} mm
                            </strong>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="smart-routes-empty">
                  Carregando dados pluviométricos...
                </div>
              )
            ) : airQuality ? (
              <>
                <div className="smart-aqi-row">
                  <div className="smart-aqi-score">
                    <strong>{airQuality.europeanAqi}</strong>
                    <span>EAQI</span>
                  </div>
                  <span
                    className={`smart-aqi-status ${airQuality.categoryVariant}`}
                  >
                    {airQuality.categoryLabel}
                  </span>
                </div>

                <div className="smart-aqi-pollutants">
                  <div>
                    <span>PM2.5</span>
                    <strong>{airQuality.pm25} µg/m³</strong>
                  </div>
                  <div>
                    <span>PM10</span>
                    <strong>{airQuality.pm10} µg/m³</strong>
                  </div>
                  <div>
                    <span>Ozônio (O₃)</span>
                    <strong>{airQuality.ozone} µg/m³</strong>
                  </div>
                </div>
              </>
            ) : (
              <div className="smart-routes-empty">
                Carregando índice de qualidade do ar...
              </div>
            )}
          </article>
        </aside>

        {/* COLUNA PRINCIPAL: MAPA + ANÁLISE ESPACIAL + FEED EM GRADE */}
        <div className="smart-map-main-column">
          <section className="panel smart-map-canvas-panel">
            <div className="smart-map-toolbar">
              <div className="smart-map-toolbar-hint">
                <Crosshair size={13} />
                <span>
                  Clique em qualquer ponto ou ocorrência para cruzar linhas GTFS
                  no raio de 500m
                </span>
              </div>

              <div className="smart-map-toolbar-actions">
                <div
                  className="smart-basemap-switch"
                  role="group"
                  aria-label="Estilo do mapa"
                >
                  <button
                    type="button"
                    className={baseStyle === "clean" ? "active" : ""}
                    onClick={() => setBaseStyle("clean")}
                  >
                    Mapa claro
                  </button>
                  <button
                    type="button"
                    className={baseStyle === "osm" ? "active" : ""}
                    onClick={() => setBaseStyle("osm")}
                  >
                    Padrão OSM
                  </button>
                </div>

                <button
                  type="button"
                  className="smart-reset-btn"
                  onClick={() => setResetNonce((n) => n + 1)}
                  title="Recentralizar limite de Curitiba"
                >
                  <Compass size={13} />
                  <span>Curitiba</span>
                </button>
              </div>
            </div>

            <div className="smart-map-canvas">
              <MapContainer
                center={[-25.4284, -49.2733]}
                zoom={11}
                scrollWheelZoom
                className="city-map"
              >
                <TileLayer
                  key={baseStyle}
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  className={baseStyle === "clean" ? "smart-tiles-clean" : ""}
                />

                {boundary && <GeoJSON data={boundary} style={boundaryStyle} />}

                <MapController
                  boundary={boundary}
                  routeShape={selectedShape}
                  flyTarget={flyTarget}
                  resetNonce={resetNonce}
                  skipInitialBoundaryFit={Boolean(initialEvent)}
                  onMapClick={handleMapClick}
                />

                {/* Raio de influência de 500m do ponto ou evento inspecionado */}
                {inspected && (
                  <>
                    <Circle
                      center={[inspected.latitude, inspected.longitude]}
                      radius={INSPECTION_RADIUS_METERS}
                      pathOptions={{
                        color: "#244B40",
                        weight: 1.5,
                        dashArray: "5 5",
                        fillColor: "#587C69",
                        fillOpacity: 0.12,
                      }}
                    />
                    {inspected.type === "custom" && (
                      <CircleMarker
                        center={[inspected.latitude, inspected.longitude]}
                        radius={7}
                        pathOptions={{
                          color: "#FFFFFF",
                          weight: 2,
                          fillColor: "#173D35",
                          fillOpacity: 1,
                        }}
                      />
                    )}
                  </>
                )}

                {/* Traçado da linha de ônibus selecionada */}
                {selectedShape &&
                  selectedShape.shapes.map((shape, idx) => {
                    const firstCoord = shape.coordinates[0];
                    const lastCoord =
                      shape.coordinates[shape.coordinates.length - 1];

                    return (
                      <span key={shape.shapeId}>
                        <Polyline
                          positions={shape.coordinates}
                          pathOptions={{
                            color: idx === 0 ? "#173D35" : "#287CB5",
                            weight: 4,
                            opacity: 0.9,
                            dashArray:
                              shape.geometrySource === "stop_times.txt"
                                ? "6 6"
                                : undefined,
                          }}
                        >
                          <Popup>
                            <div className="map-popup">
                              <strong>
                                Linha {selectedShape.route.shortName} ·{" "}
                                {selectedShape.route.longName}
                              </strong>
                              <span>
                                {shape.headsign
                                  ? `Sentido: ${shape.headsign}`
                                  : "Itinerário cadastrado"}
                              </span>
                              <small>
                                Geometria via {shape.geometrySource} (GTFS
                                comunitário)
                              </small>
                            </div>
                          </Popup>
                        </Polyline>

                        {firstCoord && (
                          <CircleMarker
                            center={firstCoord}
                            radius={6}
                            pathOptions={{
                              color: "#FFFFFF",
                              weight: 2,
                              fillColor: "#173D35",
                              fillOpacity: 1,
                            }}
                          />
                        )}

                        {lastCoord && (
                          <CircleMarker
                            center={lastCoord}
                            radius={6}
                            pathOptions={{
                              color: "#FFFFFF",
                              weight: 2,
                              fillColor: "#287CB5",
                              fillOpacity: 1,
                            }}
                          />
                        )}
                      </span>
                    );
                  })}

                {/* Marcadores de eventos urbanos */}
                {filteredEvents.map((event) => (
                  <CircleMarker
                    key={event.id}
                    center={[event.latitude, event.longitude]}
                    radius={inspected?.event?.id === event.id ? 10 : 8}
                    eventHandlers={{
                      click: (e) => {
                        e.originalEvent.stopPropagation();
                        handleInspectEvent(event);
                      },
                    }}
                    pathOptions={{
                      color: "#FFFFFF",
                      weight: inspected?.event?.id === event.id ? 3 : 2,
                      fillColor: categoryColors[event.category],
                      fillOpacity: 0.95,
                    }}
                  >
                    <Popup>
                      <div className="map-popup">
                        <strong>
                          {event.neighborhood} · {event.conditionLabel}
                        </strong>
                        <span>
                          {categoryLabels[event.category]} ·{" "}
                          {riskLabels[event.severity]} ({event.time})
                        </span>
                        <p>{event.description}</p>
                        <small>
                          {event.isPredictive
                            ? "Predição automática (Open-Meteo + perfil urbano)"
                            : "Dados demonstrativos"}
                        </small>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}

                <TransitLayer visible={showStops} stops={stops} />
              </MapContainer>

              <div className="map-demo-label">
                Eventos: predição + demonstrativos · Linhas/Paradas: GTFS ·
                Clima/Ar: Open-Meteo
              </div>
            </div>

            {/* PAINEL DE ANÁLISE ESPACIAL (RAIO 500M) */}
            {inspected && (
              <div className="smart-inspection-bar">
                <div className="smart-inspection-top">
                  <div className="smart-inspection-main">
                    <div className="smart-inspection-title-row">
                      <strong>{inspected.title}</strong>
                      <span
                        className={
                          inspected.event?.isPredictive
                            ? "occurrence-predictive-badge"
                            : inspected.type === "event"
                              ? "panel-demo-badge"
                              : "smart-real-badge"
                        }
                      >
                        {inspected.event?.isPredictive
                          ? "Predição automática"
                          : inspected.type === "event"
                            ? "Evento demonstrativo"
                            : "Ponto geográfico"}
                      </span>
                      {inspected.neighborhood && (
                        <span className="smart-neighborhood-badge">
                          {inspected.neighborhood}
                        </span>
                      )}
                    </div>
                    <p>
                      {inspected.subtitle} · Coordenadas:{" "}
                      {inspected.latitude.toFixed(4)},{" "}
                      {inspected.longitude.toFixed(4)}
                    </p>
                  </div>

                  <div className="smart-inspection-metrics">
                    {nearbyLoading ? (
                      <span className="smart-routes-empty">
                        Cruzando paradas e linhas GTFS...
                      </span>
                    ) : (
                      nearbyImpact && (
                        <>
                          <div className="smart-inspection-stat">
                            <Navigation size={14} />
                            <div>
                              <strong>
                                {nearbyImpact.nearbyStopsCount}{" "}
                                {nearbyImpact.nearbyStopsCount === 1
                                  ? "parada"
                                  : "paradas"}{" "}
                                · {nearbyImpact.affectedRoutesCount}{" "}
                                {nearbyImpact.affectedRoutesCount === 1
                                  ? "linha"
                                  : "linhas"}{" "}
                                em 500m
                              </strong>
                              <span>
                                {nearbyImpact.nearestStop
                                  ? `Mais próxima: ${nearbyImpact.nearestStop.name} (${nearbyImpact.nearestStop.distance}m)`
                                  : "Nenhuma parada num raio de 1 km"}
                              </span>
                            </div>
                          </div>

                          {!showStops && nearbyImpact.nearbyStopsCount > 0 && (
                            <button
                              type="button"
                              className="smart-show-stops-btn"
                              onClick={() => setShowStops(true)}
                            >
                              Exibir paradas
                            </button>
                          )}
                        </>
                      )
                    )}

                    <button
                      type="button"
                      className="smart-inspection-close"
                      onClick={() => setInspected(null)}
                      aria-label="Fechar análise espacial"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                {!nearbyLoading &&
                  nearbyImpact &&
                  nearbyImpact.affectedRoutes.length > 0 && (
                    <div className="smart-affected-routes">
                      <span className="smart-affected-routes-label">
                        Linhas GTFS no raio de 500m (clique para traçar):
                      </span>
                      <div className="smart-affected-routes-chips">
                        {nearbyImpact.affectedRoutes
                          .slice(0, 14)
                          .map((route) => (
                            <button
                              key={route.id}
                              type="button"
                              className={`smart-affected-chip ${
                                selectedRouteId === route.id ? "active" : ""
                              }`}
                              onClick={() =>
                                setSelectedRouteId(
                                  selectedRouteId === route.id ? "" : route.id,
                                )
                              }
                              title={route.longName}
                            >
                              <strong>{route.shortName}</strong>
                              <span>{route.longName}</span>
                            </button>
                          ))}
                        {nearbyImpact.affectedRoutes.length > 14 && (
                          <span className="smart-affected-more">
                            +{nearbyImpact.affectedRoutes.length - 14} linhas
                          </span>
                        )}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </section>

          {/* FEED SINCRONIZADO DE OCORRÊNCIAS POR REGIÃO */}
          <section className="panel smart-occurrences-feed">
            <div className="panel-header">
              <div>
                <span className="panel-eyebrow">
                  MONITORAMENTO POR REGIÃO · SINCRONIZADO COM OS FILTROS
                </span>
                <h2>Condições e ocorrências em Curitiba</h2>
              </div>
              <span className="panel-demo-badge">Predição + Demonstração</span>
            </div>

            {filteredEvents.length === 0 ? (
              <div className="smart-routes-empty">
                Nenhuma ocorrência corresponde aos filtros selecionados no
                painel lateral.
              </div>
            ) : (
              <div className="occurrence-cards-list smart-map-occurrences-grid">
                {filteredEvents.map((event) => {
                  const isSelected = inspected?.event?.id === event.id;
                  const accentColor = riskAccentColors[event.severity];

                  return (
                    <button
                      key={event.id}
                      type="button"
                      className={`occurrence-row-card ${event.severity} ${
                        event.isPredictive ? "is-predictive" : ""
                      } ${isSelected ? "selected" : ""}`}
                      onClick={() => handleInspectEvent(event)}
                    >
                      <div className="occurrence-row-main">
                        <div className="occurrence-row-header">
                          <span
                            className="occurrence-row-dot"
                            style={{ backgroundColor: accentColor }}
                          />
                          <strong>{event.neighborhood}</strong>
                          <span className="occurrence-row-sep">•</span>
                          <span className="occurrence-row-condition">
                            {event.conditionLabel}
                          </span>
                          <span className="occurrence-row-category-tag">
                            {categoryLabels[event.category]}
                          </span>
                          {event.isPredictive && (
                            <span className="occurrence-predictive-badge">
                              <Sparkles size={11} />
                              <span>Predição automática</span>
                            </span>
                          )}
                        </div>

                        <p className="occurrence-row-description">
                          {event.description}
                        </p>
                      </div>

                      <div className="occurrence-row-aside">
                        <span className="occurrence-row-time">
                          <Clock size={12} />
                          <span>{event.time}</span>
                        </span>

                        <span className={`risk-pill-badge ${event.severity}`}>
                          {riskLabels[event.severity]}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
