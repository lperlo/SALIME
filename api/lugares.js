/* ------------------------------------------------------------------ */
/* api/lugares.js                                                     */
/*                                                                    */
/* Busca lugares REALES usando Gemini (IA) en vez de Geoapify.        */
/*                                                                    */
/* Reglas de la versión final:                                        */
/* - La API key vive únicamente en Vercel: GEMINI_API_KEY              */
/* - Nunca inventa lugares: se le pide explícitamente a Gemini que     */
/*   solo devuelva lugares reales, y que devuelva menos si no está     */
/*   seguro, en vez de inventar.                                       */
/* - Si no encuentra resultados devuelve places: [].                   */
/* - No depende de api/interpretar.js.                                 */
/* ------------------------------------------------------------------ */

const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Si este modelo no está habilitado para tu key, se puede cambiar acá
// sin tocar el resto del archivo.
const GEMINI_MODEL = "gemini-2.0-flash";

const INTENT_CATEGORIES = {
  comer: [
    "catering.restaurant",
    "catering.fast_food",
    "catering.food_court",
  ],
  beber: [
    "catering.cafe",
    "catering.bar",
    "catering.pub",
  ],
  cultura: [
    "entertainment.museum",
    "entertainment.culture.gallery",
    "entertainment.culture.theatre",
    "entertainment.culture.arts_centre",
  ],
  paseo: [
    "leisure.park",
    "tourism.attraction.viewpoint",
    "natural",
  ],
  aire_libre: [
    "leisure.park",
    "natural",
    "natural.water",
  ],
  fiesta: [
    "entertainment.nightclub",
    "catering.bar",
    "catering.pub",
  ],
  familia: [
    "leisure.playground",
    "entertainment.activity_park",
    "entertainment.museum",
    "catering.restaurant",
  ],
  general: [
    "catering.restaurant",
    "catering.cafe",
    "entertainment.museum",
    "leisure.park",
  ],
};

function estimatePrice(categories) {
  const cats = categories || [];

  if (cats.some((c) => c.includes("fast_food"))) return 1;
  if (cats.some((c) => c.includes("cafe"))) return 1;
  if (cats.some((c) => c.includes("playground") || c.includes("park") || c.includes("natural"))) return 1;
  if (cats.some((c) => c.includes("nightclub"))) return 3;
  if (cats.some((c) => c.includes("museum") || c.includes("culture"))) return 2;
  if (cats.some((c) => c.includes("bar") || c.includes("pub"))) return 2;
  if (cats.some((c) => c.includes("restaurant"))) return 2;

  return 2;
}

function estimateMood(categories) {
  const cats = categories || [];

  if (cats.some((c) => c.includes("nightclub") || c.includes("bar") || c.includes("pub"))) {
    return ["animado"];
  }

  if (
    cats.some(
      (c) =>
        c.includes("cafe") ||
        c.includes("museum") ||
        c.includes("culture") ||
        c.includes("park") ||
        c.includes("natural") ||
        c.includes("playground")
    )
  ) {
    return ["tranquilo"];
  }

  return ["tranquilo"];
}

function estimateOutdoor(categories) {
  const cats = categories || [];
  return cats.some(
    (c) =>
      c.includes("park") ||
      c.includes("natural") ||
      c.includes("water") ||
      c.includes("viewpoint")
  );
}

function estimateKidFriendly(categories) {
  const cats = categories || [];
  if (cats.some((c) => c.includes("bar") || c.includes("pub") || c.includes("nightclub"))) {
    return false;
  }
  return true;
}

function estimateNightOnly(categories) {
  const cats = categories || [];
  return cats.some((c) => c.includes("nightclub"));
}

function estimateSlots(categories) {
  const cats = categories || [];

  if (cats.some((c) => c.includes("nightclub"))) return ["night"];
  if (cats.some((c) => c.includes("bar") || c.includes("pub"))) {
    return ["afternoon", "night"];
  }

  return ["morning", "afternoon", "night"];
}

function emojiFor(categories) {
  const cats = categories || [];
  if (cats.some((c) => c.includes("fast_food"))) return "🍔";
  if (cats.some((c) => c.includes("restaurant"))) return "🍽️";
  if (cats.some((c) => c.includes("cafe"))) return "☕";
  if (cats.some((c) => c.includes("bar") || c.includes("pub"))) return "🍺";
  if (cats.some((c) => c.includes("nightclub"))) return "🎉";
  if (cats.some((c) => c.includes("museum") || c.includes("culture"))) return "🖼️";
  if (cats.some((c) => c.includes("park"))) return "🌳";
  if (cats.some((c) => c.includes("natural") || c.includes("water"))) return "🌿";
  if (cats.some((c) => c.includes("viewpoint"))) return "✨";
  if (cats.some((c) => c.includes("playground") || c.includes("activity_park"))) return "🎡";
  return "📍";
}

