import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  ArrowRight,
  CarFront,
  Waves,
  Siren,
  ShieldAlert,
  Navigation,
  Eye,
} from "lucide-react";

import { CityMap } from "../../components/dashboard/CityMap";
import { WeatherMetric } from "../../components/dashboard/WeatherMetric";
import { urbanEvents } from "../../features/overview/data/urbanEvents";
import { getCurrentWeather } from "../../services/weather/weatherService";
import {
  evaluateClimateRisk,
  calculateUrbanIndex,
} from "../../services/indicators/urbanIndicators";
import type { CurrentWeather } from "../../services/weather/weatherService";
import type {
  UrbanEvent,
  UrbanEventCategory,
} from "../../features/overview/data/urbanEvents";

interface OverviewProps {
  onExploreMap?: () => void;
  onViewOccurrences?: () => void;
}

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

const categoryIcons: Record<UrbanEventCategory, typeof CarFront> = {
  traffic: CarFront,
  flood: Waves,
  incident: Siren,
};

const severityLabels: Record<UrbanEvent["severity"], string> = {
  low: "Baixa",
  medium: "Moderada",
  high: "Alta",
};

const recentEvents = urbanEvents.slice(0, 3);

const eventCounts = {
  traffic: urbanEvents.filter((event) => event.category === "traffic").length,
  flood: urbanEvents.filter((event) => event.category === "flood").length,
  incident: urbanEvents.filter((event) => event.category === "incident").length,
};

const totalEvents =
  eventCounts.traffic + eventCounts.flood + eventCounts.incident;

function AlertsMetric() {
  return (
    <article className="metric-card dashboard-custom-card alerts-summary-card">
      <div className="custom-card-header">
        <div>
          <span className="metric-title">Alertas ativos</span>
          <div className="custom-card-value">
            {String(totalEvents).padStart(2, "0")}
          </div>
        </div>

        <div className="metric-icon metric-icon-warning">
          <AlertTriangle size={18} strokeWidth={1.8} />
        </div>
      </div>

      <div className="metric-description">
        <span className="metric-status metric-status-warning" />
        <span>Eventos em monitoramento</span>
      </div>

      <div className="alerts-summary-breakdown">
        {(Object.keys(categoryLabels) as UrbanEventCategory[]).map(
          (category) => {
            const Icon = categoryIcons[category];

            return (
              <div className="alerts-summary-item" key={category}>
                <div className="alerts-summary-value-row">
                  <span
                    className="alerts-summary-icon"
                    style={{
                      color: categoryColors[category],
                      backgroundColor: `${categoryColors[category]}16`,
                    }}
                  >
                    <Icon size={13} strokeWidth={2} />
                  </span>

                  <strong>
                    {String(eventCounts[category]).padStart(2, "0")}
                  </strong>
                </div>

                <span>{categoryLabels[category]}</span>
              </div>
            );
          },
        )}
      </div>

      <div className="custom-card-footer">
        <span>Dados demonstrativos</span>
        <span className="custom-card-footer-dot warning" />
      </div>
    </article>
  );
}

interface ClimateMetricProps {
  weather: CurrentWeather | null;
  loading: boolean;
  error: boolean;
}

