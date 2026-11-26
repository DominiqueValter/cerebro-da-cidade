import express from "express";
import cors from "cors";
import { unzipSync } from "fflate";
import Papa from "papaparse";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const allowedOrigins = [
  "http://localhost:5173",
  ...(process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(",").map((u) =>
        u.trim().replace(/\/$/, ""),
      )
    : []),
];

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.endsWith(".vercel.app")
      ) {
        callback(null, true);
        return;
      }
      callback(new Error("Origem não permitida pelo CORS"));
    },
  }),
);

app.use(express.json());

export type AccountType = "admin" | "citizen";

interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: string;
  accountType: AccountType;
  passwordHash: string;
}

const DATA_DIR = process.env.VERCEL
  ? path.join("/tmp", "cerebro-data")
  : path.resolve(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const activeSessions = new Map<string, Omit<StoredUser, "passwordHash">>();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function loadUsers(): StoredUser[] {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
    const defaultUsers: StoredUser[] = [
      {
        id: "usr-admin-01",
        name: "Operador CCO Curitiba",
        email: "admin@cerebro.curitiba.pr.gov.br",
        role: "Centro de Controle Operacional",
        accountType: "admin",
        passwordHash: hashPassword("curitiba2026"),
      },
      {
        id: "usr-citizen-01",
        name: "Morador Curitiba",
        email: "cidadao@email.com",
        role: "Cidadão · Curitiba",
        accountType: "citizen",
        passwordHash: hashPassword("123456"),
      },
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
    return defaultUsers;
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8")) as StoredUser[];
}

function saveUsers(users: StoredUser[]) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ message: "Informe e-mail e senha." });
    return;
  }

  const users = loadUsers();
  const found = users.find(
    (u) =>
      u.email.toLowerCase() === email.trim().toLowerCase() &&
      u.passwordHash === hashPassword(password),
  );

  if (!found) {
    res.status(401).json({ message: "Credenciais inválidas." });
    return;
  }

  const token = crypto.randomUUID();
  const safeUser = {
    id: found.id,
    name: found.name,
    email: found.email,
    role: found.role,
    accountType: found.accountType ?? "citizen",
  };
  activeSessions.set(token, safeUser);

  res.json({ token, user: safeUser });
});

app.post("/api/auth/register", (req, res) => {
  const { name, email, role, password, accountType } = req.body as {
    name?: string;
    email?: string;
    role?: string;
    password?: string;
    accountType?: AccountType;
  };

  if (!name || !email || !password || password.length < 4) {
    res.status(400).json({
      message: "Preencha nome, e-mail e senha (mínimo 4 caracteres).",
    });
    return;
  }

  const users = loadUsers();
  if (users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) {
    res.status(409).json({ message: "E-mail já cadastrado." });
    return;
  }

  const resolvedType: AccountType =
    accountType === "admin" ? "admin" : "citizen";

  const newUser: StoredUser = {
    id: `usr-${Date.now()}`,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role:
      resolvedType === "admin"
        ? (role ?? "Gestor / Operador Urbano").trim()
        : "Cidadão · Curitiba",
    accountType: resolvedType,
    passwordHash: hashPassword(password),
  };

  users.push(newUser);
  saveUsers(users);

  const token = crypto.randomUUID();
  const safeUser = {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    role: newUser.role,
    accountType: newUser.accountType,
  };
  activeSessions.set(token, safeUser);

  res.status(201).json({ token, user: safeUser });
});

interface TransitStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface TransitRoute {
  id: string;
  shortName: string;
  longName: string;
  color: string;
  textColor: string;
  hasShape: boolean;
  shapesCount: number;
  geometrySource: "shapes.txt" | "stop_times.txt" | "none";
}

export interface RouteShape {
  shapeId: string;
  headsign: string | null;
  geometrySource: "shapes.txt" | "stop_times.txt";
  coordinates: [number, number][];
}

interface RawShapePoint {
  lat: number;
  lon: number;
  sequence: number;
}

interface RawStopTime {
  stopId: string;
  sequence: number;
}

interface GtfsCache {
  source: string;
  lastUpdated: string;
  availableFiles: string[];
  stops: TransitStop[];
  routes: TransitRoute[];
  routesById: Map<string, TransitRoute>;
  routeShapes: Map<string, RouteShape[]>;
  stopRouteIds: Map<string, Set<string>>;
}

