// api/lugares.js
//
// SALIME - búsqueda de lugares reales
//
// Esta versión NO usa Geoapify.
// Usa OpenStreetMap + Overpass API.
//
// Reglas:
// - No necesita API key.
// - Busca alrededor de coordenadas conocidas.
// - Si el usuario dice Güemes, se usan coordenadas de Güemes,
//   Córdoba, Argentina.
// - Si dice Nueva Córdoba, se usan coordenadas de Nueva Córdoba.
// - La categoría de búsqueda depende estrictamente del intent.
// - No devuelve barrios, calles o ciudades como lugares.
// - Solo devuelve lugares que tengan nombre.
// - Busca nodos, ways y relations de OpenStreetMap.
// - Para ways/relations usa el centro geométrico devuelto por Overpass.
//

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];


// ================================================================
// UBICACIONES CONOCIDAS
//
// No usamos geocodificación externa para estas ubicaciones.
//
// Esto evita que "Güemes" sea interpretado como una localidad
// de otra provincia.
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
// CATEGORÍAS
//
// IMPORTANTE:
// Cada intent tiene sus propias etiquetas OSM.
//
// No hacemos una búsqueda genérica para todos los intents.
// ================================================================

const INTENT_TAGS = {
  comer: [
    ["amenity", "restaurant"],
    ["amenity", "fast_food"],
    ["amenity", "food_court"],
  ],

  beber: [
    ["amenity", "cafe"],
    ["amenity", "bar"],
    ["amenity", "pub"],
  ],

  cultura: [
    ["tourism", "museum"],
    ["tourism", "gallery"],
    ["amenity", "theatre"],
    ["amenity", "arts_centre"],
    ["amenity", "cinema"],
  ],

  paseo: [
    ["leisure", "park"],
    ["tourism", "attraction"],
    ["tourism", "viewpoint"],
    ["leisure", "garden"],
  ],

  aire_libre: [
    ["leisure", "park"],
    ["leisure", "garden"],
    ["leisure", "nature_reserve"],
    ["natural", "wood"],
    ["natural", "water"],
  ],

  fiesta: [
    ["amenity", "nightclub"],
    ["amenity", "bar"],
    ["amenity", "pub"],
  ],

  familia: [
    ["leisure", "playground"],
    ["leisure", "park"],
    ["tourism", "museum"],
    ["leisure", "water_park"],
    ["leisure", "theme_park"],
    ["amenity", "arts_centre"],
    ["amenity", "restaurant"],
  ],

  general: [
    ["amenity", "restaurant"],
    ["amenity", "cafe"],
    ["tourism", "museum"],
    ["leisure", "park"],
  ],
};


// ================================================================
// PRECIO ESTIMADO
// ================================================================

function estimatePrice(tags) {
  const amenity = tags.amenity || "";
  const tourism = tags.tourism || "";
  const leisure = tags.leisure || "";

  if (
    amenity === "fast_food" ||
    amenity === "cafe"
  ) {
    return 1;
  }

  if (
    leisure === "park" ||
    leisure === "garden" ||
    leisure === "playground" ||
    leisure === "nature_reserve" ||
    leisure === "water_park" ||
    leisure === "theme_park"
  ) {
    return 1;
  }

  if (amenity === "nightclub") {
    return 3;
  }

  if (
    tourism === "museum" ||
    tourism === "gallery"
  ) {
    return 2;
  }

  if (
    amenity === "bar" ||
    amenity === "pub"
  ) {
    return 2;
  }

  if (amenity === "restaurant") {
    return 2;
  }

  return 2;
}


// ================================================================
// MOOD
// ================================================================

function estimateMood(tags) {
  const amenity = tags.amenity || "";

  if (
    amenity === "nightclub" ||
    amenity === "bar" ||
    amenity === "pub"
  ) {
    return ["animado"];
  }

  return ["tranquilo"];
}


