/* ------------------------------------------------------------------ */
/* api/lugares.js                                                     */
/*                                                                    */
/* SALIME - búsqueda de lugares reales                                */
/*                                                                    */
/* NO USA GEOAPIFY                                                     */
/* NO USA GOOGLE PLACES                                                */
/* NO NECESITA API KEY                                                  */
/*                                                                    */
/* Usa:                                                                */
/* - Nominatim / OpenStreetMap para geocodificar la ubicación          */
/* - Overpass / OpenStreetMap para buscar lugares reales               */
/*                                                                    */
/* IMPORTANTE:                                                         */
/* La búsqueda de lugares se hace por categorías OSM concretas.        */
/* No buscamos "cosas" alrededor y después intentamos adivinar          */
/* si son lugares.                                                     */
/* ------------------------------------------------------------------ */

const NOMINATIM_URL =
  "https://nominatim.openstreetmap.org/search";

const OVERPASS_URL =
  "https://overpass-api.de/api/interpreter";

/* ------------------------------------------------------------------ */
/* Categorías por intención                                            */
/* ------------------------------------------------------------------ */

const INTENT_FILTERS = {
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
    ["tourism", "gallery"],
    ["amenity", "arts_centre"],
  ],

  paseo: [
    ["leisure", "park"],
    ["tourism", "attraction"],
    ["tourism", "viewpoint"],
  ],

  aire_libre: [
    ["leisure", "park"],
    ["leisure", "garden"],
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
    ["leisure", "park"],
    ["tourism", "museum"],
    ["amenity", "restaurant"],
  ],

  general: [
    ["amenity", "restaurant"],
    ["amenity", "cafe"],
    ["tourism", "museum"],
    ["leisure", "park"],
  ],
};

/* ------------------------------------------------------------------ */
/* Geocodificación                                                     */
/* ------------------------------------------------------------------ */

async function geocodeLocation(text) {
  const query = String(text || "").trim();

  if (!query) {
    return null;
  }

  /*
   * Para SALIME trabajamos en Argentina.
   *
   * Si el usuario pone "Nueva Córdoba", por ejemplo,
   * buscamos explícitamente en Argentina.
   */
  const params = new URLSearchParams({
    q: `${query}, Argentina`,
    format: "jsonv2",
    addressdetails: "1",
    limit: "10",
    countrycodes: "ar",
  });

  const res = await fetch(
    `${NOMINATIM_URL}?${params.toString()}`,
    {
      headers: {
        "User-Agent":
          "SALIME-app/1.0 (aplicacion de planes de salida)",
        Accept:
          "application/json",
      },
    }
  );

  if (!res.ok) {
    throw new Error(
      `nominatim-error-${res.status}`
    );
  }

  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  /*
   * Preferimos resultados que realmente representen
   * una zona/localidad y no una calle.
   */
  const preferred = data.find((item) => {
    const type = String(
      item.type || ""
    ).toLowerCase();

    const category = String(
      item.category || ""
    ).toLowerCase();

    return (
      category === "place" ||
      type === "city" ||
      type === "town" ||
      type === "village" ||
      type === "suburb" ||
      type === "neighbourhood" ||
      type === "quarter" ||
      type === "district"
    );
  });

  const result =
    preferred || data[0];

  const lat = Number(result.lat);
  const lon = Number(result.lon);

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
      result.display_name ||
      query,
  };
}

/* ------------------------------------------------------------------ */
/* Construcción de consulta Overpass                                   */
/* ------------------------------------------------------------------ */

function buildOverpassQuery(
  lat,
  lon,
  filters,
  radius = 10000
) {
  /*
   * Buscamos:
   *
   * node
   * way
   * relation
   *
   * porque un restaurante, museo, parque, etc.
   * puede estar representado de cualquiera de
   * esas tres formas en OpenStreetMap.
   *
   * El filtro "name" es MUY IMPORTANTE:
   *
   * [name]
   *
   * obliga a que el objeto tenga nombre.
   *
   * Así evitamos que una calle, una zona o un
   * objeto sin nombre termine apareciendo como
   * lugar recomendado.
   */

  const clauses = filters
    .map(([key, value]) => {
      return `
        node(around:${radius},${lat},${lon})["${key}"="${value}"]["name"];
        way(around:${radius},${lat},${lon})["${key}"="${value}"]["name"];
        relation(around:${radius},${lat},${lon})["${key}"="${value}"]["name"];
      `;
    })
    .join("\n");

  return `
    [out:json][timeout:25];

    (
      ${clauses}
    );

    out center tags;
  `;
}

