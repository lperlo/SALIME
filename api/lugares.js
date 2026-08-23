/* api/lugares.js */

const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY;

const INTENT_CATEGORIES = {
  comer: [
    "catering.restaurant",
    "catering.fast_food",
    "catering.cafe",
    "catering.food_court",
    "catering.bar",
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
    "catering.bar",
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
    "catering.bar",
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
    "catering.bar",
  ],
};

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:()]/g, " ")
    .replace(/\s+/g, " ");
}

/*
 * Coordenadas aproximadas de barrios conocidos
 * de Córdoba.
 *
 * IMPORTANTE:
 * Estas coordenadas son solamente el CENTRO DE BÚSQUEDA.
 * No son un lugar recomendado.
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

function getKnownLocation(text) {
  const normalized = normalizeText(text)
    .replace(/\b(barrio|zona|sector|cordoba|argentina)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (KNOWN_LOCATIONS[normalized]) {
    return KNOWN_LOCATIONS[normalized];
  }

  /*
   * También detectamos el barrio aunque venga
   * acompañado de otras palabras.
   */
  for (const key of Object.keys(KNOWN_LOCATIONS)) {
    if (
      normalized === key ||
      normalized.includes(key)
    ) {
      return KNOWN_LOCATIONS[key];
    }
  }

  return null;
}

async function geocodeLocation(text) {
  const query = String(text || "").trim();

  if (!query) {
    return null;
  }

  /*
   * PRIMERO buscamos barrios conocidos.
   * Así "Güemes", "barrio Güemes",
   * "Güemes, Córdoba", etc. terminan
   * en el mismo punto de búsqueda.
   */
  const known = getKnownLocation(query);

  if (known) {
    return known;
  }

  /*
   * Para ubicaciones desconocidas usamos Geoapify.
   */
  const url =
    "https://api.geoapify.com/v1/geocode/search" +
    `?text=${encodeURIComponent(
      `${query}, Córdoba, Argentina`
    )}` +
    "&filter=countrycode:ar" +
    "&limit=20" +
    "&format=json" +
    "&lang=es" +
    `&apiKey=${GEOAPIFY_KEY}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `geoapify-geocode-error-${response.status}`
    );
  }

  const data = await response.json();

  const results = Array.isArray(data.results)
    ? data.results
    : [];

  if (!results.length) {
    return null;
  }

  const wanted = normalizeText(query);

  const scored = results.map((r) => {
    const name = normalizeText(r.name);
    const city = normalizeText(r.city);
    const suburb = normalizeText(r.suburb);
    const neighbourhood = normalizeText(
      r.neighbourhood
    );
    const district = normalizeText(r.district);
    const formatted = normalizeText(
      r.formatted
    );

    let score = 0;

    if (
      name === wanted ||
      suburb === wanted ||
      neighbourhood === wanted ||
      district === wanted
    ) {
      score += 200;
    }

    if (formatted.includes(wanted)) {
      score += 50;
    }

    if (city === "cordoba") {
      score += 100;
    }

    if (
      suburb ||
      neighbourhood ||
      district
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

  scored.sort(
    (a, b) => b.score - a.score
  );

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
  const params = new URLSearchParams();

  params.set(
    "categories",
    categories.join(",")
  );

  /*
   * Ampliamos la cantidad de resultados para
   * que el filtro posterior tenga opciones.
   */
  params.set("limit", "200");

  params.set(
    "filter",
    `circle:${lon},${lat},3000`
  );

  params.set(
    "bias",
    `proximity:${lon},${lat}`
  );

  params.set(
    "apiKey",
    GEOAPIFY_KEY
  );

  const url =
    `https://api.geoapify.com/v2/places?${params.toString()}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `geoapify-places-error-${response.status}`
    );
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

  if (!match) {
    return null;
  }

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

  if (!name) {
    return true;
  }

  const categories =
    Array.isArray(props.categories)
      ? props.categories
      : [];

  /*
   * Para "comer" exigimos que realmente
   * tenga una categoría de catering.
   */
  const isCatering =
    categories.some((c) =>
      String(c).startsWith(
        "catering."
      )
    );

  if (!isCatering) {
    return true;
  }

  /*
   * Excluimos explícitamente lugares que
   * no deberían aparecer como restaurantes.
   */
  const forbidden = [
    "catering.kiosk",
    "catering.vending_machine",
  ];

  if (
    categories.some((c) =>
      forbidden.includes(String(c))
    )
  ) {
    return true;
  }

  /*
   * Evitamos resultados sin ningún dato
   * útil de ubicación.
   */
  const hasAddress =
    props.street ||
    props.formatted ||
    props.city ||
    props.suburb ||
    props.neighbourhood;

  if (!hasAddress) {
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

  if (!name) {
    return null;
  }

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
     * No inventamos ratings.
     */
    rating: 0,

    dist: distanceMinutes,

    mood:
      categories.some(
        (c) =>
          c.includes("bar") ||
          c.includes("pub")
      )
        ? ["animado"]
        : ["tranquilo"],

    outdoor: false,

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
        .slice(0, 30);

    console.log(
      "SALIME lugares:",
      {
        query: city,
        intent: canonicalIntent,
        resolvedCity:
          location.label,
        encontrados:
          features.length,
        validos:
          places.length,
      }
    );

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
