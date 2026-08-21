
const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY;

const INTENT_CATEGORIES = {
  comer: [
    "catering.restaurant",
    "catering.fast_food",
    "catering.food_court"
  ],

  beber: [
    "catering.cafe",
    "catering.bar",
    "catering.pub"
  ],

  cultura: [
    "entertainment.museum",
    "entertainment.culture.gallery",
    "entertainment.culture.theatre",
    "entertainment.culture.arts_centre"
  ],

  paseo: [
    "leisure.park",
    "tourism.attraction.viewpoint",
    "natural"
  ],

  aire_libre: [
    "leisure.park",
    "natural",
    "natural.water"
  ],

  fiesta: [
    "entertainment.nightclub",
    "catering.bar",
    "catering.pub"
  ],

  familia: [
    "leisure.playground",
    "entertainment.activity_park",
    "entertainment.museum",
    "catering.restaurant"
  ]
};

function estimatePrice(categories) {
  const cats = categories || [];

  if (cats.some(c => c.includes("fast_food"))) return 1;
  if (cats.some(c => c.includes("cafe"))) return 1;
  if (cats.some(c => c.includes("playground") || c.includes("park") || c.includes("natural"))) return 1;
  if (cats.some(c => c.includes("nightclub"))) return 3;
  if (cats.some(c => c.includes("museum") || c.includes("culture"))) return 2;
  if (cats.some(c => c.includes("bar") || c.includes("pub"))) return 2;
  if (cats.some(c => c.includes("restaurant"))) return 2;

  return 2;
}

function estimateMood(categories) {
  const cats = categories || [];

  if (cats.some(c =>
    c.includes("nightclub") ||
    c.includes("bar") ||
    c.includes("pub")
  )) {
    return ["animado"];
  }

  return ["tranquilo"];
}

function estimateOutdoor(categories) {
  const cats = categories || [];

  return cats.some(c =>
    c.includes("park") ||
    c.includes("natural") ||
    c.includes("water") ||
    c.includes("viewpoint")
  );
}

function estimateKidFriendly(categories) {
  const cats = categories || [];

  if (cats.some(c =>
    c.includes("bar") ||
    c.includes("pub") ||
    c.includes("nightclub")
  )) {
    return false;
  }

  return true;
}

function estimateNightOnly(categories) {
  return (categories || []).some(c => c.includes("nightclub"));
}

function estimateSlots(categories) {
  const cats = categories || [];

  if (cats.some(c => c.includes("nightclub"))) {
    return ["night"];
  }

  if (cats.some(c =>
    c.includes("bar") ||
    c.includes("pub")
  )) {
    return ["afternoon", "night"];
  }

  return ["morning", "afternoon", "night"];
}

function emojiFor(categories) {
  const cats = categories || [];

  if (cats.some(c => c.includes("fast_food"))) return "🍔";
  if (cats.some(c => c.includes("restaurant"))) return "🍽️";
  if (cats.some(c => c.includes("cafe"))) return "☕";
  if (cats.some(c => c.includes("bar") || c.includes("pub"))) return "🍺";
  if (cats.some(c => c.includes("nightclub"))) return "🎉";
  if (cats.some(c => c.includes("museum") || c.includes("culture"))) return "🖼️";
  if (cats.some(c => c.includes("park"))) return "🌳";
  if (cats.some(c => c.includes("natural") || c.includes("water"))) return "🌿";
  if (cats.some(c => c.includes("viewpoint"))) return "✨";
  if (cats.some(c => c.includes("playground") || c.includes("activity_park"))) return "🎡";

  return "📍";
}

function parseSimpleHours(raw) {
  if (!raw || typeof raw !== "string") return null;

  const match = raw.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);

  if (!match) return null;

  return [match[1], match[2]];
}

