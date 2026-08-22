// api/lugares.js
//
// SALIME - búsqueda de lugares reales
//
// Esta versión NO usa Geoapify.
//
// Usa:
// - Nominatim (OpenStreetMap) para convertir la ubicación del usuario
//   en coordenadas.
// - Overpass (OpenStreetMap) para buscar establecimientos reales
//   alrededor de esas coordenadas.
//
// REGLAS:
// - No inventa lugares.
// - No usa calles, barrios ni ciudades como lugares.
// - No usa address_line como nombre.
// - Solo devuelve lugares con nombre + coordenadas.
// - Filtra por categoría según el intent.
// - Funciona con distintas ciudades/provincias.
// - No requiere API key de Geoapify.
// - No requiere tarjeta.
//
// IMPORTANTE:
// El frontend continúa recibiendo:
//
// {
//   city,
//   resolvedCity,
//   places: []
// }
//
// ------------------------------------------------------------------


const NOMINATIM_URL =
  "https://nominatim.openstreetmap.org/search";

const OVERPASS_URL =
  "https://overpass-api.de/api/interpreter";


// ------------------------------------------------------------------
// CATEGORÍAS
// ------------------------------------------------------------------
//
// Cada intent tiene una lista explícita de etiquetas OSM permitidas.
// Esto evita que una calle, barrio o cualquier objeto extraño termine
// apareciendo como si fuera un establecimiento.
// ------------------------------------------------------------------

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
    ["amenity", "theatre"],
    ["amenity", "arts_centre"],
    ["tourism", "gallery"],
  ],

  paseo: [
    ["leisure", "park"],
    ["tourism", "viewpoint"],
    ["tourism", "attraction"],
  ],

  aire_libre: [
    ["leisure", "park"],
    ["natural", "wood"],
    ["natural", "water"],
    ["tourism", "viewpoint"],
  ],

  fiesta: [
    ["amenity", "nightclub"],
    ["amenity", "bar"],
    ["amenity", "pub"],
  ],

  familia: [
    ["leisure", "playground"],
    ["tourism", "museum"],
    ["leisure", "theme_park"],
    ["leisure", "water_park"],
    ["amenity", "restaurant"],
  ],

  general: [
    ["amenity", "restaurant"],
    ["amenity", "cafe"],
    ["amenity", "bar"],
    ["tourism", "museum"],
    ["leisure", "park"],
  ],
};


// ------------------------------------------------------------------
// UTILIDADES
// ------------------------------------------------------------------

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}


function capitalizeWords(value) {
  return String(value || "")
    .toLowerCase()
    .replace(
      /(^|[\s-])(\p{L})/gu,
      (_match, separator, letter) =>
        separator + letter.toUpperCase()
    );
}


function escapeOverpass(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}


// ------------------------------------------------------------------
// DISTANCIA
// ------------------------------------------------------------------

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


// ------------------------------------------------------------------
// GEOCODIFICACIÓN
// ------------------------------------------------------------------
//
// Convierte "Nueva Córdoba", "Palermo", "Rosario", etc. en
// coordenadas.
//
// No usamos el resultado como "lugar". Solamente como centro de
// búsqueda.
// ------------------------------------------------------------------

