import { useState, useEffect } from 'react';
import { socket, IP } from '../../main';
import s from './Setup.module.css';

const SECTIONS = [
  {
    id: 'jspm',
    icon: 'bi-plugin',
    title: 'JSPrintManager (obligatorio)',
    content: [
      { type: 'text', value: 'JSPrintManager es una app que se ejecuta en segundo plano y permite imprimir desde el navegador. <b>Ambas impresoras lo necesitan.</b>' },
      { type: 'steps', items: [
        'Descargar desde <a href="https://www.neodynamic.com/downloads/jspm/" target="_blank">neodynamic.com/downloads/jspm</a>',
        'Instalar y ejecutar. Aparece un icono en la bandeja del sistema (abajo a la derecha)',
        '<b>Debe estar corriendo</b> cada vez que quieras imprimir',
      ]},
      { type: 'tip', value: 'JSPM funciona en el navegador, asi que las impresoras deben estar conectadas a la PC donde abris MUSA. Funciona igual si el servidor esta en la nube o en la red local.' },
    ],
  },
  {
    id: 'hprt',
    icon: 'bi-printer',
    title: 'HPRT TP806L (tickets)',
    content: [
      { type: 'text', value: 'Impresora termica para <b>facturas y notas de credito</b>. Se imprime automaticamente al finalizar una venta.' },
      { type: 'steps', items: [
        'Descargar e instalar el <b>driver</b> desde <a href="https://www.hprt.com/DownLoads" target="_blank">hprt.com/DownLoads</a> (modelo TP806L)',
        'Conectar la impresora por <b>USB</b> a la PC donde abris MUSA',
        'Verificar que Windows la reconoce en <b>Configuracion > Dispositivos > Impresoras</b>',
        'Verificar que <b>JSPrintManager</b> este corriendo',
        'Imprimir una pagina de prueba desde Windows para verificar',
      ]},
      { type: 'tip', value: 'Si JSPrintManager no esta corriendo al momento de la venta, el ticket se descarga como PDF automaticamente.' },
    ],
  },
  {
    id: 'godex',
    icon: 'bi-upc-scan',
    title: 'Godex GE300 (etiquetas)',
    content: [
      { type: 'text', value: 'Impresora de <b>codigos de barra</b>. Se usa desde la pagina de Inventario.' },
      { type: 'steps', items: [
        'Descargar e instalar el <b>driver</b> desde <a href="https://www.godexprinters.com/downloads" target="_blank">godexprinters.com/downloads</a> (modelo GE300)',
        'Conectar la impresora por <b>USB</b> a la PC donde abris MUSA',
        'Verificar que aparece en la lista de impresoras de Windows',
        'Verificar que <b>JSPrintManager</b> este corriendo',
      ]},
      { type: 'tip', value: 'En Inventario, la impresora se detecta automaticamente. Si hay varias, se selecciona la Godex por defecto.' },
    ],
  },
  {
    id: 'problemas',
    icon: 'bi-exclamation-triangle',
    title: 'Problemas comunes',
    content: [
      { type: 'table', headers: ['Problema', 'Solucion'], rows: [
        ['No imprime tickets', 'Verificar que JSPrintManager este corriendo y la HPRT conectada por USB'],
        ['No imprime etiquetas', 'Verificar que JSPrintManager este corriendo y la Godex conectada por USB'],
        ['No detecta impresoras', 'Verificar que el driver esta instalado y la impresora aparece en Windows'],
        ['Ticket se descarga en vez de imprimir', 'Instalar y ejecutar JSPrintManager Client App'],
      ]},
    ],
  },
];

const SERVICE_ICONS = {
  mongodb: 'bi-database',
  afip: 'bi-file-earmark-text',
  mercadopago: 'bi-credit-card-2-front',
  whatsapp: 'bi-whatsapp',
  ia: 'bi-stars',
};

const SERVICE_STATUS_MAP = {
  conectado: { color: 'var(--success)', label: 'Conectado' },
  connected: { color: 'var(--success)', label: 'Conectado' },
  configurado: { color: 'var(--success)', label: 'Configurado' },
  Anthropic: { color: 'var(--success)', label: 'Anthropic' },
  OpenAI: { color: 'var(--success)', label: 'OpenAI' },
  desconectado: { color: 'var(--danger)', label: 'Desconectado' },
  disconnected: { color: 'var(--danger)', label: 'Desconectado' },
  'no configurado': { color: 'var(--text-muted)', label: 'No configurado' },
  connecting: { color: 'var(--warning)', label: 'Conectando...' },
  qr: { color: 'var(--warning)', label: 'Esperando QR' },
};