// ================================================================
// OUTDOOR
// ================================================================

function estimateOutdoor(tags) {
  const leisure = tags.leisure || "";
  const natural = tags.natural || "";
  const tourism = tags.tourism || "";

  return (
    leisure === "park" ||
    leisure === "garden" ||
    leisure === "nature_reserve" ||
    natural === "wood" ||
    natural === "water" ||
    tourism === "viewpoint"
  );
}


// ================================================================
// KID FRIENDLY
// ================================================================

function estimateKidFriendly(tags) {
  const amenity = tags.amenity || "";
  const leisure = tags.leisure || "";

  if (
    amenity === "nightclub" ||
    amenity === "bar" ||
    amenity === "pub"
  ) {
    return false;
  }

  if (
    leisure === "playground" ||
    leisure === "park" ||
    leisure === "water_park" ||
    leisure === "theme_park"
  ) {
    return true;
  }

  return true;
}


// ================================================================
// SOLO NOCHE
// ================================================================

function estimateNightOnly(tags) {
  return tags.amenity === "nightclub";
}


// ================================================================
// HORARIOS GENERALES
// ================================================================

function estimateSlots(tags) {
  const amenity = tags.amenity || "";

  if (amenity === "nightclub") {
    return ["night"];
  }

  if (
    amenity === "bar" ||
    amenity === "pub"
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

function emojiFor(tags) {
  const amenity = tags.amenity || "";
  const tourism = tags.tourism || "";
  const leisure = tags.leisure || "";
  const natural = tags.natural || "";

  if (amenity === "fast_food") {
    return "🍔";
  }

  if (amenity === "restaurant") {
    return "🍽️";
  }

  if (amenity === "cafe") {
    return "☕";
  }

  if (
    amenity === "nightclub"
  ) {
    return "🎉";
  }

  if (
    amenity === "bar" ||
    amenity === "pub"
  ) {
    return "🍺";
  }

  if (
    tourism === "museum" ||
    tourism === "gallery" ||
    amenity === "arts_centre"
  ) {
    return "🖼️";
  }

  if (
    amenity === "theatre"
  ) {
    return "🎭";
  }

  if (
    leisure === "playground"
  ) {
    return "🎡";
  }

  if (
    leisure === "park" ||
    leisure === "garden"
  ) {
    return "🌳";
  }

  if (
    natural === "wood" ||
    natural === "water" ||
    leisure === "nature_reserve"
  ) {
    return "🌿";
  }

  if (
    tourism === "viewpoint"
  ) {
    return "✨";
  }

  if (
    leisure === "theme_park" ||
    leisure === "water_park"
  ) {
    return "🎢";
  }

  return "📍";
}


// ================================================================
// HORARIOS
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
// RESOLVER UBICACIÓN
// ================================================================

function resolveLocation(text) {
  const query =
    String(text || "").trim();

  if (!query) {
    return null;
  }

  const normalized =
    normalizeText(query);

  // Coincidencia exacta.
  if (
    KNOWN_LOCATIONS[normalized]
  ) {
    return KNOWN_LOCATIONS[
      normalized
    ];
  }

  // Buscar ubicaciones conocidas
  // dentro de una frase.
  const keys =
    Object.keys(
      KNOWN_LOCATIONS
    ).sort(
      (a, b) =>
        b.length - a.length
    );

  for (const key of keys) {
    if (
      normalized.includes(key)
    ) {
      return KNOWN_LOCATIONS[key];
    }
  }

  // Si no conocemos la ubicación,
  // intentamos extraer coordenadas si
  // el frontend las mandara en el futuro.
  return null;
}


// ================================================================
// QUERY OVERPASS
//
// Buscamos NODE + WAY + RELATION.
//
// "around" permite consultar objetos dentro
// de un radio determinado alrededor de lat/lon.
// ================================================================

function buildOverpassQuery(
  lat,
  lon,
  tags,
  radius
) {
  const parts =
    tags.map(
      ([key, value]) =>
        `
        nwr(
          around:${radius},${lat},${lon}
        )["${key}"="${value}"]["name"];
        `
    );

  return `
    [out:json][timeout:25];

    (
      ${parts.join("\n")}
    );

    out center tags;
  `;
}


// ================================================================
// PEDIR A OVERPASS
// ================================================================

async function fetchOverpass(
  query
) {
  let lastError = null;

  for (
    const endpoint of
    OVERPASS_ENDPOINTS
  ) {
    try {
      const response =
        await fetch(
          endpoint,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded",
            },

            body:
              `data=${encodeURIComponent(
                query
              )}`,
          }
        );

      if (!response.ok) {
        lastError =
          new Error(
            `overpass-http-${response.status}`
          );

        continue;
      }

      const data =
        await response.json();

      if (
        !data ||
        !Array.isArray(
          data.elements
        )
      ) {
        throw new Error(
          "overpass-invalid-response"
        );
      }

      return data.elements;
    } catch (error) {
      lastError = error;
    }
  }

  throw (
    lastError ||
    new Error(
      "overpass-request-failed"
    )
  );
}


