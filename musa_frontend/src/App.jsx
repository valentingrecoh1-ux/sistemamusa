import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { SearchProvider } from './context/SearchContext';
import Layout from './components/layout/Layout';
import GlobalSearch from './components/shared/GlobalSearch';
import Login from './pages/Login';
import TiendaApp from './components/tienda/TiendaApp';

import Dashboard from './pages/Dashboard';
import Info from './pages/Info';
import Carrito from './pages/Carrito';
import Ventas from './pages/Ventas';
import Inventario from './pages/Inventario';
import Caja from './pages/Caja';
import Estadisticas from './pages/Estadisticas';
import Eventos from './pages/Eventos';
import Flujos from './pages/Flujos';
import WhatsApp from './pages/WhatsApp';
import ChatInterno from './pages/ChatInterno';
import Compras from './pages/compras/Compras';
import Proveedores from './pages/compras/Proveedores';
import OrdenCompraDetalle from './pages/compras/OrdenCompraDetalle';
import RecepcionCompras from './pages/compras/RecepcionCompras';
import PagosProveedor from './pages/compras/PagosProveedor';
import WebDashboard from './pages/web/WebDashboard';
import WebPedidos from './pages/web/WebPedidos';
import WebConfig from './pages/web/WebConfig';
import WebClub from './pages/web/WebClub';
import Precios from './pages/Precios';
import Clientes from './pages/Clientes';
import Usuarios from './pages/admin/Usuarios';
import Setup from './pages/admin/Setup';

import { socket } from './main';

function AdminApp({ usuario, onLogout }) {
  // Inicializar JSPM globalmente para impresion de tickets y etiquetas
  useEffect(() => {
    if (window.JSPM) {
      window.JSPM.JSPrintManager.auto_reconnect = true;
      window.JSPM.JSPrintManager.start(false);
    }

    const handleTicket = ({ base64 }) => {
      const jspm = window.JSPM;
      if (!jspm || jspm.JSPrintManager.websocket_status !== jspm.WSStatus.Open) {
        console.warn('JSPrintManager no disponible, descargando ticket como PDF');
        // Fallback: descargar el PDF
        const link = document.createElement('a');
        link.href = 'data:application/pdf;base64,' + base64;
        link.download = 'ticket.pdf';
        link.click();
        return;
      }
      jspm.JSPrintManager.getPrinters().then(printers => {
        const hprt = printers.find(p =>
          p.toLowerCase().includes('hprt') || p.toLowerCase().includes('tp806')
        );
        const printer = hprt || printers[0];
        if (!printer) {
          // Sin impresora, descargar
          const link = document.createElement('a');
          link.href = 'data:application/pdf;base64,' + base64;
          link.download = 'ticket.pdf';
          link.click();
          return;
        }
        const cpj = new jspm.ClientPrintJob();
        cpj.clientPrinter = new jspm.InstalledPrinter(printer);
        const file = new jspm.PrintFilePDF(base64, jspm.FileSourceType.Base64, 'ticket.pdf', 1);
        cpj.files.push(file);
        cpj.sendToClient();
      });
    };

    socket.on('ticket-listo', handleTicket);
    return () => socket.off('ticket-listo', handleTicket);
  }, []);

  return (
    <SearchProvider>
      <Layout usuario={usuario} onLogout={onLogout}>
        <GlobalSearch />
        <Routes>
          <Route path="/" element={<Dashboard usuario={usuario} />} />
          <Route path="/catalogo" element={<Info />} />
          <Route path="/inventario" element={<Inventario usuario={usuario} />} />
          <Route path="/carrito" element={<Carrito />} />
          <Route path="/ventas" element={<Ventas usuario={usuario} />} />
          <Route path="/caja" element={<Caja usuario={usuario} />} />
          <Route path="/estadisticas" element={<Estadisticas />} />
          <Route path="/eventos" element={<Eventos usuario={usuario} />} />
          <Route path="/flujos" element={<Flujos />} />
          <Route path="/precios" element={<Precios usuario={usuario} />} />
          <Route path="/clientes" element={<Clientes usuario={usuario} />} />
          <Route path="/compras" element={<Compras usuario={usuario} />} />
          <Route path="/compras/proveedores" element={<Proveedores usuario={usuario} />} />
          <Route path="/compras/orden/nueva" element={<OrdenCompraDetalle usuario={usuario} />} />
          <Route path="/compras/orden/:id" element={<OrdenCompraDetalle usuario={usuario} />} />
          <Route path="/compras/recepcion" element={<RecepcionCompras usuario={usuario} />} />
          <Route path="/compras/pagos" element={<PagosProveedor usuario={usuario} />} />
          <Route path="/whatsapp" element={<WhatsApp />} />
          <Route path="/chat" element={<ChatInterno usuario={usuario} />} />
          <Route path="/web" element={<WebDashboard />} />
          <Route path="/web/pedidos" element={<WebPedidos />} />
          <Route path="/web/club" element={<WebClub />} />
          <Route path="/web/config" element={<WebConfig />} />
          <Route path="/admin/usuarios" element={<Usuarios usuario={usuario} />} />
          <Route path="/admin/setup" element={<Setup />} />
        </Routes>
      </Layout>
    </SearchProvider>
  );
}

