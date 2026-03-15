import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import logo from '../../assets/musa.jpg';
import s from './Sidebar.module.css';

const NAV = [
  {
    items: [
      { to: '/', icon: 'bi-grid', label: 'Dashboard' },
    ],
  },
  {
    section: 'Ventas',
    items: [
      { to: '/catalogo', icon: 'bi-book', label: 'Catalogo' },
      { to: '/carrito', icon: 'bi-cart3', label: 'Carrito' },
      { to: '/ventas', icon: 'bi-receipt', label: 'Ventas' },
    ],
  },
  {
    section: 'Gestion',
    items: [
      { to: '/inventario', icon: 'bi-box-seam', label: 'Inventario' },
      { to: '/eventos', icon: 'bi-calendar-event', label: 'Eventos' },
      { to: '/chat', icon: 'bi-chat-square-text', label: 'Chat Interno' },
      { to: '/asistencia', icon: 'bi-clock-history', label: 'Asistencia' },
      { to: '/vidriera', icon: 'bi-tv', label: 'Vidriera' },
    ],
  },
  {
    section: 'Finanzas',
    items: [
      { to: '/caja', icon: 'bi-cash-stack', label: 'Caja' },
      { to: '/precios', icon: 'bi-tags', label: 'Precios' },
      { to: '/flujos', icon: 'bi-arrow-left-right', label: 'Flujos' },
      { to: '/estadisticas', icon: 'bi-bar-chart-line', label: 'Estadisticas' },
      { to: '/compras', icon: 'bi-bag', label: 'Compras' },
      { to: '/compras/orden/nueva', icon: 'bi-plus-circle', label: 'Nueva OC', sub: true, parent: '/compras' },
      { to: '/compras/proveedores', icon: 'bi-people', label: 'Proveedores', sub: true, parent: '/compras' },
      { to: '/compras/recepcion', icon: 'bi-truck', label: 'Recepcion', sub: true, parent: '/compras' },
      { to: '/compras/pagos', icon: 'bi-credit-card', label: 'Pagos', sub: true, parent: '/compras' },
    ],
  },
  {
    section: 'Web',
    items: [
      { to: '/web', icon: 'bi-globe', label: 'Web Dashboard' },
      { to: '/web/pedidos', icon: 'bi-bag-check', label: 'Pedidos Web' },
      { to: '/web/pedidosya', icon: 'bi-scooter', label: 'PedidosYa Envios' },
      { to: '/web/club', icon: 'bi-trophy', label: 'Club de Vinos' },
      { to: '/clientes', icon: 'bi-person-lines-fill', label: 'Clientes' },
      { to: '/web/config', icon: 'bi-gear', label: 'Configuracion' },
    ],
  },
  {
    section: 'Admin',
    adminOnly: true,
    items: [
      { to: '/admin/usuarios', icon: 'bi-people-fill', label: 'Usuarios' },
    ],
  },
  {
    items: [
      { to: '/admin/setup', icon: 'bi-tools', label: 'Setup' },
    ],
  },
];

export default function Sidebar({ usuario, onLogout, collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();

  const isActive = (to) => {
    if (to === '/') return pathname === '/';
    return pathname.startsWith(to);
  };

  const closeMobile = () => setMobileOpen(false);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.classList.add('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-open');
    }
    return () => document.body.classList.remove('sidebar-open');
  }, [mobileOpen]);

  return (
    <>
      {mobileOpen && <div className={s.overlay} onClick={closeMobile} />}
      <aside
        className={`${s.sidebar} ${mobileOpen ? s.mobileOpen : ''}`}
      >
        {/* Logo */}
        <Link to="/" className={s.logo}>
          <img src={logo} alt="MUSA" className={s.logoImg} />
          <div className={s.logoCol}>
            <span className={s.logoText}>MUSA</span>
            <span className={s.version}>v1.51</span>
          </div>
        </Link>

        {/* Nav */}
        <nav className={s.nav}>
          {NAV.filter(g => !g.adminOnly || usuario?.rol === 'admin').map(group => (
            <div key={group.section} className={s.section}>
              {group.section && <div className={s.sectionTitle}>{group.section}</div>}
              {group.items
                .filter(item => !item.sub || !item.parent || pathname.startsWith(item.parent))
                .map(item => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`${s.link} ${item.sub ? s.subLink : ''} ${isActive(item.to) ? s.active : ''}`}
                  onClick={closeMobile}
                >
                  <i className={`bi ${item.icon} ${s.linkIcon}`} />
                  <span className={s.linkText}>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className={s.footer}>
          <button className={s.themeBtn} onClick={toggleTheme}>
            <i className={`bi ${theme === 'light' ? 'bi-moon' : 'bi-sun'}`} />
            <span>{theme === 'light' ? 'Modo Oscuro' : 'Modo Claro'}</span>
          </button>

          {usuario && (
            <>
              <div className={s.userInfo}>
                <i className="bi bi-person-circle" />
                <div>
                  <div className={s.userName}>{usuario.nombre}</div>
                  <div className={s.userRol}>{usuario.rol}</div>
                </div>
              </div>
              <button className={s.logoutBtn} onClick={onLogout}>
                <i className="bi bi-box-arrow-left" />
                <span>Salir</span>
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