// ================================================================
// COORDENADAS DEL ELEMENTO
//
// Nodes tienen lat/lon.
// Ways y relations vienen con "center"
// porque pedimos "out center".
// ================================================================

function getElementCoordinates(
  element
) {
  if (
    element &&
    typeof element.lat ===
      "number" &&
    typeof element.lon ===
      "number"
  ) {
    return {
      lat: element.lat,
      lon: element.lon,
    };
  }

  if (
    element &&
    element.center &&
    typeof element.center.lat ===
      "number" &&
    typeof element.center.lon ===
      "number"
  ) {
    return {
      lat: element.center.lat,
      lon: element.center.lon,
    };
  }

  return null;
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

function cleanAddress(tags) {
  const street =
    [
      tags["addr:street"],
      tags["addr:housenumber"],
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  const area =
    [
      tags["addr:suburb"],
      tags["addr:neighbourhood"],
      tags["addr:city"],
      tags["addr:state"],
    ]
      .filter(Boolean)
      .join(", ")
      .trim();

  if (
    street &&
    area
  ) {
    return `${street}, ${area}`;
  }

  if (street) {
    return street;
  }

  if (area) {
    return area;
  }

  return null;
}


// ================================================================
// ¿REALMENTE CORRESPONDE AL INTENT?
//
// Esta es una segunda barrera de seguridad.
// ================================================================

function matchesIntent(
  tags,
  allowedTags
) {
  return allowedTags.some(
    ([key, value]) =>
      tags[key] === value
  );
}


// ================================================================
// FILTRO EXTRA
//
// No queremos que aparezcan:
//
// - barrios
// - ciudades
// - calles
// - plazas cuando pedimos comer
// - cualquier cosa sin nombre
// ================================================================

function isValidPlace(
  element,
  tags,
  allowedTags
) {
  const name =
    String(
      tags.name || ""
    ).trim();

  if (!name) {
    return false;
  }

  if (
    !matchesIntent(
      tags,
      allowedTags
    )
  ) {
    return false;
  }

  // Si el objeto es un barrio,
  // ciudad o calle, nunca lo usamos.
  if (
    tags.place === "city" ||
    tags.place === "town" ||
    tags.place === "village" ||
    tags.place === "suburb" ||
    tags.place === "neighbourhood" ||
    tags.place === "quarter" ||
    tags.highway
  ) {
    return false;
  }

  // Un objeto sin ningún tipo
  // útil tampoco entra.
  const hasSupportedType =
    Boolean(
      tags.amenity ||
      tags.tourism ||
      tags.leisure ||
      tags.natural
    );

  if (!hasSupportedType) {
    return false;
  }

  return true;
}


// ================================================================
// MAPEAR ELEMENTO
// ================================================================

function mapElementToVenue(
  element,
  center
) {
  const tags =
    element.tags || {};

  const coords =
    getElementCoordinates(
      element
    );

  if (!coords) {
    return null;
  }

  const name =
    String(
      tags.name || ""
    ).trim();

  if (!name) {
    return null;
  }

  const distanceKm =
    haversineKm(
      center.lat,
      center.lon,
      coords.lat,
      coords.lon
    );

  const distMin =
    Math.max(
      1,
      Math.round(
        (distanceKm / 4.5) *
          60
      )
    );

  const hours =
    parseSimpleHours(
      tags.opening_hours
    );

  return {
    name,

    emoji:
      emojiFor(tags),

    price:
      estimatePrice(tags),

    rating: null,

    dist: distMin,

    mood:
      estimateMood(tags),

    outdoor:
      estimateOutdoor(tags),

    kidFriendly:
      estimateKidFriendly(
        tags
      ),

    nightOnly:
      estimateNightOnly(
        tags
      ),

    slots:
      estimateSlots(tags),

    why: null,

    address:
      cleanAddress(tags),

    hours,

    categories: [
      tags.amenity,
      tags.tourism,
      tags.leisure,
      tags.natural,
    ].filter(Boolean),

    source:
      "openstreetmap",
  };
}


// ================================================================
// ORDENAR RESULTADOS
//
// Primero los más cercanos.
// ================================================================

function sortPlaces(
  places
) {
  return [...places].sort(
    (a, b) =>
      (a.dist || 999999) -
      (b.dist || 999999)
  );
}


// ================================================================
// HANDLER
// ================================================================

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
    res.status(400).json({
      error:
        "missing-city",
    });

    return;
  }

  const normalizedIntent =
    normalizeText(intent);

  const allowedTags =
    INTENT_TAGS[
      normalizedIntent
    ] ||
    INTENT_TAGS.general;

  // --------------------------------------------------------------
  // Resolver ubicación.
  // --------------------------------------------------------------

  const location =
    resolveLocation(
      city.trim()
    );

  // --------------------------------------------------------------
  // Si no conocemos la ubicación,
  // NO inventamos coordenadas.
  //
  // Esto es preferible a mandar "Güemes"
  // a un geocodificador que podría encontrar
  // otra localidad.
  // --------------------------------------------------------------

  if (!location) {
    res.status(200).json({
      city,
      resolvedCity: null,
      places: [],
    });

    return;
  }

  try {
    // ------------------------------------------------------------
    // 15 km de radio.
    //
    // Overpass permite consultar objetos alrededor
    // de coordenadas absolutas mediante "around".
    // ------------------------------------------------------------

    const query =
      buildOverpassQuery(
        location.lat,
        location.lon,
        allowedTags,
        15000
      );

    const elements =
      await fetchOverpass(
        query
      );

    // ------------------------------------------------------------
    // Filtrar y mapear.
    // ------------------------------------------------------------

    const seen =
      new Set();

    const places =
      elements

        .filter(
          (element) =>
            isValidPlace(
              element,
              element.tags || {},
              allowedTags
            )
        )

        .map(
          (element) =>
            mapElementToVenue(
              element,
              location
            )
        )

        .filter(Boolean)

        .filter((place) => {
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
        });

    // ------------------------------------------------------------
    // Ordenamos por cercanía.
    // ------------------------------------------------------------

    const sortedPlaces =
      sortPlaces(
        places
      );

    // ------------------------------------------------------------
    // Respuesta compatible con el frontend.
    // ------------------------------------------------------------

    res.status(200).json({
      city,

      resolvedCity:
        location.label,

      places:
        sortedPlaces,
    });
  } catch (error) {
    console.error(
      "Overpass error:",
      error
    );

    res.status(502).json({
      error:
        "overpass-request-failed",
    });
  }
     }