export default function Setup() {
  const [activeSection, setActiveSection] = useState('jspm');
  const [jspmStatus, setJspmStatus] = useState('no-detectado');
  const [printers, setPrinters] = useState([]);
  const [servicios, setServicios] = useState(null);
  const [waModal, setWaModal] = useState(false);
  const [waStatus, setWaStatus] = useState('disconnected');
  const [waQr, setWaQr] = useState(null);
  const [waLoading, setWaLoading] = useState(false);

  useEffect(() => {
    // Check JSPM status
    const checkJspm = () => {
      if (!window.JSPM) {
        setJspmStatus('no-detectado');
        return;
      }
      const ws = window.JSPM.JSPrintManager.websocket_status;
      if (ws === window.JSPM.WSStatus.Open) {
        setJspmStatus('conectado');
        window.JSPM.JSPrintManager.getPrinters().then(p => setPrinters(p));
      } else if (ws === window.JSPM.WSStatus.Closed) {
        setJspmStatus('cerrado');
      } else {
        setJspmStatus('bloqueado');
      }
    };
    checkJspm();
    const interval = setInterval(checkJspm, 3000);
    return () => clearInterval(interval);
  }, []);

  // Backend services status
  useEffect(() => {
    const handler = (data) => setServicios(data);
    socket.on('response-status-servicios', handler);
    socket.emit('request-status-servicios');
    const interval = setInterval(() => socket.emit('request-status-servicios'), 10000);
    return () => {
      socket.off('response-status-servicios', handler);
      clearInterval(interval);
    };
  }, []);

  // WhatsApp modal: poll status while open
  useEffect(() => {
    if (!waModal) return;
    const fetchWa = async () => {
      try {
        const res = await fetch(`${IP()}/api/whatsapp/status`);
        const data = await res.json();
        setWaStatus(data.status);
        if (data.qr) setWaQr(data.qr); else setWaQr(null);
      } catch (e) { /* ignore */ }
    };
    fetchWa();
    const interval = setInterval(fetchWa, 3000);
    return () => clearInterval(interval);
  }, [waModal]);

  const connectWa = async (forceClean = false) => {
    if (waLoading) return;
    setWaLoading(true);
    setWaQr(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`${IP()}/api/whatsapp/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceClean: !!forceClean }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      setWaStatus(data.status);
      if (data.qr) setWaQr(data.qr);
    } catch (e) {
      console.error('Error conectando WhatsApp:', e);
    } finally {
      setWaLoading(false);
    }
  };

  const disconnectWa = async () => {
    try {
      await fetch(`${IP()}/api/whatsapp/disconnect`, { method: 'POST' });
      setWaStatus('disconnected');
      setWaQr(null);
    } catch (e) { /* ignore */ }
  };

  const handleServiceCardClick = (key, svc) => {
    if (key === 'whatsapp' && svc.estado !== 'connected') {
      setWaModal(true);
    }
  };

  const jspmStatusColor = jspmStatus === 'conectado' ? 'var(--success)' : 'var(--danger)';
  const jspmStatusText = {
    'conectado': 'Conectado',
    'cerrado': 'No esta corriendo',
    'bloqueado': 'Bloqueado',
    'no-detectado': 'No detectado',
  }[jspmStatus];

  const getStatusInfo = (estado) => SERVICE_STATUS_MAP[estado] || { color: 'var(--text-muted)', label: estado };

  const renderContent = (blocks) => blocks.map((block, i) => {
    switch (block.type) {
      case 'text':
        return <p key={i} className={s.text} dangerouslySetInnerHTML={{ __html: block.value }} />;
      case 'code':
        return <pre key={i} className={s.code}>{block.value}</pre>;
      case 'tip':
        return (
          <div key={i} className={s.tip}>
            <i className="bi bi-info-circle" />
            <span dangerouslySetInnerHTML={{ __html: block.value }} />
          </div>
        );
      case 'list':
        return (
          <ul key={i} className={s.list}>
            {block.items.map((item, j) => (
              <li key={j} dangerouslySetInnerHTML={{ __html: item }} />
            ))}
          </ul>
        );
      case 'steps':
        return (
          <ol key={i} className={s.steps}>
            {block.items.map((item, j) => (
              <li key={j} dangerouslySetInnerHTML={{ __html: item }} />
            ))}
          </ol>
        );
      case 'table':
        return (
          <table key={i} className={s.table}>
            <thead>
              <tr>{block.headers.map((h, j) => <th key={j}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, j) => (
                <tr key={j}>{row.map((cell, k) => <td key={k}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        );
      default:
        return null;
    }
  });

  return (
    <div className={s.page}>
      {/* Services status grid */}
      <div className={s.servicesGrid}>
        <div className={s.serviceCard}>
          <div className={s.serviceHeader}>
            <i className="bi bi-plugin" />
            <span>JSPrintManager</span>
          </div>
          <div className={s.serviceStatus}>
            <span className={s.statusDot} style={{ background: jspmStatusColor }} />
            <span>{jspmStatusText}</span>
          </div>
          {printers.length > 0 && (
            <div className={s.serviceDetail}>
              {printers.map(p => <span key={p} className={s.printerTag}>{p}</span>)}
            </div>
          )}
        </div>

        {servicios && Object.entries(servicios).map(([key, svc]) => {
          const info = getStatusInfo(svc.estado);
          const clickable = key === 'whatsapp' && svc.estado !== 'connected';
          return (
            <div
              key={key}
              className={`${s.serviceCard} ${clickable ? s.serviceCardClickable : ''}`}
              onClick={() => handleServiceCardClick(key, svc)}
              style={clickable ? { cursor: 'pointer' } : {}}
            >
              <div className={s.serviceHeader}>
                <i className={`bi ${SERVICE_ICONS[key] || 'bi-circle'}`} />
                <span>{svc.nombre}</span>
              </div>
              <div className={s.serviceStatus}>
                <span className={s.statusDot} style={{ background: info.color }} />
                <span>{info.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={s.layout}>
        {/* Sidebar nav */}
        <nav className={s.nav}>
          <div className={s.navLabel}>Impresoras</div>
          {SECTIONS.map(sec => (
            <button
              key={sec.id}
              className={`${s.navBtn} ${activeSection === sec.id ? s.navActive : ''}`}
              onClick={() => setActiveSection(sec.id)}
            >
              <i className={`bi ${sec.icon}`} />
              <span>{sec.title}</span>
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className={s.content}>
          {SECTIONS.filter(sec => sec.id === activeSection).map(sec => (
            <div key={sec.id} className={s.section}>
              <h2 className={s.sectionTitle}>
                <i className={`bi ${sec.icon}`} />
                {sec.title}
              </h2>
              {renderContent(sec.content)}
            </div>
          ))}
        </div>
      </div>

      {/* WhatsApp connection modal */}
      {waModal && (
        <div className={s.modalOverlay} onClick={() => setWaModal(false)}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h3><i className="bi bi-whatsapp" /> Conectar WhatsApp</h3>
              <button className={s.modalClose} onClick={() => setWaModal(false)}>
                <i className="bi bi-x-lg" />
              </button>
            </div>
            <div className={s.modalBody}>
              {waStatus === 'connected' ? (
                <div className={s.waConnected}>
                  <i className="bi bi-check-circle-fill" />
                  <span>WhatsApp conectado</span>
                  <button className={s.waDisconnectBtn} onClick={disconnectWa}>Desconectar</button>
                </div>
              ) : waQr ? (
                <div className={s.waQrWrap}>
                  <p>Escaneá este QR con WhatsApp:</p>
                  <img src={waQr} alt="QR WhatsApp" className={s.waQrImg} />
                  <p className={s.waQrHint}>WhatsApp {'>'} Dispositivos vinculados {'>'} Vincular dispositivo</p>
                </div>
              ) : waLoading ? (
                <div className={s.waConnectWrap}>
                  <p>Conectando con WhatsApp, espera unos segundos...</p>
                  <div className={s.waSpinner} />
                </div>
              ) : waStatus === 'connecting' ? (
                <div className={s.waConnectWrap}>
                  <p>No se pudo obtener el QR. Intenta de nuevo limpiando la sesion anterior.</p>
                  <button className={s.waConnectBtn} onClick={() => connectWa(true)} disabled={waLoading}>
                    Reintentar (limpiar sesion)
                  </button>
                </div>
              ) : (
                <div className={s.waConnectWrap}>
                  <p>WhatsApp no esta conectado. Presiona para generar el codigo QR.</p>
                  <button className={s.waConnectBtn} onClick={() => connectWa(false)} disabled={waLoading}>
                    Conectar WhatsApp
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
