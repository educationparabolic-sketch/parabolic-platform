export interface UiPaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

function UiPagination({ page, pageSize, totalItems, onPageChange }: UiPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const previousDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <nav className="ui-pagination" aria-label="Pagination">
      <button type="button" className="ghost-button" disabled={previousDisabled} onClick={() => onPageChange(page - 1)}>
        Previous
      </button>
      <span className="ui-pagination-status">
        Page
        {" "}
        <strong>{page}</strong>
        {" "}
        of
        {" "}
        <strong>{totalPages}</strong>
      </span>
      <button type="button" className="ghost-button" disabled={nextDisabled} onClick={() => onPageChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}

export default UiPagination;
