import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import io from 'socket.io-client';
import ErrorBoundary from './components/shared/ErrorBoundary';
import './styles/variables.css';
import './styles/global.css';
import 'react-datepicker/dist/react-datepicker.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

const getBackendCandidates = () => {
  const host = window.location.hostname || 'localhost';
  const origin = window.location.origin;
  const port = window.location.port;
  const candidates = [];
  // Solo agregar origin si NO es el dev server de Vite (5173/3000)
  // Esto funciona cuando el frontend se sirve desde el mismo backend (build/ngrok)
  if (port !== '5173' && port !== '3000') {
    candidates.push(origin);
  }
  candidates.push(
    `http://${host}:5000`,
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'http://192.168.0.187:5000',
  );
  return [...new Set(candidates)];
};

let ip_variable = getBackendCandidates()[0];

export const IP = () => ip_variable;

// Helper: resuelve src de foto (base64 o URL, con fallback a API por ID)
export const fotoSrc = (foto, productId, index) => {
  if (foto) return foto;
  if (productId) {
    const base = `${ip_variable}/api/producto-foto/${productId}`;
    return index != null ? `${base}/${index}` : base;
  }
  return '';
};

// Helper: URL de foto de usuario con cache HTTP (cache-bust opcional)
export const userFotoUrl = (userId, v) => {
  if (!userId) return '';
  return `${ip_variable}/api/usuario-foto/${userId}${v ? `?v=${v}` : ''}`;
};

// Re-exportar constantes de tienda desde modulo separado (evita dependencia circular)
export { isTiendaDomain, TIENDA_BASE, tiendaPath } from './tiendaConfig';

export let socket;

const probeSocketServer = async (baseUrl) => {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), 1800);
  try {
    const url = `${baseUrl}/socket.io/?EIO=4&transport=polling&t=${Date.now()}`;
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timerId);
  }
};

const checkConnection = async () => {
  const candidates = getBackendCandidates();
  let resolved = false;

  for (const candidate of candidates) {
    const reachable = await probeSocketServer(candidate);
    if (reachable) {
      ip_variable = candidate;
      resolved = true;
      console.log('Conexion exitosa a', candidate);
      break;
    }
  }

  if (!resolved) {
    console.log('No se encontro backend alcanzable. Manteniendo', ip_variable);
  }

  socket = io(ip_variable);
  createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
};

checkConnection();
