import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchProductos, fetchConfig } from '../../lib/tiendaApi';
import ProductCard from '../../components/tienda/ProductCard';
import s from './TiendaHome.module.css';

const CATEGORIAS = [
  { label: 'Tintos', icon: 'bi-droplet-fill', color: '#8b0000', search: 'tinto' },
  { label: 'Blancos', icon: 'bi-droplet', color: '#d4a94b', search: 'blanco' },
  { label: 'Rosados', icon: 'bi-flower1', color: '#e8758a', search: 'rosado' },
  { label: 'Espumantes', icon: 'bi-stars', color: '#c0a44d', search: 'espumante' },
];

export default function TiendaHome() {
  const [config, setConfig] = useState({});
  const [destacados, setDestacados] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchConfig().catch(() => ({})),
      fetchProductos({ limit: 8 }).catch(() => ({ productos: [] })),
    ]).then(([cfg, data]) => {
      setConfig(cfg);
      setDestacados(data.productos || []);
      setLoading(false);
    });
  }, []);

  return (
    <div className={s.home}>
      {/* Hero */}
      <section className={s.hero}>
        <div className={s.heroContent}>
          <h1 className={s.heroTitle}>{config.bannerTexto || 'Bienvenido a MUSA Vinoteca'}</h1>
          <p className={s.heroSub}>{config.bannerSubtexto || 'Los mejores vinos seleccionados para vos'}</p>
          <Link to="/tienda/catalogo" className={s.heroBtn}>
            <i className="bi bi-grid" /> Ver Catalogo
          </Link>
        </div>
        <div className={s.heroDecor}>
          <i className="bi bi-cup-straw" />
        </div>
      </section>

      {/* Categorias */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>Explora por categoria</h2>
        <div className={s.categorias}>
          {CATEGORIAS.map((cat) => (
            <Link
              key={cat.label}
              to={`/tienda/catalogo?search=${encodeURIComponent(cat.search)}`}
              className={s.catCard}
              style={{ '--cat-color': cat.color }}
            >
              <i className={`bi ${cat.icon} ${s.catIcon}`} />
              <span className={s.catLabel}>{cat.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Destacados */}
      <section className={s.section}>
        <div className={s.sectionHeader}>
          <h2 className={s.sectionTitle}>Productos destacados</h2>
          <Link to="/tienda/catalogo" className={s.sectionLink}>
            Ver todos <i className="bi bi-arrow-right" />
          </Link>
        </div>
        {loading ? (
          <div className={s.loading}>Cargando...</div>
        ) : (
          <div className={s.grid}>
            {destacados.map((p) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>
        )}
      </section>

      {/* About */}
      {config.aboutTexto && (
        <section className={s.about}>
          <h2 className={s.sectionTitle}>Sobre nosotros</h2>
          <p className={s.aboutText}>{config.aboutTexto}</p>
        </section>
      )}
    </div>
  );
}
