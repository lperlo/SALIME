/* ------------------------------------------------------------------ */
/* api/lugares.js                                                     */
/*                                                                    */
/* Busca lugares REALES con Geoapify.                                 */
/*                                                                    */
/* OBJETIVO DE ESTA VERSIÓN:                                         */
/* - Nunca devolver calles como lugares.                              */
/* - Nunca devolver barrios como lugares.                             */
/* - Nunca devolver ciudades como lugares.                            */
/* - Nunca devolver direcciones como lugares.                         */
/* - Nunca inventar lugares.                                          */
/* - Respetar estrictamente el intent recibido.                       */
/* - Buscar alrededor del punto geocodificado.                        */
/* - Si hay menos de 3 lugares válidos, devolver solamente            */
/*   los lugares válidos encontrados.                                 */
/* ------------------------------------------------------------------ */

const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY;

/* ------------------------------------------------------------------ */
/* CATEGORÍAS POR INTENT                                              */
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
/* NORMALIZACIÓN DE TEXTO                                             */
/* ------------------------------------------------------------------ */

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/* ------------------------------------------------------------------ */
/* ESTIMACIONES PARA EL FRONTEND                                      */
/* ------------------------------------------------------------------ */

function estimatePrice(categories) {
  const cats = categories || [];

  if (cats.some((c) => c.includes("fast_food"))) return 1;

  if (cats.some((c) => c.includes("cafe"))) return 1;

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
        c.includes("nightclub") ||
        c.includes("bar") ||
        c.includes("pub")
    )
  ) {
    return ["animado"];
  }

  return ["tranquilo"];
}

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
/* HORARIOS                                                           */
/* ------------------------------------------------------------------ */

function parseSimpleHours(raw) {
  if (!raw || typeof raw !== "string") {
    return null;
  }

  const match = raw.match(
    /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/
  );

  if (!match) return null;

  return [
    match[1],
    match[2],
  ];
}

/* ------------------------------------------------------------------ */
/* GEOCODIFICACIÓN                                                    */
/* ------------------------------------------------------------------ */

async function geocodeLocation(text) {
  const query = String(text || "").trim();

  if (!query) return null;

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

  const results = Array.isArray(data.results)
    ? data.results
    : [];

  if (!results.length) {
    return null;
  }

  const wanted = normalizeText(query);

  const score = (r) => {
    const name = normalizeText(r.name);
    const city = normalizeText(r.city);
    const state = normalizeText(r.state);
    const suburb = normalizeText(r.suburb);
    const neighbourhood = normalizeText(
      r.neighbourhood
    );
    const district = normalizeText(
      r.district
    );
    const formatted = normalizeText(
      r.formatted
    );
    const resultType = normalizeText(
      r.result_type
    );

    let scoreValue = 0;

    /*
     * Prioridad máxima a coincidencia
     * exacta con el pedido.
     */
    if (name === wanted) {
      scoreValue += 200;
    }

    if (suburb === wanted) {
      scoreValue += 180;
    }

    if (neighbourhood === wanted) {
      scoreValue += 180;
    }

    if (district === wanted) {
      scoreValue += 170;
    }

    if (city === wanted) {
      scoreValue += 160;
    }

    /*
     * Coincidencia dentro del resultado.
     */
    if (formatted.includes(wanted)) {
      scoreValue += 40;
    }

    /*
     * Para Nueva Córdoba, Güemes,
     * Alta Córdoba, etc., priorizamos
     * resultados de barrio/zona.
     */
    if (
      resultType.includes("suburb") ||
      resultType.includes("neighbourhood") ||
      resultType.includes("district")
    ) {
      scoreValue += 50;
    }

    if (
      resultType.includes("city") ||
      resultType.includes("locality")
    ) {
      scoreValue += 30;
    }

    /*
     * Preferimos resultados con coordenadas válidas.
     */
    if (
      typeof r.lat !== "number" ||
      typeof r.lon !== "number"
    ) {
      scoreValue -= 1000;
    }

    return scoreValue;
  };

  const sorted = [...results].sort(
    (a, b) =>
      score(b) - score(a)
  );

  const first = sorted[0];

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
      first.formatted ||
      query,
  };
}

/* ------------------------------------------------------------------ */
/* BÚSQUEDA DE LUGARES                                                */
/* ------------------------------------------------------------------ */

