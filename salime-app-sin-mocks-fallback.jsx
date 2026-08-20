import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Wallet,
  Users,
  Sparkles,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
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
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function normalizeText(value) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeLocation(value) {
  if (!value) return null;

  const clean = normalizeText(value).trim();

  const known = {
    cordoba: "Córdoba",
    "nueva cordoba": "Nueva Córdoba",
    guemes: "Güemes",
    "alta cordoba": "Alta Córdoba",
    centro: "Centro",
  };

  if (known[clean]) return known[clean];

  return value
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const INTENT_LABEL = {
  comer: "comer",
  beber: "tomar algo",
  cultura: "hacer algo cultural",
  paseo: "pasear",
  aire_libre: "estar al aire libre",
  fiesta: "salir de fiesta",
  familia: "hacer un plan familiar",
  general: "salir",
};

const VIBE_INTENT = {
  Comer: "comer",
  "Tomar algo": "beber",
  Paseo: "paseo",
  Cultura: "cultura",
  Fiesta: "fiesta",
};

/* ------------------------------------------------------------------ */
/* Horarios demo (apertura/cierre por lugar)                          */
/* ------------------------------------------------------------------ */

/*
 * Horarios demo de cada lugar. Los rangos que cruzan medianoche
 * (ej. "18:00" -> "02:00") están soportados por isOpenAt().
 */
const DEMO_HOURS = {
  "El Rincón de Mateo": ["10:00", "23:30"],
  "Verde Oliva": ["12:00", "23:30"],
  "Sabor a Barrio": ["12:00", "23:30"],
  "Fuego Lento": ["13:00", "00:30"],
  "La Terraza del Este": ["17:00", "01:00"],

  "Vermutería Sur": ["12:00", "01:00"],
  "El Aperitivo": ["16:00", "01:00"],
  "Bar Federal": ["18:00", "02:00"],
  "La Cervecería del Fondo": ["18:00", "02:00"],
  "Mixología Nueva Córdoba": ["20:00", "02:00"],

  "Heladería Cassata": ["11:00", "23:30"],
  "Plaza San Martín de noche": ["20:00", "02:00"],
  "Rooftop Calma": ["17:00", "00:30"],
  "Jazz en el Sótano": ["21:00", "02:00"],
  "Mirador del Cerro": ["16:00", "22:00"],

  "Galería Horizonte": ["10:00", "18:00"],
  "Museo del Centro": ["10:00", "18:00"],
  "Teatro La Esquina": ["19:00", "23:30"],
  "Centro de Arte Abierto": ["14:00", "20:00"],

  "Paseo del Buen Pastor": ["10:00", "23:00"],
  "Parque Sarmiento": ["08:00", "20:00"],
  "Costanera del Río": ["08:00", "20:00"],

  "Museo de los Niños": ["10:00", "18:00"],
  "Confitería El Ciervo": ["08:00", "22:00"],
  "Waffle & Co": ["09:00", "22:00"],
  "Pizzería de la Cañada": ["12:00", "00:00"],
  "La Parrillita Familiar": ["12:00", "00:00"],
  "Patio de la Abuela": ["12:00", "23:30"],
};

function timeToMinutes(timeStr) {
  const [h, m] = String(timeStr)
    .split(":")
    .map(Number);

  return h * 60 + m;
}

function isOpenAt(place, minute) {
  if (minute === null || minute === undefined) {
    return true;
  }

  /*
   * Lugares reales (Geoapify) traen su propio horario en
   * place.hours ([apertura, cierre]) cuando Geoapify lo informa.
   * Si no lo trae, se asume abierto (igual que un lugar mock sin
   * horario en DEMO_HOURS).
   */
  const range = place.hours || DEMO_HOURS[place.name];

  if (!range) return true;

  const from = timeToMinutes(range[0]);
  const to = timeToMinutes(range[1]);

  if (from <= to) {
    return minute >= from && minute < to;
  }

  // Cruza medianoche (ej. 18:00 -> 02:00)
  return minute >= from || minute < to;
}

/* ------------------------------------------------------------------ */
/* Mock data — gastronomía                                             */
/* ------------------------------------------------------------------ */

const CENA = [
  {
    name: "El Rincón de Mateo",
    emoji: "🍽️",
    price: 1,
    rating: 4.5,
    dist: 6,
    mood: ["tranquilo"],
    outdoor: false,
    kidFriendly: true,
    nightOnly: false,
    slots: ["morning", "afternoon", "night"],
    why: "cocina casera, mesas separadas, se puede hablar sin gritar",
  },
  {
    name: "Verde Oliva",
    emoji: "🥗",
    price: 1,
    rating: 4.4,
    dist: 5,
    mood: ["tranquilo"],
    outdoor: true,
    kidFriendly: true,
    nightOnly: false,
    slots: ["afternoon", "night"],
    why: "opciones livianas y un patio con plantas, buena onda tranquila",
  },
  {
    name: "Sabor a Barrio",
    emoji: "🍲",
    price: 1,
    rating: 4.3,
    dist: 4,
    mood: ["tranquilo", "animado"],
    outdoor: false,
    kidFriendly: true,
    nightOnly: false,
    slots: ["afternoon", "night"],
    why: "lugar chico, precio justo y atención re cálida",
  },
  {
    name: "Fuego Lento",
    emoji: "🔥",
    price: 2,
    rating: 4.6,
    dist: 9,
    mood: ["animado"],
    outdoor: false,
    kidFriendly: false,
    nightOnly: false,
    slots: ["afternoon", "night"],
    why: "parrilla con buena música y mesas largas para grupo",
  },
  {
    name: "La Terraza del Este",
    emoji: "🌆",
    price: 3,
    rating: 4.7,
    dist: 12,
    mood: ["animado"],
    outdoor: true,
    kidFriendly: false,
    nightOnly: false,
    slots: ["afternoon", "night"],
    why: "vista linda y carta más elaborada, para una ocasión especial",
  },
];

const BEBIDA = [
  {
    name: "Vermutería Sur",
    emoji: "🍹",
    price: 1,
    rating: 4.4,
    dist: 3,
    mood: ["tranquilo"],
    outdoor: true,
    kidFriendly: false,
    nightOnly: false,
    slots: ["afternoon", "night"],
    why: "vermú de la casa y mesas afuera, tranqui para seguir la charla",
  },
  {
    name: "El Aperitivo",
    emoji: "🥂",
    price: 2,
    rating: 4.5,
    dist: 4,
    mood: ["tranquilo", "animado"],
    outdoor: false,
    kidFriendly: false,
    nightOnly: false,
    slots: ["afternoon", "night"],
    why: "buena carta de tragos sin ser un boliche",
  },
  {
    name: "Bar Federal",
    emoji: "🍺",
    price: 1,
    rating: 4.3,
    dist: 5,
    mood: ["animado"],
    outdoor: false,
    kidFriendly: false,
    nightOnly: false,
    slots: ["afternoon", "night"],
    why: "clásico del barrio, siempre tiene movimiento",
  },
  {
    name: "La Cervecería del Fondo",
    emoji: "🍻",
    price: 2,
    rating: 4.6,
    dist: 7,
    mood: ["animado"],
    outdoor: true,
    kidFriendly: false,
    nightOnly: false,
    slots: ["afternoon", "night"],
    why: "cerveza artesanal y patio con mesas compartidas",
  },
  {
    name: "Mixología Nueva Córdoba",
    emoji: "🍸",
    price: 3,
    rating: 4.7,
    dist: 8,
    mood: ["animado"],
    outdoor: false,
    kidFriendly: false,
    nightOnly: true,
    slots: ["night"],
    why: "coctelería de autor, para cerrar la noche en grande",
  },
];

const FINAL = [
  {
    name: "Heladería Cassata",
    emoji: "🍨",
    price: 1,
    rating: 4.6,
    dist: 3,
    mood: ["tranquilo"],
    outdoor: false,
    kidFriendly: true,
    nightOnly: false,
    slots: ["morning", "afternoon", "night"],
    why: "un cierre dulce que nunca falla",
  },
  {
    name: "Plaza San Martín de noche",
    emoji: "🌳",
    price: 1,
    rating: 4.5,
    dist: 4,
    mood: ["tranquilo"],
    outdoor: true,
    kidFriendly: true,
    nightOnly: true,
    slots: ["night"],
    why: "caminar un rato al aire libre después de comer",
  },
  {
    name: "Rooftop Calma",
    emoji: "🌙",
    price: 2,
    rating: 4.5,
    dist: 6,
    mood: ["tranquilo"],
    outdoor: true,
    kidFriendly: false,
    nightOnly: false,
    slots: ["afternoon", "night"],
    why: "terraza tranquila, buena para bajar el ritmo",
  },
  {
    name: "Jazz en el Sótano",
    emoji: "🎷",
    price: 2,
    rating: 4.6,
    dist: 8,
    mood: ["animado"],
    outdoor: false,
    kidFriendly: false,
    nightOnly: true,
    slots: ["night"],
    why: "música en vivo hasta tarde, para no cortar la noche",
  },
  {
    name: "Mirador del Cerro",
    emoji: "✨",
    price: 1,
    rating: 4.7,
    dist: 10,
    mood: ["animado", "tranquilo"],
    outdoor: true,
    kidFriendly: false,
    nightOnly: false,
    slots: ["afternoon", "night"],
    why: "una vista linda para cerrar el plan, aunque implica caminar un poco más",
  },
];

/* ------------------------------------------------------------------ */
/* Mock data — cultura                                                 */
/* ------------------------------------------------------------------ */

const CULTURA = [
  {
    name: "Galería Horizonte",
    emoji: "🖼️",
    price: 1,
    rating: 4.6,
    dist: 4,
    mood: ["tranquilo"],
    outdoor: false,
    kidFriendly: true,
    nightOnly: false,
    slots: ["morning", "afternoon"],
    why: "una muestra para recorrer sin apuro y descubrir algo distinto",
  },
  {
    name: "Museo del Centro",
    emoji: "🏛️",
    price: 1,
    rating: 4.5,
    dist: 6,
    mood: ["tranquilo"],
    outdoor: false,
    kidFriendly: true,
    nightOnly: false,
    slots: ["morning", "afternoon"],
    why: "un recorrido cultural ideal para dedicarle un rato al plan",
  },
  {
    name: "Teatro La Esquina",
    emoji: "🎭",
    price: 2,
    rating: 4.7,
    dist: 8,
    mood: ["animado", "tranquilo"],
    outdoor: false,
    kidFriendly: false,
    nightOnly: true,
    slots: ["night"],
    why: "una propuesta teatral para convertir la salida en una experiencia",
  },
  {
    name: "Centro de Arte Abierto",
    emoji: "🎨",
    price: 1,
    rating: 4.4,
    dist: 5,
    mood: ["tranquilo"],
    outdoor: false,
    kidFriendly: true,
    nightOnly: false,
    slots: ["afternoon"],
    why: "arte y actividades para salir de la rutina",
  },
];

/* ------------------------------------------------------------------ */
/* Mock data — paseo / aire libre                                      */
/* ------------------------------------------------------------------ */

const PASEO = [
  {
    name: "Paseo del Buen Pastor",
    emoji: "🌳",
    price: 1,
    rating: 4.6,
    dist: 4,
    mood: ["tranquilo", "animado"],
    outdoor: true,
    kidFriendly: true,
    nightOnly: false,
    slots: ["afternoon", "night"],
    why: "un recorrido abierto para caminar y disfrutar el entorno",
  },
  {
    name: "Parque Sarmiento",
    emoji: "🌿",
    price: 1,
    rating: 4.6,
    dist: 6,
    mood: ["tranquilo"],
    outdoor: true,
    kidFriendly: true,
    nightOnly: false,
    slots: ["morning", "afternoon"],
    why: "espacio verde para caminar, despejarse y bajar un cambio",
  },
  {
    name: "Costanera del Río",
    emoji: "🚶",
    price: 1,
    rating: 4.5,
    dist: 8,
    mood: ["tranquilo"],
    outdoor: true,
    kidFriendly: true,
    nightOnly: false,
    slots: ["morning", "afternoon"],
    why: "un recorrido al aire libre para caminar sin apuro",
  },
  {
    name: "Mirador del Cerro",
    emoji: "✨",
    price: 1,
    rating: 4.7,
    dist: 10,
    mood: ["tranquilo", "animado"],
    outdoor: true,
    kidFriendly: false,
    nightOnly: false,
    slots: ["afternoon", "night"],
    why: "una vista linda para convertir el paseo en una experiencia",
  },
];

/* ------------------------------------------------------------------ */
/* Mock data — aire libre                                              */
/* ------------------------------------------------------------------ */

const AIRE_LIBRE = [
  {
    name: "Parque Sarmiento",
    emoji: "🌳",
    price: 1,
    rating: 4.6,
    dist: 5,
    mood: ["tranquilo"],
    outdoor: true,
    kidFriendly: true,
    nightOnly: false,
    slots: ["morning", "afternoon"],
    why: "espacio verde grande para estar afuera y disfrutar sin apuro",
  },
  {
    name: "Paseo del Buen Pastor",
    emoji: "🌿",
    price: 1,
    rating: 4.4,
    dist: 6,
    mood: ["animado", "tranquilo"],
    outdoor: true,
    kidFriendly: true,
    nightOnly: false,
    slots: ["afternoon", "night"],
    why: "un espacio abierto para caminar y quedarse un rato afuera",
  },
  {
    name: "Costanera del Río",
    emoji: "🌊",
    price: 1,
    rating: 4.5,
    dist: 8,
    mood: ["tranquilo"],
    outdoor: true,
    kidFriendly: true,
    nightOnly: false,
    slots: ["morning", "afternoon"],
    why: "aire libre y recorrido tranquilo para disfrutar el día",
  },
  {
    name: "Mirador del Cerro",
    emoji: "✨",
    price: 1,
    rating: 4.7,
    dist: 10,
    mood: ["tranquilo", "animado"],
    outdoor: true,
    kidFriendly: false,
    nightOnly: false,
    slots: ["afternoon", "night"],
    why: "una vista abierta para cerrar el plan con algo diferente",
  },
];

/* ------------------------------------------------------------------ */
/* Mock data — fiesta                                                  */
/* ------------------------------------------------------------------ */

const FIESTA = [
  {
    name: "Bar Federal",
    emoji: "🍺",
    price: 1,
    rating: 4.3,
    dist: 5,
    mood: ["animado"],
    outdoor: false,
    kidFriendly: false,
    nightOnly: false,
    slots: ["night"],
    why: "un lugar con movimiento para arrancar la noche",
  },
  {
    name: "La Cervecería del Fondo",
    emoji: "🍻",
    price: 2,
    rating: 4.6,
    dist: 7,
    mood: ["animado"],
    outdoor: true,
    kidFriendly: false,
    nightOnly: false,
    slots: ["night"],
    why: "cerveza y ambiente con energía para entrar en clima",
  },
  {
    name: "Mixología Nueva Córdoba",
    emoji: "🍸",
    price: 3,
    rating: 4.7,
    dist: 8,
    mood: ["animado"],
    outdoor: false,
    kidFriendly: false,
    nightOnly: true,
    slots: ["night"],
    why: "tragos y ambiente nocturno para seguir la salida",
  },
  {
    name: "Jazz en el Sótano",
    emoji: "🎷",
    price: 2,
    rating: 4.6,
    dist: 8,
    mood: ["animado"],
    outdoor: false,
    kidFriendly: false,
    nightOnly: true,
    slots: ["night"],
    why: "música en vivo para darle más energía a la noche",
  },
];

/* ------------------------------------------------------------------ */
/* Mock data — familia                                                 */
/* ------------------------------------------------------------------ */

const ACTIVIDAD_FAMILIA = [
  {
    name: "Parque Sarmiento",
    emoji: "🌳",
    price: 1,
    rating: 4.6,
    dist: 5,
    mood: ["tranquilo"],
    outdoor: true,
    kidFriendly: true,
    nightOnly: false,
    slots: ["morning", "afternoon"],
    why: "espacio verde grande con juegos, ideal para que los chicos corran un rato",
  },
  {
    name: "Museo de los Niños",
    emoji: "🎨",
    price: 1,
    rating: 4.5,
    dist: 7,
    mood: ["animado"],
    outdoor: false,
    kidFriendly: true,
    nightOnly: false,
    slots: ["morning", "afternoon"],
    why: "actividades interactivas pensadas para chicos",
  },
  {
    name: "Paseo del Buen Pastor",
    emoji: "🎡",
    price: 1,
    rating: 4.4,
    dist: 6,
    mood: ["animado", "tranquilo"],
    outdoor: true,
    kidFriendly: true,
    nightOnly: false,
    slots: ["afternoon"],
    why: "patio abierto con espacio para jugar y algo de sombra",
  },
];

const MERIENDA_FAMILIA = [
  {
    name: "Heladería Cassata",
    emoji: "🍨",
    price: 1,
    rating: 4.6,
    dist: 3,
    mood: ["tranquilo"],
    outdoor: false,
    kidFriendly: true,
    nightOnly: false,
    slots: ["afternoon"],
    why: "una parada dulce que nunca falla con chicos",
  },
  {
    name: "Confitería El Ciervo",
    emoji: "🧁",
    price: 1,
    rating: 4.5,
    dist: 4,
    mood: ["tranquilo"],
    outdoor: false,
    kidFriendly: true,
    nightOnly: false,
    slots: ["afternoon"],
    why: "merienda tranquila con mesas amplias para toda la familia",
  },
  {
    name: "Waffle & Co",
    emoji: "🧇",
    price: 2,
    rating: 4.4,
    dist: 5,
    mood: ["animado"],
    outdoor: true,
    kidFriendly: true,
    nightOnly: false,
    slots: ["afternoon"],
    why: "terraza informal, buena opción si los chicos siguen con energía",
  },
];

const CIERRE_FAMILIA = [
  {
    name: "Pizzería de la Cañada",
    emoji: "🍕",
    price: 1,
    rating: 4.5,
    dist: 4,
    mood: ["animado"],
    outdoor: false,
    kidFriendly: true,
    nightOnly: false,
    slots: ["afternoon", "night"],
    why: "pizza para compartir y ambiente relajado para cerrar temprano",
  },
  {
    name: "La Parrillita Familiar",
    emoji: "🍖",
    price: 2,
    rating: 4.6,
    dist: 6,
    mood: ["tranquilo"],
    outdoor: false,
    kidFriendly: true,
    nightOnly: false,
    slots: ["afternoon", "night"],
    why: "menú simple y raciones para compartir, pensado para ir con chicos",
  },
  {
    name: "Patio de la Abuela",
    emoji: "🍝",
    price: 1,
    rating: 4.4,
    dist: 5,
    mood: ["tranquilo"],
    outdoor: true,
    kidFriendly: true,
    nightOnly: false,
    slots: ["afternoon", "night"],
    why: "patio tranquilo, cena liviana antes de volver a casa",
  },
];

/* ------------------------------------------------------------------ */
/* Lugares reales (Geoapify vía api/lugares.js)                        */
/*                                                                      */
/* No reemplaza los pools mock de arriba: los mock siguen siendo el    */
/* fallback si no hay ubicación, si falla la consulta, o si Geoapify   */
/* no devuelve resultados para esa zona/categoría.                     */
/* ------------------------------------------------------------------ */

/*
 * Relaciona cada array de pool mock con la clave de categoría que
 * entiende api/lugares.js. Se usa por referencia (no por nombre), así
 * que aunque cambie el contenido de los pools esto sigue funcionando.
 */
const POOL_KEYS = new Map([
  [CENA, "CENA"],
  [BEBIDA, "BEBIDA"],
  [FINAL, "FINAL"],
  [CULTURA, "CULTURA"],
  [PASEO, "PASEO"],
  [AIRE_LIBRE, "AIRE_LIBRE"],
  [FIESTA, "FIESTA"],
  [ACTIVIDAD_FAMILIA, "ACTIVIDAD_FAMILIA"],
  [MERIENDA_FAMILIA, "MERIENDA_FAMILIA"],
  [CIERRE_FAMILIA, "CIERRE_FAMILIA"],
]);

/*
 * Pide a api/lugares.js lugares reales de una categoría en una
 * ciudad/zona. Nunca lanza: si algo falla, devuelve [] y quien llama
 * cae de nuevo al pool mock correspondiente.
 */
async function fetchRealPool(poolKey, city) {
  try {
    const res = await fetch("/api/lugares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city, intent: poolKey }),
    });

    if (!res.ok) return [];

    const data = await res.json();

    return Array.isArray(data.places) ? data.places : [];
  } catch (err) {
    return [];
  }
}

