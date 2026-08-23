import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { city, intent } = req.body;

  if (!city) {
    return res.status(400).json({ error: "Location is required" });
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Actúa como un recomendador gastronómico local de alta precisión.
      Buscá y recomendá 3 lugares REALES, populares y actualmente abiertos en la zona/barrio: "${city}".
      
      Intención de la salida del usuario: "${intent || "comer"}".

      REGLAS STRICTAS:
      1. Devuelve ÚNICAMENTE lugares reales de comida o bebida si la intención es "comer" o "tomar_algo".
      2. NUNCA devuelvas plazas, plazoletas, centros culturales, parques ni kioscos.
      3. Asegúrate de que los lugares realmente existan en "${city}".
      4. Retorna EXCLUSIVAMENTE un JSON válido con esta estructura (sin formato Markdown adicional ni texto alrededor):

      {
        "places": [
          {
            "name": "Nombre exacto del restaurante o bar",
            "address": "Dirección aprox o calle principal en el barrio",
            "rating": 4.5,
            "emoji": "🍔"
          }
        ]
      }
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Limpiamos la respuesta por si la IA agrega marcas de código markdown
    const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    const data = JSON.parse(cleanJson);

    return res.status(200).json(data);
  } catch (error) {
    console.error("Error al obtener lugares de la IA:", error);
    return res.status(500).json({ places: [] });
  }
}
