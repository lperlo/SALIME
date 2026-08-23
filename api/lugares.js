/* ------------------------------------------------------------------ */
/* api/lugares.js  (VERSIÓN GEOAPIFY - RECONSTRUIDA)                   */
/*                                                                     */
/* Busca lugares REALES usando Geoapify (Geocoding + Places API).      */
/* Gemini queda fuera de esta parte: acá NO se inventa nada, todo      */
/* sale directamente de Geoapify.                                      */
/*                                                                     */
/* Variables de entorno necesarias en Vercel:                          */
/*   GEOAPIFY_API_KEY                                                  */
/*                                                                     */
/* Mantiene la MISMA forma de respuesta que la versión anterior:       */
/*   { city, resolvedCity, places: [ {name, emoji, price, rating,      */
/*     dist, mood, outdoor, kidFriendly, nightOnly, slots, why,        */
/*     address, hours, categories, source} ] }                         */
/* ------------------------------------------------------------------ */

const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY;

// Centro por defecto: Córdoba Capital (se usa si no hay location o
// si el geocoding no encuentra nada).
const DEFAULT_CENTER = { lat: -31.4201, lon: -64.1888 };
const DEFAULT_CITY_LABEL = "Córdoba";

const INTENT_CATEGORIES = {
  comer: ["catering.restaurant", "catering.fast_food", "catering.food_court"],
  beber: ["catering.cafe", "catering.bar", "catering.pub"],
  cultura: [
    "entertainment.museum",
    "entertainment.culture.gallery",
    "entertainment.culture.theatre",
    "entertainment.culture.arts_centre",
  ],
  paseo: ["leisure.park", "tourism.attraction.viewpoint", "natural"],
  aire_libre: ["leisure.park", "natural", "natural.water"],
  fiesta: ["entertainment.nightclub", "catering.bar", "catering.pub"],
  familia: [
    "leisure.playground",
    "entertainment.activity_park",
    "entertainment.museum",
    "catering.restaurant",
  ],
  general: [
    "catering.restaurant",
    "catering.cafe",
    "entertainment.museum",
    "leisure.park",
  ],
};

const VALID_INTENTS = Object.keys(INTENT_CATEGORIES);

/* ------------------------------------------------------------------ */
/* Helpers de estimación (ya existentes, sin tocar la lógica)          */
/* ------------------------------------------------------------------ */

function estimatePrice(categories) {
  const cats = categories || [];
  if (cats.some((c) => c.includes("fast_food"))) return 1;
  if (cats.some((c) => c.includes("cafe"))) return 1;
  if (cats.some((c) => c.includes("playground") || c.includes("park") || c.includes("natural"))) return 1;
  if (cats.some((c) => c.includes("nightclub"))) return 3;
  if (cats.some((c) => c.includes("museum") || c.includes("culture"))) return 2;
  if (cats.some((c) => c.includes("bar") || c.includes("pub"))) return 2;
  if (cats.some((c) => c.includes("restaurant"))) return 2;
  return 2;
}

function estimateMood(categories) {
  const cats = categories || [];
  if (cats.some((c) => c.includes("nightclub") || c.includes("bar") || c.includes("pub"))) return ["animado"];
  return ["tranquilo"];
}

function estimateOutdoor(categories) {
  const cats = categories || [];
  return cats.some((c) => c.includes("park") || c.includes("natural") || c.includes("water") || c.includes("viewpoint"));
}

function estimateKidFriendly(categories) {
  const cats = categories || [];
  if (cats.some((c) => c.includes("bar") || c.includes("pub") || c.includes("nightclub"))) return false;
  return true;
}

function estimateNightOnly(categories) {
  const cats = categories || [];
  return cats.some((c) => c.includes("nightclub"));
}

function estimateSlots(categories) {
  const cats = categories || [];
  if (cats.some((c) => c.includes("nightclub"))) return ["night"];
  if (cats.some((c) => c.includes("bar") || c.includes("pub"))) return ["afternoon", "night"];
  return ["morning", "afternoon", "night"];
}

/**
 * Emoji representativo según las categorías de Geoapify del lugar.
 * Se revisa en orden de especificidad para no quedarse siempre en
 * el emoji "genérico".
 */
function emojiFor(categories) {
  const cats = categories || [];

  if (cats.some((c) => c.includes("fast_food"))) return "🍔";
  if (cats.some((c) => c.includes("restaurant"))) return "🍽️";
  if (cats.some((c) => c.includes("cafe"))) return "☕";
  if (cats.some((c) => c.includes("nightclub"))) return "🎶";
  if (cats.some((c) => c.includes("bar") || c.includes("pub"))) return "🍹";
  if (cats.some((c) => c.includes("museum"))) return "🖼️";
  if (cats.some((c) => c.includes("theatre"))) return "🎭";
  if (cats.some((c) => c.includes("gallery") || c.includes("arts_centre"))) return "🎨";
  if (cats.some((c) => c.includes("playground"))) return "🛝";
  if (cats.some((c) => c.includes("activity_park"))) return "🎡";
  if (cats.some((c) => c.includes("viewpoint"))) return "🌄";
  if (cats.some((c) => c.includes("water"))) return "💧";
  if (cats.some((c) => c.includes("park") || c.includes("natural"))) return "🌳";

  return "📍";
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function normalizeIntent(intent) {
  return VALID_INTENTS.includes(intent) ? intent : "general";
}

/** Fisher-Yates simple, para no devolver siempre el mismo orden/top-N
 *  cuando se repite la misma búsqueda (evita la sensación de
 *  "recomendaciones repetidas" con parámetros idénticos). */
function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function geocodeLocation(locationText) {
  if (!locationText) return null;

  const url =
    "https://api.geoapify.com/v1/geocode/search" +
    `?text=${encodeURIComponent(locationText + ", Córdoba, Argentina")}` +
    `&limit=1&apiKey=${GEOAPIFY_KEY}`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature) return null;

  const [lon, lat] = feature.geometry.coordinates;
  const label =
    feature.properties.formatted ||
    feature.properties.city ||
    locationText;

  return { lat, lon, label };
}

