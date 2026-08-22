/* ------------------------------------------------------------------ */
/* api/lugares.js                                                     */
/*                                                                    */
/* Busca lugares REALES con Geoapify.                                 */
/*                                                                    */
/* REGLA PRINCIPAL:                                                   */
/* Solo devuelve establecimientos / lugares que correspondan a la   */
/* intención solicitada. Nunca devuelve calles, barrios, ciudades,   */
/* direcciones ni entidades geográficas como si fueran lugares.      */
/*                                                                    */
/* La API key vive únicamente en Vercel:                              */
/* GEOAPIFY_API_KEY                                                   */
/* ------------------------------------------------------------------ */

const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY;

/* ------------------------------------------------------------------ */
/* CATEGORÍAS POR INTENCIÓN                                            */
/* ------------------------------------------------------------------ */

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
/* PRECIO                                                              */
/* ------------------------------------------------------------------ */

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
        c.includes("playground") ||
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

/* ------------------------------------------------------------------ */
/* MOOD                                                                */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* OUTDOOR                                                             */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* KIDS                                                                */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* NIGHT ONLY                                                          */
/* ------------------------------------------------------------------ */

function estimateNightOnly(categories) {
  const cats = categories || [];

  return cats.some((c) =>
    c.includes("nightclub")
  );
}

/* ------------------------------------------------------------------ */
/* HORARIOS                                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* EMOJI                                                               */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* HORARIOS SIMPLES                                                    */
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
/* GEOCODIFICACIÓN                                                     */
/* ------------------------------------------------------------------ */

async function geocodeLocation(text) {
  const query = String(text || "").trim();

  if (!query) {
    return null;
  }

  const url =
    "https://api.geoapify.com/v1/geocode/search" +
    `?text=${encodeURIComponent(query)}` +
    "&limit=20" +
    "&format=json" +
    `&apiKey=${GEOAPIFY_KEY}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      "geoapify-geocode-error"
    );
  }

  const data = await res.json();

  const results = Array.isArray(
    data.results
  )
    ? data.results
    : [];

  if (results.length === 0) {
    return null;
  }

  const wanted = normalizeText(query);

  const score = (r) => {
    const values = [
      r.name,
      r.city,
      r.state,
      r.suburb,
      r.neighbourhood,
      r.district,
      r.formatted,
    ];

    const hay = values.map(normalizeText);

    let scoreValue = 0;

    if (
      hay.some((v) =>
        v.includes("cordoba")
      )
    ) {
      scoreValue += 100;
    }

    if (
      hay.some((v) =>
        v === wanted
      )
    ) {
      scoreValue += 80;
    }

    if (
      normalizeText(r.suburb) === wanted ||
      normalizeText(r.neighbourhood) === wanted ||
      normalizeText(r.district) === wanted
    ) {
      scoreValue += 70;
    }

    if (
      normalizeText(r.city) === wanted
    ) {
      scoreValue += 50;
    }

    if (
      normalizeText(r.name) === wanted
    ) {
      scoreValue += 45;
    }

    if (
      normalizeText(r.formatted).includes(
        wanted
      )
    ) {
      scoreValue += 20;
    }

    const resultType =
      normalizeText(r.result_type);

    if (
      resultType.includes("suburb") ||
      resultType.includes("neighbourhood") ||
      resultType.includes("district") ||
      resultType.includes("city") ||
      resultType.includes("locality")
    ) {
      scoreValue += 15;
    }

    if (
      typeof r.lat !== "number" ||
      typeof r.lon !== "number"
    ) {
      scoreValue -= 1000;
    }

    return scoreValue;
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

/* ------------------------------------------------------------------ */
/* BÚSQUEDA DE LUGARES                                                 */
/* ------------------------------------------------------------------ */

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

      /*
       * Preferimos los lugares más cercanos
       * al punto encontrado.
       */
      bias:
        `proximity:${lon},${lat}`,

      /*
       * Radio de 15 km.
       */
      filter:
        `circle:${lon},${lat},15000`,

      apiKey: GEOAPIFY_KEY,
    });

  const url =
    `https://api.geoapify.com/v2/places?${params.toString()}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      "geoapify-places-error"
    );
  }

  const data = await res.json();

  return Array.isArray(
    data.features
  )
    ? data.features
    : [];
}

