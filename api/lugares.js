/* ------------------------------------------------------------------ */
/* api/lugares.js                                                     */
/*                                                                    */
/* Busca lugares reales con OpenStreetMap + Overpass.                 */
/*                                                                    */
/* - No usa Geoapify.                                                 */
/* - No necesita GEOAPIFY_API_KEY.                                    */
/* - Mantiene el formato que espera SALIME.                            */
/* - Nunca inventa lugares.                                           */
/* - Si no encuentra lugares adecuados devuelve places: [].           */
/* ------------------------------------------------------------------ */

const NOMINATIM_URL =
  "https://nominatim.openstreetmap.org/search";

const OVERPASS_URL =
  "https://overpass-api.de/api/interpreter";

/* ------------------------------------------------------------------ */
/* CATEGORÍAS                                                         */
/* ------------------------------------------------------------------ */

const INTENT_CATEGORIES = {
  comer: [
    "restaurant",
    "fast_food",
    "cafe",
    "food_court",
  ],

  beber: [
    "bar",
    "pub",
    "cafe",
  ],

  cultura: [
    "museum",
    "arts_centre",
    "theatre",
    "gallery",
  ],

  paseo: [
    "park",
  ],

  aire_libre: [
    "park",
    "nature_reserve",
  ],

  fiesta: [
    "nightclub",
    "bar",
    "pub",
  ],

  familia: [
    "restaurant",
    "fast_food",
    "cafe",
    "museum",
    "arts_centre",
    "playground",
  ],

  general: [
    "restaurant",
    "fast_food",
    "cafe",
    "bar",
    "pub",
  ],

  /* Compatibilidad con el frontend anterior */

  CENA: [
    "restaurant",
    "fast_food",
    "cafe",
    "food_court",
  ],

  BEBIDA: [
    "bar",
    "pub",
    "cafe",
  ],

  FINAL: [
    "restaurant",
    "fast_food",
    "cafe",
    "food_court",
  ],

  CULTURA: [
    "museum",
    "arts_centre",
    "theatre",
    "gallery",
  ],

  PASEO: [
    "park",
  ],

  AIRE_LIBRE: [
    "park",
    "nature_reserve",
  ],

  FIESTA: [
    "nightclub",
    "bar",
    "pub",
  ],

  ACTIVIDAD_FAMILIA: [
    "playground",
    "museum",
    "arts_centre",
  ],

  MERIENDA_FAMILIA: [
    "cafe",
  ],

  CIERRE_FAMILIA: [
    "restaurant",
    "fast_food",
    "cafe",
  ],
};

/* ------------------------------------------------------------------ */
/* BARRIOS CONOCIDOS DE CÓRDOBA                                      */
/* ------------------------------------------------------------------ */

const KNOWN_LOCATIONS = {
  guemes: {
    lat: -31.42536,
    lon: -64.19419,
    label: "Güemes, Córdoba, Argentina",
  },

  "nueva cordoba": {
    lat: -31.42547,
    lon: -64.18651,
    label: "Nueva Córdoba, Córdoba, Argentina",
  },

  "alta cordoba": {
    lat: -31.39854,
    lon: -64.1807,
    label: "Alta Córdoba, Córdoba, Argentina",
  },

  "general paz": {
    lat: -31.40955,
    lon: -64.1715,
    label: "General Paz, Córdoba, Argentina",
  },

  centro: {
    lat: -31.41667,
    lon: -64.18333,
    label: "Centro, Córdoba, Argentina",
  },
};

