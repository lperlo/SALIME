
import React, { useState, useMemo, useRef, useEffect } from "react";
import { ArrowLeft, ArrowRight, MapPin, Wallet, Users, Sparkles } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Tokens */
/* ------------------------------------------------------------------ */
const C = {
  bg: "#F8F7F3",
  ink: "#183B4E",
  lavender: "#DCD7F7",
  coral: "#FF8066",
  text: "#24313A",
  white: "#FFFFFF",
  inkLine: "rgba(24,59,78,0.14)",
  inkBorder: "rgba(24,59,78,0.08)",
  inkFaint: "rgba(24,59,78,0.06)",
  coralFaint: "rgba(255,128,102,0.10)",
};

/* ------------------------------------------------------------------ */
/* Mock data pools — noche (original) */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Mock data pools — noche (original) */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Mock data pools — noche (original) */
/* ------------------------------------------------------------------ */
const CENA = [
  { name: "El Rincón de Mateo", emoji: "🍽️", price: 1, rating: 4.5, dist: 6, mood: ["tranquilo"], outdoor: false, kidFriendly: true, nightOnly: false, why: "cocina casera, mesas separadas, se puede hablar sin gritar" },
  { name: "Verde Oliva", emoji: "🥗", price: 1, rating: 4.4, dist: 5, mood: ["tranquilo"], outdoor: true, kidFriendly: true, nightOnly: false, why: "opciones livianas y un patio con plantas, buena onda tranquila" },
  { name: "Sabor a Barrio", emoji: "🍲", price: 1, rating: 4.3, dist: 4, mood: ["tranquilo", "animado"], outdoor: false, kidFriendly: true, nightOnly: false, why: "lugar chico, precio justo y atención re cálida" },
  { name: "Fuego Lento", emoji: "🔥", price: 2, rating: 4.6, dist: 9, mood: ["animado"], outdoor: false, kidFriendly: false, nightOnly: false, why: "parrilla con buena música y mesas largas para grupo" },
  { name: "La Terraza del Este", emoji: "🌆", price: 3, rating: 4.7, dist: 12, mood: ["animado"], outdoor: true, kidFriendly: false, nightOnly: false, why: "vista linda y carta más elaborada, para una ocasión especial" },
];

const BEBIDA = [
  { name: "Vermutería Sur", emoji: "🍹", price: 1, rating: 4.4, dist: 3, mood: ["tranquilo"], outdoor: true, kidFriendly: false, nightOnly: false, why: "vermú de la casa y mesas afuera, tranqui para seguir la charla" },
  { name: "El Aperitivo", emoji: "🥂", price: 2, rating: 4.5, dist: 4, mood: ["tranquilo", "animado"], outdoor: false, kidFriendly: false, nightOnly: false, why: "buena carta de tragos sin ser un boliche" },
  { name: "Bar Federal", emoji: "🍺", price: 1, rating: 4.3, dist: 5, mood: ["animado"], outdoor: false, kidFriendly: false, nightOnly: false, why: "clásico del barrio, siempre tiene movimiento" },
  { name: "La Cervecería del Fondo", emoji: "🍻", price: 2, rating: 4.6, dist: 7, mood: ["animado"], outdoor: true, kidFriendly: false, nightOnly: false, why: "cerveza artesanal y patio con mesas compartidas" },
  { name: "Mixología Nueva Córdoba", emoji: "🍸", price: 3, rating: 4.7, dist: 8, mood: ["animado"], outdoor: false, kidFriendly: false, nightOnly: true, why: "coctelería de autor, para cerrar la noche en grande" },
];

const FINAL = [
  { name: "Heladería Cassata", emoji: "🍨", price: 1, rating: 4.6, dist: 3, mood: ["tranquilo"], outdoor: false, kidFriendly: true, nightOnly: false, why: "un cierre dulce que nunca falla" },
  { name: "Plaza San Martín de noche", emoji: "🌳", price: 1, rating: 4.5, dist: 4, mood: ["tranquilo"], outdoor: true, kidFriendly: true, nightOnly: true, why: "caminar un rato al aire libre después de comer" },
  { name: "Rooftop Calma", emoji: "🌙", price: 2, rating: 4.5, dist: 6, mood: ["tranquilo"], outdoor: true, kidFriendly: false, nightOnly: false, why: "terraza tranquila, buena para bajar el ritmo" },
  { name: "Jazz en el Sótano", emoji: "🎷", price: 2, rating: 4.6, dist: 8, mood: ["animado"], outdoor: false, kidFriendly: false, nightOnly: true, why: "música en vivo hasta tarde, para no cortar la noche" },
  { name: "Mirador del Cerro", emoji: "✨", price: 1, rating: 4.7, dist: 10, mood: ["animado", "tranquilo"], outdoor: true, kidFriendly: false, nightOnly: false, why: "una vista linda para cerrar el plan, aunque implica caminar un poco más" },
];

