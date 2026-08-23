/* ------------------------------------------------------------------ */
/* api/lugares.js                                                     */
/*                                                                    */
/* SALIME - búsqueda de lugares reales                                */
/*                                                                    */
/* Fuente: OpenStreetMap / Overpass                                   */
/*                                                                    */
/* IMPORTANTE:                                                        */
/* - No usa Geoapify.                                                 */
/* - No usa lugares hardcodeados.                                     */
/* - No inventa nombres de lugares.                                   */
/* - No devuelve plazas cuando la intención es COMER.                 */
/* - Si no encuentra lugares reales, devuelve places: [].             */
/* ------------------------------------------------------------------ */

const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const NOMINATIM_URL =
  "https://nominatim.openstreetmap.org/search";

/* ------------------------------------------------------------------ */
/* INTENCIONES                                                        */
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
    "restaurant",
    "fast_food",
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
    lon: -64.18070,
    label: "Alta Córdoba, Córdoba, Argentina",
  },

  "general paz": {
    lat: -31.40955,
    lon: -64.17150,
    label: "General Paz, Córdoba, Argentina",
  },

  centro: {
    lat: -31.41667,
    lon: -64.18333,
    label: "Centro, Córdoba, Argentina",
  },
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
/* DISTANCIA                                                          */
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
/* EMOJIS                                                             */
/* ------------------------------------------------------------------ */

function emojiFor(amenity) {
  if (amenity === "restaurant") return "🍽️";
  if (amenity === "fast_food") return "🍔";
  if (amenity === "cafe") return "☕";
  if (amenity === "food_court") return "🍴";
  if (amenity === "bar") return "🍺";
  if (amenity === "pub") return "🍺";
  if (amenity === "nightclub") return "🎉";
  if (amenity === "museum") return "🖼️";
  if (amenity === "arts_centre") return "🎨";
  if (amenity === "theatre") return "🎭";
  if (amenity === "gallery") return "🖼️";
  if (amenity === "park") return "🌳";
  if (amenity === "playground") return "🎡";

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
/* PRECIO                                                             */
/* ------------------------------------------------------------------ */

function estimatePrice(amenity) {
  if (
    amenity === "fast_food" ||
    amenity === "cafe"
  ) {
    return 1;
  }

  if (
    amenity === "bar" ||
    amenity === "pub"
  ) {
    return 2;
  }

  return 2;
}

/* ------------------------------------------------------------------ */
/* RESOLVER DE UBICACIÓN                                              */
/* ------------------------------------------------------------------ */

async function geocodeLocation(text) {
  const query =
    String(text || "").trim();

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
   * Primero resolvemos barrios conocidos
   * directamente en Córdoba.
   *
   * Esto evita que "Güemes" sea tratado
   * como una ciudad diferente.
   */

  if (KNOWN_LOCATIONS[normalized]) {
    return {
      ...KNOWN_LOCATIONS[normalized],
    };
  }

  /*
   * Para lugares que no conocemos,
   * usamos Nominatim.
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

  const response =
    await fetch(url, {
      headers: {
        Accept:
          "application/json",
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
          "town",
          "village",
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
/* CONSULTA OVERPASS                                                  */
/* ------------------------------------------------------------------ */

function buildAmenityRegex(
  amenities
) {
  return amenities
    .map((value) =>
      value.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )
    )
    .join("|");
}

async function queryOverpass(
  endpoint,
  query
) {
  const response =
    await fetch(
      endpoint,
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
          encodeURIComponent(
            query
          ),
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
    !Array.isArray(
      data.elements
    )
  ) {
    return [];
  }

  return data.elements;
}

/* ------------------------------------------------------------------ */
/* BUSCAR LUGARES                                                     */
/* ------------------------------------------------------------------ */

async function searchPlaces({
  lat,
  lon,
  amenities,
}) {
  const regex =
    buildAmenityRegex(
      amenities
    );

  /*
   * 3 km permite encontrar suficientes
   * negocios incluso si el centroide
   * del barrio no cae exactamente en
   * la zona comercial.
   */

  const query = `
[out:json][timeout:30];

(
  nwr[
    "amenity"~"^(${regex})$"
  ](
    around:3000,
    ${lat},
    ${lon}
  );
);

out center tags;
`;

  /*
   * Probamos varios servidores.
   *
   * Si uno está caído o saturado,
   * usamos el siguiente.
   */

  for (
    const endpoint of OVERPASS_SERVERS
  ) {
    try {
      const results =
        await queryOverpass(
          endpoint,
          query
        );

      if (
        Array.isArray(results) &&
        results.length > 0
      ) {
        return results;
      }
    } catch (error) {
      console.error(
        "Overpass falló:",
        endpoint,
        error?.message
      );
    }
  }

  return [];
}

/* ------------------------------------------------------------------ */
/* COORDENADAS                                                         */
/* ------------------------------------------------------------------ */

function getCoordinates(
  element
) {
  if (
    Number.isFinite(
      element.lat
    ) &&
    Number.isFinite(
      element.lon
    )
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

  return [
    null,
    null,
  ];
}

/* ------------------------------------------------------------------ */
/* FILTROS DE LUGAR                                                   */
/* ------------------------------------------------------------------ */

function isClosedOrDisused(
  tags
) {
  const amenity =
    normalizeText(
      tags.amenity
    );

  const lifecycleValues = [
    normalizeText(
      tags.disused
    ),
    normalizeText(
      tags.abandoned
    ),
    normalizeText(
      tags.demolished
    ),
    normalizeText(
      tags["disused:amenity"]
    ),
    normalizeText(
      tags["abandoned:amenity"]
    ),
  ];

  if (
    lifecycleValues.some(
      (value) =>
        value &&
        (
          value === "yes" ||
          value === "true" ||
          value === "restaurant" ||
          value === "cafe" ||
          value === "fast_food" ||
          value === "bar"
        )
    )
  ) {
    return true;
  }

  if (
    amenity === "restaurant" &&
    normalizeText(
      tags["restaurant:type"]
    ) === "closed"
  ) {
    return true;
  }

  return false;
}

function hasRealName(tags) {
  const name =
    String(
      tags.name ||
      tags["name:es"] ||
      ""
    ).trim();

  if (!name) {
    return false;
  }

  if (
    /^\d{1,6}$/.test(name)
  ) {
    return false;
  }

  return true;
}

function matchesIntent(
  tags,
  allowedAmenities
) {
  const amenity =
    normalizeText(
      tags.amenity
    );

  return allowedAmenities.includes(
    amenity
  );
}

/* ------------------------------------------------------------------ */
/* CONVERTIR A FORMATO SALIME                                         */
/* ------------------------------------------------------------------ */

function mapElementToVenue(
  element,
  center,
  intent,
  allowedAmenities
) {
  const tags =
    element?.tags || {};

  /*
   * Sin nombre real no mostramos nada.
   */

  if (!hasRealName(tags)) {
    return null;
  }

  /*
   * Excluir negocios marcados
   * como cerrados/abandonados.
   */

  if (
    isClosedOrDisused(tags)
  ) {
    return null;
  }

  /*
   * Excluir cualquier categoría
   * que no corresponda a la intención.
   */

  if (
    !matchesIntent(
      tags,
      allowedAmenities
    )
  ) {
    return null;
  }

  const [
    lat,
    lon,
  ] =
    getCoordinates(element);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return null;
  }

  const amenity =
    normalizeText(
      tags.amenity
    );

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
        (distanceKm / 4.5) *
          60
      )
    );

  const name =
    String(
      tags.name ||
      tags["name:es"]
    ).trim();

  const street =
    [
      tags["addr:street"],
      tags["addr:housenumber"],
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  const neighborhood =
    tags["addr:suburb"] ||
    tags["addr:neighbourhood"] ||
    null;

  const city =
    tags["addr:city"] ||
    "Córdoba";

  const address =
    street
      ? [
          street,
          neighborhood,
          city,
        ]
          .filter(Boolean)
          .join(", ")
      : null;

  const hours =
    parseSimpleHours(
      tags.opening_hours
    );

  const isNight =
    amenity ===
    "nightclub";

  const isBar =
    amenity === "bar" ||
    amenity === "pub";

  /*
   * OSM no proporciona normalmente
   * una valoración tipo Google.
   *
   * Por eso NO inventamos una.
   *
   * Se usa 0 para mantener compatibilidad
   * con el frontend actual, que espera
   * un número.
   */

  let rating = 0;

  if (
    tags.stars &&
    Number.isFinite(
      Number(tags.stars)
    )
  ) {
    rating =
      Number(tags.stars);
  }

  return {
    name,

    emoji:
      emojiFor(amenity),

    price:
      estimatePriceForAmenity(
        amenity
      ),

    rating,

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
        ? [
            "afternoon",
            "night",
          ]
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

    website:
      tags.website ||
      tags["contact:website"] ||
      null,

    phone:
      tags.phone ||
      tags["contact:phone"] ||
      null,
  };
}