/* ------------------------------------------------------------------ */
/* UTILIDADES                                                         */
/* ------------------------------------------------------------------ */

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function haversineKm(lat1, lon1, lat2, lon2) {
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

function parseSimpleHours(raw) {
  if (!raw || typeof raw !== "string") {
    return null;
  }

  const match = raw.match(
    /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/
  );

  if (!match) {
    return null;
  }

  return [match[1], match[2]];
}

function emojiFor(amenity) {
  if (amenity === "fast_food") return "🍔";
  if (amenity === "cafe") return "☕";
  if (amenity === "bar") return "🍺";
  if (amenity === "pub") return "🍺";
  if (amenity === "nightclub") return "🎉";
  if (amenity === "museum") return "🖼️";
  if (amenity === "arts_centre") return "🎨";
  if (amenity === "theatre") return "🎭";
  if (amenity === "gallery") return "🖼️";
  if (amenity === "park") return "🌳";
  if (amenity === "playground") return "🎡";

  return "🍽️";
}

/* ------------------------------------------------------------------ */
/* RESOLVER UBICACIÓN                                                 */
/* ------------------------------------------------------------------ */

async function geocodeLocation(text) {
  const query = String(text || "").trim();

  if (!query) {
    return null;
  }

  const normalized =
    normalizeText(query)
      .replace(
        /\b(barrio|zona|sector)\b/g,
        ""
      )
      .trim();

  /*
   * Primero buscamos barrios conocidos.
   * Esto evita que Güemes sea interpretado
   * como otra localidad.
   */

  if (KNOWN_LOCATIONS[normalized]) {
    return {
      ...KNOWN_LOCATIONS[normalized],
      placeId: null,
    };
  }

  /*
   * Para otros lugares usamos Nominatim.
   */

  const url =
    NOMINATIM_URL +
    "?format=jsonv2" +
    "&limit=5" +
    "&countrycodes=ar" +
    "&q=" +
    encodeURIComponent(
      `${query}, Córdoba, Argentina`
    );

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "SALIME/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `nominatim-${response.status}`
    );
  }

  const results =
    await response.json();

  if (
    !Array.isArray(results) ||
    results.length === 0
  ) {
    return null;
  }

  const wanted =
    normalizeText(query);

  const scored =
    results.map((item) => {
      const name =
        normalizeText(item.name);

      const display =
        normalizeText(
          item.display_name
        );

      const type =
        normalizeText(item.type);

      let score = 0;

      if (name === wanted) {
        score += 100;
      }

      if (
        display.includes(wanted)
      ) {
        score += 40;
      }

      if (
        display.includes("cordoba")
      ) {
        score += 50;
      }

      if (
        [
          "suburb",
          "neighbourhood",
          "quarter",
          "district",
          "city",
        ].includes(type)
      ) {
        score += 20;
      }

      return {
        item,
        score,
      };
    });

  scored.sort(
    (a, b) =>
      b.score - a.score
  );

  const best =
    scored[0]?.item;

  if (!best) {
    return null;
  }

  const lat =
    Number(best.lat);

  const lon =
    Number(best.lon);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return null;
  }

  return {
    lat,
    lon,
    label:
      best.display_name ||
      query,
  };
}

/* ------------------------------------------------------------------ */
/* BUSCAR LUGARES EN OPENSTREETMAP                                   */
/* ------------------------------------------------------------------ */

function buildAmenityRegex(amenities) {
  return amenities
    .map((value) =>
      value.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )
    )
    .join("|");
}

async function searchPlaces({
  lat,
  lon,
  amenities,
  radius = 1800,
}) {
  const regex =
    buildAmenityRegex(
      amenities
    );

  const query = `
[out:json][timeout:25];

(
  nwr[
    "amenity"~"^(${regex})$"
  ](
    around:${radius},
    ${lat},
    ${lon}
  );
);

out center tags;
`;

  const response = await fetch(
    OVERPASS_URL,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
        "User-Agent":
          "SALIME/1.0",
      },

      body:
        "data=" +
        encodeURIComponent(query),
    }
  );

  if (!response.ok) {
    throw new Error(
      `overpass-${response.status}`
    );
  }

  const data =
    await response.json();

  if (
    !data ||
    !Array.isArray(data.elements)
  ) {
    return [];
  }

  return data.elements;
}

/* ------------------------------------------------------------------ */
/* COORDENADAS                                                        */
/* ------------------------------------------------------------------ */

function getCoordinates(element) {
  if (
    Number.isFinite(element.lat) &&
    Number.isFinite(element.lon)
  ) {
    return [
      element.lat,
      element.lon,
    ];
  }

  if (
    element.center &&
    Number.isFinite(
      element.center.lat
    ) &&
    Number.isFinite(
      element.center.lon
    )
  ) {
    return [
      element.center.lat,
      element.center.lon,
    ];
  }

  return [null, null];
}

/* ------------------------------------------------------------------ */
/* CONVERTIR RESULTADO                                                */
/* ------------------------------------------------------------------ */

