"api/lugares.js"

/* ------------------------------------------------------------------ */
/* api/lugares.js                                                     */
/*                                                                    */
/* Busca lugares REALES con Geoapify.                                 */
/*                                                                    */
/* Reglas:                                                            */
/* - La API key vive únicamente en Vercel: GEOAPIFY_API_KEY            */
/* - Nunca inventa lugares.                                           */
/* - Usa la ubicación recibida para centrar la búsqueda.              */
/* - Respeta la intención para evitar lugares de categorías ajenas.   */
/* - Si no encuentra lugares reales, devuelve places: [].             */
/* ------------------------------------------------------------------ */

const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY;

/*
 * Intención -> categorías permitidas.
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
 * Categorías que NO queremos mostrar como si fueran lugares
 * recomendables cuando no corresponden a la intención.
 *
 * Esto ayuda a evitar resultados como kioscos, tiendas, bancos,
 * supermercados, etc.
 */
const GENERIC_BAD_CATEGORIES = [
  "commercial",
  "service",
  "building",
  "public_service",
  "office",
  "healthcare",
  "education",
  "accommodation",
  "parking",
];

/*
 * Precio estimado.
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

/*
 * Mood estimado.
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

/*
 * Horarios simples.
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
 * Normaliza texto para comparar ubicaciones.
 */
function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/*
 * Determina si una categoría realmente pertenece a la intención.
 */
function matchesIntent(categories, intent) {
  const cats = categories || [];

  const allowed =
    INTENT_CATEGORIES[intent] ||
    INTENT_CATEGORIES.general;

  return cats.some((cat) =>
    allowed.some((allowedCat) =>
      cat === allowedCat ||
      cat.startsWith(`${allowedCat}.`)
    )
  );
}

/*
 * Descarta resultados claramente ajenos.
 */
function hasBadGenericCategory(categories) {
  const cats = categories || [];

  return cats.some((cat) =>
    GENERIC_BAD_CATEGORIES.some(
      (bad) =>
        cat === bad ||
        cat.startsWith(`${bad}.`)
    )
  );
}

/*
 * Geocodifica la ubicación.
 *
 * IMPORTANTE:
 * Geoapify puede devolver "Güemes" como barrio/distrito.
 * No obligamos type=city porque eso puede hacer que un barrio
 * termine resolviéndose como Córdoba ciudad.
 */
async function geocodeLocation(location) {
  const url =
    "https://api.geoapify.com/v1/geocode/search" +
    `?text=${encodeURIComponent(location)}` +
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

  const results =
    Array.isArray(data.results)
      ? data.results
      : [];

  if (!results.length) {
    return null;
  }

  /*
   * Buscamos primero una coincidencia cuyo nombre/formatted
   * contenga exactamente la ubicación solicitada.
   *
   * Así "Güemes" tiene prioridad sobre una coincidencia
   * genérica con "Córdoba".
   */
  const wanted = normalizeText(location);

  const exactLike = results.find((result) => {
    const text = normalizeText(
      [
        result.name,
        result.district,
        result.suburb,
        result.quarter,
        result.city,
        result.formatted,
      ]
        .filter(Boolean)
        .join(" ")
    );

    return text.includes(wanted);
  });

  const first =
    exactLike || results[0];

  return {
    lat: first.lat,
    lon: first.lon,

    label:
      first.formatted ||
      first.name ||
      location,

    district:
      first.district ||
      first.suburb ||
      first.quarter ||
      null,

    city:
      first.city ||
      null,
  };
}

/*
 * Busca lugares alrededor del punto resuelto.
 *
 * Para un barrio como Güemes usamos un radio relativamente chico
 * para evitar que la búsqueda se vaya por toda Córdoba.
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

/*
 * Distancia en kilómetros.
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

/*
 * Convierte un feature de Geoapify al formato del frontend.
 */
function mapFeatureToVenue(
  feature,
  locationCenter
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
          locationCenter.lat,
          locationCenter.lon,
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
      props.formatted || null,

    hours,

    source:
      "geoapify",
  };
}

/*
 * Endpoint.
 */
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

  const cleanLocation =
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
    /*
     * 1. Resolver la ubicación.
     */
    const locationInfo =
      await geocodeLocation(
        cleanLocation
      );

    if (!locationInfo) {
      res.status(200).json({
        city: cleanLocation,
        resolvedCity: null,
        places: [],
      });

      return;
    }

    /*
     * 2. Buscar lugares reales.
     */
    const features =
      await searchPlaces({
        lat: locationInfo.lat,
        lon: locationInfo.lon,
        categories,
      });

    /*
     * 3. Convertir y filtrar.
     *
     * El filtro por intención es importante:
     * si el usuario pidió COMER, no aceptamos una plaza
     * simplemente porque Geoapify la haya devuelto cerca.
     */
    const places = features
      .filter((feature) => {
        const props =
          feature.properties || {};

        const cats =
          Array.isArray(
            props.categories
          )
            ? props.categories
            : [];

        /*
         * Para general permitimos las categorías generales.
         * Para el resto exigimos coincidencia explícita.
         */
        if (
          finalIntent !== "general" &&
          !matchesIntent(
            cats,
            finalIntent
          )
        ) {
          return false;
        }

        /*
         * Evitamos resultados claramente genéricos.
         */
        if (
          hasBadGenericCategory(
            cats
          )
        ) {
          /*
           * Si también tiene una categoría válida
           * de la intención, lo conservamos.
           */
          if (
            !matchesIntent(
              cats,
              finalIntent
            )
          ) {
            return false;
          }
        }

        return true;
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
     * 4. Eliminar duplicados por nombre.
     */
    const uniquePlaces = [];

    const seenNames =
      new Set();

    for (const place of places) {
      const key =
        normalizeText(
          place.name
        );

      if (!key) {
        continue;
      }

      if (
        seenNames.has(key)
      ) {
        continue;
      }

      seenNames.add(key);
      uniquePlaces.push(
        place
      );
    }

    /*
     * 5. Ordenar por cercanía.
     */
    uniquePlaces.sort(
      (a, b) =>
        (a.dist || 999) -
        (b.dist || 999)
    );

    /*
     * 6. Devolver solamente lugares reales.
     */
    res.status(200).json({
      city: cleanLocation,

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
