import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export interface Column<T> {
  header: string | ReactNode;
  accessorKey?: keyof T;
  cell?: (item: T) => ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
}

export function DataTable<T>({ 
  columns, 
  data, 
  isLoading = false, 
  emptyMessage = 'Không có dữ liệu hiển thị',
  onRowClick
}: DataTableProps<T>) {
  
  if (isLoading) {
    return (
      <div className="w-full flex justify-center items-center p-12 bg-white rounded-lg border border-gray-200">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 font-medium">
          <tr>
            {columns.map((col, index) => (
              <th key={index} className={`px-4 py-3 whitespace-nowrap ${col.className || ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item, rowIndex) => (
              <tr 
                key={rowIndex} 
                onClick={() => onRowClick?.(item)}
                className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((col, colIndex) => (
                  <td key={colIndex} className={`px-4 py-3 ${col.className || ''}`}>
                    {col.cell 
                      ? col.cell(item) 
                      : col.accessorKey 
                        ? (item[col.accessorKey] as ReactNode) 
                        : null}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
