import { useEffect, useState } from "react";
import { Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { divIcon } from "leaflet";

import { getTransitStops } from "../../services/mobility/transitService";
import type { TransitStop } from "../../services/mobility/transitService";

import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

interface TransitLayerProps {
  visible: boolean;
  stops?: TransitStop[];
}

const stopIcon = divIcon({
  className: "transit-stop-marker",
  html: `
    <div style="
      width: 11px;
      height: 11px;
      background: #244B40;
      border: 2px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 1px 4px rgba(23, 61, 53, 0.35);
    "></div>
  `,
  iconSize: [15, 15],
  iconAnchor: [7.5, 7.5],
});

function createClusterIcon(cluster: { getChildCount: () => number }) {
  const count = cluster.getChildCount();
  const size = count >= 500 ? 38 : count >= 100 ? 34 : 30;

  return divIcon({
    className: "transit-cluster-marker",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(36, 75, 64, 0.9);
        color: #FFFFFF;
        border: 2px solid #FFFFFF;
        border-radius: 50%;
        font-family: Inter, sans-serif;
        font-size: 11px;
        font-weight: 600;
        box-shadow: 0 2px 8px rgba(23, 61, 53, 0.25);
      ">
        ${count}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function TransitLayer({
  visible,
  stops: externalStops,
}: TransitLayerProps) {
  const isControlled = externalStops !== undefined;
  const [internalStops, setInternalStops] = useState<TransitStop[]>([]);

  useEffect(() => {
    if (isControlled) return;

    let cancelled = false;

    async function loadStops() {
      try {
        const data = await getTransitStops();

        if (!cancelled) {
          setInternalStops(data);
        }
      } catch (error) {
        console.error("Erro ao carregar paradas de ônibus:", error);
      }
    }

    loadStops();

    return () => {
      cancelled = true;
    };
  }, [isControlled]);

  const stops = isControlled ? externalStops : internalStops;

  if (!visible) return null;

  return (
    <MarkerClusterGroup
      chunkedLoading
      showCoverageOnHover={false}
      spiderfyOnMaxZoom
      maxClusterRadius={60}
      iconCreateFunction={createClusterIcon}
    >
      {stops.map((stop) => (
        <Marker
          key={stop.id}
          position={[stop.latitude, stop.longitude]}
          icon={stopIcon}
        >
          <Popup>
            <div className="map-popup">
              <strong>{stop.name}</strong>
              <span>Parada de transporte coletivo</span>
              <small>Fonte: feed GTFS comunitário</small>
            </div>
          </Popup>
        </Marker>
      ))}
    </MarkerClusterGroup>
  );
}
