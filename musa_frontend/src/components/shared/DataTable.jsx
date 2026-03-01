import s from './DataTable.module.css';

export default function DataTable({ columns, data, onRowClick, emptyText = 'Sin datos', renderRow }) {
  return (
    <div className={s.wrapper}>
      <table className={s.table}>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} style={col.style} onClick={col.onClick}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length > 0
            ? data.map((row, i) => (
                <tr
                  key={row._id || i}
                  className={onRowClick ? s.clickable : ''}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {renderRow(row, i)}
                </tr>
              ))
            : (
              <tr>
                <td colSpan={columns.length} className={s.empty}>{emptyText}</td>
              </tr>
            )
          }
        </tbody>
      </table>
    </div>
  );
}
