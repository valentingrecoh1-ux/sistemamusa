import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { fetchPerfilByToken, buscarPerfil, enviarSugerenciaToken, enviarSugerenciaBusqueda, registrarCliente } from '../../lib/tiendaApi';
import s from './TiendaPerfil.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

const NIVEL_COLORS = { Nuevo: '#94a3b8', Curioso: '#60a5fa', Explorador: '#34d399', Conocedor: '#f59e0b', Sommelier: '#a78bfa', Maestro: '#f43f5e' };
const NIVEL_PROGRESS = [0, 3, 10, 25, 50, 75];
const PREMIO_ICONS = { descuento: 'bi-percent', vino_gratis: 'bi-cup-straw', degustacion_gratis: 'bi-people' };
const PREMIO_COLORS = { descuento: '#3b82f6', vino_gratis: '#8b5cf6', degustacion_gratis: '#ec4899' };
const PREMIO_LABELS = { descuento: 'Descuento', vino_gratis: 'Vino gratis', degustacion_gratis: 'Degustacion gratis' };

export default function TiendaPerfil() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('resumen');
  const [busqueda, setBusqueda] = useState('');
  const [mode, setMode] = useState(token ? 'token' : 'search'); // 'token' or 'search'
  const [showRegister, setShowRegister] = useState(false);
  const [regForm, setRegForm] = useState({ nombre: '', apellido: '', dni: '', email: '', whatsapp: '' });
  const [regLoading, setRegLoading] = useState(false);
  const [regMsg, setRegMsg] = useState('');

  // Suggestion form
  const [sugTipo, setSugTipo] = useState('sugerencia');
  const [sugMensaje, setSugMensaje] = useState('');
  const [sugEnviando, setSugEnviando] = useState(false);
  const [sugExito, setSugExito] = useState('');

  useEffect(() => {
    if (token) {
      setLoading(true);
      fetchPerfilByToken(token)
        .then((data) => { setPerfil(data); setMode('token'); })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [token]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (busqueda.trim().length < 3) return;
    setLoading(true);
    setError('');
    try {
      const data = await buscarPerfil(busqueda.trim());
      setPerfil(data);
      setMode('search');
    } catch (err) {
      setError(err.message);
      setPerfil(null);
    }
    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regForm.nombre.trim()) return;
    if (!regForm.dni.trim() && !regForm.email.trim()) return;
    setRegLoading(true);
    setRegMsg('');
    try {
      const res = await registrarCliente(regForm);
      if (res.ok && res.token) {
        setRegMsg(res.mensaje);
        setTimeout(() => navigate(`/tienda/mi-perfil/${res.token}`), 1500);
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
          <p className={s.searchDesc}>Ingresa tu DNI o email para ver tu progreso</p>
          <form onSubmit={handleSearch} className={s.searchForm}>
            <input
              type="text"
              placeholder="DNI o email..."
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
                  <label>Email *</label>
                  <input type="email" placeholder="tu@email.com" value={regForm.email} onChange={(e) => setRegForm({ ...regForm, email: e.target.value })} />
                </div>
              </div>
              <div className={s.regField}>
                <label>WhatsApp</label>
                <input type="text" placeholder="1155667788" value={regForm.whatsapp} onChange={(e) => setRegForm({ ...regForm, whatsapp: e.target.value })} />
              </div>
              <p className={s.regHint}>* DNI o email es obligatorio. Tu perfil queda pendiente hasta que te aprobemos en la vinoteca.</p>
              <div className={s.regBtns}>
                <button type="button" className={s.regBackBtn} onClick={() => setShowRegister(false)}>Volver</button>
                <button type="submit" className={s.searchBtn} disabled={regLoading || !regForm.nombre.trim() || (!regForm.dni.trim() && !regForm.email.trim())}>
                  {regLoading ? 'Registrando...' : 'Registrarme'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {loading && !perfil && <div className={s.loading}>Cargando tu perfil...</div>}
      {error && token && <div className={s.errorBox}><i className="bi bi-exclamation-triangle" /> {error}</div>}

      {/* Profile content */}
      {perfil && (
        <div className={s.profileWrap}>
          {/* Pending approval banner */}
          {perfil.cliente?.estadoPerfil === 'pendiente' && (
            <div className={s.pendingBanner}>
              <i className="bi bi-hourglass-split" />
              <div>
                <strong>Perfil pendiente de aprobacion</strong>
                <p>Tu registro esta siendo revisado. Una vez aprobado, tus compras se vincularan automaticamente.</p>
              </div>
            </div>
          )}

          {/* Header card */}
          <div className={s.profileHeader}>
            <div className={s.nivelBadge} style={{ background: NIVEL_COLORS[perfil.nivel] || '#94a3b8' }}>
              <span className={s.nivelNum}>Nv.{perfil.nivelNum}</span>
              <span className={s.nivelNombre}>{perfil.nivel}</span>
            </div>
            <div className={s.headerInfo}>
              <h2 className={s.clienteName}>{perfil.cliente?.nombre}{perfil.cliente?.apellido ? ` ${perfil.cliente.apellido}` : ''}</h2>
              <div className={s.kpis}>
                <div className={s.kpi}><span className={s.kpiVal}>{perfil.metricas?.cantCompras || 0}</span><span className={s.kpiLabel}>Compras</span></div>
                <div className={s.kpi}><span className={s.kpiVal}>{perfil.metricas?.vinosUnicos || 0}</span><span className={s.kpiLabel}>Vinos</span></div>
                <div className={s.kpi}><span className={s.kpiVal}>{perfil.preferencias?.cepasProbadas || 0}/{perfil.preferencias?.totalCepas || 0}</span><span className={s.kpiLabel}>Cepas</span></div>
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

          {/* Tabs */}
          <div className={s.tabs}>
            {[
              { key: 'resumen', label: 'Logros', icon: 'bi-trophy' },
              { key: 'premios', label: 'Premios', icon: 'bi-gift' },
              { key: 'coleccion', label: 'Coleccion', icon: 'bi-collection' },
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
              {(perfil.coleccionCepas || []).length === 0 && (
                <div className={s.empty}>No hay cepas en el catalogo aun.</div>
              )}
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
