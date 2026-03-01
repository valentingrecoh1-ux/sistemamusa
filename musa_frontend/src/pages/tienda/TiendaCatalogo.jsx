import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchProductos, fetchFiltros } from '../../lib/tiendaApi';
import ProductCard from '../../components/tienda/ProductCard';
import s from './TiendaCatalogo.module.css';

export default function TiendaCatalogo() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [productos, setProductos] = useState([]);
  const [filtros, setFiltros] = useState({ bodegas: [], cepas: [], origenes: [] });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const search = searchParams.get('search') || '';
  const bodega = searchParams.get('bodega') || '';
  const cepa = searchParams.get('cepa') || '';
  const page = parseInt(searchParams.get('page')) || 1;

  const setParam = useCallback((key, value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      if (key !== 'page') next.delete('page');
      return next;
    });
  }, [setSearchParams]);

  useEffect(() => {
    fetchFiltros().then(setFiltros).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchProductos({ search, bodega, cepa, page, limit: 20 })
      .then((data) => {
        setProductos(data.productos || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      })
      .catch(() => setProductos([]))
      .finally(() => setLoading(false));
  }, [search, bodega, cepa, page]);

  const activeFilters = [
    bodega && { key: 'bodega', label: bodega },
    cepa && { key: 'cepa', label: cepa },
  ].filter(Boolean);

  return (
    <div className={s.catalogo}>
      {/* Search + Filters */}
      <div className={s.toolbar}>
        <div className={s.searchWrap}>
          <i className="bi bi-search" />
          <input
            type="text"
            placeholder="Buscar vinos..."
            value={search}
            onChange={(e) => setParam('search', e.target.value)}
            className={s.searchInput}
          />
          {search && (
            <button className={s.clearBtn} onClick={() => setParam('search', '')}>
              <i className="bi bi-x" />
            </button>
          )}
        </div>
        <div className={s.filters}>
          <select value={bodega} onChange={(e) => setParam('bodega', e.target.value)} className={s.select}>
            <option value="">Todas las bodegas</option>
            {filtros.bodegas.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={cepa} onChange={(e) => setParam('cepa', e.target.value)} className={s.select}>
            <option value="">Todas las cepas</option>
            {filtros.cepas.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Active filters */}
      {activeFilters.length > 0 && (
        <div className={s.activeFilters}>
          {activeFilters.map((f) => (
            <button key={f.key} className={s.filterChip} onClick={() => setParam(f.key, '')}>
              {f.label} <i className="bi bi-x" />
            </button>
          ))}
          <button className={s.clearAll} onClick={() => setSearchParams({})}>Limpiar filtros</button>
        </div>
      )}

      {/* Results info */}
      <div className={s.resultsInfo}>
        {total} {total === 1 ? 'producto' : 'productos'}
      </div>

      {/* Grid */}
      {loading ? (
        <div className={s.loading}>Cargando...</div>
      ) : productos.length === 0 ? (
        <div className={s.empty}>
          <i className="bi bi-search" />
          <p>No se encontraron productos</p>
        </div>
      ) : (
        <div className={s.grid}>
          {productos.map((p) => (
            <ProductCard key={p._id} product={p} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={s.pagination}>
          <button
            className={s.pageBtn}
            disabled={page <= 1}
            onClick={() => setParam('page', String(page - 1))}
          >
            <i className="bi bi-chevron-left" />
          </button>
          <span className={s.pageInfo}>Pagina {page} de {totalPages}</span>
          <button
            className={s.pageBtn}
            disabled={page >= totalPages}
            onClick={() => setParam('page', String(page + 1))}
          >
            <i className="bi bi-chevron-right" />
          </button>
        </div>
      )}
    </div>
  );
}
