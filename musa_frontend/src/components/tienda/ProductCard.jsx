import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { fotoSrc, tiendaPath } from '../../main';
import s from './ProductCard.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

export default function ProductCard({ product }) {
  const { addItem } = useCart();

  return (
    <div className={s.card}>
      <Link to={tiendaPath(`/producto/${product._id}`)} className={s.imageLink}>
        <img src={fotoSrc(product.foto, product._id)} alt={product.nombre} className={s.image} loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
      </Link>
      <div className={s.info}>
        <Link to={tiendaPath(`/producto/${product._id}`)} className={s.name}>{product.nombre}</Link>
        <div className={s.meta}>
          {product.bodega && <span>{product.bodega}</span>}
          {product.cepa && <span className={s.metaDot}>{product.cepa}</span>}
          {product.year && <span className={s.metaDot}>{product.year}</span>}
        </div>
        <div className={s.bottom}>
          <span className={s.price}>{money(product.venta)}</span>
          <button className={s.addBtn} onClick={() => addItem(product)} title="Agregar al carrito">
            <i className="bi bi-bag-plus" />
          </button>
        </div>
      </div>
    </div>
  );
}
