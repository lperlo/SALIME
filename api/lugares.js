/* ------------------------------------------------------------------ */
/* api/lugares.js                                                     */
/*                                                                    */
/* Busca lugares REALES con Geoapify para una ubicación + intención.  */
/*                                                                    */
/* Reglas:                                                            */
/* - No inventa lugares.                                              */
/* - Los barrios de Córdoba se resuelven como zonas, no como ciudades. */
/* - El tipo de lugar debe coincidir con la intención.                */
/* - Para "comer" NO permite plazas, parques ni lugares naturales.    */
/* ------------------------------------------------------------------ */

const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY;

/* ------------------------------------------------------------------ */
/* INTENCIONES                                                        */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* UBICACIONES CONOCIDAS                                              */
/* ------------------------------------------------------------------ */

const KNOWN_CORDOBA_ZONES = {
  "guemes": "Güemes, Córdoba, Argentina",
  "nueva cordoba": "Nueva Córdoba, Córdoba, Argentina",
  "alta cordoba": "Alta Córdoba, Córdoba, Argentina",
  "centro": "Centro, Córdoba, Argentina",
};

/* ------------------------------------------------------------------ */
/* UTILIDADES                                                         */
/* ------------------------------------------------------------------ */

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* ------------------------------------------------------------------ */
/* FILTRO ESTRICTO POR INTENCIÓN                                      */
/* ------------------------------------------------------------------ */

function matchesIntent(categories, intent) {
  const cats = Array.isArray(categories)
    ? categories
    : [];

  /*
   * COMER
   *
   * Acá somos deliberadamente estrictos.
   * Si el usuario pidió comer, solamente aceptamos:
   *
   * - catering.restaurant
   * - catering.fast_food
   *
   * Todo lo demás queda afuera.
   */
  if (intent === "comer") {
    return cats.some(
      (cat) =>
        cat === "catering.restaurant" ||
        cat.startsWith("catering.restaurant.") ||
        cat === "catering.fast_food" ||
        cat.startsWith("catering.fast_food.")
    );
  }

  /*
   * BEBER
   */
  if (intent === "beber") {
    return cats.some(
      (cat) =>
        cat === "catering.bar" ||
        cat.startsWith("catering.bar.") ||
        cat === "catering.pub" ||
        cat.startsWith("catering.pub.") ||
        cat === "catering.cafe" ||
        cat.startsWith("catering.cafe.")
    );
  }

  /*
   * CULTURA
   */
  if (intent === "cultura") {
    return cats.some(
      (cat) =>
        cat === "entertainment.museum" ||
        cat.startsWith("entertainment.museum.") ||
        cat === "entertainment.culture" ||
        cat.startsWith("entertainment.culture.") ||
        cat === "tourism.sights" ||
        cat.startsWith("tourism.sights.")
    );
  }

  /*
   * AIRE LIBRE
   */
  if (intent === "aire_libre") {
    return cats.some(
      (cat) =>
        cat === "leisure.park" ||
        cat.startsWith("leisure.park.") ||
        cat === "natural.forest" ||
        cat.startsWith("natural.forest.") ||
        cat === "natural.water" ||
        cat.startsWith("natural.water.")
    );
  }

  /*
   * PASEO
   */
  if (intent === "paseo") {
    return cats.some(
      (cat) =>
        cat === "leisure.park" ||
        cat.startsWith("leisure.park.") ||
        cat === "tourism.sights" ||
        cat.startsWith("tourism.sights.")
    );
  }

  /*
   * FIESTA
   */
  if (intent === "fiesta") {
    return cats.some(
      (cat) =>
        cat === "entertainment.nightclub" ||
        cat.startsWith("entertainment.nightclub.") ||
        cat === "catering.bar" ||
        cat.startsWith("catering.bar.") ||
        cat === "catering.pub" ||
        cat.startsWith("catering.pub.")
    );
  }

  /*
   * FAMILIA
   */
  if (intent === "familia") {
    return cats.some(
      (cat) =>
        cat === "leisure.park" ||
        cat.startsWith("leisure.park.") ||
        cat === "entertainment.museum" ||
        cat.startsWith("entertainment.museum.") ||
        cat === "catering.restaurant" ||
        cat.startsWith("catering.restaurant.")
    );
  }

  /*
   * GENERAL
   */
  if (intent === "general") {
    return cats.some(
      (cat) =>
        cat === "catering.restaurant" ||
        cat.startsWith("catering.restaurant.") ||
        cat === "catering.cafe" ||
        cat.startsWith("catering.cafe.") ||
        cat === "leisure.park" ||
        cat.startsWith("leisure.park.")
    );
  }

  return false;
}

/* ------------------------------------------------------------------ */
/* ESTIMACIONES                                                       */
/* ------------------------------------------------------------------ */

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

  if (cats.some((c) => c.includes("restaurant"))) {
    return 2;
  }

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

  return cats.some((c) =>
    c.includes("nightclub")
  );
}

