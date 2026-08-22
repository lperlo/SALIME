// api/lugares.js

const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY;

const INTENT_CATEGORIES = {
  comer: [
    "catering.restaurant",
    "catering.fast_food",
    "catering.food_court",
  ],

  beber: [
    "catering.cafe",
    "catering.bar",
    "catering.pub",
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
    "natural",
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


// ================================================================
// UBICACIONES CONOCIDAS DE CÓRDOBA
//
// IMPORTANTE:
// No mandamos "Güemes" solo a Geoapify porque puede encontrar
// otra localidad llamada Güemes.
// ================================================================

const KNOWN_LOCATIONS = {
  cordoba: {
    lat: -31.4201,
    lon: -64.1888,
    label: "Córdoba, Córdoba, Argentina",
  },

  "nueva cordoba": {
    lat: -31.4267,
    lon: -64.1887,
    label: "Nueva Córdoba, Córdoba, Argentina",
  },

  guemes: {
    lat: -31.4222,
    lon: -64.1945,
    label: "Güemes, Córdoba, Argentina",
  },

  "alta cordoba": {
    lat: -31.3965,
    lon: -64.1805,
    label: "Alta Córdoba, Córdoba, Argentina",
  },

  centro: {
    lat: -31.4167,
    lon: -64.1833,
    label: "Centro, Córdoba, Argentina",
  },
};


// ================================================================
// NORMALIZACIÓN
// ================================================================

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}


// ================================================================
// PRECIO
// ================================================================

function estimatePrice(categories) {
  const cats = categories || [];

  if (
    cats.some(
      (c) =>
        c.includes("fast_food") ||
        c.includes("cafe")
    )
  ) {
    return 1;
  }

  if (
    cats.some(
      (c) =>
        c.includes("playground") ||
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
        c.includes("pub") ||
        c.includes("restaurant")
    )
  ) {
    return 2;
  }

  return 2;
}


// ================================================================
// MOOD
// ================================================================

function estimateMood(categories) {
  const cats = categories || [];

  if (
    cats.some(
      (c) =>
        c.includes("nightclub") ||
        c.includes("bar") ||
        c.includes("pub")
    )
  ) {
    return ["animado"];
  }

  return ["tranquilo"];
}


// ================================================================
// OUTDOOR
// ================================================================

function estimateOutdoor(categories) {
  const cats = categories || [];

  return cats.some(
    (c) =>
      c.includes("park") ||
      c.includes("natural") ||
      c.includes("water") ||
      c.includes("viewpoint")
  );
}


// ================================================================
// KIDS
// ================================================================

function estimateKidFriendly(categories) {
  const cats = categories || [];

  return !cats.some(
    (c) =>
      c.includes("bar") ||
      c.includes("pub") ||
      c.includes("nightclub")
  );
}


// ================================================================
// SOLO NOCHE
// ================================================================

function estimateNightOnly(categories) {
  return (categories || []).some(
    (c) => c.includes("nightclub")
  );
}


// ================================================================
// HORARIOS
// ================================================================

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


// ================================================================
// EMOJI
// ================================================================

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
    cats.some((c) =>
      c.includes("nightclub")
    )
  ) {
    return "🎉";
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
    cats.some(
      (c) =>
        c.includes("natural") ||
        c.includes("water")
    )
  ) {
    return "🌿";
  }

  if (
    cats.some((c) =>
      c.includes("viewpoint")
    )
  ) {
    return "✨";
  }

  if (
    cats.some(
      (c) =>
        c.includes("playground") ||
        c.includes("activity_park")
    )
  ) {
    return "🎡";
  }

  return "📍";
}


// ================================================================
// HORARIOS SIMPLES
// ================================================================

