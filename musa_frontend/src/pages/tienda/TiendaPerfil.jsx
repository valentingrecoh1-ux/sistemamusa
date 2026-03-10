import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { fetchPerfilByToken, buscarPerfil, enviarSugerenciaToken, enviarSugerenciaBusqueda, registrarCliente, actualizarDatos } from '../../lib/tiendaApi';
import { useMusito } from '../../context/MusitoContext';
import { tiendaPath } from '../../tiendaConfig';
import s from './TiendaPerfil.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

const NIVEL_COLORS = { Nuevo: '#94a3b8', Curioso: '#60a5fa', Explorador: '#34d399', Conocedor: '#f59e0b', Sommelier: '#a78bfa', Maestro: '#f43f5e' };
const NIVEL_PROGRESS = [0, 3, 10, 25, 50, 75];
const PREMIO_ICONS = { descuento: 'bi-percent', vino_gratis: 'bi-cup-straw', degustacion_gratis: 'bi-people' };
const PREMIO_COLORS = { descuento: '#3b82f6', vino_gratis: '#8b5cf6', degustacion_gratis: '#ec4899' };
const PREMIO_LABELS = { descuento: 'Descuento', vino_gratis: 'Vino gratis', degustacion_gratis: 'Degustacion gratis' };

const PERFIL_TOKEN_KEY = 'musa_perfil_token';

// ── Character evolution ──
const CHARACTER_DATA = [
  { emoji: '🌱', title: 'Semilla', bubbles: ['¡Bienvenido! Tu aventura vinícola comienza aquí.', 'Hacé tu primera compra y empezá a crecer.'] },
  { emoji: '🍇', title: 'Uva', bubbles: ['¡Estás brotando! Seguí descubriendo vinos.', '¡Cada vino nuevo te acerca al siguiente nivel!'] },
  { emoji: '🍷', title: 'Catador', bubbles: ['¡Tu paladar se está refinando!', '¡Explorá nuevas regiones y pintá tu mapa!'] },
  { emoji: '🧐', title: 'Conocedor', bubbles: ['Tus amigos te piden recomendaciones.', '¡Tu colección impresiona! ¿Vas por todas las cepas?'] },
  { emoji: '🎩', title: 'Sommelier', bubbles: ['Paladar privilegiado. ¡Pocos llegan hasta acá!', '¡Casi maestro! Completá tu mapa de Argentina.'] },
  { emoji: '👑', title: 'Maestro', bubbles: ['¡Leyenda del vino argentino!', 'Tu colección es envidiable. ¡Lo lograste!'] },
];

// ── Argentina wine map (positions as % of map container) ──
const WINE_PROVINCES = [
  { id: 'salta', name: 'Salta', top: 6, left: 60, regions: ['Salta', 'Cafayate', 'Valles Calchaquíes'] },
  { id: 'catamarca', name: 'Catamarca', top: 11, left: 50, regions: ['Catamarca'] },
  { id: 'la_rioja', name: 'La Rioja', top: 16, left: 44, regions: ['La Rioja'] },
  { id: 'san_juan', name: 'San Juan', top: 18, left: 32, regions: ['San Juan'] },
  { id: 'cordoba', name: 'Córdoba', top: 18, left: 66, regions: ['Córdoba'] },
  { id: 'entre_rios', name: 'Entre Ríos', top: 20, left: 84, regions: ['Entre Ríos'] },
  { id: 'mendoza', name: 'Mendoza', top: 25, left: 38, regions: ['Mendoza', 'Valle de Uco', 'Luján de Cuyo', 'Maipú', 'San Rafael', 'Tupungato', 'Tunuyán', 'San Carlos', 'La Consulta', 'San Martín'] },
  { id: 'buenos_aires', name: 'Bs.As.', top: 34, left: 82, regions: ['Buenos Aires', 'Chapadmalal', 'Sierra de la Ventana'] },
  { id: 'neuquen', name: 'Neuquén', top: 44, left: 26, regions: ['Neuquén'] },
  { id: 'rio_negro', name: 'Río Negro', top: 48, left: 44, regions: ['Río Negro', 'Patagonia'] },
];