/* ------------------------------------------------------------------ */
/* DISTANCIA                                                           */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* DIRECCIÓN                                                           */
/* ------------------------------------------------------------------ */

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

  if (area) {
    return area;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* INTENCIÓN                                                           */
/* ------------------------------------------------------------------ */

function featureMatchesIntent(
  feature,
  allowedCategories
) {
  const props =
    feature &&
    feature.properties
      ? feature.properties
      : {};

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

/* ------------------------------------------------------------------ */
/* FILTRO REFORZADO CONTRA CALLES Y DIRECCIONES                       */
/* ------------------------------------------------------------------ */

/*
 * Esta función es deliberadamente estricta.
 *
 * Si Geoapify devuelve una calle como:
 *
 *   Darregueira
 *   Obispo Oro
 *   Av. Santa Fe
 *   Córdoba
 *
 * no queremos que pase como si fuera un lugar.
 *
 * También descartamos:
 *
 * - calles
 * - avenidas
 * - rutas
 * - autopistas
 * - barrios
 * - ciudades
 * - localidades
 * - distritos
 * - direcciones
 * - resultados administrativos
 * - resultados sin nombre comercial
 */

function looksLikeOnlyAnAddress(
  feature
) {
  const props =
    feature &&
    feature.properties
      ? feature.properties
      : {};

  const name =
    String(
      props.name || ""
    ).trim();

  const nameNorm =
    normalizeText(name);

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

  const resultType =
    normalizeText(
      props.result_type
    );

  const categories =
    Array.isArray(
      props.categories
    )
      ? props.categories.map(
          (c) =>
            normalizeText(c)
        )
      : [];

  /* -------------------------------------------------------------- */
  /* 1. SIN NOMBRE = DESCARTAR                                       */
  /* -------------------------------------------------------------- */

  if (!name) {
    return true;
  }

  /* -------------------------------------------------------------- */
  /* 2. NÚMERO SOLO = DESCARTAR                                     */
  /* -------------------------------------------------------------- */

  if (
    /^\d{1,6}$/.test(name)
  ) {
    return true;
  }

  /* -------------------------------------------------------------- */
  /* 3. RESULT TYPE GEOGRÁFICO                                      */
  /* -------------------------------------------------------------- */

  const geographicResultTypes = [
    "street",
    "road",
    "avenue",
    "highway",
    "path",
    "route",
    "square",
    "neighbourhood",
    "suburb",
    "district",
    "city",
    "town",
    "village",
    "municipality",
    "locality",
    "county",
    "state",
    "country",
    "postcode",
    "administrative",
  ];

  if (
    geographicResultTypes.some(
      (type) =>
        resultType === type ||
        resultType.includes(
          type
        )
    )
  ) {
    return true;
  }

  /* -------------------------------------------------------------- */
  /* 4. CATEGORÍAS DE CALLES / VÍAS                                 */
  /* -------------------------------------------------------------- */

  const streetCategoryPrefixes = [
    "highway.",
    "street.",
    "road.",
    "route.",
    "transport.",
    "place.city",
    "place.town",
    "place.village",
    "place.neighbourhood",
    "place.suburb",
    "administrative.",
    "boundary.",
  ];

  if (
    categories.some(
      (category) =>
        streetCategoryPrefixes.some(
          (prefix) =>
            category.startsWith(
              prefix
            )
        )
    )
  ) {
    return true;
  }

  /* -------------------------------------------------------------- */
  /* 5. NOMBRE IGUAL A LA CALLE                                     */
  /* -------------------------------------------------------------- */

  if (
    street &&
    nameNorm ===
      normalizeText(street)
  ) {
    return true;
  }

  /* -------------------------------------------------------------- */
  /* 6. NOMBRE IGUAL AL BARRIO                                      */
  /* -------------------------------------------------------------- */

  if (
    suburb &&
    nameNorm ===
      normalizeText(suburb)
  ) {
    return true;
  }

  if (
    neighbourhood &&
    nameNorm ===
      normalizeText(
        neighbourhood
      )
  ) {
    return true;
  }

  if (
    district &&
    nameNorm ===
      normalizeText(district)
  ) {
    return true;
  }

  /* -------------------------------------------------------------- */
  /* 7. NOMBRE IGUAL A LA CIUDAD                                    */
  /* -------------------------------------------------------------- */

  if (
    city &&
    nameNorm ===
      normalizeText(city)
  ) {
    return true;
  }

  /* -------------------------------------------------------------- */
  /* 8. NOMBRE IGUAL A LA DIRECCIÓN                                  */
  /* -------------------------------------------------------------- */

  if (
    addressLine1 &&
    nameNorm ===
      normalizeText(
        addressLine1
      )
  ) {
    return true;
  }

  /* -------------------------------------------------------------- */
  /* 9. DETECTAR NOMBRES QUE SON CLARAMENTE CALLES                   */
  /*                                                                    */
  /* Ejemplos:                                                        */
  /* "Darregueira"                                                    */
  /* "Obispo Oro"                                                     */
  /* "Av. Santa Fe"                                                   */
  /* "Avenida Córdoba"                                                */
  /* "Calle X"                                                        */
  /* "Ruta 9"                                                         */
  /* ---------------------------------------------------------------- */

  const obviousStreetPatterns = [
    /^av\.?\s+/i,
    /^avenida\s+/i,
    /^calle\s+/i,
    /^ruta\s+/i,
    /^autopista\s+/i,
    /^camino\s+/i,
    /^boulevard\s+/i,
    /^bulevar\s+/i,
    /^pasaje\s+/i,
    /^pje\.?\s+/i,
    /^diag\.?\s+/i,
    /^diagonal\s+/i,
    /^circunvalacion\s+/i,
    /^rn\s*\d+/i,
    /^rp\s*\d+/i,
    /^autovia\s+/i,
  ];

  if (
    obviousStreetPatterns.some(
      (pattern) =>
        pattern.test(name)
    )
  ) {
    return true;
  }

  /* -------------------------------------------------------------- */
  /* 10. NOMBRE CON NÚMERO DE ALTURA                                 */
  /*                                                                    */
  /* "Darregueira 1200"                                               */
  /* "Av. Santa Fe 1500"                                              */
  /* ---------------------------------------------------------------- */

  if (
    /\b\d{2,5}\b/.test(name)
  ) {
    /*
     * Si el nombre además contiene
     * indicios de vía, lo descartamos.
     */
    const streetWords =
      /\b(av|avenida|calle|ruta|autopista|camino|boulevard|bulevar|pasaje|diagonal)\b/i;

    if (
      streetWords.test(name)
    ) {
      return true;
    }
  }

  /* -------------------------------------------------------------- */
  /* 11. SIN CATEGORÍA REAL DE LUGAR                                 */
  /* ---------------------------------------------------------------- */

  const hasRealPlaceCategory =
    categories.some(
      (category) =>
        category.startsWith(
          "catering."
        ) ||
        category.startsWith(
          "entertainment."
        ) ||
        category.startsWith(
          "leisure."
        ) ||
        category.startsWith(
          "tourism."
        )
    );

  if (
    !hasRealPlaceCategory
  ) {
    return true;
  }

  /* -------------------------------------------------------------- */
  /* 12. SI LLEGA HASTA ACÁ, LO CONSIDERAMOS UN LUGAR               */
  /* ---------------------------------------------------------------- */

  return false;
}

/* ------------------------------------------------------------------ */
/* CONVERTIR FEATURE EN LUGAR                                         */
/* ------------------------------------------------------------------ */

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
      feature.geometry.coordinates
    )
      ? feature.geometry.coordinates
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

  /*
   * Nunca usamos address_line1
   * como nombre.
   */
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
      estimatePrice(
        categories
      ),

    /*
     * Geoapify no siempre proporciona
     * una valoración fiable.
     *
     * Mantenemos este valor para no
     * romper el contrato del frontend.
     */
    rating: 4.2,

    dist:
      distMin,

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

    why: null,

    address:
      cleanAddress(
        props
      ),

    hours,

    categories,

    source:
      "geoapify",
  };
}

