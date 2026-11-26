import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  BellRing,
  Bookmark,
  BookmarkCheck,
  Bus,
  CloudRain,
  Droplets,
  MapPin,
  Navigation,
  PhoneCall,
  ShieldCheck,
  Thermometer,
  Waves,
  X,
} from "lucide-react";

import {
  CURITIBA_NEIGHBORHOODS,
  CURITIBA_REGIONALS,
} from "../risk-analysis/data/curitibaNeighborhoods";
import { urbanEvents } from "../overview/data/urbanEvents";
import {
  getPrecipitationContext,
  getRegionalWeatherSnapshot,
  type PrecipitationContext,
  type RegionalWeatherSnapshot,
} from "../../services/weather/weatherService";
import { generatePredictiveOccurrences } from "../../services/prediction/predictiveOccurrences";
import { getNearbyTransitImpact } from "../../services/mobility/transitService";
import type { NearbyTransitImpact } from "../../services/mobility/transitService";
import type { AuthUser } from "../auth/LoginScreen";

interface CitizenPortalProps {
  user: AuthUser;
  savedNeighborhoods: string[];
  onToggleSaveNeighborhood: (neighborhood: string) => void;
}

const riskAccentColors = {
  high: "#E12D53",
  medium: "#E3962D",
  low: "#4E7861",
};

