import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useTheme } from '../../context/ThemeContext';
import { fetchConfig } from '../../lib/tiendaApi';
import { tiendaPath, TIENDA_BASE } from '../../tiendaConfig';
import logo from '../../assets/musa.jpg';
import s from './TiendaLayout.module.css';

const home = TIENDA_BASE || '/';

export default function TiendaLayout() {
  const { totalItems } = useCart();
  const { pathname } = useLocation();
  const { forceTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [config, setConfig] = useState({});

  // Tienda siempre en dark mode — uses ThemeContext to avoid race condition
  useEffect(() => {
    return forceTheme('dark');
  }, [forceTheme]);

  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className={s.tienda}>
      <nav className={s.navbar}>
        <div className={s.navInner}>
          <Link to={home} className={s.brand}>
            <img src={logo} alt="MUSA" className={s.logo} />
            <div className={s.brandText}>
              <span className={s.brandName}>MUSA</span>
              <span className={s.brandSub}>Vinoteca</span>
            </div>
          </Link>

          <div className={`${s.navLinks} ${menuOpen ? s.navLinksOpen : ''}`}>
            <Link to={home} className={`${s.navLink} ${pathname === home || pathname === `${home}/` ? s.navActive : ''}`}>Inicio</Link>
            <Link to={tiendaPath('/catalogo')} className={`${s.navLink} ${pathname.includes('catalogo') ? s.navActive : ''}`}>Vinos</Link>
            <Link to={tiendaPath('/sommelier')} className={`${s.navLink} ${pathname.includes('sommelier') ? s.navActive : ''}`}>Sommelier</Link>
            <Link to={tiendaPath('/club')} className={`${s.navLink} ${pathname.includes('club') ? s.navActive : ''}`}>Club</Link>
            <Link to={tiendaPath('/etiqueta')} className={`${s.navLink} ${pathname.includes('etiqueta') ? s.navActive : ''}`}>Etiquetas</Link>
            <Link to={tiendaPath('/mi-perfil')} className={`${s.navLink} ${pathname.includes('mi-perfil') ? s.navActive : ''}`}>Mi Perfil</Link>
          </div>

          <div className={s.navRight}>
            <Link to={tiendaPath('/carrito')} className={s.cartBtn}>
              <i className="bi bi-bag" />
              {totalItems > 0 && <span className={s.cartBadge}>{totalItems}</span>}
            </Link>
            <button className={s.hamburger} onClick={() => setMenuOpen(!menuOpen)}>
              <i className={`bi ${menuOpen ? 'bi-x-lg' : 'bi-list'}`} />
            </button>
          </div>
        </div>
      </nav>

      <main className={s.main}>
        <Outlet />
      </main>

      <footer className={s.footer}>
        <div className={s.footerInner}>
          <div className={s.footerBrand}>
            <img src={logo} alt="MUSA" className={s.footerLogo} />
            <span className={s.footerName}>MUSA Vinoteca</span>
          </div>
          <div className={s.footerInfo}>
            {config.direccionLocal && <p><i className="bi bi-geo-alt" /> {config.direccionLocal}</p>}
            {config.horarios && <p><i className="bi bi-clock" /> {config.horarios}</p>}
            {config.whatsappNumero && (
              <p>
                <a href={`https://wa.me/${config.whatsappNumero.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className={s.footerLink}>
                  <i className="bi bi-whatsapp" /> WhatsApp
                </a>
              </p>
            )}
            {config.instagramUrl && (
              <p>
                <a href={config.instagramUrl} target="_blank" rel="noreferrer" className={s.footerLink}>
                  <i className="bi bi-instagram" /> Instagram
                </a>
              </p>
            )}
          </div>
          <div className={s.footerCopy}>&copy; {new Date().getFullYear()} MUSA Vinoteca</div>
        </div>
      </footer>

      {config.whatsappNumero && (
        <a
          href={`https://wa.me/${config.whatsappNumero.replace(/\D/g, '')}?text=Hola! Quiero consultar sobre un vino`}
          target="_blank"
          rel="noreferrer"
          className={s.whatsappFloat}
        >
          <i className="bi bi-whatsapp" />
        </a>
      )}
    </div>
  );
}
