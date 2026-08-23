
/* ------------------------------------------------------------------ */
/* api/lugares.js                                                     */
/*                                                                    */
/* Busca lugares REALES (Geoapify) para una ciudad o barrio +         */
/* intención.                                                        */
/*                                                                    */
/ * IMPORTANTE:                                                       */
/* - No inventa lugares.                                              */
/* - Resuelve barrios conocidos dentro de su ciudad.                  */
/* - No trata Güemes como una ciudad independiente.                   */
/* - Filtra los resultados según la intención.                       */
/* - La API key vive únicamente en Vercel.                            */
/* ------------------------------------------------------------------ */

const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY;

/*
 * ------------------------------------------------------------------
 * INTENCIÓN -> CATEGORÍAS GEOAPIFY
 * ------------------------------------------------------------------
 */

const INTENT_CATEGORIES = {
  comer: [
    "catering.restaurant",
    "catering.fast_food",
    "catering.food_court",
  ],

  beber: [
    "catering.bar",
    "catering.pub",
    "catering.cafe",
  ],

  cultura: [
    "entertainment.museum",
    "entertainment.culture",
    "tourism.sights",
  ],

  aire_libre: [
    "leisure.park",
    "natural.forest",
    "natural.water",
  ],

  paseo: [
    "leisure.park",
    "tourism.sights",
  ],

  fiesta: [
    "entertainment.nightclub",
    "catering.bar",
    "catering.pub",
  ],

  familia: [
    "leisure.park",
    "entertainment.museum",
    "catering.restaurant",
  ],

  general: [
    "catering.restaurant",
    "catering.cafe",
    "leisure.park",
  ],
};

/*
 * ------------------------------------------------------------------
 * BARRIOS CONOCIDOS
 * ------------------------------------------------------------------
 *
 * Estos NO se envían a Geoapify como ciudades.
 *
 * Se convierten en una búsqueda contextualizada dentro de Córdoba.
 */

const KNOWN_NEIGHBORHOODS = {
  "guemes": {
    name: "Güemes",
    city: "Córdoba, Argentina",
  },

  "nueva cordoba": {
    name: "Nueva Córdoba",
    city: "Córdoba, Argentina",
  },

  "alta cordoba": {
    name: "Alta Córdoba",
    city: "Córdoba, Argentina",
  },

  "general paz": {
    name: "General Paz",
    city: "Córdoba, Argentina",
  },

  "alberdi": {
    name: "Alberdi",
    city: "Córdoba, Argentina",
  },

  "cofico": {
    name: "Cofico",
    city: "Córdoba, Argentina",
  },

  "cerro de las rosas": {
    name: "Cerro de las Rosas",
    city: "Córdoba, Argentina",
  },

  "arguello": {
    name: "Argüello",
    city: "Córdoba, Argentina",
  },

  "jardin": {
    name: "Jardín",
    city: "Córdoba, Argentina",
  },

  "barrio jardin": {
    name: "Barrio Jardín",
    city: "Córdoba, Argentina",
  },

  "san vicente": {
    name: "San Vicente",
    city: "Córdoba, Argentina",
  },

  "observatorio": {
    name: "Observatorio",
    city: "Córdoba, Argentina",
  },

  "centro": {
    name: "Centro",
    city: "Córdoba, Argentina",
  },
};

/*
 * ------------------------------------------------------------------
 * NORMALIZACIÓN DE TEXTO
 * ------------------------------------------------------------------
 */

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/*
 * ------------------------------------------------------------------
 * DETECTAR BARRIO
 * ------------------------------------------------------------------
 */

function findKnownNeighborhood(location) {
  const normalized = normalizeText(location);

  /*
   * Primero intentamos coincidencia exacta.
   */
  if (KNOWN_NEIGHBORHOODS[normalized]) {
    return KNOWN_NEIGHBORHOODS[normalized];
  }

  /*
   * Después permitimos frases como:
   * "barrio Güemes"
   * "zona Güemes"
   * "Güemes, Córdoba"
   */
  const keys = Object.keys(
    KNOWN_NEIGHBORHOODS
  ).sort(
    (a, b) => b.length - a.length
  );

  for (const key of keys) {
    const pattern = new RegExp(
      `(^|\\s|,)${key.replace(
        /\s+/g,
        "\\s+"
      )}(\\s|,|$)`
    );

    if (pattern.test(normalized)) {
      return KNOWN_NEIGHBORHOODS[key];
    }
  }

  return null;
}

/*
 * ------------------------------------------------------------------
 * GEOCODIFICACIÓN DE CIUDAD / BARRIO
 * ------------------------------------------------------------------
 */

