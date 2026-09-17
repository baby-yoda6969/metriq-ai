import { PAGE_SIZES } from '../lib/pagination.js';
export function Pagination({ page, pages, size, total, from, to, onPageChange, onSizeChange }) {
  return <nav className="pagination" aria-label="Case history pagination">
    <span role="status">{from}–{to} of {total} cases</span>
    <label>Per page <select value={size} onChange={e => onSizeChange(e.target.value)}>{PAGE_SIZES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    <div><button disabled={page === 1} onClick={() => onPageChange(page - 1)}>Previous</button><span aria-live="polite">{page} / {pages}</span><button disabled={page === pages} onClick={() => onPageChange(page + 1)}>Next</button></div>
  </nav>;
}
