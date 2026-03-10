import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useCart } from './CartContext';

const MusitoContext = createContext();

const VISITED_KEY = 'musito_visited';
const DISMISSED_KEY = 'musito_dismissed';
const LEVEL_KEY = 'musito_user_level';
const USERNAME_KEY = 'musito_username';

// ── Tiny sound effects via Web Audio API ──
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  return audioCtx;
}
function playTone(freq, duration = 0.1, type = 'square', vol = 0.08) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = vol;
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}
function sfxClick() { playTone(800, 0.06); }
function sfxBubble() { playTone(600, 0.08, 'sine', 0.05); playTone(900, 0.08, 'sine', 0.04); }
function sfxThrow() { playTone(300, 0.2, 'sawtooth', 0.06); }
function sfxDance() { playTone(523, 0.1); setTimeout(() => playTone(659, 0.1), 100); setTimeout(() => playTone(784, 0.1), 200); }
function sfxSleep() { playTone(200, 0.3, 'sine', 0.03); }
function sfxDizzy() { playTone(400, 0.15, 'triangle', 0.05); playTone(350, 0.15, 'triangle', 0.04); }

// Map route patterns to section ids
function getSection(pathname) {
  if (pathname.match(/\/producto\//)) return 'producto';
  if (pathname.includes('/catalogo')) return 'catalogo';
  if (pathname.includes('/carrito')) return 'carrito';
  if (pathname.includes('/checkout/resultado')) return 'resultado';
  if (pathname.includes('/checkout')) return 'checkout';
  if (pathname.includes('/sommelier')) return 'sommelier';
  if (pathname.includes('/club')) return 'club';
  if (pathname.includes('/etiqueta')) return 'etiqueta';
  if (pathname.includes('/eventos')) return 'eventos';
  if (pathname.includes('/mi-perfil')) return 'perfil';
  return 'home';
}

// ── Time-of-day messages ──
function getTimeMessage() {
  const h = new Date().getHours();
  if (h >= 5 && h < 9) return 'Buen dia! Tempranito eligiendo vinos... me gusta!';
  if (h >= 9 && h < 12) return 'Linda manana para explorar vinos nuevos!';
  if (h >= 12 && h < 14) return 'Mediodia... un blanco fresquito para el almuerzo?';
  if (h >= 14 && h < 18) return 'Tarde perfecta para descubrir tu proximo vino favorito.';
  if (h >= 18 && h < 21) return 'Arranca la noche... hora de un buen tinto!';
  if (h >= 21 || h < 2) return 'Noche de vinos! Ideal para un Malbec con buena compania.';
  return 'Trasnochando con vinos? Me gusta tu estilo!';
}

// ── Product-specific reactions when adding to cart ──
const CEPA_REACTIONS = {
  malbec: ['Malbec! El rey de Argentina!', 'Excelente eleccion, no falla un Malbec!'],
  cabernet: ['Cabernet Sauvignon, clasico y elegante!', 'Buen Cabernet! Ideal con carnes.'],
  'cabernet sauvignon': ['Cabernet Sauvignon, clasico y elegante!', 'Buen Cabernet! Ideal con carnes.'],
  bonarda: ['Bonarda! Subestimada y deliciosa.', 'La Bonarda argentina es unica!'],
  'pinot noir': ['Pinot Noir, para paladares exigentes!', 'Elegante eleccion!'],
  syrah: ['Syrah! Especiado y potente.', 'Un gran Syrah, me encanta!'],
  torrontes: ['Torrontes! Nuestra cepa blanca emblema!', 'Aromatico y fresco, buenisimo!'],
  chardonnay: ['Chardonnay, siempre un acierto!', 'Clasico y versatil!'],
  'sauvignon blanc': ['Sauvignon Blanc, fresco y citrico!', 'Ideal para un dia caluroso!'],
  blend: ['Un blend! Lo mejor de cada cepa.', 'Los blends son pura creatividad!'],
  rose: ['Rose! Fresco y divertido.', 'Perfecto para el aperitivo!'],
  espumante: ['Burbujas! Siempre hay algo que celebrar!', 'A brindar se ha dicho!'],
  merlot: ['Merlot! Suave y amigable.', 'Nunca decepciona un buen Merlot!'],
};

function getProductReaction(product) {
  if (!product) return 'Al carrito! Buena eleccion!';
  const cepa = (product.cepa || '').toLowerCase();
  for (const [key, msgs] of Object.entries(CEPA_REACTIONS)) {
    if (cepa.includes(key)) return msgs[Math.floor(Math.random() * msgs.length)];
  }
  if (product.bodega) return `${product.bodega}! Gran bodega, buen ojo!`;
  return 'Al carrito! Buena eleccion!';
}

// ── Contextual messages per section ──
const SECTION_MESSAGES = {
  home: [
    { text: null, delay: 2000, useTime: true },
  ],
  catalogo: [
    { text: 'Aca vas a encontrar todos nuestros vinos!', delay: 1500 },
  ],
  producto: [
    { text: 'Buen ojo! Veamos este vino...', delay: 1500 },
  ],
  carrito: [
    { text: 'Veamos que tenemos aca...', delay: 1000 },
  ],
  checkout: [
    { text: 'Ultimo paso! Completa tus datos.', delay: 1500 },
  ],
  resultado: [
    { text: 'Genial! Tu pedido esta en camino!', delay: 1500, pose: 'moto' },
  ],
  sommelier: [
    { text: 'Aca te atiende nuestro sommelier con IA!', delay: 2000 },
  ],
  club: [
    { text: 'El Club MUSA es lo mejor para los amantes del vino!', delay: 1500 },
  ],
  etiqueta: [
    { text: 'Crea una etiqueta personalizada para regalar!', delay: 1500 },
  ],
  eventos: [
    { text: 'Degustaciones y eventos especiales!', delay: 1500 },
  ],
  perfil: [
    { text: 'Tu perfil de vinos! Mira todo lo que exploraste.', delay: 1500 },
  ],
};

// ── Tutorial tips for unvisited sections ──
const SECTION_TUTORIALS = {
  catalogo: 'Todavia no visitaste el catalogo. Hay mas de 100 vinos esperandote!',
  sommelier: 'Conoces a nuestro Sommelier IA? Te recomienda vinos con tu voz! Podes hablarle por microfono.',
  club: 'Sabias que tenemos un Club del Vino? Recibi vinos seleccionados cada mes en tu casa!',
  etiqueta: 'Podes crear etiquetas personalizadas con IA! Ideal para regalos. Elegi la ocasion y listo.',
  eventos: 'Hacemos degustaciones y eventos especiales! Reserva tu lugar.',
  perfil: 'Crea tu perfil para llevar un registro de tus vinos, cepas y regiones exploradas.',
  carrito: 'Tu carrito esta vacio todavia! Explora el catalogo y agrega vinos que te gusten.',
};

// ── Feature tips (not section-dependent, shown occasionally) ──
const FEATURE_TIPS = [
  { text: 'Podes instalar MUSA como app! Toca el icono del celular arriba a la derecha.', condition: 'pwa' },
  { text: 'Cada compra te suma puntos para subir de nivel! Mira tu progreso en Mi Perfil.', condition: 'always' },
  { text: 'Podes buscar vinos por nombre, bodega o cepa desde el catalogo.', condition: 'always' },
  { text: 'En Mi Perfil tenes un mapa de Argentina con todas las regiones vinicolas que probaste!', condition: 'always' },
  { text: 'El Sommelier entiende audio! Podes hablarle por microfono.', condition: 'always' },
  { text: 'Las etiquetas personalizadas se generan con IA. Podes descargarlas o pedir que las impriman!', condition: 'always' },
];

// ── Cart count messages ──
function getCartMessage(totalItems) {
  if (totalItems === 1) return 'Tenes 1 vino en el carrito. Buen comienzo!';
  if (totalItems > 1 && totalItems <= 3) return `Llevas ${totalItems} vinos! Linda seleccion.`;
  if (totalItems > 3) return `${totalItems} vinos en el carrito! Te luciste!`;
  return null;
}

// ── Quick sommelier suggestions per section ──
const QUICK_SUGGESTIONS_DEFAULT = [
  { label: 'Recomendame un tinto', query: 'Recomendame un buen tinto para esta noche' },
  { label: 'Para regalar', query: 'Quiero un vino para regalar, algo especial' },
  { label: 'Sorprendeme', query: 'Sorprendeme con algo que no conozca' },
  { label: 'Maridaje', query: 'Que vino va bien con asado?' },
];

const SECTION_SUGGESTIONS = {
  home: [
    { label: 'Que hay de nuevo?', query: 'Que vinos nuevos tienen?' },
    { label: 'Para empezar', query: 'Soy nuevo en vinos, que me recomendas para empezar?' },
    { label: 'El mas vendido', query: 'Cual es el vino mas vendido?' },
    { label: 'Ofertas', query: 'Tienen alguna oferta o promocion?' },
  ],
  catalogo: [
    { label: 'Filtrar por cepa', query: 'Que cepas tienen disponibles?' },
    { label: 'Menos de $10000', query: 'Recomendame un buen vino economico' },
    { label: 'Vino premium', query: 'Cual es el mejor vino premium que tienen?' },
    { label: 'Blanco fresco', query: 'Recomendame un blanco fresco para el verano' },
  ],
  producto: [
    { label: 'Con que comida va?', query: 'Con que comida marida bien este vino?' },
    { label: 'Alternativas', query: 'Que alternativas similares tienen a este vino?' },
    { label: 'Temperatura ideal', query: 'A que temperatura se sirve este tipo de vino?' },
    { label: 'Cuanto guardar', query: 'Cuanto tiempo se puede guardar este vino?' },
  ],
  carrito: [
    { label: 'Completar seleccion', query: 'Tengo estos vinos en el carrito, que me falta para una cena completa?' },
    { label: 'Agregar postre', query: 'Que vino dulce o espumante va bien de postre?' },
    { label: 'Para acompañar', query: 'Que queso o picada va bien con tintos?' },
  ],
  checkout: [
    { label: 'Envio gratis?', query: 'A partir de cuanto es el envio gratis?' },
    { label: 'Cuanto tarda?', query: 'Cuanto tarda en llegar el pedido?' },
  ],
  club: [
    { label: 'Beneficios del club', query: 'Cuales son los beneficios del Club MUSA?' },
    { label: 'Que incluye', query: 'Que vinos incluye la suscripcion mensual?' },
    { label: 'Cancelar cuando quiera', query: 'Puedo cancelar la suscripcion cuando quiera?' },
  ],
  etiqueta: [
    { label: 'Para cumpleaños', query: 'Quiero una etiqueta para un cumpleaños' },
    { label: 'Para aniversario', query: 'Necesito una etiqueta romantica para un aniversario' },
    { label: 'Corporativo', query: 'Hacen etiquetas corporativas para empresas?' },
  ],
  eventos: [
    { label: 'Proxima degustacion', query: 'Cuando es la proxima degustacion?' },
    { label: 'Eventos privados', query: 'Hacen eventos privados o para empresas?' },
    { label: 'Cuanto sale', query: 'Cuanto sale una degustacion?' },
  ],
};

// ── Level outfits: hat/accessory color overrides per level ──
const LEVEL_OUTFITS = {
  0: { name: 'Semilla', hair: '#7c3aed', body: '#7c3aed', accessory: null },
  1: { name: 'Uva', hair: '#7c3aed', body: '#6d28d9', accessory: null },
  2: { name: 'Catador', hair: '#7c3aed', body: '#4c1d95', accessory: 'boina' },
  3: { name: 'Conocedor', hair: '#f59e0b', body: '#1e3a5f', accessory: 'lentes' },
  4: { name: 'Sommelier', hair: '#f5f5f5', body: '#1e1e1e', accessory: 'chef' },
  5: { name: 'Maestro', hair: '#fbbf24', body: '#7c2d12', accessory: 'corona' },
};

export function MusitoProvider({ children }) {
  const { pathname } = useLocation();
  const { totalItems, items } = useCart();
  const section = getSection(pathname);
  const prevItemsRef = useRef(totalItems);

  const [visited, setVisited] = useState(() => {
    try { return JSON.parse(localStorage.getItem(VISITED_KEY)) || []; }
    catch { return []; }
  });
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1');
  const [message, setMessage] = useState('');
  const [pose, setPose] = useState('idle'); // idle, walk, run, moto, paquete, celebrar, wave, dizzy, sleep, dance
  const [visible, setVisible] = useState(true);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [userLevel, setUserLevel] = useState(() => {
    try { return parseInt(localStorage.getItem(LEVEL_KEY)) || 0; }
    catch { return 0; }
  });
  const [userName, setUserName] = useState(() => localStorage.getItem(USERNAME_KEY) || '');
  // Musito position on screen — tracks scroll position like a progress indicator
  const [musitoX, setMusitoX] = useState(88); // % from left — right edge zone
  const [musitoY, setMusitoY] = useState(85); // % from bottom (85% = near top)
  const [facing, setFacing] = useState('left'); // left or right
  const [isRunning, setIsRunning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isThrown, setIsThrown] = useState(false);
  const [throwDir, setThrowDir] = useState(0); // velocity for throw
  const timers = useRef([]);
  const idleTimer = useRef(null);
  const lastScrollY = useRef(0);
  const runStopTimer = useRef(null);

  const outfit = LEVEL_OUTFITS[userLevel] || LEVEL_OUTFITS[0];

  // ── Track visited sections ──
  useEffect(() => {
    if (!visited.includes(section)) {
      const next = [...visited, section];
      setVisited(next);
      localStorage.setItem(VISITED_KEY, JSON.stringify(next));
    }
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cart reaction: detect items added/removed ──
  useEffect(() => {
    if (dismissed) return;
    if (totalItems > prevItemsRef.current) {
      const lastItem = items[items.length - 1];
      const reaction = getProductReaction(lastItem);
      setMessage(reaction);
      setBubbleVisible(true);
      setPose('celebrar');
      sfxClick();
      const t = setTimeout(() => { setBubbleVisible(false); setPose('idle'); }, 3500);
      timers.current.push(t);
    } else if (totalItems === 0 && prevItemsRef.current > 0) {
      // Cart emptied
      const cryMsgs = [
        'Noooo! Se fue todo... Volvemos a llenar?',
        'Carrito vacio... me pone triste!',
        'Eh! Donde fueron los vinos?!',
      ];
      setMessage(cryMsgs[Math.floor(Math.random() * cryMsgs.length)]);
      setBubbleVisible(true);
      setPose('dizzy');
      sfxDizzy();
      const t = setTimeout(() => { setBubbleVisible(false); setPose('idle'); }, 4000);
      timers.current.push(t);
    }
    prevItemsRef.current = totalItems;
  }, [totalItems, dismissed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll following: Musito tracks page scroll like a progress indicator ──
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const wobbleDir = useRef(1);
  useEffect(() => {
    if (dismissed) return;

    const updatePosition = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPct = docHeight > 0 ? scrollTop / docHeight : 0; // 0 = top, 1 = bottom

      // Y: map scroll % to bottom %. At top of page → high bottom%, at bottom → low bottom%
      // Range: 85% (top) down to 8% (bottom)
      const targetY = 85 - scrollPct * 77;
      setMusitoY(targetY);

      // X: subtle lateral wobble using sine wave based on scroll position
      // Oscillates around 88% (right edge) ± 5%
      const wobble = Math.sin(scrollPct * Math.PI * 4) * 5;
      setMusitoX(88 + wobble);
    };

    const handleScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollY.current;
      const absDelta = Math.abs(delta);
      lastScrollY.current = currentY;

      updatePosition();

      if (absDelta > 20 && poseRef.current !== 'sleep' && poseRef.current !== 'dance') {
        const scrollDown = delta > 0;
        setFacing(scrollDown ? 'left' : 'right');
        setIsRunning(true);

        clearTimeout(runStopTimer.current);
        runStopTimer.current = setTimeout(() => {
          setIsRunning(false);
        }, 400);
      }
    };

    // Set initial position
    updatePosition();

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(runStopTimer.current);
    };
  }, [dismissed]);

  // ── Easter egg: idle too long = sleep ──
  useEffect(() => {
    if (dismissed) return;
    const resetIdle = () => {
      clearTimeout(idleTimer.current);
      if (pose === 'sleep') {
        setPose('idle');
        setMessage('Ah! Volvi! Me habia dormido...');
        setBubbleVisible(true);
        const t = setTimeout(() => setBubbleVisible(false), 3000);
        timers.current.push(t);
      }
      idleTimer.current = setTimeout(() => {
        if (!dismissed) {
          setPose('sleep');
          setMessage('zzZ... zzZ...');
          setBubbleVisible(true);
          sfxSleep();
        }
      }, 45000); // 45s of inactivity
    };
    resetIdle();
    window.addEventListener('mousemove', resetIdle, { passive: true });
    window.addEventListener('touchstart', resetIdle, { passive: true });
    window.addEventListener('keydown', resetIdle, { passive: true });
    return () => {
      clearTimeout(idleTimer.current);
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('touchstart', resetIdle);
      window.removeEventListener('keydown', resetIdle);
    };
  }, [dismissed, pose]);

  // ── Easter egg: multiple clicks = dance ──
  const clickResetTimer = useRef(null);
  const handleMusitoClick = useCallback(() => {
    setClickCount((prev) => {
      const newCount = prev + 1;
      if (newCount >= 3) {
        setPose('dance');
        setMessage('Dale que suena el ritmo!');
        setBubbleVisible(true);
        sfxDance();
        const t = setTimeout(() => { setPose('idle'); setBubbleVisible(false); }, 4000);
        timers.current.push(t);
        return 0;
      }
      sfxClick();
      // Reset click count after 2 seconds of no clicks
      clearTimeout(clickResetTimer.current);
      clickResetTimer.current = setTimeout(() => setClickCount(0), 2000);
      return newCount;
    });
  }, []);

  // ── Drag and throw ──
  const dragStart = useRef({ x: 0, y: 0, time: 0 });
  const startDrag = useCallback((clientX, clientY) => {
    setIsDragging(true);
    dragStart.current = { x: clientX, y: clientY, time: Date.now() };
  }, []);

  const onDrag = useCallback((clientX, clientY) => {
    if (!isDragging) return;
    const pctX = (clientX / window.innerWidth) * 100;
    const pctY = ((window.innerHeight - clientY) / window.innerHeight) * 100;
    setMusitoX(Math.max(5, Math.min(95, pctX)));
    setMusitoY(Math.max(5, Math.min(90, pctY)));
    setFacing(clientX > dragStart.current.x ? 'right' : 'left');
  }, [isDragging]);

  const endDrag = useCallback((clientX) => {
    if (!isDragging) return;
    setIsDragging(false);
    const dt = Date.now() - dragStart.current.time;
    const dx = clientX - dragStart.current.x;
    const velocity = dx / Math.max(dt, 1);

    // If thrown with enough velocity
    if (Math.abs(velocity) > 0.5) {
      setIsThrown(true);
      setThrowDir(velocity > 0 ? 1 : -1);
      setFacing(velocity > 0 ? 'right' : 'left');
      setPose('dizzy');
      setMessage(velocity > 0 ? 'Aaaaaah!' : 'Nooooo!');
      setBubbleVisible(true);
      sfxThrow();

      // Animate the throw
      const targetX = velocity > 0 ? Math.min(95, musitoX + 30) : Math.max(5, musitoX - 30);
      setMusitoX(targetX);

      const t = setTimeout(() => {
        setIsThrown(false);
        setPose('idle');
        setMessage('Eso dolio... pero aca sigo!');
        // Drift back to scroll-based position
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPct = docHeight > 0 ? scrollTop / docHeight : 0;
        setMusitoY(85 - scrollPct * 77);
        setMusitoX(88 + Math.sin(scrollPct * Math.PI * 4) * 5);
        const t2 = setTimeout(() => setBubbleVisible(false), 2500);
        timers.current.push(t2);
      }, 1200);
      timers.current.push(t);
    } else {
      // Gentle release — stay where dropped
    }
  }, [isDragging, musitoX]);

  // ── Toggle quick sommelier menu ──
  const toggleQuickMenu = useCallback(() => {
    setShowQuickMenu((prev) => !prev);
  }, []);

  // ── Clear timers on section change ──
  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [section]);

  // ── Show contextual messages when section changes ──
  useEffect(() => {
    if (dismissed) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setShowQuickMenu(false);

    // Entrance animation
    setPose('walk');
    const walkTimer = setTimeout(() => setPose('idle'), 800);
    timers.current.push(walkTimer);

    // Personalized greeting with name
    const greeting = userName ? `Hola ${userName}! ` : '';

    const messages = SECTION_MESSAGES[section] || [];
    messages.forEach(({ text, delay, pose: msgPose, useTime }, idx) => {
      const t = setTimeout(() => {
        const msgText = useTime ? getTimeMessage() : text;
        setMessage(idx === 0 && greeting ? greeting + msgText : msgText);
        setBubbleVisible(true);
        sfxBubble();
        if (msgPose) setPose(msgPose);

        const hideT = setTimeout(() => {
          setBubbleVisible(false);
          if (msgPose) setPose('idle');
        }, 4500);
        timers.current.push(hideT);
      }, delay);
      timers.current.push(t);
    });

  }, [section, dismissed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update level from perfil page data ──
  const updateLevel = useCallback((level) => {
    setUserLevel(level);
    localStorage.setItem(LEVEL_KEY, String(level));
  }, []);

  // ── Update user name for personalized greetings ──
  const updateUserName = useCallback((name) => {
    const firstName = (name || '').split(' ')[0];
    setUserName(firstName);
    if (firstName) localStorage.setItem(USERNAME_KEY, firstName);
    else localStorage.removeItem(USERNAME_KEY);
  }, []);

  // ── Map province click reaction (global Musito responds) ──
  const onMapProvinceClick = useCallback((provName) => {
    const msgs = [
      `${provName}! Gran zona de vinos!`,
      `Vamos a explorar ${provName}!`,
      `Los vinos de ${provName} son increibles!`,
      `${provName}... ya quiero probar todo!`,
    ];
    setMessage(msgs[Math.floor(Math.random() * msgs.length)]);
    setBubbleVisible(true);
    setPose('walk');
    sfxBubble();
    const t1 = setTimeout(() => setPose('idle'), 800);
    const t2 = setTimeout(() => setBubbleVisible(false), 3500);
    timers.current.push(t1, t2);
  }, []);

  // ── Contextual quick suggestions based on section ──
  const quickSuggestions = SECTION_SUGGESTIONS[section] || QUICK_SUGGESTIONS_DEFAULT;

  const dismiss = useCallback(() => {
    setDismissed(true);
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, '1');
  }, []);

  const reactivate = useCallback(() => {
    setDismissed(false);
    setVisible(true);
    localStorage.removeItem(DISMISSED_KEY);
  }, []);

  return (
    <MusitoContext.Provider value={{
      section, message, pose, visible, bubbleVisible, dismissed, visited,
      outfit, userLevel, userName, showQuickMenu, quickSuggestions,
      musitoX, musitoY, facing, isRunning, isDragging, isThrown, throwDir,
      dismiss, reactivate, setMessage, setBubbleVisible, setPose,
      handleMusitoClick, toggleQuickMenu, setShowQuickMenu,
      updateLevel, updateUserName, onMapProvinceClick,
      startDrag, onDrag, endDrag,
    }}>
      {children}
    </MusitoContext.Provider>
  );
}

export const useMusito = () => useContext(MusitoContext);