const GTFS_URL =
  "https://github.com/benaytms/urbs-gtfs/releases/download/latest/gtfs_curitiba.zip";

const CACHE_DURATION = 60 * 60 * 1000; // 1 hora

let gtfsCache: GtfsCache | null = null;
let cacheTimestamp = 0;
let loadingPromise: Promise<GtfsCache> | null = null;

// Cache da malha de bairros de Curitiba (IBGE)
let neighborhoodsCache: unknown | null = null;
let neighborhoodsTimestamp = 0;

function normalizeHexColor(
  rawColor: string | undefined,
  fallback: string,
): string {
  if (!rawColor) return fallback;
  const cleaned = rawColor.trim().replace(/^#/, "");
  return /^[0-9A-Fa-f]{6}$/.test(cleaned)
    ? `#${cleaned.toUpperCase()}`
    : fallback;
}

function parseCsvFile(fileBytes: Uint8Array): Record<string, string>[] {
  const csv = new TextDecoder("utf-8").decode(fileBytes);
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    console.warn(
      "Avisos na leitura de arquivo GTFS:",
      parsed.errors.slice(0, 5),
    );
  }

  return parsed.data;
}

function getDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const earthRadius = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadius * c);
}

async function buildGtfsCache(): Promise<GtfsCache> {
  console.log(
    "Buscando feed GTFS (paradas, linhas, itinerários e vínculos)...",
  );

  const response = await fetch(GTFS_URL);

  if (!response.ok) {
    throw new Error(`Erro ao baixar GTFS: HTTP ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const files = unzipSync(new Uint8Array(buffer));
  const availableFiles = Object.keys(files).sort();

  // 1. Paradas (stops.txt)
  const stopsFile = files["stops.txt"];
  if (!stopsFile) {
    throw new Error("stops.txt não encontrado no feed.");
  }

  const stops: TransitStop[] = [];
  const stopsById = new Map<string, TransitStop>();

  for (const row of parseCsvFile(stopsFile)) {
    const stop: TransitStop = {
      id: (row.stop_id ?? row.id ?? "").trim(),
      name: (row.stop_name ?? row.nome ?? row.name ?? "").trim(),
      latitude: Number(row.stop_lat ?? row.latitude),
      longitude: Number(row.stop_lon ?? row.longitude),
    };

    if (
      stop.id &&
      stop.name &&
      Number.isFinite(stop.latitude) &&
      Number.isFinite(stop.longitude)
    ) {
      stops.push(stop);
      stopsById.set(stop.id, stop);
    }
  }

  // 2. Traçados geográficos detalhados (shapes.txt, se presente)
  const shapesById = new Map<string, [number, number][]>();
  const shapesFile = files["shapes.txt"];

  if (shapesFile) {
    const rawShapes = new Map<string, RawShapePoint[]>();

    for (const row of parseCsvFile(shapesFile)) {
      const shapeId = (row.shape_id ?? "").trim();
      const lat = Number(row.shape_pt_lat);
      const lon = Number(row.shape_pt_lon);
      const sequence = Number(row.shape_pt_sequence);

      if (
        !shapeId ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        !Number.isFinite(sequence)
      ) {
        continue;
      }

      const list = rawShapes.get(shapeId);
      const point: RawShapePoint = { lat, lon, sequence };

      if (list) {
        list.push(point);
      } else {
        rawShapes.set(shapeId, [point]);
      }
    }

    for (const [shapeId, points] of rawShapes.entries()) {
      points.sort((a, b) => a.sequence - b.sequence);
      shapesById.set(
        shapeId,
        points.map((point) => [point.lat, point.lon]),
      );
    }
  }

  // 3. Viagens (trips.txt) -> mapeia trip_id -> route_id e variantes de traçado
  const tripToRoute = new Map<string, string>();
  const routeShapeIds = new Map<string, Map<string, string | null>>();
  const routeVariantTrips = new Map<
    string,
    Map<string, { headsign: string | null; tripIds: string[] }>
  >();
  const candidateTripIds = new Set<string>();
  const tripsFile = files["trips.txt"];

  if (tripsFile) {
    for (const row of parseCsvFile(tripsFile)) {
      const routeId = (row.route_id ?? "").trim();
      const tripId = (row.trip_id ?? "").trim();
      const shapeId = (row.shape_id ?? "").trim();
      const directionId = (row.direction_id ?? "").trim();
      const headsign = (row.trip_headsign ?? "").trim() || null;

      if (!routeId) continue;

      if (tripId) {
        tripToRoute.set(tripId, routeId);
      }

      if (shapeId && shapesById.has(shapeId)) {
        let shapesForRoute = routeShapeIds.get(routeId);
        if (!shapesForRoute) {
          shapesForRoute = new Map<string, string | null>();
          routeShapeIds.set(routeId, shapesForRoute);
        }
        if (!shapesForRoute.has(shapeId)) {
          shapesForRoute.set(shapeId, headsign);
        }
      }

      if (tripId) {
        const variantKey = `${directionId}::${headsign ?? ""}`;
        let variants = routeVariantTrips.get(routeId);
        if (!variants) {
          variants = new Map();
          routeVariantTrips.set(routeId, variants);
        }

        let variant = variants.get(variantKey);
        if (!variant) {
          variant = { headsign, tripIds: [] };
          variants.set(variantKey, variant);
        }

        if (variant.tripIds.length < 3) {
          variant.tripIds.push(tripId);
          candidateTripIds.add(tripId);
        }
      }
    }
  }

  // 4. Sequência de paradas (stop_times.txt) -> traçados fallback + índice stop_id -> route_ids
  const tripStopTimes = new Map<string, RawStopTime[]>();
  const stopRouteIds = new Map<string, Set<string>>();
  const stopTimesFile = files["stop_times.txt"];

  if (stopTimesFile) {
    for (const row of parseCsvFile(stopTimesFile)) {
      const tripId = (row.trip_id ?? "").trim();
      const stopId = (row.stop_id ?? "").trim();

      if (!tripId || !stopId || !stopsById.has(stopId)) continue;

      const routeId = tripToRoute.get(tripId);
      if (routeId) {
        let routeSet = stopRouteIds.get(stopId);
        if (!routeSet) {
          routeSet = new Set<string>();
          stopRouteIds.set(stopId, routeSet);
        }
        routeSet.add(routeId);
      }

      if (candidateTripIds.has(tripId)) {
        const sequence = Number(row.stop_sequence);
        if (Number.isFinite(sequence)) {
          const list = tripStopTimes.get(tripId);
          const item: RawStopTime = { stopId, sequence };
          if (list) {
            list.push(item);
          } else {
            tripStopTimes.set(tripId, [item]);
          }
        }
      }
    }
  }

  // 5. Linhas (routes.txt)
  const routeShapes = new Map<string, RouteShape[]>();
  const routes: TransitRoute[] = [];
  const routesById = new Map<string, TransitRoute>();
  const routesFile = files["routes.txt"];

  if (routesFile) {
    for (const row of parseCsvFile(routesFile)) {
      const id = (row.route_id ?? "").trim();
      if (!id) continue;

      const shortName = (row.route_short_name ?? id).trim();
      const longName = (row.route_long_name ?? shortName).trim();
      const color = normalizeHexColor(row.route_color, "#244B40");
      const textColor = normalizeHexColor(row.route_text_color, "#FFFFFF");

      const assembledShapes: RouteShape[] = [];
      let geometrySource: TransitRoute["geometrySource"] = "none";

      const uniqueShapes = routeShapeIds.get(id);
      if (uniqueShapes) {
        for (const [shapeId, headsign] of uniqueShapes.entries()) {
          const coordinates = shapesById.get(shapeId);
          if (coordinates && coordinates.length > 1) {
            assembledShapes.push({
              shapeId,
              headsign,
              geometrySource: "shapes.txt",
              coordinates,
            });
          }
        }
        if (assembledShapes.length > 0) {
          geometrySource = "shapes.txt";
        }
      }

      if (assembledShapes.length === 0) {
        const variants = routeVariantTrips.get(id);
        if (variants) {
          for (const variant of variants.values()) {
            let bestTripId: string | null = null;
            let bestStops: RawStopTime[] = [];

            for (const tripId of variant.tripIds) {
              const stopsForTrip = tripStopTimes.get(tripId);
              if (stopsForTrip && stopsForTrip.length > bestStops.length) {
                bestTripId = tripId;
                bestStops = stopsForTrip;
              }
            }

            if (bestTripId && bestStops.length > 1) {
              const ordered = [...bestStops].sort(
                (a, b) => a.sequence - b.sequence,
              );
              const coordinates: [number, number][] = [];

              for (const item of ordered) {
                const stop = stopsById.get(item.stopId);
                if (stop) {
                  coordinates.push([stop.latitude, stop.longitude]);
                }
              }

              if (coordinates.length > 1) {
                assembledShapes.push({
                  shapeId: `trip-${bestTripId}`,
                  headsign: variant.headsign,
                  geometrySource: "stop_times.txt",
                  coordinates,
                });
              }
            }
          }

          if (assembledShapes.length > 0) {
            geometrySource = "stop_times.txt";
          }
        }
      }

      if (assembledShapes.length > 0) {
        routeShapes.set(id, assembledShapes);
      }

      const routeObj: TransitRoute = {
        id,
        shortName,
        longName,
        color,
        textColor,
        hasShape: assembledShapes.length > 0,
        shapesCount: assembledShapes.length,
        geometrySource,
      };

      routes.push(routeObj);
      routesById.set(id, routeObj);
    }

    routes.sort((a, b) =>
      a.shortName.localeCompare(b.shortName, "pt-BR", { numeric: true }),
    );
  }

  cacheTimestamp = Date.now();

  console.log(
    `Feed GTFS carregado: ${stops.length} paradas, ${routes.length} linhas, ${stopRouteIds.size} paradas indexadas.`,
  );

  return {
    source: "GTFS comunitário",
    lastUpdated: new Date(cacheTimestamp).toISOString(),
    availableFiles,
    stops,
    routes,
    routesById,
    routeShapes,
    stopRouteIds,
  };
}

async function getGtfsData(): Promise<GtfsCache> {
  const now = Date.now();

  if (gtfsCache && now - cacheTimestamp < CACHE_DURATION) {
    return gtfsCache;
  }

  if (!loadingPromise) {
    loadingPromise = buildGtfsCache()
      .then((data) => {
        gtfsCache = data;
        return data;
      })
      .finally(() => {
        loadingPromise = null;
      });
  }

  return loadingPromise;
}

app.get("/api/mobility/stops", async (_req, res) => {
  try {
    const data = await getGtfsData();

    res.json({
      source: data.source,
      lastUpdated: data.lastUpdated,
      total: data.stops.length,
      stops: data.stops,
    });
  } catch (error) {
    console.error("Erro ao carregar paradas:", error);
    res.status(500).json({
      message: "Não foi possível carregar as paradas de transporte.",
    });
  }
});

app.get("/api/mobility/routes", async (_req, res) => {
  try {
    const data = await getGtfsData();

    res.json({
      source: data.source,
      lastUpdated: data.lastUpdated,
      gtfsFiles: data.availableFiles,
      total: data.routes.length,
      routes: data.routes,
    });
  } catch (error) {
    console.error("Erro ao carregar linhas:", error);
    res.status(500).json({
      message: "Não foi possível carregar as linhas de transporte.",
    });
  }
});

app.get("/api/mobility/routes/:routeId/shape", async (req, res) => {
  try {
    const data = await getGtfsData();
    const routeId = decodeURIComponent(req.params.routeId);
    const route = data.routesById.get(routeId);

    if (!route) {
      res.status(404).json({
        message: "Linha de transporte não encontrada.",
      });
      return;
    }

    const shapes = data.routeShapes.get(routeId) ?? [];

    res.json({
      source: data.source,
      lastUpdated: data.lastUpdated,
      route,
      shapes,
    });
  } catch (error) {
    console.error("Erro ao carregar traçado da linha:", error);
    res.status(500).json({
      message: "Não foi possível carregar o traçado da linha.",
    });
  }
});

// Cruzamento espacial: paradas próximas e linhas afetadas no raio informado
app.get("/api/mobility/nearby", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const radius = Math.min(
      2000,
      Math.max(100, Number(req.query.radius) || 500),
    );

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.status(400).json({
        message: "Parâmetros lat e lon são obrigatórios.",
      });
      return;
    }

    const data = await getGtfsData();
    const degMargin = (radius + 500) / 111000;

    let nearbyStopsCount = 0;
    let nearestStop: { id: string; name: string; distance: number } | null =
      null;
    const affectedRouteIds = new Set<string>();

    for (const stop of data.stops) {
      if (
        Math.abs(stop.latitude - lat) > degMargin ||
        Math.abs(stop.longitude - lon) > degMargin
      ) {
        continue;
      }

      const dist = getDistanceMeters(lat, lon, stop.latitude, stop.longitude);

      if (dist <= radius) {
        nearbyStopsCount += 1;
        const routeSet = data.stopRouteIds.get(stop.id);
        if (routeSet) {
          for (const rId of routeSet) {
            affectedRouteIds.add(rId);
          }
        }
      }

      if (!nearestStop || dist < nearestStop.distance) {
        nearestStop = { id: stop.id, name: stop.name, distance: dist };
      }
    }

    const affectedRoutes: TransitRoute[] = [];
    for (const rId of affectedRouteIds) {
      const route = data.routesById.get(rId);
      if (route) affectedRoutes.push(route);
    }

    affectedRoutes.sort((a, b) =>
      a.shortName.localeCompare(b.shortName, "pt-BR", { numeric: true }),
    );

    res.json({
      source: data.source,
      radiusMeters: radius,
      nearbyStopsCount,
      nearestStop,
      affectedRoutesCount: affectedRoutes.length,
      affectedRoutes,
    });
  } catch (error) {
    console.error("Erro na consulta espacial de mobilidade:", error);
    res.status(500).json({
      message: "Não foi possível analisar as linhas próximas.",
    });
  }
});

// Subdivisão por bairros de Curitiba (malha intrarregional IBGE)
app.get("/api/geo/neighborhoods", async (_req, res) => {
  try {
    const now = Date.now();
    if (neighborhoodsCache && now - neighborhoodsTimestamp < CACHE_DURATION) {
      res.json(neighborhoodsCache);
      return;
    }

    const [meshRes, namesRes] = await Promise.all([
      fetch(
        "https://servicodados.ibge.gov.br/api/v3/malhas/municipios/4106902?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=bairro",
      ),
      fetch(
        "https://servicodados.ibge.gov.br/api/v1/localidades/municipios/4106902/bairros",
      ),
    ]);

    if (!meshRes.ok) {
      throw new Error(`Erro IBGE malha bairros: HTTP ${meshRes.status}`);
    }

    const geojson = (await meshRes.json()) as {
      type: string;
      features?: Array<{
        type: string;
        properties?: Record<string, unknown>;
        geometry: unknown;
      }>;
    };

    const nameMap = new Map<string, string>();
    if (namesRes.ok) {
      const bairrosList = (await namesRes.json()) as Array<{
        id: number | string;
        nome: string;
      }>;
      for (const item of bairrosList) {
        nameMap.set(String(item.id), item.nome);
      }
    }

    if (Array.isArray(geojson.features)) {
      geojson.features = geojson.features.map((feature, idx) => {
        const props = feature.properties ?? {};
        const codarea = String(props.codarea ?? props.CD_BAIRRO ?? idx);
        const resolvedName =
          nameMap.get(codarea) ??
          (typeof props.nome === "string" && props.nome.trim()
            ? props.nome.trim()
            : `Setor ${codarea.slice(-3)}`);

        return {
          ...feature,
          properties: {
            ...props,
            codarea,
            nome: resolvedName,
          },
        };
      });
    }

    neighborhoodsCache = geojson;
    neighborhoodsTimestamp = Date.now();

    res.json(geojson);
  } catch (error) {
    console.error("Erro ao carregar bairros de Curitiba:", error);
    res.status(502).json({
      message: "Não foi possível obter a subdivisão de bairros do IBGE.",
    });
  }
});

app.get("/", (_req, res) => {
  res.json({
    status: "online",
    service: "Cérebro da Cidade API",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "online",
    service: "Cérebro da Cidade API",
  });
});

async function findNearbyGtfsSummary(lat: number, lon: number, radius = 500) {
  try {
    const data = await getGtfsData();
    const degMargin = (radius + 500) / 111000;
    let stopsCount = 0;
    const routeIds = new Set<string>();

    for (const stop of data.stops) {
      if (
        Math.abs(stop.latitude - lat) > degMargin ||
        Math.abs(stop.longitude - lon) > degMargin
      ) {
        continue;
      }
      if (
        getDistanceMeters(lat, lon, stop.latitude, stop.longitude) <= radius
      ) {
        stopsCount += 1;
        data.stopRouteIds.get(stop.id)?.forEach((rId) => routeIds.add(rId));
      }
    }

    const routes = Array.from(routeIds)
      .map((id) => data.routesById.get(id))
      .filter((r): r is TransitRoute => Boolean(r))
      .sort((a, b) =>
        a.shortName.localeCompare(b.shortName, "pt-BR", { numeric: true }),
      );

    return {
      stopsCount,
      routesCount: routes.length,
      routeLabels: routes
        .slice(0, 8)
        .map((r) => `${r.shortName} (${r.longName})`),
    };
  } catch {
    return { stopsCount: 0, routesCount: 0, routeLabels: [] };
  }
}

app.post("/api/ai/occurrence-plan", async (req, res) => {
  try {
    const event = req.body as {
      title?: string;
      neighborhood?: string;
      conditionLabel?: string;
      description?: string;
      category?: "traffic" | "flood" | "incident";
      severity?: "low" | "medium" | "high";
      latitude?: number;
      longitude?: number;
      isPredictive?: boolean;
    };

    const lat = Number(event.latitude ?? -25.4302);
    const lon = Number(event.longitude ?? -49.2718);
    const gtfs = await findNearbyGtfsSummary(lat, lon, 500);

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      const prompt = `Você é o Núcleo de Inteligência Urbana do Centro de Controle Operacional (CCO) de Curitiba/PR.
Analise esta ocorrência e responda EXCLUSIVAMENTE em JSON válido (sem markdown) seguindo exatamente esta estrutura:
{
  "summary": "string objetiva",
  "immediateActions": ["string", "string", "string"],
  "mobilityMitigation": ["string", "string"],
  "agenciesToNotify": ["string", "string"],
  "estimatedResponseWindow": "string"
}

Dados da ocorrência:
- Bairro: ${event.neighborhood ?? "Curitiba"}
- Condição: ${event.conditionLabel ?? event.title ?? "Ocorrência urbana"}
- Categoria: ${event.category ?? "incident"} | Severidade: ${event.severity ?? "medium"}
- Preditiva: ${event.isPredictive ? "Sim" : "Não"}
- Descrição: ${event.description ?? ""}
- Impacto GTFS real no raio de 500m: ${gtfs.stopsCount} paradas e ${gtfs.routesCount} linhas (${gtfs.routeLabels.join(", ") || "nenhuma linha direta"}).

Considere órgãos reais de Curitiba (SETRAN, URBS, Defesa Civil 199, SMOP, COPEL, Sanepar) e eixos/bacias reais da cidade.`;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.35,
            },
          }),
        },
      );

      if (geminiRes.ok) {
        const raw = (await geminiRes.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };
        const text = raw.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          res.json({
            ...parsed,
            affectedGtfsRoutes: gtfs.routeLabels,
            nearbyStopsCount: gtfs.stopsCount,
          });
          return;
        }
      }
    }

    // Fallback enriquecido com dados GTFS reais do backend
    const transitAction =
      gtfs.routesCount > 0
        ? `Desviar as ${gtfs.routesCount} linhas afetadas no raio de 500m (${gtfs.routeLabels.slice(0, 4).join(", ")}) para vias paralelas.`
        : `Manter monitoramento preventivo nas linhas alimentadoras de ${event.neighborhood ?? "Curitiba"}.`;

    res.json({
      summary: `Protocolo operacional para ${event.neighborhood ?? "Curitiba"} (${event.conditionLabel ?? "Ocorrência"}) com ${gtfs.stopsCount} paradas GTFS no perímetro de 500m.`,
      immediateActions: [
        event.category === "flood"
          ? `Acionar desobstrução preventiva de galerias e bocas de lobo em ${event.neighborhood}.`
          : `Deslocar equipe de campo da SETRAN para sinalização e fluidez em ${event.neighborhood}.`,
        "Isolar trechos críticos e monitorar evolução via câmeras do CCO Curitiba.",
        "Atualizar status operacional no boletim integrado da regional.",
      ],
      mobilityMitigation: [
        transitAction,
        "Ajustar tempos semafóricos nos corredores de acesso para absorver retenção.",
      ],
      agenciesToNotify: [
        "SETRAN / URBS",
        event.category === "flood"
          ? "Defesa Civil (199) · SMOP"
          : "Central 156",
      ],
      estimatedResponseWindow:
        event.severity === "high" ? "15 a 30 min" : "40 a 75 min",
      affectedGtfsRoutes: gtfs.routeLabels,
      nearbyStopsCount: gtfs.stopsCount,
    });
  } catch (error) {
    console.error("Erro no endpoint de IA:", error);
    res.status(500).json({ message: "Falha ao gerar plano de resolução." });
  }
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`API executando em http://localhost:${PORT}`);
  });
}

export default app;
