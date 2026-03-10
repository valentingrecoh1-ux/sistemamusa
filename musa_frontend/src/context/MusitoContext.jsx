import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useCart } from './CartContext';

const MusitoContext = createContext();

const VISITED_KEY = 'musito_visited';
const DISMISSED_KEY = 'musito_dismissed';
const LEVEL_KEY = 'musito_user_level';

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
    { text: 'Explora nuestros vinos por categoria o busca tu favorito.', delay: 9000 },
    { text: 'Te recomiendo ver el catalogo completo!', delay: 16000 },
  ],
  catalogo: [
    { text: 'Aca vas a encontrar todos nuestros vinos!', delay: 1500 },
    { text: 'Usa los filtros para buscar por bodega o cepa.', delay: 8000 },
    { text: 'Si no sabes que elegir, preguntale al Sommelier!', delay: 14000 },
  ],
  producto: [
    { text: 'Buen ojo! Veamos este vino...', delay: 1500 },
    { text: 'Baja para ver las resenas de otros clientes.', delay: 7000 },
    { text: 'Si te gusta, sumalo al carrito!', delay: 12000 },
  ],
  carrito: [
    { text: 'Veamos que tenemos aca...', delay: 1000 },
    { text: 'Todo listo? Dale a "Finalizar compra"!', delay: 6000 },
  ],
  checkout: [
    { text: 'Ultimo paso! Completa tus datos.', delay: 1500 },
    { text: 'Podes elegir retiro en local o envio a domicilio.', delay: 7000 },
    { text: 'Ya casi es tuyo! Solo falta el pago.', delay: 13000 },
  ],
  resultado: [
    { text: 'Genial! Tu pedido esta en camino!', delay: 1500, pose: 'moto' },
    { text: 'Ya estoy preparando tu paquete...', delay: 5000, pose: 'paquete' },
    { text: 'Pronto vas a estar disfrutando un gran vino!', delay: 10000, pose: 'celebrar' },
  ],
  sommelier: [
    { text: 'Aca te atiende nuestro sommelier con IA!', delay: 2000 },
    { text: 'Contale que te gusta y te va a recomendar.', delay: 8000 },
  ],
  club: [
    { text: 'El Club MUSA es lo mejor para los amantes del vino!', delay: 1500 },
    { text: 'Recibi vinos seleccionados todos los meses.', delay: 7000 },
  ],
  etiqueta: [
    { text: 'Crea una etiqueta personalizada para regalar!', delay: 1500 },
    { text: 'Elegi la ocasion y nuestra IA hace la magia.', delay: 7000 },
  ],
  eventos: [
    { text: 'Degustaciones y eventos especiales!', delay: 1500 },
    { text: 'Reserva tu lugar por WhatsApp.', delay: 7000 },
  ],
  perfil: [
    { text: 'Tu perfil de vinos! Mira todo lo que exploraste.', delay: 1500 },
    { text: 'Completa tu mapa vinicola!', delay: 7000 },
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

// ── Quick sommelier suggestions ──
const QUICK_SUGGESTIONS = [
  { label: 'Recomendame un tinto', query: 'Recomendame un buen tinto para esta noche' },
  { label: 'Para regalar', query: 'Quiero un vino para regalar, algo especial' },
  { label: 'Sorprendeme', query: 'Sorprendeme con algo que no conozca' },
  { label: 'Maridaje', query: 'Que vino va bien con asado?' },
];

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
  const [pose, setPose] = useState('idle'); // idle, walk, moto, paquete, celebrar, wave, dizzy, sleep, dance
  const [visible, setVisible] = useState(true);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [userLevel, setUserLevel] = useState(() => {
    try { return parseInt(localStorage.getItem(LEVEL_KEY)) || 0; }
    catch { return 0; }
  });
  const timers = useRef([]);
  const idleTimer = useRef(null);
  const scrollTimer = useRef(null);
  const lastScrollY = useRef(0);
  const rapidScrollCount = useRef(0);

  const outfit = LEVEL_OUTFITS[userLevel] || LEVEL_OUTFITS[0];

  // ── Track visited sections ──
  useEffect(() => {
    if (!visited.includes(section)) {
      const next = [...visited, section];
      setVisited(next);
      localStorage.setItem(VISITED_KEY, JSON.stringify(next));
    }
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cart reaction: detect new items added ──
  useEffect(() => {
    if (dismissed) return;
    if (totalItems > prevItemsRef.current) {
      // A new item was added - find it
      const lastItem = items[items.length - 1];
      const reaction = getProductReaction(lastItem);
      setMessage(reaction);
      setBubbleVisible(true);
      setPose('celebrar');
      const t = setTimeout(() => { setBubbleVisible(false); setPose('idle'); }, 3500);
      timers.current.push(t);
    }
    prevItemsRef.current = totalItems;
  }, [totalItems, dismissed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Easter egg: rapid scroll = dizzy ──
  const dizzyTimer = useRef(null);
  useEffect(() => {
    if (dismissed) return;
    const handleScroll = () => {
      const delta = Math.abs(window.scrollY - lastScrollY.current);
      lastScrollY.current = window.scrollY;
      if (delta > 200) {
        rapidScrollCount.current++;
        if (rapidScrollCount.current >= 5 && pose !== 'dizzy') {
          setPose('dizzy');
          setMessage('Uy... para un poco que me mareo!');
          setBubbleVisible(true);
          rapidScrollCount.current = 0;
          clearTimeout(dizzyTimer.current);
          dizzyTimer.current = setTimeout(() => {
            setPose('idle');
            setBubbleVisible(false);
          }, 3000);
          return; // don't reset scroll count while dizzy
        }
      }
      // Reset rapid scroll count if no rapid scrolls for 1s
      clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => { rapidScrollCount.current = 0; }, 1000);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(dizzyTimer.current);
    };
  }, [dismissed, pose]);

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
      if (newCount >= 5) {
        setPose('dance');
        setMessage('Dale que suena el ritmo!');
        setBubbleVisible(true);
        const t = setTimeout(() => { setPose('idle'); setBubbleVisible(false); }, 4000);
        timers.current.push(t);
        return 0;
      }
      // Reset click count after 2 seconds of no clicks
      clearTimeout(clickResetTimer.current);
      clickResetTimer.current = setTimeout(() => setClickCount(0), 2000);
      return newCount;
    });
  }, []);

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

    const messages = SECTION_MESSAGES[section] || [];
    messages.forEach(({ text, delay, pose: msgPose, useTime }) => {
      const t = setTimeout(() => {
        setMessage(useTime ? getTimeMessage() : text);
        setBubbleVisible(true);
        if (msgPose) setPose(msgPose);

        const hideT = setTimeout(() => {
          setBubbleVisible(false);
          if (msgPose) setPose('idle');
        }, 4500);
        timers.current.push(hideT);
      }, delay);
      timers.current.push(t);
    });

    // Cart-aware message
    if (totalItems > 0 && !['carrito', 'checkout', 'resultado'].includes(section)) {
      const cartMsg = getCartMessage(totalItems);
      if (cartMsg) {
        const lastDelay = messages.length > 0 ? messages[messages.length - 1].delay + 6000 : 5000;
        const t = setTimeout(() => {
          setMessage(cartMsg);
          setBubbleVisible(true);
          const hideT = setTimeout(() => setBubbleVisible(false), 4000);
          timers.current.push(hideT);
        }, lastDelay);
        timers.current.push(t);
      }
    }

    // Tutorial tip for unvisited sections
    const unvisitedSections = Object.keys(SECTION_TUTORIALS).filter((sec) => {
      if (sec === 'carrito' && totalItems > 0) return false; // skip if cart has items
      return !visited.includes(sec) && sec !== section;
    });
    let lastTipDelay = messages.length > 0 ? messages[messages.length - 1].delay + 12000 : 10000;

    if (unvisitedSections.length > 0) {
      const randomSection = unvisitedSections[Math.floor(Math.random() * unvisitedSections.length)];
      const tip = SECTION_TUTORIALS[randomSection];
      const t = setTimeout(() => {
        setMessage(tip);
        setBubbleVisible(true);
        setPose('wave');
        const hideT = setTimeout(() => { setBubbleVisible(false); setPose('idle'); }, 5000);
        timers.current.push(hideT);
      }, lastTipDelay);
      timers.current.push(t);
      lastTipDelay += 8000;
    }

    // Feature tip (PWA install, general tips)
    const isMobile = window.innerWidth <= 640;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const pwaInstalled = localStorage.getItem('musa_pwa_installed') === '1';
    const applicableTips = FEATURE_TIPS.filter((ft) => {
      if (ft.condition === 'pwa') return isMobile && !isStandalone && !pwaInstalled;
      return true;
    });
    if (applicableTips.length > 0) {
      const featureTip = applicableTips[Math.floor(Math.random() * applicableTips.length)];
      const t = setTimeout(() => {
        setMessage(featureTip.text);
        setBubbleVisible(true);
        setPose('wave');
        const hideT = setTimeout(() => { setBubbleVisible(false); setPose('idle'); }, 5500);
        timers.current.push(hideT);
      }, lastTipDelay);
      timers.current.push(t);
    }
  }, [section, dismissed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update level from perfil page data ──
  const updateLevel = useCallback((level) => {
    setUserLevel(level);
    localStorage.setItem(LEVEL_KEY, String(level));
  }, []);

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
      outfit, userLevel, showQuickMenu, quickSuggestions: QUICK_SUGGESTIONS,
      dismiss, reactivate, setMessage, setBubbleVisible, setPose,
      handleMusitoClick, toggleQuickMenu, setShowQuickMenu, updateLevel,
    }}>
      {children}
    </MusitoContext.Provider>
  );
}

export const useMusito = () => useContext(MusitoContext);
