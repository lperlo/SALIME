/* ------------------------------------------------------------------ */
/* api/lugares.js                                                     */
/*                                                                    */
/* SALIME - búsqueda de lugares reales                                */
/*                                                                    */
/* Esta versión NO usa Geoapify.                                     */
/* Usa:                                                               */
/*   - Nominatim de OpenStreetMap para geocodificar                    */
/*   - Overpass API para buscar lugares reales                         */
/*                                                                    */
/* REGLA PRINCIPAL:                                                   */
/* Nunca devolver calles, barrios, ciudades o direcciones como        */
/* lugares.                                                           */
/*                                                                    */
/* La búsqueda de lugares se hace directamente sobre etiquetas OSM   */
/* de establecimientos/atracciones.                                  */
/* ------------------------------------------------------------------ */

const NOMINATIM_URL =
  "https://nominatim.openstreetmap.org/search";

/*
 * Varios servidores Overpass públicos, en orden de preferencia.
 * Si el primero falla, está caído o tarda demasiado, probamos
 * el siguiente antes de darnos por vencidos. Esto evita que un
 * corte temporal de un solo servidor tire abajo toda la búsqueda.
 */
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

/*
 * Tiempo máximo (ms) que esperamos a cada servidor antes de
 * pasar al siguiente.
 */
const OVERPASS_TIMEOUT_MS = 12000;

const USER_AGENT =
  "SALIME/1.0 (aplicacion universitaria)";

