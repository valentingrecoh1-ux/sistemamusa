// Configuracion de tienda extraida de main.jsx para evitar dependencia circular
// main.jsx -> App.jsx -> TiendaApp.jsx -> main.jsx
const host = window.location.hostname;
export const isTiendaDomain = host !== 'localhost' && host !== '127.0.0.1' && !host.startsWith('sistema.');
export const TIENDA_BASE = isTiendaDomain ? '' : '/tienda';
export const tiendaPath = (path = '') => `${TIENDA_BASE}${path}`;
