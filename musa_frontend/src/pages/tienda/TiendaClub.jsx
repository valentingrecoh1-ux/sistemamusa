import { useState, useEffect } from 'react';
import { fetchPlanesClub, suscribirseClub } from '../../lib/tiendaApi';
import s from './TiendaClub.module.css';

export default function TiendaClub() {
  const [planes, setPlanes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', preferencias: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchPlanesClub()
      .then(setPlanes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPlan || !form.nombre || !form.email || !form.telefono) return;
    setSubmitting(true);
    try {
      const res = await suscribirseClub({
        planId: selectedPlan._id,
        cliente: { nombre: form.nombre, email: form.email, telefono: form.telefono },
        preferencias: form.preferencias,
      });
      if (res.ok) {
        setSuccess(true);
      }
    } catch {
      // error silencioso
    }
    setSubmitting(false);
  };

  const closeModal = () => {
    setSelectedPlan(null);
    setSuccess(false);
    setForm({ nombre: '', email: '', telefono: '', preferencias: '' });
  };

  if (loading) return <div className={s.loading}>Cargando planes...</div>;

  return (
    <div className={s.club}>
      {/* Hero */}
      <section className={s.hero}>
        <div className={s.heroIcon}><i className="bi bi-trophy" /></div>
        <h1 className={s.heroTitle}>Club de Vinos MUSA</h1>
        <p className={s.heroSub}>
          Recibi cada mes una seleccion exclusiva de vinos elegidos por nuestro sommelier.
          Descubri nuevas etiquetas y disfruta beneficios unicos.
        </p>
      </section>

      {/* Planes */}
      <section className={s.planesSection}>
        <h2 className={s.planesTitle}>Elegi tu Plan</h2>
        <p className={s.planesSub}>Cada plan incluye envio mensual y acceso a eventos exclusivos</p>

        {planes.length === 0 ? (
          <div className={s.noPlanes}>
            <i className="bi bi-hourglass-split" style={{ fontSize: '2rem', display: 'block', marginBottom: 12 }} />
            Proximamente! Estamos preparando planes increibles para vos.
          </div>
        ) : (
          <div className={s.planesGrid}>
            {planes.map((plan) => (
              <div key={plan._id} className={`${s.planCard} ${plan.destacado ? s.planDestacado : ''}`}>
                {plan.destacado && <span className={s.planBadge}>Mas Popular</span>}
                <h3 className={s.planNombre}>{plan.nombre}</h3>
                <div className={s.planPrecio}>
                  <span className={s.planPrecioNum}>${plan.precioMensual?.toLocaleString('es-AR')}</span>
                  <span className={s.planPrecioPeriodo}>/mes</span>
                </div>
                <div className={s.planVinos}>
                  <i className="bi bi-box-seam" /> {plan.cantidadVinos} {plan.cantidadVinos === 1 ? 'vino' : 'vinos'} por mes
                </div>
                {plan.descripcion && <p className={s.planDesc}>{plan.descripcion}</p>}
                {plan.beneficios?.length > 0 && (
                  <ul className={s.planBeneficios}>
                    {plan.beneficios.map((b, i) => (
                      <li key={i}><i className="bi bi-check-circle-fill" /> {b}</li>
                    ))}
                  </ul>
                )}
                <button
                  className={`${s.planBtn} ${plan.destacado ? s.planBtnDestacado : s.planBtnNormal}`}
                  onClick={() => setSelectedPlan(plan)}
                >
                  Suscribirme
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Como Funciona */}
      <section className={s.comoFunciona}>
        <h2 className={s.cfTitle}>Como Funciona</h2>
        <div className={s.cfGrid}>
          <div className={s.cfStep}>
            <div className={s.cfNum}>1</div>
            <div className={s.cfStepTitle}>Elegi tu plan</div>
            <div className={s.cfStepDesc}>Selecciona el plan que mejor se adapte a tus gustos y presupuesto</div>
          </div>
          <div className={s.cfStep}>
            <div className={s.cfNum}>2</div>
            <div className={s.cfStepTitle}>Contanos tus gustos</div>
            <div className={s.cfStepDesc}>Decinos que tipo de vinos preferis y nosotros hacemos la magia</div>
          </div>
          <div className={s.cfStep}>
            <div className={s.cfNum}>3</div>
            <div className={s.cfStepTitle}>Recibi tus vinos</div>
            <div className={s.cfStepDesc}>Cada mes llegan a tu puerta vinos seleccionados por nuestro sommelier</div>
          </div>
        </div>
      </section>

      {/* Modal Suscripcion */}
      {selectedPlan && (
        <div className={s.modalOverlay} onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className={s.modal}>
            {success ? (
              <div className={s.successMsg}>
                <i className={`bi bi-check-circle-fill ${s.successIcon}`} />
                <h3>Suscripcion registrada!</h3>
                <p className={s.successText}>
                  Te contactaremos pronto para coordinar tu primera entrega.
                  Gracias por sumarte al Club MUSA!
                </p>
                <button className={s.submitBtn} onClick={closeModal}>Cerrar</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className={s.modalHeader}>
                  <h3 className={s.modalTitle}>Suscribirme al Club</h3>
                  <button type="button" className={s.modalClose} onClick={closeModal}>
                    <i className="bi bi-x-lg" />
                  </button>
                </div>

                <div className={s.modalPlan}>
                  <span className={s.modalPlanName}>{selectedPlan.nombre}</span>
                  <span className={s.modalPlanPrice}>${selectedPlan.precioMensual?.toLocaleString('es-AR')}/mes</span>
                </div>

                <div className={s.field}>
                  <label>Nombre completo *</label>
                  <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
                </div>
                <div className={s.field}>
                  <label>Email *</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </div>
                <div className={s.field}>
                  <label>Telefono *</label>
                  <input type="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} required />
                </div>
                <div className={s.field}>
                  <label>Preferencias de vinos (opcional)</label>
                  <textarea
                    value={form.preferencias}
                    onChange={(e) => setForm({ ...form, preferencias: e.target.value })}
                    placeholder="Ej: Prefiero tintos, me gusta el Malbec..."
                    rows={3}
                  />
                </div>

                <button type="submit" className={s.submitBtn} disabled={submitting}>
                  {submitting ? 'Enviando...' : 'Confirmar Suscripcion'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
