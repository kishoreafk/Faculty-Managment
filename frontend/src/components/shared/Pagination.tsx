import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export default function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }: PaginationProps) {
  const totalPages = total ? Math.ceil(total / pageSize) : undefined;

  const pages: (number | '...')[] = [];
  if (totalPages && totalPages > 1) {
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 pt-4 border-t">
      <div className="flex items-center gap-2 sm:gap-3 text-sm text-gray-600">
        {total !== undefined && <span className="text-xs sm:text-sm">{total} item{total !== 1 ? 's' : ''}</span>}
        {onPageSizeChange && (
          <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))}
            className="border rounded px-1 sm:px-2 py-1 text-xs sm:text-sm">
            {[10, 25, 50, 100].map(s => <option key={s} value={s}>{s} / page</option>)}
          </select>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
          className="p-1 rounded border disabled:opacity-30 hover:bg-gray-50">
          <ChevronLeft className="w-3 sm:w-4 h-3 sm:h-4" />
        </button>

        {totalPages ? (
          pages.map((p, i) =>
            p === '...' ? (
              <span key={`e${i}`} className="px-1 sm:px-2 text-gray-400 text-xs sm:text-sm">...</span>
            ) : (
              <button key={p} onClick={() => onPageChange(p)}
                className={`min-w-[1.5rem] sm:min-w-[2rem] h-6 sm:h-8 rounded text-xs sm:text-sm font-medium ${p === page ? 'bg-indigo-600 text-white' : 'hover:bg-gray-100'}`}>
                {p}
              </button>
            )
          )
        ) : (
          <span className="px-2 sm:px-3 text-xs sm:text-sm text-gray-600">Page {page}</span>
        )}

        <button onClick={() => onPageChange(page + 1)} disabled={totalPages !== undefined && page >= totalPages}
          className="p-1 rounded border disabled:opacity-30 hover:bg-gray-50">
          <ChevronRight className="w-3 sm:w-4 h-3 sm:h-4" />
        </button>
      </div>
    </div>
  );
}
