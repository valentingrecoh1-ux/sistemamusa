import { useState, useEffect, useRef } from 'react';
import { IP, socket } from '../main';
import s from './Vidriera.module.css';

export default function Vidriera({ usuario }) {
  const [medios, setMedios] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const tvUrl = `${window.location.origin}/tv`;

  const fetchMedias = () => socket.emit('request-media-tv');

  useEffect(() => {
    const handler = (data) => setMedios(data || []);
    const cambios = () => fetchMedias();

    socket.on('response-media-tv', handler);
    socket.on('cambios-media-tv', cambios);
    fetchMedias();

    return () => {
      socket.off('response-media-tv', handler);
      socket.off('cambios-media-tv', cambios);
    };
  }, []);

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    for (const file of files) {
      const formData = new FormData();
      formData.append('archivo', file);
      formData.append('nombre', file.name);
      formData.append('usuario', usuario?.nombre || '');
      try {
        await fetch(`${IP()}/api/tv/upload`, { method: 'POST', body: formData });
      } catch (err) {
        console.error('Error subiendo media:', err);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDelete = (id) => socket.emit('eliminar-media-tv', id);
  const handleToggle = (id) => socket.emit('toggle-media-tv', id);

  const handleDuracion = (id, val) => {
    const dur = parseInt(val, 10);
    if (dur > 0) socket.emit('actualizar-duracion-media-tv', { mediaId: id, duracion: dur });
  };

  const handleMoveUp = (index) => {
    if (index === 0) return;
    const arr = [...medios];
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
    const reorder = arr.map((m, i) => ({ _id: m._id, orden: i }));
    socket.emit('reordenar-media-tv', reorder);
  };

  const handleMoveDown = (index) => {
    if (index >= medios.length - 1) return;
    const arr = [...medios];
    [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
    const reorder = arr.map((m, i) => ({ _id: m._id, orden: i }));
    socket.emit('reordenar-media-tv', reorder);
  };

  return (
    <div className={s.container}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}><i className="bi bi-tv" /> Vidriera / Televisor</h2>
          <p className={s.subtitle}>Administra las imagenes que se muestran en el televisor</p>
        </div>
        <div className={s.headerActions}>
          <button className={s.previewBtn} onClick={() => window.open('/tv', '_blank')}>
            <i className="bi bi-eye" /> Vista previa
          </button>
          <button className={s.uploadBtn} onClick={() => fileRef.current?.click()} disabled={uploading}>
            <i className={`bi ${uploading ? 'bi-hourglass-split' : 'bi-cloud-arrow-up'}`} />
            {uploading ? 'Subiendo...' : 'Subir imagen'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload} hidden />
        </div>
      </div>

      <div className={s.urlCard}>
        <div className={s.urlLabel}>
          <i className="bi bi-link-45deg" /> URL para el televisor:
        </div>
        <div className={s.urlRow}>
          <code className={s.urlCode}>{tvUrl}</code>
          <button className={s.copyBtn} onClick={() => { navigator.clipboard.writeText(tvUrl); }} title="Copiar URL">
            <i className="bi bi-clipboard" />
          </button>
        </div>
        <p className={s.urlHint}>Abre esta URL en el navegador del televisor</p>
      </div>

      {medios.length === 0 ? (
        <div className={s.empty}>
          <i className="bi bi-image" />
          <span>No hay imagenes cargadas</span>
          <span className={s.emptyHint}>Subi flyers, promociones o imagenes para mostrar en la vidriera</span>
        </div>
      ) : (
        <div className={s.grid}>
          {medios.map((m, i) => (
            <div key={m._id} className={`${s.card} ${!m.activo ? s.cardInactive : ''}`}>
              <div className={s.cardImg}>
                <img src={`${IP()}/api/tv/imagen/${m._id}`} alt={m.nombre} />
                {!m.activo && <div className={s.inactiveBadge}>Inactivo</div>}
              </div>
              <div className={s.cardBody}>
                <div className={s.cardName} title={m.nombre}>{m.nombre}</div>
                <div className={s.cardControls}>
                  <div className={s.duracionGroup}>
                    <i className="bi bi-clock" />
                    <input
                      type="number"
                      className={s.duracionInput}
                      value={m.duracion}
                      min="1"
                      max="120"
                      onChange={(e) => {
                        setMedios(prev => prev.map(x => x._id === m._id ? { ...x, duracion: e.target.value } : x));
                      }}
                      onBlur={(e) => handleDuracion(m._id, e.target.value)}
                    />
                    <span className={s.duracionLabel}>seg</span>
                  </div>
                  <div className={s.cardActions}>
                    <button className={s.iconBtn} onClick={() => handleMoveUp(i)} disabled={i === 0} title="Subir">
                      <i className="bi bi-chevron-up" />
                    </button>
                    <button className={s.iconBtn} onClick={() => handleMoveDown(i)} disabled={i === medios.length - 1} title="Bajar">
                      <i className="bi bi-chevron-down" />
                    </button>
                    <button className={`${s.iconBtn} ${m.activo ? s.activeToggle : s.inactiveToggle}`} onClick={() => handleToggle(m._id)} title={m.activo ? 'Desactivar' : 'Activar'}>
                      <i className={`bi ${m.activo ? 'bi-eye-fill' : 'bi-eye-slash'}`} />
                    </button>
                    <button className={`${s.iconBtn} ${s.deleteBtn}`} onClick={() => handleDelete(m._id)} title="Eliminar">
                      <i className="bi bi-trash3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
