/* ------------------------------------------------------------------ */
/* api/lugares.js                                                     */
/*                                                                    */
/* Busca lugares REALES con Geoapify.                                 */
/*                                                                    */
/* Reglas de la versión final:                                       */
/* - La API key vive únicamente en Vercel: GEOAPIFY_API_KEY           */
/* - Nunca inventa lugares.                                          */
/* - Si no encuentra resultados devuelve places: [].                 */
/* - Respeta ciudad/barrio usando el place_id del geocodificador      */
/*   cuando Geoapify lo proporciona.                                  */
/* - No depende de api/interpretar.js.                                */
/*                                                                    */
/* Cambios de esta versión:                                          */
/* - El intent se normaliza (trim/lowercase/sin tildes) antes de      */
/*   buscarse en INTENT_CATEGORIES, para que nunca caiga             */
/*   silenciosamente en "general" por una variante de mayúsculas/    */
/*   tildes/espacios. Esto evita que categorías ajenas a la          */
/*   intención (ej. leisure.park en una búsqueda de "comer") se      */
/*   cuelen en los resultados.                                       */
/* - Se agrega un segundo filtro por "familia" de categoría           */
/*   (catering / entertainment / leisure / tourism / natural) como   */
/*   defensa adicional: un feature solo pasa si TODAS sus            */
/*   categorías pertenecen a la familia permitida para la            */
/*   intención. Es general, no depende de nombres de lugares.        */
/* - Se acepta un array opcional "exclude" en el body para que        */
/*   "Sorpréndeme de nuevo" no repita lugares ya mostrados.          */
/* - resolvedCity y address se devuelven TAL CUAL los entrega          */
/*   Geoapify, sin ninguna transformación de capitalización, para     */
/*   no alterar nombres propios ni tildes.                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Familias de categoría permitidas por intención.                    */
/*                                                                    */
/* Un feature solo se acepta si TODAS sus categorías Geoapify         */
/* pertenecen a alguna de estas familias (primer segmento antes del   */
/* primer punto, ej. "leisure.park" -> "leisure").                    */
/*                                                                    */
/* Esto es una defensa general (no una lista negra de nombres): evita */
/* que, por ejemplo, una plaza (leisure.*) aparezca como resultado    */
/* cuando la intención es "comer" (catering.*), sin importar por qué  */
/* haya llegado ese feature hasta acá.                                */
/* ------------------------------------------------------------------ */
const INTENT_FAMILY = {
  comer: ["catering"],
  beber: ["catering"],
  cultura: ["entertainment"],
  paseo: ["leisure", "tourism", "natural"],
  aire_libre: ["leisure", "natural"],
  fiesta: ["entertainment", "catering"],
  familia: ["leisure", "entertainment", "catering"],
  general: ["catering", "entertainment", "leisure", "tourism", "natural"],
};

function normalizeIntent(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

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
  )
    return 1;
  if (cats.some((c) => c.includes("nightclub"))) return 3;
  if (cats.some((c) => c.includes("museum") || c.includes("culture"))) return 2;
  if (cats.some((c) => c.includes("bar") || c.includes("pub"))) return 2;
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

  if (
    cats.some(
      (c) =>
        c.includes("cafe") ||
        c.includes("museum") ||
        c.includes("culture") ||
        c.includes("park") ||
        c.includes("natural") ||
        c.includes("playground")
    )
  ) {
    return ["tranquilo"];
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

  return cats.some((c) => c.includes("nightclub"));
}

function estimateSlots(categories) {
  const cats = categories || [];

  if (cats.some((c) => c.includes("nightclub"))) {
    return ["night"];
  }

  if (cats.some((c) => c.includes("bar") || c.includes("pub"))) {
    return ["afternoon", "night"];
  }

  return ["morning", "afternoon", "night"];
}

