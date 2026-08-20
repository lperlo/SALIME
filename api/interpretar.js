
// api/interpretar.js
//
// Endpoint serverless (Vercel) para SALIME - BASE 03 - GEMINI.
//
// Reemplaza SOLO la interpretación de texto libre que antes hacía la
// heurística de parseInput(). El frontend le manda el texto que escribió
// el usuario y este endpoint devuelve el mismo "contrato" de campos que
// ya esperaba el resto de la aplicación (parseInputHeuristic / generatePlan).
//
// La clave API de Gemini se lee desde process.env.GEMINI_API_KEY,
// que es una variable de entorno configurada en Vercel del lado servidor.
// Nunca se envía al cliente ni queda en el código del navegador.

const SYSTEM_INSTRUCTIONS = `Sos el módulo de interpretación de intención de SALIME, una aplicación que arma planes de salida.

Tu única tarea es leer el texto del usuario y devolver un objeto JSON con exactamente estos campos, sin texto adicional:

{
  "ubicacion": cadena o null,
  "gente": uno de "Solo" | "Pareja" | "Amigos" | "Familia", o null,
  "presupuesto": uno de "Economico" | "Medio" | "Flexible", o null,
  "mood": uno de "Tranquilo" | "Animado", o null,
  "cerca": booleano,
  "outdoor": booleano,
  "hasKids": booleano,
  "morning": booleano,
  "afternoon": booleano,
  "night": booleano,
  "daytimeGeneric": booleano,
  "explicitHour": numero o null,
  "earlier": booleano
}

Reglas de franja horaria (a lo sumo UNA de morning / afternoon / night / daytimeGeneric puede ser true; las demás quedan en false):
- "morning": el texto menciona explícitamente la mañana (ej. "a la mañana", "temprano", "primera hora").
- "afternoon": el texto menciona explícitamente la tarde (ej. "a la tarde", "esta tarde").
- "night": el texto menciona explícitamente la noche (ej. "a la noche", "esta noche").
- "daytimeGeneric": el texto pide pasar/ocupar el día sin especificar mañana o tarde puntual (ej. "quiero pasar el día").
- Si el texto no menciona ninguna franja horaria, dejá las cuatro en false.
- "explicitHour": solo si el texto menciona una hora puntual (ej. "a las 11"), como número de 0 a 23. Si no hay hora puntual, dejalo en null.

No inventes datos que el texto no sugiere: ante ambigüedad, dejá el campo correspondiente en null o false en vez de adivinar.

Devolvé ÚNICAMENTE el objeto JSON, nada de texto antes ni después.`;

const GEMINI_MODEL = "gemini-3.6-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "método no permitido" });
    return;
  }

  const { text } = req.body || {};
  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "texto_faltante" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "falta_clave_api" });
    return;
  }

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTIONS }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      console.error("Gemini error:", geminiRes.status, errorText);
      res.status(502).json({ error: "error_gemini", detalle: errorText });
      return;
    }

    const data = await geminiRes.json();
    const raw = (data.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || "")
      .join("")
      .trim();

    // Por más que pedimos responseMimeType: "application/json", limpiamos
    // por las dudas si viniera envuelto en ```json ... ```.
    const clean = raw.replace(/^```json\s*|^```\s*|```$/g, "").trim();
    const parsed = JSON.parse(clean);

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: "interpretación fallida" });
  }
}