async function geocodeLocation(text) {
  const url =
    "https://api.geoapify.com/v1/geocode/search" +
    `?text=${encodeURIComponent(text)}` +
    "&type=locality" +
    "&limit=10" +
    "&format=json" +
    `&apiKey=${GEOAPIFY_KEY}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("geoapify-geocode-error");
  }

  const data = await res.json();
  const results = Array.isArray(data.results) ? data.results : [];

  if (results.length === 0) {
    return null;
  }

  const wanted = text.trim().toLowerCase();

  const exact = results.find(r => {
    const candidates = [
      r.name,
      r.city,
      r.district,
      r.suburb,
      r.neighbourhood,
      r.formatted
    ]
      .filter(Boolean)
      .map(v => String(v).toLowerCase());

    return candidates.some(v =>
      v === wanted || v.includes(wanted)
    );
  });

  const first = exact || results[0];

  if (
    typeof first.lat !== "number" ||
    typeof first.lon !== "number"
  ) {
    return null;
  }

  return {
    lat: first.lat,
    lon: first.lon,
    label: first.formatted || text,
    placeId: first.place_id || null
  };
}

async function searchPlaces({
  lat,
  lon,
  placeId,
  categories,
  limit = 40
}) {
  const params = new URLSearchParams({
    categories: categories.join(","),
    limit: String(limit),
    bias: `proximity:${lon},${lat}`,
    apiKey: GEOAPIFY_KEY
  });

  if (placeId) {
    params.set("filter", `place:${placeId}`);
  } else {
    params.set("filter", `circle:${lon},${lat},15000`);
  }

  const url =
    `https://api.geoapify.com/v2/places?${params.toString()}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("geoapify-places-error");
  }

  const data = await res.json();

  return Array.isArray(data.features)
    ? data.features
    : [];
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

  return R * 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );
}

function cleanAddress(props) {
  const street = [
    props.street,
    props.housenumber
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const area = [
    props.suburb || props.neighbourhood || props.district,
    props.city,
    props.state
  ]
    .filter(Boolean)
    .join(", ")
    .trim();

  if (street && area) {
    return `${street}, ${area}`;
  }

  if (street) {
    return street;
  }

  if (area) {
    return area;
  }

  if (props.formatted) {
    return String(props.formatted);
  }

  return null;
}

function mapFeatureToVenue(feature, center) {
  const props = feature.properties || {};

  const categories = Array.isArray(props.categories)
    ? props.categories
    : [];

  const coords =
    feature.geometry &&
    Array.isArray(feature.geometry.coordinates)
      ? feature.geometry.coordinates
      : [null, null];

  const [lon, lat] = coords;

  const distKm =
    typeof lat === "number" &&
    typeof lon === "number"
      ? haversineKm(
          center.lat,
          center.lon,
          lat,
          lon
        )
      : null;

  const name = props.name;

  // Si Geoapify no devuelve nombre real, descartamos el resultado.
  if (!name || !String(name).trim()) {
    return null;
  }

  const hours = parseSimpleHours(
    props.opening_hours
  );

  const distMin =
    distKm != null
      ? Math.max(
          1,
          Math.round((distKm / 4.5) * 60)
        )
      : 10;

  return {
    name: String(name).trim(),
    emoji: emojiFor(categories),
    price: estimatePrice(categories),
    rating: null,
    dist: distMin,
    mood: estimateMood(categories),
    outdoor: estimateOutdoor(categories),
    kidFriendly: estimateKidFriendly(categories),
    nightOnly: estimateNightOnly(categories),
    slots: estimateSlots(categories),
    why: null,
    address: cleanAddress(props),
    hours,
    source: "geoapify"
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({
      places: [],
      error: "method-not-allowed"
    });

    return;
  }

  if (!GEOAPIFY_KEY) {
    res.status(500).json({
      places: [],
      error: "missing-geoapify-key"
    });

    return;
  }

  const { city, intent } = req.body || {};

  if (
    !city ||
    typeof city !== "string" ||
    !city.trim()
  ) {
    res.status(200).json({
      places: [],
      error: "missing-city"
    });

    return;
  }

  const categories = INTENT_CATEGORIES[intent];

  // Si la intención no existe, NO hacemos una búsqueda general.
  // Así evitamos que "cultura", por ejemplo, termine en lugares
  // que no corresponden a esa intención.
  if (!categories) {
    res.status(200).json({
      city,
      resolvedCity: null,
      places: []
    });

    return;
  }

  try {
    const location = await geocodeLocation(
      city.trim()
    );

    // Sin ubicación válida: cero resultados.
    // Nunca usamos datos ficticios.
    if (!location) {
      res.status(200).json({
        city,
        resolvedCity: null,
        places: []
      });

      return;
    }

    const features = await searchPlaces({
      lat: location.lat,
      lon: location.lon,
      placeId: location.placeId,
      categories
    });

    const seen = new Set();

    const places = features
      .map(feature =>
        mapFeatureToVenue(
          feature,
          location
        )
      )
      .filter(Boolean)
      .filter(place => {
        const key =
          `${place.name}|${place.address || ""}`
            .toLowerCase();

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });

    res.status(200).json({
      city,
      resolvedCity: location.label,
      places
    });

  } catch (err) {
    // Error de Geoapify o internet:
    // devolvemos vacío. Nunca inventamos.
    res.status(200).json({
      city,
      resolvedCity: null,
      places: []
    });
  }
                }
