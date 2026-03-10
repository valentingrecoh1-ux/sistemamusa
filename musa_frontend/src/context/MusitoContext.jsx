import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useCart } from './CartContext';

const MusitoContext = createContext();

const VISITED_KEY = 'musito_visited';
const DISMISSED_KEY = 'musito_dismissed';

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

// Contextual messages Musito says on each page
const SECTION_MESSAGES = {
  home: [
    { text: 'Bienvenido a MUSA! Soy Musito, tu guia vinicola.', delay: 2000 },
    { text: 'Explora nuestros vinos por categoria o busca tu favorito.', delay: 8000 },
    { text: 'Te recomiendo ver el catalogo completo!', delay: 15000 },
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

// Tutorial tips for sections the user hasn't visited yet
const SECTION_TUTORIALS = {
  catalogo: 'Todavia no visitaste el catalogo. Hay mas de 100 vinos esperandote!',
  sommelier: 'Conoces a nuestro Sommelier IA? Te recomienda vinos con tu voz!',
  club: 'Sabias que tenemos un Club del Vino? Recibi vinos cada mes!',
  etiqueta: 'Podes crear etiquetas personalizadas con IA! Ideal para regalos.',
  eventos: 'Hacemos degustaciones y eventos. Pasa a ver!',
  perfil: 'Crea tu perfil y lleva un registro de tus vinos favoritos.',
};

// Cart-aware messages
function getCartMessage(totalItems) {
  if (totalItems === 1) return 'Tenes 1 vino en el carrito. Buen comienzo!';
  if (totalItems > 1 && totalItems <= 3) return `Llevas ${totalItems} vinos! Linda seleccion.`;
  if (totalItems > 3) return `${totalItems} vinos en el carrito! Te luciste!`;
  return null;
}

export function MusitoProvider({ children }) {
  const { pathname } = useLocation();
  const { totalItems } = useCart();
  const section = getSection(pathname);

  const [visited, setVisited] = useState(() => {
    try { return JSON.parse(localStorage.getItem(VISITED_KEY)) || []; }
    catch { return []; }
  });
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1');
  const [message, setMessage] = useState('');
  const [pose, setPose] = useState('idle'); // idle, walk, moto, paquete, celebrar, wave
  const [visible, setVisible] = useState(true);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const timers = useRef([]);

  // Track visited sections
  useEffect(() => {
    if (!visited.includes(section)) {
      const next = [...visited, section];
      setVisited(next);
      localStorage.setItem(VISITED_KEY, JSON.stringify(next));
    }
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear timers on section change
  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [section]);

  // Show contextual messages when section changes
  useEffect(() => {
    if (dismissed) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];

    // Entrance animation
    setPose('walk');
    const walkTimer = setTimeout(() => setPose('idle'), 800);
    timers.current.push(walkTimer);

    const messages = SECTION_MESSAGES[section] || [];
    messages.forEach(({ text, delay, pose: msgPose }) => {
      const t = setTimeout(() => {
        setMessage(text);
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

    // Cart-aware message after section messages
    if (totalItems > 0 && section !== 'carrito' && section !== 'checkout' && section !== 'resultado') {
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

    // Tutorial tip for an unvisited section
    const unvisitedSections = Object.keys(SECTION_TUTORIALS).filter((s) => !visited.includes(s) && s !== section);
    if (unvisitedSections.length > 0) {
      const randomSection = unvisitedSections[Math.floor(Math.random() * unvisitedSections.length)];
      const tip = SECTION_TUTORIALS[randomSection];
      const tipDelay = messages.length > 0 ? messages[messages.length - 1].delay + 12000 : 10000;
      const t = setTimeout(() => {
        setMessage(tip);
        setBubbleVisible(true);
        setPose('wave');
        const hideT = setTimeout(() => { setBubbleVisible(false); setPose('idle'); }, 5000);
        timers.current.push(hideT);
      }, tipDelay);
      timers.current.push(t);
    }
  }, [section, dismissed]); // eslint-disable-line react-hooks/exhaustive-deps

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
      dismiss, reactivate, setMessage, setBubbleVisible, setPose,
    }}>
      {children}
    </MusitoContext.Provider>
  );
}

export const useMusito = () => useContext(MusitoContext);
