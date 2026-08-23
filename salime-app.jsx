import React, { useState } from "react";

// --- PLANTILLAS CORREGIDAS (SOLO LUGARES GASTRONÓMICOS) ---
const STEPS_COMER = [
  {
    step: 1,
    title: "PARA EMPEZAR",
    subtitle: "Arrancamos a comer algo rico",
    intent: "restaurant",
    categories: ["catering.restaurant"],
  },
  {
    step: 2,
    title: "SEGUIR",
    subtitle: "Un postre, café o algo dulce",
    intent: "cafeteria",
    categories: ["catering.cafe", "catering.ice_cream"],
  },
  {
    step: 3,
    title: "PARA TERMINAR",
    subtitle: "Un barcito o tragos para cerrar",
    intent: "bar",
    categories: ["catering.bar", "catering.pub"],
  },
];

const STEPS_TOMAR_ALGO = [
  {
    step: 1,
    title: "PARA EMPEZAR",
    subtitle: "Unos tragos o cerveza para arrancar",
    intent: "bar",
    categories: ["catering.bar", "catering.pub"],
  },
  {
    step: 2,
    title: "SEGUIR",
    subtitle: "Acompañamos con algo para picar o cenar",
    intent: "restaurant",
    categories: ["catering.restaurant"],
  },
  {
    step: 3,
    title: "PARA TERMINAR",
    subtitle: "Cierre en un bar o cafetería nocturna",
    intent: "bar",
    categories: ["catering.bar", "catering.cafe"],
  },
];

// Helper para consultar nuestra API Backend de lugares con IA
async function fetchPoolOverrides(city, intent) {
  try {
    const res = await fetch("/api/lugares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city, intent }),
    });
    if (!res.ok) throw new Error("Error en respuesta del backend");
    const data = await res.json();
    return data.places || [];
  } catch (err) {
    console.error("Error al obtener lugares:", err);
    return [];
  }
}

export default function SalimeApp() {
  const [city, setCity] = useState("Güemes, Córdoba");
  const [intent, setIntent] = useState("comer");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);

  const handleGeneratePlan = async () => {
    setLoading(true);
    setPlan(null);

    // Seleccionamos la plantilla según la intención del usuario
    const stepsTemplate = intent === "comer" ? STEPS_COMER : STEPS_TOMAR_ALGO;

    // Pedimos los lugares reales a la IA/Backend
    const places = await fetchPoolOverrides(city, intent);

    if (places.length === 0) {
      alert("No pudimos obtener lugares en este momento. Intentá de nuevo.");
      setLoading(false);
      return;
    }

    // Armamos el itinerario combinando la plantilla con los lugares traídos por la IA
    const generatedSteps = stepsTemplate.map((stepInfo, index) => {
      const place = places[index % places.length]; // Distribuye los lugares devueltos
      return {
        ...stepInfo,
        place: place || {
          name: "Lugar sugerido",
          address: city,
          rating: 4.5,
          emoji: "🍽️",
        },
      };
    });

    setPlan(generatedSteps);
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: "500px", margin: "0 auto", padding: "20px", fontFamily: "sans-serif" }}>
      <h1 style={{ textAlign: "center", color: "#333" }}>SALIME 🍹🍔</h1>
      <p style={{ textAlign: "center", color: "#666" }}>Armá tu salida ideal en segundos</p>

      <div style={{ background: "#f8f9fa", padding: "15px", borderRadius: "10px", marginBottom: "20px" }}>
        <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>¿Dónde estás o a dónde querés ir?</label>
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Ej: Güemes, Nueva Córdoba..."
          style={{ width: "100%", padding: "10px", borderRadius: "5px", border: "1px solid #ccc", marginBottom: "15px", boxSizing: "border-box" }}
        />

        <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>¿Qué plan tenés hoy?</label>
        <select
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          style={{ width: "100%", padding: "10px", borderRadius: "5px", border: "1px solid #ccc", marginBottom: "15px", boxSizing: "border-box" }}
        >
          <option value="comer">Quiero Comer</option>
          <option value="tomar_algo">Quiero Tomar Algo</option>
        </select>

        <button
          onClick={handleGeneratePlan}
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px",
            backgroundColor: loading ? "#ccc" : "#ff5722",
            color: "#fff",
            border: "none",
            borderRadius: "5px",
            fontWeight: "bold",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Generando tu Salida..." : "¡Armar Salida!"}
        </button>
      </div>

      {plan && (
        <div>
          <h2>Tu Plan Sugerido:</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            {plan.map((item) => (
              <div
                key={item.step}
                style={{
                  borderLeft: "4px solid #ff5722",
                  padding: "10px 15px",
                  background: "#fff",
                  boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                  borderRadius: "0 8px 8px 0",
                }}
              >
                <span style={{ fontSize: "12px", fontWeight: "bold", color: "#888" }}>Paso {item.step}</span>
                <h3 style={{ margin: "5px 0", fontSize: "16px" }}>{item.title}</h3>
                <p style={{ margin: "0 0 8px 0", color: "#555", fontSize: "14px" }}>{item.subtitle}</p>
                <div style={{ background: "#f0f0f0", padding: "8px", borderRadius: "5px", fontSize: "14px" }}>
                  <strong>{item.place.emoji || "📍"} {item.place.name}</strong>
                  <br />
                  <small style={{ color: "#666" }}>{item.place.address}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
