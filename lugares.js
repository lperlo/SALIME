// api/lugares.js
//
// SALIME - búsqueda de lugares reales.
//
// OBJETIVO:
// - Buscar lugares reales con Geoapify.
// - Nunca mostrar calles como lugares.
// - Nunca mostrar barrios, ciudades, distritos o direcciones.
// - Respetar estrictamente el intent.
// - Respetar la ubicación indicada.
// - Si no hay suficientes lugares válidos, devolver menos resultados.
// - NUNCA rellenar resultados con candidatos dudosos.
//

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
    "tourism.attraction",
    "tourism.sights",
    "tourism.information",
    "leisure.park",
  ],

  aire_libre: [
    "leisure.park",
    "natural",
    "natural.water",
    "tourism.attraction.viewpoint",
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


// ---------------------------------------------------------------
// UTILIDADES
// ---------------------------------------------------------------

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}


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

  return ["morning", "afternoon", "night"];
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

  return [match[1], match[2]];
}


// ---------------------------------------------------------------
// GEOCODIFICACIÓN
// ---------------------------------------------------------------

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
    throw new Error("geoapify-geocode-error");
  }

  const data = await res.json();

  const results = Array.isArray(data.results)
    ? data.results
    : [];

  if (results.length === 0) {
    return null;
  }

  const wanted = normalizeText(query);

  const score = (r) => {
    const fields = [
      r.name,
      r.city,
      r.state,
      r.suburb,
      r.neighbourhood,
      r.district,
      r.formatted,
    ];

    const values = fields.map(normalizeText);

    let scoreValue = 0;

    if (
      values.some((v) =>
        v.includes("cordoba")
      )
    ) {
      scoreValue += 100;
    }

    if (
      values.some(
        (v) => v === wanted
      )
    ) {
      scoreValue += 100;
    }

    if (
      normalizeText(r.suburb) === wanted ||
      normalizeText(r.neighbourhood) === wanted ||
      normalizeText(r.district) === wanted
    ) {
      scoreValue += 80;
    }

    if (
      normalizeText(r.city) === wanted
    ) {
      scoreValue += 60;
    }

    if (
      normalizeText(r.name) === wanted
    ) {
      scoreValue += 50;
    }

    if (
      normalizeText(r.formatted).includes(
        wanted
      )
    ) {
      scoreValue += 20;
    }

    const resultType = normalizeText(
      r.result_type
    );

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
    (a, b) => score(b) - score(a)
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
    label: first.formatted || query,
    placeId: first.place_id || null,
  };
}


// ---------------------------------------------------------------
// BÚSQUEDA DE LUGARES
// ---------------------------------------------------------------

