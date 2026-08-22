// api/interpretar.js
//
// Endpoint serverless (Vercel) para SALIME.
// Interpreta el texto libre del usuario y devuelve un contrato
// normalizado que consume directamente el frontend.
//
// IMPORTANTE:
// Los nombres de los campos coinciden EXACTAMENTE con los que
// espera salime-app.jsx.

const SYSTEM_INSTRUCTIONS = `
Sos el módulo de interpretación de intención de SALIME, una aplicación que arma planes de salida.

Tu única tarea es leer el texto del usuario y devolver ÚNICAMENTE un objeto JSON válido, sin explicaciones ni texto adicional.

El objeto debe tener EXACTAMENTE estos campos:

{
  "location": cadena o null,
  "people": "Solo" | "Pareja" | "Amigos" | "Familia" | null,
  "budget": "Económico" | "Medio" | "Flexible" | null,
  "mood": "Tranquilo" | "Animado" | null,
  "intent": "comer" | "beber" | "cultura" | "paseo" | "aire_libre" | "fiesta" | "familia" | "general" | null,
  "close": booleano,
  "outdoor": booleano,
  "hasKids": booleano,
  "morning": booleano,
  "afternoon": booleano,
  "night": booleano,
  "daytimeGeneric": booleano,
  "explicitHour": número o null,
  "earlier": booleano
}

REGLAS IMPORTANTES:

1. LOCATION
Detectá la ubicación solamente si el usuario la menciona.

Ejemplos:
- "Estoy en Nueva Córdoba" → location: "Nueva Córdoba"
- "Estamos en Güemes" → location: "Güemes"
- "Estoy en Córdoba" → location: "Córdoba"

No inventes una ubicación.

2. PEOPLE
Detectá con quién sale la persona:

- "solo", "sola", "yo" → "Solo"
- "somos dos", "mi pareja", "en pareja", "una cita" → "Pareja"
- "con amigos", "somos seis", "somos cuatro amigos" → "Amigos"
- "familia", "con mis hijos", "con los chicos" → "Familia"

Si no queda claro → null.

Si hay niños o hijos, hasKids debe ser true.

3. BUDGET
Detectá:

- barato, económico, gastar poco, poca plata, presupuesto bajo → "Económico"
- presupuesto medio, moderado → "Medio"
- flexible, no importa el precio, sin límite → "Flexible"

Si no se menciona → null.

4. MOOD
Usá "Tranquilo" cuando el usuario menciona:
tranquilo, relajado, charlar, hablar, conversar, sin mucha gente, algo tranquilo.

Usá "Animado" cuando menciona:
fiesta, divertido, animado, previa, boliche, salir de fiesta.

Si no queda claro → null.

5. INTENT
Este campo es MUY IMPORTANTE.

Identificá qué quiere hacer principalmente el usuario.

- "comer", "cenar", "almorzar", "ir a comer", "comer rico" → "comer"
- "tomar algo", "ir por unos tragos", "cerveza", "bar", "copas" → "beber"
- "museo", "exposición", "arte", "cultural", "cultura", "teatro", "algo cultural" → "cultura"
- "pasear", "caminar", "dar una vuelta", "recorrer", "salir a pasear" → "paseo"
- "aire libre", "al aire libre", "naturaleza", "parque", "plaza", "estar afuera" → "aire_libre"
- "fiesta", "boliche", "bailar", "salir de fiesta", "divertido", "algo divertido", "diversión" → "fiesta"
- "con chicos", "con niños", "con mis hijos", "plan familiar" → "familia"

Si no existe una intención principal clara → "general".

No conviertas "cultura" o "paseo" en "Tranquilo".
La intención debe mantenerse en intent.

6. OUTDOOR
Debe ser true cuando el usuario pide:
- aire libre
- al aire libre
- afuera
- parque
- plaza
- naturaleza
- actividad exterior

7. CLOSE
Debe ser true cuando el usuario pide:
- cerca
- bien cerca
- no quiero caminar mucho
- caminar poco
- sin caminar mucho
- no quiero manejar mucho
- cerca de donde estoy

8. HORARIOS
Como máximo UNA de estas cuatro variables puede ser true:

morning
afternoon
night
daytimeGeneric

MORNING:
- a la mañana
- por la mañana
- de mañana
- temprano
- primera hora

AFTERNOON:
- a la tarde
- por la tarde
- esta tarde
- de tarde

NIGHT:
- a la noche
- por la noche
- esta noche
- de noche

DAYTIMEGENERIC:
- pasar el día
- pasar todo el día
- ocupar el día
- plan de día
- durante el día

Si el usuario no menciona franja horaria, todas deben ser false.

9. EXPLICIT HOUR
Detectá una hora puntual cuando aparezca:

- "a las 11"
- "a las 17"
- "a las 5 de la tarde"
- "a las 8 de la noche"

Devolvé la hora en formato numérico de 0 a 23.

Ejemplos:
"a las 17" → 17
"a las 5 de la tarde" → 17
"a las 8 de la noche" → 20
"a las 11 de la mañana" → 11

Si no hay hora puntual → null.

Si hay hora puntual, además podés determinar morning/afternoon/night según corresponda, pero explicitHour debe conservar la hora exacta.

10. EARLIER
Debe ser true si el usuario pide:
- más temprano
- más pronto
- antes
- adelantar el plan

11. NO INVENTAR
No adivines información que el usuario no dio.

Si algo no está claro:
- strings → null
- booleanos → false

12. PRIORIDAD DE INTENCIÓN
Si aparecen varias cosas, elegí como intent la intención principal del pedido.

Ejemplo:
"Quiero comer rico y después tomar algo"
→ intent: "comer"

"Quiero hacer algo cultural y después tomar un café"
→ intent: "cultura"

"Quiero estar al aire libre y caminar"
→ intent: "aire_libre"

"Quiero salir de fiesta y tomar algo"
→ intent: "fiesta"

"Somos una familia con chicos y queremos pasar el día"
→ intent: "familia"

DEVOLVÉ ÚNICAMENTE EL JSON.
`;

