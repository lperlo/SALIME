import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { city, intent } = req.body;
  if (!city) return res.status(400).json({ error: "Falta la ubicación" });

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Recomendá 4 lugares REALES y populares en la zona/barrio: "${city}".
      Intención de la salida: "${intent || "comer"}".

      REGLAS IMPORTANTES:
      1. Solo devuelve lugares gastronómicos reales (restaurantes, bares, cafeterías, heladerías).
      2. NUNCA devuelvas plazas, plazoletas, parques, avenidas ni centros culturales.
      3. Devuelve ÚNICAMENTE un formato JSON así:
      {
        "places": [
          {
            "name": "Nombre real del local",
            "rating": 4.5,
            "price": 2,
            "dist": 5,
            "emoji": "🍔",
            "address": "Dirección o referencia",
            "hours": ["19:00", "01:00"]
          }
        ]
      }
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const data = JSON.parse(cleanJson);

    return res.status(200).json(data);
  } catch (error) {
    console.error("Error al buscar lugares:", error);
    return res.status(500).json({ places: [] });
  }
}
