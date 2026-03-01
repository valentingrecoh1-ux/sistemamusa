import s from './Card.module.css';

export default function Card({ title, children, onClick, className = '', style }) {
  return (
    <div className={`${s.card} ${onClick ? s.clickable : ''} ${className}`} onClick={onClick} style={style}>
      {title && <h3 className={s.cardTitle}>{title}</h3>}
      {children}
    </div>
  );
}