async function searchPlaces({ lat, lon, categories, radius, limit }) {
  const url =
    "https://api.geoapify.com/v2/places" +
    `?categories=${encodeURIComponent(categories.join(","))}` +
    `&filter=circle:${lon},${lat},${radius}` +
    `&bias=proximity:${lon},${lat}` +
    `&limit=${limit}` +
    `&apiKey=${GEOAPIFY_KEY}`;

  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text();
    console.error("Geoapify places error:", res.status, errText);
    return [];
  }

  const data = await res.json();
  return data.features || [];
}

/**
 * Convierte un feature de Geoapify en el objeto de lugar que espera
 * el frontend. Devuelve null si el feature no tiene nombre propio
 * (para no mostrar calles/zonas/barrios como si fueran "el lugar").
 */
function mapFeatureToPlace(feature, intent) {
  const props = feature.properties || {};
  const categories = props.categories || [];

  if (!props.name || !props.name.trim()) {
    return null;
  }

  const distMeters =
    typeof props.distance === "number" ? props.distance : 400;

  // salime-app.jsx usa `dist` como NÚMERO de minutos caminando
  // (lo interpola directo en "${dist} min caminando aprox." y lo
  // resta para ordenar por cercanía en pick()). Convertimos metros
  // a minutos a pie (~80 m/min) en vez de devolver un string.
  const distMinutes = Math.max(1, Math.round(distMeters / 80));

  return {
    name: props.name.trim(),
    emoji: emojiFor(categories),
    price: estimatePrice(categories),
    // Geoapify no trae rating. salime-app.jsx llama a
    // rating.toFixed(1) sin chequear null -> con null esto rompe el
    // render y deja la pantalla en blanco. Usamos el mismo valor fijo
    // que ya usaba la versión anterior (según el comentario en pick()
    // del propio jsx: "todos los lugares mapeados tienen rating 4.2").
    rating: typeof props.rating === "number" ? props.rating : 4.2,
    dist: distMinutes,
    mood: estimateMood(categories),
    outdoor: estimateOutdoor(categories),
    kidFriendly: estimateKidFriendly(categories),
    nightOnly: estimateNightOnly(categories),
    slots: estimateSlots(categories),
    why: `Coincide con tu pedido de "${intent}"`,
    address: props.formatted || props.address_line2 || null,
    hours: parseSimpleHours(props.opening_hours),
    categories,
    source: "geoapify",
  };
}

/**
 * isOpenAt() en salime-app.jsx espera place.hours como
 * [ "HH:MM", "HH:MM" ]. Geoapify devuelve opening_hours como texto
 * estilo OSM (ej. "Mo-Fr 09:00-18:00"), que NO es indexable como
 * array de horas. Solo devolvemos un rango simple cuando el texto
 * trae un único patrón HH:MM-HH:MM claro; si no, null (isOpenAt ya
 * trata null como "se asume abierto", igual que un lugar sin
 * horario en DEMO_HOURS).
 */
function parseSimpleHours(raw) {
  if (typeof raw !== "string") return null;

  const match = raw.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!match) return null;

  return [match[1], match[2]];
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "método no permitido" });
    return;
  }

  if (!GEOAPIFY_KEY) {
    res.status(500).json({ error: "falta_clave_api" });
    return;
  }

  const body = req.body || {};
  const intent = normalizeIntent(body.intent);
  // salime-app.jsx (fetchRealPool) manda el campo como "city", no
  // "location". Aceptamos ambos por las dudas, pero "city" es el que
  // realmente llega hoy.
  const rawLocation =
    (typeof body.city === "string" && body.city.trim()) ||
    (typeof body.location === "string" && body.location.trim()) ||
    "";
  const locationText = rawLocation || null;
  const close = !!body.close;
  const limit = 20;
  const radius = close ? 1500 : 6000;

  try {
    let center = DEFAULT_CENTER;
    let resolvedCity = DEFAULT_CITY_LABEL;
    const cityLabel = locationText || DEFAULT_CITY_LABEL;

    if (locationText) {
      const geocoded = await geocodeLocation(locationText);
      if (geocoded) {
        center = { lat: geocoded.lat, lon: geocoded.lon };
        resolvedCity = geocoded.label;
      }
      // Si el geocoding falla, seguimos con DEFAULT_CENTER en vez de
      // cortar la búsqueda: es preferible una lista vacía más adelante
      // (si no hay resultados relevantes) que inventar una ubicación.
    }

    const categories = INTENT_CATEGORIES[intent];

    const features = await searchPlaces({
      lat: center.lat,
      lon: center.lon,
      categories,
      radius,
      limit,
    });

    const places = features
      .map((f) => mapFeatureToPlace(f, intent))
      .filter(Boolean);

    const shuffled = shuffle(places).slice(0, 8);

    res.status(200).json({
      city: cityLabel,
      resolvedCity,
      places: shuffled,
    });
  } catch (err) {
    console.error("Búsqueda de lugares fallida:", err);

    // Preferimos una lista vacía antes que inventar o romper el
    // frontend con una respuesta sin la forma esperada.
    res.status(200).json({
      city: locationText || DEFAULT_CITY_LABEL,
      resolvedCity: DEFAULT_CITY_LABEL,
      places: [],
    });
  }
}