function AppRoutes({ firstRender, usuario, loginForm, setLoginForm, loginError, handleLogin, handleLogout }) {
  const { pathname } = useLocation();

  // Tienda publica - sin auth
  if (pathname.startsWith('/tienda')) {
    return <TiendaApp />;
  }

  if (!firstRender) return null;

  if (!usuario) {
    return (
      <Login
        form={loginForm}
        setForm={setLoginForm}
        error={loginError}
        onSubmit={handleLogin}
      />
    );
  }

  return <AdminApp usuario={usuario} onLogout={handleLogout} />;
}

function App() {
  const [firstRender, setFirstRender] = useState(false);
  const [usuario, setUsuario] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  const requestInicio = (credentials) => {
    socket.emit('request-inicio', credentials);
  };

  useEffect(() => {
    let authResolved = false;
    let renderTimeout = null;

    const resolveFirstRender = () => {
      if (authResolved) return;
      authResolved = true;
      if (renderTimeout) clearTimeout(renderTimeout);
      setFirstRender(true);
    };

    const handleResponseInicio = (response) => {
      if (response?.success) {
        setUsuario(response.usuario);
        setLoginError('');
      } else {
        setUsuario(null);
        localStorage.removeItem('auth');
        if (response?.error) setLoginError(response.error);
      }
      resolveFirstRender();
    };

    const handleConnectError = () => {
      setUsuario(null);
      setLoginError('No se pudo conectar con el servidor. Reintenta en unos segundos.');
      resolveFirstRender();
    };

    // Re-autenticar al reconectarse (servidor crea nuevo socket sin usuario)
    const handleReconnect = () => {
      const saved = localStorage.getItem('auth');
      if (saved) {
        try { requestInicio(JSON.parse(saved)); } catch {}
      }
    };

    socket.on('response-inicio', handleResponseInicio);
    socket.on('connect_error', handleConnectError);
    socket.on('connect', handleReconnect);

    renderTimeout = setTimeout(() => {
      setLoginError('La validacion de inicio demoro demasiado. Intenta ingresar de nuevo.');
      resolveFirstRender();
    }, 4000);

    const saved = localStorage.getItem('auth');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        requestInicio(parsed);
      } catch {
        localStorage.removeItem('auth');
        setFirstRender(true);
      }
    } else {
      setFirstRender(true);
    }

    return () => {
      authResolved = true;
      if (renderTimeout) clearTimeout(renderTimeout);
      socket.off('response-inicio', handleResponseInicio);
      socket.off('connect_error', handleConnectError);
      socket.off('connect', handleReconnect);
    };
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!loginForm.username || !loginForm.password) {
      setLoginError('Completa usuario y contrasena');
      return;
    }
    setLoginError('');
    localStorage.setItem('auth', JSON.stringify(loginForm));
    requestInicio(loginForm);
  };

  const handleLogout = () => {
    setUsuario(null);
    localStorage.removeItem('auth');
    setLoginForm({ username: '', password: '' });
  };

  return (
    <ThemeProvider>
      <Router>
        <AppRoutes
          firstRender={firstRender}
          usuario={usuario}
          loginForm={loginForm}
          setLoginForm={setLoginForm}
          loginError={loginError}
          handleLogin={handleLogin}
          handleLogout={handleLogout}
        />
      </Router>
    </ThemeProvider>
  );
}

export default App;