// Real Argentina SVG outline (Robinson projection, from world-map-country-shapes)
const ARGENTINA_PATH = 'M669.8 920.7l.9-3-7.3-1.5-7.7-3.6-4.3-4.6-3-2.8 5.9 13.5h5l2.9.2 3.3 2.1 4.3-.3zm-50.4-208.1l-7.4-1.5-4 5.7.9 1.6-1.1 6.6-5.6 3.2 1.6 10.6-.9 2 2 2.5-3.2 4-2.6 5.9-.9 5.8 1.7 6.2-2.1 6.5 4.9 10.9 1.6 1.2 1.3 5.9-1.6 6.2 1.4 5.4-2.9 4.3 1.5 5.9 3.3 6.3-2.5 2.4.3 5.7.7 6.4 3.3 7.6-1.6 1.2 3.6 7.1 3.1 2.3-.8 2.6 2.8 1.3 1.3 2.3-1.8 1.1 1.8 3.7 1.1 8.2-.7 5.3 1.8 3.2-.1 3.9-2.7 2.7 3.1 6.6 2.6 2.2 3.1-.4 1.8 4.6 3.5 3.6 12 .8 4.8.9 2.2.4-4.7-3.6-4.1-6.3.9-2.9 3.5-2.5.5-7.2 4.7-3.5-.2-5.6-5.2-1.3-6.4-4.5-.1-4.7 2.9-3.1 4.7-.1.2-3.3-1.2-6.1 2.9-3.9 4.1-1.9-2.5-3.2-2.2 2-4-1.9-2.5-6.2 1.5-1.6 5.6 2.3 5-.9 2.5-2.2-1.8-3.1-.1-4.8-2-3.8 5.8.6 10.2-1.3 6.9-3.4 3.3-8.3-.3-3.2-3.9-2.8-.1-4.5-7.8-5.5-.3-3.3-.4-4.2.9-1.4-1.1-6.3.3-6.5.5-5.1 5.9-8.6 5.3-6.2 3.3-2.6 4.2-3.5-.5-5.1-3.1-3.7-2.6 1.2-.3 5.7-4.3 4.8-4.2 1.1-6.2-1-5.7-1.8 4.2-9.6-1.1-2.8-5.9-2.5-7.2-4.7-4.6-1-11.2-10.4-1-1.3-6.3-.3-1.6 5.1-3.7-4.6z';

// ── Musito: pixel-art character on the wine map ──
const FEMALE_NAMES = new Set([
  'maria','ana','laura','lucia','sofia','valentina','camila','paula','carolina','florencia',
  'julieta','agustina','sol','celeste','milagros','rocio','andrea','gabriela','daniela','natalia',
  'victoria','martina','catalina','elena','isabel','mariana','fernanda','alejandra','rosa','marta',
  'julia','romina','silvina','lorena','noelia','yanina','carina','graciela','susana','liliana',
  'monica','patricia','claudia','veronica','cecilia','marina','eliana','viviana','nora','beatriz',
  'pilar','ines','luz','abril','emilia','lara','micaela','brenda','aldana','constanza',
]);
function guessGender(nombre) {
  if (!nombre) return 'male';
  const first = nombre.trim().split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (FEMALE_NAMES.has(first)) return 'female';
  if (first.endsWith('a') && !['nikola','luca','borja','josua'].includes(first)) return 'female';
  return 'male';
}

// Decorative elements scattered on the map (positions as % of container)
const MAP_DECORATIONS = [
  { type: 'vine', top: 9, left: 38, flip: false },
  { type: 'grape', top: 14, left: 72 },
  { type: 'bush', top: 22, left: 55 },
  { type: 'vine', top: 30, left: 25, flip: true },
  { type: 'barrel', top: 28, left: 68 },
  { type: 'grape', top: 38, left: 55 },
  { type: 'bush', top: 42, left: 62 },
  { type: 'vine', top: 50, left: 32, flip: false },
];

// Musito speech bubbles while walking
const MUSITO_WALK_BUBBLES = [
  '¡Vamos!', '🍇 ¡Qué lindo viñedo!', '¿Llegamos?', '🍷 ¡Salud!',
  '¡Qué camino!', '🌿 ¡Qué verde!', '¡A explorar!', '🏔️ ¡Qué vista!',
];

function getCharacterBubble(perfil) {
  const nivel = perfil.nivelNum || 0;
  const data = CHARACTER_DATA[nivel] || CHARACTER_DATA[0];
  const idx = (perfil.metricas?.cantCompras || 0) % data.bubbles.length;
  return data.bubbles[idx];
}

function generarDesafios(perfil) {
  const desafios = [];
  const regionesProbadas = new Set(
    (perfil.coleccionRegiones || []).filter((r) => r.probada).map((r) => r.region)
  );

  // Region challenge - find an unexplored province
  for (const prov of WINE_PROVINCES) {
    if (prov.regions.every((r) => !regionesProbadas.has(r))) {
      desafios.push({
        icono: 'bi-geo-alt-fill',
        titulo: `Explorá ${prov.name}`,
        desc: `Probá un vino de ${prov.name} y pintá una nueva zona en tu mapa`,
        color: '#f59e0b',
      });
      break;
    }
  }

  // Cepa challenge
  const cepasNoProbadas = (perfil.coleccionCepas || []).filter((c) => !c.probada);
  if (cepasNoProbadas.length > 0) {
    desafios.push({
      icono: 'bi-droplet-fill',
      titulo: `Probá ${cepasNoProbadas[0].cepa}`,
      desc: 'Sumá una nueva cepa a tu colección',
      color: '#8b5cf6',
    });
  }

  // Level up challenge
  const nivelNames = Object.keys(NIVEL_COLORS);
  if (perfil.nivelNum < 5) {
    const nextThreshold = NIVEL_PROGRESS[perfil.nivelNum + 1];
    const remaining = nextThreshold - (perfil.metricas?.cantCompras || 0);
    desafios.push({
      icono: 'bi-lightning-fill',
      titulo: `Subí a ${nivelNames[perfil.nivelNum + 1]}`,
      desc: remaining === 1 ? '¡Te falta solo 1 compra!' : `Te faltan ${remaining} compras`,
      color: NIVEL_COLORS[nivelNames[perfil.nivelNum + 1]],
    });
  }

  // Bodega challenge
  if (desafios.length < 3) {
    const bodegasNoProbadas = (perfil.coleccionBodegas || []).filter((b) => !b.probada);
    if (bodegasNoProbadas.length > 0) {
      desafios.push({
        icono: 'bi-building',
        titulo: `Conocé ${bodegasNoProbadas[0].bodega}`,
        desc: 'Sumá una nueva bodega a tu recorrido',
        color: '#3b82f6',
      });
    }
  }

  return desafios.slice(0, 3);
}