/*
 * Dado un conjunto de steps (con su pool mock ya asignado) y una
 * ciudad, devuelve un mapa { poolKey: [lugares reales] } solo para
 * las categorías que realmente hacen falta en este plan, y solo si
 * Geoapify encontró algo.
 */
async function fetchPoolOverrides(steps, city) {
  if (!city) return {};

  const neededKeys = [
    ...new Set(
      steps
        .map((step) => POOL_KEYS.get(step.pool))
        .filter(Boolean)
    ),
  ];

  if (neededKeys.length === 0) return {};

  const results = await Promise.all(
    neededKeys.map(async (key) => [
      key,
      await fetchRealPool(key, city),
    ])
  );

  const overrides = {};

  for (const [key, places] of results) {
    if (places.length > 0) {
      overrides[key] = places;
    }
  }

  return overrides;
}

/* ------------------------------------------------------------------ */
/* Plantillas                                                          */
/* ------------------------------------------------------------------ */

const STEPS_NIGHT = [
  {
    key: "cena",
    label: "PARA ARRANCAR",
    time: "20:30",
    pool: CENA,
  },
  {
    key: "bebida",
    label: "SEGUIR",
    time: "22:15",
    pool: BEBIDA,
  },
  {
    key: "final",
    label: "PARA TERMINAR",
    time: "23:30",
    pool: FINAL,
  },
];