function parseSimpleHours(raw) {
  if (
    !raw ||
    typeof raw !== "string"
  ) {
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


// ================================================================
// GEOCODIFICACIÓN
// ================================================================

async function geocodeLocation(text) {
  const query =
    String(text || "").trim();

  if (!query) {
    return null;
  }

  const normalized =
    normalizeText(query);

  // --------------------------------------------------------------
  // PRIMERO: ubicaciones conocidas.
  //
  // Esto es lo que corrige definitivamente el problema de Güemes.
  // --------------------------------------------------------------

  if (KNOWN_LOCATIONS[normalized]) {
    return KNOWN_LOCATIONS[normalized];
  }

  // --------------------------------------------------------------
  // Para ubicaciones desconocidas agregamos Córdoba, Argentina.
  // --------------------------------------------------------------

  const queryForGeo =
    /cordoba|c[oó]rdoba/i.test(query)
      ? query
      : `${query}, Córdoba, Argentina`;

  const url =
    "https://api.geoapify.com/v1/geocode/search" +
    `?text=${encodeURIComponent(
      queryForGeo
    )}` +
    "&limit=20" +
    "&format=json" +
    `&apiKey=${GEOAPIFY_KEY}`;

  const res =
    await fetch(url);

  if (!res.ok) {
    throw new Error(
      "geoapify-geocode-error"
    );
  }

  const data =
    await res.json();

  const results =
    Array.isArray(data.results)
      ? data.results
      : [];

  if (!results.length) {
    return null;
  }

  const wanted =
    normalizeText(query);

  const score = (r) => {
    const values = [
      r.name,
      r.city,
      r.state,
      r.suburb,
      r.neighbourhood,
      r.district,
      r.formatted,
    ]
      .filter(Boolean)
      .map(normalizeText);

    let s = 0;

    if (
      values.some((v) =>
        v.includes("cordoba")
      )
    ) {
      s += 100;
    }

    if (
      values.some(
        (v) => v === wanted
      )
    ) {
      s += 100;
    }

    if (
      normalizeText(r.suburb) ===
        wanted ||
      normalizeText(
        r.neighbourhood
      ) === wanted ||
      normalizeText(r.district) ===
        wanted
    ) {
      s += 80;
    }

    if (
      normalizeText(r.city) ===
      wanted
    ) {
      s += 50;
    }

    if (
      normalizeText(r.name) ===
      wanted
    ) {
      s += 50;
    }

    if (
      normalizeText(
        r.formatted
      ).includes(wanted)
    ) {
      s += 20;
    }

    if (
      typeof r.lat !== "number" ||
      typeof r.lon !== "number"
    ) {
      s -= 1000;
    }

    return s;
  };

  const first = [...results].sort(
    (a, b) =>
      score(b) - score(a)
  )[0];

  if (
    !first ||
    typeof first.lat !== "number" ||
    typeof first.lon !== "number"
  ) {
    return null;
  }

  return {
    lat: first.lat,
    lon: first.lon,
    label:
      first.formatted || query,
    placeId:
      first.place_id || null,
  };
}


// ================================================================
// BÚSQUEDA DE LUGARES
// ================================================================

async function searchPlaces({
  lat,
  lon,
  categories,
  limit = 40,
}) {
  const params =
    new URLSearchParams({
      categories:
        categories.join(","),
      limit: String(limit),

      bias:
        `proximity:${lon},${lat}`,

      filter:
        `circle:${lon},${lat},15000`,

      apiKey: GEOAPIFY_KEY,
    });

  const res =
    await fetch(
      `https://api.geoapify.com/v2/places?${params.toString()}`
    );

  if (!res.ok) {
    throw new Error(
      "geoapify-places-error"
    );
  }

  const data =
    await res.json();

  return Array.isArray(
    data.features
  )
    ? data.features
    : [];
}


// ================================================================
// DISTANCIA
// ================================================================

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
      (lat1 * Math.PI) / 180
    ) *
      Math.cos(
        (lat2 * Math.PI) / 180
      ) *
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


// ================================================================
// DIRECCIÓN
// ================================================================

function cleanAddress(props) {
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
    props.state,
  ]
    .filter(Boolean)
    .join(", ")
    .trim();

  if (street && area) {
    return `${street}, ${area}`;
  }

  if (props.address_line2) {
    return String(
      props.address_line2
    );
  }

  if (props.formatted) {
    return String(
      props.formatted
    );
  }

  return area || null;
}


// ================================================================
// FILTRO DE INTENCIÓN
// ================================================================

function featureMatchesIntent(
  feature,
  allowedCategories
) {
  const props =
    feature?.properties || {};

  const categories =
    Array.isArray(
      props.categories
    )
      ? props.categories
      : [];

  return categories.some(
    (actual) =>
      allowedCategories.some(
        (allowed) =>
          actual === allowed ||
          actual.startsWith(
            `${allowed}.`
          )
      )
  );
}


// ================================================================
// DESCARTAR CALLES / BARRIOS / CIUDADES
// ================================================================

