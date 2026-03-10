import { useState, useEffect, useCallback } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useTheme } from '../../context/ThemeContext';
import { fetchConfig } from '../../lib/tiendaApi';
import { tiendaPath, TIENDA_BASE } from '../../tiendaConfig';
import logo from '../../assets/musa.jpg';
import s from './TiendaLayout.module.css';

const home = TIENDA_BASE || '/';
const PWA_DISMISSED_KEY = 'musa_pwa_installed';

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth <= 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return mobile;
}

function useIsStandalone() {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    setStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }, []);
  return standalone;
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export default function TiendaLayout() {
  const { totalItems } = useCart();
  const { pathname } = useLocation();
  const { forceTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [config, setConfig] = useState({});

  // PWA install
  const isMobile = useIsMobile();
  const isStandalone = useIsStandalone();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(() => localStorage.getItem(PWA_DISMISSED_KEY) === '1');
  const [sessionDismissed, setSessionDismissed] = useState(false);

  // Capture Android beforeinstallprompt
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const canShowInstall = isMobile && !isStandalone && !installDismissed && !sessionDismissed;

  const handleInstallClick = useCallback(async () => {
    if (deferredPrompt) {
      // Android: trigger native install prompt
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        localStorage.setItem(PWA_DISMISSED_KEY, '1');
        setInstallDismissed(true);
      }
      setDeferredPrompt(null);
    } else {
      // iOS or no prompt available: show tutorial modal
      setShowInstallModal(true);
    }
  }, [deferredPrompt]);

  const handleAlreadyInstalled = () => {
    localStorage.setItem(PWA_DISMISSED_KEY, '1');
    setInstallDismissed(true);
    setShowInstallModal(false);
  };

  const handleDismiss = () => {
    setSessionDismissed(true);
    setShowInstallModal(false);
  };

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
            <Link to={tiendaPath('/eventos')} className={`${s.navLink} ${pathname.includes('eventos') ? s.navActive : ''}`}>Eventos</Link>
            <Link to={tiendaPath('/mi-perfil')} className={`${s.navLink} ${pathname.includes('mi-perfil') ? s.navActive : ''}`}>Mi Perfil</Link>
          </div>

          <div className={s.navRight}>
            {canShowInstall && (
              <button className={s.installBtn} onClick={handleInstallClick} title="Instalar app">
                <i className="bi bi-phone" />
              </button>
            )}
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

      {/* PWA Install Modal */}
      {showInstallModal && (
        <div className={s.installOverlay} onClick={handleDismiss}>
          <div className={s.installModal} onClick={(e) => e.stopPropagation()}>
            <div className={s.installHeader}>
              <img src={logo} alt="MUSA" className={s.installLogo} />
              <h3 className={s.installTitle}>Instala MUSA</h3>
              <p className={s.installSub}>Accede mas rapido desde tu pantalla de inicio</p>
            </div>

            {isIOS() ? (
              <div className={s.installSteps}>
                <div className={s.installStep}>
                  <span className={s.stepNum}>1</span>
                  <span>Tocá el boton <strong>Compartir</strong> <i className="bi bi-box-arrow-up" /></span>
                </div>
                <div className={s.installStep}>
                  <span className={s.stepNum}>2</span>
                  <span>Seleccioná <strong>Agregar a inicio</strong> <i className="bi bi-plus-square" /></span>
                </div>
                <div className={s.installStep}>
                  <span className={s.stepNum}>3</span>
                  <span>Tocá <strong>Agregar</strong> y listo!</span>
                </div>
              </div>
            ) : (
              <div className={s.installSteps}>
                <div className={s.installStep}>
                  <span className={s.stepNum}>1</span>
                  <span>Tocá el menu <strong><i className="bi bi-three-dots-vertical" /></strong> de tu navegador</span>
                </div>
                <div className={s.installStep}>
                  <span className={s.stepNum}>2</span>
                  <span>Seleccioná <strong>Instalar aplicacion</strong> o <strong>Agregar a inicio</strong></span>
                </div>
                <div className={s.installStep}>
                  <span className={s.stepNum}>3</span>
                  <span>Confirmá y listo!</span>
                </div>
              </div>
            )}

            <div className={s.installActions}>
              <button className={s.installDoneBtn} onClick={handleAlreadyInstalled}>
                <i className="bi bi-check-circle" /> Ya la instale
              </button>
              <button className={s.installCloseBtn} onClick={handleDismiss}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
