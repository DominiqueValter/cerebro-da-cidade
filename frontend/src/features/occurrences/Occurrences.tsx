import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bus,
  CarFront,
  Check,
  CheckCircle2,
  Clock,
  CloudRain,
  Copy,
  Filter,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Siren,
  Sparkles,
  Waves,
  X,
} from "lucide-react";

import { urbanEvents } from "../overview/data/urbanEvents";
import type {
  UrbanEvent,
  UrbanEventCategory,
  UrbanEventSeverity,
} from "../overview/data/urbanEvents";
import { getPrecipitationContext } from "../../services/weather/weatherService";
import type { PrecipitationContext } from "../../services/weather/weatherService";
import { generatePredictiveOccurrences } from "../../services/prediction/predictiveOccurrences";
import {
  generateOccurrenceAiIdeas,
  type AiResolutionPlan,
} from "../../services/ai/occurrenceAdvisorService";

interface OccurrencesProps {
  onOpenInMap: (event: UrbanEvent) => void;
}

type CategoryFilter = "all" | UrbanEventCategory;
type SeverityFilter = "all" | UrbanEventSeverity;
type StatusFilter = "all" | "predictive" | "active" | "resolved";

const STORAGE_KEY_CUSTOM_EVENTS = "cerebro_custom_occurrences_v1";
const STORAGE_KEY_RESOLVED_IDS = "cerebro_resolved_occurrences_v1";

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

const riskLabels: Record<UrbanEventSeverity, string> = {
  low: "Risco Baixo",
  medium: "Risco Médio",
  high: "Risco Alto",
};

const CURITIBA_NEIGHBORHOOD_PRESETS: Array<{
  name: string;
  latitude: number;
  longitude: number;
}> = [
  { name: "Centro", latitude: -25.4302, longitude: -49.2718 },
  { name: "Alto Boqueirão", latitude: -25.5318, longitude: -49.2412 },
  { name: "Água Verde", latitude: -25.4548, longitude: -49.2816 },
  { name: "Batel", latitude: -25.4426, longitude: -49.2895 },
  { name: "Boqueirão", latitude: -25.5162, longitude: -49.2305 },
  { name: "Cabral", latitude: -25.4068, longitude: -49.2524 },
  { name: "Cajuru", latitude: -25.4482, longitude: -49.2165 },
  { name: "CIC (Cidade Industrial)", latitude: -25.4985, longitude: -49.3382 },
  { name: "Pinheirinho", latitude: -25.5124, longitude: -49.2958 },
  { name: "Portão", latitude: -25.4754, longitude: -49.2912 },
  { name: "Rebouças", latitude: -25.4375, longitude: -49.2594 },
  { name: "Santa Felicidade", latitude: -25.3992, longitude: -49.3364 },
];

