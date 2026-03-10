import { useState, useEffect } from 'react';
import { fetchConfig, fetchEventos } from '../../lib/tiendaApi';
import s from './TiendaEventos.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

const formatFecha = (f) => {
  if (!f) return '';
  const d = new Date(f);
  if (isNaN(d)) return f;
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
};

export default function TiendaEventos() {
  const [config, setConfig] = useState({});
  const [eventos, setEventos] = useState([]);

  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => {});
    fetchEventos().then(setEventos).catch(() => {});
  }, []);

  const waLink = config.whatsappNumero
    ? `https://wa.me/${config.whatsappNumero.replace(/\D/g, '')}?text=Hola! Quiero consultar sobre un evento privado en MUSA`
    : null;

  const waReservar = (evento) => config.whatsappNumero
    ? `https://wa.me/${config.whatsappNumero.replace(/\D/g, '')}?text=Hola! Quiero reservar para el evento "${evento.nombre}"${evento.fecha ? ` del ${formatFecha(evento.fecha)}` : ''}`
    : null;

  return (
    <div className={s.page}>
      {/* Hero */}
      <section className={s.hero}>
        <div className={s.heroIcon}><i className="bi bi-calendar-event" /></div>
        <h1 className={s.heroTitle}>Eventos & Degustaciones</h1>
        <p className={s.heroSub}>Vivi experiencias unicas con los mejores vinos</p>
      </section>

      {/* Proximos Eventos */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}><i className="bi bi-calendar-check" /> Proximos eventos</h2>

        {eventos.length > 0 ? (
          <div className={s.eventosGrid}>
            {eventos.map((ev) => (
              <div key={ev._id} className={s.eventoCard}>
                <div className={s.eventoHeader}>
                  {ev.estado === 'en_curso' && <span className={s.eventoBadge}>En curso</span>}
                  {ev.fecha && <span className={s.eventoFecha}><i className="bi bi-calendar3" /> {formatFecha(ev.fecha)}</span>}
                </div>
                <h3 className={s.eventoNombre}>{ev.nombre}</h3>
                {ev.descripcion && <p className={s.eventoDesc}>{ev.descripcion}</p>}
                <div className={s.eventoMeta}>
                  {ev.precioPorPersona > 0 && (
                    <span className={s.eventoMetaItem}>
                      <i className="bi bi-tag" /> {money(ev.precioPorPersona)} /persona
                    </span>
                  )}
                  {ev.capacidadMaxima > 0 && (
                    <span className={s.eventoMetaItem}>
                      <i className="bi bi-people" /> {ev.capacidadMaxima} lugares
                    </span>
                  )}
                </div>
                {waReservar(ev) && (
                  <a href={waReservar(ev)} target="_blank" rel="noreferrer" className={s.eventoBtn}>
                    <i className="bi bi-whatsapp" /> Reservar lugar
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className={s.coming}>
            <div className={s.comingIcon}><i className="bi bi-hourglass-split" /></div>
            <h3 className={s.comingTitle}>Proximamente</h3>
            <p className={s.comingDesc}>
              Estamos preparando degustaciones y eventos exclusivos.
              Muy pronto vas a poder reservar tu lugar desde aca.
            </p>
            <div className={s.features}>
              <div className={s.feature}>
                <i className="bi bi-droplet" />
                <span>Degustaciones guiadas</span>
              </div>
              <div className={s.feature}>
                <i className="bi bi-mortarboard" />
                <span>Talleres de cata</span>
              </div>
              <div className={s.feature}>
                <i className="bi bi-music-note-beamed" />
                <span>After con vinos</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Eventos Privados */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}><i className="bi bi-star" /> Eventos privados</h2>
        <p className={s.sectionDesc}>Organizamos tu evento a medida en nuestra vinoteca</p>

        <div className={s.privateGrid}>
          <div className={s.privateCard}>
            <div className={s.privateIcon}><i className="bi bi-cake2" /></div>
            <h3 className={s.privateCardTitle}>Cumpleanos</h3>
            <p className={s.privateCardDesc}>Festeja tu cumple con una degustacion exclusiva para vos y tus invitados</p>
          </div>
          <div className={s.privateCard}>
            <div className={s.privateIcon}><i className="bi bi-briefcase" /></div>
            <h3 className={s.privateCardTitle}>Empresariales</h3>
            <p className={s.privateCardDesc}>Team building, after office o eventos corporativos con seleccion de vinos premium</p>
          </div>
          <div className={s.privateCard}>
            <div className={s.privateIcon}><i className="bi bi-heart" /></div>
            <h3 className={s.privateCardTitle}>Celebraciones</h3>
            <p className={s.privateCardDesc}>Aniversarios, despedidas, reuniones especiales con la mejor atencion</p>
          </div>
          <div className={s.privateCard}>
            <div className={s.privateIcon}><i className="bi bi-people-fill" /></div>
            <h3 className={s.privateCardTitle}>Degustaciones privadas</h3>
            <p className={s.privateCardDesc}>Experiencia exclusiva de cata para tu grupo con sommelier dedicado</p>
          </div>
        </div>

        {/* CTA */}
        <div className={s.ctaBox}>
          <div className={s.ctaInfo}>
            <h3 className={s.ctaTitle}>Queres organizar tu evento?</h3>
            <p className={s.ctaDesc}>Contanos que tenes en mente y armamos una propuesta a medida con presupuesto incluido</p>
          </div>
          {waLink ? (
            <a href={waLink} target="_blank" rel="noreferrer" className={s.ctaBtn}>
              <i className="bi bi-whatsapp" /> Consultar por WhatsApp
            </a>
          ) : (
            <span className={s.ctaBtn} style={{ opacity: 0.5, cursor: 'default' }}>
              <i className="bi bi-whatsapp" /> WhatsApp no disponible
            </span>
          )}
        </div>
      </section>

      {/* Que incluyen */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}><i className="bi bi-check2-circle" /> Que incluyen nuestros eventos</h2>
        <div className={s.includeGrid}>
          <div className={s.includeItem}>
            <i className="bi bi-droplet" />
            <span>Seleccion de vinos</span>
          </div>
          <div className={s.includeItem}>
            <i className="bi bi-egg-fried" />
            <span>Tabla de quesos y fiambres</span>
          </div>
          <div className={s.includeItem}>
            <i className="bi bi-person-badge" />
            <span>Sommelier dedicado</span>
          </div>
          <div className={s.includeItem}>
            <i className="bi bi-geo-alt" />
            <span>Espacio exclusivo</span>
          </div>
          <div className={s.includeItem}>
            <i className="bi bi-music-note-beamed" />
            <span>Ambientacion</span>
          </div>
          <div className={s.includeItem}>
            <i className="bi bi-sliders" />
            <span>Personalizado a tu gusto</span>
          </div>
        </div>
      </section>
    </div>
  );
}