async function geocodeLocation(text) {

  const query = String(text || "").trim();

  if (!query) {
    return null;
  }

  const params = new URLSearchParams({
    q: `${query}, Argentina`,
    format: "json",
    addressdetails: "1",
    limit: "10",
    countrycodes: "ar",
    "accept-language": "es",
  });

  const url =
    `${NOMINATIM_URL}?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "SALIME/1.0 (application for academic presentation)",
      "Accept":
        "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `nominatim-error-${response.status}`
    );
  }

  const results = await response.json();

  if (
    !Array.isArray(results) ||
    results.length === 0
  ) {
    return null;
  }

  const wanted =
    normalizeText(query);

  // ---------------------------------------------------------------
  // Puntuar resultados.
  //
  // Preferimos:
  // 1. coincidencia exacta del nombre;
  // 2. barrio/suburb/neighbourhood;
  // 3. localidad/ciudad;
  // 4. resultados dentro de Argentina.
  //
  // Nunca usamos un resultado como establecimiento.
  // ---------------------------------------------------------------

  function scoreResult(result) {

    const display =
      normalizeText(result.display_name);

    const name =
      normalizeText(result.name);

    const type =
      normalizeText(result.type);

    const address =
      result.address || {};

    const suburb =
      normalizeText(
        address.suburb
      );

    const neighbourhood =
      normalizeText(
        address.neighbourhood
      );

    const city =
      normalizeText(
        address.city ||
        address.town ||
        address.municipality ||
        address.village ||
        ""
      );

    let score = 0;

    if (name === wanted) {
      score += 100;
    }

    if (suburb === wanted) {
      score += 90;
    }

    if (neighbourhood === wanted) {
      score += 90;
    }

    if (city === wanted) {
      score += 80;
    }

    if (display.includes(wanted)) {
      score += 20;
    }

    if (
      type === "suburb" ||
      type === "neighbourhood" ||
      type === "quarter" ||
      type === "city" ||
      type === "town" ||
      type === "municipality" ||
      type === "village"
    ) {
      score += 20;
    }

    if (
      result.lat &&
      result.lon
    ) {
      score += 10;
    }

    return score;
  }

  const sorted =
    [...results].sort(
      (a, b) =>
        scoreResult(b) -
        scoreResult(a)
    );

  const selected =
    sorted.find(
      (result) =>
        result &&
        result.lat &&
        result.lon
    );

  if (!selected) {
    return null;
  }

  const lat =
    Number(selected.lat);

  const lon =
    Number(selected.lon);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return null;
  }

  const address =
    selected.address || {};

  const resolvedParts = [
    address.neighbourhood ||
      address.suburb ||
      address.city_district,

    address.city ||
      address.town ||
      address.municipality ||
      address.village,

    address.state,
  ].filter(Boolean);

  const resolvedCity =
    resolvedParts.length
      ? resolvedParts.join(", ")
      : selected.display_name ||
        capitalizeWords(query);

  return {
    lat,
    lon,
    label: resolvedCity,
    displayName:
      selected.display_name ||
      query,
  };
}


// ------------------------------------------------------------------
// OVERPASS
// ------------------------------------------------------------------
//
// Busca NODES, WAYS y RELATIONS que tengan las etiquetas permitidas.
//
// Radio: 15 km.
//
// Importante:
// No buscamos "lugares" por texto.
// Buscamos exclusivamente objetos OSM que tengan una etiqueta
// semántica concreta, por ejemplo:
//
// amenity=restaurant
// amenity=bar
// amenity=nightclub
// tourism=museum
// leisure=park
//
// Eso reduce muchísimo la posibilidad de que una calle o barrio
// aparezca como establecimiento.
// ------------------------------------------------------------------

async function searchPlaces({
  lat,
  lon,
  tags,
  radius = 15000,
}) {

  const selectors =
    tags
      .map(
        ([key, value]) =>
          `
          nwr(
            around:${radius},${lat},${lon}
          )["${escapeOverpass(key)}"="${escapeOverpass(value)}"];
          `
      )
      .join("\n");

  const query = `
    [out:json][timeout:25];

    (
      ${selectors}
    );

    out center tags;
  `;

  const response =
    await fetch(
      OVERPASS_URL,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
          "User-Agent":
            "SALIME/1.0 (application for academic presentation)",
        },
        body:
          `data=${encodeURIComponent(query)}`,
      }
    );

  if (!response.ok) {
    const errorText =
      await response.text();

    console.error(
      "Overpass error:",
      response.status,
      errorText
    );

    throw new Error(
      `overpass-error-${response.status}`
    );
  }

  const data =
    await response.json();

  return Array.isArray(data.elements)
    ? data.elements
    : [];
}


// ------------------------------------------------------------------
// CATEGORÍA REAL
// ------------------------------------------------------------------

function elementMatchesIntent(
  element,
  tags
) {

  const elementTags =
    element && element.tags
      ? element.tags
      : {};

  return tags.some(
    ([key, value]) =>
      elementTags[key] === value
  );
}


// ------------------------------------------------------------------
// NOMBRE
// ------------------------------------------------------------------
//
// Solamente aceptamos nombres reales.
//
// No usamos:
// - address
// - street
// - city
// - suburb
// - neighbourhood
//
// como nombre.
//
// Si no hay "name", se descarta.
// ------------------------------------------------------------------

function getRealName(element) {

  const tags =
    element && element.tags
      ? element.tags
      : {};

  const name =
    String(
      tags.name ||
      tags["name:es"] ||
      ""
    ).trim();

  if (!name) {
    return null;
  }

  // Evita números solos.
  if (/^\d+$/.test(name)) {
    return null;
  }

  return name;
}


// ------------------------------------------------------------------
// DESCARTAR RESULTADOS QUE SON GEOGRAFÍA Y NO ESTABLECIMIENTOS
// ------------------------------------------------------------------

function isInvalidPlace(
  element,
  name
) {

  const tags =
    element && element.tags
      ? element.tags
      : {};

  const normalizedName =
    normalizeText(name);

  const street =
    normalizeText(
      tags["addr:street"]
    );

  const city =
    normalizeText(
      tags["addr:city"]
    );

  const suburb =
    normalizeText(
      tags["addr:suburb"]
    );

  const district =
    normalizeText(
      tags["addr:district"]
    );

  const neighbourhood =
    normalizeText(
      tags["addr:neighbourhood"]
    );

  // ---------------------------------------------------------------
  // Si el nombre es exactamente una calle.
  // ---------------------------------------------------------------

  if (
    street &&
    normalizedName === street
  ) {
    return true;
  }

  // ---------------------------------------------------------------
  // Si el nombre es exactamente la ciudad.
  // ---------------------------------------------------------------

  if (
    city &&
    normalizedName === city
  ) {
    return true;
  }

  // ---------------------------------------------------------------
  // Si el nombre es exactamente un barrio.
  // ---------------------------------------------------------------

  if (
    suburb &&
    normalizedName === suburb
  ) {
    return true;
  }

  if (
    district &&
    normalizedName === district
  ) {
    return true;
  }

  if (
    neighbourhood &&
    normalizedName === neighbourhood
  ) {
    return true;
  }

  // ---------------------------------------------------------------
  // Nunca aceptar nombres que parezcan solamente una dirección.
  // Ejemplos:
  //
  // "Obispo Oro 123"
  // "Av. Colón 500"
  // "123"
  // ---------------------------------------------------------------

  if (
    /^\d{1,6}$/.test(name)
  ) {
    return true;
  }

  if (
    /\b\d{1,6}\b/.test(name) &&
    (
      normalizedName.includes(
        "avenida"
      ) ||
      normalizedName.includes(
        "av "
      ) ||
      normalizedName.includes(
        "calle "
      ) ||
      normalizedName.includes(
        "boulevard"
      ) ||
      normalizedName.includes(
        "bulevar"
      ) ||
      normalizedName.includes(
        "ruta "
      )
    )
  ) {
    return true;
  }

  return false;
}


// ------------------------------------------------------------------
// DATOS VISUALES
// ------------------------------------------------------------------

function emojiFor(tags) {

  const amenity =
    tags.amenity || "";

  const tourism =
    tags.tourism || "";

  const leisure =
    tags.leisure || "";

  if (
    amenity === "fast_food"
  ) {
    return "🍔";
  }

  if (
    amenity === "restaurant"
  ) {
    return "🍽️";
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
    tourism === "museum" ||
    tourism === "gallery"
  ) {
    return "🖼️";
  }

  if (
    amenity === "theatre" ||
    amenity === "arts_centre"
  ) {
    return "🎭";
  }

  if (
    leisure === "park"
  ) {
    return "🌳";
  }

  if (
    leisure === "playground"
  ) {
    return "🛝";
  }

  if (
    leisure === "theme_park" ||
    leisure === "water_park"
  ) {
    return "🎡";
  }

  if (
    tourism === "viewpoint"
  ) {
    return "✨";
  }

  return "📍";
}


function estimateOutdoor(tags) {

  return (
    tags.leisure === "park" ||
    tags.leisure === "playground" ||
    tags.leisure === "theme_park" ||
    tags.leisure === "water_park" ||
    tags.natural ||
    tags.tourism === "viewpoint"
  );
}


function estimateKidFriendly(tags) {

  const amenity =
    tags.amenity || "";

  if (
    amenity === "nightclub"
  ) {
    return false;
  }

  if (
    amenity === "bar" ||
    amenity === "pub"
  ) {
    return false;
  }

  if (
    tags.leisure === "playground" ||
    tags.leisure === "theme_park" ||
    tags.leisure === "water_park"
  ) {
    return true;
  }

  return true;
}


function estimateNightOnly(tags) {

  return (
    tags.amenity === "nightclub"
  );
}


function estimateSlots(tags) {

  if (
    tags.amenity === "nightclub"
  ) {
    return ["night"];
  }

  if (
    tags.amenity === "bar" ||
    tags.amenity === "pub"
  ) {
    return [
      "afternoon",
      "night",
    ];
  }

  return [
    "morning",
    "afternoon",
    "night",
  ];
}


function estimatePrice(tags) {

  const amenity =
    tags.amenity || "";

  const leisure =
    tags.leisure || "";

  if (
    amenity === "fast_food" ||
    amenity === "cafe"
  ) {
    return 1;
  }

  if (
    leisure === "park" ||
    leisure === "playground"
  ) {
    return 1;
  }

  if (
    amenity === "nightclub"
  ) {
    return 3;
  }

  if (
    amenity === "restaurant" ||
    amenity === "bar" ||
    amenity === "pub"
  ) {
    return 2;
  }

  return null;
}


// ------------------------------------------------------------------
// HORARIOS
// ------------------------------------------------------------------

function parseSimpleHours(raw) {

  if (
    !raw ||
    typeof raw !== "string"
  ) {
    return null;
  }

  const match =
    raw.match(
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


// ------------------------------------------------------------------
// DIRECCIÓN
// ------------------------------------------------------------------

function cleanAddress(tags) {

  const street =
    String(
      tags["addr:street"] ||
      ""
    ).trim();

  const houseNumber =
    String(
      tags["addr:housenumber"] ||
      ""
    ).trim();

  const city =
    String(
      tags["addr:city"] ||
      ""
    ).trim();

  const suburb =
    String(
      tags["addr:suburb"] ||
      tags["addr:neighbourhood"] ||
      ""
    ).trim();

  const streetPart =
    [
      street,
      houseNumber,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  const areaPart =
    [
      suburb,
      city,
    ]
      .filter(Boolean)
      .join(", ")
      .trim();

  if (
    streetPart &&
    areaPart
  ) {
    return `${streetPart}, ${areaPart}`;
  }

  if (streetPart) {
    return streetPart;
  }

  if (areaPart) {
    return areaPart;
  }

  return null;
}


// ------------------------------------------------------------------
// COORDENADAS
// ------------------------------------------------------------------
//
// En OSM:
//
// node:
//   lat / lon
//
// way/relation:
//   center.lat / center.lon
// ------------------------------------------------------------------

function getCoordinates(
  element
) {

  if (
    typeof element.lat === "number" &&
    typeof element.lon === "number"
  ) {
    return {
      lat: element.lat,
      lon: element.lon,
    };
  }

  if (
    element.center &&
    typeof element.center.lat === "number" &&
    typeof element.center.lon === "number"
  ) {
    return {
      lat: element.center.lat,
      lon: element.center.lon,
    };
  }

  return null;
}


// ------------------------------------------------------------------
// MAPEAR A FORMATO DE SALIME
// ------------------------------------------------------------------

function mapElementToPlace(
  element,
  center
) {

  const tags =
    element.tags || {};

  const name =
    getRealName(element);

  if (!name) {
    return null;
  }

  if (
    isInvalidPlace(
      element,
      name
    )
  ) {
    return null;
  }

  const coordinates =
    getCoordinates(element);

  if (!coordinates) {
    return null;
  }

  const distanceKm =
    haversineKm(
      center.lat,
      center.lon,
      coordinates.lat,
      coordinates.lon
    );

  // Aproximación solamente para conservar el formato que
  // ya espera SALIME. No representa un tiempo real de Google Maps.
  const distMin =
    Math.max(
      1,
      Math.round(
        (distanceKm / 4.5) * 60
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

    // OSM no proporciona una valoración confiable para todos
    // los lugares. No inventamos una.
    rating:
      null,

    dist:
      distMin,

    mood:
      (
        tags.amenity === "bar" ||
        tags.amenity === "pub" ||
        tags.amenity === "nightclub"
      )
        ? ["animado"]
        : ["tranquilo"],

    outdoor:
      estimateOutdoor(tags),

    kidFriendly:
      estimateKidFriendly(tags),

    nightOnly:
      estimateNightOnly(tags),

    slots:
      estimateSlots(tags),

    why:
      null,

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

    lat:
      coordinates.lat,

    lon:
      coordinates.lon,
  };
}


// ------------------------------------------------------------------
// HANDLER
// ------------------------------------------------------------------

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

  const validIntents = [
    "comer",
    "beber",
    "cultura",
    "paseo",
    "aire_libre",
    "fiesta",
    "familia",
    "general",
  ];

  const finalIntent =
    validIntents.includes(
      normalizedIntent
    )
      ? normalizedIntent
      : "general";

  const tags =
    INTENT_TAGS[finalIntent];

  try {

    // -------------------------------------------------------------
    // 1. Encontrar coordenadas de la ubicación.
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
    // 2. Buscar establecimientos reales alrededor.
    // -------------------------------------------------------------

    const elements =
      await searchPlaces({
        lat:
          location.lat,

        lon:
          location.lon,

        tags,

        radius:
          15000,
      });


    // -------------------------------------------------------------
    // 3. Filtrar.
    // -------------------------------------------------------------

    const seen =
      new Set();

    const places =
      elements

        // Debe corresponder exactamente a una etiqueta permitida.
        .filter(
          (element) =>
            elementMatchesIntent(
              element,
              tags
            )
        )

        // Convertir solamente objetos con nombre/coordenadas válidos.
        .map(
          (element) =>
            mapElementToPlace(
              element,
              location
            )
        )

        .filter(Boolean)

        // Ordenar por cercanía.
        .sort(
          (a, b) =>
            a.dist - b.dist
        )

        // Eliminar duplicados.
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
        )

        // Máximo 40.
        .slice(0, 40);


    // -------------------------------------------------------------
    // 4. Respuesta compatible con SALIME.
    // -------------------------------------------------------------

    res.status(200).json({
      city,

      resolvedCity:
        location.label,

      places,
    });

  } catch (error) {

    console.error(
      "SALIME lugares error:",
      error
    );

    res.status(502).json({
      error:
        "places-search-failed",

      message:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
}
