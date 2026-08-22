/* ------------------------------------------------------------------ */
/* api/lugares.js                                                     */
/*                                                                    */
/* Busca lugares REALES con Geoapify para una ubicación + intención.  */
/*                                                                    */
/* IMPORTANTE:                                                        */
/* - No usa type=city para barrios.                                    */
/* - Güemes se resuelve como barrio de Córdoba, Argentina.            */
/* - Nunca inventa lugares.                                            */
/* - Respeta la intención solicitada.                                  */
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
/*                                                                    */
/* Estas son zonas/barrios de Córdoba.                                */
/* No deben tratarse como ciudades independientes.                   */
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
/* CATEGORÍAS                                                         */
/* ------------------------------------------------------------------ */

function matchesIntent(categories, intent) {
  const cats = categories || [];

  const allowed =
    INTENT_CATEGORIES[intent] ||
    INTENT_CATEGORIES.general;

  return cats.some((cat) =>
    allowed.some(
      (allowedCat) =>
        cat === allowedCat ||
        cat.startsWith(`${allowedCat}.`)
    )
  );
}

/* ------------------------------------------------------------------ */
/* RESOLVER UBICACIÓN                                                  */
/*                                                                    */
/* Si llega "Güemes", buscamos explícitamente:                         */
/* "Güemes, Córdoba, Argentina"                                       */
/*                                                                    */
/* NO usamos type=city.                                                */
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
   * Para ubicaciones conocidas de Córdoba:
   * buscamos un resultado que realmente esté asociado
   * con Córdoba y que mencione la zona solicitada.
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

  /*
   * Para otras ubicaciones usamos el resultado más relevante.
   */
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
/* BÚSQUEDA DE LUGARES                                                 */
/* ------------------------------------------------------------------ */

async function searchPlaces({
  lat,
  lon,
  categories,
  limit = 30,
}) {
  /*
   * 3,5 km alrededor del barrio/zona.
   *
   * Es bastante menor que los 15 km anteriores y evita
   * que la búsqueda se vaya por toda Córdoba.
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

  const lon = coordinates[0];
  const lat = coordinates[1];

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
      props.formatted || null,

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
    /*
     * Resolver la ubicación primero.
     */
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

    /*
     * Buscar lugares alrededor de esa ubicación.
     */
    const features =
      await searchPlaces({
        lat: locationInfo.lat,
        lon: locationInfo.lon,
        categories,
      });

    /*
     * Filtrar estrictamente por intención.
     *
     * Ejemplo:
     * intent=comer
     * => restaurant / fast_food
     *
     * Una plaza NO pasa este filtro.
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
