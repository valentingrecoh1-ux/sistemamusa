import s from './SearchBar.module.css';

export default function SearchBar({ value, onChange, placeholder = 'Buscar...', children }) {
  return (
    <div className={s.bar}>
      <input
        className={s.input}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {children}
    </div>
  );
}
