import { useState, useEffect } from 'react';
import { socket } from '../../main';
import s from './WebConfig.module.css';

export default function WebConfig() {
  const [config, setConfig] = useState({
    bannerTexto: '',
    bannerSubtexto: '',
    whatsappNumero: '',
    aboutTexto: '',
    envioHabilitado: false,
    costoEnvio: 0,
    retiroEnLocal: true,
    direccionLocal: '',
    horarios: '',
    instagramUrl: '',
    tiendaActiva: true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    socket.on('response-config-tienda', (data) => {
      if (data && Object.keys(data).length > 0) setConfig(data);
    });
    socket.emit('request-config-tienda');
    return () => socket.off('response-config-tienda');
  }, []);

  const handleField = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setConfig((prev) => ({ ...prev, [field]: val }));
  };

  const handleSave = () => {
    setSaving(true);
    socket.emit('update-config-tienda', config, (res) => {
      setSaving(false);
      if (res?.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  };

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h2>Configuracion de la Tienda Web</h2>
        <div className={s.headerActions}>
          <a href="/tienda" target="_blank" rel="noreferrer" className={s.previewBtn}>
            <i className="bi bi-eye" /> Vista previa
          </a>
          <button className={`${s.saveBtn} ${saved ? s.saveBtnDone : ''}`} onClick={handleSave} disabled={saving}>
            {saved ? <><i className="bi bi-check-lg" /> Guardado</> : saving ? 'Guardando...' : <><i className="bi bi-floppy" /> Guardar</>}
          </button>
        </div>
      </div>

      <div className={s.sections}>
        {/* Banner */}
        <div className={s.card}>
          <h3 className={s.cardTitle}><i className="bi bi-image" /> Banner de inicio</h3>
          <div className={s.field}>
            <label>Titulo principal</label>
            <input type="text" value={config.bannerTexto} onChange={handleField('bannerTexto')} placeholder="Bienvenido a MUSA Vinoteca" />
          </div>
          <div className={s.field}>
            <label>Subtitulo</label>
            <input type="text" value={config.bannerSubtexto} onChange={handleField('bannerSubtexto')} placeholder="Los mejores vinos seleccionados para vos" />
          </div>
        </div>

        {/* Sobre nosotros */}
        <div className={s.card}>
          <h3 className={s.cardTitle}><i className="bi bi-info-circle" /> Sobre nosotros</h3>
          <div className={s.field}>
            <label>Texto</label>
            <textarea value={config.aboutTexto} onChange={handleField('aboutTexto')} placeholder="Descripcion de tu vinoteca..." rows={4} />
          </div>
        </div>

        {/* Contacto */}
        <div className={s.card}>
          <h3 className={s.cardTitle}><i className="bi bi-telephone" /> Contacto y redes</h3>
          <div className={s.row}>
            <div className={s.field}>
              <label>WhatsApp (con codigo de pais)</label>
              <input type="text" value={config.whatsappNumero} onChange={handleField('whatsappNumero')} placeholder="5491155551234" />
            </div>
            <div className={s.field}>
              <label>Instagram URL</label>
              <input type="text" value={config.instagramUrl} onChange={handleField('instagramUrl')} placeholder="https://instagram.com/musa" />
            </div>
          </div>
        </div>

        {/* Ubicacion */}
        <div className={s.card}>
          <h3 className={s.cardTitle}><i className="bi bi-geo-alt" /> Ubicacion</h3>
          <div className={s.row}>
            <div className={s.field}>
              <label>Direccion del local</label>
              <input type="text" value={config.direccionLocal} onChange={handleField('direccionLocal')} placeholder="Calle 123, Localidad" />
            </div>
            <div className={s.field}>
              <label>Horarios</label>
              <input type="text" value={config.horarios} onChange={handleField('horarios')} placeholder="Lun-Sab 10 a 20hs" />
            </div>
          </div>
        </div>

        {/* Envio */}
        <div className={s.card}>
          <h3 className={s.cardTitle}><i className="bi bi-truck" /> Opciones de entrega</h3>
          <div className={s.toggleRow}>
            <label className={s.toggle}>
              <input type="checkbox" checked={config.retiroEnLocal} onChange={handleField('retiroEnLocal')} />
              <span>Retiro en local habilitado</span>
              <div className={s.toggleTrack} />
            </label>
          </div>
          <div className={s.toggleRow}>
            <label className={s.toggle}>
              <input type="checkbox" checked={config.envioHabilitado} onChange={handleField('envioHabilitado')} />
              <span>Envio a domicilio habilitado</span>
              <div className={s.toggleTrack} />
            </label>
          </div>
          {config.envioHabilitado && (
            <div className={s.field} style={{ marginTop: 8 }}>
              <label>Costo de envio ($)</label>
              <input type="number" value={config.costoEnvio} onChange={handleField('costoEnvio')} min={0} />
            </div>
          )}
        </div>

        {/* Tienda activa */}
        <div className={s.card}>
          <h3 className={s.cardTitle}><i className="bi bi-power" /> Estado de la tienda</h3>
          <div className={s.toggleRow}>
            <label className={s.toggle}>
              <input type="checkbox" checked={config.tiendaActiva} onChange={handleField('tiendaActiva')} />
              <span>Tienda web activa</span>
              <div className={s.toggleTrack} />
            </label>
            <span className={s.toggleHint}>Si esta desactivada, la tienda no mostrara productos.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
