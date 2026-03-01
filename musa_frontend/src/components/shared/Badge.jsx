import s from './Badge.module.css';

export default function Badge({ children, variant = 'default', className = '' }) {
  return (
    <span className={`${s.badge} ${s[variant] || s.default} ${className}`}>
      {children}
    </span>
  );
}