// Format phone: strips non-digits, normalizes to 10-digit AR mobile, displays formatted
const formatWhatsapp = (raw) => {
  let d = raw.replace(/\D/g, '');
  // Remove leading country code 54
  if (d.startsWith('54')) d = d.slice(2);
  // Remove leading 0
  if (d.startsWith('0')) d = d.slice(1);
  // Remove 15 after area code (2-4 digits)
  if (d.length >= 6 && d.match(/^\d{2,4}15/)) {
    const m = d.match(/^(\d{2,4})15(\d+)$/);
    if (m) d = m[1] + m[2];
  }
  // Limit to 10 digits
  d = d.slice(0, 10);
  // Display format: 291 431-3657
  if (d.length > 6) return `${d.slice(0, d.length - 7)} ${d.slice(d.length - 7, d.length - 4)}-${d.slice(d.length - 4)}`;
  return d;
};
const cleanWhatsapp = (raw) => raw.replace(/\D/g, '').replace(/^54/, '').replace(/^0/, '').slice(0, 10);

export default function TiendaPerfil() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { updateLevel } = useMusito();
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('coleccion');
  const [colTab, setColTab] = useState('cepas');
  const [busqueda, setBusqueda] = useState('');
  const [mode, setMode] = useState(token ? 'token' : 'search'); // 'token' or 'search'
  const [showRegister, setShowRegister] = useState(false);
  const [regForm, setRegForm] = useState({ nombre: '', apellido: '', dni: '', whatsapp: '' });
  const [regLoading, setRegLoading] = useState(false);
  const [regMsg, setRegMsg] = useState('');

  // Complete profile form (for clients created with only DNI)
  const [completeForm, setCompleteForm] = useState({ nombre: '', apellido: '', whatsapp: '' });
  const [completeLoading, setCompleteLoading] = useState(false);
  const [completeMsg, setCompleteMsg] = useState('');

  // Map interaction
  const [expandedProv, setExpandedProv] = useState(null);

  // Musito state
  const [musitoPos, setMusitoPos] = useState({ top: 25, left: 38 }); // starts at Mendoza
  const [musitoTarget, setMusitoTarget] = useState(null);
  const [musitoRunning, setMusitoRunning] = useState(false);
  const [musitoFacing, setMusitoFacing] = useState('right');
  const [musitoBubble, setMusitoBubble] = useState('');
  const musitoTimer = useRef(null);
  const bubbleTimer = useRef(null);

  const musitoGender = perfil ? guessGender(perfil.cliente?.nombre) : 'male';

  const moveMusito = useCallback((targetProv) => {
    if (musitoRunning) return;
    const prov = WINE_PROVINCES.find((p) => p.id === targetProv);
    if (!prov) return;

    const targetTop = prov.top;
    const targetLeft = prov.left;
    setMusitoFacing(targetLeft >= musitoPos.left ? 'right' : 'left');
    setMusitoRunning(true);
    setMusitoTarget({ top: targetTop, left: targetLeft });

    // Show a random bubble while walking
    const bubble = MUSITO_WALK_BUBBLES[Math.floor(Math.random() * MUSITO_WALK_BUBBLES.length)];
    setMusitoBubble(bubble);
    clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setMusitoBubble(''), 2000);

    // After transition ends, update position
    clearTimeout(musitoTimer.current);
    musitoTimer.current = setTimeout(() => {
      setMusitoPos({ top: targetTop, left: targetLeft });
      setMusitoRunning(false);
      setMusitoTarget(null);
    }, 1200); // matches CSS transition duration
  }, [musitoPos, musitoRunning]);

  // Move Musito when a province is clicked
  const handleProvClick = useCallback((provId) => {
    setExpandedProv(expandedProv === provId ? null : provId);
    moveMusito(provId);
  }, [expandedProv, moveMusito]);

  // Sync Musito outfit with user level
  useEffect(() => {
    if (perfil?.nivelNum != null) updateLevel(perfil.nivelNum);
  }, [perfil?.nivelNum, updateLevel]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      clearTimeout(musitoTimer.current);
      clearTimeout(bubbleTimer.current);
    };
  }, []);

  // Suggestion form
  const [sugTipo, setSugTipo] = useState('sugerencia');
  const [sugMensaje, setSugMensaje] = useState('');
  const [sugEnviando, setSugEnviando] = useState(false);
  const [sugExito, setSugExito] = useState('');

  // Load profile from URL token or cached token
  useEffect(() => {
    const loadToken = token || localStorage.getItem(PERFIL_TOKEN_KEY);
    if (loadToken) {
      setLoading(true);
      fetchPerfilByToken(loadToken)
        .then((data) => {
          setPerfil(data);
          setMode('token');
          localStorage.setItem(PERFIL_TOKEN_KEY, loadToken);
        })
        .catch((err) => {
          setError(err.message);
          // If cached token is invalid, clear it
          if (!token) localStorage.removeItem(PERFIL_TOKEN_KEY);
        })
        .finally(() => setLoading(false));
    }
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem(PERFIL_TOKEN_KEY);
    setPerfil(null);
    setMode('search');
    setError('');
    navigate(tiendaPath('/mi-perfil'));
  };

  const handleCompleteProfile = async (e) => {
    e.preventDefault();
    if (!completeForm.nombre.trim()) return;
    const tok = perfil?.cliente?.tokenAcceso || localStorage.getItem(PERFIL_TOKEN_KEY);
    if (!tok) return;
    setCompleteLoading(true);
    setCompleteMsg('');
    try {
      const res = await actualizarDatos(tok, completeForm);
      if (res.ok) {
        // Reload profile
        const data = await fetchPerfilByToken(tok);
        setPerfil(data);
        setCompleteMsg('Datos guardados!');
      } else {
        setCompleteMsg(res.error || 'Error al guardar');
      }
    } catch {
      setCompleteMsg('Error al guardar. Intenta de nuevo.');
    }
    setCompleteLoading(false);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (busqueda.trim().length < 3) return;
    setLoading(true);
    setError('');
    try {
      const data = await buscarPerfil(busqueda.trim());
      setPerfil(data);
      setMode('search');
      if (data.cliente?.tokenAcceso) localStorage.setItem(PERFIL_TOKEN_KEY, data.cliente.tokenAcceso);
    } catch (err) {
      setError(err.message);
      setPerfil(null);
    }
    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regForm.nombre.trim()) return;
    if (!regForm.dni.trim()) return;
    setRegLoading(true);
    setRegMsg('');
    try {
      const res = await registrarCliente(regForm);
      if (res.ok && res.token) {
        localStorage.setItem(PERFIL_TOKEN_KEY, res.token);
        setRegMsg(res.mensaje);
        setTimeout(() => navigate(tiendaPath(`/mi-perfil/${res.token}`)), 1500);
      } else if (res.error) {
        setRegMsg(res.error);
      }
    } catch {
      setRegMsg('Error al registrarte. Intenta de nuevo.');
    }
    setRegLoading(false);
  };

  const handleSugerencia = async (e) => {
    e.preventDefault();
    if (sugMensaje.trim().length < 5) return;
    setSugEnviando(true);
    setSugExito('');
    try {
      let res;
      if (mode === 'token' && token) {
        res = await enviarSugerenciaToken(token, { tipo: sugTipo, mensaje: sugMensaje });
      } else {
        res = await enviarSugerenciaBusqueda({ busqueda, tipo: sugTipo, mensaje: sugMensaje });
      }
      if (res.ok) {
        setSugExito(res.mensaje);
        setSugMensaje('');
      }
    } catch {
      // silent
    }
    setSugEnviando(false);
  };

  const premiosGanados = (perfil?.logros || []).filter((l) => l.premio);
  const premiosPendientes = (perfil?.todosLogros || []).filter((l) => !l.req && l.premio);
  const charData = CHARACTER_DATA[perfil?.nivelNum || 0] || CHARACTER_DATA[0];
  const desafios = perfil ? generarDesafios(perfil) : [];

  // Compute province probada status for map
  const regionesProbadas = new Set(
    (perfil?.coleccionRegiones || []).filter((r) => r.probada).map((r) => r.region)
  );
  const provincesStatus = WINE_PROVINCES.map((prov) => {
    const probadasCount = prov.regions.filter((r) => regionesProbadas.has(r)).length;
    return { ...prov, probada: probadasCount > 0, probadasCount, totalRegions: prov.regions.length };
  });
  const totalProvsProbadas = provincesStatus.filter((p) => p.probada).length;

  return (
    <div className={s.page}>
      {/* Hero */}
      <section className={s.hero}>
        <div className={s.heroIcon}><i className="bi bi-person-badge" /></div>
        <h1 className={s.heroTitle}>Mi Perfil MUSA</h1>
        <p className={s.heroSub}>Tu progreso, logros y premios como cliente de MUSA Vinoteca</p>
      </section>

      {/* Search or Register form (if no token) */}
      {!token && !perfil && !showRegister && (
        <section className={s.searchSection}>
          <h2 className={s.searchTitle}>Busca tu perfil</h2>
          <p className={s.searchDesc}>Ingresa tu DNI para ver tu progreso</p>
          <form onSubmit={handleSearch} className={s.searchForm}>
            <input
              type="text"
              placeholder="Tu DNI..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className={s.searchInput}
            />
            <button type="submit" className={s.searchBtn} disabled={loading || busqueda.trim().length < 3}>
              {loading ? 'Buscando...' : 'Buscar'}
            </button>
          </form>
          {error && <p className={s.error}>{error}</p>}
          <div className={s.registerLink}>
            <span>No tenes perfil todavia?</span>
            <button className={s.registerBtn} onClick={() => setShowRegister(true)}>Registrate aca</button>
          </div>
        </section>
      )}

      {/* Registration form */}
      {!token && !perfil && showRegister && (
        <section className={s.searchSection}>
          <h2 className={s.searchTitle}>Registrate en MUSA</h2>
          <p className={s.searchDesc}>Crea tu perfil para acumular logros y ganar premios</p>
          {regMsg ? (
            <div className={s.regMsg}>
              <i className="bi bi-check-circle-fill" style={{ fontSize: 32, color: '#34d399' }} />
              <p>{regMsg}</p>
            </div>
          ) : (
            <form onSubmit={handleRegister} className={s.regForm}>
              <div className={s.regRow}>
                <div className={s.regField}>
                  <label>Nombre *</label>
                  <input type="text" placeholder="Tu nombre" value={regForm.nombre} onChange={(e) => setRegForm({ ...regForm, nombre: e.target.value })} />
                </div>
                <div className={s.regField}>
                  <label>Apellido</label>
                  <input type="text" placeholder="Tu apellido" value={regForm.apellido} onChange={(e) => setRegForm({ ...regForm, apellido: e.target.value })} />
                </div>
              </div>
              <div className={s.regRow}>
                <div className={s.regField}>
                  <label>DNI *</label>
                  <input type="text" placeholder="12345678" value={regForm.dni} onChange={(e) => setRegForm({ ...regForm, dni: e.target.value })} />
                </div>
                <div className={s.regField}>
                  <label>WhatsApp</label>
                  <input type="tel" placeholder="291 431-3657" value={formatWhatsapp(regForm.whatsapp)} onChange={(e) => setRegForm({ ...regForm, whatsapp: cleanWhatsapp(e.target.value) })} />
                </div>
              </div>
              <div className={s.regBtns}>
                <button type="button" className={s.regBackBtn} onClick={() => setShowRegister(false)}>Volver</button>
                <button type="submit" className={s.searchBtn} disabled={regLoading || !regForm.nombre.trim() || !regForm.dni.trim()}>
                  {regLoading ? 'Registrando...' : 'Registrarme'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {loading && !perfil && <div className={s.loading}>Cargando tu perfil...</div>}
      {error && token && <div className={s.errorBox}><i className="bi bi-exclamation-triangle" /> {error}</div>}

      {/* Complete profile form (when client was created with only DNI) */}
      {perfil && !perfil.cliente?.nombre && (
        <section className={s.searchSection}>
          <h2 className={s.searchTitle}>Completa tu perfil</h2>
          <p className={s.searchDesc}>Ingresa tus datos para acceder a logros y premios</p>
          {completeMsg ? (
            <div className={s.regMsg}>
              <i className="bi bi-check-circle-fill" style={{ fontSize: 32, color: '#34d399' }} />
              <p>{completeMsg}</p>
            </div>
          ) : (
            <form onSubmit={handleCompleteProfile} className={s.regForm}>
              <div className={s.regRow}>
                <div className={s.regField}>
                  <label>Nombre *</label>
                  <input type="text" placeholder="Tu nombre" value={completeForm.nombre} onChange={(e) => setCompleteForm({ ...completeForm, nombre: e.target.value })} />
                </div>
                <div className={s.regField}>
                  <label>Apellido</label>
                  <input type="text" placeholder="Tu apellido" value={completeForm.apellido} onChange={(e) => setCompleteForm({ ...completeForm, apellido: e.target.value })} />
                </div>
              </div>
              <div className={s.regField}>
                <label>WhatsApp</label>
                <input type="tel" placeholder="291 431-3657" value={formatWhatsapp(completeForm.whatsapp)} onChange={(e) => setCompleteForm({ ...completeForm, whatsapp: cleanWhatsapp(e.target.value) })} />
              </div>
              <div className={s.regBtns}>
                <button type="submit" className={s.searchBtn} disabled={completeLoading || !completeForm.nombre.trim()}>
                  {completeLoading ? 'Guardando...' : 'Guardar datos'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Profile content */}
      {perfil && (
        <div className={s.profileWrap}>

          {/* Header card with character */}
          <div className={s.profileHeader}>
            <div className={s.character} style={{ '--nivel-color': NIVEL_COLORS[perfil.nivel] || '#94a3b8' }}>
              <div className={s.characterAvatar}>
                <span className={s.characterEmoji}>{charData.emoji}</span>
                <span className={s.characterLevel}>Nv.{perfil.nivelNum}</span>
              </div>
              <div className={s.characterBubble}>
                <span className={s.characterBubbleText}>{getCharacterBubble(perfil)}</span>
              </div>
            </div>
            <div className={s.headerInfo}>
              <div className={s.headerTop}>
                <div>
                  <h2 className={s.clienteName}>{perfil.cliente?.nombre}{perfil.cliente?.apellido ? ` ${perfil.cliente.apellido}` : ''}</h2>
                  <span className={s.nivelTag} style={{ background: NIVEL_COLORS[perfil.nivel] }}>{perfil.nivel}</span>
                </div>
                <button className={s.logoutBtn} onClick={handleLogout} title="Cerrar sesion">
                  <i className="bi bi-box-arrow-right" /> Salir
                </button>
              </div>
              <div className={s.kpis}>
                <div className={s.kpi}><span className={s.kpiVal}>{perfil.metricas?.cantCompras || 0}</span><span className={s.kpiLabel}>Compras</span></div>
                <div className={s.kpi}><span className={s.kpiVal}>{perfil.metricas?.vinosUnicos || 0}</span><span className={s.kpiLabel}>Vinos</span></div>
                <div className={s.kpi}><span className={s.kpiVal}>{perfil.preferencias?.cepasProbadas || 0}/{perfil.preferencias?.totalCepas || 0}</span><span className={s.kpiLabel}>Cepas</span></div>
                <div className={s.kpi}><span className={s.kpiVal}>{totalProvsProbadas}/{WINE_PROVINCES.length}</span><span className={s.kpiLabel}>Zonas</span></div>
              </div>
              {(perfil.preferencias?.cepaFavorita || perfil.preferencias?.bodegaFavorita) && (
                <div className={s.prefChips}>
                  {perfil.preferencias.cepaFavorita && <span className={s.prefChip}><i className="bi bi-heart-fill" /> {perfil.preferencias.cepaFavorita}</span>}
                  {perfil.preferencias.bodegaFavorita && <span className={s.prefChip}><i className="bi bi-building" /> {perfil.preferencias.bodegaFavorita}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Level progress */}
          <div className={s.progressSection}>
            <div className={s.progressLabel}>
              <span>Progreso al siguiente nivel</span>
              {perfil.nivelNum < 5 && (
                <span className={s.progressInfo}>{perfil.metricas?.cantCompras}/{NIVEL_PROGRESS[perfil.nivelNum + 1]} compras</span>
              )}
            </div>
            <div className={s.progressBar}>
              <div
                className={s.progressFill}
                style={{
                  width: perfil.nivelNum >= 5 ? '100%' : `${Math.min(100, (perfil.metricas?.cantCompras / NIVEL_PROGRESS[perfil.nivelNum + 1]) * 100)}%`,
                  background: NIVEL_COLORS[perfil.nivel],
                }}
              />
            </div>
          </div>

          {/* Desafios */}
          {desafios.length > 0 && (
            <div className={s.desafiosSection}>
              <h3 className={s.desafiosTitle}><i className="bi bi-fire" /> Desafios activos</h3>
              <div className={s.desafiosGrid}>
                {desafios.map((d, i) => (
                  <div key={i} className={s.desafioCard} style={{ '--desafio-color': d.color }}>
                    <div className={s.desafioIcon}><i className={`bi ${d.icono}`} /></div>
                    <div className={s.desafioInfo}>
                      <span className={s.desafioTitulo}>{d.titulo}</span>
                      <span className={s.desafioDesc}>{d.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className={s.tabs}>
            {[
              { key: 'coleccion', label: 'Coleccion', icon: 'bi-collection' },
              { key: 'resumen', label: 'Logros', icon: 'bi-trophy' },
              { key: 'premios', label: 'Premios', icon: 'bi-gift' },
              { key: 'sugerencias', label: 'Comentarios', icon: 'bi-chat-dots' },
            ].map((t) => (
              <button key={t.key} className={`${s.tab} ${tab === t.key ? s.tabActive : ''}`} onClick={() => setTab(t.key)}>
                <i className={`bi ${t.icon}`} /> {t.label}
              </button>
            ))}
          </div>

          {/* Tab: Logros */}
          {tab === 'resumen' && (
            <div className={s.tabContent}>
              <h3 className={s.sectionTitle}>Logros desbloqueados ({perfil.logros?.length || 0})</h3>
              <div className={s.logrosGrid}>
                {(perfil.todosLogros || []).map((l) => (
                  <div key={l.id} className={`${s.logroCard} ${l.req ? s.logroDesbloqueado : s.logroBloqueado}`}>
                    <div className={s.logroIcon}><i className={`bi ${l.icono}`} /></div>
                    <div className={s.logroInfo}>
                      <span className={s.logroNombre}>{l.nombre}</span>
                      <span className={s.logroDesc}>{l.desc}</span>
                      {l.premio && (
                        <span className={s.logroPremio} style={{ color: PREMIO_COLORS[l.premio.tipo] }}>
                          <i className={`bi ${PREMIO_ICONS[l.premio.tipo] || 'bi-gift'}`} /> {l.premio.descripcion}
                        </span>
                      )}
                    </div>
                    {l.req && <i className="bi bi-check-circle-fill" style={{ color: '#34d399', fontSize: 18 }} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab: Premios */}
          {tab === 'premios' && (
            <div className={s.tabContent}>
              <h3 className={s.sectionTitle}>Premios disponibles ({premiosGanados.length})</h3>
              {premiosGanados.length === 0 ? (
                <div className={s.empty}>Aun no desbloqueaste premios. Segui comprando para ganar recompensas!</div>
              ) : (
                <div className={s.premiosGrid}>
                  {premiosGanados.map((l) => (
                    <div key={l.id} className={s.premioCard}>
                      <div className={s.premioIconWrap} style={{ background: `${PREMIO_COLORS[l.premio.tipo]}18`, color: PREMIO_COLORS[l.premio.tipo] }}>
                        <i className={`bi ${PREMIO_ICONS[l.premio.tipo] || 'bi-gift'}`} />
                      </div>
                      <div className={s.premioInfo}>
                        <span className={s.premioTipo} style={{ color: PREMIO_COLORS[l.premio.tipo] }}>{PREMIO_LABELS[l.premio.tipo]}</span>
                        <span className={s.premioDesc}>{l.premio.descripcion}</span>
                        <span className={s.premioOrigen}>Por: {l.nombre}</span>
                      </div>
                      <i className="bi bi-check-circle-fill" style={{ color: '#34d399', fontSize: 20 }} />
                    </div>
                  ))}
                </div>
              )}

              {premiosPendientes.length > 0 && (
                <>
                  <h3 className={s.sectionTitle} style={{ marginTop: 24 }}>Proximos premios por desbloquear</h3>
                  <div className={s.premiosGrid}>
                    {premiosPendientes.map((l) => (
                      <div key={l.id} className={`${s.premioCard} ${s.premioPendiente}`}>
                        <div className={s.premioIconWrap} style={{ background: 'var(--tienda-surface)', color: 'var(--tienda-text-muted)' }}>
                          <i className={`bi ${PREMIO_ICONS[l.premio.tipo] || 'bi-gift'}`} />
                        </div>
                        <div className={s.premioInfo}>
                          <span className={s.premioTipo} style={{ color: 'var(--tienda-text-muted)' }}>{PREMIO_LABELS[l.premio.tipo]}</span>
                          <span className={s.premioDesc}>{l.premio.descripcion}</span>
                          <span className={s.premioOrigen}><i className="bi bi-lock" /> {l.nombre} - {l.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tab: Coleccion */}
          {tab === 'coleccion' && (
            <div className={s.tabContent}>
              <div className={s.colSubTabs}>
                {[
                  { key: 'cepas', label: 'Cepas', icon: 'bi-grid-3x3' },
                  { key: 'bodegas', label: 'Bodegas', icon: 'bi-building' },
                  { key: 'regiones', label: 'Regiones', icon: 'bi-geo-alt' },
                ].map((t) => (
                  <button key={t.key} className={`${s.colSubTab} ${colTab === t.key ? s.colSubTabActive : ''}`} onClick={() => setColTab(t.key)}>
                    <i className={`bi ${t.icon}`} /> {t.label}
                  </button>
                ))}
              </div>

              {colTab === 'cepas' && (<>
                <div className={s.coleccionHeader}>
                  <h3 className={s.sectionTitle}>Coleccion de Cepas</h3>
                  <span className={s.coleccionProgress}>
                    {perfil.coleccionCepas?.filter((c) => c.probada).length || 0} / {perfil.coleccionCepas?.length || 0} probadas
                  </span>
                </div>
                <div className={s.cepaGrid}>
                  {(perfil.coleccionCepas || []).map((c) => (
                    <div key={c.cepa} className={`${s.cepaCard} ${c.probada ? s.cepaProbada : s.cepaNoProbada}`}>
                      <i className={`bi ${c.probada ? 'bi-check-circle-fill' : 'bi-circle'}`} />
                      <span className={s.cepaNombre}>{c.cepa}</span>
                    </div>
                  ))}
                </div>
                {(perfil.coleccionCepas || []).length === 0 && <div className={s.empty}>No hay cepas en el catalogo aun.</div>}
              </>)}

              {colTab === 'bodegas' && (<>
                <div className={s.coleccionHeader}>
                  <h3 className={s.sectionTitle}>Coleccion de Bodegas</h3>
                  <span className={s.coleccionProgress}>
                    {perfil.coleccionBodegas?.filter((b) => b.probada).length || 0} / {perfil.coleccionBodegas?.length || 0} probadas
                  </span>
                </div>
                <div className={s.cepaGrid}>
                  {(perfil.coleccionBodegas || []).map((b) => (
                    <div key={b.bodega} className={`${s.cepaCard} ${b.probada ? s.cepaProbada : s.cepaNoProbada}`}>
                      <i className={`bi ${b.probada ? 'bi-check-circle-fill' : 'bi-circle'}`} />
                      <span className={s.cepaNombre}>{b.bodega}</span>
                    </div>
                  ))}
                </div>
                {(perfil.coleccionBodegas || []).length === 0 && <div className={s.empty}>No hay bodegas en el catalogo aun.</div>}
              </>)}

              {colTab === 'regiones' && (<>
                <div className={s.coleccionHeader}>
                  <h3 className={s.sectionTitle}>Mapa Vinícola</h3>
                  <span className={s.coleccionProgress}>
                    {totalProvsProbadas} / {WINE_PROVINCES.length} zonas
                  </span>
                </div>

                {/* Argentina Wine Map - SVG with pins + Musito */}
                <div className={s.wineMap}>
                  <div className={s.mapContainer}>
                    {/* Argentina silhouette */}
                    <svg className={s.mapSvg} viewBox="595 705 80 225" xmlns="http://www.w3.org/2000/svg">
                      <path d={ARGENTINA_PATH} className={s.mapOutline} />
                    </svg>

                    {/* Decorative vineyard elements */}
                    {MAP_DECORATIONS.map((dec, i) => (
                      <span
                        key={i}
                        className={`${s.mapDeco} ${s[`mapDeco_${dec.type}`]} ${dec.flip ? s.mapDecoFlip : ''}`}
                        style={{ top: `${dec.top}%`, left: `${dec.left}%` }}
                      />
                    ))}

                    {/* Province pins */}
                    {provincesStatus.map((prov) => (
                      <button
                        key={prov.id}
                        className={`${s.mapPin} ${prov.probada ? s.mapPinProbada : s.mapPinLocked} ${expandedProv === prov.id ? s.mapPinActive : ''}`}
                        style={{ top: `${prov.top}%`, left: `${prov.left}%` }}
                        onClick={() => handleProvClick(prov.id)}
                      >
                        <span className={s.mapPinDot}>
                          {prov.probada ? <i className="bi bi-check" /> : <i className="bi bi-lock-fill" />}
                        </span>
                        <span className={s.mapPinLabel}>{prov.name}</span>
                        {prov.totalRegions > 1 && (
                          <span className={s.mapPinCount}>{prov.probadasCount}/{prov.totalRegions}</span>
                        )}
                      </button>
                    ))}

                    {/* Musito character */}
                    <div
                      className={`${s.musito} ${musitoRunning ? s.musitoRunning : ''} ${musitoFacing === 'left' ? s.musitoLeft : ''} ${musitoGender === 'female' ? s.musitoFemale : ''}`}
                      style={{
                        top: `${(musitoTarget || musitoPos).top}%`,
                        left: `${(musitoTarget || musitoPos).left}%`,
                      }}
                    >
                      {musitoBubble && <span className={s.musitoBubble}>{musitoBubble}</span>}
                      <div className={s.musitoSprite}>
                        <div className={s.musitoHead} />
                        <div className={s.musitoBody} />
                        <div className={s.musitoLegs}>
                          <span className={s.musitoLegL} />
                          <span className={s.musitoLegR} />
                        </div>
                      </div>
                      <span className={s.musitoName}>Musito</span>
                    </div>
                  </div>

                  {/* Expanded province detail */}
                  {expandedProv && (() => {
                    const prov = provincesStatus.find((p) => p.id === expandedProv);
                    if (!prov || prov.totalRegions <= 1) return null;
                    return (
                      <div className={s.mapDetail}>
                        <h4 className={s.mapDetailTitle}>
                          <i className={`bi ${prov.probada ? 'bi-pin-map-fill' : 'bi-geo-alt'}`} /> Regiones de {prov.name}
                        </h4>
                        <div className={s.mapDetailList}>
                          {prov.regions.map((r) => {
                            const probada = regionesProbadas.has(r);
                            return (
                              <div key={r} className={`${s.mapDetailItem} ${probada ? s.mapDetailProbada : ''}`}>
                                <i className={`bi ${probada ? 'bi-check-circle-fill' : 'bi-circle'}`} />
                                <span>{r}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Full region list below map */}
                <h4 className={s.sectionTitle} style={{ marginTop: 8 }}>Todas las regiones</h4>
                <div className={s.cepaGrid}>
                  {(perfil.coleccionRegiones || []).map((r) => (
                    <div key={r.region} className={`${s.cepaCard} ${r.probada ? s.cepaProbada : s.cepaNoProbada}`}>
                      <i className={`bi ${r.probada ? 'bi-check-circle-fill' : 'bi-circle'}`} />
                      <span className={s.cepaNombre}>{r.region}</span>
                    </div>
                  ))}
                </div>
                {(perfil.coleccionRegiones || []).length === 0 && <div className={s.empty}>No hay regiones en el catalogo aun.</div>}
              </>)}
            </div>
          )}

          {/* Tab: Sugerencias */}
          {tab === 'sugerencias' && (
            <div className={s.tabContent}>
              <h3 className={s.sectionTitle}>Dejanos tu comentario</h3>
              <p className={s.sugDesc}>Tu opinion nos ayuda a mejorar. Contanos que te gustaria ver en MUSA.</p>

              {sugExito ? (
                <div className={s.sugExito}>
                  <i className="bi bi-check-circle-fill" /> {sugExito}
                  <button className={s.sugOtroBtn} onClick={() => setSugExito('')}>Enviar otro comentario</button>
                </div>
              ) : (
                <form onSubmit={handleSugerencia} className={s.sugForm}>
                  <div className={s.sugTipos}>
                    {[
                      { val: 'sugerencia', label: 'Sugerencia', icon: 'bi-lightbulb' },
                      { val: 'mejora', label: 'Mejora', icon: 'bi-arrow-up-circle' },
                      { val: 'reclamo', label: 'Reclamo', icon: 'bi-exclamation-circle' },
                      { val: 'otro', label: 'Otro', icon: 'bi-chat' },
                    ].map((t) => (
                      <button
                        key={t.val}
                        type="button"
                        className={`${s.sugTipoBtn} ${sugTipo === t.val ? s.sugTipoBtnActive : ''}`}
                        onClick={() => setSugTipo(t.val)}
                      >
                        <i className={`bi ${t.icon}`} /> {t.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className={s.sugTextarea}
                    placeholder="Escribi tu comentario aca..."
                    value={sugMensaje}
                    onChange={(e) => setSugMensaje(e.target.value)}
                    rows={4}
                  />
                  <button type="submit" className={s.sugSubmit} disabled={sugEnviando || sugMensaje.trim().length < 5}>
                    {sugEnviando ? 'Enviando...' : 'Enviar comentario'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