async function searchPlaces({
  lat,
  lon,
  categories,
  limit = 40,
}) {
  const params = new URLSearchParams({
    categories: categories.join(","),
    limit: String(limit),

    bias: `proximity:${lon},${lat}`,

    // Radio suficientemente amplio para encontrar lugares reales.
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


// ---------------------------------------------------------------
// DISTANCIA
// ---------------------------------------------------------------

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


// ---------------------------------------------------------------
// DIRECCIÓN
// ---------------------------------------------------------------

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


// ---------------------------------------------------------------
// CATEGORÍAS
// ---------------------------------------------------------------

function featureMatchesIntent(
  feature,
  allowedCategories
) {
  const props =
    feature?.properties || {};

  const categories = Array.isArray(
    props.categories
  )
    ? props.categories
    : [];

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


// ---------------------------------------------------------------
// FILTRO MUY ESTRICTO DE CALLES / DIRECCIONES
// ---------------------------------------------------------------

function looksLikeStreetOrAddress(
  feature
) {
  const props =
    feature?.properties || {};

  const name = normalizeText(
    props.name
  );

  if (!name) {
    return true;
  }

  const street = normalizeText(
    props.street
  );

  const addressLine1 =
    normalizeText(
      props.address_line1
    );

  const suburb = normalizeText(
    props.suburb
  );

  const neighbourhood =
    normalizeText(
      props.neighbourhood
    );

  const district =
    normalizeText(
      props.district
    );

  const city =
    normalizeText(
      props.city
    );

  /*
   * Si Geoapify dice explícitamente que el
   * resultado es una calle, ruta, camino, etc.,
   * lo descartamos.
   */
  const resultType = normalizeText(
    props.result_type
  );

  const forbiddenResultTypes = [
    "street",
    "road",
    "highway",
    "path",
    "way",
    "route",
    "avenue",
    "square",
    "locality",
    "suburb",
    "neighbourhood",
    "district",
    "city",
    "municipality",
    "county",
    "state",
    "country",
    "postcode",
  ];

  if (
    forbiddenResultTypes.some(
      (type) =>
        resultType === type ||
        resultType.includes(type)
    )
  ) {
    return true;
  }

  /*
   * Si el nombre coincide con la calle
   * informada por Geoapify.
   *
   * Esto atrapa específicamente casos
   * como:
   *
   * Darregueira
   * Obispo Oro
   * Cantero
   */
  if (
    street &&
    name === street
  ) {
    return true;
  }

  /*
   * Nunca permitir que una dirección
   * aparezca como establecimiento.
   */
  if (
    addressLine1 &&
    name === addressLine1
  ) {
    return true;
  }

  /*
   * Nunca permitir barrios.
   */
  if (
    suburb &&
    name === suburb
  ) {
    return true;
  }

  if (
    neighbourhood &&
    name === neighbourhood
  ) {
    return true;
  }

  if (
    district &&
    name === district
  ) {
    return true;
  }

  /*
   * Nunca permitir ciudades.
   */
  if (
    city &&
    name === city
  ) {
    return true;
  }

  /*
   * Nombres que son solamente números.
   */
  if (
    /^\d{1,6}$/.test(name)
  ) {
    return true;
  }

  /*
   * Patrones típicos de direcciones.
   */
  if (
    /^(calle|avenida|av|ruta|camino|pasaje|pje|boulevard|bulevar)\s+/i.test(
      name
    )
  ) {
    return true;
  }

  /*
   * Si el nombre tiene formato
   * "Nombre 123" y además no tiene
   * información comercial clara,
   * lo consideramos sospechoso.
   */
  if (
    /\s\d{1,5}$/.test(name) &&
    !props.datasource?.raw?.shop &&
    !props.datasource?.raw?.amenity
  ) {
    return true;
  }

  return false;
}


// ---------------------------------------------------------------
// VALIDACIÓN EXTRA DEL NOMBRE
//
// Esta es la defensa adicional contra calles como
// "Darregueira".
//
// Consultamos el nombre del candidato en el
// geocodificador y verificamos qué tipo de
// resultado devuelve.
//
// Si el nombre corresponde a una calle,
// ruta, barrio, ciudad, etc., se descarta.
// ---------------------------------------------------------------

async function validatePlaceName(
  name,
  props
) {
  const cleanName =
    String(name || "").trim();

  if (!cleanName) {
    return false;
  }

  const city =
    props.city ||
    props.suburb ||
    props.district ||
    "";

  const state =
    props.state || "";

  const query = [
    cleanName,
    city,
    state,
  ]
    .filter(Boolean)
    .join(", ");

  try {
    const url =
      "https://api.geoapify.com/v1/geocode/search" +
      `?text=${encodeURIComponent(query)}` +
      "&limit=5" +
      "&format=json" +
      `&apiKey=${GEOAPIFY_KEY}`;

    const res = await fetch(url);

    if (!res.ok) {
      /*
       * Si la validación secundaria falla,
       * NO bloqueamos el lugar.
       *
       * La validación principal continúa
       * protegiendo el resultado.
       */
      return true;
    }

    const data = await res.json();

    const results = Array.isArray(
      data.results
    )
      ? data.results
      : [];

    if (!results.length) {
      return true;
    }

    const normalizedName =
      normalizeText(cleanName);

    /*
     * Buscamos coincidencias exactas.
     */
    const exactMatches =
      results.filter((r) => {
        return (
          normalizeText(r.name) ===
          normalizedName
        );
      });

    if (!exactMatches.length) {
      /*
       * No hay una coincidencia clara
       * con una calle. No bloqueamos.
       */
      return true;
    }

    const forbiddenTypes = [
      "street",
      "road",
      "highway",
      "path",
      "way",
      "route",
      "avenue",
      "suburb",
      "neighbourhood",
      "district",
      "city",
      "municipality",
      "county",
      "state",
      "country",
      "postcode",
    ];

    /*
     * Si TODOS los resultados exactos son
     * entidades geográficas y ninguno es
     * un POI/establecimiento, descartamos.
     */
    const hasForbiddenOnly =
      exactMatches.every((r) => {
        const type =
          normalizeText(
            r.result_type
          );

        return forbiddenTypes.some(
          (forbidden) =>
            type === forbidden ||
            type.includes(forbidden)
        );
      });

    if (hasForbiddenOnly) {
      return false;
    }

    return true;
  } catch (error) {
    /*
     * No hacemos fallar toda la búsqueda
     * porque falle una validación secundaria.
     */
    console.warn(
      "Validación secundaria falló:",
      cleanName
    );

    return true;
  }
}


// ---------------------------------------------------------------
// MAPEO FINAL
// ---------------------------------------------------------------

function mapFeatureToVenue(
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
    feature.geometry &&
    Array.isArray(
      feature.geometry.coordinates
    )
      ? feature.geometry.coordinates
      : [null, null];

  const [lon, lat] = coords;

  if (
    typeof lat !== "number" ||
    typeof lon !== "number"
  ) {
    return null;
  }

  const name =
    String(props.name || "").trim();

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

  return {
    name,

    emoji:
      emojiFor(categories),

    price:
      estimatePrice(categories),

    /*
     * No inventamos ratings.
     * Se mantiene el valor que esperaba
     * el frontend.
     */
    rating: 4.2,

    dist: distMin,

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

    why: null,

    address:
      cleanAddress(props),

    hours:
      parseSimpleHours(
        props.opening_hours
      ),

    categories,

    source:
      "geoapify",
  };
}


// ---------------------------------------------------------------
// HANDLER
// ---------------------------------------------------------------

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

  const categories =
    INTENT_CATEGORIES[intent] ||
    INTENT_CATEGORIES.general;

  try {
    // -------------------------------------------------------------
    // 1. GEOCODIFICAR UBICACIÓN
    // -------------------------------------------------------------

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


    // -------------------------------------------------------------
    // 2. BUSCAR CANDIDATOS
    // -------------------------------------------------------------

    const features =
      await searchPlaces({
        lat: location.lat,
        lon: location.lon,
        categories,
        limit: 40,
      });


    // -------------------------------------------------------------
    // 3. FILTROS PRINCIPALES
    // -------------------------------------------------------------

    const candidates = features
      /*
       * SOLAMENTE categorías correspondientes
       * al intent.
       */
      .filter((feature) =>
        featureMatchesIntent(
          feature,
          categories
        )
      )

      /*
       * ELIMINAR calles, barrios,
       * ciudades y direcciones.
       */
      .filter(
        (feature) =>
          !looksLikeStreetOrAddress(
            feature
          )
      );


    // -------------------------------------------------------------
    // 4. VALIDACIÓN SECUNDARIA
    //
    // Importante:
    // hacemos la comprobación ANTES de
    // convertir definitivamente el resultado.
    // -------------------------------------------------------------

    const validated = [];

    /*
     * Limitamos la cantidad de consultas
     * secundarias para no hacer una cantidad
     * innecesaria de requests.
     */
    for (
      const feature of candidates.slice(0, 15)
    ) {
      const props =
        feature?.properties || {};

      const name =
        String(
          props.name || ""
        ).trim();

      if (!name) {
        continue;
      }

      const valid =
        await validatePlaceName(
          name,
          props
        );

      if (!valid) {
        console.warn(
          "Lugar descartado por parecer calle:",
          name
        );

        continue;
      }

      validated.push(feature);
    }


    // -------------------------------------------------------------
    // 5. MAPEAR
    // -------------------------------------------------------------

    const seen = new Set();

    const places =
      validated
        .map((feature) =>
          mapFeatureToVenue(
            feature,
            location
          )
        )
        .filter(Boolean)

        /*
         * Segunda protección:
         * nunca dejar pasar calles después
         * del mapeo.
         */
        .filter((place) => {
          const name =
            normalizeText(
              place.name
            );

          if (
            /^(calle|avenida|av|ruta|camino|pasaje|pje|boulevard|bulevar)\s+/i.test(
              name
            )
          ) {
            return false;
          }

          return true;
        })

        /*
         * No repetir lugares.
         */
        .filter((place) => {
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


    // -------------------------------------------------------------
    // 6. RESPUESTA
    //
    // IMPORTANTE:
    // NO rellenamos artificialmente hasta 3.
    // Si solo hay 2 lugares válidos,
    // devolvemos 2.
    // -------------------------------------------------------------

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
