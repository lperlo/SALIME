// api/lugares.js
//
// SALIME - búsqueda REAL de lugares
//
// Esta versión NO usa Geoapify.
//
// Usa:
// 1. Nominatim / OpenStreetMap para convertir la ubicación escrita
//    por el usuario en coordenadas.
// 2. Overpass / OpenStreetMap para buscar lugares reales alrededor
//    de esas coordenadas.
//
// No necesita GEOAPIFY_API_KEY.
//
// OBJETIVO PRINCIPAL:
// No devolver calles, barrios, ciudades ni direcciones como lugares.
//
// El resultado solamente puede entrar si:
// - tiene nombre;
// - tiene coordenadas;
// - tiene una categoría OSM válida para el intent solicitado;
// - no parece una calle, barrio, ciudad o dirección;
// - está dentro del radio de búsqueda.
//
// ------------------------------------------------------------------


const OVERPASS_URL =
  "https://overpass-api.de/api/interpreter";

const NOMINATIM_URL =
  "https://nominatim.openstreetmap.org/search";


// ---------------------------------------------------------------
// Categorías OSM por intención
// ---------------------------------------------------------------
//
// Acá somos deliberadamente estrictos.
//
// No buscamos "cosas parecidas".
// Buscamos objetos que tengan exactamente alguna de estas etiquetas.
//
// ---------------------------------------------------------------

