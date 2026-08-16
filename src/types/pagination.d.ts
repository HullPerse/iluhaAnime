export interface PaginationResult {
  total: number;
  from: number;
  to: number;
  lastPage: number;
  page: number;
  setPage: (page: number) => void;
}

export interface PaginationProps {
  total: number;
  page: number;
  lastPage: number;
  from: number;
  to: number;
  onPageChange: (page: number) => void;
  statusText?: string;
}
