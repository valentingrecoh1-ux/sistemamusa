import { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext();

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('musa_cart')) || [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('musa_cart', JSON.stringify(items));
  }, [items]);

  const addItem = (product, qty = 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.productoId === (product._id || product.productoId));
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], cantidad: updated[idx].cantidad + qty };
        return updated;
      }
      return [
        ...prev,
        {
          productoId: product._id || product.productoId,
          nombre: product.nombre,
          bodega: product.bodega,
          cepa: product.cepa,
          foto: product.foto,
          precioUnitario: parseFloat(product.venta || product.precioUnitario) || 0,
          cantidad: qty,
        },
      ];
    });
  };

  const removeItem = (productoId) => {
    setItems((prev) => prev.filter((i) => i.productoId !== productoId));
  };

  const updateQty = (productoId, qty) => {
    if (qty < 1) return removeItem(productoId);
    setItems((prev) => prev.map((i) => (i.productoId === productoId ? { ...i, cantidad: qty } : i)));
  };

  const clearCart = () => setItems([]);

  const totalItems = items.reduce((s, i) => s + i.cantidad, 0);
  const totalPrice = items.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQty, clearCart, totalItems, totalPrice }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
