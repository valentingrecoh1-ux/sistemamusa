import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSearch } from '../../context/SearchContext';
import { socket } from '../../main';
import s from './Header.module.css';

const TITLES = {
  '/': 'Dashboard',
  '/catalogo': 'Catalogo',
  '/carrito': 'Carrito',
  '/ventas': 'Ventas',
  '/inventario': 'Inventario',
  '/caja': 'Caja',
  '/estadisticas': 'Estadisticas',
  '/eventos': 'Eventos',
  '/flujos': 'Flujos',
  '/compras': 'Compras',
  '/compras/proveedores': 'Proveedores',
  '/compras/recepcion': 'Recepcion',
  '/compras/pagos': 'Pagos',
  '/chat': 'Chat Interno',
  '/clientes': 'Clientes',
  '/web': 'Web - Dashboard',
  '/web/pedidos': 'Web - Pedidos',
  '/web/club': 'Web - Club de Vinos',
  '/web/config': 'Web - Configuracion',
  '/admin/usuarios': 'Usuarios',
  '/admin/setup': 'Setup',
};

export default function Header({ onToggleMobile, usuario }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { open } = useSearch();
  const [notifs, setNotifs] = useState([]);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef(null);

  const title = TITLES[pathname] || (pathname.startsWith('/compras/orden') ? 'Orden de Compra' : 'MUSA');

  useEffect(() => {
    const onNotifs = (data) => setNotifs(data || []);
    const onCambios = () => socket.emit('request-notificaciones');
    socket.on('response-notificaciones', onNotifs);
    socket.on('cambios-notificaciones', onCambios);
    socket.emit('request-notificaciones');
    return () => {
      socket.off('response-notificaciones', onNotifs);
      socket.off('cambios-notificaciones', onCambios);
    };
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const unread = notifs.filter((n) => !n.leida).length;

  const handleNotifClick = (n) => {
    if (!n.leida) socket.emit('marcar-notificacion-leida', n._id);
    if (n.referenciaId) {
      navigate(`/compras/orden/${n.referenciaId}`);
      setDropOpen(false);
    }
  };

  const marcarTodas = () => {
    socket.emit('marcar-todas-notificaciones-leidas');
  };

  return (
    <header className={s.header}>
      <div className={s.left}>
        <button className={s.hamburger} onClick={onToggleMobile}>
          <i className="bi bi-list" />
        </button>
        <span className={s.title}>{title}</span>
      </div>
      <div className={s.right}>
        {/* Bell */}
        <div className={s.bellWrap} ref={dropRef}>
          <button className={s.bellBtn} onClick={() => setDropOpen((o) => !o)}>
            <i className="bi bi-bell" />
            {unread > 0 && <span className={s.bellBadge}>{unread > 9 ? '9+' : unread}</span>}
          </button>
          {dropOpen && (
            <div className={s.notifDrop}>
              <div className={s.notifDropHeader}>
                <span>Notificaciones</span>
                {unread > 0 && (
                  <button className={s.markAllBtn} onClick={marcarTodas}>Marcar leidas</button>
                )}
              </div>
              <div className={s.notifDropList}>
                {notifs.length === 0 ? (
                  <div className={s.notifEmpty}>Sin notificaciones</div>
                ) : notifs.slice(0, 20).map((n) => (
                  <div
                    key={n._id}
                    className={`${s.notifItem} ${!n.leida ? s.notifUnread : ''}`}
                    onClick={() => handleNotifClick(n)}
                  >
                    <div className={s.notifDot} />
                    <div className={s.notifBody}>
                      <span className={s.notifMsg}>{n.mensaje}</span>
                      <span className={s.notifTime}>
                        {n.createdAt ? new Date(n.createdAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <button className={s.searchBtn} onClick={open}>
          <i className="bi bi-search" />
          <span>Buscar...</span>
        </button>
      </div>
    </header>
  );
}
