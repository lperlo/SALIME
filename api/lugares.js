/* ------------------------------------------------------------------ */
/* api/lugares.js                                                     */
/*                                                                    */
/* Busca lugares reales con OpenStreetMap + Overpass.                 */
/*                                                                    */
/* - No usa Geoapify.                                                  */
/* - No necesita GEOAPIFY_API_KEY.                                    */
/* - No inventa lugares.                                               */
/* - Si no encuentra lugares adecuados devuelve places: [].            */
/* - Mantiene el formato de respuesta que espera SALIME.              */
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

  /* Compatibilidad con versiones anteriores del frontend */

  CENA: [
    "restaurant",
    "fast_food",
    "cafe",
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
/* NORMALIZACIÓN                                                      */
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
/* BARRIOS CONOCIDOS DE CÓRDOBA                                      */
/*                                                                    */
/* Esto evita que "Güemes" sea confundido con una ciudad de otro país */
/* o con otra localidad.                                              */
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
/* DISTANCIA                                                         */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* UBICACIÓN                                                          */
/* ------------------------------------------------------------------ */

async function geocodeLocation(text) {
  const original = String(text || "").trim();

  if (!original) {
    return null;
  }

  const normalized =
    normalizeText(original)
      .replace(
        /\b(barrio|zona|sector)\b/g,
        ""
      )
      .trim();

  /*
   * Primero usamos los barrios conocidos.
   * Esto es especialmente importante para Güemes.
   */

  if (KNOWN_LOCATIONS[normalized]) {
    return {
      ...KNOWN_LOCATIONS[normalized],
    };
  }

  /*
   * Si no es un barrio conocido,
   * consultamos Nominatim.
   */

  const query =
    `${original}, Córdoba, Argentina`;

  const url =
    NOMINATIM_URL +
    "?format=jsonv2" +
    "&limit=5" +
    "&countrycodes=ar" +
    "&q=" +
    encodeURIComponent(query);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "SALIME-place-search/1.0",
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
    normalizeText(original);

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
      original,
  };
}

/* ------------------------------------------------------------------ */
/* OVERPASS                                                          */
/* ------------------------------------------------------------------ */

function buildAmenityRegex(
  amenities
) {
  return amenities
    .map((value) =>
      String(value).replace(
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
    buildAmenityRegex(amenities);

  /*
   * Buscamos nodos, caminos y relaciones
   * que tengan amenity compatible.
   */

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
          "SALIME-place-search/1.0",
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
/* HORARIOS                                                           */
/* ------------------------------------------------------------------ */

function parseSimpleHours(raw) {
  if (
    !raw ||
    typeof raw !== "string"
  ) {
    return null;
  }

  const match =
    raw.match(
      /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/
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
/* EMOJI                                                              */
/* ------------------------------------------------------------------ */

function emojiFor(amenity) {
  if (
    amenity === "fast_food"
  ) {
    return "🍔";
  }

  if (
    amenity === "cafe"
  ) {
    return "☕";
  }

  if (
    amenity === "bar" ||
    amenity === "pub"
  ) {
    return "🍺";
  }

  if (
    amenity === "nightclub"
  ) {
    return "🎉";
  }

  if (
    amenity === "museum" ||
    amenity === "arts_centre" ||
    amenity === "theatre" ||
    amenity === "gallery"
  ) {
    return "🖼️";
  }

  if (
    amenity === "park"
  ) {
    return "🌳";
  }

  return "🍽️";
}

/* ------------------------------------------------------------------ */
/* MAPEO DE LUGAR                                                     */
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
   * Sin nombre real no mostramos el lugar.
   */

  if (!name) {
    return null;
  }

  const amenity =
    normalizeText(
      tags.amenity
    );

  /*
   * SEGURIDAD EXTRA:
   *
   * Para "comer" solamente aceptamos
   * lugares gastronómicos.
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
      .join(" ") || null;

  const hours =
    parseSimpleHours(
      tags.opening_hours
    );

  const kidFriendly =
    ![
      "bar",
      "pub",
      "nightclub",
    ].includes(amenity);

  const nightOnly =
    amenity ===
    "nightclub";

  let slots = [
    "morning",
    "afternoon",
    "night",
  ];

  if (
    amenity === "bar" ||
    amenity === "pub"
  ) {
    slots = [
      "afternoon",
      "night",
    ];
  }

  if (nightOnly) {
    slots = ["night"];
  }

  return {
    name,

    emoji:
      emojiFor(amenity),

    price:
      amenity ===
        "fast_food" ||
      amenity === "cafe"
        ? 1
        : 2,

    /*
     * OpenStreetMap no nos da necesariamente
     * una valoración.
     *
     * Por eso NO inventamos una valoración.
     */
    rating: null,

    dist:
      distanceMinutes,

    mood:
      amenity === "bar" ||
      amenity === "pub" ||
      amenity === "nightclub"
        ? ["animado"]
        : ["tranquilo"],

    outdoor: false,

    kidFriendly,

    nightOnly,

    slots,

    why: null,

    address,

    hours,

    categories: [
      `amenity.${amenity}`,
    ],

    source:
      "openstreetmap",

    sourceUrl:
      `https://www.openstreetmap.org/` +
      `${element.type}/${element.id}`,
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

    "actividad familia":
      "familia",

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

  const categories =
    INTENT_CATEGORIES[
      canonicalIntent
    ] ||
    INTENT_CATEGORIES.general;

  try {
    /*
     * 1. Resolver la ubicación.
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
        amenities: categories,
      });

    /*
     * 3. Convertir y filtrar.
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
     * MUY IMPORTANTE:
     *
     * Si no hay lugares reales,
     * devolvemos [].
     *
     * No usamos ningún pool,
     * no inventamos lugares
     * y no reciclamos resultados.
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

        source:
          "openstreetmap",

        places: [],
      });
  }
}