const INTENT_TAGS = {
  comer: [
    ["amenity", "restaurant"],
    ["amenity", "fast_food"],
    ["amenity", "food_court"],
  ],

  beber: [
    ["amenity", "cafe"],
    ["amenity", "bar"],
    ["amenity", "pub"],
  ],

  cultura: [
    ["tourism", "museum"],
    ["tourism", "gallery"],
    ["amenity", "theatre"],
    ["amenity", "arts_centre"],
  ],

  paseo: [
    ["leisure", "park"],
    ["tourism", "attraction"],
    ["tourism", "viewpoint"],
  ],

  aire_libre: [
    ["leisure", "park"],
    ["leisure", "garden"],
    ["tourism", "viewpoint"],
    ["natural", "wood"],
    ["natural", "water"],
  ],

  fiesta: [
    ["amenity", "nightclub"],
    ["amenity", "bar"],
    ["amenity", "pub"],
  ],

  familia: [
    ["leisure", "playground"],
    ["leisure", "water_park"],
    ["tourism", "museum"],
    ["tourism", "zoo"],
    ["tourism", "theme_park"],
    ["amenity", "restaurant"],
  ],

  general: [
    ["amenity", "restaurant"],
    ["amenity", "cafe"],
    ["amenity", "bar"],
    ["tourism", "museum"],
    ["leisure", "park"],
    ["tourism", "attraction"],
  ],
};

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeOverpass(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

async function geocodeLocation(text) {
  const query = String(text || "").trim();
  if (!query) return null;

  let searchQuery = query;
  const normalized = normalizeText(query);

  if (
    normalized === "guemes" ||
    normalized === "nueva cordoba" ||
    normalized === "cordoba" ||
    normalized === "palermo" ||
    normalized.includes("buenos aires") ||
    normalized.includes("cordoba")
  ) {
    searchQuery = `${query}, Argentina`;
  }

  const params = new URLSearchParams({
    q: searchQuery,
    format: "json",
    limit: "10",
    addressdetails: "1",
    "accept-language": "es",
    countrycodes: "ar",
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    OVERPASS_TIMEOUT_MS
  );

  let res;

  try {
    res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    console.error("Nominatim request failed:", err && err.message);
    throw new Error("nominatim-geocode-error");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) throw new Error("nominatim-geocode-error");

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const scored = data.map((item) => {
    let score = 0;
    const display = normalizeText(item.display_name);
    const type = normalizeText(item.type);
    const category = normalizeText(item.class);

    if (display.includes("argentina")) score += 100;

    if (
      type === "city" ||
      type === "town" ||
      type === "suburb" ||
      type === "neighbourhood" ||
      type === "district" ||
      type === "municipality"
    ) {
      score += 50;
    }

    if (category === "place" || category === "boundary") score += 20;

    if (type === "road" || type === "street") score -= 100;

    if (normalized === normalizeText(item.name)) score += 40;

    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.item;

  if (!best || !best.lat || !best.lon) return null;

  return {
    lat: Number(best.lat),
    lon: Number(best.lon),
    label: best.display_name || query,
  };
}

function buildOverpassQuery(lat, lon, tags, radius) {
  const parts = [];

  for (const [key, value] of tags) {
    const safeKey = escapeOverpass(key);
    const safeValue = escapeOverpass(value);
    parts.push(
      `nwr["${safeKey}"="${safeValue}"](around:${radius},${lat},${lon});`
    );
  }

  return `
[out:json][timeout:25];
(
  ${parts.join("\n")}
);
out center tags;
`;
}

/*
 * Intenta una consulta a un único servidor Overpass, con timeout.
 * Lanza un error si el servidor no responde a tiempo, responde con
 * error HTTP, o devuelve algo que no es JSON válido.
 */
async function tryOverpassServer(url, query) {
  const controller = new AbortController();

  const timeoutId = setTimeout(
    () => controller.abort(),
    OVERPASS_TIMEOUT_MS
  );

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(
        `Overpass error (${url}):`,
        res.status,
        errorText
      );
      throw new Error(`overpass-http-${res.status}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

/*
 * Prueba cada servidor Overpass en orden hasta que uno responda
 * correctamente. Si todos fallan, recién ahí propagamos el error.
 * Se usa tanto para buscar lugares como para buscar calles.
 */
async function runOverpassQuery(query) {
  let lastError = null;

  for (const url of OVERPASS_URLS) {
    try {
      return await tryOverpassServer(url, query);
    } catch (err) {
      lastError = err;
      console.error(
        `Overpass server failed, probando el siguiente: ${url}`,
        err && err.message
      );
    }
  }

  console.error(
    "Todos los servidores Overpass fallaron:",
    lastError && lastError.message
  );

  throw new Error("overpass-places-error");
}

async function searchPlaces({ lat, lon, intent, limit = 40 }) {
  const tags = INTENT_TAGS[intent] || INTENT_TAGS.general;
  const query = buildOverpassQuery(lat, lon, tags, 15000);
  const data = await runOverpassQuery(query);
  const elements = Array.isArray(data.elements) ? data.elements : [];
  return elements.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* VERIFICACIÓN CRUZADA CONTRA CALLES REALES                          */
/*                                                                    */
/* Esto es lo que soluciona de raíz el problema de "Darregueyra":     */
/* en vez de intentar adivinar por tags si algo ES una calle,          */
/* directamente le preguntamos a OSM si existe una calle con el        */
/* mismo nombre MUY CERCA de cada lugar candidato (no de toda la       */
/* zona: eso sería una consulta enorme que se cuelga y falla en        */
/* silencio, que era el bug real). Esto funciona para CUALQUIER        */
/* calle (Darregueyra, Obispo Oro, la que sea), no solo para           */
/* nombres específicos que ya conocemos.                               */
/* ------------------------------------------------------------------ */

const STREET_CHECK_RADIUS_M = 80;

/*
 * Construye una sola consulta Overpass que revisa, para cada
 * candidato con coordenadas, si hay una calle con nombre a pocos
 * metros. Al unir todo en una sola consulta con radios chicos,
 * evitamos pedir "todas las calles de Buenos Aires" (que es lo que
 * colgaba la consulta anterior).
 */
function buildNearbyStreetsQuery(points, radius) {
  const parts = points.map(
    ({ lat, lon }) =>
      `way["highway"]["name"](around:${radius},${lat},${lon});`
  );

  return `
[out:json][timeout:20];
(
  ${parts.join("\n")}
);
out tags;
`;
}

/*
 * Dado un conjunto de candidatos ya ubicados en el mapa (con lat/lon
 * calculados), devuelve un Set con los nombres normalizados de
 * calles reales que están pegadas a alguno de esos puntos.
 */
async function fetchStreetNamesNearCandidates(points) {
  if (!points || points.length === 0) return new Set();

  try {
    const query = buildNearbyStreetsQuery(points, STREET_CHECK_RADIUS_M);
    const data = await runOverpassQuery(query);
    const elements = Array.isArray(data.elements) ? data.elements : [];

    const names = new Set();

    for (const element of elements) {
      const tags = getTags(element);
      const name = String(tags.name || "").trim();

      if (name) {
        names.add(normalizeText(name));
      }
    }

    return names;
  } catch (err) {
    /*
     * Si esta consulta falla, no bloqueamos toda la búsqueda:
     * seguimos sin esta capa extra de verificación, apoyándonos
     * en el resto de los filtros (isStreetOrAddress, etc).
     */
    console.error(
      "No se pudieron verificar calles cercanas a los candidatos:",
      err && err.message
    );
    return new Set();
  }
}

/*
 * Palabras que en Argentina casi siempre identifican elementos de
 * infraestructura urbana (canteros, rotondas, medianas) y no
 * establecimientos reales, incluso cuando OSM los etiquetó por error
 * como leisure=park o similar.
 */
const INFRASTRUCTURE_WORDS =
  /\b(cantero(es)?|rotonda|camellon|mediana|bandejon)\b/;

function looksLikeUrbanInfrastructure(name) {
  return INFRASTRUCTURE_WORDS.test(normalizeText(name));
}

function getElementCoords(element) {
  let lat = null;
  let lon = null;

  if (
    element.type === "node" &&
    typeof element.lat === "number" &&
    typeof element.lon === "number"
  ) {
    lat = element.lat;
    lon = element.lon;
  }

  if (
    (element.type === "way" || element.type === "relation") &&
    element.center
  ) {
    lat = Number(element.center.lat);
    lon = Number(element.center.lon);
  }

  if (
    typeof lat !== "number" ||
    typeof lon !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return null;
  }

  return { lat, lon };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getTags(element) {
  return element && element.tags && typeof element.tags === "object"
    ? element.tags
    : {};
}

function matchesIntent(element, intent) {
  const tags = getTags(element);
  const allowed = INTENT_TAGS[intent] || INTENT_TAGS.general;
  return allowed.some(([key, value]) => tags[key] === value);
}

function isStreetOrAddress(element) {
  const tags = getTags(element);

  if (tags.highway) return true;

  if (
    tags.place === "city" ||
    tags.place === "town" ||
    tags.place === "village" ||
    tags.place === "suburb" ||
    tags.place === "neighbourhood" ||
    tags.place === "district"
  ) {
    return true;
  }

  /*
   * Un punto que solo tiene datos de dirección (addr:street,
   * addr:housenumber) pero ningún tag de establecimiento real,
   * tampoco es un lugar.
   */
  const hasAddressTags =
    tags["addr:street"] || tags["addr:housenumber"];

  if (
    hasAddressTags &&
    !tags.amenity &&
    !tags.tourism &&
    !tags.leisure
  ) {
    return true;
  }

  /*
   * Infraestructura urbana (canteros, rotondas) que a veces queda
   * mal etiquetada en OSM como si fuera un parque o lugar de paseo.
   */
  const name = String(tags.name || "");

  if (looksLikeUrbanInfrastructure(name)) {
    return true;
  }

  return false;
}

function getRealName(element) {
  const tags = getTags(element);
  const name = String(tags.name || "").trim();
  if (!name) return null;
  if (/^\d+$/.test(name)) return null;
  return name;
}

function cleanAddress(tags) {
  const street = String(tags["addr:street"] || "").trim();
  const number = String(tags["addr:housenumber"] || "").trim();
  const postcode = String(tags["addr:postcode"] || "").trim();
  const city = String(tags["addr:city"] || "").trim();

  const parts = [];
  if (street) parts.push(number ? `${street} ${number}` : street);
  if (city) parts.push(city);
  if (postcode) parts.push(postcode);

  return parts.length ? parts.join(", ") : null;
}

function emojiForTags(tags) {
  const amenity = tags.amenity;
  const tourism = tags.tourism;
  const leisure = tags.leisure;

  if (amenity === "fast_food") return "🍔";
  if (amenity === "restaurant") return "🍽️";
  if (amenity === "cafe") return "☕";
  if (amenity === "bar" || amenity === "pub") return "🍺";
  if (amenity === "nightclub") return "🎉";
  if (tourism === "museum" || tourism === "gallery") return "🖼️";
  if (amenity === "theatre" || amenity === "arts_centre") return "🎭";
  if (leisure === "park" || leisure === "garden") return "🌳";
  if (tourism === "viewpoint") return "✨";
  if (tourism === "attraction") return "📍";
  if (leisure === "playground") return "🎡";

  return "📍";
}

function estimatePrice(tags) {
  const amenity = tags.amenity;
  const tourism = tags.tourism;
  const leisure = tags.leisure;

  if (amenity === "fast_food") return 1;
  if (
    amenity === "cafe" ||
    leisure === "park" ||
    leisure === "garden" ||
    leisure === "playground"
  ) {
    return 1;
  }
  if (amenity === "nightclub") return 3;
  if (tourism === "museum" || tourism === "gallery" || amenity === "theatre")
    return 2;

  return 2;
}

function estimateMood(tags) {
  if (
    tags.amenity === "nightclub" ||
    tags.amenity === "bar" ||
    tags.amenity === "pub"
  ) {
    return ["animado"];
  }
  return ["tranquilo"];
}

function estimateOutdoor(tags) {
  return (
    tags.leisure === "park" ||
    tags.leisure === "garden" ||
    tags.leisure === "playground" ||
    tags.tourism === "viewpoint" ||
    tags.natural === "water" ||
    tags.natural === "wood"
  );
}

function estimateKidFriendly(tags) {
  if (
    tags.amenity === "nightclub" ||
    tags.amenity === "bar" ||
    tags.amenity === "pub"
  ) {
    return false;
  }
  return true;
}

function estimateSlots(tags) {
  if (tags.amenity === "nightclub") return ["night"];
  if (tags.amenity === "bar" || tags.amenity === "pub")
    return ["afternoon", "night"];
  return ["morning", "afternoon", "night"];
}

function mapElementToVenue(element, center) {
  const tags = getTags(element);
  const name = getRealName(element);
  if (!name) return null;

  const coords = getElementCoords(element);
  if (!coords) return null;

  const distKm = haversineKm(center.lat, center.lon, coords.lat, coords.lon);
  const distMin = Math.max(1, Math.round((distKm / 4.5) * 60));

  const hours = tags.opening_hours ? parseSimpleHours(tags.opening_hours) : null;

  return {
    name,
    emoji: emojiForTags(tags),
    price: estimatePrice(tags),
    rating: 4.2,
    dist: distMin,
    mood: estimateMood(tags),
    outdoor: estimateOutdoor(tags),
    kidFriendly: estimateKidFriendly(tags),
    nightOnly: tags.amenity === "nightclub",
    slots: estimateSlots(tags),
    why: null,
    address: cleanAddress(tags),
    hours,
    categories: [tags.amenity, tags.tourism, tags.leisure].filter(Boolean),
    source: "openstreetmap",
  };
}

function parseSimpleHours(raw) {
  if (!raw || typeof raw !== "string") return null;
  const match = raw.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!match) return null;
  return [match[1], match[2]];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  const { city, intent } = req.body || {};

  if (!city || typeof city !== "string" || !city.trim()) {
    res.status(400).json({ error: "missing-city" });
    return;
  }

  const normalizedIntent = INTENT_TAGS[intent] ? intent : "general";

  try {
    const location = await geocodeLocation(city.trim());

    if (!location) {
      res.status(200).json({ city, resolvedCity: null, places: [] });
      return;
    }

    /*
     * 1. Buscamos candidatos reales (restaurantes, bares, museos,
     *    etc.) según el intent.
     */
    const rawElements = await searchPlaces({
      lat: location.lat,
      lon: location.lon,
      intent: normalizedIntent,
      limit: 60,
    });

    /*
     * 2. Filtros básicos: intent correcto, no es calle/dirección por
     *    sus propios tags, y tiene nombre real.
     */
    const basicCandidates = rawElements
      .filter((element) => matchesIntent(element, normalizedIntent))
      .filter((element) => !isStreetOrAddress(element))
      .filter((element) => !!getRealName(element));

    /*
     * 3. Para cada candidato que sobrevivió, calculamos sus
     *    coordenadas reales (las necesitamos para el paso 4 y para
     *    el mapeo final).
     */
    const withCoords = basicCandidates
      .map((element) => ({
        element,
        coords: getElementCoords(element),
      }))
      .filter((c) => c.coords !== null);

    /*
     * 4. VERIFICACIÓN CRUZADA: chequeamos, cerca de cada candidato
     *    puntual (no de toda la zona), si existe una calle real con
     *    el mismo nombre. Esto es lo que elimina definitivamente
     *    casos como "Darregueyra" sin necesidad de un parche por
     *    nombre, y sin colgar la consulta (el bug anterior era pedir
     *    todas las calles en 15km de radio, lo que se caía por
     *    timeout y dejaba el filtro sin efecto).
     */
    const nearbyStreetNames = await fetchStreetNamesNearCandidates(
      withCoords.map((c) => c.coords)
    );

    const seen = new Set();

    const places = withCoords
      .filter(({ element }) => {
        const name = getRealName(element);
        return !nearbyStreetNames.has(normalizeText(name));
      })
      .map(({ element }) => mapElementToVenue(element, location))
      .filter(Boolean)
      .filter((place) => {
        const key =
          normalizeText(place.name) + "|" + normalizeText(place.address || "");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 20);

    res.status(200).json({
      city,
      resolvedCity: location.label,
      places,
    });
  } catch (err) {
    console.error("OpenStreetMap / Overpass error:", err);
    res.status(502).json({ error: "places-request-failed" });
  }
}