function ClimateMetric({ weather, loading, error }: ClimateMetricProps) {
  if (loading) {
    return (
      <article className="metric-card dashboard-custom-card">
        <div className="custom-card-header">
          <div>
            <span className="metric-title">Condição climática</span>
            <div className="custom-card-value">--</div>
          </div>

          <div className="metric-icon metric-icon-default">
            <ShieldAlert size={18} strokeWidth={1.8} />
          </div>
        </div>

        <div className="custom-card-loading">Avaliando condições...</div>

        <div className="custom-card-footer">
          <span>Calculado · Open-Meteo</span>
          <span className="custom-card-footer-dot climate" />
        </div>
      </article>
    );
  }

  if (error || !weather) {
    return (
      <article className="metric-card dashboard-custom-card">
        <div className="custom-card-header">
          <div>
            <span className="metric-title">Condição climática</span>
            <div className="custom-card-value">--</div>
          </div>

          <div className="metric-icon metric-icon-default">
            <ShieldAlert size={18} strokeWidth={1.8} />
          </div>
        </div>

        <div className="custom-card-loading">Análise indisponível</div>

        <div className="custom-card-footer">
          <span>Calculado · Open-Meteo</span>
        </div>
      </article>
    );
  }

  const assessment = evaluateClimateRisk(weather);
  const iconClass =
    assessment.variant === "danger"
      ? "metric-icon-danger"
      : assessment.variant === "warning"
        ? "metric-icon-warning"
        : "metric-icon-default";

  const statusClass =
    assessment.variant === "danger"
      ? "metric-status-danger"
      : assessment.variant === "warning"
        ? "metric-status-warning"
        : "metric-status-default";

  return (
    <article className="metric-card dashboard-custom-card climate-summary-card">
      <div className="custom-card-header">
        <div>
          <span className="metric-title">Condição climática</span>

          <div className="custom-card-value">{assessment.riskLevel}</div>
        </div>

        <div className={`metric-icon ${iconClass}`}>
          <ShieldAlert size={18} strokeWidth={1.8} />
        </div>
      </div>

      <div className="metric-description">
        <span className={`metric-status ${statusClass}`} />
        <span>{assessment.summary}</span>
      </div>

      <div className="card-metrics-breakdown">
        <div className="card-metric-item">
          <div className="card-metric-value-row">
            <Navigation size={14} />
            <strong>{assessment.impacts.mobility}</strong>
          </div>
          <span>Mobilidade</span>
        </div>

        <div className="card-metric-item">
          <div className="card-metric-value-row">
            <Waves size={14} />
            <strong>{assessment.impacts.drainage}</strong>
          </div>
          <span>Drenagem</span>
        </div>

        <div className="card-metric-item">
          <div className="card-metric-value-row">
            <Eye size={14} />
            <strong>{assessment.impacts.visibility}</strong>
          </div>
          <span>Visibilidade</span>
        </div>
      </div>

      <div className="custom-card-footer">
        <span>Calculado · Open-Meteo</span>
        <span className="custom-card-footer-dot climate" />
      </div>
    </article>
  );
}

interface UrbanIndexMetricProps {
  weather: CurrentWeather | null;
}

