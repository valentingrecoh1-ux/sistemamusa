import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { IP, fotoSrc, tiendaPath } from '../../main';
import s from './TiendaCarrito.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

export default function TiendaCarrito() {
  const { items, updateQty, removeItem, totalPrice } = useCart();

  if (items.length === 0) {
    return (
      <div className={s.empty}>
        <i className="bi bi-bag" />
        <h2>Tu carrito esta vacio</h2>
        <p>Agrega vinos desde nuestro catalogo</p>
        <Link to={tiendaPath('/catalogo')} className={s.emptyBtn}>Ver catalogo</Link>
      </div>
    );
  }

  return (
    <div className={s.carrito}>
      <h1 className={s.title}>Tu carrito</h1>

      <div className={s.layout}>
        <div className={s.itemList}>
          {items.map((item) => (
            <div key={item.productoId} className={s.item}>
              <div className={s.itemImage}>
                <img src={fotoSrc(item.foto, item.productoId)} alt={item.nombre} onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
              <div className={s.itemInfo}>
                <Link to={tiendaPath(`/producto/${item.productoId}`)} className={s.itemName}>{item.nombre}</Link>
                <div className={s.itemMeta}>
                  {item.bodega && <span>{item.bodega}</span>}
                  {item.cepa && <span> · {item.cepa}</span>}
                </div>
                <span className={s.itemPrice}>{money(item.precioUnitario)}</span>
              </div>
              <div className={s.itemActions}>
                <div className={s.qtyWrap}>
                  <button className={s.qtyBtn} onClick={() => updateQty(item.productoId, item.cantidad - 1)}>-</button>
                  <span className={s.qtyValue}>{item.cantidad}</span>
                  <button className={s.qtyBtn} onClick={() => updateQty(item.productoId, item.cantidad + 1)}>+</button>
                </div>
                <span className={s.itemSubtotal}>{money(item.precioUnitario * item.cantidad)}</span>
                <button className={s.removeBtn} onClick={() => removeItem(item.productoId)} title="Quitar">
                  <i className="bi bi-trash" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className={s.summary}>
          <h3 className={s.summaryTitle}>Resumen</h3>
          <div className={s.summaryRow}>
            <span>Subtotal ({items.reduce((s, i) => s + i.cantidad, 0)} productos)</span>
            <span>{money(totalPrice)}</span>
          </div>
          <div className={`${s.summaryRow} ${s.summaryTotal}`}>
            <span>Total</span>
            <span>{money(totalPrice)}</span>
          </div>
          <Link to={tiendaPath('/checkout')} className={s.checkoutBtn}>
            Ir al checkout <i className="bi bi-arrow-right" />
          </Link>
          <Link to={tiendaPath('/catalogo')} className={s.continueLink}>
            <i className="bi bi-arrow-left" /> Seguir comprando
          </Link>
        </div>
      </div>
    </div>
  );
}