const STEPS_DAY = [
  {
    key: "cena",
    label: "PARA ARRANCAR",
    time: "17:00",
    pool: CENA,
  },
  {
    key: "bebida",
    label: "SEGUIR",
    time: "18:30",
    pool: BEBIDA,
  },
  {
    key: "final",
    label: "PARA TERMINAR",
    time: "20:00",
    pool: FINAL,
  },
];

const STEPS_MORNING = [
  {
    key: "cena",
    label: "PARA ARRANCAR",
    time: "10:30",
    pool: CENA,
  },
  {
    key: "bebida",
    label: "SEGUIR",
    time: "12:00",
    pool: BEBIDA,
  },
  {
    key: "final",
    label: "PARA TERMINAR",
    time: "13:30",
    pool: FINAL,
  },
];

const STEPS_MIDDAY = [
  {
    key: "cena",
    label: "PARA ARRANCAR",
    time: "12:30",
    pool: CENA,
  },
  {
    key: "bebida",
    label: "SEGUIR",
    time: "14:00",
    pool: BEBIDA,
  },
  {
    key: "final",
    label: "PARA TERMINAR",
    time: "15:30",
    pool: FINAL,
  },
];

const STEPS_FAMILY = [
  {
    key: "actividad",
    label: "PARA ARRANCAR",
    time: "16:00",
    pool: ACTIVIDAD_FAMILIA,
  },
  {
    key: "merienda",
    label: "SEGUIR",
    time: "17:30",
    pool: MERIENDA_FAMILIA,
  },
  {
    key: "cierre",
    label: "PARA TERMINAR",
    time: "19:00",
    pool: CIERRE_FAMILIA,
  },
];

/* ------------------------------------------------------------------ */
/* Nuevos planes según intención                                      */
/* ------------------------------------------------------------------ */

/*
 * Ahora el segundo paso también sale del pool de CULTURA (en vez de
 * merienda), para que la intención cultural pese más en la estructura
 * del plan. Si a esa hora no queda ningún lugar cultural abierto,
 * pick() cae de forma natural a su fallback habitual.
 */
const STEPS_CULTURA = [
  {
    key: "cultura",
    label: "PARA ARRANCAR",
    time: "16:00",
    pool: CULTURA,
  },
  {
    key: "cultura_2",
    label: "SEGUIR",
    time: "18:00",
    pool: CULTURA,
  },
  {
    key: "paseo",
    label: "PARA TERMINAR",
    time: "19:30",
    pool: PASEO,
  },
];

const STEPS_PASEO = [
  {
    key: "paseo",
    label: "PARA ARRANCAR",
    time: "16:00",
    pool: PASEO,
  },
  {
    key: "merienda",
    label: "SEGUIR",
    time: "17:45",
    pool: MERIENDA_FAMILIA,
  },
  {
    key: "cierre",
    label: "PARA TERMINAR",
    time: "19:15",
    pool: PASEO,
  },
];

/*
 * El paso del medio ahora también sale de AIRE_LIBRE (antes usaba
 * MERIENDA_FAMILIA, que podía traer lugares como "Waffle & Co" que
 * rompen la sensación de "estar al aire libre").
 */
const STEPS_AIRE_LIBRE = [
  {
    key: "aire",
    label: "PARA ARRANCAR",
    time: "16:00",
    pool: AIRE_LIBRE,
  },
  {
    key: "aire_2",
    label: "SEGUIR",
    time: "17:45",
    pool: AIRE_LIBRE,
  },
  {
    key: "aire_final",
    label: "PARA TERMINAR",
    time: "19:15",
    pool: AIRE_LIBRE,
  },
];

const STEPS_COMER = [
  {
    key: "comer",
    label: "PARA ARRANCAR",
    time: "20:00",
    pool: CENA,
  },
  {
    key: "postre",
    label: "SEGUIR",
    time: "22:00",
    pool: FINAL,
  },
  {
    key: "paseo",
    label: "PARA TERMINAR",
    time: "23:00",
    pool: PASEO,
  },
];

const STEPS_BEBER = [
  {
    key: "beber",
    label: "PARA ARRANCAR",
    time: "20:30",
    pool: BEBIDA,
  },
  {
    key: "comida",
    label: "SEGUIR",
    time: "22:00",
    pool: CENA,
  },
  {
    key: "cierre",
    label: "PARA TERMINAR",
    time: "23:30",
    pool: FINAL,
  },
];

const STEPS_FIESTA = [
  {
    key: "previa",
    label: "PARA ARRANCAR",
    time: "21:00",
    pool: CENA,
  },
  {
    key: "fiesta",
    label: "SEGUIR",
    time: "23:00",
    pool: FIESTA,
  },
  {
    key: "cierre",
    label: "PARA TERMINAR",
    time: "01:00",
    pool: FIESTA,
  },
];

const BUDGET_TIER = {
  Económico: 1,
  Medio: 2,
  Flexible: 3,
};

/* ------------------------------------------------------------------ */
/* Interpretación heurística                                           */
/* ------------------------------------------------------------------ */

/*
 * Patrones de intención evaluados por posición en el texto: la
 * intención "principal" es la que aparece primero en la frase, no la
 * última regla que matchea en una cadena de if/else. Esto evita, por
 * ejemplo, que "quiero tomar algo tranquilo... y después pasear" se
 * interprete como "paseo" en vez de "beber" solo porque el patrón de
 * paseo estaba antes en el código.
 */