/* ------------------------------------------------------------------ */
/* Consulta Overpass                                                   */
/* ------------------------------------------------------------------ */

async function searchOpenStreetMap({
  lat,
  lon,
  filters,
}) {
  const query =
    buildOverpassQuery(
      lat,
      lon,
      filters,
      10000
    );

  const res = await fetch(
    OVERPASS_URL,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
        "User-Agent":
          "SALIME-app/1.0",
      },
      body:
        "data=" +
        encodeURIComponent(query),
    }
  );

  if (!res.ok) {
    const errorText =
      await res.text();

    console.error(
      "Overpass error:",
      res.status,
      errorText
    );

    throw new Error(
      `overpass-error-${res.status}`
    );
  }

  const data =
    await res.json();

  return Array.isArray(data.elements)
    ? data.elements
    : [];
}

/* ------------------------------------------------------------------ */
/* Distancia                                                           */
/* ------------------------------------------------------------------ */

function haversineKm(
  lat1,
  lon1,
  lat2,
  lon2
) {
  const R = 6371;

  const dLat =
    ((lat2 - lat1) * Math.PI) /
    180;

  const dLon =
    ((lon2 - lon1) * Math.PI) /
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

/* ------------------------------------------------------------------ */
/* Precio aproximado                                                   */
/* ------------------------------------------------------------------ */

function estimatePrice(tags) {
  const amenity =
    String(tags.amenity || "");

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

  if (
    tags.tourism === "museum" ||
    tags.tourism === "gallery"
  ) {
    return 2;
  }

  if (
    tags.leisure === "park" ||
    tags.leisure === "garden" ||
    tags.leisure === "playground"
  ) {
    return 1;
  }

  return 2;
}

/* ------------------------------------------------------------------ */
/* Mood                                                                */
/* ------------------------------------------------------------------ */

function estimateMood(tags) {
  const amenity =
    String(tags.amenity || "");

  if (
    amenity === "nightclub" ||
    amenity === "bar" ||
    amenity === "pub"
  ) {
    return ["animado"];
  }

  return ["tranquilo"];
}

/* ------------------------------------------------------------------ */
/* Exterior                                                             */
/* ------------------------------------------------------------------ */

function estimateOutdoor(tags) {
  const leisure =
    String(tags.leisure || "");

  const natural =
    String(tags.natural || "");

  const tourism =
    String(tags.tourism || "");

  return (
    leisure === "park" ||
    leisure === "garden" ||
    leisure === "playground" ||
    natural === "wood" ||
    natural === "water" ||
    tourism === "viewpoint"
  );
}

/* ------------------------------------------------------------------ */
/* Familiar                                                             */
/* ------------------------------------------------------------------ */

function estimateKidFriendly(tags) {
  const amenity =
    String(tags.amenity || "");

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

  return true;
}

/* ------------------------------------------------------------------ */
/* Horarios                                                             */
/* ------------------------------------------------------------------ */

function estimateNightOnly(tags) {
  return (
    String(tags.amenity || "") ===
    "nightclub"
  );
}

function estimateSlots(tags) {
  const amenity =
    String(tags.amenity || "");

  if (
    amenity === "nightclub"
  ) {
    return ["night"];
  }

  if (
    amenity === "bar" ||
    amenity === "pub"
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

/* ------------------------------------------------------------------ */
/* Emoji                                                                */
/* ------------------------------------------------------------------ */

function emojiFor(tags) {
  const amenity =
    String(tags.amenity || "");

  const tourism =
    String(tags.tourism || "");

  const leisure =
    String(tags.leisure || "");

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
    leisure === "park"
  ) {
    return "🌳";
  }

  if (
    leisure === "playground"
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

/* ------------------------------------------------------------------ */
/* Dirección                                                           */
/* ------------------------------------------------------------------ */

function cleanAddress(tags) {
  const street =
    String(
      tags["addr:street"] ||
        ""
    ).trim();

  const number =
    String(
      tags["addr:housenumber"] ||
        ""
    ).trim();

  const city =
    String(
      tags["addr:city"] ||
        tags["addr:town"] ||
        ""
    ).trim();

  const suburb =
    String(
      tags["addr:suburb"] ||
        ""
    ).trim();

  const parts = [];

  if (street) {
    parts.push(
      number
        ? `${street} ${number}`
        : street
    );
  }

  if (suburb) {
    parts.push(suburb);
  }

  if (city) {
    parts.push(city);
  }

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Horarios OSM                                                        */
/* ------------------------------------------------------------------ */

function parseOpeningHours(
  raw
) {
  if (
    !raw ||
    typeof raw !== "string"
  ) {
    return null;
  }

  /*
   * OSM utiliza formatos bastante variados.
   *
   * Para no inventar horarios,
   * solamente extraemos un rango simple
   * cuando podemos reconocerlo.
   */

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

/* ------------------------------------------------------------------ */
/* Convertir objeto OSM a lugar SALIME                                 */
/* ------------------------------------------------------------------ */

function mapElementToPlace(
  element,
  center
) {
  const tags =
    element.tags || {};

  const name =
    String(
      tags.name || ""
    ).trim();

  /*
   * SIN NOMBRE = NO ES UN LUGAR
   */
  if (!name) {
    return null;
  }

  let lat = null;
  let lon = null;

  /*
   * Node
   */
  if (
    typeof element.lat ===
      "number" &&
    typeof element.lon ===
      "number"
  ) {
    lat = element.lat;
    lon = element.lon;
  }

  /*
   * Way / relation
   */
  if (
    (lat === null ||
      lon === null) &&
    element.center
  ) {
    if (
      typeof element.center.lat ===
        "number" &&
      typeof element.center.lon ===
        "number"
    ) {
      lat = element.center.lat;
      lon = element.center.lon;
    }
  }

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

  const distMin =
    Math.max(
      1,
      Math.round(
        (distKm / 4.5) * 60
      )
    );

  const hours =
    parseOpeningHours(
      tags.opening_hours
    );

  return {
    name,

    emoji:
      emojiFor(tags),

    price:
      estimatePrice(tags),

    /*
     * No inventamos rating.
     * El frontend ya recibe un número,
     * por eso mantenemos un valor neutro.
     */
    rating: null,

    dist: distMin,

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

/* ------------------------------------------------------------------ */
/* Deduplicación                                                        */
/* ------------------------------------------------------------------ */

function deduplicatePlaces(
  places
) {
  const seen =
    new Set();

  return places.filter(
    (place) => {
      const key =
        `${place.name}|${
          place.address || ""
        }`
          .trim()
          .toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    }
  );
}

/* ------------------------------------------------------------------ */
/* Ordenar por distancia                                               */
/* ------------------------------------------------------------------ */

function sortByDistance(
  places
) {
  return [...places].sort(
    (a, b) =>
      Number(a.dist || 999999) -
      Number(b.dist || 999999)
  );
}

/* ------------------------------------------------------------------ */
/* HANDLER                                                             */
/* ------------------------------------------------------------------ */

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
    typeof city !==
      "string" ||
    !city.trim()
  ) {
    res.status(400).json({
      error:
        "missing-city",
    });

    return;
  }

  const normalizedIntent =
    String(
      intent || "general"
    )
      .trim()
      .toLowerCase();

  const filters =
    INTENT_FILTERS[
      normalizedIntent
    ] ||
    INTENT_FILTERS.general;

  try {
    /*
     * --------------------------------------------------------------
     * 1. ENCONTRAR LA ZONA
     * --------------------------------------------------------------
     */

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

    /*
     * --------------------------------------------------------------
     * 2. BUSCAR LUGARES REALES
     * --------------------------------------------------------------
     */

    const elements =
      await searchOpenStreetMap({
        lat: location.lat,
        lon: location.lon,
        filters,
      });

    /*
     * --------------------------------------------------------------
     * 3. CONVERTIR
     * --------------------------------------------------------------
     */

    let places =
      elements
        .map((element) =>
          mapElementToPlace(
            element,
            location
          )
        )
        .filter(Boolean);

    /*
     * --------------------------------------------------------------
     * 4. ELIMINAR DUPLICADOS
     * --------------------------------------------------------------
     */

    places =
      deduplicatePlaces(
        places
      );

    /*
     * --------------------------------------------------------------
     * 5. ORDENAR POR CERCANÍA
     * --------------------------------------------------------------
     */

    places =
      sortByDistance(
        places
      );

    /*
     * Limitamos para no mandar
     * una cantidad enorme al frontend.
     */
    places =
      places.slice(0, 40);

    res.status(200).json({
      city,

      resolvedCity:
        location.label,

      places,
    });
  } catch (err) {
    console.error(
      "OpenStreetMap error:",
      err
    );

    res.status(502).json({
      error:
        "openstreetmap-request-failed",
    });
  }
    }