function emojiFor(categories) {
  const cats = categories || [];

  if (cats.some((c) => c.includes("fast_food"))) return "🍔";
  if (cats.some((c) => c.includes("restaurant"))) return "🍽️";
  if (cats.some((c) => c.includes("cafe"))) return "☕";
  if (cats.some((c) => c.includes("bar") || c.includes("pub"))) return "🍺";
  if (cats.some((c) => c.includes("nightclub"))) return "🎉";
  if (cats.some((c) => c.includes("museum") || c.includes("culture"))) return "🖼️";
  if (cats.some((c) => c.includes("park"))) return "🌳";
  if (cats.some((c) => c.includes("natural") || c.includes("water"))) return "🌿";
  if (cats.some((c) => c.includes("viewpoint"))) return "✨";
  if (
    cats.some(
      (c) =>
        c.includes("playground") ||
        c.includes("activity_park")
    )
  )
    return "🎡";

  return "📍";
}

function parseSimpleHours(raw) {
  if (!raw || typeof raw !== "string") return null;

  const match = raw.match(
    /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/
  );

  if (!match) return null;

  return [match[1], match[2]];
}

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
    throw new Error("geoapify-geocode-error");
  }

  const data = await res.json();
  const results = Array.isArray(data.results)
    ? data.results
    : [];

  if (results.length === 0) return null;

  const wanted = query.toLowerCase();

  const wantedNorm = wanted
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const score = (r) => {
    const name = String(r.name || "").toLowerCase();
    const city = String(r.city || "").toLowerCase();
    const state = String(r.state || "").toLowerCase();
    const suburb = String(r.suburb || "").toLowerCase();
    const neighbourhood = String(r.neighbourhood || "").toLowerCase();
    const district = String(r.district || "").toLowerCase();
    const formatted = String(r.formatted || "").toLowerCase();

    const hay = [
      name,
      city,
      state,
      suburb,
      neighbourhood,
      district,
      formatted,
    ];

    const hayNorm = hay.map((v) =>
      v
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
    );

    let s = 0;

    // Para barrios de Córdoba, priorizar fuertemente resultados de Córdoba.
    if (hayNorm.some((v) => v.includes("cordoba"))) {
      s += 100;
    }

    if (hay.some((v) => v === wanted)) {
      s += 80;
    }

    if (hayNorm.some((v) => v === wantedNorm)) {
      s += 80;
    }

    if (
      suburb === wanted ||
      neighbourhood === wanted ||
      district === wanted
    ) {
      s += 60;
    }

    if (city === wanted) {
      s += 50;
    }

    if (name === wanted) {
      s += 45;
    }

    if (formatted.includes(wanted)) {
      s += 20;
    }

    const resultType = String(
      r.result_type || ""
    ).toLowerCase();

    if (
      resultType.includes("suburb") ||
      resultType.includes("neighbourhood") ||
      resultType.includes("district") ||
      resultType.includes("city") ||
      resultType.includes("locality")
    ) {
      s += 15;
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

async function searchPlaces({
  lat,
  lon,
  placeId,
  categories,
  limit = 40,
}) {
  const params = new URLSearchParams({
    categories: categories.join(","),
    limit: String(limit),
    bias: `proximity:${lon},${lat}`,
    apiKey: GEOAPIFY_KEY,
  });

  if (placeId) {
    params.set(
      "filter",
      `place:${placeId}`
    );
  } else {
    params.set(
      "filter",
      `circle:${lon},${lat},15000`
    );
  }

  const url =
    `https://api.geoapify.com/v2/places?${params.toString()}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("geoapify-places-error");
  }

  const data = await res.json();

  return Array.isArray(data.features)
    ? data.features
    : [];
}

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
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
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
    return String(props.address_line2);
  }

  if (props.formatted) {
    return String(props.formatted);
  }

  if (area) {
    return area;
  }

  return null;
}

function featureMatchesIntent(
  feature,
  allowedCategories
) {
  const props =
    feature && feature.properties
      ? feature.properties
      : {};

  const categories = Array.isArray(
    props.categories
  )
    ? props.categories
    : [];

  return categories.some((actual) =>
    allowedCategories.some(
      (allowed) =>
        actual === allowed ||
        actual.startsWith(`${allowed}.`)
    )
  );
}

/**
 * Defensa adicional: exige que TODAS las categorías del feature
 * pertenezcan a la "familia" de categorías permitida para la
 * intención (catering / entertainment / leisure / tourism / natural).
 * Es general y no depende de nombres de lugares: evita que, por
 * ejemplo, una plaza (leisure.*) se cuele en resultados de "comer"
 * (catering.*) sin importar cómo haya llegado ese feature hasta acá.
 */
function featureBelongsToFamily(
  feature,
  normalizedIntent
) {
  const allowedFamilies =
    INTENT_FAMILY[normalizedIntent] ||
    INTENT_FAMILY.general;

  const props =
    feature && feature.properties
      ? feature.properties
      : {};

  const categories = Array.isArray(
    props.categories
  )
    ? props.categories
    : [];

  if (categories.length === 0) {
    return false;
  }

  return categories.every((c) =>
    allowedFamilies.includes(
      String(c).split(".")[0]
    )
  );
}

function looksLikeOnlyAnAddress(feature) {
  const props =
    feature && feature.properties
      ? feature.properties
      : {};

  const name = String(
    props.name || ""
  ).trim();

  const address = String(
    props.address_line1 || ""
  ).trim();

  if (!name) return true;

  if (/^\d{1,6}$/.test(name)) {
    return true;
  }

  if (
    name === address &&
    !props.categories?.some((c) =>
      String(c).startsWith("catering.") ||
      String(c).startsWith("entertainment.") ||
      String(c).startsWith("leisure.") ||
      String(c).startsWith("tourism.")
    )
  ) {
    return true;
  }

  return false;
}

function mapFeatureToVenue(
  feature,
  center
) {
  const props =
    feature.properties || {};

  const categories = Array.isArray(
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

  const [lon, lat] = coords;

  const distKm =
    typeof lat === "number" &&
    typeof lon === "number"
      ? haversineKm(
          center.lat,
          center.lon,
          lat,
          lon
        )
      : null;

  const name =
    props.name ||
    props.address_line1;

  if (
    !name ||
    !String(name).trim()
  ) {
    return null;
  }

  const hours =
    parseSimpleHours(
      props.opening_hours
    );

  const distMin =
    distKm != null
      ? Math.max(
          1,
          Math.round(
            (distKm / 4.5) * 60
          )
        )
      : 10;

  return {
    name: String(name).trim(),
    emoji: emojiFor(categories),
    price: estimatePrice(categories),
    rating: 4.2,
    dist: distMin,
    mood: estimateMood(categories),
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
    hours,
    categories,
    source: "geoapify",
  };
}

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
    exclude,
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

  const normalizedIntent =
    normalizeIntent(intent);

  const categories =
    INTENT_CATEGORIES[normalizedIntent] ||
    INTENT_CATEGORIES.general;

  const excludeSet = new Set(
    (Array.isArray(exclude) ? exclude : []).map(
      (k) => String(k).toLowerCase()
    )
  );

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
        placeId:
          location.placeId,
        categories,
      });

    const seen = new Set();

    const places = features
      .filter((feature) =>
        featureMatchesIntent(
          feature,
          categories
        )
      )
      .filter((feature) =>
        featureBelongsToFamily(
          feature,
          normalizedIntent
        )
      )
      .filter(
        (feature) =>
          !looksLikeOnlyAnAddress(
            feature
          )
      )
      .map((feature) =>
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
      })
      .filter((place) => {
        const key =
          `${place.name}|${
            place.address || ""
          }`.toLowerCase();

        return !excludeSet.has(key);
      });

    res.status(200).json({
      city,
      resolvedCity:
        location.label,
      places,
    });
  } catch (err) {
    res.status(502).json({
      error:
        "geoapify-request-failed",
    });
  }
}
