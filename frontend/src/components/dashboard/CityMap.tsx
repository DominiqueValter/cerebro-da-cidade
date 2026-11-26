import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import { geoJSON } from "leaflet";
import { Bus } from "lucide-react";

import { urbanEvents } from "../../features/overview/data/urbanEvents";
import type { UrbanEventCategory } from "../../features/overview/data/urbanEvents";
import { TransitLayer } from "./TransitLayer";

import "leaflet/dist/leaflet.css";

interface FitMunicipalityProps {
  data: GeoJSON.GeoJsonObject;
}

function FitMunicipality({ data }: FitMunicipalityProps) {
  const map = useMap();

  useEffect(() => {
    const bounds = geoJSON(data).getBounds();

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [24, 24],
        maxZoom: 12,
      });
    }

    map.invalidateSize();
  }, [data, map]);

  return null;
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

const severityLabels = {
  low: "Baixa",
  medium: "Moderada",
  high: "Alta",
};

export function CityMap() {
  const [boundary, setBoundary] = useState<GeoJSON.GeoJsonObject | null>(null);
  const [transitVisible, setTransitVisible] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadBoundary() {
      try {
        const response = await fetch(
          "https://servicodados.ibge.gov.br/api/v3/malhas/municipios/4106902?formato=application/vnd.geo+json&qualidade=intermediaria",
        );

        if (!response.ok) {
          throw new Error("Não foi possível carregar a malha municipal.");
        }

        const data: GeoJSON.GeoJsonObject = await response.json();

        if (!cancelled) {
          setBoundary(data);
        }
      } catch (error) {
        console.error("Erro ao carregar limite de Curitiba:", error);
      }
    }

    loadBoundary();

    return () => {
      cancelled = true;
    };
  }, []);

  const boundaryStyle = {
    color: "#244B40",
    weight: 2.5,
    opacity: 0.9,
    fillColor: "#587C69",
    fillOpacity: 0.06,
  };

  return (
    <div className="city-map-wrapper">
      <button
        type="button"
        className={`map-floating-toggle ${transitVisible ? "active" : ""}`}
        onClick={() => setTransitVisible((previous) => !previous)}
        aria-pressed={transitVisible}
      >
        <Bus size={14} strokeWidth={1.9} />
        <span>Paradas GTFS</span>
      </button>

      <MapContainer
        center={[-25.4284, -49.2733]}
        zoom={11}
        scrollWheelZoom
        className="city-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {boundary && (
          <>
            <GeoJSON data={boundary} style={boundaryStyle} />
            <FitMunicipality data={boundary} />
          </>
        )}

        {urbanEvents.map((event) => (
          <CircleMarker
            key={event.id}
            center={[event.latitude, event.longitude]}
            radius={8}
            pathOptions={{
              color: "#FFFFFF",
              weight: 2,
              fillColor: categoryColors[event.category],
              fillOpacity: 0.95,
            }}
          >
            <Popup>
              <div className="map-popup">
                <strong>{event.title}</strong>

                <span>Categoria: {categoryLabels[event.category]}</span>

                <span>Gravidade: {severityLabels[event.severity]}</span>

                <p>{event.description}</p>

                <small>Dados demonstrativos</small>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        <TransitLayer visible={transitVisible} />
      </MapContainer>

      <div className="map-demo-label">
        Eventos demonstrativos · Paradas: GTFS comunitário
      </div>
    </div>
  );
}
