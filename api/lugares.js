/* ------------------------------------------------------------------ */
/* api/lugares.js                                                      */
/*                                                                      */
/* Busca lugares REALES (Geoapify) para una ciudad + intención dadas.  */
/* No inventa lugares: si Geoapify no devuelve nada, la respuesta      */
/* viene con places: [] y el frontend debe manejar ese caso.           */
/*                                                                      */
/* No modifica ni depende de api/interpretar.js.                       */
/* ------------------------------------------------------------------ */

const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY;

/*
 * Mapeo de intención -> categorías de Geoapify.
 * Referencia: https://apidocs.geoapify.com/docs/places/#categories
 */
const INTENT_CATEGORIES = {
  comer: ["catering.restaurant", "catering.fast_food"],
  beber: ["catering.bar", "catering.pub", "catering.cafe"],
  cultura: ["entertainment.museum", "entertainment.culture", "tourism.sights"],
  aire_libre: ["leisure.park", "natural.forest", "natural.water"],
  paseo: ["leisure.park", "tourism.sights"],
  fiesta: ["entertainment.nightclub", "catering.bar"],
  familia: ["leisure.park", "entertainment.museum", "catering.restaurant"],
  general: ["catering.restaurant", "catering.cafe", "leisure.park"],
};

/*
 * Estimación de precio (1 = económico, 2 = medio, 3 = alto) por
 * categoría de Geoapify, ya que Geoapify no informa nivel de precio
 * de forma confiable.
 */
function estimatePrice(categories) {
  const cats = categories || [];

  if (cats.some((c) => c.includes("fast_food"))) return 1;
  if (cats.some((c) => c.includes("cafe"))) return 1;
  if (cats.some((c) => c.includes("park") || c.includes("natural"))) return 1;
  if (cats.some((c) => c.includes("nightclub"))) return 3;
  if (cats.some((c) => c.includes("museum") || c.includes("culture"))) return 2;
  if (cats.some((c) => c.includes("bar") || c.includes("pub"))) return 2;
  if (cats.some((c) => c.includes("restaurant"))) return 2;

  return 2;
}

/*
 * Estimación de "mood" (tranquilo / animado) por categoría, ya que
 * Geoapify no informa esto.
 */
function estimateMood(categories) {
  const cats = categories || [];

  if (
    cats.some(
      (c) =>
        c.includes("bar") ||
        c.includes("pub") ||
        c.includes("nightclub")
    )
  ) {
    return ["animado"];
  }

  if (
    cats.some(
      (c) =>
        c.includes("cafe") ||
        c.includes("park") ||
        c.includes("natural") ||
        c.includes("museum") ||
        c.includes("culture")
    )
  ) {
    return ["tranquilo"];
  }

  return ["tranquilo", "animado"];
}

function estimateOutdoor(categories) {
  const cats = categories || [];
  return cats.some((c) => c.includes("park") || c.includes("natural"));
}

function estimateKidFriendly(categories) {
  const cats = categories || [];

  if (cats.some((c) => c.includes("bar") || c.includes("pub") || c.includes("nightclub"))) {
    return false;
  }

  return true;
}

function estimateNightOnly(categories) {
  const cats = categories || [];
  return cats.some((c) => c.includes("nightclub"));
}

function estimateSlots(categories) {
  const cats = categories || [];

  if (cats.some((c) => c.includes("nightclub"))) {
    return ["night"];
  }

  if (cats.some((c) => c.includes("bar") || c.includes("pub"))) {
    return ["afternoon", "night"];
  }

  return ["morning", "afternoon", "night"];
}

function emojiFor(categories) {
  const cats = categories || [];

  if (cats.some((c) => c.includes("fast_food"))) return "🍔";
  if (cats.some((c) => c.includes("restaurant"))) return "🍽️";
  if (cats.some((c) => c.includes("cafe"))) return "☕";
  if (cats.some((c) => c.includes("bar") || c.includes("pub"))) return "🍺";
  if (cats.some((c) => c.includes("nightclub"))) return "🎉";
  if (cats.some((c) => c.includes("museum") || c.includes("culture"))) return "🖼️";
  if (cats.some((c) => c.includes("park"))) return "🌳";
  if (cats.some((c) => c.includes("natural"))) return "🌿";
  if (cats.some((c) => c.includes("sights"))) return "✨";

  return "📍";
}

