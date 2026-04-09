import type { ReactNode } from "react";

export interface UiTableColumn<RowType> {
  id: string;
  header: string;
  className?: string;
  render: (row: RowType) => ReactNode;
}

export interface UiTableProps<RowType> {
  caption: string;
  columns: UiTableColumn<RowType>[];
  rows: RowType[];
  rowKey: (row: RowType, index: number) => string;
  emptyStateText?: string;
}

function UiTable<RowType>({ caption, columns, rows, rowKey, emptyStateText }: UiTableProps<RowType>) {
  return (
    <section className="ui-table-shell" aria-label={caption}>
      <table className="ui-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} scope="col" className={column.className}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row, index) => (
              <tr key={rowKey(row, index)}>
                {columns.map((column) => (
                  <td key={column.id} className={column.className}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length}>{emptyStateText ?? "No rows available."}</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

export default UiTable;
