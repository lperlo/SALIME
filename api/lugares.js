/* ------------------------------------------------------------------ */
/* api/lugares.js                                                     */
/*                                                                    */
/* Busca lugares REALES (Geoapify) para una ciudad + intención.       */
/*                                                                    */
/* IMPORTANTE:                                                        */
/* - Nunca inventa lugares.                                           */
/* - La API key vive únicamente en Vercel.                            */
/* - Filtra las categorías devueltas por Geoapify.                    */
/* - Evita que plazas, parques, kioscos, monumentos, etc. aparezcan  */
/*   cuando la intención no corresponde.                             */
/* ------------------------------------------------------------------ */

const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY;

/*
 * Categorías que se consultan según la intención.
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
 * FILTROS ESTRICTOS POR INTENCIÓN
 * ------------------------------------------------------------------
 *
 * Geoapify puede devolver objetos con varias categorías.
 * No queremos que una categoría secundaria haga pasar un lugar
 * que claramente no corresponde a la intención.
 */

/*
 * Categorías válidas para COMER.
 *
 * IMPORTANTE:
 * Un lugar solamente entra si tiene una categoría gastronómica
 * explícita.
 */
const FOOD_CATEGORIES = [
  "catering.restaurant",
  "catering.fast_food",
  "catering.food_court",
];

/*
 * Categorías que jamás deberían aparecer como resultado de COMER.
 */
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
  "commercial",
];

/*
 * Devuelve true si alguna categoría del lugar coincide exactamente
 * con una de las categorías indicadas.
 */
function hasCategory(categories, allowed) {
  return categories.some((category) =>
    allowed.includes(category)
  );
}

/*
 * Determina si un resultado sirve para la intención indicada.
 */
function matchesIntent(categories, intent) {
  const cats = Array.isArray(categories) ? categories : [];

  if (intent === "comer") {
    /*
     * Para COMER exigimos una categoría gastronómica explícita.
     *
     * No alcanza con que esté cerca.
     */
    const isFood = hasCategory(cats, FOOD_CATEGORIES);

    if (!isFood) {
      return false;
    }

    /*
     * Si además aparece una categoría claramente incompatible,
     * descartamos el resultado.
     *
     * Esto evita casos como una plaza que tenga una categoría
     * secundaria inesperada.
     */
    const isClearlyNonFood = hasCategory(
      cats,
      NON_FOOD_CATEGORIES
    );

    if (isClearlyNonFood) {
      return false;
    }

    return true;
  }

  if (intent === "beber") {
    return hasCategory(cats, [
      "catering.bar",
      "catering.pub",
      "catering.cafe",
    ]);
  }

  if (intent === "cultura") {
    return hasCategory(cats, [
      "entertainment.museum",
      "entertainment.culture",
      "tourism.sights",
    ]);
  }

  if (intent === "aire_libre") {
    return hasCategory(cats, [
      "leisure.park",
      "natural.forest",
      "natural.water",
    ]);
  }

  if (intent === "paseo") {
    return hasCategory(cats, [
      "leisure.park",
      "tourism.sights",
    ]);
  }

  if (intent === "fiesta") {
    return hasCategory(cats, [
      "entertainment.nightclub",
      "catering.bar",
      "catering.pub",
    ]);
  }

  if (intent === "familia") {
    return hasCategory(cats, [
      "leisure.park",
      "entertainment.museum",
      "catering.restaurant",
    ]);
  }

  /*
   * GENERAL:
   * aceptamos solamente las categorías que nosotros mismos
   * consideramos útiles para un plan.
   */
  return hasCategory(cats, [
    "catering.restaurant",
    "catering.cafe",
    "leisure.park",
  ]);
}

/*
 * ------------------------------------------------------------------
 * ESTIMACIONES
 * ------------------------------------------------------------------
 */

function estimatePrice(categories) {
  const cats = categories || [];

  if (cats.some((c) => c.includes("fast_food"))) {
    return 1;
  }

  if (cats.some((c) => c.includes("cafe"))) {
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

  if (cats.some((c) => c.includes("nightclub"))) {
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
    ((lat2 - lat1) * Math.PI) / 180;

  const dLon =
    ((lon2 - lon1) * Math.PI) / 180;

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
 * MAPEO
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

  const hours = parseSimpleHours(
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
      estimateMood(categories),

    outdoor:
      estimateOutdoor(categories),

    kidFriendly:
      estimateKidFriendly(categories),

    nightOnly:
      estimateNightOnly(categories),

    slots:
      estimateSlots(categories),

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
     * 1. Convertimos la ciudad a coordenadas.
     */
    const cityInfo =
      await geocodeCity(
        city.trim()
      );

    if (!cityInfo) {
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
     * 2. Buscamos más resultados de los que finalmente
     *    mostramos. Esto permite filtrar basura sin quedarnos
     *    solamente con los primeros resultados.
     */
    const features =
      await searchPlaces({
        lat: cityInfo.lat,
        lon: cityInfo.lon,
        categories,
        limit: 30,
      });

    /*
     * 3. FILTRO ESTRICTO.
     *
     *    Acá está la corrección principal:
     *    cada resultado tiene que demostrar, mediante sus
     *    propias categorías de Geoapify, que corresponde a
     *    la intención solicitada.
     */
    const filteredFeatures =
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
     * 4. Convertimos los resultados válidos al contrato
     *    que consume el frontend.
     */
    const places =
      filteredFeatures
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

    /*
     * 5. Eliminamos duplicados por nombre + dirección.
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
          cityInfo.label,
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
