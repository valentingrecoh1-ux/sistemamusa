import s from './Timeline.module.css';

export default function Timeline({ entries }) {
  return (
    <div className={s.container}>
      {entries.map((t, i) => (
        <div key={i} className={s.entry}>
          <div className={s.dot} />
          <div>
            <div className={s.action}>{t.accion}</div>
            {t.detalle && <div className={s.detail}>{t.detalle}</div>}
            <div className={s.meta}>{t.usuario} — {new Date(t.fecha).toLocaleString('es-AR')}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