/* ------------------------------------------------------------------ */
/* Gemini: pedirle lugares reales                                     */
/* ------------------------------------------------------------------ */

function buildPrompt({ city, intent, allowedCategories }) {
  return `Sos un asistente que conoce lugares reales y actualmente existentes en Argentina.

Ciudad/zona pedida por el usuario: "${city}"
Intención del usuario: "${intent}"

Categorías permitidas (elegí UNA por lugar, tal cual está escrita):
${allowedCategories.map((c) => `- ${c}`).join("\n")}

Reglas obligatorias:
1. Devolvé SOLO lugares reales que existan hoy en esa ciudad o zona. Si no estás
   seguro de que un lugar existe realmente, no lo incluyas.
2. Es preferible devolver menos lugares (incluso 2 o 3) a inventar uno.
3. No repitas siempre los mismos lugares típicos: variá la selección dentro de
   la zona pedida.
4. Todos los lugares deben estar dentro de "${city}" o su zona inmediata, no en
   otra parte de la ciudad.
5. Respondé ÚNICAMENTE con un JSON válido, sin texto adicional, sin markdown,
   con esta forma exacta:

{
  "resolvedCity": "nombre de la ciudad/zona interpretada",
  "places": [
    { "name": "...", "address": "calle y altura o zona conocida", "category": "una de las categorías permitidas" }
  ]
}

Devolvé entre 4 y 8 lugares si podés garantizar que son reales.`;
}

async function askGeminiForPlaces({ city, intent }) {
  const allowedCategories = INTENT_CATEGORIES[intent] || INTENT_CATEGORIES.general;
  const prompt = buildPrompt({ city, intent, allowedCategories });

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent` +
    `?key=${GEMINI_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) throw new Error("gemini-request-error");

  const data = await res.json();
  const rawText =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;

  if (!rawText) return { resolvedCity: null, places: [] };

  const cleaned = String(rawText)
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return { resolvedCity: null, places: [] };
  }

  const places = Array.isArray(parsed.places) ? parsed.places : [];
  const resolvedCity =
    typeof parsed.resolvedCity === "string" ? parsed.resolvedCity : null;

  return { resolvedCity, places };
}

function mapGeminiPlaceToVenue(raw, allowedCategories) {
  const name = raw && raw.name ? String(raw.name).trim() : "";
  if (!name) return null;

  const rawCategory = raw && raw.category ? String(raw.category).trim() : "";
  const category = allowedCategories.includes(rawCategory)
    ? rawCategory
    : allowedCategories[0];
  const categories = [category];

  const address = raw && raw.address ? String(raw.address).trim() : null;

  return {
    name,
    emoji: emojiFor(categories),
    price: estimatePrice(categories),
    rating: 4.2,
    dist: 10,
    mood: estimateMood(categories),
    outdoor: estimateOutdoor(categories),
    kidFriendly: estimateKidFriendly(categories),
    nightOnly: estimateNightOnly(categories),
    slots: estimateSlots(categories),
    why: null,
    address,
    hours: null,
    categories,
    source: "gemini",
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  if (!GEMINI_KEY) {
    res.status(500).json({ error: "missing-gemini-key" });
    return;
  }

  const { city, intent } = req.body || {};

  if (!city || typeof city !== "string" || !city.trim()) {
    res.status(400).json({ error: "missing-city" });
    return;
  }

  const allowedCategories = INTENT_CATEGORIES[intent] || INTENT_CATEGORIES.general;

  try {
    const { resolvedCity, places: rawPlaces } = await askGeminiForPlaces({
      city: city.trim(),
      intent,
    });

    const seen = new Set();
    const places = rawPlaces
      .map((raw) => mapGeminiPlaceToVenue(raw, allowedCategories))
      .filter(Boolean)
      .filter((place) => {
        const key = `${place.name}|${place.address || ""}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    res.status(200).json({
      city,
      resolvedCity: resolvedCity || city,
      places,
    });
  } catch (err) {
    res.status(502).json({ error: "gemini-request-failed" });
  }
}
