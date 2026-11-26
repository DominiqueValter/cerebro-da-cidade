import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Polygon,
  CircleMarker,
  Popup,
} from "react-leaflet";
import type { PathOptions } from "leaflet";

interface KoppenZone {
  id: string;
  code: string;
  name: string;
  description: string;
  color: string;
  positions: [number, number][];
}

// Zonas climáticas de Köppen-Geiger no Paraná e Região Metropolitana de Curitiba
const PARANA_KOPPEN_ZONES: KoppenZone[] = [
  {
    id: "cfb-planalto",
    code: "Cfb",
    name: "Subtropical Úmido Mesotérmico (Primeiro e Segundo Planaltos)",
    description:
      "Verões amenos (média < 22°C), invernos frescos com geadas ocasionais e chuvas bem distribuídas o ano todo (sem estação seca). Abrange Curitiba e RMC.",
    color: "#2E7D5B",
    positions: [
      [-24.25, -51.45],
      [-24.25, -48.95],
      [-25.15, -48.88],
      [-25.95, -48.92],
      [-26.55, -51.65],
      [-25.65, -51.85],
    ],
  },
  {
    id: "cfa-litoral",
    code: "Cfa",
    name: "Subtropical Úmido com Verão Quente (Planície Litorânea)",
    description:
      "Temperaturas médias do mês mais quente acima de 22°C e elevada umidade oriunda do Oceano Atlântico (Paranaguá, Antonina, Guaratuba).",
    color: "#D97732",
    positions: [
      [-25.15, -48.88],
      [-25.15, -48.05],
      [-25.98, -48.45],
      [-25.95, -48.92],
    ],
  },
  {
    id: "cfa-interior",
    code: "Cfa",
    name: "Subtropical Úmido com Verão Quente (Norte e Oeste do PR)",
    description:
      "Cotas abaixo de 600–700m com verões quentes (> 22°C) e precipitação concentrada na primavera/verão.",
    color: "#E3962D",
    positions: [
      [-22.75, -53.85],
      [-22.75, -49.55],
      [-24.25, -49.55],
      [-24.25, -51.45],
      [-25.65, -51.85],
      [-25.55, -54.55],
    ],
  },
];

export function KoppenMap() {
  const [curitibaBoundary, setCuritibaBoundary] =
    useState<GeoJSON.GeoJsonObject | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(
      "https://servicodados.ibge.gov.br/api/v3/malhas/municipios/4106902?formato=application/vnd.geo+json&qualidade=intermediaria",
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data: GeoJSON.GeoJsonObject | null) => {
        if (!cancelled && data) setCuritibaBoundary(data);
      })
      .catch((err) => console.error("Erro malha Curitiba Köppen:", err));

    return () => {
      cancelled = true;
    };
  }, []);

  const curitibaHighlightStyle: PathOptions = {
    color: "#173D35",
    weight: 2.6,
    opacity: 1,
    fillColor: "#173D35",
    fillOpacity: 0.28,
  };

  return (
    <div className="koppen-map-wrapper">
      <div className="koppen-map-canvas">
        <MapContainer
          center={[-25.38, -49.25]}
          zoom={8}
          scrollWheelZoom={false}
          className="city-map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            className="smart-tiles-clean"
          />

          {PARANA_KOPPEN_ZONES.map((zone) => (
            <Polygon
              key={zone.id}
              positions={zone.positions}
              pathOptions={{
                color: zone.color,
                weight: 1.5,
                fillColor: zone.color,
                fillOpacity: 0.24,
              }}
            >
              <Popup>
                <div className="map-popup">
                  <strong>
                    Zona Köppen {zone.code} · {zone.name}
                  </strong>
                  <p>{zone.description}</p>
                </div>
              </Popup>
            </Polygon>
          ))}

          {curitibaBoundary && (
            <GeoJSON data={curitibaBoundary} style={curitibaHighlightStyle} />
          )}

          <CircleMarker
            center={[-25.4284, -49.2733]}
            radius={6}
            pathOptions={{
              color: "#FFFFFF",
              weight: 2,
              fillColor: "#173D35",
              fillOpacity: 1,
            }}
          >
            <Popup>
              <div className="map-popup">
                <strong>Curitiba · Clima Köppen Cfb</strong>
                <span>Altitude média: 934 m · Sem estação seca definida</span>
              </div>
            </Popup>
          </CircleMarker>
        </MapContainer>
      </div>

      <div className="koppen-map-legend">
        <div className="koppen-legend-item">
          <span style={{ backgroundColor: "#2E7D5B" }} />
          <div>
            <strong>
              Cfb — Subtropical Úmido Mesotérmico (Curitiba / Planalto)
            </strong>
            <small>
              Verão ameno (&lt; 22°C), chuvas distribuídas nos 12 meses
            </small>
          </div>
        </div>

        <div className="koppen-legend-item">
          <span style={{ backgroundColor: "#D97732" }} />
          <div>
            <strong>Cfa — Subtropical Úmido (Litoral e Norte/Oeste PR)</strong>
            <small>Verão quente (&gt; 22°C) e maior amplitude térmica</small>
          </div>
        </div>
      </div>
    </div>
  );
}