async function geocodeLocation(location) {
  const neighborhood =
    findKnownNeighborhood(location);

  /*
   * --------------------------------------------------------------
   * CASO BARRIO CONOCIDO
   * --------------------------------------------------------------
   *
   * No usamos type=city.
   *
   * Buscamos el barrio junto con Córdoba, Argentina.
   */
  if (neighborhood) {
    const text =
      `${neighborhood.name}, ${neighborhood.city}`;

    const url =
      "https://api.geoapify.com/v1/geocode/search" +
      `?text=${encodeURIComponent(text)}` +
      "&format=json" +
      "&limit=10" +
      `&apiKey=${GEOAPIFY_KEY}`;

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(
        "geoapify-neighborhood-error"
      );
    }

    const data = await res.json();

    const results =
      Array.isArray(data.results)
        ? data.results
        : [];

    /*
     * Buscamos preferentemente un resultado que realmente
     * esté dentro de Córdoba y que tenga el nombre del barrio.
     */
    const wanted =
      normalizeText(
        neighborhood.name
      );

    const matching =
      results.find((result) => {
        const formatted =
          normalizeText(
            result.formatted
          );

        const resultName =
          normalizeText(
            result.name
          );

        const suburb =
          normalizeText(
            result.suburb
          );

        const district =
          normalizeText(
            result.district
          );

        return (
          resultName.includes(wanted) ||
          suburb.includes(wanted) ||
          district.includes(wanted) ||
          formatted.includes(wanted)
        );
      });

    const first =
      matching || results[0];

    if (!first) {
      return null;
    }

    return {
      lat: first.lat,
      lon: first.lon,
      label:
        first.formatted ||
        neighborhood.name,
      type: "neighborhood",
      neighborhood:
        neighborhood.name,
    };
  }

  /*
   * --------------------------------------------------------------
   * CASO CIUDAD NORMAL
   * --------------------------------------------------------------
   */

  const url =
    "https://api.geoapify.com/v1/geocode/search" +
    `?text=${encodeURIComponent(
      `${location}, Argentina`
    )}` +
    "&type=city" +
    "&format=json" +
    "&limit=5" +
    `&apiKey=${GEOAPIFY_KEY}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      "geoapify-geocode-error"
    );
  }

  const data = await res.json();

  const first =
    data &&
    data.results &&
    data.results[0];

  if (!first) {
    return null;
  }

  return {
    lat: first.lat,
    lon: first.lon,
    label:
      first.formatted ||
      location,
    type: "city",
    neighborhood: null,
  };
}

/*
 * ------------------------------------------------------------------
 * BÚSQUEDA DE LUGARES
 * ------------------------------------------------------------------
 */

async function searchPlaces({
  lat,
  lon,
  categories,
  limit = 30,
}) {
  const url =
    "https://api.geoapify.com/v2/places" +
    `?categories=${encodeURIComponent(
      categories.join(",")
    )}` +
    `&filter=circle:${lon},${lat},15000` +
    `&bias=proximity:${lon},${lat}` +
    `&limit=${limit}` +
    `&apiKey=${GEOAPIFY_KEY}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      "geoapify-places-error"
    );
  }

  const data = await res.json();

  return Array.isArray(data.features)
    ? data.features
    : [];
}

/*
 * ------------------------------------------------------------------
 * CATEGORÍAS
 * ------------------------------------------------------------------
 */

const FOOD_CATEGORIES = [
  "catering.restaurant",
  "catering.fast_food",
  "catering.food_court",
];

const NON_FOOD_CATEGORIES = [
  "leisure.park",
  "leisure.pitch",
  "leisure.playground",
  "leisure.garden",
  "natural.forest",
  "natural.water",
  "natural.beach",
  "natural.wood",
  "tourism.sights",
  "tourism.attraction",
  "entertainment.museum",
  "entertainment.culture",
  "amenity.kiosk",
];

function hasCategory(
  categories,
  allowed
) {
  return categories.some(
    (category) =>
      allowed.includes(category)
  );
}

function matchesIntent(
  categories,
  intent
) {
  const cats =
    Array.isArray(categories)
      ? categories
      : [];

  if (intent === "comer") {
    /*
     * Para comer tiene que existir una categoría gastronómica.
     */
    if (
      !hasCategory(
        cats,
        FOOD_CATEGORIES
      )
    ) {
      return false;
    }

    /*
     * Y no puede estar clasificado como plaza,
     * parque, kiosco, museo, monumento, etc.
     */
    if (
      hasCategory(
        cats,
        NON_FOOD_CATEGORIES
      )
    ) {
      return false;
    }

    return true;
  }

  if (intent === "beber") {
    return hasCategory(
      cats,
      [
        "catering.bar",
        "catering.pub",
        "catering.cafe",
      ]
    );
  }

  if (intent === "cultura") {
    return hasCategory(
      cats,
      [
        "entertainment.museum",
        "entertainment.culture",
        "tourism.sights",
      ]
    );
  }

  if (intent === "aire_libre") {
    return hasCategory(
      cats,
      [
        "leisure.park",
        "natural.forest",
        "natural.water",
      ]
    );
  }

  if (intent === "paseo") {
    return hasCategory(
      cats,
      [
        "leisure.park",
        "tourism.sights",
      ]
    );
  }

  if (intent === "fiesta") {
    return hasCategory(
      cats,
      [
        "entertainment.nightclub",
        "catering.bar",
        "catering.pub",
      ]
    );
  }

  if (intent === "familia") {
    return hasCategory(
      cats,
      [
        "leisure.park",
        "entertainment.museum",
        "catering.restaurant",
      ]
    );
  }

  return hasCategory(
    cats,
    [
      "catering.restaurant",
      "catering.cafe",
      "leisure.park",
    ]
  );
}