async function searchPlaces({
  lat,
  lon,
  categories,
  limit = 80,
}) {
  const params = new URLSearchParams({
    categories: categories.join(","),
    limit: String(limit),

    /*
     * Cercanía al punto solicitado.
     */
    bias: `proximity:${lon},${lat}`,

    /*
     * Radio máximo de 15 km.
     */
    filter: `circle:${lon},${lat},15000`,

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
    ((lat2 - lat1) * Math.PI) / 180;

  const dLon =
    ((lon2 - lon1) * Math.PI) / 180;

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
/* DIRECCIÓN PARA MOSTRAR                                             */
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
/* INTENT                                                              */
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
    Array.isArray(props.categories)
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
/* FILTRO ESTRICTO DE LUGARES                                         */
/*                                                                    */
/* Esta es la parte importante de la corrección.                     */
/*                                                                    */
/* Geoapify puede devolver entidades geográficas mezcladas con        */
/* establecimientos. Por eso no alcanza con mirar solamente          */
/* "name".                                                              */
/*                                                                    */
/* Descartamos explícitamente:                                        */
/* - calles                                                            */
/* - avenidas                                                          */
/* - rutas                                                             */
/* - barrios                                                           */
/* - ciudades                                                          */
/* - municipios                                                        */
/* - direcciones                                                       */
/* - resultados sin nombre                                             */
/* - resultados que no tengan categorías de lugar válidas              */
/* ------------------------------------------------------------------ */

function looksLikeOnlyAnAddress(feature) {
  const props =
    feature &&
    feature.properties
      ? feature.properties
      : {};

  const name = String(
    props.name || ""
  ).trim();

  const addressLine1 = String(
    props.address_line1 || ""
  ).trim();

  const street = String(
    props.street || ""
  ).trim();

  const suburb = String(
    props.suburb || ""
  ).trim();

  const neighbourhood = String(
    props.neighbourhood || ""
  ).trim();

  const district = String(
    props.district || ""
  ).trim();

  const city = String(
    props.city || ""
  ).trim();

  const state = String(
    props.state || ""
  ).trim();

  const municipality = String(
    props.municipality || ""
  ).trim();

  const postcode = String(
    props.postcode || ""
  ).trim();

  const resultType = normalizeText(
    props.result_type
  );

  const categories =
    Array.isArray(props.categories)
      ? props.categories.map(String)
      : [];

  /* -------------------------------------------------------------- */
  /* SIN NOMBRE = DESCARTAR                                          */
  /* -------------------------------------------------------------- */

  if (!name) {
    return true;
  }

  /* -------------------------------------------------------------- */
  /* NOMBRE PURAMENTE NUMÉRICO                                      */
  /* -------------------------------------------------------------- */

  if (/^\d{1,6}$/.test(name)) {
    return true;
  }

  const nameNorm = normalizeText(name);

  /* -------------------------------------------------------------- */
  /* COINCIDENCIA CON CAMPOS GEOGRÁFICOS                             */
  /* -------------------------------------------------------------- */

  const geographicNames = [
    street,
    suburb,
    neighbourhood,
    district,
    city,
    state,
    municipality,
  ]
    .filter(Boolean)
    .map(normalizeText);

  if (
    geographicNames.includes(nameNorm)
  ) {
    return true;
  }

  /* -------------------------------------------------------------- */
  /* COINCIDENCIA CON DIRECCIÓN                                      */
  /* -------------------------------------------------------------- */

  if (
    addressLine1 &&
    nameNorm ===
      normalizeText(addressLine1)
  ) {
    return true;
  }

  /* -------------------------------------------------------------- */
  /* RESULT TYPES GEOGRÁFICOS                                       */
  /* -------------------------------------------------------------- */

  const geographicResultTypes = [
    "street",
    "road",
    "highway",
    "avenue",
    "city",
    "town",
    "village",
    "municipality",
    "locality",
    "suburb",
    "neighbourhood",
    "district",
    "postcode",
    "county",
    "state",
    "country",
    "region",
  ];

  if (
    geographicResultTypes.some(
      (type) =>
        resultType === type ||
        resultType.includes(type)
    )
  ) {
    return true;
  }

  /* -------------------------------------------------------------- */
  /* CATEGORÍAS GEOGRÁFICAS                                          */
  /* -------------------------------------------------------------- */

  const hasStreetCategory =
    categories.some(
      (c) =>
        c === "highway" ||
        c.startsWith("highway.") ||
        c === "street" ||
        c.startsWith("street.")
    );

  if (hasStreetCategory) {
    return true;
  }

  /* -------------------------------------------------------------- */
  /* PALABRAS QUE IDENTIFICAN CALLES                                 */
  /*                                                                   
   * Importante: solamente se usan como defensa adicional.            */
  * No eliminamos cualquier nombre que contenga una palabra común.
   * -------------------------------------------------------------- */

  const streetWords = [
    "calle ",
    "av. ",
    "av ",
    "avenida ",
    "ruta ",
    "boulevard ",
    "bulevar ",
    "camino ",
    "autopista ",
    "pasaje ",
    "pje. ",
    "diagonal ",
    "circunvalacion ",
  ];

  const nameWithSpace =
    `${nameNorm} `;

  if (
    streetWords.some(
      (word) =>
        nameWithSpace.startsWith(
          word
        )
    )
  ) {
    return true;
  }

  /* -------------------------------------------------------------- */
  /* DIRECCIÓN QUE EMPIEZA CON NÚMERO                               */
  /* -------------------------------------------------------------- */

  if (
    /^\d+\s+[a-záéíóúñ]/i.test(name)
  ) {
    return true;
  }

  /*
   * Caso típico:
   * "Obispo Oro"
   *
   * Si Geoapify informa además que el
   * elemento es una vía o que su única
   * referencia estructural es una calle,
   * se descarta.
   */
  if (
    street &&
    normalizeText(street) === nameNorm
  ) {
    return true;
  }

  /* -------------------------------------------------------------- */
  /* CATEGORÍA REAL DE LUGAR                                         */
  /* -------------------------------------------------------------- */

  const hasRealPlaceCategory =
    categories.some(
      (c) =>
        c.startsWith("catering.") ||
        c.startsWith("entertainment.") ||
        c.startsWith("leisure.") ||
        c.startsWith("tourism.")
    );

  if (!hasRealPlaceCategory) {
    return true;
  }

  return false;
}

/* ------------------------------------------------------------------ */
/* MAPEO A FORMATO DE LA APP                                          */
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

  const geometry =
    feature.geometry || {};

  const coordinates =
    Array.isArray(
      geometry.coordinates
    )
      ? geometry.coordinates
      : [];

  const lon = coordinates[0];
  const lat = coordinates[1];

  if (
    typeof lat !== "number" ||
    typeof lon !== "number"
  ) {
    return null;
  }

  const name = String(
    props.name || ""
  ).trim();

  if (!name) {
    return null;
  }

  const distKm =
    haversineKm(
      center.lat,
      center.lon,
      lat,
      lon
    );

  const distMin = Math.max(
    1,
    Math.round(
      (distKm / 4.5) * 60
    )
  );

  const hours =
    parseSimpleHours(
      props.opening_hours
    );

  return {
    name,

    emoji:
      emojiFor(categories),

    price:
      estimatePrice(categories),

    /*
     * Se mantiene 4.2 porque el frontend
     * actual espera un rating numérico.
     * No se presenta como una valoración
     * real de Geoapify.
     */
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

    source: "geoapify",
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
      error: "method-not-allowed",
    });
    return;
  }

  if (!GEOAPIFY_KEY) {
    res.status(500).json({
      error: "missing-geoapify-key",
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

  /*
   * Solamente usamos intents conocidos.
   */
  const safeIntent =
    Object.prototype.hasOwnProperty.call(
      INTENT_CATEGORIES,
      intent
    )
      ? intent
      : "general";

  const categories =
    INTENT_CATEGORIES[
      safeIntent
    ];

  try {
    /* -------------------------------------------------------------- */
    /* 1. GEOCODIFICAR                                                */
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
    /* 2. BUSCAR MUCHOS RESULTADOS                                    */
    /* -------------------------------------------------------------- */

    const features =
      await searchPlaces({
        lat: location.lat,
        lon: location.lon,
        categories,
        limit: 80,
      });

    /* -------------------------------------------------------------- */
    /* 3. FILTRO POR INTENT                                            */
    /* -------------------------------------------------------------- */

    const intentMatches =
      features.filter(
        (feature) =>
          featureMatchesIntent(
            feature,
            categories
          )
      );

    /* -------------------------------------------------------------- */
    /* 4. FILTRO GEOGRÁFICO / CALLES                                  */
    /* -------------------------------------------------------------- */

    const realPlaces =
      intentMatches.filter(
        (feature) =>
          !looksLikeOnlyAnAddress(
            feature
          )
      );

    /* -------------------------------------------------------------- */
    /* 5. MAPEAR                                                       */
    /* -------------------------------------------------------------- */

    const mapped =
      realPlaces
        .map((feature) =>
          mapFeatureToVenue(
            feature,
            location
          )
        )
        .filter(Boolean);

    /* -------------------------------------------------------------- */
    /* 6. ELIMINAR DUPLICADOS                                          */
    /* -------------------------------------------------------------- */

    const seen = new Set();

    const places =
      mapped.filter((place) => {
        const key =
          `${normalizeText(
            place.name
          )}|${normalizeText(
            place.address || ""
          )}`;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });

    /* -------------------------------------------------------------- */
    /* 7. ORDENAR POR DISTANCIA                                       */
    /* -------------------------------------------------------------- */

    places.sort(
      (a, b) => a.dist - b.dist
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