/* ------------------------------------------------------------------ */
/* PRECIO POR CATEGORÍA                                               */
/* ------------------------------------------------------------------ */

function estimatePriceForAmenity(
  amenity
) {
  if (
    amenity === "fast_food" ||
    amenity === "cafe"
  ) {
    return 1;
  }

  if (
    amenity === "bar" ||
    amenity === "pub"
  ) {
    return 2;
  }

  if (
    amenity === "nightclub"
  ) {
    return 3;
  }

  return 2;
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
  } =
    req.body || {};

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

  /*
   * El frontend manda claves como:
   * CENA, BEBIDA, FINAL, etc.
   */

  const rawIntent =
    String(
      intent || ""
    ).trim();

  const normalizedIntent =
    normalizeText(
      rawIntent
    );

  const aliases = {
    cena: "comer",
    bebida: "beber",
    final: "comer",

    cultura: "cultura",
    paseo: "paseo",
    aire_libre:
      "aire_libre",
    fiesta: "fiesta",

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
      rawIntent
    ] ||
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
     * 2. Buscar lugares.
     */

    const elements =
      await searchPlaces({
        lat: location.lat,
        lon: location.lon,
        amenities,
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
            canonicalIntent,
            amenities
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
     * No rellenamos con datos inventados.
     *
     * Si OpenStreetMap no encuentra
     * un lugar adecuado, places queda [].
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
      "SALIME /api/lugares:",
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
