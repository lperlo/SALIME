/* ------------------------------------------------------------------ */
/* api/lugares.js                                                     */
/*                                                                    */
/* Busca lugares REALES con Geoapify.                                 */
/*                                                                    */
/* IMPORTANTE:                                                        */
/* - La API key vive únicamente en Vercel: GEOAPIFY_API_KEY           */
/* - Nunca inventa lugares.                                           */
/* - Filtra los resultados según la intención solicitada.             */
/* - Si la intención es "comer", NO acepta plazas, kioscos, etc.      */
/* - Si no encuentra lugares válidos, devuelve places: [].            */
/* ------------------------------------------------------------------ */

const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY;

/*
 * Categorías que se consultan en Geoapify.
 */
const INTENT_CATEGORIES = {
  comer: [
    "catering.restaurant",
    "catering.fast_food",
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
 * FILTROS ESTRICTOS POR INTENCIÓN
 * ------------------------------------------------------------------
 *
 * Geoapify puede devolver un resultado que pertenece a varias
 * categorías. Por eso no alcanza con pedir categorías en la URL:
 * también verificamos las categorías reales del resultado antes
 * de mostrarlo.
 */

const VALID_CATEGORIES_BY_INTENT = {
  comer: [
    "catering.restaurant",
    "catering.fast_food",
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
 * Determina si un resultado realmente pertenece a la intención.
 */
function matchesIntent(categories, intent) {
  const cats = Array.isArray(categories) ? categories : [];

  const valid =
    VALID_CATEGORIES_BY_INTENT[intent] ||
    VALID_CATEGORIES_BY_INTENT.general;

  return cats.some((category) =>
    valid.includes(category)
  );
}

/*
 * ------------------------------------------------------------------
 * ESTIMACIONES
 * ------------------------------------------------------------------
 */

function estimatePrice(categories) {
  const cats = categories || [];

  if (cats.some((c) => c.includes("fast_food"))) return 1;
  if (cats.some((c) => c.includes("cafe"))) return 1;
  if (cats.some((c) => c.includes("park") || c.includes("natural"))) {
    return 1;
  }

  if (cats.some((c) => c.includes("nightclub"))) return 3;

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

  if (cats.some((c) => c.includes("restaurant"))) return 2;

  return 2;
}

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

  return cats.some(
    (c) =>
      c.includes("park") ||
      c.includes("natural")
  );
}

function estimateKidFriendly(categories) {
  const cats = categories || [];

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

function estimateNightOnly(categories) {
  const cats = categories || [];

  return cats.some(
    (c) => c.includes("nightclub")
  );
}

function estimateSlots(categories) {
  const cats = categories || [];

  if (
    cats.some(
      (c) => c.includes("nightclub")
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
    return ["afternoon", "night"];
  }

  return [
    "morning",
    "afternoon",
    "night",
  ];
}

function emojiFor(categories) {
  const cats = categories || [];

  if (
    cats.some(
      (c) => c.includes("fast_food")
    )
  ) {
    return "🍔";
  }

  if (
    cats.some(
      (c) => c.includes("restaurant")
    )
  ) {
    return "🍽️";
  }

  if (
    cats.some(
      (c) => c.includes("cafe")
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
    cats.some(
      (c) => c.includes("nightclub")
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
    cats.some(
      (c) => c.includes("park")
    )
  ) {
    return "🌳";
  }

  if (
    cats.some(
      (c) => c.includes("natural")
    )
  ) {
    return "🌿";
  }

  if (
    cats.some(
      (c) => c.includes("sights")
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

function parseSimpleHours(raw) {
  if (!raw || typeof raw !== "string") {
    return null;
  }

  const match = raw.match(
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
 * GEOCODIFICACIÓN
 * ------------------------------------------------------------------
 */

async function geocodeCity(city) {
  const url =
    "https://api.geoapify.com/v1/geocode/search" +
    `?text=${encodeURIComponent(city)}` +
    "&type=city" +
    "&format=json" +
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
      city,
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
    ((lat2 - lat1) * Math.PI) /
    180;

  const dLon =
    ((lon2 - lon1) * Math.PI) /
    180;

  const a =
    Math.sin(dLat / 2) *
      Math.sin(dLat / 2) +
    Math.cos(
      (lat1 * Math.PI) / 180
    ) *
      Math.cos(
        (lat2 * Math.PI) / 180
      ) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

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
 * MAPEO DE GEOAPIFY -> VENUE
 * ------------------------------------------------------------------
 */

function mapFeatureToVenue(
  feature,
  cityCenter
) {
  const props =
    feature.properties || {};

  const categories =
    Array.isArray(props.categories)
      ? props.categories
      : [];

  const coordinates =
    feature.geometry &&
    Array.isArray(
      feature.geometry.coordinates
    )
      ? feature.geometry.coordinates
      : [null, null];

  const lon = coordinates[0];
  const lat = coordinates[1];

  const distKm =
    lat != null &&
    lon != null
      ? haversineKm(
          cityCenter.lat,
          cityCenter.lon,
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
      null,

    emoji:
      emojiFor(categories),

    price:
      estimatePrice(categories),

    rating:
      props.rank &&
      props.rank.confidence
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
      estimateMood(categories),

    outdoor:
      estimateOutdoor(categories),

    kidFriendly:
      estimateKidFriendly(
        categories
      ),

    nightOnly:
      estimateNightOnly(
        categories
      ),

    slots:
      estimateSlots(categories),

    why:
      props.address_line2 ||
      props.formatted ||
      "lugar real cercano a la zona indicada",

    address:
      props.formatted ||
      null,

    hours,

    source:
      "geoapify",
  };
}

/*
 * ------------------------------------------------------------------
 * ENDPOINT
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
    typeof intent === "string" &&
    INTENT_CATEGORIES[intent]
      ? intent
      : "general";

  const categories =
    INTENT_CATEGORIES[
      normalizedIntent
    ];

  try {
    const cityInfo =
      await geocodeCity(
        city.trim()
      );

    if (!cityInfo) {
      res
        .status(200)
        .json({
          city,
          resolvedCity:
            null,
          places: [],
        });

      return;
    }

    const features =
      await searchPlaces({
        lat: cityInfo.lat,
        lon: cityInfo.lon,
        categories,
      });

    /*
     * PRIMER FILTRO:
     * solamente lugares con nombre real.
     */
    const namedFeatures =
      features.filter(
        (feature) => {
          const props =
            feature.properties ||
            {};

          return (
            typeof props.name ===
              "string" &&
            props.name.trim()
          );
        }
      );

    /*
     * SEGUNDO FILTRO:
     * el lugar tiene que pertenecer realmente
     * a la intención solicitada.
     *
     * Esto es lo que evita que, por ejemplo,
     * una plaza aparezca cuando se pidió "comer".
     */
    const validFeatures =
      namedFeatures.filter(
        (feature) => {
          const props =
            feature.properties ||
            {};

          const categories =
            Array.isArray(
              props.categories
            )
              ? props.categories
              : [];

          return matchesIntent(
            categories,
            normalizedIntent
          );
        }
      );

    /*
     * Convertimos únicamente los resultados
     * que pasaron todos los filtros.
     */
    const places =
      validFeatures
        .map((feature) =>
          mapFeatureToVenue(
            feature,
            cityInfo
          )
        )
        .filter(
          (place) =>
            place.name &&
            place.name.trim()
        );

    res
      .status(200)
      .json({
        city,
        resolvedCity:
          cityInfo.label,
        places,
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