/*
 * ------------------------------------------------------------------
 * DISTANCIA
 * ------------------------------------------------------------------
 */

function haversineKm(
  lat1,
  lon1,
  lat2,
  lon2
) {
  const R = 6371;

  const dLat =
    ((lat2 - lat1) *
      Math.PI) /
    180;

  const dLon =
    ((lon2 - lon1) *
      Math.PI) /
    180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(
      (lat1 * Math.PI) /
        180
    ) *
      Math.cos(
        (lat2 * Math.PI) /
          180
      ) *
      Math.sin(dLon / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return R * c;
}

/*
 * ------------------------------------------------------------------
 * ESTIMACIONES
 * ------------------------------------------------------------------
 */

function estimatePrice(
  categories
) {
  const cats =
    categories || [];

  if (
    cats.some((c) =>
      c.includes("fast_food")
    )
  ) {
    return 1;
  }

  if (
    cats.some((c) =>
      c.includes("cafe")
    )
  ) {
    return 1;
  }

  if (
    cats.some(
      (c) =>
        c.includes("park") ||
        c.includes("natural")
    )
  ) {
    return 1;
  }

  if (
    cats.some((c) =>
      c.includes("nightclub")
    )
  ) {
    return 3;
  }

  if (
    cats.some(
      (c) =>
        c.includes("museum") ||
        c.includes("culture")
    )
  ) {
    return 2;
  }

  if (
    cats.some(
      (c) =>
        c.includes("bar") ||
        c.includes("pub")
    )
  ) {
    return 2;
  }

  if (
    cats.some((c) =>
      c.includes("restaurant")
    )
  ) {
    return 2;
  }

  return 2;
}

function estimateMood(
  categories
) {
  const cats =
    categories || [];

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

  return [
    "tranquilo",
    "animado",
  ];
}

function estimateOutdoor(
  categories
) {
  return (
    categories || []
  ).some(
    (c) =>
      c.includes("park") ||
      c.includes("natural")
  );
}

function estimateKidFriendly(
  categories
) {
  const cats =
    categories || [];

  if (
    cats.some(
      (c) =>
        c.includes("bar") ||
        c.includes("pub") ||
        c.includes("nightclub")
    )
  ) {
    return false;
  }

  return true;
}

function estimateNightOnly(
  categories
) {
  return (
    categories || []
  ).some((c) =>
    c.includes("nightclub")
  );
}

function estimateSlots(
  categories
) {
  const cats =
    categories || [];

  if (
    cats.some((c) =>
      c.includes("nightclub")
    )
  ) {
    return ["night"];
  }

  if (
    cats.some(
      (c) =>
        c.includes("bar") ||
        c.includes("pub")
    )
  ) {
    return [
      "afternoon",
      "night",
    ];
  }

  return [
    "morning",
    "afternoon",
    "night",
  ];
}

function emojiFor(
  categories
) {
  const cats =
    categories || [];

  if (
    cats.some((c) =>
      c.includes("fast_food")
    )
  ) {
    return "🍔";
  }

  if (
    cats.some((c) =>
      c.includes("restaurant")
    )
  ) {
    return "🍽️";
  }

  if (
    cats.some((c) =>
      c.includes("cafe")
    )
  ) {
    return "☕";
  }

  if (
    cats.some(
      (c) =>
        c.includes("bar") ||
        c.includes("pub")
    )
  ) {
    return "🍺";
  }

  if (
    cats.some((c) =>
      c.includes("nightclub")
    )
  ) {
    return "🎉";
  }

  if (
    cats.some(
      (c) =>
        c.includes("museum") ||
        c.includes("culture")
    )
  ) {
    return "🖼️";
  }

  if (
    cats.some((c) =>
      c.includes("park")
    )
  ) {
    return "🌳";
  }

  if (
    cats.some((c) =>
      c.includes("natural")
    )
  ) {
    return "🌿";
  }

  if (
    cats.some((c) =>
      c.includes("sights")
    )
  ) {
    return "✨";
  }

  return "📍";
}

/*
 * ------------------------------------------------------------------
 * HORARIOS
 * ------------------------------------------------------------------
 */

function parseSimpleHours(
  raw
) {
  if (
    !raw ||
    typeof raw !== "string"
  ) {
    return null;
  }

  const match =
    raw.match(
      /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/
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
 * ------------------------------------------------------------------
 * MAPEO DE FEATURE
 * ------------------------------------------------------------------
 */

function mapFeatureToVenue(
  feature,
  locationInfo
) {
  const props =
    feature.properties || {};

  const categories =
    Array.isArray(
      props.categories
    )
      ? props.categories
      : [];

  const coordinates =
    feature.geometry &&
    Array.isArray(
      feature.geometry.coordinates
    )
      ? feature.geometry.coordinates
      : [null, null];

  const lon =
    coordinates[0];

  const lat =
    coordinates[1];

  const distKm =
    lat != null &&
    lon != null
      ? haversineKm(
          locationInfo.lat,
          locationInfo.lon,
          lat,
          lon
        )
      : null;

  const hours =
    parseSimpleHours(
      props.opening_hours
    );

  return {
    name:
      props.name ||
      props.address_line1 ||
      null,

    emoji:
      emojiFor(categories),

    price:
      estimatePrice(
        categories
      ),

    rating:
      props.rank &&
      typeof props.rank.confidence ===
        "number"
        ? Math.round(
            props.rank.confidence *
              5 *
              10
          ) / 10
        : 4.2,

    dist:
      distKm != null
        ? Math.max(
            1,
            Math.round(
              distKm * 12
            )
          )
        : 10,

    mood:
      estimateMood(
        categories
      ),

    outdoor:
      estimateOutdoor(
        categories
      ),

    kidFriendly:
      estimateKidFriendly(
        categories
      ),

    nightOnly:
      estimateNightOnly(
        categories
      ),

    slots:
      estimateSlots(
        categories
      ),

    why:
      props.address_line2 ||
      props.formatted ||
      "lugar real cercano a la zona indicada",

    address:
      props.formatted || null,

    hours,

    source:
      "geoapify",
  };
}

/*
 * ------------------------------------------------------------------
 * HANDLER
 * ------------------------------------------------------------------
 */

export default async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    res
      .status(405)
      .json({
        error:
          "method-not-allowed",
      });

    return;
  }

  if (!GEOAPIFY_KEY) {
    res
      .status(500)
      .json({
        error:
          "missing-geoapify-key",
      });

    return;
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
    res
      .status(400)
      .json({
        error:
          "missing-city",
      });

    return;
  }

  const normalizedIntent =
    typeof intent === "string"
      ? intent
          .trim()
          .toLowerCase()
      : "general";

  const categories =
    INTENT_CATEGORIES[
      normalizedIntent
    ] ||
    INTENT_CATEGORIES.general;

  try {
    /*
     * Resolvemos ciudad o barrio.
     */
    const locationInfo =
      await geocodeLocation(
        city.trim()
      );

    if (!locationInfo) {
      res
        .status(200)
        .json({
          city,
          resolvedCity: null,
          places: [],
        });

      return;
    }

    /*
     * Buscamos suficientes resultados para poder filtrar
     * los que no correspondan.
     */
    const features =
      await searchPlaces({
        lat: locationInfo.lat,
        lon: locationInfo.lon,
        categories,
        limit: 30,
      });

    /*
     * Filtro estricto por intención.
     */
    const filtered =
      features.filter(
        (feature) => {
          const props =
            feature.properties || {};

          const featureCategories =
            Array.isArray(
              props.categories
            )
              ? props.categories
              : [];

          return matchesIntent(
            featureCategories,
            normalizedIntent
          );
        }
      );

    /*
     * Convertimos a nuestro formato.
     */
    const places =
      filtered
        .map((feature) =>
          mapFeatureToVenue(
            feature,
            locationInfo
          )
        )
        .filter(
          (place) =>
            place.name &&
            place.name.trim()
        );

    /*
     * Eliminamos duplicados.
     */
    const seen =
      new Set();

    const uniquePlaces =
      places.filter(
        (place) => {
          const key =
            `${place.name
              .trim()
              .toLowerCase()}|${
              place.address || ""
            }`;

          if (seen.has(key)) {
            return false;
          }

          seen.add(key);

          return true;
        }
      );

    res
      .status(200)
      .json({
        city,
        resolvedCity:
          locationInfo.label,
        places:
          uniquePlaces,
      });
  } catch (err) {
    console.error(
      "Geoapify places error:",
      err
    );

    res
      .status(502)
      .json({
        error:
          "geoapify-request-failed",
      });
  }
  }