function loadCustomEvents(): UrbanEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_EVENTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadResolvedIds(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RESOLVED_IDS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getCurrentTimeLabel(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function Occurrences({ onOpenInMap }: OccurrencesProps) {
  const [customEvents, setCustomEvents] =
    useState<UrbanEvent[]>(loadCustomEvents);
  const [resolvedIds, setResolvedIds] = useState<number[]>(loadResolvedIds);

  // Dados reais do Open-Meteo para alimentar o motor preditivo automático
  const [precipContext, setPrecipContext] =
    useState<PrecipitationContext | null>(null);
  const [simulateStorm, setSimulateStorm] = useState(false);

  // Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Formulário manual opcional
  const [formOpen, setFormOpen] = useState(false);
  const [neighborhood, setNeighborhood] = useState("Centro");
  const [category, setCategory] = useState<UrbanEventCategory>("traffic");
  const [severity, setSeverity] = useState<UrbanEventSeverity>("medium");
  const [conditionLabel, setConditionLabel] = useState("");
  const [description, setDescription] = useState("");

  // Assistente operacional IA
  const aiPanelRef = useRef<HTMLElement | null>(null);
  const [aiTargetEvent, setAiTargetEvent] = useState<UrbanEvent | null>(null);
  const [aiPlan, setAiPlan] = useState<AiResolutionPlan | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [copiedPlan, setCopiedPlan] = useState(false);

  async function handleAskAiForIdeas(event: UrbanEvent) {
    setAiTargetEvent(event);
    setAiPlan(null);
    setAiLoading(true);
    setCopiedPlan(false);

    requestAnimationFrame(() => {
      aiPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });

    const result = await generateOccurrenceAiIdeas(event);
    setAiPlan(result);
    setAiLoading(false);
  }

  function handleCopyAiPlan() {
    if (!aiTargetEvent || !aiPlan) return;
    const text = [
      `PROTOCOLO CCO CURITIBA — ${aiTargetEvent.neighborhood} (${aiTargetEvent.conditionLabel})`,
      `Diagnóstico: ${aiPlan.summary} | Janela estimada: ${aiPlan.estimatedResponseWindow}`,
      `\n1. Ações imediatas:\n${aiPlan.immediateActions.map((a) => `- ${a}`).join("\n")}`,
      `\n2. Mitigação de mobilidade:\n${aiPlan.mobilityMitigation.map((m) => `- ${m}`).join("\n")}`,
      `\n3. Órgãos acionados: ${aiPlan.agenciesToNotify.join(", ")}`,
    ].join("\n");

    navigator.clipboard?.writeText(text);
    setCopiedPlan(true);
    window.setTimeout(() => setCopiedPlan(false), 2200);
  }

  useEffect(() => {
    let cancelled = false;
    getPrecipitationContext()
      .then((data) => {
        if (!cancelled) setPrecipContext(data);
      })
      .catch((err) =>
        console.error("Erro ao alimentar motor preditivo com Open-Meteo:", err),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const predictiveEvents = useMemo(() => {
    return generatePredictiveOccurrences(precipContext, simulateStorm);
  }, [precipContext, simulateStorm]);

  const allEvents = useMemo(() => {
    return [...predictiveEvents, ...customEvents, ...urbanEvents];
  }, [predictiveEvents, customEvents]);

  const resolvedSet = useMemo(() => new Set(resolvedIds), [resolvedIds]);

  const stats = useMemo(() => {
    const active = allEvents.filter((e) => !resolvedSet.has(e.id));
    return {
      predictiveTotal: predictiveEvents.length,
      activeTotal: active.length,
      highRisk: active.filter((e) => e.severity === "high").length,
      traffic: active.filter((e) => e.category === "traffic").length,
      flood: active.filter((e) => e.category === "flood").length,
    };
  }, [allEvents, predictiveEvents.length, resolvedSet]);

  const filteredEvents = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();

    return allEvents.filter((event) => {
      const isResolved = resolvedSet.has(event.id);

      if (statusFilter === "predictive" && !event.isPredictive) return false;
      if (statusFilter === "active" && isResolved) return false;
      if (statusFilter === "resolved" && !isResolved) return false;

      if (categoryFilter !== "all" && event.category !== categoryFilter) {
        return false;
      }
      if (severityFilter !== "all" && event.severity !== severityFilter) {
        return false;
      }

      if (term) {
        const factorsText = (event.predictionFactors ?? []).join(" ");
        const haystack =
          `${event.neighborhood} ${event.conditionLabel} ${event.title} ${event.description} ${factorsText}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      return true;
    });
  }, [
    allEvents,
    resolvedSet,
    statusFilter,
    categoryFilter,
    severityFilter,
    searchQuery,
  ]);

  function toggleResolved(eventId: number) {
    setResolvedIds((prev) => {
      const next = prev.includes(eventId)
        ? prev.filter((id) => id !== eventId)
        : [...prev, eventId];
      localStorage.setItem(STORAGE_KEY_RESOLVED_IDS, JSON.stringify(next));
      return next;
    });
  }

  function handleCreateOccurrence(e: React.FormEvent) {
    e.preventDefault();

    const cleanCondition = conditionLabel.trim();
    const cleanDescription = description.trim();
    if (!cleanCondition || !cleanDescription) return;

    const preset =
      CURITIBA_NEIGHBORHOOD_PRESETS.find(
        (item) => item.name === neighborhood,
      ) ?? CURITIBA_NEIGHBORHOOD_PRESETS[0];

    const offset = ((customEvents.length % 5) - 2) * 0.0014;

    const newEvent: UrbanEvent = {
      id: Date.now(),
      title: `${cleanCondition} — ${preset.name}`,
      neighborhood: preset.name,
      conditionLabel: cleanCondition,
      time: getCurrentTimeLabel(),
      description: cleanDescription,
      category,
      severity,
      latitude: Number((preset.latitude + offset).toFixed(4)),
      longitude: Number((preset.longitude - offset).toFixed(4)),
    };

    const updated = [newEvent, ...customEvents];
    setCustomEvents(updated);
    localStorage.setItem(STORAGE_KEY_CUSTOM_EVENTS, JSON.stringify(updated));

    setConditionLabel("");
    setDescription("");
    setFormOpen(false);
    setStatusFilter("all");
  }

  function clearFilters() {
    setSearchQuery("");
    setCategoryFilter("all");
    setSeverityFilter("all");
    setStatusFilter("all");
  }

  const hasCustomFilters =
    searchQuery.trim() !== "" ||
    categoryFilter !== "all" ||
    severityFilter !== "all" ||
    statusFilter !== "all";

  return (
    <div className="occurrences-page">
      <section className="page-heading">
        <div>
          <span className="page-eyebrow">
            INTELIGÊNCIA PREDITIVA + MONITORAMENTO URBANO
          </span>
          <h1>Ocorrências</h1>
          <p>
            Cruza previsão horária (Open-Meteo), horários de pico e drenagem por
            bairro para antecipar riscos antes que aconteçam.
          </p>
        </div>

        <div className="occurrences-heading-actions">
          <button
            type="button"
            className={`occurrences-sim-btn ${simulateStorm ? "active" : ""}`}
            onClick={() => setSimulateStorm((prev) => !prev)}
            title="Testa como o motor preditivo reage a chuva forte às 16h/17h"
          >
            <CloudRain size={15} />
            <span>
              {simulateStorm
                ? "Simulação ativa (chuva 16h–17h)"
                : "Simular chuva no pico (17h)"}
            </span>
          </button>

          <button
            type="button"
            className="occurrences-primary-btn"
            onClick={() => setFormOpen((prev) => !prev)}
          >
            {formOpen ? <X size={15} /> : <Plus size={15} />}
            <span>{formOpen ? "Cancelar" : "Registro manual"}</span>
          </button>
        </div>
      </section>

      {/* FORMULÁRIO MANUAL OPCIONAL */}
      {formOpen && (
        <form
          className="panel occurrence-form-panel"
          onSubmit={handleCreateOccurrence}
        >
          <div className="panel-header">
            <div>
              <span className="panel-eyebrow">ENTRADA OPERACIONAL</span>
              <h2>Registrar ocorrência manualmente</h2>
            </div>
            <span className="panel-demo-badge">Salvo localmente</span>
          </div>

          <div className="occurrence-form-grid">
            <label className="occurrence-field">
              <span>Bairro</span>
              <select
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
              >
                {CURITIBA_NEIGHBORHOOD_PRESETS.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="occurrence-field">
              <span>Categoria</span>
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as UrbanEventCategory)
                }
              >
                <option value="traffic">Trânsito</option>
                <option value="flood">Alagamentos</option>
                <option value="incident">Ocorrências</option>
              </select>
            </label>

            <label className="occurrence-field">
              <span>Nível de risco</span>
              <select
                value={severity}
                onChange={(e) =>
                  setSeverity(e.target.value as UrbanEventSeverity)
                }
              >
                <option value="high">Risco Alto</option>
                <option value="medium">Risco Médio</option>
                <option value="low">Risco Baixo</option>
              </select>
            </label>

            <label className="occurrence-field">
              <span>Título / Condição</span>
              <input
                type="text"
                required
                placeholder="Ex: Retenção em canaleta do Expresso"
                value={conditionLabel}
                onChange={(e) => setConditionLabel(e.target.value)}
              />
            </label>

            <label className="occurrence-field occurrence-field-full">
              <span>Descrição operacional</span>
              <input
                type="text"
                required
                placeholder="Descreva o impacto viário, lâmina d'água ou orientação de desvio..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </div>

          <div className="occurrence-form-footer">
            <button
              type="button"
              className="occurrences-secondary-btn"
              onClick={() => setFormOpen(false)}
            >
              Fechar
            </button>
            <button type="submit" className="occurrences-primary-btn">
              <Plus size={15} />
              <span>Adicionar ao painel</span>
            </button>
          </div>
        </form>
      )}

      {/* CARDS DE RESUMO INTERATIVOS (CLIQUE PARA FILTRAR) */}
      <section className="occurrences-kpis">
        <button
          type="button"
          className={`panel occurrence-kpi-card occurrence-kpi-btn ${
            statusFilter === "predictive" ? "is-active" : ""
          }`}
          onClick={() =>
            setStatusFilter(
              statusFilter === "predictive" ? "all" : "predictive",
            )
          }
        >
          <div className="occurrence-kpi-top">
            <span>Alertas preditivos (IA)</span>
            <div className="metric-icon metric-icon-default">
              <Sparkles size={16} />
            </div>
          </div>
          <strong>{String(stats.predictiveTotal).padStart(2, "0")}</strong>
          <small>
            {simulateStorm
              ? "Cenário simulado (chuva 16h–17h)"
              : "Gerados via Open-Meteo"}
          </small>
        </button>

        <button
          type="button"
          className={`panel occurrence-kpi-card occurrence-kpi-btn ${
            severityFilter === "high" ? "is-active" : ""
          }`}
          onClick={() =>
            setSeverityFilter(severityFilter === "high" ? "all" : "high")
          }
        >
          <div className="occurrence-kpi-top">
            <span>Risco alto</span>
            <div className="metric-icon metric-icon-danger">
              <Siren size={16} />
            </div>
          </div>
          <strong>{String(stats.highRisk).padStart(2, "0")}</strong>
          <small>Prioridade preventiva e viária</small>
        </button>

        <button
          type="button"
          className={`panel occurrence-kpi-card occurrence-kpi-btn ${
            categoryFilter === "traffic" ? "is-active" : ""
          }`}
          onClick={() =>
            setCategoryFilter(categoryFilter === "traffic" ? "all" : "traffic")
          }
        >
          <div className="occurrence-kpi-top">
            <span>Trânsito</span>
            <div className="metric-icon metric-icon-warning">
              <CarFront size={16} />
            </div>
          </div>
          <strong>{String(stats.traffic).padStart(2, "0")}</strong>
          <small>Corredores e horários de pico</small>
        </button>

        <button
          type="button"
          className={`panel occurrence-kpi-card occurrence-kpi-btn ${
            categoryFilter === "flood" ? "is-active" : ""
          }`}
          onClick={() =>
            setCategoryFilter(categoryFilter === "flood" ? "all" : "flood")
          }
        >
          <div className="occurrence-kpi-top">
            <span>Alagamentos / Drenagem</span>
            <div className="metric-icon metric-icon-default">
              <Waves size={16} />
            </div>
          </div>
          <strong>{String(stats.flood).padStart(2, "0")}</strong>
          <small>Regiões com baixa permeabilidade</small>
        </button>
      </section>

      {/* BARRA DE FILTROS */}
      <section className="panel occurrences-filter-bar">
        <div className="occurrences-search">
          <Search size={15} />
          <input
            type="text"
            placeholder="Buscar por bairro, horário previsto ou fator de risco..."
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
          <div className="filter-pill-group" role="group" aria-label="Origem">
            {(
              [
                { id: "all", label: "Todas" },
                { id: "predictive", label: "Preditivas" },
                { id: "active", label: "Ativas" },
                { id: "resolved", label: "Resolvidas" },
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

          <div
            className="filter-pill-group"
            role="group"
            aria-label="Categoria"
          >
            {(
              [
                { id: "all", label: "Categorias" },
                { id: "traffic", label: "Trânsito" },
                { id: "flood", label: "Alagamentos" },
                { id: "incident", label: "Ocorrências" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                className={categoryFilter === item.id ? "active" : ""}
                onClick={() => setCategoryFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="filter-pill-group" role="group" aria-label="Risco">
            {(
              [
                { id: "all", label: "Todos riscos" },
                { id: "high", label: "Alto" },
                { id: "medium", label: "Médio" },
                { id: "low", label: "Baixo" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                className={severityFilter === item.id ? "active" : ""}
                onClick={() => setSeverityFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {hasCustomFilters && (
            <button
              type="button"
              className="occurrences-reset-filters"
              onClick={clearFilters}
              title="Limpar todos os filtros"
            >
              <Filter size={13} />
              <span>Limpar</span>
            </button>
          )}
        </div>
      </section>

      {/* PAINEL DE SUGESTÕES DE RESOLUÇÃO (IA) */}
      {aiTargetEvent && (
        <section ref={aiPanelRef} className="panel ai-advisor-panel">
          <div className="panel-header">
            <div>
              <span className="panel-eyebrow">
                ASSISTENTE OPERACIONAL IA ·{" "}
                {aiTargetEvent.neighborhood.toUpperCase()}
              </span>
              <h2>Protocolo sugerido: {aiTargetEvent.conditionLabel}</h2>
            </div>

            <div className="ai-advisor-header-actions">
              {aiPlan && (
                <button
                  type="button"
                  className="occurrence-action-btn"
                  onClick={handleCopyAiPlan}
                >
                  {copiedPlan ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedPlan ? "Copiado" : "Copiar plano"}</span>
                </button>
              )}

              <button
                type="button"
                className="occurrence-action-btn"
                onClick={() => setAiTargetEvent(null)}
              >
                <X size={13} />
                <span>Fechar</span>
              </button>
            </div>
          </div>

          {aiLoading ? (
            <div className="ai-advisor-loading">
              <Sparkles size={15} />
              <span>
                Cruzando dados meteorológicos, malha viária e linhas GTFS em
                500m...
              </span>
            </div>
          ) : (
            aiPlan && (
              <div className="ai-advisor-content">
                <div className="ai-advisor-summary-box">
                  <p className="ai-advisor-summary">
                    <strong>Diagnóstico:</strong> {aiPlan.summary}
                  </p>

                  <div className="ai-advisor-badges">
                    <span className="ai-window-badge">
                      <Clock size={12} />
                      Janela: {aiPlan.estimatedResponseWindow}
                    </span>

                    {typeof aiPlan.nearbyStopsCount === "number" && (
                      <span className="ai-gtfs-badge">
                        <Bus size={12} />
                        {aiPlan.nearbyStopsCount} paradas GTFS no raio
                      </span>
                    )}
                  </div>
                </div>

                <div className="ai-advisor-columns">
                  <div className="ai-advisor-card">
                    <h4>1. Ações imediatas</h4>
                    <ul>
                      {aiPlan.immediateActions.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="ai-advisor-card">
                    <h4>2. Mitigação de mobilidade</h4>
                    <ul>
                      {aiPlan.mobilityMitigation.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="ai-advisor-card">
                    <h4>3. Órgãos para acionar</h4>
                    <ul>
                      {aiPlan.agenciesToNotify.map((agency) => (
                        <li key={agency}>{agency}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {aiPlan.affectedGtfsRoutes &&
                  aiPlan.affectedGtfsRoutes.length > 0 && (
                    <div className="ai-affected-routes-strip">
                      <span>Linhas GTFS mapeadas no perímetro:</span>
                      <div className="ai-routes-chips">
                        {aiPlan.affectedGtfsRoutes.map((routeLabel: string) => (
                          <span key={routeLabel} className="ai-route-chip">
                            {routeLabel}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )
          )}
        </section>
      )}

      {/* LISTA DE OCORRÊNCIAS */}
      <section className="panel smart-occurrences-feed">
        <div className="panel-header">
          <div>
            <span className="panel-eyebrow">
              PREDIÇÕES AUTOMÁTICAS + REGISTROS MONITORADOS
            </span>
            <h2>
              {filteredEvents.length}{" "}
              {filteredEvents.length === 1
                ? "ocorrência encontrada"
                : "ocorrências encontradas"}
            </h2>
          </div>

          {simulateStorm && (
            <span className="occurrence-predictive-badge">
              Simulação de chuva às 16h–17h ativa
            </span>
          )}
        </div>

        {filteredEvents.length === 0 ? (
          <div className="smart-routes-empty">
            Nenhuma ocorrência corresponde aos filtros selecionados.
          </div>
        ) : (
          <div className="occurrence-cards-list">
            {filteredEvents.map((event) => {
              const Icon = categoryIcons[event.category];
              const color = categoryColors[event.category];
              const isResolved = resolvedSet.has(event.id);
              const isAiActive = aiTargetEvent?.id === event.id;

              return (
                <article
                  key={event.id}
                  className={`occurrence-row-card ${event.severity} ${
                    event.isPredictive ? "is-predictive" : ""
                  } ${isResolved ? "is-resolved" : ""}`}
                >
                  <div className="occurrence-row-main">
                    <div className="occurrence-row-header">
                      <span
                        className="alert-item-icon"
                        style={{
                          color,
                          backgroundColor: `${color}16`,
                        }}
                      >
                        <Icon size={14} strokeWidth={2} />
                      </span>

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
                          <span>
                            Predição automática
                            {event.confidencePercent
                              ? ` · ${event.confidencePercent}%`
                              : ""}
                          </span>
                        </span>
                      )}

                      {isResolved && (
                        <span className="occurrence-resolved-tag">
                          Resolvida
                        </span>
                      )}
                    </div>

                    <p className="occurrence-row-description">
                      {event.description}
                    </p>

                    {event.predictionFactors &&
                      event.predictionFactors.length > 0 && (
                        <div className="occurrence-factors-row">
                          {event.predictionFactors.map((factor) => (
                            <span
                              key={factor}
                              className="occurrence-factor-chip"
                            >
                              {factor}
                            </span>
                          ))}
                        </div>
                      )}
                  </div>

                  <div className="occurrence-row-actions">
                    <div className="occurrence-row-aside">
                      <span className="occurrence-row-time">
                        <Clock size={12} />
                        <span>{event.time}</span>
                      </span>

                      <span className={`risk-pill-badge ${event.severity}`}>
                        {riskLabels[event.severity]}
                      </span>
                    </div>

                    <div className="occurrence-row-buttons">
                      <button
                        type="button"
                        className="occurrence-action-btn"
                        onClick={() => onOpenInMap(event)}
                      >
                        <MapPin size={13} />
                        <span>Ver no mapa</span>
                      </button>

                      <button
                        type="button"
                        className={`occurrence-action-btn ${
                          isAiActive ? "resolve" : ""
                        }`}
                        onClick={() => handleAskAiForIdeas(event)}
                      >
                        <Sparkles size={13} />
                        <span>Ideias com IA</span>
                      </button>

                      {!event.isPredictive && (
                        <button
                          type="button"
                          className={`occurrence-action-btn ${
                            isResolved ? "" : "resolve"
                          }`}
                          onClick={() => toggleResolved(event.id)}
                        >
                          {isResolved ? (
                            <>
                              <RotateCcw size={13} />
                              <span>Reabrir</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={13} />
                              <span>Concluir</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
