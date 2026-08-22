/* ------------------------------------------------------------------ */
/* api/lugares.js                                                     */
/*                                                                    */
/* SALIME - búsqueda de lugares reales                                */
/*                                                                    */
/* Esta versión NO usa Geoapify.                                     */
/* Usa:                                                               */
/*   - Nominatim de OpenStreetMap para geocodificar                    */
/*   - Overpass API para buscar lugares reales                         */
/*                                                                    */
/* REGLA PRINCIPAL:                                                   */
/* Nunca devolver calles, barrios, ciudades o direcciones como        */
/* lugares.                                                           */
/*                                                                    */
/* La búsqueda de lugares se hace directamente sobre etiquetas OSM   */
/* de establecimientos/atracciones.                                  */
/* ------------------------------------------------------------------ */

const NOMINATIM_URL =
  "https://nominatim.openstreetmap.org/search";

const OVERPASS_URL =
  "https://overpass-api.de/api/interpreter";

/*
 * IMPORTANTE:
 * Nominatim exige identificar la aplicación mediante User-Agent.
 */
const USER_AGENT =
  "SALIME/1.0 (aplicacion universitaria)";

/* ------------------------------------------------------------------ */
/* CATEGORÍAS                                                         */
/* ------------------------------------------------------------------ */

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
  ],

  paseo: [
    ["leisure", "park"],
    ["tourism", "attraction"],
    ["tourism", "viewpoint"],
  ],

  aire_libre: [
    ["leisure", "park"],
    ["leisure", "garden"],
    ["tourism", "viewpoint"],
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
    ["leisure", "water_park"],
    ["tourism", "museum"],
    ["tourism", "zoo"],
    ["tourism", "theme_park"],
    ["amenity", "restaurant"],
  ],

  general: [
    ["amenity", "restaurant"],
    ["amenity", "cafe"],
    ["amenity", "bar"],
    ["tourism", "museum"],
    ["leisure", "park"],
    ["tourism", "attraction"],
  ],
};

/* ------------------------------------------------------------------ */
/* UTILIDADES                                                         */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* GEOCODIFICACIÓN                                                     */
/* ------------------------------------------------------------------ */