export function CitizenPortal({
  user,
  savedNeighborhoods,
  onToggleSaveNeighborhood,
}: CitizenPortalProps) {
  const [selectedNeighborhood, setSelectedNeighborhood] =
    useState<string>("Portão");
  const [originNeighborhood, setOriginNeighborhood] =
    useState<string>("Portão");
  const [destinationNeighborhood, setDestinationNeighborhood] =
    useState<string>("Centro");

  const [precipContext, setPrecipContext] =
    useState<PrecipitationContext | null>(null);
  const [neighborhoodWeather, setNeighborhoodWeather] =
    useState<RegionalWeatherSnapshot | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const [originTransit, setOriginTransit] =
    useState<NearbyTransitImpact | null>(null);
  const [destTransit, setDestTransit] = useState<NearbyTransitImpact | null>(
    null,
  );
  const [routeLoading, setRouteLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPrecipitationContext()
      .then((data) => {
        if (!cancelled) setPrecipContext(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const currentRegion = useMemo(
    () =>
      CURITIBA_NEIGHBORHOODS.find((n) => n.name === selectedNeighborhood) ??
      CURITIBA_NEIGHBORHOODS[0],
    [selectedNeighborhood],
  );

  useEffect(() => {
    let cancelled = false;
    setWeatherLoading(true);
    getRegionalWeatherSnapshot(currentRegion.latitude, currentRegion.longitude)
      .then((data) => {
        if (!cancelled) setNeighborhoodWeather(data);
      })
      .catch(() => {
        if (!cancelled) setNeighborhoodWeather(null);
      })
      .finally(() => {
        if (!cancelled) setWeatherLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentRegion.latitude, currentRegion.longitude]);

  useEffect(() => {
    const orig = CURITIBA_NEIGHBORHOODS.find(
      (n) => n.name === originNeighborhood,
    );
    const dest = CURITIBA_NEIGHBORHOODS.find(
      (n) => n.name === destinationNeighborhood,
    );
    if (!orig || !dest) return;

    let cancelled = false;
    setRouteLoading(true);

    Promise.all([
      getNearbyTransitImpact(orig.latitude, orig.longitude, 600).catch(
        () => null,
      ),
      getNearbyTransitImpact(dest.latitude, dest.longitude, 600).catch(
        () => null,
      ),
    ])
      .then(([oData, dData]) => {
        if (cancelled) return;
        setOriginTransit(oData);
        setDestTransit(dData);
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [originNeighborhood, destinationNeighborhood]);

  const allOccurrences = useMemo(() => {
    const predictive = generatePredictiveOccurrences(precipContext, false);
    return [...predictive, ...urbanEvents];
  }, [precipContext]);

  const floodAssessment = useMemo(() => {
    const rain6h = neighborhoodWeather?.next6HoursTotalMm ?? 0;
    const tierScore =
      currentRegion.historicalFloodTier === "critical"
        ? 45
        : currentRegion.historicalFloodTier === "high"
          ? 34
          : currentRegion.historicalFloodTier === "moderate"
            ? 22
            : 10;

    const score = Math.min(
      100,
      Math.round(currentRegion.baseDrainage * 0.65 + tierScore + rain6h * 5),
    );

    if (score >= 65) {
      return {
        score,
        level: "high" as const,
        label: "Risco Alto de Alagamento",
        advice:
          "Evite ruas próximas a córregos e fundos de vale. Prefira vias mais altas.",
      };
    }
    if (score >= 42) {
      return {
        score,
        level: "medium" as const,
        label: "Risco Moderado de Acúmulo",
        advice:
          "Possibilidade de poças em cruzamentos planos caso a chuva aumente.",
      };
    }
    return {
      score,
      level: "low" as const,
      label: "Situação Normal · Risco Baixo",
      advice: "Boa drenagem e sem indícios de alagamento na região.",
    };
  }, [currentRegion, neighborhoodWeather]);

  const routeCheck = useMemo(() => {
    const routeEvents = allOccurrences.filter(
      (ev) =>
        ev.neighborhood
          .toLowerCase()
          .includes(originNeighborhood.toLowerCase()) ||
        originNeighborhood
          .toLowerCase()
          .includes(ev.neighborhood.toLowerCase()) ||
        ev.neighborhood
          .toLowerCase()
          .includes(destinationNeighborhood.toLowerCase()) ||
        destinationNeighborhood
          .toLowerCase()
          .includes(ev.neighborhood.toLowerCase()),
    );

    const hasFlood = routeEvents.some((e) => e.category === "flood");
    const hasHighTraffic = routeEvents.some(
      (e) => e.severity === "high" || e.category === "traffic",
    );

    const destIds = new Set(
      (destTransit?.affectedRoutes ?? []).map((r) => r.id),
    );
    const directLines = (originTransit?.affectedRoutes ?? []).filter((r) =>
      destIds.has(r.id),
    );
    const displayLines =
      directLines.length > 0
        ? directLines.slice(0, 5)
        : (originTransit?.affectedRoutes ?? []).slice(0, 5);

    return {
      routeEvents,
      hasFlood,
      hasHighTraffic,
      hasProblems: routeEvents.length > 0,
      displayLines,
      hasDirectConnection: directLines.length > 0,
    };
  }, [
    allOccurrences,
    originNeighborhood,
    destinationNeighborhood,
    originTransit,
    destTransit,
  ]);

  const savedAlerts = useMemo(() => {
    return allOccurrences.filter((ev) =>
      savedNeighborhoods.some(
        (saved) =>
          ev.neighborhood.toLowerCase().includes(saved.toLowerCase()) ||
          saved.toLowerCase().includes(ev.neighborhood.toLowerCase()),
      ),
    );
  }, [allOccurrences, savedNeighborhoods]);

  function handleSwapRoute() {
    setOriginNeighborhood(destinationNeighborhood);
    setDestinationNeighborhood(originNeighborhood);
  }

  const isCurrentSaved = savedNeighborhoods.includes(selectedNeighborhood);

  return (
    <div className="cp-page">
      <section className="page-heading">
        <div>
          <span className="page-eyebrow">
            PORTAL DO CIDADÃO · BEM-VINDO(A), {user.name.toUpperCase()}
          </span>
          <h1>Como está sua região e sua rota hoje?</h1>
          <p>
            Acompanhe o risco de alagamento por bairro, planeje seu deslocamento
            e gerencie seus alertas locais.
          </p>
        </div>

        <div className="smart-map-header-badges">
          <div className="smart-map-summary-pill">
            <Bell size={14} />
            <span>
              {savedNeighborhoods.length}{" "}
              {savedNeighborhoods.length === 1
                ? "bairro monitorado"
                : "bairros monitorados"}
            </span>
          </div>

          <div className="smart-map-summary-pill">
            <AlertTriangle size={14} />
            <span>
              {savedAlerts.length}{" "}
              {savedAlerts.length === 1 ? "alerta ativo" : "alertas ativos"}
            </span>
          </div>
        </div>
      </section>

      <div className="cp-grid">
        {/* COLUNA PRINCIPAL */}
        <div className="cp-main">
          {/* CARD 1: CONDIÇÃO DO BAIRRO */}
          <section className="panel cp-panel">
            <div className="panel-header">
              <div>
                <span className="panel-eyebrow">
                  ÍNDICE DE ALAGAMENTO · {currentRegion.watershed.toUpperCase()}
                </span>
                <h2>Condição atual em {selectedNeighborhood}</h2>
              </div>

              <div className="regional-selector-controls">
                <label className="regional-select-box">
                  <MapPin size={14} />
                  <select
                    value={selectedNeighborhood}
                    onChange={(e) => setSelectedNeighborhood(e.target.value)}
                    aria-label="Escolher bairro"
                  >
                    {CURITIBA_REGIONALS.map((reg) => (
                      <optgroup key={reg} label={reg}>
                        {CURITIBA_NEIGHBORHOODS.filter(
                          (n) => n.regional === reg,
                        ).map((n) => (
                          <option key={n.name} value={n.name}>
                            {n.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  className={`occurrences-primary-btn ${
                    isCurrentSaved ? "saved-active" : ""
                  }`}
                  onClick={() => onToggleSaveNeighborhood(selectedNeighborhood)}
                >
                  {isCurrentSaved ? (
                    <>
                      <BookmarkCheck size={15} />
                      <span>Salvo nos alertas</span>
                    </>
                  ) : (
                    <>
                      <Bookmark size={15} />
                      <span>Salvar bairro</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="cp-condition-grid">
              <div className={`cp-risk-card ${floodAssessment.level}`}>
                <div className="cp-risk-card-top">
                  <span className="cp-risk-tag">
                    <Waves size={15} />
                    <span>Drenagem urbana</span>
                  </span>
                  <span className={`risk-pill-badge ${floodAssessment.level}`}>
                    Risco {floodAssessment.score}%
                  </span>
                </div>

                <strong>{floodAssessment.label}</strong>

                <div className="urban-index-bar">
                  <span
                    style={{
                      width: `${floodAssessment.score}%`,
                      backgroundColor: riskAccentColors[floodAssessment.level],
                    }}
                  />
                </div>

                <p>{floodAssessment.advice}</p>
              </div>

              <div className="cp-metrics-stack">
                <div className="cp-metric-box">
                  <div className="cp-metric-head">
                    <span>Chuva prevista (próximas 6h)</span>
                    <Droplets size={14} />
                  </div>
                  <strong>
                    {weatherLoading
                      ? "..."
                      : `${neighborhoodWeather?.next6HoursTotalMm ?? 0} mm`}
                  </strong>
                  <small>
                    Probabilidade máx.:{" "}
                    {neighborhoodWeather?.maxNext6HoursProb ?? 0}%
                  </small>
                </div>

                <div className="cp-metric-box">
                  <div className="cp-metric-head">
                    <span>Clima agora · Regional {currentRegion.regional}</span>
                    <Thermometer size={14} />
                  </div>
                  <strong>
                    {weatherLoading
                      ? "..."
                      : `${neighborhoodWeather?.temperatureC ?? 19}°C`}
                  </strong>
                  <small>{currentRegion.soilNote}</small>
                </div>
              </div>
            </div>
          </section>

          {/* CARD 2: VERIFICADOR DE ROTA */}
          <section className="panel cp-panel">
            <div className="panel-header">
              <div>
                <span className="panel-eyebrow">
                  PLANEJAMENTO DE DESLOCAMENTO · CARRO OU ÔNIBUS
                </span>
                <h2>Verificar minha rota</h2>
              </div>
              <Navigation size={16} color="#244B40" />
            </div>

            <div className="cp-route-inputs">
              <label className="occurrence-field">
                <span>Bairro de saída (Origem)</span>
                <select
                  value={originNeighborhood}
                  onChange={(e) => setOriginNeighborhood(e.target.value)}
                >
                  {CURITIBA_NEIGHBORHOODS.map((n) => (
                    <option key={n.name} value={n.name}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="cp-swap-btn"
                onClick={handleSwapRoute}
                title="Inverter origem e destino"
                aria-label="Inverter origem e destino"
              >
                <ArrowLeftRight size={15} />
              </button>

              <label className="occurrence-field">
                <span>Bairro de chegada (Destino)</span>
                <select
                  value={destinationNeighborhood}
                  onChange={(e) => setDestinationNeighborhood(e.target.value)}
                >
                  {CURITIBA_NEIGHBORHOODS.map((n) => (
                    <option key={n.name} value={n.name}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div
              className={`cp-route-banner ${
                routeCheck.hasFlood
                  ? "high"
                  : routeCheck.hasProblems
                    ? "medium"
                    : "low"
              }`}
            >
              <div className="cp-route-banner-head">
                {routeCheck.hasProblems ? (
                  <AlertTriangle size={17} />
                ) : (
                  <ShieldCheck size={17} />
                )}
                <strong>
                  {routeCheck.hasFlood
                    ? `Alerta de alagamento no trajeto ${originNeighborhood} → ${destinationNeighborhood}`
                    : routeCheck.hasHighTraffic
                      ? `Lentidão prevista entre ${originNeighborhood} e ${destinationNeighborhood}`
                      : `Trajeto livre entre ${originNeighborhood} e ${destinationNeighborhood}`}
                </strong>
              </div>

              {routeCheck.routeEvents.length > 0 ? (
                <div className="cp-route-items">
                  {routeCheck.routeEvents.slice(0, 3).map((ev) => (
                    <div key={ev.id} className="cp-route-item">
                      <div className="cp-route-item-top">
                        <strong>
                          {ev.neighborhood} · {ev.conditionLabel}
                        </strong>
                        <span className={`risk-pill-badge ${ev.severity}`}>
                          {ev.time}
                        </span>
                      </div>
                      <p>{ev.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="cp-route-clean">
                  Nenhuma ocorrência de alagamento ou bloqueio ativo neste eixo
                  no momento.
                </p>
              )}

              <div className="cp-gtfs-strip">
                <span className="cp-gtfs-label">
                  <Bus size={13} />
                  <span>
                    {routeCheck.hasDirectConnection
                      ? "Linhas que conectam a região:"
                      : "Principais linhas próximas à saída:"}
                  </span>
                </span>

                <div className="risk-transit-chips">
                  {routeLoading ? (
                    <span className="smart-routes-empty">
                      Consultando linhas...
                    </span>
                  ) : routeCheck.displayLines.length > 0 ? (
                    routeCheck.displayLines.map((line) => (
                      <span key={line.id} className="risk-transit-chip">
                        <Bus size={11} />
                        <strong>{line.shortName}</strong>
                        <span>{line.longName}</span>
                      </span>
                    ))
                  ) : (
                    <span className="smart-routes-empty">
                      Consulte o terminal integrado mais próximo.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* SIDEBAR DIREITA */}
        <aside className="cp-sidebar">
          <section className="panel cp-sidebar-panel">
            <div className="cp-sidebar-head">
              <div>
                <span className="panel-eyebrow">
                  {savedNeighborhoods.length} BAIRRO(S) MONITORADO(S)
                </span>
                <h2>Meus alertas</h2>
              </div>
              <BellRing size={16} color="#244B40" />
            </div>

            <div className="cp-saved-list">
              <span className="cp-section-label">
                Bairros salvos (clique para consultar)
              </span>

              {savedNeighborhoods.length === 0 ? (
                <p className="cp-empty-note">
                  Nenhum bairro salvo. Clique em &quot;Salvar bairro&quot; ao
                  lado para receber alertas.
                </p>
              ) : (
                <div className="cp-saved-pills">
                  {savedNeighborhoods.map((name) => {
                    const isViewing = name === selectedNeighborhood;
                    return (
                      <div
                        key={name}
                        className={`cp-saved-pill ${isViewing ? "active" : ""}`}
                      >
                        <button
                          type="button"
                          className="cp-saved-pill-btn"
                          onClick={() => setSelectedNeighborhood(name)}
                        >
                          <Bell size={11} />
                          <span>{name}</span>
                        </button>
                        <button
                          type="button"
                          className="cp-saved-pill-remove"
                          onClick={() => onToggleSaveNeighborhood(name)}
                          aria-label={`Remover ${name}`}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="cp-divider" />

            <div className="cp-alerts-section">
              <span className="cp-section-label">
                Avisos ativos ({savedAlerts.length})
              </span>

              {savedAlerts.length === 0 ? (
                <div className="cp-all-clear">
                  <CloudRain size={15} />
                  <span>
                    Tudo tranquilo! Nenhuma ocorrência ativa nos seus bairros
                    salvos.
                  </span>
                </div>
              ) : (
                <div className="cp-alerts-cards">
                  {savedAlerts.map((alert) => (
                    <article
                      key={alert.id}
                      className={`cp-alert-card ${alert.severity}`}
                    >
                      <div className="cp-alert-card-top">
                        <strong>{alert.neighborhood}</strong>
                        <span className={`risk-pill-badge ${alert.severity}`}>
                          {alert.time}
                        </span>
                      </div>
                      <span className="cp-alert-card-title">
                        {alert.conditionLabel}
                      </span>
                      <p>{alert.description}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="panel cp-sidebar-panel">
            <div className="cp-sidebar-head">
              <div>
                <span className="panel-eyebrow">SERVIÇOS PÚBLICOS</span>
                <h2>Telefones úteis</h2>
              </div>
              <PhoneCall size={15} color="#244B40" />
            </div>

            <ul className="cp-emergency-list">
              <li>
                <strong>156</strong>
                <span>Prefeitura (alagamentos e queda de árvores)</span>
              </li>
              <li>
                <strong>199</strong>
                <span>Defesa Civil (áreas de risco e emergências)</span>
              </li>
              <li>
                <strong>193</strong>
                <span>Corpo de Bombeiros / SIATE</span>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
