import { Routes, Route } from 'react-router-dom';
import { CartProvider } from '../../context/CartContext';
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

export default function TiendaApp() {
  return (
    <CartProvider>
      <Routes>
        <Route element={<TiendaLayout />}>
          <Route path="/tienda" element={<TiendaHome />} />
          <Route path="/tienda/catalogo" element={<TiendaCatalogo />} />
          <Route path="/tienda/producto/:id" element={<TiendaProducto />} />
          <Route path="/tienda/carrito" element={<TiendaCarrito />} />
          <Route path="/tienda/checkout" element={<TiendaCheckout />} />
          <Route path="/tienda/checkout/resultado" element={<TiendaCheckoutResult />} />
          <Route path="/tienda/sommelier" element={<TiendaSommelier />} />
          <Route path="/tienda/club" element={<TiendaClub />} />
          <Route path="/tienda/etiqueta" element={<TiendaEtiqueta />} />
          <Route path="/tienda/mi-perfil" element={<TiendaPerfil />} />
          <Route path="/tienda/mi-perfil/:token" element={<TiendaPerfil />} />
        </Route>
      </Routes>
    </CartProvider>
  );
}
