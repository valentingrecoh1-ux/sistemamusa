import s from './KPICard.module.css';

export default function KPICard({ label, value, urgent, onClick }) {
  return (
    <div className={`${s.kpi} ${urgent ? s.urgent : ''} ${onClick ? s.clickable : ''}`} onClick={onClick}>
      <div className={s.label}>{label}</div>
      <div className={s.value}>{value}</div>
    </div>
  );
}
