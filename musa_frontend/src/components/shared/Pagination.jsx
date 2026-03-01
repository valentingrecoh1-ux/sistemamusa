import s from './Pagination.module.css';

export default function Pagination({ page, totalPages, onChange, className = '' }) {
  if (totalPages <= 1) return null;
  return (
    <div className={`${s.pagination} ${className}`.trim()}>
      <button className={s.btn} onClick={() => onChange(page - 1)} disabled={page <= 1}>
        <i className="bi bi-chevron-left" />
      </button>
      <span className={s.info}>
        <span className={s.infoLabel}>PAG</span>
        <strong>{page}</strong>
        <span className={s.separator}>/</span>
        <strong>{totalPages}</strong>
      </span>
      <button className={s.btn} onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
        <i className="bi bi-chevron-right" />
      </button>
    </div>
  );
}
