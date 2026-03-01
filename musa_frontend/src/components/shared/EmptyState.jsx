import s from './EmptyState.module.css';

export default function EmptyState({ icon = 'bi-inbox', text = 'Sin datos' }) {
  return (
    <div className={s.empty}>
      <div className={s.icon}><i className={`bi ${icon}`} /></div>
      <div className={s.text}>{text}</div>
    </div>
  );
}
