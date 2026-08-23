/* ------------------------------------------------------------------ */
/* api/lugares.js  (VERSIÓN GEOAPIFY - REEMPLAZA LA VERSIÓN DE GEMINI) */
/*                                                                     */
/* Busca lugares REALES usando Geoapify (Geocoding + Places API).      */
/* Gemini queda fuera de esta parte: acá NO se inventa nada, todo      */
/* sale directamente de Geoapify.                                      */
/*                                                                     */
/* Variables de entorno necesarias en Vercel:                          */
/*   GEOAPIFY_API_KEY                                                  */
/*                                                                     */
/* Mantiene la MISMA forma de respuesta que la versión anterior:       */
/*   { city, resolvedCity, places: [ {name, emoji, price, rating,      */
/*     dist, mood, outdoor, kidFriendly, nightOnly, slots, why,        */
/*     address, hours, categories, source} ] }                         */
/* ------------------------------------------------------------------ */

const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY;

const INTENT_CATEGORIES = {
  comer: ["catering.restaurant", "catering.fast_food", "catering.food_court"],
  beber: ["catering.cafe", "catering.bar", "catering.pub"],
  cultura: [
    "entertainment.museum",
    "entertainment.culture.gallery",
    "entertainment.culture.theatre",
    "entertainment.culture.arts_centre",
  ],
  paseo: ["leisure.park", "tourism.attraction.viewpoint", "natural"],
  aire_libre: ["leisure.park", "natural", "natural.water"],
  fiesta: ["entertainment.nightclub", "catering.bar", "catering.pub"],
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
  if (cats.some((c) => c.includes("nightclub") || c.includes("bar") || c.includes("pub"))) return ["animado"];
  return ["tranquilo"];
}

function estimateOutdoor(categories) {
  const cats = categories || [];
  return cats.some((c) => c.includes("park") || c.includes("natural") || c.includes("water") || c.includes("viewpoint"));
}

function estimateKidFriendly(categories) {
  const cats = categories || [];
  if (cats.some((c) => c.includes("bar") || c.includes("pub") || c.includes("nightclub"))) return false;
  return true;
}

function estimateNightOnly(categories) {
  const cats = categories || [];
  return cats.some((c) => c.includes("nightclub"));
}

function estimateSlots(categories) {
  const cats = categories || [];
  if (cats.some((c) => c.includes("nightclub"))) return ["night"];
  if (cats.some((c) => c.includes("bar") || c.includes("pub"))) return ["afternoon", "night"];
  return ["morning", "afternoon", "night"];
}

function emojiFor(catego