async function geocodeLocation(text) {
  const query = String(text || "").trim();

  if (!query) {
    return null;
  }

  /*
   * Para evitar que "Güemes" termine resolviendo a otro Güemes
   * del mundo, priorizamos Argentina cuando el usuario no indicó
   * otro país.
   *
   * Para Buenos Aires/Córdoba agregamos Argentina explícitamente.
   */
  let searchQuery = query;

  const normalized = normalizeText(query);

  if (
    normalized === "guemes" ||
    normalized === "nueva cordoba" ||
    normalized === "cordoba" ||
    normalized === "palermo" ||
    normalized.includes("buenos aires") ||
    normalized.includes("cordoba")
  ) {
    searchQuery = `${query}, Argentina`;
  }

  const params = new URLSearchParams({
    q: searchQuery,
    format: "json",
    limit: "10",
    addressdetails: "1",
    "accept-language": "es",
    countrycodes: "ar",
  });

  const res = await fetch(
    `${NOMINATIM_URL}?${params.toString()}`,
    {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    throw new Error("nominatim-geocode-error");
  }

  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  /*
   * Priorizamos resultados argentinos y, especialmente,
   * aquellos que representan barrios/distritos/ciudades.
   */
  const scored = data.map((item) => {
    let score = 0;

    const display = normalizeText(
      item.display_name
    );

    const type = normalizeText(
      item.type
    );

    const category = normalizeText(
      item.class
    );

    if (display.includes("argentina")) {
      score += 100;
    }

    if (
      type === "city" ||
      type === "town" ||
      type === "suburb" ||
      type === "neighbourhood" ||
      type === "district" ||
      type === "municipality"
    ) {
      score += 50;
    }

    if (
      category === "place" ||
      category === "boundary"
    ) {
      score += 20;
    }

    /*
     * Evitamos elegir una calle como centro de búsqueda
     * cuando el usuario escribió un barrio.
     */
    if (
      type === "road" ||
      type === "street"
    ) {
      score -= 100;
    }

    if (
      normalized ===
      normalizeText(item.name)
    ) {
      score += 40;
    }

    return {
      item,
      score,
    };
  });

  scored.sort(
    (a, b) => b.score - a.score
  );

  const best = scored[0]?.item;

  if (
    !best ||
    !best.lat ||
    !best.lon
  ) {
    return null;
  }

  return {
    lat: Number(best.lat),
    lon: Number(best.lon),
    label:
      best.display_name ||
      query,
  };
}

/* ------------------------------------------------------------------ */
/* OVERPASS QUERY                                                      */
/* ------------------------------------------------------------------ */

function buildOverpassQuery(
  lat,
  lon,
  tags,
  radius
) {
  const parts = [];

  for (const [key, value] of tags) {
    const safeKey =
      escapeOverpass(key);

    const safeValue =
      escapeOverpass(value);

    /*
     * Buscamos NODE, WAY y RELATION.
     *
     * Al consultar específicamente tags como:
     * amenity=restaurant
     * amenity=bar
     * tourism=museum
     * leisure=park
     *
     * una calle normal como Darregueira no entra.
     */

    parts.push(
      `nwr["${safeKey}"="${safeValue}"](around:${radius},${lat},${lon});`
    );
  }

  return `
[out:json][timeout:25];
(
  ${parts.join("\n")}
);
out center tags;
`;
}

/* ------------------------------------------------------------------ */
/* BÚSQUEDA DE LUGARES                                                 */
/* ------------------------------------------------------------------ */

async function searchPlaces({
  lat,
  lon,
  intent,
  limit = 40,
}) {
  const tags =
    INTENT_TAGS[intent] ||
    INTENT_TAGS.general;

  const query =
    buildOverpassQuery(
      lat,
      lon,
      tags,
      15000
    );

  const res = await fetch(
    OVERPASS_URL,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
        "User-Agent":
          USER_AGENT,
      },
      body:
        `data=${encodeURIComponent(query)}`,
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
      "overpass-places-error"
    );
  }

  const data =
    await res.json();

  const elements =
    Array.isArray(data.elements)
      ? data.elements
      : [];

  return elements.slice(
    0,
    limit
  );
}

/* ------------------------------------------------------------------ */
/* DISTANCIA                                                           */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* CATEGORÍAS                                                          */
/* ------------------------------------------------------------------ */

function getTags(element) {
  return element &&
    element.tags &&
    typeof element.tags === "object"
    ? element.tags
    : {};
}

function matchesIntent(
  element,
  intent
) {
  const tags =
    getTags(element);

  const allowed =
    INTENT_TAGS[intent] ||
    INTENT_TAGS.general;

  return allowed.some(
    ([key, value]) =>
      tags[key] === value
  );
}

/* ------------------------------------------------------------------ */
/* FILTRO CRÍTICO: NUNCA CALLES                                        */
/* ------------------------------------------------------------------ */

function isStreetOrAddress(
  element
) {
  const tags =
    getTags(element);

  /*
   * Si OSM dice highway, es una vía/calle.
   *
   * Esto elimina directamente:
   * Darregueira
   * Obispo Oro
   * Cantero
   * etc.
   */
  if (tags.highway) {
    return true;
  }

  /*
   * Otros elementos que no queremos como
   * establecimientos.
   */
  if (
    tags.place === "city" ||
    tags.place === "town" ||
    tags.place === "village" ||
    tags.place === "suburb" ||
    tags.place === "neighbourhood" ||
    tags.place === "district"
  ) {
    return true;
  }

  /*
   * Una dirección aislada tampoco es un lugar.
   */
  if (
    tags.addr &&
    !tags.amenity &&
    !tags.tourism &&
    !tags.leisure
  ) {
    return true;
  }

  return false;
}

/* ------------------------------------------------------------------ */
/* NOMBRE REAL                                                         */
/* ------------------------------------------------------------------ */

