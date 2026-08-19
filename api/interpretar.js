
/ api/interpretar.js
//
// Endpoint serverless (Vercel) para SALIME — BASE 03 — GEMINI.
//
// Reemplaza SOLO la interpretación de texto libre que antes hacía la
// heurística de parseInput(). El frontend le manda el texto que escribió
// el usuario y este endpoint devuelve el mismo "contrato" de campos que
// ya esperaba el resto de la app (parseInputHeuristic / generatePlan).
//
// La API key de Gemini se lee desde process.env.GEMINI_API_KEY,
// que es una variable de entorno configurada en Vercel del lado servidor.
// Nunca se envía al cliente ni queda en el código del navegador.

const SYSTEM_PROMPT = `Sos el módulo de interpretación de intención de SALIME, una app que arma planes de salida a partir de texto libre en español (Argentina).

Tu única tarea es leer el texto del usuario y devolver un objeto JSON con exactamente estos campos, sin texto adicional, sin explicación, sin markdown, sin comillas invertidas:

{
  "location": string o null,
  "people": uno de "Solo" | "Pareja" | "Amigos" | "Familia", o null,
  "budget": uno de "Económico" | "Medio" | "Flexible", o null,
  "mood": uno de "Tranquilo" | "Animado", o null,
  "close": boolean,
  "outdoor": boolean,
  "hasKids": boolean,
  "morning": boolean,
  "afternoon": boolean,
  "night": boolean,
  "daytimeGeneric": boolean,
  "explicitHour": number o null,
  "earlier": boolean
}

Reglas de franja horaria (a lo sumo UNA de morning / afternoon / night / daytimeGeneric puede ser true; las demás quedan en false):
- "morning": el texto menciona explícitamente la mañana (ej. "a la mañana", "temprano", "primera hora").
- "afternoon": el texto menciona explícitamente la tarde (ej. "a la tarde", "esta tarde").
- "night": el texto menciona explícitamente la noche (ej. "a la noche", "esta noche").
- "daytimeGeneric": el texto pide pasar/ocupar el día sin especificar mañana o tarde puntual (ej. "quiero pasar el día", "un plan de día", "todo el día"). Esto corresponde a un horario de mediodía, y es DISTINTO de "afternoon".
- Si el texto no menciona ninguna franja horaria, dejá las cuatro en false.
- "explicitHour": solo si el texto menciona una hora puntual (ej. "a las 11"), como número de 0 a 23. Si no hay hora puntual, null.

No inventes datos que el texto no sugiere: ante ambigüedad, dejá el campo correspondiente en null o false en vez de adivinar.

Devolvé ÚNICAMENTE el objeto JSON, nada de texto antes ni después.`;

const GEMINI_MODEL = "gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const { text } = req.body || {};
  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "missing_text" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "missing_api_key" });
    return;
  }

  try {
    