function mapElementToVenue(
  element,
  center,
  intent
) {
  const tags =
    element?.tags || {};

  const name = String(
    tags.name ||
      tags["name:es"] ||
      ""
  ).trim();

  /*
   * Si no tiene nombre, no lo mostramos.
   */

  if (!name) {
    return null;
  }

  const amenity =
    normalizeText(
      tags.amenity
    );

  /*
   * REGLA FUNDAMENTAL:
   *
   * Si la intención es COMER,
   * solamente aceptamos lugares
   * gastronómicos.
   */

  if (
    intent === "comer" &&
    ![
      "restaurant",
      "fast_food",
      "cafe",
      "food_court",
    ].includes(amenity)
  ) {
    return null;
  }

  const [
    lat,
    lon,
  ] = getCoordinates(element);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return null;
  }

  const distanceKm =
    haversineKm(
      center.lat,
      center.lon,
      lat,
      lon
    );

  const distanceMinutes =
    Math.max(
      1,
      Math.round(
        (distanceKm / 4.5) * 60
      )
    );

  const address =
    [
      tags["addr:street"],
      tags["addr:housenumber"],
    ]
      .filter(Boolean)
      .join(" ") ||
      null;

  const hours =
    parseSimpleHours(
      tags.opening_hours
    );

  const isNight =
    amenity === "nightclub";

  const isBar =
    amenity === "bar" ||
    amenity === "pub";

  return {
    name,

    emoji:
      emojiFor(amenity),

    price:
      amenity === "fast_food" ||
      amenity === "cafe"
        ? 1
        : 2,

    /*
     * NO inventamos una valoración.
     */
    rating: null,

    dist:
      distanceMinutes,

    mood:
      isNight || isBar
        ? ["animado"]
        : ["tranquilo"],

    outdoor: false,

    kidFriendly:
      !isNight &&
      !isBar,

    nightOnly:
      isNight,

    slots:
      isNight
        ? ["night"]
        : isBar
        ? ["afternoon", "night"]
        : [
            "morning",
            "afternoon",
            "night",
          ],

    why: null,

    address,

    hours,

    categories: [
      `amenity.${amenity}`,
    ],

    source:
      "openstreetmap",
  };
}

/* ------------------------------------------------------------------ */
/* HANDLER                                                            */
/* ------------------------------------------------------------------ */

export default async function handler(
  req,
  res
) {
  if (
    req.method !== "POST"
  ) {
    return res
      .status(405)
      .json({
        error:
          "method-not-allowed",
      });
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
    return res
      .status(400)
      .json({
        error:
          "missing-city",
      });
  }

  const normalizedIntent =
    normalizeText(intent);

  const aliases = {
    cena: "comer",
    bebida: "beber",
    final: "comer",

    actividad_familia:
      "familia",

    merienda_familia:
      "familia",

    cierre_familia:
      "comer",
  };

  const canonicalIntent =
    aliases[
      normalizedIntent
    ] ||
    normalizedIntent;

  const amenities =
    INTENT_CATEGORIES[
      canonicalIntent
    ] ||
    INTENT_CATEGORIES.general;

  try {
    /*
     * 1. Resolver la zona.
     */

    const location =
      await geocodeLocation(
        city.trim()
      );

    if (!location) {
      return res
        .status(200)
        .json({
          city,
          resolvedCity: null,
          places: [],
          source:
            "openstreetmap",
        });
    }

    /*
     * 2. Buscar lugares reales.
     */

    const elements =
      await searchPlaces({
        lat: location.lat,
        lon: location.lon,
        amenities,
      });

    /*
     * 3. Convertir resultados.
     */

    const seen =
      new Set();

    const places =
      elements
        .map((element) =>
          mapElementToVenue(
            element,
            location,
            canonicalIntent
          )
        )
        .filter(Boolean)
        .sort(
          (a, b) =>
            a.dist - b.dist
        )
        .filter((place) => {
          const key =
            normalizeText(
              place.name
            ) +
            "|" +
            normalizeText(
              place.address
            );

          if (
            seen.has(key)
          ) {
            return false;
          }

          seen.add(key);

          return true;
        })
        .slice(0, 20);

    /*
     * IMPORTANTE:
     *
     * Si no encontramos lugares,
     * devolvemos [].
     *
     * No usamos lugares viejos,
     * no inventamos lugares,
     * no ponemos plazas para rellenar.
     */

    return res
      .status(200)
      .json({
        city,

        resolvedCity:
          location.label,

        places,

        source:
          "openstreetmap",

        attribution:
          "© OpenStreetMap contributors",
      });
  } catch (error) {
    console.error(
      "Error buscando lugares:",
      error
    );

    return res
      .status(502)
      .json({
        error:
          "places-request-failed",

        places: [],

        source:
          "openstreetmap",
      });
  }
      }
