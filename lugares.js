/* ------------------------------------------------------------------ */
/* api/lugares.js                                                     */
/*                                                                    */
/* Busca lugares REALES con Geoapify.                                 */
/*                                                                    */
/* Reglas:                                                            */
/* - La API key vive únicamente en Vercel: GEOAPIFY_API_KEY            */
/* - Nunca inventa lugares.                                           */
/* - Nunca usa una calle, barrio o ciudad como nombre de un lugar.    */
/* - Si no encuentra lugares reales, devuelve places: [].             */
/* - Respeta ciudad/barrio usando el place_id del geocodificador.     */
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
  if (cats.some((c) => c.includes("museum") || c.includes("culture"))) {
    return 2;
  }
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

  if (
    cats.some(
      (c) => c.includes("bar") || c.includes("pub")
    )
  ) {
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
  if (cats.some((c) => c.includes("museum") || c.includes("culture"))) {
    return "🖼️";
  }
  if (cats.some((c) => c.includes("park"))) return "🌳";
  if (cats.some((c) => c.includes("natural") || c.includes("water"))) {
    return "🌿";
  }
  if (cats.some((c) => c.includes("viewpoint"))) return "✨";
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
    const neighbourhood = String(
      r.neighbourhood || ""
    ).toLowerCase();
    const district = String(
      r.district || ""
    ).toLowerCase();
    const formatted = String(
      r.formatted || ""
    ).toLowerCase();

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
      v.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    );

    let s = 0;

    if (
      hayNorm.some((v) =>
        v.includes("cordoba")
      )
    ) {
      s += 100;
    }

    if (hay.some((v) => v === wanted)) {
      s += 80;
    }

    if (
      hayNorm.some(
        (v) => v === wantedNorm
      )
    ) {
      s += 80;
    }

    if (
      suburb === wanted ||
      neighbourhood === wanted ||
      district === wanted
    ) {
      s += 60;
    }

    if (city === wanted) s += 50;
    if (name === wanted) s += 45;

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
    params.set("filter", `place:${placeId}`);
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

/*
 * MUY IMPORTANTE:
 *
 * Esta función evita que aparezcan:
 * - nombres de calles
 * - barrios
 * - ciudades
 * - direcciones
 * - resultados sin nombre comercial
 *
 * como si fueran lugares.
 */
function looksLikeOnlyAnAddress(feature) {
  const props =
    feature && feature.properties
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

  const categories = Array.isArray(
    props.categories
  )
    ? props.categories.map(String)
    : [];

  if (!name) {
    return true;
  }

  if (/^\d{1,6}$/.test(name)) {
    return true;
  }

  /*
   * Si el nombre coincide exactamente con una calle,
   * NO es un establecimiento.
   */
  if (
    street &&
    name.toLowerCase() ===
      street.toLowerCase()
  ) {
    return true;
  }

  /*
   * Si coincide exactamente con el barrio,
   * tampoco es un establecimiento.
   */
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

  /*
   * Nunca permitir que la ciudad aparezca
   * como si fuera un lugar.
   */
  if (
    city &&
    name.toLowerCase() ===
      city.toLowerCase()
  ) {
    return true;
  }

  /*
   * Si el nombre es exactamente la dirección,
   * descartarlo.
   */
  if (
    addressLine1 &&
    name.toLowerCase() ===
      addressLine1.toLowerCase()
  ) {
    return true;
  }

  /*
   * Si no tiene ninguna categoría semántica
   * de lugar, no lo usamos.
   */
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

  const name = String(
    props.name || ""
  ).trim();

  /*
   * Nunca usar address_line1 como nombre.
   * Si Geoapify no dio nombre comercial,
   * el resultado se descarta.
   */
  if (!name) {
    return null;
  }

  const hours =
    parseSimpleHours(
      props.opening_hours
    );

  const distMin = Math.max(
    1,
    Math.round(
      (distKm / 4.5) * 60
    )
  );

  return {
    name,
    emoji: emojiFor(categories),
    price: estimatePrice(categories),
    rating: 4.2,
    dist: distMin,
    mood: estimateMood(categories),
    outdoor: estimateOutdoor(categories),
    kidFriendly:
      estimateKidFriendly(categories),
    nightOnly:
      estimateNightOnly(categories),
    slots: estimateSlots(categories),

    /*
     * No mandamos una frase "Porque..."
     * inventada desde la API.
     */
    why: null,

    address: cleanAddress(props),
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
        placeId: location.placeId,
        categories,
      });

    const seen = new Set();

    const places = features
      /*
       * Primero: solamente lugares
       * de la categoría solicitada.
       */
      .filter((feature) =>
        featureMatchesIntent(
          feature,
          categories
        )
      )

      /*
       * Segundo: eliminar calles,
       * barrios, ciudades y direcciones.
       */
      .filter(
        (feature) =>
          !looksLikeOnlyAnAddress(
            feature
          )
      )

      /*
       * Tercero: convertir a nuestro
       * formato de lugar.
       */
      .map((feature) =>
        mapFeatureToVenue(
          feature,
          location
        )
      )

      .filter(Boolean)

      /*
       * No repetir lugares.
       */
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
