import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchProducto, fetchResenas, crearResena, fetchAnalisis } from '../../lib/tiendaApi';
import { useCart } from '../../context/CartContext';
import ProductCard from '../../components/tienda/ProductCard';
import { IP, fotoSrc } from '../../main';
import s from './TiendaProducto.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

function Stars({ rating, size = 16 }) {
  return (
    <span className={s.stars} style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={`bi ${i <= rating ? 'bi-star-fill' : i - 0.5 <= rating ? 'bi-star-half' : 'bi-star'}`} />
      ))}
    </span>
  );
}

function StarInput({ value, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <span className={s.starInput}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i
          key={i}
          className={`bi ${i <= (hover || value) ? 'bi-star-fill' : 'bi-star'}`}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)}
        />
      ))}
    </span>
  );
}

export default function TiendaProducto() {
  const { id } = useParams();
  const { addItem } = useCart();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(0);

  // Reseñas
  const [resenasData, setResenasData] = useState({ resenas: [], stats: { total: 0, promedio: 0, distribucion: {} } });
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewForm, setReviewForm] = useState({ nombre: '', email: '', puntuacion: 0, titulo: '', comentario: '' });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewMsg, setReviewMsg] = useState('');

  // Analisis IA
  const [analisis, setAnalisis] = useState(null);
  const [analisisLoading, setAnalisisLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setQty(1);
    setAdded(false);
    setSelectedPhoto(0);
    setShowReviewForm(false);
    setReviewMsg('');
    setAnalisis(null);
    fetchProducto(id)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    fetchResenas(id).then(setResenasData).catch(() => {});
  }, [id]);

  const loadAnalisis = () => {
    setAnalisisLoading(true);
    fetchAnalisis(id).then(setAnalisis).catch(() => {}).finally(() => setAnalisisLoading(false));
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!reviewForm.puntuacion || !reviewForm.comentario || !reviewForm.nombre || !reviewForm.email) return;
    setReviewSubmitting(true);
    setReviewMsg('');
    try {
      const res = await crearResena({ productoId: id, ...reviewForm });
      if (res.ok) {
        setReviewMsg('Gracias por tu reseña!');
        setShowReviewForm(false);
        setReviewForm({ nombre: '', email: '', puntuacion: 0, titulo: '', comentario: '' });
        fetchResenas(id).then(setResenasData).catch(() => {});
        setAnalisis(null); // Reset analisis para que se recargue con la nueva reseña
      } else {
        setReviewMsg(res.error || 'Error al enviar reseña');
      }
    } catch {
      setReviewMsg('Error de conexion');
    }
    setReviewSubmitting(false);
  };

  if (loading) return <div className={s.loading}>Cargando...</div>;
  if (!data?.producto) return <div className={s.notFound}><p>Producto no encontrado</p><Link to="/tienda/catalogo">Volver al catalogo</Link></div>;

  const p = data.producto;
  const stockStatus = p.cantidad <= 0 ? 'sin-stock' : p.cantidad <= 3 ? 'pocas' : 'disponible';

  const handleAdd = () => {
    addItem(p, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div>
      <Link to="/tienda/catalogo" className={s.back}>
        <i className="bi bi-arrow-left" /> Volver al catalogo
      </Link>

      <div className={s.product}>
        <div className={s.imageCol}>
          {(() => {
            const allFotos = (p.fotos && p.fotos.length > 0) ? p.fotos : (p.foto ? [p.foto] : []);
            const mainSrc = allFotos[selectedPhoto] || fotoSrc(p.foto, p._id);
            return (
              <>
                <img src={mainSrc} alt={p.nombre} className={s.image} onError={(e) => { e.target.style.display = 'none'; }} />
                {allFotos.length > 1 && (
                  <div className={s.galleryThumbs}>
                    {allFotos.map((foto, i) => (
                      <button
                        key={i}
                        className={`${s.galleryThumb} ${selectedPhoto === i ? s.galleryThumbActive : ''}`}
                        onClick={() => setSelectedPhoto(i)}
                      >
                        <img src={foto} alt="" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>

        <div className={s.infoCol}>
          {p.tipo && p.tipo !== 'vino' && <span className={s.tipoBadge}>{p.tipo}</span>}
          <h1 className={s.name}>{p.nombre}</h1>

          <div className={s.metaGrid}>
            {p.bodega && <div className={s.metaItem}><span className={s.metaLabel}>Bodega</span><span className={s.metaValue}>{p.bodega}</span></div>}
            {p.cepa && <div className={s.metaItem}><span className={s.metaLabel}>Cepa</span><span className={s.metaValue}>{p.cepa}</span></div>}
            {p.year && <div className={s.metaItem}><span className={s.metaLabel}>Cosecha</span><span className={s.metaValue}>{p.year}</span></div>}
            {p.origen && <div className={s.metaItem}><span className={s.metaLabel}>Origen</span><span className={s.metaValue}>{p.origen}</span></div>}
          </div>

          {p.descripcion && <p className={s.desc}>{p.descripcion}</p>}

          <div className={s.priceRow}>
            <span className={s.price}>{money(p.venta)}</span>
            <span className={`${s.stock} ${s[stockStatus]}`}>
              {stockStatus === 'sin-stock' && 'Sin stock'}
              {stockStatus === 'pocas' && `Pocas unidades (${p.cantidad})`}
              {stockStatus === 'disponible' && 'Disponible'}
            </span>
          </div>

          {stockStatus !== 'sin-stock' && (
            <div className={s.actions}>
              <div className={s.qtyWrap}>
                <button className={s.qtyBtn} onClick={() => setQty(Math.max(1, qty - 1))}>-</button>
                <span className={s.qtyValue}>{qty}</span>
                <button className={s.qtyBtn} onClick={() => setQty(Math.min(p.cantidad, qty + 1))}>+</button>
              </div>
              <button className={`${s.addBtn} ${added ? s.addBtnDone : ''}`} onClick={handleAdd} disabled={added}>
                {added ? (
                  <><i className="bi bi-check-lg" /> Agregado!</>
                ) : (
                  <><i className="bi bi-bag-plus" /> Agregar al carrito</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Analisis IA + Reseñas */}
      <div className={s.reviewsSection}>
        {/* Resumen de puntuacion */}
        <div className={s.reviewsSummary}>
          <div className={s.reviewsHeader}>
            <h2 className={s.reviewsTitle}>
              <i className="bi bi-chat-quote" /> Opiniones de Clientes
            </h2>
            {resenasData.stats.total > 0 && (
              <div className={s.ratingOverview}>
                <span className={s.ratingBig}>{resenasData.stats.promedio}</span>
                <div>
                  <Stars rating={Math.round(resenasData.stats.promedio)} />
                  <div className={s.ratingCount}>{resenasData.stats.total} {resenasData.stats.total === 1 ? 'reseña' : 'reseñas'}</div>
                </div>
              </div>
            )}
          </div>

          {/* Distribucion de estrellas */}
          {resenasData.stats.total > 0 && (
            <div className={s.distribution}>
              {[5, 4, 3, 2, 1].map((star) => {
                const count = resenasData.stats.distribucion[star] || 0;
                const pct = resenasData.stats.total > 0 ? (count / resenasData.stats.total) * 100 : 0;
                return (
                  <div key={star} className={s.distRow}>
                    <span className={s.distLabel}>{star} <i className="bi bi-star-fill" /></span>
                    <div className={s.distBar}><div className={s.distFill} style={{ width: `${pct}%` }} /></div>
                    <span className={s.distCount}>{count}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Boton analisis IA */}
          <div className={s.analisisSection}>
            {!analisis && !analisisLoading && (
              <button className={s.analisisBtn} onClick={loadAnalisis}>
                <i className="bi bi-robot" /> Ver analisis del sommelier
              </button>
            )}
            {analisisLoading && (
              <div className={s.analisisLoading}>
                <i className="bi bi-robot" /> Analizando opiniones...
              </div>
            )}
            {analisis && (
              <div className={s.analisisCard}>
                <div className={s.analisisHeader}>
                  <i className="bi bi-robot" /> Analisis del Sommelier
                  {analisis.fuente === 'ia' && <span className={s.analisisBadge}>IA</span>}
                </div>
                <div className={s.analisisText}>
                  {analisis.analisis.split('\n').map((line, i) => {
                    if (!line.trim()) return <br key={i} />;
                    // Parsear **bold**
                    const parts = line.split(/(\*\*[^*]+\*\*)/g);
                    return (
                      <p key={i}>
                        {parts.map((part, j) =>
                          part.startsWith('**') && part.endsWith('**')
                            ? <strong key={j}>{part.slice(2, -2)}</strong>
                            : part
                        )}
                      </p>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Lista de reseñas */}
        <div className={s.reviewsList}>
          <div className={s.reviewsListHeader}>
            <h3>{resenasData.stats.total > 0 ? `${resenasData.stats.total} ${resenasData.stats.total === 1 ? 'Reseña' : 'Reseñas'}` : 'Sin reseñas aun'}</h3>
            {!showReviewForm && (
              <button className={s.writeReviewBtn} onClick={() => setShowReviewForm(true)}>
                <i className="bi bi-pencil" /> Escribir reseña
              </button>
            )}
          </div>

          {reviewMsg && <div className={s.reviewMsg}>{reviewMsg}</div>}

          {/* Formulario reseña */}
          {showReviewForm && (
            <form className={s.reviewForm} onSubmit={handleReviewSubmit}>
              <div className={s.reviewFormHeader}>
                <h4>Tu opinion sobre este vino</h4>
                <button type="button" className={s.reviewFormClose} onClick={() => setShowReviewForm(false)}>
                  <i className="bi bi-x-lg" />
                </button>
              </div>
              <div className={s.reviewFormStars}>
                <span>Puntuacion:</span>
                <StarInput value={reviewForm.puntuacion} onChange={(v) => setReviewForm({ ...reviewForm, puntuacion: v })} />
              </div>
              <div className={s.reviewFormRow}>
                <input placeholder="Tu nombre *" value={reviewForm.nombre} onChange={(e) => setReviewForm({ ...reviewForm, nombre: e.target.value })} required />
                <input placeholder="Tu email *" type="email" value={reviewForm.email} onChange={(e) => setReviewForm({ ...reviewForm, email: e.target.value })} required />
              </div>
              <input placeholder="Titulo (opcional)" value={reviewForm.titulo} onChange={(e) => setReviewForm({ ...reviewForm, titulo: e.target.value })} className={s.reviewFormInput} />
              <textarea placeholder="Conta tu experiencia con este vino... *" value={reviewForm.comentario} onChange={(e) => setReviewForm({ ...reviewForm, comentario: e.target.value })} rows={4} required className={s.reviewFormTextarea} />
              <button type="submit" className={s.reviewSubmitBtn} disabled={reviewSubmitting || !reviewForm.puntuacion}>
                {reviewSubmitting ? 'Enviando...' : 'Enviar Reseña'}
              </button>
            </form>
          )}

          {/* Reseñas */}
          {resenasData.resenas.map((r) => (
            <div key={r._id} className={s.reviewCard}>
              <div className={s.reviewCardHeader}>
                <div className={s.reviewAuthor}>
                  <div className={s.reviewAvatar}>{r.cliente.nombre.charAt(0).toUpperCase()}</div>
                  <div>
                    <div className={s.reviewName}>{r.cliente.nombre}</div>
                    <div className={s.reviewDate}>{new Date(r.createdAt).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                  </div>
                </div>
                <Stars rating={r.puntuacion} size={14} />
              </div>
              {r.titulo && <div className={s.reviewTitulo}>{r.titulo}</div>}
              <p className={s.reviewText}>{r.comentario}</p>
            </div>
          ))}

          {resenasData.resenas.length === 0 && !showReviewForm && (
            <div className={s.noReviews}>
              <i className="bi bi-chat-square-text" />
              <p>Se el primero en dejar tu opinion sobre este vino</p>
            </div>
          )}
        </div>
      </div>

      {/* Relacionados */}
      {data.relacionados?.length > 0 && (
        <div className={s.related}>
          <h2 className={s.relatedTitle}>Tambien te puede gustar</h2>
          <div className={s.relatedGrid}>
            {data.relacionados.map((r) => (
              <ProductCard key={r._id} product={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
