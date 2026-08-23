/* api/lugares.js */

const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY;

const INTENT_CATEGORIES = {
  comer: [
    "catering.restaurant",
    "catering.fast_food",
    "catering.food_court",
    "catering.cafe",
  ],

  beber: [
    "catering.bar",
    "catering.pub",
    "catering.cafe",
  ],

  cultura: [
    "entertainment.museum",
    "entertainment.culture.gallery",
    "entertainment.culture.theatre",
    "entertainment.culture.arts_centre",
  ],

  paseo: [
    "leisure.park",
    "tourism.attraction.viewpoint",
  ],

  aire_libre: [
    "leisure.park",
    "natural",
    "natural.water",
  ],

  fiesta: [
    "entertainment.nightclub",
    "catering.bar",
    "catering.pub",
  ],

  familia: [
    "catering.restaurant",
    "catering.fast_food",
    "catering.cafe",
    "leisure.playground",
    "entertainment.museum",
  ],

  general: [
    "catering.restaurant",
    "catering.fast_food",
    "catering.cafe",
    "catering.bar",
  ],

  CENA: [
    "catering.restaurant",
    "catering.fast_food",
    "catering.food_court",
    "catering.cafe",
  ],

  BEBIDA: [
    "catering.bar",
    "catering.pub",
    "catering.cafe",
  ],

  FINAL: [
    "catering.restaurant",
    "catering.fast_food",
    "catering.cafe",
  ],

  CULTURA: [
    "entertainment.museum",
    "entertainment.culture.gallery",
    "entertainment.culture.theatre",
    "entertainment.culture.arts_centre",
  ],

  PASEO: [
    "leisure.park",
    "tourism.attraction.viewpoint",
  ],

  AIRE_LIBRE: [
    "leisure.park",
    "natural",
    "natural.water",
  ],

  FIESTA: [
    "entertainment.nightclub",
    "catering.bar",
    "catering.pub",
  ],

  ACTIVIDAD_FAMILIA: [
    "leisure.playground",
    "entertainment.activity_park",
    "entertainment.museum",
  ],

  MERIENDA_FAMILIA: [
    "catering.cafe",
    "catering.restaurant",
  ],

  CIERRE_FAMILIA: [
    "catering.restaurant",
    "catering.fast_food",
    "catering.cafe",
  ],
};

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/*
 * Barrios de Córdoba que NO deben pasar por el
 * geocodificador como si fueran ciudades.
 */
const KNOWN_LOCATIONS = {
  guemes: {
    lat: -31.42536,
    lon: -64.19419,
    label: "Güemes, Córdoba, Argentina",
  },

  "nueva cordoba": {
    lat: -31.42547,
    lon: -64.18651,
    label: "Nueva Córdoba, Córdoba, Argentina",
  },

  "alta cordoba": {
    lat: -31.39854,
    lon: -64.18070,
    label: "Alta Córdoba, Córdoba, Argentina",
  },

  "general paz": {
    lat: -31.40955,
    lon: -64.17150,
    label: "General Paz, Córdoba, Argentina",
  },

  centro: {
    lat: -31.41667,
    lon: -64.18333,
    label: "Centro, Córdoba, Argentina",
  },
};

