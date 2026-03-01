import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearch } from '../../context/SearchContext';
import { socket } from '../../main';
import s from './GlobalSearch.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

const PAGES = [
  { label: 'Dashboard', icon: 'bi-grid', path: '/' },
  { label: 'Catalogo', icon: 'bi-book', path: '/catalogo' },
  { label: 'Carrito', icon: 'bi-cart3', path: '/carrito' },
  { label: 'Ventas', icon: 'bi-receipt', path: '/ventas' },
  { label: 'Inventario', icon: 'bi-box-seam', path: '/inventario' },
  { label: 'Caja', icon: 'bi-cash-stack', path: '/caja' },
  { label: 'Eventos', icon: 'bi-calendar-event', path: '/eventos' },
  { label: 'Precios', icon: 'bi-tags', path: '/precios' },
  { label: 'Flujos', icon: 'bi-arrow-left-right', path: '/flujos' },
  { label: 'Estadisticas', icon: 'bi-bar-chart-line', path: '/estadisticas' },
  { label: 'Compras', icon: 'bi-bag', path: '/compras' },
  { label: 'Proveedores', icon: 'bi-people', path: '/compras/proveedores' },
  { label: 'Recepcion', icon: 'bi-truck', path: '/compras/recepcion' },
  { label: 'Pagos Proveedor', icon: 'bi-credit-card', path: '/compras/pagos' },
  { label: 'Nueva Orden de Compra', icon: 'bi-plus-circle', path: '/compras/orden/nueva' },
  { label: 'Clientes', icon: 'bi-person-lines-fill', path: '/clientes' },
  { label: 'Chat Interno', icon: 'bi-chat-square-text', path: '/chat' },
  { label: 'WhatsApp', icon: 'bi-whatsapp', path: '/whatsapp' },
  { label: 'Usuarios', icon: 'bi-people-fill', path: '/admin/usuarios' },
  { label: 'Setup', icon: 'bi-tools', path: '/admin/setup' },
];

export default function GlobalSearch() {
  const { query, setQuery, isOpen, open, close } = useSearch();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [dbResults, setDbResults] = useState({ productos: [], ventas: [] });
  const debounceRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
    if (!isOpen) setDbResults({ productos: [], ventas: [] });
  }, [isOpen]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        isOpen ? close() : open();
      }
      if (e.key === 'Escape' && isOpen) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  // Socket search con debounce
  useEffect(() => {
    const handler = (data) => setDbResults(data || { productos: [], ventas: [] });
    socket.on('response-search-global', handler);
    return () => socket.off('response-search-global', handler);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.length < 2) {
      setDbResults({ productos: [], ventas: [] });
      return;
    }
    debounceRef.current = setTimeout(() => {
      socket.emit('search-global', query);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  if (!isOpen) return null;

  const go = (path) => {
    navigate(path);
    close();
  };

  const filteredPages = query
    ? PAGES.filter(p => p.label.toLowerCase().includes(query.toLowerCase()))
    : PAGES;

  const hasDbResults = dbResults.productos.length > 0 || dbResults.ventas.length > 0;

  return (
    <div className={s.overlay} onClick={close}>
      <div className={s.box} onClick={e => e.stopPropagation()}>
        <div className={s.inputWrap}>
          <i className="bi bi-search" />
          <input
            ref={inputRef}
            className={s.input}
            placeholder="Buscar paginas, productos, ventas..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <kbd className={s.kbd}>ESC</kbd>
        </div>
        <div className={s.results}>
          {/* Paginas */}
          {filteredPages.length > 0 && (
            <>
              {query && <div className={s.sectionLabel}>Paginas</div>}
              {filteredPages.slice(0, query ? 5 : 20).map(p => (
                <div key={p.path} className={s.item} onClick={() => go(p.path)}>
                  <i className={`bi ${p.icon}`} />
                  <span>{p.label}</span>
                </div>
              ))}
            </>
          )}

          {/* Productos */}
          {dbResults.productos.length > 0 && (
            <>
              <div className={s.sectionLabel}>Productos</div>
              {dbResults.productos.map(p => (
                <div key={p._id} className={s.item} onClick={() => go('/inventario')}>
                  <i className="bi bi-box-seam" />
                  <div className={s.itemDetail}>
                    <span>{p.nombre}</span>
                    <span className={s.itemMeta}>
                      {p.bodega && `${p.bodega} · `}{p.codigo} · {money(Number(p.venta) || 0)} · Stock: {p.cantidad || 0}
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Ventas */}
          {dbResults.ventas.length > 0 && (
            <>
              <div className={s.sectionLabel}>Ventas</div>
              {dbResults.ventas.map(v => (
                <div key={v._id} className={s.item} onClick={() => go('/ventas')}>
                  <i className="bi bi-receipt" />
                  <div className={s.itemDetail}>
                    <span>{v.stringNumeroFactura || `Venta #${v.numeroVenta}`}</span>
                    <span className={s.itemMeta}>
                      {money(v.monto)} · {v.formaPago} · {v.fecha}{v.nombre ? ` · ${v.nombre}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Sin resultados */}
          {query && filteredPages.length === 0 && !hasDbResults && (
            <div className={s.hint}>No se encontraron resultados</div>
          )}
        </div>
      </div>
    </div>
  );
}
