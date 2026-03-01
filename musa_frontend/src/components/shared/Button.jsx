import s from './Button.module.css';

export default function Button({ children, variant = 'primary', size, full, active, className = '', ...props }) {
  const cls = [
    s.btn,
    s[variant],
    size && s[size],
    full && s.full,
    active && s.active,
    className,
  ].filter(Boolean).join(' ');

  return <button className={cls} {...props}>{children}</button>;
}