/* ------------------------------------------------------------------ */
/* Mock data pools — familia / día (nuevo, para el bug de niños) */
/* ------------------------------------------------------------------ */
const ACTIVIDAD_FAMILIA = [
  { name: "Parque Sarmiento", emoji: "🌳", price: 1, rating: 4.6, dist: 5, mood: ["tranquilo"], outdoor: true, kidFriendly: true, why: "espacio verde grande con juegos, ideal para que los chicos corran un rato" },
  { name: "Museo de los Niños", emoji: "🎨", price: 1, rating: 4.5, dist: 7, mood: ["animado"], outdoor: false, kidFriendly: true, why: "actividades interactivas pensadas para chicos" },
  { name: "Paseo del Buen Pastor", emoji: "🎡", price: 1, rating: 4.4, dist: 6, mood: ["animado", "tranquilo"], outdoor: true, kidFriendly: true, why: "patio abierto con espacio para jugar y algo de sombra" },
];

const MERIENDA_FAMILIA = [
  { name: "Heladería Cassata", emoji: "🍨", price: 1, rating: 4.6, dist: 3, mood: ["tranquilo"], outdoor: false, kidFriendly: true, why: "una parada dulce que nunca falla con chicos" },
  { name: "Confitería El Ciervo", emoji: "🧁", price: 1, rating: 4.5, dist: 4, mood: ["tranquilo"], outdoor: false, kidFriendly: true, why: "merienda tranquila con mesas amplias para toda la familia" },
  { name: "Waffle & Co", emoji: "🧇", price: 2, rating: 4.4, dist: 5, mood: ["animado"], outdoor: true, kidFriendly: true, why: "terraza informal, buena opción si los chicos siguen con energía" },
];

const CIERRE_FAMILIA = [
  { name: "Pizzería de la Cañada", emoji: "🍕", price: 1, rating: 4.5, dist: 4, mood: ["animado"], outdoor: false, kidFriendly: true, why: "pizza para compartir y ambiente relajado para cerrar temprano" },
  { name: "La Parrillita Familiar", emoji: "🍖", price: 2, rating: 4.6, dist: 6, mood: ["tranquilo"], outdoor: false, kidFriendly: true, why: "menú simple y raciones para compartir, pensado para ir con chicos" },
  { name: "Patio de la Abuela", emoji: "🍝", price: 1, rating: 4.4, dist: 5, mood: ["tranquilo"], outdoor: true, kidFriendly: true, why: "patio tranquilo, cena liviana antes de volver a casa" },
];

/* ------------------------------------------------------------------ */
/* Plantillas de plan (horarios + etiquetas) */
/* ------------------------------------------------------------------ */
const STEPS_NIGHT = [
  { key: "cena", label: "PARA ARRANCAR", time: "20:30", pool: CENA },
  { key: "bebida", label: "SEGUIR", time: "22:15", pool: BEBIDA },
  { key: "final", label: "PARA TERMINAR", time: "23:30", pool: FINAL },
];

// Mismo tipo de categorías que STEPS_NIGHT pero en horario de tarde,
// para pedidos que mencionan "esta tarde" sin niños de por medio.
const STEPS_DAY = [
  { key: "cena", label: "PARA ARRANCAR", time: "17:00", pool: CENA },
  { key: "bebida", label: "SEGUIR", time: "18:30", pool: BEBIDA },
  { key: "final", label: "PARA TERMINAR", time: "20:00", pool: FINAL },
];

// Igual patrón pero de mañana, para "a la mañana", "temprano", "a las 11", etc.
const STEPS_MORNING = [
  { key: "cena", label: "PARA ARRANCAR", time: "10:30", pool: CENA },
  { key: "bebida", label: "SEGUIR", time: "12:00", pool: BEBIDA },
  { key: "final", label: "PARA TERMINAR", time: "13:30", pool: FINAL },
];