/*
 * Intenta parsear un horario estilo OSM simple ("Mo-Su 09:00-20:00",
 * "09:00-23:00"). Si el formato es más complejo o no viene, devolvemos
 * null y el lugar se trata como "sin info de horario" (igual que hoy
 * hace isOpenAt en el frontend cuando no hay datos: se asume abierto).
 */
function parseSimpleHours(raw) {
  if (!raw || typeof raw !== "string") return null;

  const match = raw.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);

  if (!match) return null;

  return [match[1], match[2]];
}

async function geocodeCity(city) {
  const url =
    "https://api.geoapify.com/v1/geocode/search" +
    `?text=${encodeURIComponent(city)}` +
    "&type=city" +
    "&format=json" +
    `&apiKey=${GEOAPIFY_KEY}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("geoapify-geocode-error");
  }

  const data = await res.json();

  const first = data && data.results && data.results[0];

  if (!first) return null;

  return {
    lat: first.lat,
    lon: first.lon,
    label: first.formatted || city,
  };
}

async function searchPlaces({ lat, lon, categories, limit = 15 }) {
  const url =
    "https://api.geoapify.com/v2/places" +
    `?categories=${encodeURIComponent(categories.join(","))}` +
    `&filter=circle:${lon},${lat},15000` +
    `&bias=proximity:${lon},${lat}` +
    `&limit=${limit}` +
    `&apiKey=${GEOAPIFY_KEY}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("geoapify-places-error");
  }

  const data = await res.json();

  return Array.isArray(data.features) ? data.features : [];
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function mapFeatureToVenue(feature, cityCenter) {
  const props = feature.properties || {};
  const categories = props.categories || [];

  const [lon, lat] = feature.geometry ? feature.geometry.coordinates : [null, null];

  const distKm =
    lat != null && lon != null
      ? haversineKm(cityCenter.lat, cityCenter.lon, lat, lon)
      : null;

  const hours = parseSimpleHours(props.opening_hours);

  return {
    name: props.name || props.address_line1 || "Lugar sin nombre",
    emoji: emojiFor(categories),
    price: estimatePrice(categories),
    rating: props.rank && props.rank.confidence ? Math.round(props.rank.confidence * 5 * 10) / 10 : 4.2,
    dist: distKm != null ? Math.max(1, Math.round(distKm * 12)) : 10, // aprox min caminando
    mood: estimateMood(categories),
    outdoor: estimateOutdoor(categories),
    kidFriendly: estimateKidFriendly(categories),
    nightOnly: estimateNightOnly(categories),
    slots: estimateSlots(categories),
    why: props.address_line2 || props.formatted || "lugar real cercano a la zona indicada",
    address: props.formatted || null,
    hours, // [apertura, cierre] o null si no hay info
    source: "geoapify",
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  if (!GEOAPIFY_KEY) {
    res.status(500).json({ error: "missing-geoapify-key" });
    return;
  }

  const { city, intent } = req.body || {};

  if (!city || typeof city !== "string" || !city.trim()) {
    res.status(400).json({ error: "missing-city" });
    return;
  }

  const categories = INTENT_CATEGORIES[intent] || INTENT_CATEGORIES.general;

  try {
    const cityInfo = await geocodeCity(city.trim());

    if (!cityInfo) {
      res.status(200).json({ city, resolvedCity: null, places: [] });
      return;
    }

    const features = await searchPlaces({
      lat: cityInfo.lat,
      lon: cityInfo.lon,
      categories,
    });

    const places = features
      .map((f) => mapFeatureToVenue(f, cityInfo))
      .filter((p) => p.name && p.name !== "Lugar sin nombre");

    res.status(200).json({
      city,
      resolvedCity: cityInfo.label,
      places,
    });
  } catch (err) {
    res.status(502).json({ error: "geoapify-request-failed" });
  }
}