const GEMINI_MODEL = "gemini-3.6-flash";

/**
 * Normaliza un valor de texto para comparaciones robustas:
 * saca espacios de más, pasa a minúsculas y quita tildes.
 */
function normalizeForComparison(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Capitaliza la primera letra de cada palabra, incluyendo
 * letras acentuadas.
 */
function capitalizeWords(lowerText) {
  return lowerText.replace(
    /(^|[\s-])(\p{L})/gu,
    (_match, sep, letter) => sep + letter.toUpperCase()
  );
}

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
            parts: [
              {
                text: SYSTEM_INSTRUCTIONS,
              },
            ],
          },

          contents: [
            {
              role: "user",
              parts: [
                {
                  text: text.trim(),
                },
              ],
            },
          ],

          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();

      console.error(
        "Gemini error:",
        geminiRes.status,
        errorText
      );

      res.status(502).json({
        error: "error_gemini",
        detalle: errorText,
      });

      return;
    }

    const data = await geminiRes.json();

    const raw = (data.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || "")
      .join("")
      .trim();

    if (!raw) {
      throw new Error("respuesta_gemini_vacia");
    }

    const clean = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(clean);

    // ---------------------------------------------------------------
    // Normalización final del contrato
    // ---------------------------------------------------------------

    const validPeople = [
      "Solo",
      "Pareja",
      "Amigos",
      "Familia",
    ];

    const validBudget = [
      "Económico",
      "Medio",
      "Flexible",
    ];

    const validMood = [
      "Tranquilo",
      "Animado",
    ];

    const validIntent = [
      "comer",
      "beber",
      "cultura",
      "paseo",
      "aire_libre",
      "fiesta",
      "familia",
      "general",
    ];

    const normalizedPeople = validPeople.includes(parsed.people)
      ? parsed.people
      : null;

    const normalizedBudget = validBudget.includes(parsed.budget)
      ? parsed.budget
      : null;

    const normalizedMood = validMood.includes(parsed.mood)
      ? parsed.mood
      : null;

    // ---------------------------------------------------------------
    // Normalización robusta de INTENT
    // ---------------------------------------------------------------

    const rawIntentNormalized = normalizeForComparison(
      parsed.intent
    );

    const normalizedIntent = validIntent.includes(
      rawIntentNormalized
    )
      ? rawIntentNormalized
      : "general";

    // ---------------------------------------------------------------
    // Hora exacta
    // ---------------------------------------------------------------

    let explicitHour = null;

    if (
      typeof parsed.explicitHour === "number" &&
      Number.isFinite(parsed.explicitHour) &&
      parsed.explicitHour >= 0 &&
      parsed.explicitHour <= 23
    ) {
      explicitHour = Math.round(parsed.explicitHour);
    }

    // ---------------------------------------------------------------
    // Normalización de ubicación
    // ---------------------------------------------------------------

    let location = null;

    if (
      typeof parsed.location === "string" &&
      parsed.location.trim()
    ) {
      const rawLocation = parsed.location.trim();

      const knownLocations = {
        "cordoba": "Córdoba",
        "nueva cordoba": "Nueva Córdoba",
        "guemes": "Güemes",
        "alta cordoba": "Alta Córdoba",
        "centro": "Centro",
      };

      const normalizedFull = normalizeForComparison(
        rawLocation
      );

      let matchedKnown = knownLocations[normalizedFull]
        ? normalizedFull
        : null;

      if (!matchedKnown) {
        const candidateKeys = Object.keys(
          knownLocations
        ).sort((a, b) => {
          if (a === "cordoba") return 1;
          if (b === "cordoba") return -1;
          return b.length - a.length;
        });

        matchedKnown = candidateKeys.find((key) =>
          new RegExp(
            `\\b${key.replace(/\s+/g, "\\s+")}\\b`
          ).test(normalizedFull)
        );
      }

      location =
        (matchedKnown && knownLocations[matchedKnown]) ||
        capitalizeWords(rawLocation.toLowerCase());
    }

    // ---------------------------------------------------------------
    // Horarios
    // ---------------------------------------------------------------

    let morning = !!parsed.morning;
    let afternoon = !!parsed.afternoon;
    let night = !!parsed.night;
    let daytimeGeneric = !!parsed.daytimeGeneric;

    // Si hay hora exacta, usamos la hora como fuente más precisa.
    if (explicitHour !== null) {
      morning = false;
      afternoon = false;
      night = false;
      daytimeGeneric = false;

      if (explicitHour >= 5 && explicitHour < 12) {
        morning = true;
      } else if (explicitHour >= 12 && explicitHour < 19) {
        afternoon = true;
      } else {
        night = true;
      }
    } else {
      // Garantizamos que como máximo haya una franja activa.
      const activeCount = [
        morning,
        afternoon,
        night,
        daytimeGeneric,
      ].filter(Boolean).length;

      if (activeCount > 1) {
        if (morning) {
          afternoon = false;
          night = false;
          daytimeGeneric = false;
        } else if (afternoon) {
          night = false;
          daytimeGeneric = false;
        } else if (night) {
          daytimeGeneric = false;
        }
      }
    }

    const result = {
      location,
      people: normalizedPeople,
      budget: normalizedBudget,
      mood: normalizedMood,
      intent: normalizedIntent,
      close: !!parsed.close,
      outdoor: !!parsed.outdoor,
      hasKids: !!parsed.hasKids,
      morning,
      afternoon,
      night,
      daytimeGeneric,
      explicitHour,
      earlier: !!parsed.earlier,
    };

    res.status(200).json(result);
  } catch (err) {
    console.error("Interpretación fallida:", err);

    res.status(500).json({
      error: "interpretación fallida",
    });
  }
                                          }