function getRealName(element) {
  const tags =
    getTags(element);

  /*
   * name es el nombre principal de OSM.
   *
   * NO usamos:
   * addr:street
   * addr:housenumber
   * display_name
   *
   * como nombre del lugar.
   */
  const name =
    String(tags.name || "")
      .trim();

  if (!name) {
    return null;
  }

  /*
   * Nunca devolver solamente números.
   */
  if (
    /^\d+$/.test(name)
  ) {
    return null;
  }

  return name;
}

/* ------------------------------------------------------------------ */
/* DIRECCIÓN                                                           */
/* ------------------------------------------------------------------ */

function cleanAddress(tags) {
  const street =
    String(
      tags["addr:street"] || ""
    ).trim();

  const number =
    String(
      tags["addr:housenumber"] || ""
    ).trim();

  const postcode =
    String(
      tags["addr:postcode"] || ""
    ).trim();

  const city =
    String(
      tags["addr:city"] || ""
    ).trim();

  const parts = [];

  if (street) {
    parts.push(
      number
        ? `${street} ${number}`
        : street
    );
  }

  if (city) {
    parts.push(city);
  }

  if (postcode) {
    parts.push(postcode);
  }

  return parts.length
    ? parts.join(", ")
    : null;
}

/* ------------------------------------------------------------------ */
/* EMOJIS                                                              */
/* ------------------------------------------------------------------ */

function emojiForTags(tags) {
  const amenity =
    tags.amenity;

  const tourism =
    tags.tourism;

  const leisure =
    tags.leisure;

  if (
    amenity ===
    "fast_food"
  ) {
    return "🍔";
  }

  if (
    amenity ===
    "restaurant"
  ) {
    return "🍽️";
  }

  if (
    amenity ===
    "cafe"
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
    amenity ===
    "nightclub"
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
    amenity ===
      "arts_centre"
  ) {
    return "🎭";
  }

  if (
    leisure === "park" ||
    leisure === "garden"
  ) {
    return "🌳";
  }

  if (
    tourism ===
    "viewpoint"
  ) {
    return "✨";
  }

  if (
    tourism ===
    "attraction"
  ) {
    return "📍";
  }

  if (
    leisure ===
    "playground"
  ) {
    return "🎡";
  }

  return "📍";
}

/* ------------------------------------------------------------------ */
/* PRECIO                                                              */
/* ------------------------------------------------------------------ */

function estimatePrice(tags) {
  const amenity =
    tags.amenity;

  const tourism =
    tags.tourism;

  const leisure =
    tags.leisure;

  if (
    amenity ===
    "fast_food"
  ) {
    return 1;
  }

  if (
    amenity === "cafe" ||
    leisure === "park" ||
    leisure === "garden" ||
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
    tourism === "museum" ||
    tourism === "gallery" ||
    amenity === "theatre"
  ) {
    return 2;
  }

  return 2;
}

/* ------------------------------------------------------------------ */
/* MOOD                                                                */
/* ------------------------------------------------------------------ */

function estimateMood(tags) {
  if (
    tags.amenity ===
      "nightclub" ||
    tags.amenity === "bar" ||
    tags.amenity === "pub"
  ) {
    return ["animado"];
  }

  return ["tranquilo"];
}

/* ------------------------------------------------------------------ */
/* OUTDOOR                                                             */
/* ------------------------------------------------------------------ */

function estimateOutdoor(tags) {
  return (
    tags.leisure ===
      "park" ||
    tags.leisure ===
      "garden" ||
    tags.leisure ===
      "playground" ||
    tags.tourism ===
      "viewpoint" ||
    tags.natural ===
      "water" ||
    tags.natural ===
      "wood"
  );
}

/* ------------------------------------------------------------------ */
/* NIÑOS                                                               */
/* ------------------------------------------------------------------ */

function estimateKidFriendly(
  tags
) {
  if (
    tags.amenity ===
      "nightclub" ||
    tags.amenity === "bar" ||
    tags.amenity === "pub"
  ) {
    return false;
  }

  return true;
}

/* ------------------------------------------------------------------ */
/* HORARIOS                                                            */
/* ------------------------------------------------------------------ */

