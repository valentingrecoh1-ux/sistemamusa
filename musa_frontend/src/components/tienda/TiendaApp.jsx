import { Routes, Route, Navigate } from 'react-router-dom';
import { CartProvider } from '../../context/CartContext';
import { TIENDA_BASE } from '../../tiendaConfig';
import TiendaLayout from './TiendaLayout';
import TiendaHome from '../../pages/tienda/TiendaHome';
import TiendaCatalogo from '../../pages/tienda/TiendaCatalogo';
import TiendaProducto from '../../pages/tienda/TiendaProducto';
import TiendaCarrito from '../../pages/tienda/TiendaCarrito';
import TiendaCheckout from '../../pages/tienda/TiendaCheckout';
import TiendaCheckoutResult from '../../pages/tienda/TiendaCheckoutResult';
import TiendaSommelier from '../../pages/tienda/TiendaSommelier';
import TiendaClub from '../../pages/tienda/TiendaClub';
import TiendaEtiqueta from '../../pages/tienda/TiendaEtiqueta';
import TiendaPerfil from '../../pages/tienda/TiendaPerfil';
import '../../styles/tienda.css';

const B = TIENDA_BASE; // "" on store domain, "/tienda" on system domain

export default function TiendaApp() {
  return (
    <CartProvider>
      <Routes>
        <Route element={<TiendaLayout />}>
          <Route path={`${B}`} element={<TiendaHome />} />
          <Route path={`${B}/catalogo`} element={<TiendaCatalogo />} />
          <Route path={`${B}/producto/:id`} element={<TiendaProducto />} />
          <Route path={`${B}/carrito`} element={<TiendaCarrito />} />
          <Route path={`${B}/checkout`} element={<TiendaCheckout />} />
          <Route path={`${B}/checkout/resultado`} element={<TiendaCheckoutResult />} />
          <Route path={`${B}/sommelier`} element={<TiendaSommelier />} />
          <Route path={`${B}/club`} element={<TiendaClub />} />
          <Route path={`${B}/etiqueta`} element={<TiendaEtiqueta />} />
          <Route path={`${B}/mi-perfil`} element={<TiendaPerfil />} />
          <Route path={`${B}/mi-perfil/:token`} element={<TiendaPerfil />} />
          {/* Redirect legacy /tienda/* paths when on store domain */}
          {B === '' && <Route path="/tienda/*" element={<Navigate to="/" replace />} />}
          {/* Catch-all for store domain */}
          {B === '' && <Route path="*" element={<Navigate to="/" replace />} />}
        </Route>
      </Routes>
    </CartProvider>
  );
}
