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
};

/*
 * Coordenadas aproximadas de barrios conocidos
 * de Córdoba.
 *
 * IMPORTANTE:
 * Son solamente el CENTRO DE BÚSQUEDA.
 * Nunca se devuelven como lugares recomendados.
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
    lon: -64.1807,
    label: "Alta Córdoba, Córdoba, Argentina",
  },

  "general paz": {
    lat: -31.40955,
    lon: -64.1715,
    label: "General Paz, Córdoba, Argentina",
  },

  centro: {
    lat: -31.41667,
    lon: -64.18333,
    label: "Centro, Córdoba, Argentina",
  },
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

function getKnownLocation(text) {
  const normalized = normalizeText(text)
    .replace(
      /\b(barrio|zona|sector|cordoba|argentina)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  if (KNOWN_LOCATIONS[normalized]) {
    return KNOWN_LOCATIONS[normalized];
  }

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
   * Primero usamos barrios conocidos.
   */
  const known = getKnownLocation(query);

  if (known) {
    return known;
  }

  /*
   * Si no es un barrio conocido,
   * usamos Geoapify para ubicarlo.
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

  const scored = results.map((result) => {
    const name = normalizeText(result.name);
    const city = normalizeText(result.city);
    const suburb = normalizeText(result.suburb);
    const neighbourhood = normalizeText(
      result.neighbourhood
    );
    const district = normalizeText(
      result.district
    );
    const formatted = normalizeText(
      result.formatted
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
      typeof result.lat !== "number" ||
      typeof result.lon !== "number"
    ) {
      score -= 1000;
    }

    return {
      result,
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
   * Pedimos muchos resultados para poder
   * filtrarlos después.
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

/*
 * Comprueba que el lugar realmente pertenece
 * a alguna de las categorías solicitadas.
 */
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

/*
 * Determina si un resultado NO es un lugar
 * válido para mostrar.
 *
 * IMPORTANTE:
 * Antes esta función exigía catering para TODOS
 * los resultados. Eso hacía que parques, museos,
 * teatros, miradores, etc. fueran eliminados.
 *
 * Ahora solamente exigimos catering cuando
 * la categoría solicitada es gastronómica.
 */
function isBadPlace(
  feature,
  allowedCategories
) {
  const props =
    feature?.properties || {};

  const name =
    String(props.name || "").trim();

  /*
   * Sin nombre no mostramos el resultado.
   */
  if (!name) {
    return true;
  }

  const categories =
    Array.isArray(props.categories)
      ? props.categories
      : [];

  if (!categories.length) {
    return true;
  }

  /*
   * Evitamos máquinas expendedoras y kioscos
   * cuando aparecen como resultados gastronómicos.
   */
  const forbidden = [
    "catering.kiosk",
    "catering.vending_machine",
  ];

  if (
    categories.some((category) =>
      forbidden.includes(String(category))
    )
  ) {
    return true;
  }

  /*
   * Si estamos buscando comida/bebida/fiesta,
   * debe existir una categoría catering.
   */
  const needsCatering =
    allowedCategories.some(
      (category) =>
        category.startsWith("catering.")
    );

  if (needsCatering) {
    const isCatering =
      categories.some((category) =>
        String(category).startsWith(
          "catering."
        )
      );

    /*
     * Para intenciones exclusivamente gastronómicas,
     * descartamos lo que no sea catering.
     *
     * En "familia" y "fiesta" también permitimos
     * categorías no gastronómicas si coinciden
     * con la intención.
     */
    const hasNonCateringMatch =
      categories.some((actual) =>
        allowedCategories.some(
          (allowed) =>
            actual === allowed ||
            actual.startsWith(
              `${allowed}.`
            )
        )
      );

    if (
      !isCatering &&
      !hasNonCateringMatch
    ) {
      return true;
    }
  }

  /*
   * Debe existir alguna información de ubicación.
   */
  const hasAddress =
    props.street ||
    props.formatted ||
    props.city ||
    props.suburb ||
    props.neighbourhood ||
    props.district;

  if (!hasAddress) {
    return true;
  }

  return false;
}

function emojiFor(categories) {
  if (
    categories.some((category) =>
      category.includes("fast_food")
    )
  ) {
    return "🍔";
  }

  if (
    categories.some((category) =>
      category.includes("restaurant")
    )
  ) {
    return "🍽️";
  }

  if (
    categories.some((category) =>
      category.includes("cafe")
    )
  ) {
    return "☕";
  }

  if (
    categories.some(
      (category) =>
        category.includes("bar") ||
        category.includes("pub")
    )
  ) {
    return "🍺";
  }

  if (
    categories.some((category) =>
      category.includes("museum")
    )
  ) {
    return "🏛️";
  }

  if (
    categories.some((category) =>
      category.includes("gallery")
    )
  ) {
    return "🎨";
  }

  if (
    categories.some((category) =>
      category.includes("theatre")
    )
  ) {
    return "🎭";
  }

  if (
    categories.some((category) =>
      category.includes("park")
    )
  ) {
    return "🌳";
  }

  if (
    categories.some((category) =>
      category.includes("viewpoint")
    )
  ) {
    return "🌄";
  }

  if (
    categories.some((category) =>
      category.includes("playground")
    )
  ) {
    return "🛝";
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

  const isNightclub =
    categories.some((category) =>
      category.includes("nightclub")
    );

  const isBar =
    categories.some(
      (category) =>
        category.includes("bar") ||
        category.includes("pub")
    );

  const isOutdoor =
    categories.some(
      (category) =>
        category.includes("park") ||
        category.includes("viewpoint") ||
        category.includes("natural")
    );

  return {
    name,

    emoji:
      emojiFor(categories),

    /*
     * No inventamos precios.
     * Se mantiene 2 para no romper
     * el formato que espera el frontend.
     */
    price: 2,

    /*
     * No inventamos ratings.
     */
    rating: 0,

    dist: distanceMinutes,

    mood:
      isBar
        ? ["animado"]
        : isOutdoor
        ? ["tranquilo"]
        : ["tranquilo"],

    outdoor: isOutdoor,

    kidFriendly:
      !isNightclub,

    nightOnly:
      isNightclub,

    slots:
      isNightclub
        ? ["night"]
        : [
            "morning",
            "afternoon",
            "night",
          ],

    /*
     * La explicación de por qué se recomienda
     * la agregaremos después con la IA.
     */
    why: null,

    address,

    hours:
      parseSimpleHours(
        props.opening_hours
      ),

    categories,

    source: "geoapify",

    /*
     * Coordenadas reales del lugar.
     */
    lat,

    lon,
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

  /*
   * Convertimos las variantes que puede mandar
   * el frontend a una intención única.
   */
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
    /*
     * 1. Ubicamos la zona solicitada.
     */
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

    /*
     * 2. Buscamos lugares REALES en Geoapify.
     */
    const features =
      await searchPlaces({
        lat: location.lat,
        lon: location.lon,
        categories,
      });

    /*
     * 3. Filtramos solamente resultados
     * que realmente coincidan con la intención.
     */
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
            !isBadPlace(
              feature,
              categories
            )
        )
        .map((feature) =>
          mapFeature(
            feature,
            location
          )
        )
        .filter(Boolean)

        /*
         * Primero los más cercanos.
         */
        .sort(
          (a, b) =>
            a.dist - b.dist
        )

        /*
         * Eliminamos duplicados.
         */
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

        /*
         * Máximo 30 lugares reales.
         */
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
