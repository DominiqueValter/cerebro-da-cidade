import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BellRing,
  Bookmark,
  BookmarkCheck,
  Bus,
  CloudRain,
  Navigation,
  ShieldCheck,
  Waves,
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

  // Consulta linhas GTFS na origem e destino selecionados
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

  // Cálculo simplificado e claro do risco de alagamento para o cidadão
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
        label: "Atenção: Risco Alto de Alagamento",
        advice:
          "Evite ruas próximas a córregos e fundos de vale. Prefira vias de cota mais alta.",
      };
    }
    if (score >= 42) {
      return {
        score,
        level: "medium" as const,
        label: "Risco Moderado de Acúmulo de Água",
        advice:
          "Possibilidade de poças em cruzamentos planos caso a chuva aperte.",
      };
    }
    return {
      score,
      level: "low" as const,
      label: "Situação Normal / Risco Baixo",
      advice: "Boa drenagem e sem indícios de alagamento na região.",
    };
  }, [currentRegion, neighborhoodWeather]);

  // Diagnóstico da rota escolhida (Origem -> Destino)
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

    // Linhas em comum entre origem e destino (ou linhas atendendo o trajeto)
    const destIds = new Set(
      (destTransit?.affectedRoutes ?? []).map((r) => r.id),
    );
    const directLines = (originTransit?.affectedRoutes ?? []).filter((r) =>
      destIds.has(r.id),
    );
    const displayLines =
      directLines.length > 0
        ? directLines.slice(0, 6)
        : (originTransit?.affectedRoutes ?? []).slice(0, 6);

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

  // Alertas personalizados dos bairros salvos pelo usuário
  const savedAlerts = useMemo(() => {
    return allOccurrences.filter((ev) =>
      savedNeighborhoods.some(
        (saved) =>
          ev.neighborhood.toLowerCase().includes(saved.toLowerCase()) ||
          saved.toLowerCase().includes(ev.neighborhood.toLowerCase()),
      ),
    );
  }, [allOccurrences, savedNeighborhoods]);

  const isCurrentSaved = savedNeighborhoods.includes(selectedNeighborhood);

  return (
    <div className="citizen-portal">
      <section className="page-heading">
        <div>
          <span className="page-eyebrow">
            PORTAL DO CIDADÃO · BEM-VINDO(A), {user.name.toUpperCase()}
          </span>
          <h1>Como está sua região e sua rota hoje?</h1>
          <p>
            Acompanhe o risco de alagamento por bairro, verifique possíveis
            atrasos no seu trajeto e salve seus bairros para receber alertas.
          </p>
        </div>
      </section>

      {/* 1. CONSULTA DE ALAGAMENTO POR BAIRRO + SALVAR PARA ALERTAS */}
      <section className="panel citizen-card">
        <div className="panel-header">
          <div>
            <span className="panel-eyebrow">
              ÍNDICE DE ALAGAMENTO · {currentRegion.watershed.toUpperCase()}
            </span>
            <h2>Consultar condição do bairro</h2>
          </div>

          <div className="regional-selector-controls">
            <label className="regional-select-box">
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
              className={`occurrences-primary-btn ${isCurrentSaved ? "saved-active" : ""}`}
              onClick={() => onToggleSaveNeighborhood(selectedNeighborhood)}
            >
              {isCurrentSaved ? (
                <>
                  <BookmarkCheck size={15} />
                  <span>Bairro salvo nos alertas</span>
                </>
              ) : (
                <>
                  <Bookmark size={15} />
                  <span>Salvar bairro para alertas</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="citizen-flood-grid">
          <div className={`citizen-status-box ${floodAssessment.level}`}>
            <div className="citizen-status-top">
              <Waves size={18} />
              <span className={`risk-pill-badge ${floodAssessment.level}`}>
                Índice {floodAssessment.score}%
              </span>
            </div>
            <strong>{floodAssessment.label}</strong>
            <p>{floodAssessment.advice}</p>
          </div>

          <div className="citizen-weather-box">
            <div>
              <span>Chuva prevista (próximas 6h)</span>
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

            <div>
              <span>Característica local</span>
              <strong>{currentRegion.regional}</strong>
              <small>{currentRegion.soilNote}</small>
            </div>
          </div>
        </div>
      </section>

      {/* 2. VERIFICADOR DE ROTA E POSSÍVEIS ATRASOS / ALAGAMENTOS */}
      <section className="panel citizen-card">
        <div className="panel-header">
          <div>
            <span className="panel-eyebrow">
              PLANEJAMENTO DE DESLOCAMENTO · CARRO OU ÔNIBUS
            </span>
            <h2>Verificar minha rota</h2>
          </div>
          <Navigation size={16} color="#244B40" />
        </div>

        <div className="citizen-route-selectors">
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

          <div className="citizen-route-arrow">
            <ArrowRight size={18} />
          </div>

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
          className={`citizen-route-result ${
            routeCheck.hasFlood
              ? "high"
              : routeCheck.hasProblems
                ? "medium"
                : "low"
          }`}
        >
          <div className="citizen-route-result-head">
            {routeCheck.hasProblems ? (
              <AlertTriangle size={18} />
            ) : (
              <ShieldCheck size={18} />
            )}
            <strong>
              {routeCheck.hasFlood
                ? `Alerta de alagamento no trajeto ${originNeighborhood} → ${destinationNeighborhood}`
                : routeCheck.hasHighTraffic
                  ? `Possível lentidão ou atraso entre ${originNeighborhood} e ${destinationNeighborhood}`
                  : `Trajeto livre entre ${originNeighborhood} e ${destinationNeighborhood}`}
            </strong>
          </div>

          {routeCheck.routeEvents.length > 0 ? (
            <ul className="citizen-route-events">
              {routeCheck.routeEvents.map((ev) => (
                <li key={ev.id}>
                  <strong>
                    {ev.neighborhood} ({ev.conditionLabel}):
                  </strong>{" "}
                  {ev.description}
                </li>
              ))}
            </ul>
          ) : (
            <p className="citizen-route-ok-text">
              Nenhuma ocorrência de alagamento ou bloqueio ativo registrada
              neste eixo no momento.
            </p>
          )}

          <div className="citizen-gtfs-box">
            <span className="citizen-gtfs-title">
              <Bus size={13} />{" "}
              {routeCheck.hasDirectConnection
                ? "Linhas de ônibus que conectam a região:"
                : "Principais linhas atendendo o ponto de partida:"}
            </span>

            <div className="risk-transit-chips">
              {routeLoading ? (
                <span className="smart-routes-empty">
                  Consultando linhas de ônibus...
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

      {/* 3. MEUS BAIRROS SALVOS & CENTRAL DE ALERTAS */}
      <section className="panel citizen-card">
        <div className="panel-header">
          <div>
            <span className="panel-eyebrow">
              NOTIFICAÇÕES PERSONALIZADAS · {savedNeighborhoods.length}{" "}
              BAIRRO(S) MONITORADO(S)
            </span>
            <h2>Meus bairros e alertas ativos</h2>
          </div>
          <BellRing size={16} color="#244B40" />
        </div>

        <div className="citizen-saved-chips">
          {savedNeighborhoods.length === 0 ? (
            <span className="smart-routes-empty">
              Você ainda não salvou nenhum bairro. Selecione um bairro acima e
              clique em &quot;Salvar bairro para alertas&quot;.
            </span>
          ) : (
            savedNeighborhoods.map((name) => (
              <span key={name} className="citizen-saved-pill">
                <Bell size={12} />
                <strong>{name}</strong>
                <button
                  type="button"
                  onClick={() => onToggleSaveNeighborhood(name)}
                  title="Remover alerta deste bairro"
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>

        <div className="citizen-alerts-list">
          {savedAlerts.length === 0 ? (
            <div className="citizen-no-alerts">
              <CloudRain size={15} />
              <span>
                Tudo tranquilo! Nenhuma ocorrência ativa nos seus bairros salvos
                no momento.
              </span>
            </div>
          ) : (
            savedAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`citizen-alert-banner ${alert.severity}`}
              >
                <div>
                  <strong>
                    Alerta em {alert.neighborhood} · {alert.conditionLabel}
                  </strong>
                  <p>{alert.description}</p>
                </div>
                <span className={`risk-pill-badge ${alert.severity}`}>
                  {alert.time}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
