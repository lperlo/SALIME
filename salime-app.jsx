import React, { useState, useEffect, useMemo } from 'react';
import { 
  Utensils, Beer, Sparkles, MapPin, DollarSign, Clock, 
  ChevronRight, RefreshCw, SlidersHorizontal, Heart, 
  Share2, Navigation, ArrowLeft, Check, Plus, Minus,
  Sun, Moon, Coffee, PartyPopper, Compass, Music, Flame
} from 'lucide-react';

// --- PLANTILLAS ORIGINALES CON CORRECCIÓN GASTRONÓMICA ---
const STEPS_COMER = [
  { step: 1, title: "PARA EMPEZAR", subtitle: "Arrancamos a comer algo rico", intent: "restaurant", categories: ["catering.restaurant"] },
  { step: 2, title: "SEGUIR", subtitle: "Un postre, café o algo dulce", intent: "cafeteria", categories: ["catering.cafe", "catering.ice_cream"] },
  { step: 3, title: "PARA TERMINAR", subtitle: "Un barcito o tragos para cerrar", intent: "bar", categories: ["catering.bar", "catering.pub"] }
];

const STEPS_TOMAR_ALGO = [
  { step: 1, title: "PARA EMPEZAR", subtitle: "Unos tragos o cerveza para arrancar", intent: "bar", categories: ["catering.bar", "catering.pub"] },
  { step: 2, title: "SEGUIR", subtitle: "Acompañamos con algo para picar o cenar", intent: "restaurant", categories: ["catering.restaurant"] },
  { step: 3, title: "PARA TERMINAR", subtitle: "Cierre en un bar o cafetería nocturna", intent: "bar", categories: ["catering.bar", "catering.cafe"] }
];

const STEPS_PASEO = [
  { step: 1, title: "PUNTO DE ENCUENTRO", subtitle: "Arrancamos caminando o recorriendo", intent: "paseo", categories: ["tourism.attraction", "leisure.park"] },
  { step: 2, title: "PARADA TÉCNICA", subtitle: "Algo rico para tomar o comer al paso", intent: "cafeteria", categories: ["catering.cafe", "catering.ice_cream"] },
  { step: 3, title: "PARA CERRAR", subtitle: "Un lugar lindo para sentarse a charlar", intent: "bar", categories: ["catering.bar", "leisure.park"] }
];

async function fetchPoolOverrides(city, intent) {
  try {
    const res = await fetch("/api/lugares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city, intent }),
    });
    if (!res.ok) throw new Error("Error backend");
    const data = await res.json();
    return data.places || [];
  } catch (err) {
    console.error("Error al obtener lugares:", err);
    return [];
  }
}

export default function App() {
  const [screen, setScreen] = useState('home'); // 'home', 'result', 'adjust'
  const [query, setQuery] = useState('');
  const [selectedIntent, setSelectedIntent] = useState('comer');
  const [location, setLocation] = useState('Güemes, Córdoba');
  const [budget, setBudget] = useState(2);
  const [mood, setMood] = useState('tranquilo');
  const [timeOfDay, setTimeOfDay] = useState('noche');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);

  const handleGeneratePlan = async () => {
    setLoading(true);
    
    let template = STEPS_COMER;
    if (selectedIntent === 'tomar_algo') template = STEPS_TOMAR_ALGO;
    if (selectedIntent === 'paseo') template = STEPS_PASEO;

    const realPlaces = await fetchPoolOverrides(location, selectedIntent);

    const generatedSteps = template.map((stepInfo, idx) => {
      const place = realPlaces[idx] || {
        name: `Lugar recomendado ${idx + 1}`,
        address: location,
        rating: 4.5,
        emoji: selectedIntent === 'comer' ? '🍔' : '🍹'
      };
      return { ...stepInfo, place };
    });

    setPlan(generatedSteps);
    setLoading(false);
    setScreen('result');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans max-w-md mx-auto relative overflow-hidden border-x border-slate-800">
      {screen === 'home' && (
        <div className="p-6 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-8">
              <div className="bg-gradient-to-tr from-amber-500 to-rose-500 p-2 rounded-xl text-white font-bold text-xl">
                S
              </div>
              <span className="font-bold text-2xl tracking-tight bg-gradient-to-r from-amber-400 to-rose-400 bg-clip-text text-transparent">
                SALIME
              </span>
            </div>

            <h1 className="text-3xl font-black mb-2 text-white leading-tight">
              ¿Qué sale hoy?
            </h1>
            <p className="text-slate-400 text-sm mb-6">
              Armamos tu itinerario perfecto en segundos.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                  ¿Dónde estás?
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-slate-500 w-5 h-5" />
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
                    placeholder="Ej: Güemes, Nueva Córdoba..."
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                  Intención del plan
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'comer', label: 'Comer', icon: Utensils },
                    { id: 'tomar_algo', label: 'Tomar algo', icon: Beer },
                    { id: 'paseo', label: 'Pasear', icon: Compass },
                  ].map((item) => {
                    const Icon = item.icon;
                    const active = selectedIntent === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSelectedIntent(item.id)}
                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                          active
                            ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-xs font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleGeneratePlan}
            disabled={loading}
            className="w-full mt-8 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-rose-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
          >
            {loading ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Armar Plan</span>
              </>
            )}
          </button>
        </div>
      )}

      {screen === 'result' && plan && (
        <div className="p-6 flex-1 flex flex-col justify-between">
          <div>
            <button
              onClick={() => setScreen('home')}
              className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Volver al inicio
            </button>

            <h2 className="text-2xl font-bold text-white mb-1">Tu Itinerario</h2>
            <p className="text-xs text-amber-400 font-medium mb-6">📍 {location}</p>

            <div className="space-y-6 relative before:absolute before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
              {plan.map((item, idx) => (
                <div key={idx} className="relative pl-10">
                  <div className="absolute left-2 top-1.5 -translate-x-1/2 w-4 h-4 rounded-full bg-amber-500 border-4 border-slate-950" />
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <span className="text-[10px] font-bold tracking-wider text-amber-500 uppercase block mb-1">
                      {item.title}
                    </span>
                    <h3 className="font-bold text-white text-base mb-1">{item.place.name}</h3>
                    <p className="text-xs text-slate-400 mb-2">{item.subtitle}</p>
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {item.place.address}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => setScreen('home')}
            className="w-full mt-6 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold py-3 rounded-xl transition-all"
          >
            Probar otro plan
          </button>
        </div>
      )}
    </div>
  );
}