function looksLikeOnlyAnAddress(
  feature
) {
  const props =
    feature?.properties || {};

  const name =
    String(
      props.name || ""
    ).trim();

  const addressLine1 =
    String(
      props.address_line1 || ""
    ).trim();

  const street =
    String(
      props.street || ""
    ).trim();

  const suburb =
    String(
      props.suburb || ""
    ).trim();

  const neighbourhood =
    String(
      props.neighbourhood || ""
    ).trim();

  const district =
    String(
      props.district || ""
    ).trim();

  const city =
    String(
      props.city || ""
    ).trim();

  const categories =
    Array.isArray(
      props.categories
    )
      ? props.categories.map(
          String
        )
      : [];

  if (!name) {
    return true;
  }

  if (
    /^\d{1,6}$/.test(name)
  ) {
    return true;
  }

  if (
    street &&
    name.toLowerCase() ===
      street.toLowerCase()
  ) {
    return true;
  }

  if (
    suburb &&
    name.toLowerCase() ===
      suburb.toLowerCase()
  ) {
    return true;
  }

  if (
    neighbourhood &&
    name.toLowerCase() ===
      neighbourhood.toLowerCase()
  ) {
    return true;
  }

  if (
    district &&
    name.toLowerCase() ===
      district.toLowerCase()
  ) {
    return true;
  }

  if (
    city &&
    name.toLowerCase() ===
      city.toLowerCase()
  ) {
    return true;
  }

  if (
    addressLine1 &&
    name.toLowerCase() ===
      addressLine1.toLowerCase()
  ) {
    return true;
  }

  const hasRealPlaceCategory =
    categories.some(
      (c) =>
        c.startsWith(
          "catering."
        ) ||
        c.startsWith(
          "entertainment."
        ) ||
        c.startsWith(
          "leisure."
        ) ||
        c.startsWith(
          "tourism."
        )
    );

  return !hasRealPlaceCategory;
}


// ================================================================
// CONVERTIR FEATURE
// ================================================================

function mapFeatureToVenue(
  feature,
  center
) {
  const props =
    feature.properties || {};

  const categories =
    Array.isArray(
      props.categories
    )
      ? props.categories
      : [];

  const coords =
    feature.geometry &&
    Array.isArray(
      feature.geometry
        .coordinates
    )
      ? feature.geometry
          .coordinates
      : [null, null];

  const [lon, lat] =
    coords;

  if (
    typeof lat !== "number" ||
    typeof lon !== "number"
  ) {
    return null;
  }

  const distKm =
    haversineKm(
      center.lat,
      center.lon,
      lat,
      lon
    );

  const name =
    String(
      props.name || ""
    ).trim();

  if (!name) {
    return null;
  }

  const hours =
    parseSimpleHours(
      props.opening_hours
    );

  const distMin =
    Math.max(
      1,
      Math.round(
        (distKm / 4.5) * 60
      )
    );

  return {
    name,

    emoji:
      emojiFor(categories),

    price:
      estimatePrice(categories),

    rating: 4.2,

    dist: distMin,

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

    why: null,

    address:
      cleanAddress(props),

    hours,

    categories,

    source:
      "geoapify",
  };
}


// ================================================================
// HANDLER
// ================================================================

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
      error: "missing-city",
    });
    return;
  }

  const categories =
    INTENT_CATEGORIES[intent] ||
    INTENT_CATEGORIES.general;

  try {
    const location =
      await geocodeLocation(
        city.trim()
      );

    if (!location) {
      res.status(200).json({
        city,
        resolvedCity: null,
        places: [],
      });
      return;
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

        .filter(
          (feature) =>
            featureMatchesIntent(
              feature,
              categories
            )
        )

        .filter(
          (feature) =>
            !looksLikeOnlyAnAddress(
              feature
            )
        )

        .map(
          (feature) =>
            mapFeatureToVenue(
              feature,
              location
            )
        )

        .filter(Boolean)

        .filter((place) => {
          const key =
            `${place.name}|${
              place.address || ""
            }`.toLowerCase();

          if (seen.has(key)) {
            return false;
          }

          seen.add(key);
          return true;
        });

    res.status(200).json({
      city,

      resolvedCity:
        location.label,

      places,
    });
  } catch (err) {
    console.error(
      "Geoapify error:",
      err
    );

    res.status(502).json({
      error:
        "geoapify-request-failed",
    });
  }
      }
