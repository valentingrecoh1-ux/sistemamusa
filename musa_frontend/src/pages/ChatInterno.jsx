import { useState, useEffect, useRef } from 'react';
import { IP, socket, userFotoUrl } from '../main';
import Pagination from '../components/shared/Pagination';
import s from './ChatInterno.module.css';

const CATEGORIAS = { '': 'Todas', vinos: 'Vinos', pedidos: 'Pedidos', faltantes: 'Faltantes', general: 'General' };
const TIPOS = { '': 'Todos', nota: 'Nota', tarea: 'Tarea', aviso: 'Aviso' };
const ESTADOS = { pendiente: 'Pendiente', en_proceso: 'En proceso', resuelto: 'Resuelto' };
const ESTADO_ICON = { pendiente: 'bi-circle', en_proceso: 'bi-arrow-repeat', resuelto: 'bi-check-circle-fill' };
const TIPO_ICON = { nota: 'bi-sticky', tarea: 'bi-list-check', aviso: 'bi-megaphone' };
const CAT_ICON = { vinos: 'bi-cup-straw', pedidos: 'bi-bag', faltantes: 'bi-exclamation-triangle', general: 'bi-chat-dots' };

function timeAgo(date) {
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatInterno({ usuario }) {
  const [mensajes, setMensajes] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  // Formulario nuevo mensaje
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ texto: '', tipo: 'nota', categoria: 'general' });

  // Respuesta
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const replyInputRef = useRef(null);

  // Expandir mensaje
  const [expanded, setExpanded] = useState({});

  // Fotos de perfil: { nombre: userId } — las fotos se cargan por HTTP con cache
  const [fotoMap, setFotoMap] = useState({});
  const [fotoBust, setFotoBust] = useState(0);
  const fotoInputRef = useRef(null);

  // Ref para evitar stale closure en el listener de cambios-chat
  const fetchRef = useRef();
  const loadedRef = useRef(false);
  fetchRef.current = () => {
    socket.emit('request-mensajes-internos', {
      search, categoria: filtroCategoria, tipo: filtroTipo, estado: filtroEstado, page,
    });
  };

  useEffect(() => {
    const handler = (data) => {
      loadedRef.current = true;
      setMensajes(data?.mensajes || []);
      setTotalPages(data?.totalPages || 1);
    };
    const cambiosHandler = () => fetchRef.current();
    const fotosHandler = (map) => setFotoMap(map || {});

    socket.on('response-mensajes-internos', handler);
    socket.on('cambios-chat', cambiosHandler);
    socket.on('response-usuarios-fotos', fotosHandler);

    // Fetch inicial + retry si no llega respuesta
    fetchRef.current();
    socket.emit('request-usuarios-fotos');
    const retryTimer = setTimeout(() => {
      if (!loadedRef.current) fetchRef.current();
    }, 2000);

    return () => {
      socket.off('response-mensajes-internos', handler);
      socket.off('cambios-chat', cambiosHandler);
      socket.off('response-usuarios-fotos', fotosHandler);
      clearTimeout(retryTimer);
    };
  }, []);

  const handleFotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !usuario?._id) return;
    const formData = new FormData();
    formData.append('foto', file);
    formData.append('userId', usuario._id);
    try {
      const res = await fetch(`${IP()}/upload_foto_perfil`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.ok) { socket.emit('request-usuarios-fotos'); setFotoBust(Date.now()); }
    } catch (err) { console.error('Error subiendo foto:', err); }
    if (fotoInputRef.current) fotoInputRef.current.value = '';
  };

  const renderAvatar = (nombre, size) => {
    const userId = fotoMap[nombre];
    if (userId) {
      const url = userFotoUrl(userId, fotoBust || undefined);
      return <img src={url} alt="" className={size === 'sm' ? s.replyAvatarImg : s.avatarImg} onError={(e) => { e.target.style.display = 'none'; }} />;
    }
    return <span className={size === 'sm' ? s.replyAvatar : s.avatar}>{nombre?.[0]?.toUpperCase() || '?'}</span>;
  };

  useEffect(() => { fetchRef.current(); }, [page, search, filtroCategoria, filtroTipo, filtroEstado]);

  useEffect(() => {
    if (replyTo && replyInputRef.current) replyInputRef.current.focus();
  }, [replyTo]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.texto.trim()) return;
    socket.emit('guardar-mensaje-interno', {
      texto: form.texto.trim(),
      tipo: form.tipo,
      categoria: form.categoria,
      usuario: usuario.nombre,
      usuarioId: usuario._id,
    }, (res) => {
      if (res?.ok) setTimeout(() => fetchRef.current(), 300);
    });
    setForm({ texto: '', tipo: 'nota', categoria: 'general' });
    setShowForm(false);
    // Fallback: refetch después de un delay por si cambios-chat no se recibe
    setTimeout(() => fetchRef.current(), 800);
  };

  const handleReply = (mensajeId) => {
    if (!replyText.trim()) return;
    socket.emit('responder-mensaje-interno', {
      mensajeId,
      respuesta: {
        texto: replyText.trim(),
        usuario: usuario.nombre,
        usuarioId: usuario._id,
        fecha: new Date(),
      },
    });
    setReplyText('');
    setReplyTo(null);
    setTimeout(() => fetchRef.current(), 800);
  };

  const changeEstado = (mensajeId, estado) => {
    socket.emit('cambiar-estado-mensaje', {
      mensajeId, estado, usuario: usuario.nombre, usuarioId: usuario._id,
    });
    setTimeout(() => fetchRef.current(), 800);
  };

  const togglePin = (mensajeId) => {
    socket.emit('fijar-mensaje-interno', mensajeId);
    setTimeout(() => fetchRef.current(), 800);
  };
  const deleteMensaje = (mensajeId) => {
    socket.emit('borrar-mensaje-interno', mensajeId);
    setTimeout(() => fetchRef.current(), 800);
  };
  const deleteRespuesta = (mensajeId, respuestaId) => {
    socket.emit('borrar-respuesta-mensaje', { mensajeId, respuestaId });
    setTimeout(() => fetchRef.current(), 800);
  };
  const toggleExpand = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className={s.container}>
      {/* Header row */}
      <div className={s.topBar}>
        <div className={s.profileChip} onClick={() => fotoInputRef.current?.click()} title="Cambiar foto de perfil">
          {fotoMap[usuario.nombre]
            ? <img src={userFotoUrl(fotoMap[usuario.nombre], fotoBust || undefined)} alt="" className={s.profileChipImg} onError={(e) => { e.target.style.display = 'none'; }} />
            : <span className={s.profileChipLetter}>{usuario.nombre?.[0]?.toUpperCase() || '?'}</span>
          }
          <div className={s.profileChipOverlay}><i className="bi bi-camera" /></div>
          <input ref={fotoInputRef} type="file" accept="image/*" onChange={handleFotoUpload} hidden />
        </div>
        <button className={s.newBtn} onClick={() => setShowForm(!showForm)}>
          <i className={`bi ${showForm ? 'bi-x-lg' : 'bi-plus-lg'}`} />
          {showForm ? 'Cancelar' : 'Nuevo mensaje'}
        </button>
        <input
          className={s.searchInput}
          type="text"
          placeholder="Buscar mensajes..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {/* New message form */}
      {showForm && (
        <form className={s.form} onSubmit={handleSubmit}>
          <textarea
            className={s.textarea}
            placeholder="Escribe tu mensaje, nota o tarea..."
            value={form.texto}
            onChange={(e) => setForm({ ...form, texto: e.target.value })}
            rows={3}
          />
          <div className={s.formFooter}>
            <div className={s.formSelects}>
              <select className={s.select} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {Object.entries(TIPOS).filter(([k]) => k).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className={s.select} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                {Object.entries(CATEGORIAS).filter(([k]) => k).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <button className={s.sendBtn} type="submit" disabled={!form.texto.trim()}>
              <i className="bi bi-send" /> Publicar
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className={s.filters}>
        <div className={s.filterGroup}>
          {Object.entries(CATEGORIAS).map(([k, v]) => (
            <button
              key={k}
              className={`${s.filterBtn} ${filtroCategoria === k ? s.filterActive : ''}`}
              onClick={() => { setFiltroCategoria(k); setPage(1); }}
            >
              {k && <i className={`bi ${CAT_ICON[k]}`} />} {v}
            </button>
          ))}
        </div>
        <div className={s.filterGroup}>
          {Object.entries(TIPOS).map(([k, v]) => (
            <button
              key={`t-${k}`}
              className={`${s.filterBtn} ${filtroTipo === k ? s.filterActive : ''}`}
              onClick={() => { setFiltroTipo(k); setPage(1); }}
            >
              {v}
            </button>
          ))}
        </div>
        <div className={s.filterGroup}>
          <button
            className={`${s.filterBtn} ${filtroEstado === '' ? s.filterActive : ''}`}
            onClick={() => { setFiltroEstado(''); setPage(1); }}
          >
            Todos
          </button>
          {Object.entries(ESTADOS).map(([k, v]) => (
            <button
              key={`e-${k}`}
              className={`${s.filterBtn} ${filtroEstado === k ? s.filterActive : ''}`}
              onClick={() => { setFiltroEstado(k); setPage(1); }}
            >
              <i className={`bi ${ESTADO_ICON[k]}`} /> {v}
            </button>
          ))}
        </div>
      </div>

      {/* Messages feed */}
      <div className={s.feed}>
        {mensajes.length === 0 ? (
          <div className={s.empty}>
            <i className="bi bi-chat-square-text" />
            <span>No hay mensajes todavia</span>
          </div>
        ) : mensajes.map((msg) => (
          <div key={msg._id} className={`${s.card} ${msg.fijado ? s.pinned : ''} ${msg.estado === 'resuelto' ? s.resolved : ''}`}>
            {/* Card header */}
            <div className={s.cardHeader}>
              <div className={s.cardMeta}>
                {renderAvatar(msg.usuario)}
                <span className={s.userName}>{msg.usuario}</span>
                <span className={s.time}>{timeAgo(msg.createdAt)}</span>
                {msg.fijado && <i className={`bi bi-pin-fill ${s.pinIcon}`} title="Fijado" />}
              </div>
              <div className={s.cardTags}>
                <span className={`${s.tag} ${s[`tag_${msg.tipo}`]}`}>
                  <i className={`bi ${TIPO_ICON[msg.tipo]}`} /> {TIPOS[msg.tipo]}
                </span>
                <span className={`${s.tag} ${s[`tag_${msg.categoria}`]}`}>
                  <i className={`bi ${CAT_ICON[msg.categoria]}`} /> {CATEGORIAS[msg.categoria]}
                </span>
              </div>
            </div>

            {/* Card body */}
            <div className={s.cardBody}>
              <p className={s.texto}>{msg.texto}</p>
            </div>

            {/* Estado + assigned */}
            <div className={s.cardStatus}>
              <div className={s.estadoBtns}>
                {Object.entries(ESTADOS).map(([k, v]) => (
                  <button
                    key={k}
                    className={`${s.estadoBtn} ${msg.estado === k ? s[`estado_${k}`] : ''}`}
                    onClick={() => changeEstado(msg._id, k)}
                    title={v}
                  >
                    <i className={`bi ${ESTADO_ICON[k]}`} /> {v}
                  </button>
                ))}
              </div>
              {msg.asignadoA && (
                <span className={s.assigned}>
                  <i className="bi bi-person-check" /> {msg.asignadoA}
                </span>
              )}
            </div>

            {/* Replies */}
            {msg.respuestas?.length > 0 && (
              <div className={s.replies}>
                <button className={s.repliesToggle} onClick={() => toggleExpand(msg._id)}>
                  <i className={`bi ${expanded[msg._id] ? 'bi-chevron-up' : 'bi-chevron-down'}`} />
                  {msg.respuestas.length} {msg.respuestas.length === 1 ? 'respuesta' : 'respuestas'}
                </button>
                {expanded[msg._id] && msg.respuestas.map((r, i) => (
                  <div key={r._id || i} className={s.reply}>
                    {renderAvatar(r.usuario, 'sm')}
                    <div className={s.replyContent}>
                      <div className={s.replyMeta}>
                        <strong>{r.usuario}</strong>
                        <span className={s.replyTime}>{timeAgo(r.fecha)}</span>
                        {usuario.rol === 'admin' && (
                          <button className={s.replyDeleteBtn} onClick={() => deleteRespuesta(msg._id, r._id)} title="Eliminar respuesta">
                            <i className="bi bi-trash3" />
                          </button>
                        )}
                      </div>
                      <p>{r.texto}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Reply input */}
            {replyTo === msg._id ? (
              <div className={s.replyForm}>
                <input
                  ref={replyInputRef}
                  className={s.replyInput}
                  type="text"
                  placeholder="Escribe una respuesta..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleReply(msg._id); }}
                />
                <button className={s.replySendBtn} onClick={() => handleReply(msg._id)} disabled={!replyText.trim()}>
                  <i className="bi bi-send" />
                </button>
                <button className={s.replyCancelBtn} onClick={() => { setReplyTo(null); setReplyText(''); }}>
                  <i className="bi bi-x-lg" />
                </button>
              </div>
            ) : null}

            {/* Card actions */}
            <div className={s.cardActions}>
              <button className={s.actionBtn} onClick={() => { setReplyTo(msg._id); setReplyText(''); }} title="Responder">
                <i className="bi bi-reply" /> Responder
              </button>
              <button className={s.actionBtn} onClick={() => togglePin(msg._id)} title={msg.fijado ? 'Desfijar' : 'Fijar'}>
                <i className={`bi ${msg.fijado ? 'bi-pin-angle' : 'bi-pin'}`} /> {msg.fijado ? 'Desfijar' : 'Fijar'}
              </button>
              {(usuario.rol === 'admin' || msg.usuarioId === usuario._id) && (
                <button className={`${s.actionBtn} ${s.deleteBtn}`} onClick={() => deleteMensaje(msg._id)} title="Eliminar">
                  <i className="bi bi-trash3" /> Eliminar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      )}
    </div>
  );
}
