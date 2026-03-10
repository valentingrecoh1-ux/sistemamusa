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
  const [uploadingFoto, setUploadingFoto] = useState(false);

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

  const handleOrigen = (field) => (e) => {
    setConfig((prev) => ({ ...prev, origenEnvio: { ...prev.origenEnvio, [field]: e.target.value } }));
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

        {/* Logistica integrada */}
        <div className={s.card}>
          <h3 className={s.cardTitle}><i className="bi bi-box-seam" /> Logistica integrada</h3>
          <p className={s.cardHint}>Conecta Shipnow y/o Moova para cotizar envios en tiempo real. Si ninguno esta activo, se usa el costo fijo de arriba.</p>

          <h4 className={s.subTitle}>Origen de envios</h4>
          <div className={s.row}>
            <div className={s.field}>
              <label>Direccion de despacho</label>
              <input type="text" value={config.origenEnvio?.direccion || ''} onChange={handleOrigen('direccion')} placeholder="Araoz 2785" />
            </div>
            <div className={s.field}>
              <label>Codigo postal</label>
              <input type="text" value={config.origenEnvio?.codigoPostal || ''} onChange={handleOrigen('codigoPostal')} placeholder="1425" />
            </div>
          </div>
          <div className={s.row}>
            <div className={s.field}>
              <label>Contacto nombre</label>
              <input type="text" value={config.origenEnvio?.contactoNombre || ''} onChange={handleOrigen('contactoNombre')} placeholder="MUSA Vinoteca" />
            </div>
            <div className={s.field}>
              <label>Contacto telefono</label>
              <input type="text" value={config.origenEnvio?.contactoTelefono || ''} onChange={handleOrigen('contactoTelefono')} placeholder="1155551234" />
            </div>
          </div>

          <div className={s.divider} />

          <h4 className={s.subTitle}>Shipnow</h4>
          <p className={s.cardHint}>Shipnow cubre todo el pais via Correo Argentino, OCA, Andreani, etc. Pedí tu token a developers@shipnow.com.ar</p>
          <div className={s.toggleRow}>
            <label className={s.toggle}>
              <input type="checkbox" checked={config.shipnowActivo || false} onChange={handleField('shipnowActivo')} />
              <span>Shipnow activo</span>
              <div className={s.toggleTrack} />
            </label>
          </div>
          {config.shipnowActivo && (
            <div className={s.field} style={{ marginTop: 8 }}>
              <label>Token de API</label>
              <input type="password" value={config.shipnowToken || ''} onChange={handleField('shipnowToken')} placeholder="Tu token de Shipnow" />
            </div>
          )}

          <div className={s.divider} />

          <h4 className={s.subTitle}>Moova</h4>
          <p className={s.cardHint}>Moova hace envios express en CABA y GBA (2-3hs). Registrate en moova.io para obtener tu App ID y API Key.</p>
          <div className={s.toggleRow}>
            <label className={s.toggle}>
              <input type="checkbox" checked={config.moovaActivo || false} onChange={handleField('moovaActivo')} />
              <span>Moova activo</span>
              <div className={s.toggleTrack} />
            </label>
          </div>
          {config.moovaActivo && (
            <div className={s.row} style={{ marginTop: 8 }}>
              <div className={s.field}>
                <label>App ID</label>
                <input type="text" value={config.moovaAppId || ''} onChange={handleField('moovaAppId')} placeholder="Tu App ID de Moova" />
              </div>
              <div className={s.field}>
                <label>API Key</label>
                <input type="password" value={config.moovaApiKey || ''} onChange={handleField('moovaApiKey')} placeholder="Tu API Key de Moova" />
              </div>
            </div>
          )}
        </div>

        {/* Fotos galeria eventos */}
        <div className={s.card}>
          <h3 className={s.cardTitle}><i className="bi bi-images" /> Fotos de degustaciones / eventos</h3>
          <p className={s.cardHint}>Estas fotos se muestran animadas en la seccion de eventos de la tienda. Recomendado: 3-6 fotos.</p>
          <div className={s.galeriaGrid}>
            {(config.fotosEventos || []).map((url, i) => (
              <div key={i} className={s.galeriaItem}>
                <img src={url} alt={`Evento ${i + 1}`} />
                <button className={s.galeriaDelete} onClick={() => {
                  socket.emit('borrar-foto-evento-galeria', url, (res) => {
                    if (res?.ok) setConfig((prev) => ({ ...prev, fotosEventos: res.fotosEventos }));
                  });
                }}><i className="bi bi-trash" /></button>
              </div>
            ))}
            <label className={s.galeriaAdd}>
              <input type="file" accept="image/*" hidden onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadingFoto(true);
                const reader = new FileReader();
                reader.onload = () => {
                  socket.emit('upload-foto-evento-galeria', reader.result, (res) => {
                    setUploadingFoto(false);
                    if (res?.ok) setConfig((prev) => ({ ...prev, fotosEventos: res.fotosEventos }));
                  });
                };
                reader.readAsDataURL(file);
                e.target.value = '';
              }} />
              {uploadingFoto ? <i className="bi bi-hourglass-split" /> : <i className="bi bi-plus-lg" />}
              <span>{uploadingFoto ? 'Subiendo...' : 'Agregar foto'}</span>
            </label>
          </div>
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
