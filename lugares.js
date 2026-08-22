// api/lugares.js
//
// SALIME - búsqueda de lugares reales
//
// Fuente:
// - Nominatim / OpenStreetMap para geocodificar la ubicación.
// - Overpass / OpenStreetMap para buscar lugares.
//
// No usa Geoapify.
// No requiere API key.
// No inventa lugares.
// No usa calles, barrios o ciudades como lugares.
//
// ------------------------------------------------------------------


const NOMINATIM_URL =
  "https://nominatim.openstreetmap.org/search";

const OVERPASS_URL =
  "https://overpass-api.de/api/interpreter";


// ------------------------------------------------------------------
// CATEGORÍAS POR INTENT
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
    ["leisure", "theme_park"],
    ["leisure", "water_park"],
    ["tourism", "museum"],
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
// NORMALIZACIÓN
// ------------------------------------------------------------------

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}


// ------------------------------------------------------------------
// ESCAPE OVERPASS
// ------------------------------------------------------------------

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

async function geocodeLocation(text) {

  const query =
    String(text || "").trim();

  if (!query) {
    return null;
  }

  const params =
    new URLSearchParams({
      q: `${query}, Argentina`,
      format: "json",
      addressdetails: "1",
      limit: "10",
      countrycodes: "ar",
      "accept-language": "es",
    });

  const url =
    `${NOMINATIM_URL}?${params.toString()}`;

  const response =
    await fetch(url, {
      headers: {
        "User-Agent":
          "SALIME/1.0 academic application",
        "Accept":
          "application/json",
      },
    });

  if (!response.ok) {
    throw new Error(
      `nominatim-error-${response.status}`
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

  function scoreResult(result) {

    const name =
      normalizeText(result.name);

    const display =
      normalizeText(
        result.display_name
      );

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

    const countryCode =
      normalizeText(
        address.country_code
      );

    let score = 0;

    // -------------------------------------------------------------
    // MUY IMPORTANTE:
    // Solo Argentina.
    // -------------------------------------------------------------

    if (
      countryCode === "ar"
    ) {
      score += 500;
    } else {
      score -= 1000;
    }

    if (
      name === wanted
    ) {
      score += 100;
    }

    if (
      suburb === wanted
    ) {
      score += 90;
    }

    if (
      neighbourhood === wanted
    ) {
      score += 90;
    }

    if (
      city === wanted
    ) {
      score += 80;
    }

    if (
      display.includes(wanted)
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
      (result) => {

        const countryCode =
          normalizeText(
            result.address?.country_code
          );

        return (
          countryCode === "ar" &&
          result.lat &&
          result.lon
        );
      }
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
      address.suburb,

    address.city ||
      address.town ||
      address.municipality ||
      address.village,

    address.state,
  ].filter(Boolean);

  return {
    lat,
    lon,

    label:
      resolvedParts.length
        ? resolvedParts.join(", ")
        : selected.display_name ||
          query,

    displayName:
      selected.display_name ||
      query,
  };
}


// ------------------------------------------------------------------
// BUSCAR LUGARES EN OVERPASS
// ------------------------------------------------------------------

async function searchPlaces({
  lat,
  lon,
  tags,
  radius,
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
            "SALIME/1.0 academic application",
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

  return Array.isArray(
    data.elements
  )
    ? data.elements
    : [];
}


// ------------------------------------------------------------------
// VERIFICAR CATEGORÍA
// ------------------------------------------------------------------

function elementMatchesIntent(
  element,
  tags
) {

  const elementTags =
    element?.tags || {};

  return tags.some(
    ([key, value]) =>
      elementTags[key] === value
  );
}


// ------------------------------------------------------------------
// OBTENER NOMBRE REAL
// ------------------------------------------------------------------

function getRealName(element) {

  const tags =
    element?.tags || {};

  const name =
    String(
      tags.name ||
      tags["name:es"] ||
      ""
    ).trim();

  if (!name) {
    return null;
  }

  if (
    /^\d+$/.test(name)
  ) {
    return null;
  }

  return name;
}


// ------------------------------------------------------------------
// DESCARTAR CALLES / BARRIOS / CIUDADES
// ------------------------------------------------------------------

function isInvalidPlace(
  element,
  name
) {

  const tags =
    element?.tags || {};

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

  if (
    street &&
    normalizedName === street
  ) {
    return true;
  }

  if (
    city &&
    normalizedName === city
  ) {
    return true;
  }

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

  // Evita nombres que sean solamente direcciones.

  if (
    /^\d{1,6}$/.test(name)
  ) {
    return true;
  }

  if (
    /\b\d{1,6}\b/.test(name) &&
    (
      normalizedName.includes("avenida") ||
      normalizedName.includes("av ") ||
      normalizedName.includes("calle ") ||
      normalizedName.includes("boulevard") ||
      normalizedName.includes("bulevar") ||
      normalizedName.includes("ruta ")
    )
  ) {
    return true;
  }

  return false;
}


// ------------------------------------------------------------------
// COORDENADAS
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
// EMOJIS
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


// ------------------------------------------------------------------
// PRECIO
// ------------------------------------------------------------------

function estimatePrice(tags) {

  const amenity =
    tags.amenity || "";

  const leisure =
    tags.leisure || "";

  const tourism =
    tags.tourism || "";

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

  if (
    tourism === "museum" ||
    tourism === "gallery"
  ) {
    return 2;
  }

  return null;
}


// ------------------------------------------------------------------
// MOOD
// ------------------------------------------------------------------

function estimateMood(tags) {

  if (
    tags.amenity === "bar" ||
    tags.amenity === "pub" ||
    tags.amenity === "nightclub"
  ) {
    return ["animado"];
  }

  return ["tranquilo"];
}


// ------------------------------------------------------------------
// AIRE LIBRE
// ------------------------------------------------------------------

function estimateOutdoor(tags) {

  return (
    tags.leisure === "park" ||
    tags.leisure === "playground" ||
    tags.leisure === "theme_park" ||
    tags.leisure === "water_park" ||
    !!tags.natural ||
    tags.tourism === "viewpoint"
  );
}


// ------------------------------------------------------------------
// FAMILIA
// ------------------------------------------------------------------

function estimateKidFriendly(tags) {

  if (
    tags.amenity === "nightclub"
  ) {
    return false;
  }

  if (
    tags.amenity === "bar" ||
    tags.amenity === "pub"
  ) {
    return false;
  }

  return true;
}


// ------------------------------------------------------------------
// SOLO NOCHE
// ------------------------------------------------------------------

function estimateNightOnly(tags) {

  return (
    tags.amenity === "nightclub"
  );
}


// ------------------------------------------------------------------
// HORARIOS
// ------------------------------------------------------------------
//
// ESTA ES LA PARTE CORREGIDA.
//
// No todos los lugares pueden aparecer en todas las franjas.
//
// Parque:
//   morning + afternoon
//
// Playground:
//   morning + afternoon
//
// Museo:
//   morning + afternoon
//
// Café:
//   morning + afternoon
//
// Restaurante:
//   morning + afternoon + night
//
// Bar/pub:
//   afternoon + night
//
// Nightclub:
//   night
//
// Teatro:
//   afternoon + night
// ------------------------------------------------------------------

function estimateSlots(tags) {

  const amenity =
    tags.amenity || "";

  const tourism =
    tags.tourism || "";

  const leisure =
    tags.leisure || "";

  // ---------------------------------------------------------------
  // BOLICHE
  // ---------------------------------------------------------------

  if (
    amenity === "nightclub"
  ) {
    return ["night"];
  }

  // ---------------------------------------------------------------
  // BAR / PUB
  // ---------------------------------------------------------------

  if (
    amenity === "bar" ||
    amenity === "pub"
  ) {
    return [
      "afternoon",
      "night",
    ];
  }

  // ---------------------------------------------------------------
  // CAFÉ
  // ---------------------------------------------------------------

  if (
    amenity === "cafe"
  ) {
    return [
      "morning",
      "afternoon",
    ];
  }

  // ---------------------------------------------------------------
  // RESTAURANTE
  // ---------------------------------------------------------------

  if (
    amenity === "restaurant"
  ) {
    return [
      "afternoon",
      "night",
    ];
  }

  // ---------------------------------------------------------------
  // FAST FOOD
  // ---------------------------------------------------------------

  if (
    amenity === "fast_food"
  ) {
    return [
      "morning",
      "afternoon",
      "night",
    ];
  }

  // ---------------------------------------------------------------
  // FOOD COURT
  // ---------------------------------------------------------------

  if (
    amenity === "food_court"
  ) {
    return [
      "afternoon",
      "night",
    ];
  }

  // ---------------------------------------------------------------
  // MUSEO
  // ---------------------------------------------------------------

  if (
    tourism === "museum"
  ) {
    return [
      "morning",
      "afternoon",
    ];
  }

  // ---------------------------------------------------------------
  // GALERÍA
  // ---------------------------------------------------------------

  if (
    tourism === "gallery"
  ) {
    return [
      "morning",
      "afternoon",
    ];
  }

  // ---------------------------------------------------------------
  // TEATRO
  // ---------------------------------------------------------------

  if (
    amenity === "theatre"
  ) {
    return [
      "afternoon",
      "night",
    ];
  }

  // ---------------------------------------------------------------
  // CENTRO CULTURAL
  // ---------------------------------------------------------------

  if (
    amenity === "arts_centre"
  ) {
    return [
      "morning",
      "afternoon",
      "night",
    ];
  }

  // ---------------------------------------------------------------
  // PARQUES
  //
  // MUY IMPORTANTE:
  // NO night.
  // ---------------------------------------------------------------

  if (
    leisure === "park"
  ) {
    return [
      "morning",
      "afternoon",
    ];
  }

  // ---------------------------------------------------------------
  // PLAZAS / JUEGOS
  //
  // NO night.
  // ---------------------------------------------------------------

  if (
    leisure === "playground"
  ) {
    return [
      "morning",
      "afternoon",
    ];
  }

  // ---------------------------------------------------------------
  // PARQUE DE ATRACCIONES
  // ---------------------------------------------------------------

  if (
    leisure === "theme_park" ||
    leisure === "water_park"
  ) {
    return [
      "morning",
      "afternoon",
    ];
  }

  // ---------------------------------------------------------------
  // MIRADORES
  // ---------------------------------------------------------------

  if (
    tourism === "viewpoint"
  ) {
    return [
      "morning",
      "afternoon",
    ];
  }

  // ---------------------------------------------------------------
  // NATURALEZA
  // ---------------------------------------------------------------

  if (
    tags.natural
  ) {
    return [
      "morning",
      "afternoon",
    ];
  }

  // Por seguridad, no asumimos noche para lugares desconocidos.
  return [
    "morning",
    "afternoon",
  ];
}


// ------------------------------------------------------------------
// HORARIOS REALES OSM
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
      tags["addr:street"] || ""
    ).trim();

  const number =
    String(
      tags["addr:housenumber"] || ""
    ).trim();

  const suburb =
    String(
      tags["addr:suburb"] ||
      tags["addr:neighbourhood"] ||
      ""
    ).trim();

  const city =
    String(
      tags["addr:city"] ||
      ""
    ).trim();

  const streetPart =
    [
      street,
      number,
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
// CONVERTIR RESULTADO OSM A SALIME
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

  const distMin =
    Math.max(
      1,
      Math.round(
        (distanceKm / 4.5) * 60
      )
    );

  return {

    name,

    emoji:
      emojiFor(tags),

    price:
      estimatePrice(tags),

    // No inventamos una valoración.
    rating:
      null,

    dist:
      distMin,

    mood:
      estimateMood(tags),

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

    hours:
      parseSimpleHours(
        tags.opening_hours
      ),

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
    close,
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
    INTENT_TAGS[
      finalIntent
    ];

  try {

    // -------------------------------------------------------------
    // 1. Geocodificar.
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
    // 2. Radio de búsqueda.
    //
    // Si el usuario pidió "cerca", reducimos el radio.
    // -------------------------------------------------------------

    const radius =
      close === true
        ? 5000
        : 15000;


    // -------------------------------------------------------------
    // 3. Buscar lugares reales.
    // -------------------------------------------------------------

    const elements =
      await searchPlaces({
        lat:
          location.lat,

        lon:
          location.lon,

        tags,

        radius,
      });


    // -------------------------------------------------------------
    // 4. Filtrar y transformar.
    // -------------------------------------------------------------

    const seen =
      new Set();

    const places =
      elements

        // Solamente las categorías solicitadas.
        .filter(
          (element) =>
            elementMatchesIntent(
              element,
              tags
            )
        )

        // Solamente lugares con nombre y coordenadas.
        .map(
          (element) =>
            mapElementToPlace(
              element,
              location
            )
        )

        .filter(Boolean)

        // Más cercanos primero.
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

        .slice(0, 40);


    // -------------------------------------------------------------
    // 5. Respuesta.
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