async function geocodeLocation(text) {
  const query = String(text || "").trim();

  if (!query) return null;

  const normalized = normalizeText(query)
    .replace(/\b(barrio|zona|sector)\b/g, "")
    .trim();

  /*
   * PRIMERO:
   * barrios conocidos de Córdoba.
   */
  if (KNOWN_LOCATIONS[normalized]) {
    return KNOWN_LOCATIONS[normalized];
  }

  /*
   * DESPUÉS:
   * geocodificación normal.
   */
  const url =
    "https://api.geoapify.com/v1/geocode/search" +
    `?text=${encodeURIComponent(
      query + ", Córdoba, Argentina"
    )}` +
    "&filter=countrycode:ar" +
    "&limit=20" +
    "&format=json" +
    "&lang=es" +
    `&apiKey=${GEOAPIFY_KEY}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("geoapify-geocode-error");
  }

  const data = await response.json();

  const results = Array.isArray(data.results)
    ? data.results
    : [];

  if (!results.length) return null;

  const wanted = normalizeText(query);

  const scored = results.map((r) => {
    const name = normalizeText(r.name);
    const city = normalizeText(r.city);
    const suburb = normalizeText(r.suburb);
    const neighbourhood = normalizeText(r.neighbourhood);
    const district = normalizeText(r.district);
    const formatted = normalizeText(r.formatted);

    let score = 0;

    if (formatted.includes("cordoba")) score += 100;

    if (name === wanted) score += 100;

    if (suburb === wanted) score += 100;

    if (neighbourhood === wanted) score += 100;

    if (district === wanted) score += 100;

    if (formatted.includes(wanted)) score += 30;

    const type = normalizeText(r.result_type);

    if (
      type.includes("suburb") ||
      type.includes("neighbourhood") ||
      type.includes("district")
    ) {
      score += 30;
    }

    if (
      typeof r.lat !== "number" ||
      typeof r.lon !== "number"
    ) {
      score -= 1000;
    }

    return {
      result: r,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0]?.result;

  if (
    !best ||
    typeof best.lat !== "number" ||
    typeof best.lon !== "number"
  ) {
    return null;
  }

  return {
    lat: best.lat,
    lon: best.lon,
    label:
      best.formatted ||
      query,
  };
}

async function searchPlaces({
  lat,
  lon,
  categories,
}) {
  const params = new URLSearchParams({
    categories: categories.join(","),
    limit: "100",
    bias: `proximity:${lon},${lat}`,
    filter: `circle:${lon},${lat},5000`,
    apiKey: GEOAPIFY_KEY,
  });

  const url =
    `https://api.geoapify.com/v2/places?${params}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("geoapify-places-error");
  }

  const data = await response.json();

  return Array.isArray(data.features)
    ? data.features
    : [];
}

function haversineKm(
  lat1,
  lon1,
  lat2,
  lon2
) {
  const R = 6371;

  const dLat =
    ((lat2 - lat1) * Math.PI) / 180;

  const dLon =
    ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}

function parseSimpleHours(raw) {
  if (!raw || typeof raw !== "string") {
    return null;
  }

  const match = raw.match(
    /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/
  );

  if (!match) return null;

  return [
    match[1],
    match[2],
  ];
}

function matchesIntent(
  feature,
  allowedCategories
) {
  const categories =
    feature?.properties?.categories;

  if (!Array.isArray(categories)) {
    return false;
  }

  return categories.some((actual) =>
    allowedCategories.some(
      (allowed) =>
        actual === allowed ||
        actual.startsWith(
          `${allowed}.`
        )
    )
  );
}

function isBadPlace(feature) {
  const props =
    feature?.properties || {};

  const name =
    String(props.name || "").trim();

  if (!name) return true;

  /*
   * Nunca convertir una dirección,
   * calle o barrio en un lugar.
   */
  if (/^\d{1,6}$/.test(name)) {
    return true;
  }

  const badPrefixes = [
    "leisure.park",
    "tourism.sights",
    "tourism.attraction",
    "amenity.kiosk",
    "building",
  ];

  const categories =
    Array.isArray(props.categories)
      ? props.categories
      : [];

  /*
   * Si tiene alguna categoría gastronómica,
   * permitimos el resultado.
   */
  const isFood =
    categories.some((c) =>
      String(c).startsWith("catering.")
    );

  if (isFood) return false;

  if (
    categories.some((c) =>
      badPrefixes.some((bad) =>
        String(c).startsWith(bad)
      )
    )
  ) {
    return true;
  }

  return false;
}

function emojiFor(categories) {
  if (
    categories.some((c) =>
      c.includes("fast_food")
    )
  ) {
    return "🍔";
  }

  if (
    categories.some((c) =>
      c.includes("restaurant")
    )
  ) {
    return "🍽️";
  }

  if (
    categories.some((c) =>
      c.includes("cafe")
    )
  ) {
    return "☕";
  }

  if (
    categories.some(
      (c) =>
        c.includes("bar") ||
        c.includes("pub")
    )
  ) {
    return "🍺";
  }

  return "📍";
}