function estimateSlots(categories) {
  const cats = categories || [];

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

/* ------------------------------------------------------------------ */
/* HORARIOS                                                           */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* GEOCODIFICACIÓN                                                    */
/* ------------------------------------------------------------------ */

async function geocodeLocation(location) {
  const normalized =
    normalizeText(location);

  const knownQuery =
    KNOWN_CORDOBA_ZONES[normalized];

  const searchText =
    knownQuery ||
    location;

  const url =
    "https://api.geoapify.com/v1/geocode/search" +
    `?text=${encodeURIComponent(searchText)}` +
    "&format=json" +
    "&limit=10" +
    `&apiKey=${GEOAPIFY_KEY}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      "geoapify-geocode-error"
    );
  }

  const data = await res.json();

  const results =
    Array.isArray(data.results)
      ? data.results
      : [];

  if (!results.length) {
    return null;
  }

  /*
   * Para barrios conocidos, buscamos específicamente
   * un resultado que esté asociado con Córdoba.
   */
  if (knownQuery) {
    const wanted =
      normalizeText(location);

    const matched =
      results.find((result) => {
        const resultText =
          normalizeText(
            [
              result.name,
              result.suburb,
              result.district,
              result.quarter,
              result.city,
              result.formatted,
            ]
              .filter(Boolean)
              .join(" ")
          );

        return (
          resultText.includes(wanted) &&
          (
            resultText.includes("cordoba") ||
            resultText.includes("argentina")
          )
        );
      });

    if (matched) {
      return {
        lat: matched.lat,
        lon: matched.lon,
        label:
          matched.formatted ||
          matched.name ||
          searchText,
      };
    }
  }

  const first = results[0];

  return {
    lat: first.lat,
    lon: first.lon,
    label:
      first.formatted ||
      first.name ||
      location,
  };
}

/* ------------------------------------------------------------------ */
/* BÚSQUEDA                                                           */
/* ------------------------------------------------------------------ */

async function searchPlaces({
  lat,
  lon,
  categories,
  limit = 30,
}) {
  /*
   * Radio de 3,5 km.
   *
   * El filtro por intención se hace DESPUÉS de recibir
   * los resultados, de manera estricta.
   */
  const url =
    "https://api.geoapify.com/v2/places" +
    `?categories=${encodeURIComponent(
      categories.join(",")
    )}` +
    `&filter=circle:${lon},${lat},3500` +
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

/* ------------------------------------------------------------------ */
/* DISTANCIA                                                          */
/* ------------------------------------------------------------------ */

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
    Math.sin(dLat / 2) ** 2 +
    Math.cos(
      (lat1 * Math.PI) / 180
    ) *
      Math.cos(
        (lat2 * Math.PI) / 180
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

/* ------------------------------------------------------------------ */
/* MAPEO                                                              */
/* ------------------------------------------------------------------ */

function mapFeatureToVenue(
  feature,
  center
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

  const lon =
    coordinates[0];

  const lat =
    coordinates[1];

  const distKm =
    lat != null &&
    lon != null
      ? haversineKm(
          center.lat,
          center.lon,
          lat,
          lon
        )
      : null;

  return {
    name:
      props.name ||
      props.address_line1 ||
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
      "Lugar real cercano a la zona indicada",

    address:
      props.formatted ||
      null,

    hours:
      parseSimpleHours(
        props.opening_hours
      ),

    source:
      "geoapify",
  };
}

/* ------------------------------------------------------------------ */
/* HANDLER                                                            */
/* ------------------------------------------------------------------ */

export default async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    res.status(405).json({
      error:
        "method-not-allowed",
    });

    return;
  }

  if (!GEOAPIFY_KEY) {
    res.status(500).json({
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
    res.status(400).json({
      error:
        "missing-city",
    });

    return;
  }

  const location =
    city.trim();

  const normalizedIntent =
    normalizeText(intent);

  const finalIntent =
    INTENT_CATEGORIES[
      normalizedIntent
    ]
      ? normalizedIntent
      : "general";

  const categories =
    INTENT_CATEGORIES[
      finalIntent
    ];

  try {
    const locationInfo =
      await geocodeLocation(
        location
      );

    if (!locationInfo) {
      res.status(200).json({
        city: location,
        resolvedCity: null,
        places: [],
      });

      return;
    }

    const features =
      await searchPlaces({
        lat: locationInfo.lat,
        lon: locationInfo.lon,
        categories,
      });

    /*
     * FILTRO ESTRICTO.
     *
     * Esto ocurre antes de convertir los resultados
     * en lugares para el frontend.
     */
    const places =
      features
        .filter((feature) => {
          const props =
            feature.properties || {};

          const cats =
            Array.isArray(
              props.categories
            )
              ? props.categories
              : [];

          return matchesIntent(
            cats,
            finalIntent
          );
        })
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
     * Eliminar duplicados.
     */
    const seen =
      new Set();

    const uniquePlaces =
      places.filter((place) => {
        const key =
          normalizeText(
            place.name
          );

        if (!key) {
          return false;
        }

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);

        return true;
      });

    /*
     * Más cercanos primero.
     */
    uniquePlaces.sort(
      (a, b) =>
        (a.dist || 999) -
        (b.dist || 999)
    );

    res.status(200).json({
      city: location,

      resolvedCity:
        locationInfo.label,

      places:
        uniquePlaces.slice(
          0,
          15
        ),
    });
  } catch (err) {
    console.error(
      "Geoapify lugares error:",
      err
    );

    res.status(502).json({
      error:
        "geoapify-request-failed",
    });
  }
}