function estimateSlots(tags) {
  if (
    tags.amenity ===
    "nightclub"
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

/* ------------------------------------------------------------------ */
/* CONVERSIÓN                                                          */
/* ------------------------------------------------------------------ */

function mapElementToVenue(
  element,
  center
) {
  const tags =
    getTags(element);

  const name =
    getRealName(element);

  if (!name) {
    return null;
  }

  let lat = null;
  let lon = null;

  if (
    element.type ===
      "node" &&
    typeof element.lat ===
      "number" &&
    typeof element.lon ===
      "number"
  ) {
    lat = element.lat;
    lon = element.lon;
  }

  if (
    (element.type ===
      "way" ||
      element.type ===
        "relation") &&
    element.center
  ) {
    lat =
      Number(
        element.center.lat
      );

    lon =
      Number(
        element.center.lon
      );
  }

  if (
    typeof lat !==
      "number" ||
    typeof lon !==
      "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
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
        (distKm / 4.5) *
          60
      )
    );

  const hours =
    tags.opening_hours
      ? parseSimpleHours(
          tags.opening_hours
        )
      : null;

  return {
    name,
    emoji:
      emojiForTags(tags),

    price:
      estimatePrice(tags),

    rating: 4.2,

    dist:
      distMin,

    mood:
      estimateMood(tags),

    outdoor:
      estimateOutdoor(tags),

    kidFriendly:
      estimateKidFriendly(
        tags
      ),

    nightOnly:
      tags.amenity ===
      "nightclub",

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
    ].filter(Boolean),

    source:
      "openstreetmap",
  };
}

/* ------------------------------------------------------------------ */
/* HORARIOS SIMPLES                                                    */
/* ------------------------------------------------------------------ */

function parseSimpleHours(
  raw
) {
  if (
    !raw ||
    typeof raw !==
      "string"
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

/* ------------------------------------------------------------------ */
/* HANDLER                                                             */
/* ------------------------------------------------------------------ */

export default async function handler(
  req,
  res
) {
  if (
    req.method !==
    "POST"
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
    INTENT_TAGS[intent]
      ? intent
      : "general";

  try {
    /*
     * 1. Convertimos la ubicación
     *    en coordenadas.
     */
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

    /*
     * 2. Buscamos exclusivamente
     *    objetos OSM etiquetados
     *    como lugares.
     */
    const elements =
      await searchPlaces({
        lat:
          location.lat,

        lon:
          location.lon,

        intent:
          normalizedIntent,

        limit: 60,
      });

    const seen =
      new Set();

    const places =
      elements

        /*
         * Debe pertenecer
         * realmente al intent.
         */
        .filter(
          (element) =>
            matchesIntent(
              element,
              normalizedIntent
            )
        )

        /*
         * FILTRO MÁS IMPORTANTE:
         * nunca calles,
         * barrios o ciudades.
         */
        .filter(
          (element) =>
            !isStreetOrAddress(
              element
            )
        )

        /*
         * Debe tener nombre real.
         */
        .filter(
          (element) =>
            !!getRealName(
              element
            )
        )

        /*
         * Convertimos al formato
         * que ya espera el frontend.
         */
        .map(
          (element) =>
            mapElementToVenue(
              element,
              location
            )
        )

        .filter(Boolean)

        /*
         * Duplicados.
         */
        .filter((place) => {
          const key =
            normalizeText(
              place.name
            ) +
            "|" +
            normalizeText(
              place.address ||
                ""
            );

          if (
            seen.has(key)
          ) {
            return false;
          }

          seen.add(key);

          return true;
        })

        /*
         * Más cercanos primero.
         */
        .sort(
          (a, b) =>
            a.dist - b.dist
        )

        /*
         * El frontend recibe
         * como máximo 20.
         */
        .slice(0, 20);

    res.status(200).json({
      city,

      resolvedCity:
        location.label,

      places,
    });
  } catch (err) {
    console.error(
      "OpenStreetMap / Overpass error:",
      err
    );

    res.status(502).json({
      error:
        "places-request-failed",
    });
  }
    }
