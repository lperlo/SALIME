/* ------------------------------------------------------------------ */
/* api/lugares.js  (VERSIÓN GEOAPIFY - REEMPLAZA LA VERSIÓN DE GEMINI) */
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

function emojiFor(categories) {
  const cats = categories || [];
  if (cats.some((c) => c.includes("fast_food"))) return "🍔";
  if (cats.some((c) => c.includes("restaurant"))) return "🍽️";
  if (cats.some((c) => c.includes("cafe"))) return "☕";
  if (cats.some((c) => c.includes("bar") || c.includes("pub"))) return "🍺";
  if (cats.some((c) => c.includes("nightclub"))) return "🎉";
  if (cats.some((c) => c.includes("museum") || c.includes("culture"))) return "🖼️";
  if (cats.some((c) => c.includes("park"))) return "🌳";
  if (cats.some((c) => c.includes("natural") || c.includes("water"))) return "🌿";
  if (cats.some((c) => c.includes("viewpoint"))) return "✨";
  if (cats.some((c) => c.includes("playground") || c.includes("activity_park"))) return "🎡";
  return "📍";
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ------------------------------------------------------------------ */
/* Geoapify: geocodificar la ciudad/zona pedida                       */
/* ------------------------------------------------------------------ */

async function geocodeCity(city) {
  const url =
    `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(city)}` +
    `&limit=1&apiKey=${GEOAPIFY_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("geoapify-geocode-error");

  const data = await res.json();
  const feature = data && data.features && data.features[0];
  if (!feature) return null;

  const [lon, lat] = feature.geometry.coordinates;
  const resolvedCity =
    (feature.properties && (feature.properties.city || feature.properties.formatted)) || city;

  return { lat, lon, resolvedCity };
}

/* ------------------------------------------------------------------ */
/* Geoapify: buscar lugares reales por categoría                      */
/* ------------------------------------------------------------------ */

async function fetchPlaces({ lat, lon, categories, radius }) {
  const catString = categories.join(",");
  const url =
    `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(catString)}` +
    `&filter=circle:${lon},${lat},${radius}` +
    `&bias=proximity:${lon},${lat}` +
    `&limit=20&apiKey=${GEOAPIFY_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("geoapify-places-error");

  const data = await res.json();
  return Array.isArray(data.features) ? data.features : [];
}

function mapFeatureToVenue(feature) {
  const props = feature.properties || {};
  const name = props.name ? String(props.name).trim() : null;

  // Sin nombre real no lo mostramos: evita que aparezcan plazas/calles
  // genéricas sin identidad de comercio.
  if (!name) return null;

  const categories = Array.isArray(props.categories) ? props.categories : [];

  const address =
    props.address_line2 || props.formatted || props.address_line1 || null;

  return {
    id: props.place_id || `${name}|${address || ""}`,
    name,
    emoji: emojiFor(categories),
    price: estimatePrice(categories),
    rating: 4.2,
    dist: typeof props.distance === "number" ? Math.round(props.distance) : null,
    mood: estimateMood(categories),
    outdoor: estimateOutdoor(categories),
    kidFriendly: estimateKidFriendly(categories),
    nightOnly: estimateNightOnly(categories),
    slots: estimateSlots(categories),
    why: null,
    address,
    hours: (props.opening_hours) || null,
    categories,
    source: "geoapify",
  };
}

/* ------------------------------------------------------------------ */
/* Handler                                                            */
/* ------------------------------------------------------------------ */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  if (!GEOAPIFY_KEY) {
    res.status(500).json({ error: "missing-geoapify-key" });
    return;
  }

  const { city, intent, exclude, radius } = req.body || {};

  if (!city || typeof city !== "string" || !city.trim()) {
    res.status(400).json({ error: "missing-city" });
    return;
  }

  const categories = INTENT_CATEGORIES[intent] || INTENT_CATEGORIES.general;
  const searchRadius = typeof radius === "number" ? radius : 6000; // metros
  const excludeIds = new Set(Array.isArray(exclude) ? exclude : []);

  try {
    const geo = await geocodeCity(city.trim());

    if (!geo) {
      res.status(200).json({ city, resolvedCity: city, places: [] });
      return;
    }

    const features = await fetchPlaces({
      lat: geo.lat,
      lon: geo.lon,
      categories,
      radius: searchRadius,
    });

    const seen = new Set();
    let places = features
      .map(mapFeatureToVenue)
      .filter(Boolean)
      .filter((place) => {
        const key = place.id.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      // "Cambiar todo" manda los ids ya mostrados en `exclude` para que
      // no se repitan los mismos lugares.
      .filter((place) => !excludeIds.has(place.id));

    // Variedad real: se desordena el conjunto completo devuelto por
    // Geoapify (no siempre los primeros 6-8) antes de recortar.
    places = shuffle(places).slice(0, 8);

    res.status(200).json({
      city,
      resolvedCity: geo.resolvedCity,
      places,
    });
  } catch (err) {
    res.status(502).json({ error: "geoapify-request-failed" });
  }
    }