function UrbanIndexMetric({ weather }: UrbanIndexMetricProps) {
  const indexResult = calculateUrbanIndex(urbanEvents, weather);

  const iconClass =
    indexResult.status.variant === "danger"
      ? "metric-icon-danger"
      : indexResult.status.variant === "warning"
        ? "metric-icon-warning"
        : "metric-icon-default";

  return (
    <article className="metric-card dashboard-custom-card urban-index-card">
      <div className="custom-card-header">
        <div>
          <span className="metric-title">Índice urbano</span>

          <div className="urban-index-value">
            {indexResult.score}
            <span>/100</span>
          </div>
        </div>

        <div className={`metric-icon ${iconClass}`}>
          <Activity size={18} strokeWidth={1.8} />
        </div>
      </div>

      <div className="metric-description">
        <span
          className={`urban-index-status-dot ${indexResult.status.variant}`}
        />
        <span>{indexResult.status.label} · 4 eixos ponderados</span>
      </div>

      <div className="urban-index-grid">
        {indexResult.subIndices.map((item) => (
          <div className="urban-index-item" key={item.key}>
            <div className="urban-index-item-header">
              <span>
                {item.label} ({Math.round(item.weight * 100)}%)
              </span>
              <strong>{item.score}</strong>
            </div>

            <div className="urban-index-bar">
              <span
                style={{
                  width: `${item.score}%`,
                  backgroundColor: item.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="custom-card-footer">
        <span>
          Híbrido · {indexResult.realSharePercent}% real /{" "}
          {indexResult.demonstrativeSharePercent}% demo
        </span>
        <span className="custom-card-footer-dot urban" />
      </div>
    </article>
  );
}

export function Overview({ onExploreMap, onViewOccurrences }: OverviewProps) {
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadWeather() {
      try {
        const data = await getCurrentWeather();

        if (!cancelled) {
          setWeather(data);
          setWeatherError(false);
        }
      } catch (err) {
        console.error("Erro ao carregar dados meteorológicos:", err);

        if (!cancelled) {
          setWeatherError(true);
        }
      } finally {
        if (!cancelled) {
          setWeatherLoading(false);
        }
      }
    }

    loadWeather();

    const interval = window.setInterval(loadWeather, 15 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="overview">
      <section className="page-heading">
        <div>
          <span className="page-eyebrow">CENTRAL DE INTELIGÊNCIA URBANA</span>

          <h1>Visão geral</h1>

          <p>
            Acompanhe as condições urbanas e os indicadores de monitoramento de
            Curitiba.
          </p>
        </div>

        <button className="date-button" type="button">
          <span className="date-button-dot" />
          <Activity size={15} />
          <span>Monitoramento atual</span>
        </button>
      </section>

      <section className="metrics-grid">
        <AlertsMetric />

        <WeatherMetric
          weather={weather}
          loading={weatherLoading}
          error={weatherError}
        />

        <ClimateMetric
          weather={weather}
          loading={weatherLoading}
          error={weatherError}
        />

        <UrbanIndexMetric weather={weather} />
      </section>

      <section className="main-dashboard-grid">
        <article className="panel map-panel">
          <div className="panel-header">
            <div>
              <span className="panel-eyebrow">VISUALIZAÇÃO GEOGRÁFICA</span>

              <h2>Mapa de monitoramento</h2>
            </div>

            <button
              className="panel-action"
              type="button"
              onClick={onExploreMap}
            >
              <span>Explorar mapa</span>
              <ArrowUpRight size={16} />
            </button>
          </div>

          <div className="map-container">
            <CityMap />
          </div>

          <div className="map-legend">
            <div className="legend-item">
              <span
                className="legend-dot"
                style={{ backgroundColor: "#D97732" }}
              />
              <span>Trânsito</span>
            </div>

            <div className="legend-item">
              <span
                className="legend-dot"
                style={{ backgroundColor: "#287CB5" }}
              />
              <span>Alagamentos</span>
            </div>

            <div className="legend-item">
              <span
                className="legend-dot"
                style={{ backgroundColor: "#B94D4D" }}
              />
              <span>Ocorrências</span>
            </div>

            <div className="legend-item">
              <span
                className="legend-dot"
                style={{ backgroundColor: "#244B40" }}
              />
              <span>Paradas de transporte</span>
            </div>
          </div>
        </article>

        <article className="panel alerts-panel">
          <div className="panel-header">
            <div>
              <span className="panel-eyebrow">ACOMPANHAMENTO</span>

              <h2>Alertas recentes</h2>
            </div>

            <span className="panel-demo-badge">Demonstração</span>
          </div>

          <div className="alerts-list">
            {recentEvents.map((event) => {
              const Icon = categoryIcons[event.category];
              const color = categoryColors[event.category];

              return (
                <div className="alert-item" key={event.id}>
                  <div className="alert-item-top">
                    <div className="alert-item-category">
                      <span
                        className="alert-item-icon"
                        style={{
                          color,
                          backgroundColor: `${color}15`,
                        }}
                      >
                        <Icon size={15} strokeWidth={1.9} />
                      </span>

                      <span>{categoryLabels[event.category]}</span>
                    </div>

                    <span className={`alert-severity-badge ${event.severity}`}>
                      {severityLabels[event.severity]}
                    </span>
                  </div>

                  <div className="alert-item-body">
                    <h3>{event.title}</h3>
                    <p>{event.description}</p>
                  </div>

                  <div className="alert-item-meta">
                    <span>Registro #{String(event.id).padStart(2, "0")}</span>
                    <span>
                      {event.latitude.toFixed(4)}, {event.longitude.toFixed(4)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            className="alerts-footer"
            type="button"
            onClick={onViewOccurrences}
          >
            <span>
              Ver todas as ocorrências ({String(totalEvents).padStart(2, "0")})
            </span>
            <ArrowRight size={16} />
          </button>
        </article>
      </section>

      <section className="panel activity-panel">
        <div className="panel-header">
          <div>
            <span className="panel-eyebrow">TRANSPARÊNCIA METODOLÓGICA</span>
            <h2>Origem dos dados e critérios de cálculo</h2>
          </div>
        </div>

        <div className="methodology-grid">
          <div className="methodology-item">
            <div className="methodology-item-header">
              <span className="methodology-dot real" />
              <strong>Dados reais conectados</strong>
            </div>
            <p>
              Meteorologia em tempo real (Open-Meteo), malha municipal de
              Curitiba (IBGE) e paradas/linhas do transporte coletivo (feed GTFS
              comunitário).
            </p>
          </div>

          <div className="methodology-item">
            <div className="methodology-item-header">
              <span className="methodology-dot calculated" />
              <strong>Indicadores calculados</strong>
            </div>
            <p>
              Risco climático derivado de precipitação, vento e código WMO;
              Índice Urbano composto por Clima (30%), Drenagem (30%), Mobilidade
              (25%) e Ocorrências (15%).
            </p>
          </div>

          <div className="methodology-item">
            <div className="methodology-item-header">
              <span className="methodology-dot demo" />
              <strong>Camada demonstrativa</strong>
            </div>
            <p>
              Os {totalEvents} eventos urbanos georreferenciados no mapa e nos
              alertas simulam registros operacionais até a conexão com fontes
              oficiais de ocorrências.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}