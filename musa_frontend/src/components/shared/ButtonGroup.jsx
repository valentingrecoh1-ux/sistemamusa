import s from './ButtonGroup.module.css';

export default function ButtonGroup({ options, value, onChange }) {
  return (
    <div className={s.group}>
      {options.map(opt => (
        <button
          key={opt}
          className={value === opt ? 'active' : ''}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