/* ------------------------------------------------------------------ */
/* HANDLER                                                             */
/* ------------------------------------------------------------------ */

export default async function handler(
  req,
  res
) {
  if (
    req.method !== "POST"
  ) {
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

  const categories =
    INTENT_CATEGORIES[
      intent
    ] ||
    INTENT_CATEGORIES.general;

  try {
    /* -------------------------------------------------------------- */
    /* GEOCODIFICAR UBICACIÓN                                         */
    /* -------------------------------------------------------------- */

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

    /* -------------------------------------------------------------- */
    /* BUSCAR LUGARES                                                  */
    /* -------------------------------------------------------------- */

    const features =
      await searchPlaces({
        lat:
          location.lat,

        lon:
          location.lon,

        categories,
      });

    const seen =
      new Set();

    const places =
      features

        /* -------------------------------------------------------- */
        /* 1. CATEGORÍA CORRECTA                                    */
        /* -------------------------------------------------------- */

        .filter(
          (feature) =>
            featureMatchesIntent(
              feature,
              categories
            )
        )

        /* -------------------------------------------------------- */
        /* 2. ELIMINAR CALLES / DIRECCIONES / CIUDADES              */
        /* -------------------------------------------------------- */

        .filter(
          (feature) =>
            !looksLikeOnlyAnAddress(
              feature
            )
        )

        /* -------------------------------------------------------- */
        /* 3. MAPEAR                                                 */
        /* -------------------------------------------------------- */

        .map(
          (feature) =>
            mapFeatureToVenue(
              feature,
              location
            )
        )

        .filter(Boolean)

        /* -------------------------------------------------------- */
        /* 4. EVITAR DUPLICADOS                                      */
        /* -------------------------------------------------------- */

        .filter(
          (place) => {
            const key =
              `${normalizeText(
                place.name
              )}|${normalizeText(
                place.address || ""
              )}`;

            if (
              seen.has(key)
            ) {
              return false;
            }

            seen.add(key);

            return true;
          }
        );

    /* -------------------------------------------------------------- */
    /* RESPUESTA                                                       */
    /* -------------------------------------------------------------- */

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
