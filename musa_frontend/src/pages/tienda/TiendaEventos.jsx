import s from './TiendaEventos.module.css';

export default function TiendaEventos() {
  return (
    <div className={s.page}>
      <section className={s.hero}>
        <div className={s.heroIcon}><i className="bi bi-calendar-event" /></div>
        <h1 className={s.heroTitle}>Eventos & Degustaciones</h1>
        <p className={s.heroSub}>Vivi experiencias unicas con los mejores vinos</p>
      </section>

      <section className={s.coming}>
        <div className={s.comingIcon}><i className="bi bi-hourglass-split" /></div>
        <h2 className={s.comingTitle}>Proximamente</h2>
        <p className={s.comingDesc}>
          Estamos preparando eventos y degustaciones exclusivas para vos.
          Muy pronto vas a poder reservar tu lugar desde aca.
        </p>
        <div className={s.features}>
          <div className={s.feature}>
            <i className="bi bi-cup-straw" />
            <span>Degustaciones guiadas</span>
          </div>
          <div className={s.feature}>
            <i className="bi bi-people" />
            <span>Eventos privados</span>
          </div>
          <div className={s.feature}>
            <i className="bi bi-mortarboard" />
            <span>Talleres de cata</span>
          </div>
        </div>
      </section>
    </div>
  );
}