function mapFeature(
  feature,
  center
) {
  const props =
    feature?.properties || {};

  const categories =
    Array.isArray(props.categories)
      ? props.categories
      : [];

  const coords =
    feature?.geometry?.coordinates;

  if (
    !Array.isArray(coords) ||
    coords.length < 2
  ) {
    return null;
  }

  const lon = Number(coords[0]);
  const lat = Number(coords[1]);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return null;
  }

  const name =
    String(props.name || "").trim();

  if (!name) return null;

  const distanceKm =
    haversineKm(
      center.lat,
      center.lon,
      lat,
      lon
    );

  const distanceMinutes =
    Math.max(
      1,
      Math.round(
        (distanceKm / 4.5) * 60
      )
    );

  const street = [
    props.street,
    props.housenumber,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const area = [
    props.suburb ||
      props.neighbourhood ||
      props.district,
    props.city,
  ]
    .filter(Boolean)
    .join(", ")
    .trim();

  const address =
    street && area
      ? `${street}, ${area}`
      : props.formatted ||
        area ||
        street ||
        null;

  return {
    name,

    emoji:
      emojiFor(categories),

    price: 2,

    /*
     * No inventamos una puntuación.
     */
    rating: 0,

    dist:
      distanceMinutes,

    mood:
      categories.some(
        (c) =>
          c.includes("bar") ||
          c.includes("pub") ||
          c.includes("nightclub")
      )
        ? ["animado"]
        : ["tranquilo"],

    outdoor:
      categories.some(
        (c) =>
          c.includes("park") ||
          c.includes("outdoor")
      ),

    kidFriendly:
      !categories.some(
        (c) =>
          c.includes("nightclub")
      ),

    nightOnly:
      categories.some(
        (c) =>
          c.includes("nightclub")
      ),

    slots:
      categories.some(
        (c) =>
          c.includes("nightclub")
      )
        ? ["night"]
        : [
            "morning",
            "afternoon",
            "night",
          ],

    why: null,

    address,

    hours:
      parseSimpleHours(
        props.opening_hours
      ),

    categories,

    source: "geoapify",
  };
}

export default async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({
        error:
          "method-not-allowed",
      });
  }

  if (!GEOAPIFY_KEY) {
    return res
      .status(500)
      .json({
        error:
          "missing-geoapify-key",
      });
  }

  const {
    city,
    intent,
  } = req.body || {};

  if (
    !city ||
    typeof city !== "string" ||
    !city.trim()
  ) {
    return res
      .status(400)
      .json({
        error:
          "missing-city",
      });
  }

  const rawIntent =
    String(intent || "")
      .trim()
      .toLowerCase();

  const aliases = {
    cena: "comer",
    bebida: "beber",
    final: "comer",

    actividad_familia:
      "familia",

    merienda_familia:
      "familia",

    cierre_familia:
      "comer",
  };

  const canonicalIntent =
    aliases[rawIntent] ||
    rawIntent;

  const categories =
    INTENT_CATEGORIES[
      canonicalIntent
    ] ||
    INTENT_CATEGORIES.general;

  try {
    const location =
      await geocodeLocation(
        city.trim()
      );

    if (!location) {
      return res
        .status(200)
        .json({
          city,
          resolvedCity: null,
          places: [],
        });
    }

    const features =
      await searchPlaces({
        lat: location.lat,
        lon: location.lon,
        categories,
      });

    const seen =
      new Set();

    const places =
      features
        .filter((feature) =>
          matchesIntent(
            feature,
            categories
          )
        )
        .filter(
          (feature) =>
            !isBadPlace(feature)
        )
        .map((feature) =>
          mapFeature(
            feature,
            location
          )
        )
        .filter(Boolean)
        .sort(
          (a, b) =>
            a.dist - b.dist
        )
        .filter((place) => {
          const key =
            normalizeText(
              place.name
            ) +
            "|" +
            normalizeText(
              place.address
            );

          if (seen.has(key)) {
            return false;
          }

          seen.add(key);

          return true;
        })
        .slice(0, 20);

    return res
      .status(200)
      .json({
        city,

        resolvedCity:
          location.label,

        places,
      });
  } catch (error) {
    console.error(
      "api/lugares:",
      error
    );

    return res
      .status(502)
      .json({
        error:
          "places-request-failed",
        places: [],
      });
  }
    }