const INTENT_PATTERNS = [
  { intent: "aire_libre", regex: /aire libre|al aire libre|afuera|naturaleza/ },
  { intent: "cultura", regex: /museo|exposicion|arte|cultural|cultura|teatro/ },
  {
    intent: "paseo",
    regex: /pasear|paseo|caminar|dar una vuelta|recorrer|salir a pasear/,
  },
  { intent: "fiesta", regex: /fiesta|boliche|bailar|salir de fiesta/ },
  { intent: "beber", regex: /tomar algo|tragos|cerveza|\bbar\b|copas|vermut/ },
  { intent: "comer", regex: /comer|cenar|almorzar|comida|comer rico/ },
];

function detectIntentByPosition(t) {
  let bestIntent = null;
  let bestIndex = Infinity;

  for (const { intent, regex } of INTENT_PATTERNS) {
    const match = t.match(regex);

    if (match && match.index < bestIndex) {
      bestIndex = match.index;
      bestIntent = intent;
    }
  }

  return bestIntent;
}

function parseInputHeuristic(text) {
  const t = normalizeText(text);

  const out = {
    location: null,
    people: null,
    budget: null,
    mood: null,
    intent: "general",
    close: false,
    outdoor: false,
    hasKids: false,
    morning: false,
    afternoon: false,
    night: false,
    daytimeGeneric: false,
    explicitHour: null,
    earlier: false,
  };

  const locMatch = t.match(
    /en ([a-z\s]+?)(,|\.|$| que| y | somos| quiero| queremos)/
  );

  if (locMatch) {
    out.location = normalizeLocation(locMatch[1].trim());
  }

  if (/\bsolo\b|\bsola\b/.test(t)) {
    out.people = "Solo";
  } else if (
    /pareja|somos dos|los dos|una cita|cita\b/.test(t)
  ) {
    out.people = "Pareja";
  } else if (/amigos|amigas|somos (tres|cuatro|cinco|seis|siete|ocho)/.test(t)) {
    out.people = "Amigos";
  } else if (/familia/.test(t)) {
    out.people = "Familia";
  }

  if (
    /ninos|ninas|con los chicos|con mis hijos|con mi hijo|con mi hija|\bhijos\b|\bhijas\b|nene\b|nena\b/.test(
      t
    )
  ) {
    out.hasKids = true;
    out.people = "Familia";
  }

  if (
    /a la manana|por la manana|de manana|en la manana|\btemprano\b|a primera hora/.test(
      t
    )
  ) {
    out.morning = true;
  }

  if (/por la tarde|esta tarde|de tarde|a la tarde/.test(t)) {
    out.afternoon = true;
  }

  if (/esta noche|a la noche|de noche|por la noche/.test(t)) {
    out.night = true;
  }

  if (
    /pasar el dia|plan de dia|durante el dia|de dia\b|para el dia|pasar todo el dia|todo el dia/.test(
      t
    )
  ) {
    out.daytimeGeneric = true;
  }

  const hourMatch = t.match(/a las?\s+(\d{1,2})(?:\s*(?:de la manana|de la tarde|de la noche))?/);

  if (hourMatch) {
    let hour = parseInt(hourMatch[1], 10);
    const suffix = hourMatch[0];

    if (/de la tarde/.test(suffix) && hour < 12) {
      hour += 12;
    }

    if (/de la noche/.test(suffix) && hour < 12) {
      hour += 12;
    }

    out.explicitHour = hour;
  }

  if (
    /barato|econom|gastar poco|poca plata|gastar menos|presupuesto bajo|poco presupuesto|no quiero gastar mucho|no queremos gastar mucho|nada muy caro|nada demasiado caro/.test(
      t
    )
  ) {
    out.budget = "Económico";
  } else if (/medio|moderad/.test(t)) {
    out.budget = "Medio";
  } else if (
    /flexible|no importa|lo que sea|sin limite|presupuesto alto/.test(t)
  ) {
    out.budget = "Flexible";
  }

  if (
    /tranquil|relaj|charlar|hablar tranquilos|conversar|podamos hablar|poder hablar|queremos hablar|no.*lleno de gente|no.*mucha gente/.test(
      t
    )
  ) {
    out.mood = "Tranquilo";
  } else if (
    /fiesta|animad|divertid|previa|boliche|bailar/.test(t)
  ) {
    out.mood = "Animado";
  }

  if (
    /no quiero caminar|no caminar mucho|no caminar tanto|sin caminar|caminar poco|caminar menos|que quede cerca|bien cerca|cerca tuyo|no quiero manejar|no manejar mucho|no manejar tanto|sin manejar mucho/.test(
      t
    )
  ) {
    out.close = true;
  }

  if (/aire libre|al aire libre|afuera|naturaleza/.test(t)) {
    out.outdoor = true;
  }

  const detectedIntent = detectIntentByPosition(t);

  if (detectedIntent) {
    out.intent = detectedIntent;
  }

  if (out.hasKids || out.people === "Familia") {
    out.intent = "familia";
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Interpretación IA                                                   */
/* ------------------------------------------------------------------ */

async function parseInputAI(text) {
  const res = await fetch("/api/interpretar", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error("interpretar-api-error");
  }

  const data = await res.json();

  if (!data || typeof data !== "object") {
    throw new Error("interpretar-api-bad-shape");
  }

  return {
    location: normalizeLocation(data.location),
    people: data.people ?? null,
    budget: data.budget ?? null,
    mood: data.mood ?? null,
    intent: data.intent ?? "general",
    close: !!data.close,
    outdoor: !!data.outdoor,
    hasKids: !!data.hasKids,
    morning: !!data.morning,
    afternoon: !!data.afternoon,
    night: !!data.night,
    daytimeGeneric: !!data.daytimeGeneric,
    explicitHour:
      typeof data.explicitHour === "number"
        ? data.explicitHour
        : null,
    earlier: !!data.earlier,
  };
}

/*
 * Combina lo que devuelve la IA con el heurístico local, usando el
 * heurístico como red de seguridad para señales que son fáciles de
 * verificar directamente contra el texto:
 *
 * - Si el texto no tiene un patrón "a las N" explícito, no confiamos
 *   en una hora exacta que la IA haya podido inferir de más (esto es
 *   lo que causaba el bug del primer paso saliendo siempre a una hora
 *   rara en "quiero pasar el día").
 * - "Pasar el día" es una señal fuerte: si el heurístico la detecta,
 *   se respeta aunque la IA no la haya marcado, y no debe quedar
 *   compitiendo con ninguna franja específica.
 */
function mergeInterpretations(ai, local) {
  const merged = { ...ai };

  // Si la heurística local detecta una intención explícita,
  // tiene prioridad sobre una interpretación diferente de Gemini.
  if (local.intent && local.intent !== "general") {
    merged.intent = local.intent;
  }

  if (local.explicitHour === null || local.explicitHour === undefined) {
    merged.explicitHour = null;
  }

  merged.daytimeGeneric = !!(merged.daytimeGeneric || local.daytimeGeneric);

  if (
    merged.daytimeGeneric &&
    (merged.explicitHour === null || merged.explicitHour === undefined)
  ) {
    merged.morning = false;
    merged.afternoon = false;
    merged.night = false;
  }

  return merged;
}

/* ------------------------------------------------------------------ */
/* Selección inteligente                                               */
/* ------------------------------------------------------------------ */

function pick(
  pool,
  {
    budgetTier,
    mood,
    close,
    outdoor,
    hasKids,
    timeBucket,
    exactMinute,
    usedNames,
    excludeNames,
    allowNightOnly,
    random,
  }
) {
  if (!pool || pool.length === 0) return null;

  const excluded = new Set([
    ...(usedNames || []),
    ...(excludeNames || []),
  ]);

  let candidates = pool.filter(
    (p) => !excluded.has(p.name)
  );

  if (candidates.length === 0) {
    candidates = pool.filter(
      (p) => !(usedNames || []).includes(p.name)
    );
  }

  if (candidates.length === 0) {
    candidates = pool;
  }

  if (!allowNightOnly) {
    const noNight = candidates.filter(
      (p) => !p.nightOnly
    );

    if (noNight.length > 0) {
      candidates = noNight;
    }
  }

  /*
   * 1) HORA COMPATIBLE — el filtro más protegido: si existe al menos
   * un lugar abierto exactamente a esa hora, nunca recomendamos uno
   * cerrado, aunque eso implique relajar filtros más adelante (mood,
   * presupuesto, etc). Solo si NINGÚN lugar del pool está abierto a
   * esa hora exacta, seguimos con el conjunto anterior.
   */
  if (typeof exactMinute === "number") {
    const openNow = candidates.filter((p) =>
      isOpenAt(p, exactMinute)
    );

    if (openNow.length > 0) {
      candidates = openNow;
    }
  }

  if (timeBucket) {
    const byTime = candidates.filter(
      (p) =>
        !p.slots ||
        p.slots.includes(timeBucket)
    );

    if (byTime.length > 0) {
      candidates = byTime;
    }
  }

  /*
   * 2) Presupuesto — en presupuesto económico NO relajamos el filtro
   * si existen opciones económicas. Esto conserva el comportamiento
   * que ya había funcionado bien.
   */
  if (budgetTier) {
    const byBudget = candidates.filter(
      (p) => p.price <= budgetTier
    );

    if (byBudget.length > 0) {
      candidates = byBudget;
    }
  }

  /* 3) Niños / grupo familiar */
  if (hasKids) {
    const family = candidates.filter(
      (p) => p.kidFriendly
    );

    if (family.length > 0) {
      candidates = family;
    }
  }

  /* 4) Aire libre */
  if (outdoor) {
    const outside = candidates.filter(
      (p) => p.outdoor
    );

    if (outside.length > 0) {
      candidates = outside;
    }
  }

  /* 5) Mood */
  if (mood) {
    const moodKey = mood.toLowerCase();

    const byMood = candidates.filter(
      (p) =>
        Array.isArray(p.mood) &&
        p.mood.includes(moodKey)
    );

    if (byMood.length > 0) {
      candidates = byMood;
    }
  }

  /*
   * 6) Cercanía / rating — cuando pide "cerca", elegimos realmente la
   * opción más cercana dentro del conjunto compatible. Si no, evitamos
   * que siempre salga el mismo lugar ordenando por rating y eligiendo
   * entre los mejores.
   */
  if (close && !random) {
    return [...candidates].sort(
      (a, b) => a.dist - b.dist
    )[0];
  }

  const ranked = [...candidates].sort(
    (a, b) => b.rating - a.rating
  );

  const top = ranked.slice(
    0,
    Math.min(3, ranked.length)
  );

  return top[
    Math.floor(Math.random() * top.length)
  ];
}

/* ------------------------------------------------------------------ */
/* Tiempo                                                              */
/* ------------------------------------------------------------------ */

function shiftTime(timeStr, minutes) {
  if (!minutes) return timeStr;

  const [h, m] = timeStr
    .split(":")
    .map(Number);

  let total = h * 60 + m + minutes;

  /*
   * Permitimos que un plan de fiesta pueda cruzar medianoche.
   */
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);

  const hh = String(
    Math.floor(total / 60)
  ).padStart(2, "0");

  const mm = String(
    total % 60
  ).padStart(2, "0");

  return `${hh}:${mm}`;
}

function getTimeBucket({
  morning,
  afternoon,
  daytimeGeneric,
  explicitHour,
  night,
}) {
  if (explicitHour !== null && explicitHour !== undefined) {
    if (explicitHour >= 5 && explicitHour < 12) {
      return "morning";
    }

    if (explicitHour >= 12 && explicitHour < 19) {
      return "afternoon";
    }

    return "night";
  }

  if (morning) return "morning";
  if (afternoon) return "afternoon";
  if (daytimeGeneric) return "afternoon";
  if (night) return "night";

  return "night";
}

/* ------------------------------------------------------------------ */
/* Elegir plantilla según intención                                   */
/* ------------------------------------------------------------------ */

function getSteps({
  intent,
  hasKids,
  morning,
  afternoon,
  daytimeGeneric,
  timeBucket,
  random,
}) {
  if (random) return STEPS_NIGHT;

  if (hasKids || intent === "familia") {
    return STEPS_FAMILY;
  }

  if (intent === "cultura") {
    return STEPS_CULTURA;
  }

  if (intent === "paseo") {
    return STEPS_PASEO;
  }

  if (intent === "aire_libre") {
    return STEPS_AIRE_LIBRE;
  }

  if (intent === "comer") {
    /*
     * Si pide comer a la mañana/tarde, mantenemos horarios
     * coherentes en vez de obligarlo a cenar.
     */
    if (timeBucket === "morning") {
      return [
        {
          key: "comer",
          label: "PARA ARRANCAR",
          time: "10:30",
          pool: CENA,
        },
        {
          key: "cafe",
          label: "SEGUIR",
          time: "12:00",
          pool: MERIENDA_FAMILIA,
        },
        {
          key: "paseo",
          label: "PARA TERMINAR",
          time: "13:30",
          pool: PASEO,
        },
      ];
    }

    if (
      timeBucket === "afternoon"
    ) {
      return [
        {
          key: "comer",
          label: "PARA ARRANCAR",
          time: "17:00",
          pool: CENA,
        },
        {
          key: "postre",
          label: "SEGUIR",
          time: "18:30",
          pool: MERIENDA_FAMILIA,
        },
        {
          key: "paseo",
          label: "PARA TERMINAR",
          time: "20:00",
          pool: PASEO,
        },
      ];
    }

    return STEPS_COMER;
  }

  if (intent === "beber") {
    if (timeBucket === "afternoon") {
      return [
        {
          key: "beber",
          label: "PARA ARRANCAR",
          time: "17:00",
          pool: BEBIDA,
        },
        {
          key: "comida",
          label: "SEGUIR",
          time: "18:30",
          pool: CENA,
        },
        {
          key: "cierre",
          label: "PARA TERMINAR",
          time: "20:00",
          pool: FINAL,
        },
      ];
    }

    return STEPS_BEBER;
  }

  if (intent === "fiesta") {
    return STEPS_FIESTA;
  }

  if (morning) return STEPS_MORNING;
  if (afternoon) return STEPS_DAY;
  if (daytimeGeneric) return STEPS_MIDDAY;

  return STEPS_NIGHT;
}

/* ------------------------------------------------------------------ */
/* Generación del plan                                                 */
/* ------------------------------------------------------------------ */

async function generatePlan({
  budgetLabel,
  moodLabel,
  close,
  outdoor,
  hasKids,
  morning,
  afternoon,
  night,
  daytimeGeneric,
  explicitHour,
  timeShiftMin,
  random,
  excludeNames,
  intent = "general",
  location,
} = {}) {
  const budgetTier = random
    ? null
    : BUDGET_TIER[budgetLabel] || null;

  const mood = random
    ? null
    : moodLabel || null;

  const timeBucket = getTimeBucket({
    morning,
    afternoon,
    daytimeGeneric,
    explicitHour,
    night,
  });

  const steps = getSteps({
    intent,
    hasKids,
    morning,
    afternoon,
    daytimeGeneric,
    timeBucket,
    random,
  });

  /*
   * Si hay ciudad/zona y no es un plan sorpresa, buscamos lugares
   * reales para las categorías que este plan necesita. Si no hay
   * ubicación, si falla la consulta o si Geoapify no devuelve nada
   * para alguna categoría, esa categoría sigue usando su pool mock
   * de siempre (nunca se inventan lugares).
   */
  const poolOverrides = !random
    ? await fetchPoolOverrides(steps, location)
    : {};

  const allowNightOnly =
    random ||
    timeBucket === "night";

  const usedNames = [];

  return steps.map((step) => {
    /*
     * Orden correcto: primero calculamos la hora final del paso,
     * después el lugar. Así evitamos recomendar lugares cerrados
     * (antes se elegía el lugar según la franja general y recién
     * después se calculaba/mostraba la hora).
     */
    let time = step.time;

    if (!random) {
      time = shiftTime(
        step.time,
        timeShiftMin || 0
      );
    }

    const exactMinute = timeToMinutes(time);

    const poolKey = POOL_KEYS.get(step.pool);

    const activePool =
      poolKey && poolOverrides[poolKey]
        ? poolOverrides[poolKey]
        : step.pool;

    const venue = pick(activePool, {
      budgetTier,
      mood,
      close: random ? false : close,
      outdoor: random ? false : outdoor,
      hasKids,
      timeBucket,
      exactMinute,
      usedNames,
      excludeNames: random
        ? []
        : excludeNames,
      allowNightOnly,
      random,
    });

    /*
     * Salvaguarda por si un pool se queda sin opciones.
     */
    // Con ubicación del usuario, NO usamos lugares mock como fallback.
    // Si Geoapify no devuelve un lugar real adecuado, dejamos venue en null
    // para que la interfaz pueda informar que no encontró resultados.
    const safeVenue =
      location && String(location).trim()
        ? venue || null
        : venue || activePool[0];

    if (safeVenue) {
      usedNames.push(safeVenue.name);
    }

    return {
      ...step,
      time,
      venue: safeVenue,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

const priceLabel = (n) =>
  "$".repeat(
    n === 1
      ? 1
      : n === 2
      ? 2
      : 3
  );

const ratingLabel = (n) =>
  n.toFixed(1).replace(".", ",");

const distanceLabel = (
  i,
  dist
) =>
  i === 0
    ? `${dist} min caminando`
    : `${dist} min desde la parada anterior`;

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function Chip({
  icon: Icon,
  placeholder,
  value,
  options,
  onChange,
}) {
  const handleClick = () => {
    const idx =
      options.indexOf(value);

    const next =
      idx + 1 >= options.length
        ? null
        : options[idx + 1];

    onChange(next);
  };

  return (
    <button
      className={`chip ${
        value ? "chip--set" : ""
      }`}
      onClick={handleClick}
      type="button"
    >
      <Icon
        size={14}
        strokeWidth={2}
        className="chip__icon"
      />
      <span>
        {value || placeholder}
      </span>
    </button>
  );
}

function Logo({ size = 28 }) {
  const w = size * 4.6;
  const h = size * 1.5;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="logo-svg"
      aria-label="salime."
    >
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
        d={`M ${w * 0.865} ${
          h * 0.56
        } Q ${w * 0.9} ${
          h * 0.34
        } ${w * 0.935} ${
          h * 0.32
        }`}
        stroke={C.coral}
        strokeWidth={size * 0.065}
        strokeLinecap="round"
        fill="none"
      />

      <circle
        cx={w * 0.94}
        cy={h * 0.3}
        r={size * 0.065}
        fill={C.coral}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

function HomeScreen({
  onPlan,
  onSurprise,
}) {
  const [text, setText] =
    useState("");

  const [filters, setFilters] =
    useState({
      location: null,
      budget: null,
      people: null,
      vibe: null,
    });

  const understood =
    useMemo(
      () =>
        parseInputHeuristic(text),
      [text]
    );

  const understoodChips =
    [];

  if (
    filters.location ||
    understood.location
  ) {
    understoodChips.push(
      `📍 ${
        filters.location ||
        understood.location
      }`
    );
  }

  if (
    filters.people ||
    understood.people
  ) {
    understoodChips.push(
      `👥 ${
        filters.people ||
        understood.people
      }`
    );
  }

  if (
    filters.budget ||
    understood.budget
  ) {
    understoodChips.push(
      `💰 ${
        filters.budget ||
        understood.budget
      }`
    );
  }

  if (
    understood.mood &&
    !filters.vibe
  ) {
    understoodChips.push(
      `✨ ${understood.mood}`
    );
  }

  if (
    understood.intent &&
    understood.intent !== "general"
  ) {
    understoodChips.push(
      `🎯 ${
        INTENT_LABEL[
          understood.intent
        ]
      }`
    );
  }

  if (understood.outdoor) {
    understoodChips.push(
      "🌿 Al aire libre"
    );
  }

  const handleSubmit =
    async () => {
      const localHeuristic =
        understood;

      let interpreted =
        localHeuristic;

      try {
        const aiResult =
          await parseInputAI(
            text
          );

        if (aiResult) {
          interpreted =
            mergeInterpretations(
              aiResult,
              localHeuristic
            );
        }
      } catch (err) {
        /*
         * Fallback local.
         */
      }

      const budgetLabel =
        filters.budget ||
        interpreted.budget;

      let intent =
        interpreted.intent ||
        "general";

      /*
       * Los chips manuales tienen prioridad
       * sobre la interpretación de intención.
       */
      if (filters.vibe) {
        intent =
          VIBE_INTENT[
            filters.vibe
          ] || intent;
      }

      const moodLabel =
        interpreted.mood ||
        (intent === "fiesta"
          ? "Animado"
          : null);

      const close =
        interpreted.close ||
        filters.location ===
          "Cerca tuyo";

      const outdoor =
        interpreted.outdoor ||
        intent ===
          "aire_libre";

      const hasKids =
        interpreted.hasKids ||
        filters.people ===
          "Familia" ||
        intent ===
          "familia";

      const location =
        filters.location &&
        filters.location !==
          "Cerca tuyo"
          ? filters.location
          : interpreted.location;

      const people =
        filters.people ||
        interpreted.people;

      let morning =
        !!interpreted.morning;

      let afternoon =
        !!interpreted.afternoon;

      let night =
        !!interpreted.night;

      let daytimeGeneric =
        !!interpreted.daytimeGeneric;

      const explicitHour =
        interpreted.explicitHour;

      /*
       * Una hora exacta tiene prioridad.
       */
      if (
        explicitHour !== null &&
        explicitHour !== undefined
      ) {
        morning = false;
        afternoon = false;
        night = false;
        daytimeGeneric = false;

        if (
          explicitHour >= 5 &&
          explicitHour < 12
        ) {
          morning = true;
        } else if (
          explicitHour >= 12 &&
          explicitHour < 19
        ) {
          afternoon = true;
        } else {
          night = true;
        }
      } else {
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

      let timeShiftMin = 0;

      if (
        explicitHour !== null &&
        explicitHour !== undefined
      ) {
        const base =
          hasKids ||
          intent === "familia"
            ? STEPS_FAMILY
            : getSteps({
                intent,
                hasKids,
                morning,
                afternoon,
                daytimeGeneric,
                timeBucket:
                  getTimeBucket({
                    morning,
                    afternoon,
                    daytimeGeneric,
                    explicitHour,
                    night,
                  }),
              });

        const [
          bh,
          bm,
        ] = base[0].time
          .split(":")
          .map(Number);

        timeShiftMin =
          explicitHour * 60 -
          (bh * 60 + bm);
      }

      const context = [];

      if (location) {
        context.push(
          `📍 ${normalizeLocation(
            location
          )}`
        );
      }

      if (people) {
        context.push(
          `👥 ${people}`
        );
      }

      if (budgetLabel) {
        context.push(
          `💰 ${budgetLabel}`
        );
      }

      if (intent !== "general") {
        context.push(
          `🎯 ${
            INTENT_LABEL[
              intent
            ]
          }`
        );
      }

      if (outdoor) {
        context.push(
          "🌿 al aire libre"
        );
      }

      if (explicitHour !== null) {
        context.push(
          `🕐 ${String(
            explicitHour
          ).padStart(
            2,
            "0"
          )}:00`
        );
      }

      onPlan({
        budgetLabel,
        moodLabel,
        close,
        outdoor,
        hasKids,
        morning,
        afternoon,
        night,
        daytimeGeneric,
        explicitHour,
        timeShiftMin,
        intent,
        location,
        people,
        hasContext:
          context.length > 0,
        contextLine:
          context.join(" · "),
      });
    };

  return (
    <div className="screen">
      <div className="home-top">
        <Logo size={26} />
      </div>

      <p className="tagline">
        Tu plan, sin tener que
        pensarlo.
      </p>

      <h1 className="q">
        ¿Qué tenés ganas de
        hacer?
      </h1>

      <textarea
        className="input-main"
        rows={3}
        placeholder="Estoy en Nueva Córdoba, somos dos, queremos comer rico, gastar poco y después hacer algo tranquilo."
        value={text}
        onChange={(e) =>
          setText(e.target.value)
        }
      />

      {understoodChips.length >
        0 && (
        <p className="understood">
          Entendí:{" "}
          {understoodChips.join(
            " · "
          )}
        </p>
      )}

      <div className="chip-row">
        <Chip
          icon={MapPin}
          placeholder="Dónde"
          value={
            filters.location
          }
          options={[
            "Cerca tuyo",
            "Centro",
            "Nueva Córdoba",
            "Güemes",
            "Alta Córdoba",
          ]}
          onChange={(v) =>
            setFilters((f) => ({
              ...f,
              location: v,
            }))
          }
        />

        <Chip
          icon={Wallet}
          placeholder="Presupuesto"
          value={
            filters.budget
          }
          options={[
            "Económico",
            "Medio",
            "Flexible",
          ]}
          onChange={(v) =>
            setFilters((f) => ({
              ...f,
              budget: v,
            }))
          }
        />

        <Chip
          icon={Users}
          placeholder="Con quién"
          value={
            filters.people
          }
          options={[
            "Solo",
            "Pareja",
            "Amigos",
            "Familia",
          ]}
          onChange={(v) =>
            setFilters((f) => ({
              ...f,
              people: v,
            }))
          }
        />

        <Chip
          icon={Sparkles}
          placeholder="Qué onda"
          value={
            filters.vibe
          }
          options={[
            "Comer",
            "Tomar algo",
            "Paseo",
            "Cultura",
            "Fiesta",
          ]}
          onChange={(v) =>
            setFilters((f) => ({
              ...f,
              vibe: v,
            }))
          }
        />
      </div>

      <div className="cta-stack">
        <button
          className="btn btn--primary"
          onClick={
            handleSubmit
          }
          disabled={!text.trim()}
        >
          ✨ Armame el plan
        </button>

        <button
          className="btn btn--secondary"
          onClick={onSurprise}
        >
          🎲 Sorprendeme
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

function Timeline({
  plan,
  surprise,
}) {
  return (
    <div className="timeline">
      {plan.map(
        (step, i) => (
          <div
            className="tl-row"
            key={`${step.key}-${i}`}
          >
            <div className="tl-marker-col">
              <div
                className={`tl-dot ${
                  surprise
                    ? "tl-dot--coral"
                    : ""
                }`}
              >
                {
                  step.venue
                    .emoji
                }
              </div>

              {i <
                plan.length -
                  1 && (
                <div className="tl-line" />
              )}
            </div>

            <div className="tl-content">
              <div className="tl-eyebrow">
                <span
                  className="tl-eyebrow-dot"
                  aria-hidden="true"
                />
                {step.label}
              </div>

              <div className="tl-time">
                {step.time}
              </div>

              <div className="tl-card">
                <div className="tl-card-name">
                  {
                    step
                      .venue
                      .name
                  }
                </div>

                <div className="tl-card-meta">
                  ⭐{" "}
                  {step.venue ? ratingLabel(
                    step
                      .venue
                      .rating
                  ) : "—"}{" "}
                  ·{" "}
                  {step.venue ? priceLabel(
                    step
                      .venue
                      .price
                  ) : "—"}{" "}
                  · 📍{" "}
                  {step.venue ? distanceLabel(
                    i,
                    step
                      .venue
                      .dist
                  ) : "No disponible"}
                </div>

                <p className="tl-card-why">
                  Porque{" "}
                  {
                    step
                      .venue
                      .why
                  }
                  .
                </p>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

function ResultScreen({
  plan,
  surprise,
  contextLine,
  working,
  onAdjust,
  onReshuffle,
  onHome,
}) {
  return (
    <div className="screen">
      <button
        className="back-link"
        onClick={onHome}
        disabled={working}
      >
        <ArrowLeft
          size={16}
        />
        Empezar de nuevo
      </button>

      <h1 className="h1">
        {surprise
          ? "🎲 Te armamos algo inesperado"
          : "✨ Tu plan está listo"}
      </h1>

      <p className="sub">
        {surprise
          ? "Elegimos algo distinto para hoy. Si no era lo que buscabas, lo volvemos a tirar."
          : contextLine
          ? `Encontré una opción que combina ${contextLine}.`
          : "Encontré una opción pensada para hoy."}
      </p>

      <Timeline
        plan={plan}
        surprise={surprise}
      />

      <div
        className="cta-stack"
        style={{
          marginTop: 28,
        }}
      >
        {surprise ? (
          <button
            className="btn btn--secondary"
            onClick={
              onReshuffle
            }
            disabled={working}
          >
            {working
              ? "Pensando…"
              : "🔄 Sorprendeme de nuevo"}
          </button>
        ) : (
          <button
            className="btn btn--primary"
            onClick={onAdjust}
            disabled={working}
          >
            ¿Querés cambiar algo?
            <ArrowRight
              size={16}
            />
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Adjust                                                              */
/* ------------------------------------------------------------------ */

function AdjustScreen({
  onQuick,
  onFreeText,
  onBack,
  working,
}) {
  const [text, setText] =
    useState("");

  const [sent, setSent] =
    useState(false);

  const submit = () => {
    if (
      !text.trim() ||
      working
    ) {
      return;
    }

    onFreeText(text);

    setSent(true);
    setText("");

    setTimeout(
      () => setSent(false),
      1800
    );
  };

  return (
    <div className="screen">
      <button
        className="back-link"
        onClick={onBack}
        disabled={working}
      >
        <ArrowLeft
          size={16}
        />
        Volver al plan
      </button>

      <h1 className="h1">
        ¿Querés cambiar algo?
      </h1>

      <div className="quick-grid">
        <button
          className="btn btn--chip"
          onClick={() =>
            onQuick("barato")
          }
          disabled={working}
        >
          💰 Más barato
        </button>

        <button
          className="btn btn--chip"
          onClick={() =>
            onQuick("cerca")
          }
          disabled={working}
        >
          🚶 Más cerca
        </button>

        <button
          className="btn btn--chip"
          onClick={() =>
            onQuick("divertido")
          }
          disabled={working}
        >
          🎉 Más divertido
        </button>

        <button
          className="btn btn--chip"
          onClick={() =>
            onQuick("tranquilo")
          }
          disabled={working}
        >
          🌙 Más tranquilo
        </button>

        <button
          className="btn btn--chip btn--chip-wide"
          onClick={() =>
            onQuick("todo")
          }
          disabled={working}
        >
          🔄 Cambiar todo
        </button>
      </div>

      <label
        className="label-small"
        htmlFor="adjust-text"
      >
        Decile a Salime qué cambiar
      </label>

      <textarea
        id="adjust-text"
        className="input-main"
        rows={2}
        placeholder="No quiero caminar tanto y prefiero algo al aire libre."
        value={text}
        onChange={(e) =>
          setText(e.target.value)
        }
      />

      {sent && (
        <p className="understood">
          Ajustado ✨ — mirá el plan
          actualizado.
        </p>
      )}

      <div className="cta-stack">
        <button
          className="btn btn--primary"
          onClick={submit}
          disabled={
            working ||
            !text.trim()
          }
        >
          {working
            ? "Ajustando…"
            : "Ajustar plan"}
        </button>

        <button
          className="btn btn--secondary"
          onClick={onBack}
          disabled={working}
        >
          Ver plan actualizado
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Generating                                                          */
/* ------------------------------------------------------------------ */

function GeneratingScreen({
  label,
}) {
  return (
    <div
      className="screen generating"
      role="status"
      aria-live="polite"
    >
      <Logo size={26} />

      <div className="generating-body">
        <span
          className="generating-dot"
          aria-hidden="true"
        />

        <p className="generating-text">
          {label}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

export default function App() {
  const [screen, setScreen] =
    useState("home");

  const [plan, setPlan] =
    useState(null);

  const [surprise, setSurprise] =
    useState(false);

  const [contextLine, setContextLine] =
    useState("");

  const [lastFilters, setLastFilters] =
    useState({});

  const [
    generatingLabel,
    setGeneratingLabel,
  ] = useState(
    "Pensando tu plan…"
  );

  const [working, setWorking] =
    useState(false);

  const containerRef =
    useRef(null);

  const timers =
    useRef([]);

  useEffect(() => {
    if (
      containerRef.current
    ) {
      containerRef.current.scrollTop = 0;
    }
  }, [screen]);

  useEffect(
    () => () =>
      timers.current.forEach(
        clearTimeout
      ),
    []
  );

  const prefersReducedMotion =
    typeof window !==
      "undefined" &&
    window.matchMedia &&
    window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

  const afterDelay = (
    ms,
    fn
  ) => {
    if (
      prefersReducedMotion
    ) {
      fn();
      return;
    }

    timers.current.push(
      setTimeout(fn, ms)
    );
  };

  const handlePlan = (
    opts
  ) => {
    setLastFilters(opts);

    setGeneratingLabel(
      "Pensando tu plan…"
    );

    setScreen(
      "generating"
    );

    afterDelay(700, async () => {
      setSurprise(false);

      setContextLine(
        opts.contextLine || ""
      );

      setPlan(
        await generatePlan(
          opts
        )
      );

      setScreen("result");
    });
  };

  const handleSurprise =
    () => {
      setGeneratingLabel(
        "Armando algo inesperado…"
      );

      setScreen(
        "generating"
      );

      afterDelay(700, async () => {
        setSurprise(true);

        setPlan(
          await generatePlan({
            random: true,
          })
        );

        setScreen("result");
      });
    };

  const runRegeneration =
    (next) => {
      const excludeNames =
        plan
          ? plan.map(
              (s) =>
                s.venue.name
            )
          : [];

      setWorking(true);

      afterDelay(450, async () => {
        setLastFilters(next);

        setPlan(
          await generatePlan({
            ...next,
            excludeNames,
          })
        );

        setWorking(false);
      });
    };

  const handleReshuffle =
    () =>
      runRegeneration({
        random: true,
      });

  const handleQuickAdjust =
    (type) => {
      let next = {
        ...lastFilters,
      };

      if (
        type === "barato"
      ) {
        next.budgetLabel =
          "Económico";
      }

      if (
        type === "cerca"
      ) {
        next.close = true;
      }

      if (
        type === "divertido"
      ) {
        next.moodLabel =
          "Animado";
      }

      if (
        type === "tranquilo"
      ) {
        next.moodLabel =
          "Tranquilo";
      }

      if (type === "todo") {
        next = {
          random: false,
          moodLabel: null,
          budgetLabel: null,
          close: false,
          outdoor: false,
          timeShiftMin: 0,

          /*
           * Conservamos la intención.
           * "Cambiar todo" no debe convertir
           * cultura en comida, por ejemplo.
           */
          intent:
            lastFilters.intent ||
            "general",

          location:
            lastFilters.location ||
            null,

          people:
            lastFilters.people ||
            null,

          hasKids:
            lastFilters.hasKids,

          morning:
            lastFilters.morning,

          afternoon:
            lastFilters.afternoon,

          night:
            lastFilters.night,

          daytimeGeneric:
            lastFilters.daytimeGeneric,

          explicitHour:
            lastFilters.explicitHour ??
            null,

          contextLine:
            lastFilters.contextLine ||
            "",
        };
      }

      runRegeneration(
        next
      );
    };

  const handleFreeTextAdjust =
    async (text) => {
      const localParsed =
        parseInputHeuristic(
          text
        );

      let parsed =
        localParsed;

      try {
        const aiParsed =
          await parseInputAI(
            text
          );

        parsed =
          mergeInterpretations(
            aiParsed,
            localParsed
          );
      } catch (err) {
        parsed =
          localParsed;
      }

      const next = {
        ...lastFilters,
      };

      if (parsed.budget) {
        next.budgetLabel =
          parsed.budget;
      }

      if (parsed.mood) {
        next.moodLabel =
          parsed.mood;
      }

      if (parsed.close) {
        next.close = true;
      }

      if (parsed.outdoor) {
        next.outdoor = true;
      }

      /*
       * Ahora el ajuste de texto también puede
       * cambiar la intención.
       *
       * Ejemplo:
       * "Quiero algo cultural"
       * ya no solamente cambia el mood:
       * cambia realmente el tipo de plan.
       */
      if (
        parsed.intent &&
        parsed.intent !==
          "general"
      ) {
        next.intent =
          parsed.intent;
      }

      if (parsed.location) {
        next.location =
          parsed.location;
      }

      if (parsed.people) {
        next.people =
          parsed.people;
      }

      if (parsed.hasKids) {
        next.hasKids = true;
        next.people =
          "Familia";
        next.intent =
          "familia";
      }

      if (
        parsed.explicitHour !==
          null &&
        parsed.explicitHour !==
          undefined
      ) {
        next.explicitHour =
          parsed.explicitHour;

        const hour =
          parsed.explicitHour;

        next.morning =
          hour >= 5 &&
          hour < 12;

        next.afternoon =
          hour >= 12 &&
          hour < 19;

        next.night =
          hour >= 19 ||
          hour < 5;

        next.daytimeGeneric =
          false;

        const base =
          next.hasKids ||
          next.intent ===
            "familia"
            ? STEPS_FAMILY
            : getSteps({
                intent:
                  next.intent ||
                  "general",
                hasKids:
                  next.hasKids,
                morning:
                  next.morning,
                afternoon:
                  next.afternoon,
                daytimeGeneric:
                  false,
                timeBucket:
                  getTimeBucket({
                    morning:
                      next.morning,
                    afternoon:
                      next.afternoon,
                    daytimeGeneric:
                      false,
                    explicitHour:
                      hour,
                    night:
                      next.night,
                  }),
              });

        const [
          bh,
          bm,
        ] = base[0].time
          .split(":")
          .map(Number);

        next.timeShiftMin =
          hour * 60 -
          (bh * 60 + bm);
      } else if (parsed.daytimeGeneric) {
        next.daytimeGeneric = true;
        next.explicitHour = null;
        next.morning = false;
        next.afternoon = false;
        next.night = false;
        next.timeShiftMin = 0;
      }

      if (parsed.earlier) {
        next.timeShiftMin =
          (lastFilters.timeShiftMin ||
            0) - 60;
      }

      runRegeneration(
        next
      );
    };

  const goHome = () => {
    timers.current.forEach(
      clearTimeout
    );

    timers.current = [];

    setWorking(false);
    setScreen("home");
    setPlan(null);
    setSurprise(false);
    setContextLine("");
    setLastFilters({});
  };

  return (
    <div className="app-shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }

        .app-shell {
          min-height: 100vh;
          background: ${C.bg};
          display: flex;
          justify-content: center;
          font-family: 'Plus Jakarta Sans', sans-serif;
          color: ${C.text};
        }

        .phone {
          width: 100%;
          max-width: 430px;
          min-height: 100vh;
          background: ${C.bg};
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        .screen {
          padding: 28px 22px 48px;
          animation: fadeSlide 0.35s ease both;
        }

        @keyframes fadeSlide {
          from {
            opacity: 0;
            transform: translateY(8px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .screen {
            animation: none;
          }
        }

        .home-top {
          margin-bottom: 4px;
        }

        .logo-svg {
          display: block;
        }

        .tagline {
          font-size: 14px;
          color: ${C.ink};
          opacity: 0.75;
          margin: 0 0 30px;
          font-weight: 500;
        }

        .q {
          font-family: 'Fredoka', sans-serif;
          font-weight: 600;
          font-size: 22px;
          color: ${C.ink};
          margin: 0 0 14px;
          line-height: 1.25;
        }

        .h1 {
          font-family: 'Fredoka', sans-serif;
          font-weight: 600;
          font-size: 24px;
          color: ${C.ink};
          margin: 4px 0 8px;
        }

        .sub {
          font-size: 14.5px;
          line-height: 1.5;
          color: ${C.text};
          opacity: 0.8;
          margin: 0 0 26px;
        }

        .input-main {
          width: 100%;
          border: 1.5px solid ${C.inkBorder};
          background: ${C.white};
          border-radius: 18px;
          padding: 16px 16px;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 15px;
          color: ${C.text};
          resize: none;
          line-height: 1.5;
          transition: border-color 0.15s ease;
        }

        .input-main::placeholder {
          color: rgba(36,49,58,0.4);
        }

        .input-main:focus {
          outline: none;
          border-color: ${C.ink};
        }

        .input-main:focus-visible {
          outline: 2px solid ${C.coral};
          outline-offset: 2px;
        }

        .understood {
          font-size: 13px;
          color: ${C.ink};
          background: ${C.lavender};
          border-radius: 12px;
          padding: 9px 13px;
          margin: 12px 0 0;
          font-weight: 500;
        }

        .chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 18px 0 30px;
        }

        .chip {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 12px 13px;
          border-radius: 20px;
          border: 1px solid ${C.inkBorder};
          background: #FFFDF8;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 13.5px;
          color: ${C.ink};
          cursor: pointer;
          font-weight: 500;
        }

        .chip--set {
          border: 1px solid ${C.inkBorder};
          background: rgba(24,59,78,0.07);
        }

        .chip:focus-visible {
          outline: 2px solid ${C.coral};
          outline-offset: 2px;
        }

        .chip__icon {
          flex-shrink: 0;
          color: ${C.ink};
        }

        .cta-stack {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .btn {
          border: none;
          border-radius: 16px;
          padding: 16px 20px;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 600;
          font-size: 15.5px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 52px;
          transition: transform 0.12s ease, opacity 0.12s ease;
        }

        .btn:active {
          transform: scale(0.98);
        }

        .btn:focus-visible {
          outline: 2px solid ${C.coral};
          outline-offset: 2px;
        }

        .btn:disabled {
          opacity: 0.55;
          cursor: default;
          transform: none;
        }

        .generating {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          min-height: 70vh;
          justify-content: center;
        }

        .generating-body {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 22px;
        }

        .generating-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: ${C.coral};
          animation: pulseDot 1.1s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .generating-dot {
            animation: none;
          }
        }

        @keyframes pulseDot {
          0%, 100% {
            opacity: 0.35;
            transform: scale(0.85);
          }

          50% {
            opacity: 1;
            transform: scale(1);
          }
        }

        .generating-text {
          font-family: 'Fredoka', sans-serif;
          font-weight: 600;
          font-size: 17px;
          color: ${C.ink};
          margin: 0;
        }

        .btn--primary {
          background: ${C.ink};
          color: ${C.white};
        }

        .btn--secondary {
          background: #FFFDF8;
          color: ${C.ink};
          border: 1.5px solid ${C.ink};
        }

        .btn--chip {
          background: ${C.white};
          color: ${C.ink};
          border: 1.5px solid ${C.inkBorder};
          font-size: 14px;
          min-height: 46px;
          padding: 12px 10px;
        }

        .quick-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 26px;
        }

        .btn--chip-wide {
          grid-column: 1 / -1;
        }

        .label-small {
          display: block;
          font-size: 12.5px;
          font-weight: 600;
          color: ${C.ink};
          opacity: 0.7;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: none;
          border: none;
          color: ${C.ink};
          opacity: 0.65;
          font-size: 13.5px;
          font-weight: 600;
          padding: 8px 4px;
          margin: -8px 0 12px -4px;
          cursor: pointer;
          font-family: 'Plus Jakarta Sans', sans-serif;
        }

        .back-link:focus-visible {
          outline: 2px solid ${C.coral};
          outline-offset: 2px;
        }

        .back-link:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .timeline {
          margin-top: 6px;
        }

        .tl-row {
          display: flex;
          gap: 14px;
        }

        .tl-marker-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 40px;
          flex-shrink: 0;
        }

        .tl-dot {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: ${C.white};
          border: 1.5px solid ${C.ink};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          flex-shrink: 0;
        }

        .tl-dot--coral {
          border-color: ${C.coral};
        }

        .tl-line {
          width: 1.5px;
          flex: 1;
          background: ${C.inkLine};
          margin: 4px 0;
        }

        .tl-content {
          flex: 1;
          padding-bottom: 26px;
        }

        .tl-eyebrow {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: ${C.ink};
          opacity: 0.85;
          margin-bottom: 3px;
        }

        .tl-eyebrow-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: ${C.coral};
          flex-shrink: 0;
        }

        .tl-time {
          font-size: 13px;
          font-weight: 600;
          color: ${C.ink};
          opacity: 0.7;
          margin-bottom: 8px;
        }

        .tl-card {
          background: ${C.white};
          border: 1px solid ${C.inkBorder};
          border-radius: 16px;
          padding: 14px 16px;
          box-shadow: 0 1px 2px rgba(24,59,78,0.04);
        }

        .tl-card-name {
          font-family: 'Fredoka', sans-serif;
          font-weight: 600;
          font-size: 16px;
          color: ${C.ink};
          margin-bottom: 4px;
        }

        .tl-card-meta {
          font-size: 12.5px;
          color: ${C.text};
          opacity: 0.7;
          margin-bottom: 8px;
        }

        .tl-card-why {
          font-size: 13.5px;
          line-height: 1.45;
          color: ${C.text};
          opacity: 0.85;
          margin: 0;
        }
      `}</style>

      <div
        className="phone"
        ref={containerRef}
      >
        {screen ===
          "home" && (
          <HomeScreen
            onPlan={
              handlePlan
            }
            onSurprise={
              handleSurprise
            }
          />
        )}

        {screen ===
          "generating" && (
          <GeneratingScreen
            label={
              generatingLabel
            }
          />
        )}

        {screen ===
          "result" &&
          plan && (
            <ResultScreen
              plan={plan}
              surprise={
                surprise
              }
              contextLine={
                contextLine
              }
              working={
                working
              }
              onAdjust={() =>
                setScreen(
                  "adjust"
                )
              }
              onReshuffle={
                handleReshuffle
              }
              onHome={goHome}
            />
          )}

        {screen ===
          "adjust" && (
          <AdjustScreen
            onQuick={
              handleQuickAdjust
            }
            onFreeText={
              handleFreeTextAdjust
            }
            onBack={() =>
              setScreen(
                "result"
              )
            }
            working={
              working
            }
          />
        )}
      </div>
    </div>
  );
}
