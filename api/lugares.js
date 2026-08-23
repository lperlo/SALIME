/* api/lugares.js - lugares reales con OpenStreetMap + Overpass */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

const INTENT_CATEGORIES = {
  comer: ["restaurant", "fast_food", "cafe", "food_court"],
  beber: ["cafe", "bar", "pub"],
  cultura: ["theatre", "arts_centre", "museum", "gallery"],
  paseo: ["park"],
  aire_libre: ["park", "nature_reserve"],
  fiesta: ["nightclub", "bar", "pub"],
  familia: ["restaurant", "cafe", "playground", "museum", "arts_centre"],
  general: ["restaurant", "cafe", "bar", "pub", "museum", "park"],
};

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

  cordoba: {
    lat: -31.42008,
    lon: -64.18878,
    label: "Córdoba, Argentina",
  },
};

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function parseSimpleHours(raw) {
  if (!raw || typeof raw !== "string") return null;

  const match = raw.match(
    /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/
  );

  return match ? [match[1], match[2]] : null;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

async function geocodeLocation(text) {
  const query = normalizeText(text)
    .replace(/\b(barrio|zona|sector)\b/g, "")
    .trim();

  if (!query) return null;

  if (KNOWN_LOCATIONS[query]) {
    return {
      ...KNOWN_LOCATIONS[query],
      placeId: null,
    };
  }

  const url =
    `${NOMINATIM_URL}?format=jsonv2&limit=5` +
    `&countrycodes=ar&q=${encodeURIComponent(
      `${text}, Córdoba, Argentina`
    )}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "SALIME/1.0 (place-search prototype)",
    },
  });

  if (!res.ok) {
    throw new Error(`nominatim-${res.status}`);
  }

  const data = await res.json();

  if (!Array.isArray(data) || !data.length) {
    return null;
  }

  const wanted = normalizeText(text);

  const scored = data
    .map((r) => {
      const fields = [
        r.name,
        r.display_name,
        r.type,
        r.class,
      ].map(normalizeText);

      let score = 0;

      if (fields.some((x) => x === wanted)) {
        score += 100;
      }

      if (fields.some((x) => x.includes(wanted))) {
        score += 40;
      }

      if (
        normalizeText(r.display_name).includes("cordoba")
      ) {
        score += 20;
      }

      if (
        [
          "suburb",
          "neighbourhood",
          "quarter",
          "city",
          "town",
          "village",
        ].includes(normalizeText(r.type))
      ) {
        score += 15;
      }

      return {
        r,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);

  const r = scored[0]?.r;

  if (
    !r ||
    !Number.isFinite(Number(r.lat)) ||
    !Number.isFinite(Number(r.lon))
  ) {
    return null;
  }

  return {
    lat: Number(r.lat),
    lon: Number(r.lon),
    label: r.display_name || text,
  };
}

function overpassAmenityRegex(amenities) {
  return amenities
    .map((x) =>
      x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    )
    .join("|");
}

async function searchPlaces({
  lat,
  lon,
  amenities,
  radius = 1800,
}) {
  const regex = overpassAmenityRegex(amenities);

  const query =
    `[out:json][timeout:25];` +
    `nwr["amenity"~"^(${regex})$"]` +
    `(around:${radius},${lat},${lon});` +
    `out center tags;`;

  const res = await fetch(OVERPASS_URL, {
    method: "POST",

    headers: {
      "Content-Type":
        "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent":
        "SALIME/1.0 (place-search prototype)",
    },

    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    throw new Error(`overpass-${res.status}`);
  }

  const data = await res.json();

  return Array.isArray(data.elements)
    ? data.elements
    : [];
}

function getCoords(element) {
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
    Number.isFinite(element.center.lat) &&
    Number.isFinite(element.center.lon)
  ) {
    return [
      element.center.lat,
      element.center.lon,
    ];
  }

  return [null, null];
}

function mapElementToVenue(
  element,
  center,
  intent
) {
  const tags = element?.tags || {};

  const name = String(
    tags.name ||
      tags["name:es"] ||
      ""
  ).trim();

  if (!name) {
    return null;
  }

  const [lat, lon] = getCoords(element);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return null;
  }

  const amenity = normalizeText(
    tags.amenity
  );

  const distKm = haversineKm(
    center.lat,
    center.lon,
    lat,
    lon
  );

  /*
   * Para COMER NO aceptamos bares o pubs genéricos.
   *
   * Solamente:
   * restaurant
   * fast_food
   * cafe
   * food_court
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

  const emoji =
    amenity === "fast_food"
      ? "🍔"
      : amenity === "cafe"
      ? "☕"
      : amenity === "bar" ||
        amenity === "pub"
      ? "🍺"
      : amenity === "nightclub"
      ? "🎉"
      : "🍽️";

  const address = [
    tags["addr:street"],
    tags["addr:housenumber"],
  ]
    .filter(Boolean)
    .join(" ") || null;

  return {
    name,

    emoji,

    price:
      amenity === "fast_food" ||
      amenity === "cafe"
        ? 1
        : 2,

    rating: null,

    dist: Math.max(
      1,
      Math.round(
        (distKm / 4.5) * 60
      )
    ),

    mood: [
      amenity === "nightclub" ||
      amenity === "bar" ||
      amenity === "pub"
        ? "animado"
        : "tranquilo",
    ],

    outdoor: false,

    kidFriendly:
      ![
        "bar",
        "pub",
        "nightclub",
      ].includes(amenity),

    nightOnly:
      amenity === "nightclub",

    slots:
      amenity === "nightclub"
        ? ["night"]
        : amenity === "bar" ||
          amenity === "pub"
        ? ["afternoon", "night"]
        : [
            "morning",
            "afternoon",
            "night",
          ],

    why: null,

    address,

    hours: parseSimpleHours(
      tags.opening_hours
    ),

    categories: [
      `amenity.${amenity}`,
    ],

    source: "openstreetmap",

    sourceUrl:
      `https://www.openstreetmap.org/` +
      `${element.type}/${element.id}`,
  };
}

export default async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({
        error: "method-not-allowed",
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
        error: "missing-city",
      });
  }

  const normalizedIntent =
    normalizeText(intent);

  const amenities =
    INTENT_CATEGORIES[
      normalizedIntent
    ] ||
    INTENT_CATEGORIES.general;

  try {
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
          source: "openstreetmap",
        });
    }

    const elements =
      await searchPlaces({
        lat: location.lat,
        lon: location.lon,
        amenities,
      });

    const seen = new Set();

    const places = elements
      .map((element) =>
        mapElementToVenue(
          element,
          location,
          normalizedIntent
        )
      )
      .filter(Boolean)
      .sort(
        (a, b) => a.dist - b.dist
      )
      .filter((place) => {
        const key =
          `${normalizeText(place.name)}|` +
          `${normalizeText(place.address)}`;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);

        return true;
      })
      .slice(0, 20);

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
  } catch (err) {
    console.error(
      "OpenStreetMap/Overpass error:",
      err
    );

    return res
      .status(502)
      .json({
        error:
          "places-request-failed",
        source:
          "openstreetmap",
      });
  }
}

export {
  INTENT_CATEGORIES,
  normalizeText,
  mapElementToVenue,
};
