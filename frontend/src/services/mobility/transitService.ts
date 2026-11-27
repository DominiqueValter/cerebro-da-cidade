export interface TransitStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export type RouteGeometrySource = "shapes.txt" | "stop_times.txt" | "none";

export interface TransitRoute {
  id: string;
  shortName: string;
  longName: string;
  color: string;
  textColor: string;
  hasShape: boolean;
  shapesCount: number;
  geometrySource: RouteGeometrySource;
}

export interface RouteShape {
  shapeId: string;
  headsign: string | null;
  geometrySource: "shapes.txt" | "stop_times.txt";
  coordinates: [number, number][];
}

export interface RouteShapeResponse {
  source: string;
  lastUpdated: string;
  route: TransitRoute;
  shapes: RouteShape[];
}

export interface NearbyTransitImpact {
  source: string;
  radiusMeters: number;
  nearbyStopsCount: number;
  nearestStop: {
    id: string;
    name: string;
    distance: number;
  } | null;
  affectedRoutesCount: number;
  affectedRoutes: TransitRoute[];
}

interface TransitStopsResponse {
  source: string;
  lastUpdated: string;
  total: number;
  stops: TransitStop[];
}

interface TransitRoutesResponse {
  source: string;
  lastUpdated: string;
  gtfsFiles: string[];
  total: number;
  routes: TransitRoute[];
}

const SERVER_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:3000"
).replace(/\/$/, "");

const API_BASE_URL = `${SERVER_URL}/api/mobility`;

export async function getTransitStops(): Promise<TransitStop[]> {
  const response = await fetch(`${API_BASE_URL}/stops`);

  if (!response.ok) {
    throw new Error("Não foi possível carregar as paradas.");
  }

  const data: TransitStopsResponse = await response.json();

  return data.stops;
}

export async function getTransitRoutes(): Promise<TransitRoute[]> {
  const response = await fetch(`${API_BASE_URL}/routes`);

  if (!response.ok) {
    throw new Error("Não foi possível carregar as linhas de transporte.");
  }

  const data: TransitRoutesResponse = await response.json();

  return data.routes;
}

export async function getRouteShape(
  routeId: string,
): Promise<RouteShapeResponse> {
  const encodedId = encodeURIComponent(routeId);
  const response = await fetch(`${API_BASE_URL}/routes/${encodedId}/shape`);

  if (!response.ok) {
    throw new Error("Não foi possível carregar o traçado da linha.");
  }

  return response.json();
}

export async function getNearbyTransitImpact(
  latitude: number,
  longitude: number,
  radiusMeters = 500,
): Promise<NearbyTransitImpact> {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    radius: String(radiusMeters),
  });

  const response = await fetch(`${API_BASE_URL}/nearby?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Não foi possível analisar as linhas próximas.");
  }

  return response.json();
}

export async function getCuritibaNeighborhoods(): Promise<GeoJSON.FeatureCollection> {
  const response = await fetch(`${SERVER_URL}/api/geo/neighborhoods`);

  if (!response.ok) {
    throw new Error("Não foi possível carregar os bairros de Curitiba.");
  }

  return response.json();
}