const INTENT_TAGS = {
  comer: [
    ["amenity", "restaurant"],
    ["amenity", "fast_food"],
    ["amenity", "food_court"],
  ],

  beber: [
    ["amenity", "bar"],
    ["amenity", "pub"],
    ["amenity", "cafe"],
  ],

  cultura: [
    ["tourism", "museum"],
    ["amenity", "theatre"],
    ["amenity", "arts_centre"],
    ["tourism", "gallery"],
  ],

  paseo: [
    ["leisure", "park"],
    ["tourism", "attraction"],
    ["tourism", "viewpoint"],
  ],

  aire_libre: [
    ["leisure", "park"],
    ["leisure", "garden"],
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
    ["leisure", "water_park"],
    ["leisure", "theme_park"],
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


// ---------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}


function escapeOverpass(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}


// ---------------------------------------------------------------
// Nominatim
// ---------------------------------------------------------------
//
// Buscamos SOLAMENTE la ubicación que escribió el usuario.
//
// countrycodes=ar es MUY IMPORTANTE.
//
// Evita que "Palermo" termine resolviendo a Palermo, Italia
// o cualquier otro Palermo del mundo.
//
// ---------------------------------------------------------------

async function geocodeLocation(text) {
  const query = String(text || "").trim();

  if (!query) {
    return null;
  }

  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "10",
    countrycodes: "ar",
    addressdetails: "1",
    "accept-language": "es",
  });

  const url =
    `${NOMINATIM_URL}?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      // Nominatim pide identificar la aplicación.
      "User-Agent":
        "SALIME/1.0 (aplicacion educativa)",
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

  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }


  // -------------------------------------------------------------
  // Elegimos solamente resultados argentinos.
  // -------------------------------------------------------------

  const argentina = results.filter((item) => {
    const address = item.address || {};

    const countryCode =
      String(address.country_code || "")
        .toLowerCase();

    return countryCode === "ar";
  });

  if (argentina.length === 0) {
    return null;
  }


  // -------------------------------------------------------------
  // Priorizamos lugares que realmente representan una zona,
  // ciudad, barrio o localidad.
  //
  // NO queremos que Nominatim nos devuelva una calle como centro
  // de búsqueda cuando el usuario escribió "Palermo".
  // -------------------------------------------------------------

  const validTypes = new Set([
    "city",
    "town",
    "village",
    "municipality",
    "suburb",
    "neighbourhood",
    "quarter",
    "district",
    "locality",
  ]);


  function score(item) {
    let score = 0;

    const type =
      String(item.type || "").toLowerCase();

    const address = item.address || {};

    const countryCode =
      String(address.country_code || "")
        .toLowerCase();

    if (countryCode === "ar") {
      score += 100;
    }

    if (validTypes.has(type)) {
      score += 100;
    }

    // Preferimos Buenos Aires / Córdoba cuando aparecen
    // explícitamente en la dirección.
    const state =
      normalizeText(address.state);

    const city =
      normalizeText(address.city);

    const province =
      normalizeText(address.province);

    if (
      state.includes("cordoba") ||
      province.includes("cordoba")
    ) {
      score += 30;
    }

    if (
      city.includes("buenos aires") ||
      state.includes("buenos aires")
    ) {
      score += 30;
    }

    // Si el nombre coincide con la consulta, mejor.
    const itemName =
      normalizeText(item.name);

    const wanted =
      normalizeText(query);

    if (
      itemName &&
      itemName === wanted
    ) {
      score += 80;
    }

    // Las calles pierden prioridad.
    if (
      type === "road" ||
      type === "street"
    ) {
      score -= 200;
    }

    return score;
  }


  const sorted = [...argentina].sort(
    (a, b) => score(b) - score(a)
  );


  const best = sorted[0];

  if (!best) {
    return null;
  }


  const lat = Number(best.lat);
  const lon = Number(best.lon);

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
      best.name ||
      query,
  };
}


// ---------------------------------------------------------------
// Overpass
// ---------------------------------------------------------------
//
// Busca nodos, caminos y relaciones que tengan las etiquetas
// correspondientes.
//
// El radio es 8 km.
//
// No usamos el polígono de un barrio, shopping o edificio.
// Buscamos directamente alrededor de las coordenadas.
//
// ---------------------------------------------------------------

async function searchPlaces({
  lat,
  lon,
  tags,
  radius = 8000,
}) {
  const blocks = tags.map(
    ([key, value]) => {
      const safeKey =
        escapeOverpass(key);

      const safeValue =
        escapeOverpass(value);

      return `
        node
          ["${safeKey}"="${safeValue}"]
          (around:${radius},${lat},${lon});

        way
          ["${safeKey}"="${safeValue}"]
          (around:${radius},${lat},${lon});

        relation
          ["${safeKey}"="${safeValue}"]
          (around:${radius},${lat},${lon});
      `;
    }
  );


  const query = `
    [out:json][timeout:25];

    (
      ${blocks.join("\n")}
    );

    out center tags;
  `;


  const response = await fetch(
    OVERPASS_URL,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent":
          "SALIME/1.0 (aplicacion educativa)",
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


// ---------------------------------------------------------------
// Coordenadas de un elemento OSM
// ---------------------------------------------------------------

function getElementCoordinates(element) {
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


// ---------------------------------------------------------------
// Distancia
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
// Categoría exacta
// ---------------------------------------------------------------
//
// IMPORTANTE:
//
// No usamos startsWith().
// Queremos coincidencia exacta.
//
// Ejemplo:
// amenity=restaurant
//
// entra.
//
// highway=residential
//
// no entra.
//
// place=suburb
//
// no entra.
//
// ---------------------------------------------------------------

function matchesIntent(
  element,
  allowedTags
) {
  const tags =
    element && element.tags
      ? element.tags
      : {};

  return allowedTags.some(
    ([key, value]) =>
      String(tags[key] || "")
        .toLowerCase() ===
      String(value)
        .toLowerCase()
  );
}


// ---------------------------------------------------------------
// Validación MUY ESTRICTA del nombre
// ---------------------------------------------------------------

function isValidPlaceName(
  element
) {
  const tags =
    element && element.tags
      ? element.tags
      : {};

  const name =
    String(tags.name || "").trim();


  // Sin nombre = descartado.
  if (!name) {
    return false;
  }


  // Nombres que son solamente números.
  if (/^\d+$/.test(name)) {
    return false;
  }


  const normalized =
    normalizeText(name);


  // -------------------------------------------------------------
  // Nunca aceptar nombres que claramente son calles.
  // -------------------------------------------------------------

  const streetWords = [
    "calle ",
    "avenida ",
    "av ",
    "av. ",
    "boulevard ",
    "bulevar ",
    "ruta ",
    "autopista ",
    "pasaje ",
    "camino ",
    "diagonal ",
    "acceso ",
    "costanera ",
  ];


  if (
    streetWords.some(
      (word) =>
        normalized.startsWith(
          normalizeText(word)
        )
    )
  ) {
    return false;
  }


  // -------------------------------------------------------------
  // Si el objeto tiene tags de highway o place,
  // NO queremos que aparezca como lugar.
  // -------------------------------------------------------------

  if (tags.highway) {
    return false;
  }

  if (tags.place) {
    return false;
  }


  // -------------------------------------------------------------
  // Tampoco aceptar objetos que sean explícitamente una dirección.
  // -------------------------------------------------------------

  if (
    tags.addr &&
    !tags.amenity &&
    !tags.tourism &&
    !tags.leisure
  ) {
    return false;
  }


  // -------------------------------------------------------------
  // Evitar nombres que parezcan solamente una dirección.
  // Ejemplo: "Obispo Oro 123".
  // -------------------------------------------------------------

  if (
    /\d{1,5}$/.test(normalized) &&
    !tags.amenity &&
    !tags.tourism &&
    !tags.leisure
  ) {
    return false;
  }


  return true;
}


// ---------------------------------------------------------------
// Precio aproximado
// ---------------------------------------------------------------

function estimatePrice(tags) {
  if (
    tags.amenity === "fast_food" ||
    tags.amenity === "cafe"
  ) {
    return 1;
  }

  if (
    tags.leisure === "park" ||
    tags.leisure === "garden" ||
    tags.leisure === "playground"
  ) {
    return 1;
  }

  if (
    tags.amenity === "nightclub"
  ) {
    return 3;
  }

  if (
    tags.amenity === "bar" ||
    tags.amenity === "pub"
  ) {
    return 2;
  }

  if (
    tags.amenity === "restaurant"
  ) {
    return 2;
  }

  if (
    tags.tourism === "museum" ||
    tags.tourism === "gallery" ||
    tags.amenity === "theatre"
  ) {
    return 2;
  }

  return 2;
}


// ---------------------------------------------------------------
// Emoji
// ---------------------------------------------------------------

function emojiFor(tags) {
  if (
    tags.amenity === "fast_food"
  ) {
    return "🍔";
  }

  if (
    tags.amenity === "restaurant"
  ) {
    return "🍽️";
  }

  if (
    tags.amenity === "cafe"
  ) {
    return "☕";
  }

  if (
    tags.amenity === "bar" ||
    tags.amenity === "pub"
  ) {
    return "🍺";
  }

  if (
    tags.amenity === "nightclub"
  ) {
    return "🎉";
  }

  if (
    tags.tourism === "museum" ||
    tags.tourism === "gallery" ||
    tags.amenity === "theatre" ||
    tags.amenity === "arts_centre"
  ) {
    return "🖼️";
  }

  if (
    tags.leisure === "park" ||
    tags.leisure === "garden"
  ) {
    return "🌳";
  }

  if (
    tags.leisure === "playground" ||
    tags.leisure === "theme_park" ||
    tags.leisure === "water_park"
  ) {
    return "🎡";
  }

  if (
    tags.tourism === "viewpoint"
  ) {
    return "✨";
  }

  if (
    tags.natural === "water"
  ) {
    return "🌿";
  }

  return "📍";
}


// ---------------------------------------------------------------
// Outdoor
// ---------------------------------------------------------------

function estimateOutdoor(tags) {
  return (
    tags.leisure === "park" ||
    tags.leisure === "garden" ||
    tags.leisure === "playground" ||
    tags.leisure === "water_park" ||
    tags.leisure === "theme_park" ||
    tags.natural === "water" ||
    tags.tourism === "viewpoint"
  );
}


// ---------------------------------------------------------------
// Kid friendly
// ---------------------------------------------------------------

function estimateKidFriendly(tags) {
  if (
    tags.amenity === "nightclub" ||
    tags.amenity === "bar" ||
    tags.amenity === "pub"
  ) {
    return false;
  }

  return true;
}


// ---------------------------------------------------------------
// Night only
// ---------------------------------------------------------------

function estimateNightOnly(tags) {
  return (
    tags.amenity === "nightclub"
  );
}


// ---------------------------------------------------------------
// Horarios aproximados
// ---------------------------------------------------------------

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


// ---------------------------------------------------------------
// Dirección
// ---------------------------------------------------------------

function cleanAddress(tags) {
  const street =
    String(tags["addr:street"] || "")
      .trim();

  const house =
    String(tags["addr:housenumber"] || "")
      .trim();

  const city =
    String(tags["addr:city"] || "")
      .trim();

  const suburb =
    String(tags["addr:suburb"] || "")
      .trim();

  const state =
    String(tags["addr:state"] || "")
      .trim();


  const streetPart =
    [street, house]
      .filter(Boolean)
      .join(" ");


  const areaPart =
    [
      suburb,
      city,
      state,
    ]
      .filter(Boolean)
      .join(", ");


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


// ---------------------------------------------------------------
// Horarios
// ---------------------------------------------------------------
//
// OSM puede tener formatos complejos.
// No inventamos horarios.
//
// Si no podemos interpretarlos simplemente devolvemos null.
// ---------------------------------------------------------------

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


// ---------------------------------------------------------------
// Convertir elemento OSM al formato de SALIME
// ---------------------------------------------------------------

function mapElement(
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


  const distanceKm =
    haversineKm(
      center.lat,
      center.lon,
      coords.lat,
      coords.lon
    );


  const name =
    String(tags.name || "")
      .trim();


  if (!name) {
    return null;
  }


  const distanceMinutes =
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

    // No inventamos ratings.
    // Si OSM no tiene rating, queda null.
    rating:
      null,

    dist:
      distanceMinutes,

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

    // No inventamos una explicación.
    why:
      null,

    address:
      cleanAddress(tags),

    hours:
      parseSimpleHours(
        tags.opening_hours
      ),

    categories:
      Object.entries(tags)
        .map(
          ([key, value]) =>
            `${key}=${value}`
        ),

    source:
      "openstreetmap",

    osmType:
      element.type || null,

    osmId:
      element.id || null,

    lat:
      coords.lat,

    lon:
      coords.lon,
  };
}


// ---------------------------------------------------------------
// Handler
// ---------------------------------------------------------------

export default async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    res.status(405).json({
      error:
        "method-not-allowed",
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
      error:
        "missing-city",
    });

    return;
  }


  const normalizedIntent =
    String(intent || "general")
      .trim()
      .toLowerCase();


  const allowedTags =
    INTENT_TAGS[
      normalizedIntent
    ] ||
    INTENT_TAGS.general;


  try {
    // -----------------------------------------------------------
    // 1. Resolver ubicación
    // -----------------------------------------------------------

    const location =
      await geocodeLocation(
        city.trim()
      );


    if (!location) {
      res.status(200).json({
        city,
        resolvedCity:
          null,
        places: [],
      });

      return;
    }


    // -----------------------------------------------------------
    // 2. Buscar lugares OSM
    // -----------------------------------------------------------

    const elements =
      await searchPlaces({
        lat:
          location.lat,

        lon:
          location.lon,

        tags:
          allowedTags,

        radius:
          8000,
      });


    // -----------------------------------------------------------
    // 3. Filtrado MUY estricto
    // -----------------------------------------------------------

    const seen =
      new Set();


    const places =
      elements

        // Tiene que ser exactamente una categoría del intent.
        .filter(
          (element) =>
            matchesIntent(
              element,
              allowedTags
            )
        )

        // Tiene que tener nombre válido.
        .filter(
          (element) =>
            isValidPlaceName(
              element
            )
        )

        // Convertimos al formato de SALIME.
        .map(
          (element) =>
            mapElement(
              element,
              location
            )
        )

        .filter(Boolean)

        // No duplicados.
        .filter((place) => {
          const key =
            normalizeText(
              place.name
            ) +
            "|" +
            normalizeText(
              place.address || ""
            );

          if (
            seen.has(key)
          ) {
            return false;
          }

          seen.add(key);

          return true;
        })

        // Más cercanos primero.
        .sort(
          (a, b) =>
            a.dist - b.dist
        )

        // Máximo 20 resultados.
        .slice(0, 20);


    // -----------------------------------------------------------
    // 4. Respuesta
    // -----------------------------------------------------------

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

      detail:
        String(
          error?.message ||
          error
        ),
    });
  }
}