// Plantilla propia para "día genérico" ("pasar el día", "plan de día",
// "todo el día afuera") — a mediodía, distinta de STEPS_MORNING (mañana) y
// de STEPS_DAY (tarde explícita), porque un pedido de "pasar el día" se
// siente mal si arranca recién a las 17:00.
const STEPS_MIDDAY = [
  { key: "cena", label: "PARA ARRANCAR", time: "12:30", pool: CENA },
  { key: "bebida", label: "SEGUIR", time: "14:00", pool: BEBIDA },
  { key: "final", label: "PARA TERMINAR", time: "15:30", pool: FINAL },
];

// Plantilla dedicada para "familia con niños": pools 100% aptos para
// chicos, sin lugares de bebidas/nightlife, horario diurno.
const STEPS_FAMILY = [
  { key: "actividad", label: "PARA ARRANCAR", time: "16:00", pool: ACTIVIDAD_FAMILIA },
  { key: "merienda", label: "SEGUIR", time: "17:30", pool: MERIENDA_FAMILIA },
  { key: "cierre", label: "PARA TERMINAR", time: "19:00", pool: CIERRE_FAMILIA },
];

const BUDGET_TIER = { "Económico": 1, "Medio": 2, "Flexible": 3 };

/* ------------------------------------------------------------------ */
/* Interpretación de texto libre */
/* ------------------------------------------------------------------ */
function parseInputHeuristic(text) {
  const t = (text || "").toLowerCase();
  const out = {
    location: null, people: null, budget: null, mood: null,
    close: false, outdoor: false, hasKids: false,
    morning: false, afternoon: false, night: false, daytimeGeneric: false, explicitHour: null,
    earlier: false,
  };

  const locMatch = t.match(/en ([a-záéíóúñ\s]+?)(,|\.|$| que| y )/i);
  if (locMatch) {
    out.location = locMatch[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  if (/\bsolo\b|\bsola\b/.test(t)) out.people = "Solo";
  else if (/pareja|somos dos|los dos|una cita|cita\b/.test(t)) out.people = "Pareja";
  else if (/amigos|amigas/.test(t)) out.people = "Amigos";
  else if (/familia/.test(t)) out.people = "Familia";

  if (/niños|niñas|con los chicos|con mis hijos|con mi hijo|con mi hija|\bhijos\b|\bhijas\b|nene\b|nena\b/.test(t)) {
    out.hasKids = true;
  }

  // Franja horaria: se buscan primero las frases explícitas de mañana/tarde/
  // noche (más específicas), después "día" genérico, y por último una hora
  // puntual ("a las 11"). Cuál de estas gana se resuelve en el llamador
  // (mismo patrón ya usado para hasKids/afternoon), no acá.
  if (/a la mañana|por la mañana|de mañana|en la mañana|\btemprano\b|a primera hora/.test(t)) out.morning = true;
  if (/por la tarde|esta tarde|de tarde|a la tarde/.test(t)) out.afternoon = true;
  if (/esta noche|a la noche|de noche|por la noche/.test(t)) out.night = true;
  if (/pasar el día|plan de día|durante el día|de día\b|para el día|pasar todo el día|todo el día/.test(t)) out.daytimeGeneric = true;

  const hourMatch = t.match(/a las?\s+(\d{1,2})\b/);
  if (hourMatch) out.explicitHour = parseInt(hourMatch[1], 10);

  if (/barato|económic|gastar poco|poca plata|gastar menos|presupuesto bajo|poco presupuesto|no\s+(quiero\s+|queremos\s+)?gastar\s+(mucho|demasiado)|sin\s+gastar\s+(mucho|demasiado)|(no|nada)\s+(muy\s+|demasiado\s+)?car[oa]/.test(t)) out.budget = "Económico";
  else if (/medio|moderad/.test(t)) out.budget = "Medio";
  else if (/flexible|no importa|lo que sea|sin límite|presupuesto alto/.test(t)) out.budget = "Flexible";

  if (/tranquil|relaj|charlar|hablar tranquilos|conversar|podamos hablar|poder hablar|queremos hablar|no.*lleno de gente|no.*mucha gente/.test(t)) out.mood = "Tranquilo";
  else if (/fiesta|animad|divertid|previa|boliche/.test(t)) out.mood = "Animado";

  if (/no quiero caminar|no caminar (mucho|tanto)|sin caminar|caminar poco|caminar menos|que quede cerca|bien cerca|cerca tuyo|no quiero manejar|no manejar (mucho|tanto)|sin manejar mucho|cerca(?!\s+de\s+la|\s+de\s+las)/.test(t)) out.close = true;

  if (/aire libre|al aire libre/.test(t)) out.outdoor = true;

  if (/más temprano|mas temprano|más pronto|mas pronto/.test(t)) out.earlier = true;

  return out;
}

// Interpretación real vía IA. Llama a un endpoint propio del servidor
// (nunca directo a Anthropic desde el navegador, así la API key nunca
// llega al cliente). Devuelve exactamente el mismo "contrato" de campos
// que parseInputHeuristic, para que el resto de SALIME no note la diferencia.
// Si la llamada falla o la respuesta no tiene la forma esperada, lanza
// un error: quien la invoque debe capturarlo y usar parseInputHeuristic.
async function parseInputAI(text) {
  const res = await fetch("/api/interpretar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) throw new Error("interpretar-api-error");

  const data = await res.json();
  if (!data || typeof data !== "object") throw new Error("interpretar-api-bad-shape");

  // Curamos/normalizamos la salida en vez de confiar ciegamente en el modelo.
  return {
    location: data.location ?? null,
    people: data.people ?? null,
    budget: data.budget ?? null,
    mood: data.mood ?? null,
    close: !!data.close,
    outdoor: !!data.outdoor,
    hasKids: !!data.hasKids,
    morning: !!data.morning,
    afternoon: !!data.afternoon,
    night: !!data.night,
    daytimeGeneric: !!data.daytimeGeneric,
    explicitHour: typeof data.explicitHour === "number" ? data.explicitHour : null,
    earlier: !!data.earlier,
  };
}

/* ------------------------------------------------------------------ */
/* Selección de lugares */
/* ------------------------------------------------------------------ */
function pick(pool, { budgetTier, mood, close, outdoor, usedNames, excludeNames, allowNightOnly }) {
  let base = allowNightOnly ? pool : pool.filter((p) => !p.nightOnly);
  if (base.length === 0) base = pool; // salvaguarda: dataset chico de demo

  const excluded = new Set([...(usedNames || []), ...(excludeNames || [])]);
  let candidates = base.filter((p) => !excluded.has(p.name));
  // Si excluir todo deja el pool vacío (dataset chico de demo), relajamos
  // solo la exclusión de "ya elegido antes", nunca la de "usado en este plan".
  if (candidates.length === 0) {
    candidates = base.filter((p) => !(usedNames || []).includes(p.name));
  }
  if (candidates.length === 0) candidates = base;

  let filtered = candidates;

  if (mood) {
    const byMood = filtered.filter((p) => p.mood.includes(mood.toLowerCase()));
    if (byMood.length > 0) filtered = byMood;
  }

  if (outdoor) {
    const byOutdoor = filtered.filter((p) => p.outdoor);
    if (byOutdoor.length > 0) filtered = byOutdoor;
  }

  if (budgetTier) {
    const byBudget = filtered.filter((p) => p.price <= budgetTier);
    if (byBudget.length > 0) filtered = byBudget;
  }

  if (close) {
    filtered = [...filtered].sort((a, b) => a.dist - b.dist);
    return filtered[0];
  }

  return filtered[Math.floor(Math.random() * filtered.length)];
}

function shiftTime(timeStr, minutes) {
  if (!minutes) return timeStr;
  const [h, m] = timeStr.split(":").map(Number);
  let total = h * 60 + m + minutes;
  total = Math.max(11 * 60, Math.min(23 * 60 + 50, total)); // entre 11:00 y 23:50
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/* ------------------------------------------------------------------ */
/* Generación del plan */
/* ------------------------------------------------------------------ */
function generatePlan({
  budgetLabel, moodLabel, close, outdoor, hasKids, morning, afternoon, daytimeGeneric,
  timeShiftMin, random, excludeNames,
} = {}) {
  const budgetTier = random ? null : BUDGET_TIER[budgetLabel] || null;
  const mood = random ? null : moodLabel || null;

  let steps;
  if (random) steps = STEPS_NIGHT;
  else if (hasKids) steps = STEPS_FAMILY;
  else if (morning) steps = STEPS_MORNING;
  else if (afternoon) steps = STEPS_DAY;
  else if (daytimeGeneric) steps = STEPS_MIDDAY;
  else steps = STEPS_NIGHT;

  const allowNightOnly = random || steps === STEPS_NIGHT;

  const usedNames = [];
  return steps.map((step) => {
    const venue = pick(step.pool, {
      budgetTier,
      mood,
      close: random ? false : close,
      outdoor: random ? false : outdoor,
      usedNames,
      excludeNames: random ? [] : excludeNames,
      allowNightOnly,
    });
    usedNames.push(venue.name);
    const time = random ? step.time : shiftTime(step.time, timeShiftMin);
    return { ...step, time, venue };
  });
}

const priceLabel = (n) => "$".repeat(n === 1 ? 1 : n === 2 ? 2 : 3);
const ratingLabel = (n) => n.toFixed(1).replace(".", ",");
const distanceLabel = (i, dist) =>
  i === 0 ? `${dist} min caminando` : `${dist} min desde la parada anterior`;

/* ------------------------------------------------------------------ */
/* Small building blocks */
/* ------------------------------------------------------------------ */
function Chip({ icon: Icon, placeholder, value, options, onChange }) {
  const handleClick = () => {
    const idx = options.indexOf(value);
    const next = idx + 1 >= options.length ? null : options[idx + 1];
    onChange(next);
  };
  return (
    <button className={`chip ${value ? "chip--set" : ""}`} onClick={handleClick} type="button">
      <Icon size={14} strokeWidth={2} className="chip__icon" />
      <span>{value || placeholder}</span>
    </button>
  );
}

function Logo({ size = 28 }) {
  const w = size * 4.6;
  const h = size * 1.5;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="logo-svg" aria-label="salime.">
      <text
        x="0"
        y={h * 0.72}
        fontFamily="'Fredoka', sans-serif"
        fontWeight="600"
        fontSize={size}
        fill={C.ink}
      >
        salime
      </text>
      <path
        d={`M ${w * 0.865} ${h * 0.56} Q ${w * 0.9} ${h * 0.34} ${w * 0.935} ${h * 0.32}`}
        stroke={C.coral}
        strokeWidth={size * 0.065}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx={w * 0.94} cy={h * 0.3} r={size * 0.065} fill={C.coral} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Screens */
/* ------------------------------------------------------------------ */
function HomeScreen({ onPlan, onSurprise }) {
  const [text, setText] = useState("");
  const [filters, setFilters] = useState({ location: null, budget: null, people: null, vibe: null });

  const understood = useMemo(() => parseInputHeuristic(text), [text]);
  const understoodChips = [];
  if (filters.location || understood.location) understoodChips.push(`📍 ${filters.location || understood.location}`);
  if (filters.people || understood.people) understoodChips.push(`👥 ${filters.people || understood.people}`);
  if (filters.budget || understood.budget) understoodChips.push(`💰 ${filters.budget || understood.budget}`);
  if (understood.mood && !filters.vibe) understoodChips.push(`✨ ${understood.mood}`);

  const VIBE_MOOD = { Fiesta: "Animado", Cultura: "Tranquilo", Paseo: "Tranquilo" };

  const handleSubmit = async () => {
    // La interpretación real (IA) reemplaza a la heurística solo acá, en el
    // momento de armar el plan. Si la IA falla (sin conexión, sin deploy del
    // endpoint, error del servidor), seguimos con "understood" (heurística
    // local), que ya se calculó arriba para el preview "Entendí:".
    let interpreted = understood;
    try {
      const aiResult = await parseInputAI(text);
      if (aiResult) interpreted = aiResult;
    } catch (err) {
      // Fallback silencioso a la heurística: SALIME sigue funcionando igual.
    }

    const budgetLabel = filters.budget || interpreted.budget;
    const moodLabel = interpreted.mood || VIBE_MOOD[filters.vibe] || null;
    const close = interpreted.close || filters.location === "Cerca tuyo";
    const outdoor = interpreted.outdoor;
    const hasKids = interpreted.hasKids || filters.people === "Familia";

    // Prioridad de franja horaria: frase explícita de mañana > tarde >
    // "día" genérico (mediodía) > hora puntual (bucket) > noche (default).
    let morning = interpreted.morning;
    let afternoon = interpreted.afternoon;
    const daytimeGeneric = !morning && !afternoon && interpreted.daytimeGeneric;
    if (!morning && !afternoon && !daytimeGeneric && interpreted.explicitHour !== null) {
      if (interpreted.explicitHour >= 5 && interpreted.explicitHour 
