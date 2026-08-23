const GEOAPIFY_URL = "https://api.geoapify.com";

const CATEGORY_GROUPS = {
  cena: "catering.restaurant",
  bebida: "catering.bar,catering.cafe,catering.pub",
  final: "catering.cafe,catering.ice_cream",
  paseo: "leisure.park,tourism.attraction,tourism.sights",
  cultura: "entertainment.culture,entertainment.museum",
  aire_libre: "leisure.park,leisure.picnic,tourism.attraction.viewpoint",
  fiesta: "entertainment,adult.nightclub",
  merienda: "catering.cafe,catering.ice_cream",
  actividad_familia: "leisure.playground,entertainment.activity_park",
  cierre_familia: "leisure.park,catering.cafe",
};

const WHY = {
  cena: "una opción gastronómica real cerca de tu ubicación",
  bebida: "un lugar real para tomar algo cerca de tu ubicación",
  final: "un lugar real para cerrar el plan",
  paseo: "un lugar real para pasear o conocer la zona",
  cultura: "una propuesta cultural real en la ciudad",
  aire_libre: "un espacio real al aire libre",
  fiesta: "una opción real de entretenimiento para la noche",
  merienda: "un lugar real para hacer una pausa",
  actividad_familia: "una actividad real apta para disfrutar en familia",
  cierre_familia: "un lugar real para cerrar el plan en familia",
};

function uniqueById(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = item.place_id || `${item.name}|${item.formatted}`;

    if (!key || seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function normalizePlace(properties, key) {
  const distanceMeters = Number(properties.distance);

  const dist = Number.isFinite(distanceMeters)
    ? Math.max(1, Math.round(distanceMeters / 80))
    : 1;

  return {
    name:
      properties.name ||
      properties.address_line1 ||
      properties.formatted ||
      "Lugar real",

    emoji:
      key === "cena"
        ? "🍽️"
        : key === "bebida"
        ? "🍹"
        : key === "cultura"
        ? "🎭"
        : key === "aire_libre" || key === "paseo"
        ? "🌿"
        : "📍",

    rating: null,
    price: null,
    dist,
    mood: [],

    outdoor: ["aire_libre", "paseo"].includes(key),

    kidFriendly: [
      "actividad_familia",
      "merienda",
      "cierre_familia",
    ].includes(key),

    nightOnly: false,

    slots: ["morning", "afternoon", "night"],

    why:
      WHY[key] ||
      "una opción real encontrada en la zona",

    real: true,

    address:
      properties.formatted ||
      [
        properties.street,
        properties.housenumber,
        properties.city,
      ]
        .filter(Boolean)
        .join(" "),

    placeId: properties.place_id || null,

    lat: properties.lat,
    lon: properties.lon,

    categories: properties.categories || [],
  };
}

async function geocode(location, apiKey) {
  const url = new URL(
    `${GEOAPIFY_URL}/v1/geocode/search`
  );

  url.searchParams.set("text", location);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("apiKey", apiKey);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`geocode-${response.status}`);
  }

  const data = await response.json();

  const result = data.results?.[0];

  if (
    !result ||
    result.lat == null ||
    result.lon == null
  ) {
    throw new Error("location-not-found");
  }

  return result;
}

async function searchPlaces(
  categories,
  lat,
  lon,
  apiKey
) {
  const url = new URL(
    `${GEOAPIFY_URL}/v2/places`
  );

  url.searchParams.set(
    "categories",
    categories
  );

  url.searchParams.set(
    "filter",
    `circle:${lon},${lat},10000`
  );

  url.searchParams.set(
    "bias",
    `proximity:${lon},${lat}`
  );

  url.searchParams.set("limit", "30");
  url.searchParams.set("lang", "es");
  url.searchParams.set("apiKey", apiKey);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`places-${response.status}`);
  }

  const data = await response.json();

  return (data.features || []).map(
    (feature) => feature.properties || {}
  );
}

function selectPool(
  properties,
  key,
  max = 12
) {
  return uniqueById(properties)
    .filter(
      (p) => p.name || p.formatted
    )
    .slice(0, max)
    .map((p) =>
      normalizePlace(p, key)
    );
}

export default async function handler(req, res) {
  try {
    const apiKey =
      process.env.GEOAPIFY_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error:
          "GEOAPIFY_API_KEY_MISSING",
      });
    }

    const location = String(
      req.query?.location || ""
    ).trim();

    if (!location) {
      return res.status(400).json({
        error: "LOCATION_REQUIRED",
      });
    }

    const intent = String(
      req.query?.intent || "general"
    );

    const center = await geocode(
      location,
      apiKey
    );

    const searches = await Promise.all(
      [
        ["cena", CATEGORY_GROUPS.cena],
        ["bebida", CATEGORY_GROUPS.bebida],
        ["final", CATEGORY_GROUPS.final],
        ["paseo", CATEGORY_GROUPS.paseo],
        ["cultura", CATEGORY_GROUPS.cultura],
        [
          "aire_libre",
          CATEGORY_GROUPS.aire_libre,
        ],
        ["fiesta", CATEGORY_GROUPS.fiesta],
        [
          "merienda",
          CATEGORY_GROUPS.merienda,
        ],
        [
          "actividad_familia",
          CATEGORY_GROUPS.actividad_familia,
        ],
        [
          "cierre_familia",
          CATEGORY_GROUPS.cierre_familia,
        ],
      ].map(
        async ([key, categories]) => {
          const places =
            await searchPlaces(
              categories,
              center.lat,
              center.lon,
              apiKey
            );

          return [
            key,
            selectPool(
              places,
              key
            ),
          ];
        }
      )
    );

    const
