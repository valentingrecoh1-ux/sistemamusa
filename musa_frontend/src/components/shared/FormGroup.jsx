import s from './FormGroup.module.css';

export default function FormGroup({ label, children }) {
  return (
    <div className={s.group}>
      {label && <label className={s.label}>{label}</label>}
      {children}
    </div>
  );
}
