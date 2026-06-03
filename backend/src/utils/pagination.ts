export type Pagination = {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
};

const clampInt = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const parsePagination = (
  pageRaw: unknown,
  pageSizeRaw: unknown,
  options?: {
    defaultPageSize?: number;
    maxPageSize?: number;
  }
): Pagination => {
  const defaultPageSize = options?.defaultPageSize ?? 20;
  const maxPageSize = options?.maxPageSize ?? 100;

  const parsedPage = Number(pageRaw);
  const parsedPageSize = Number(pageSizeRaw);

  const page = Number.isFinite(parsedPage) ? Math.max(1, Math.floor(parsedPage)) : 1;
  const pageSize = Number.isFinite(parsedPageSize)
    ? clampInt(Math.floor(parsedPageSize), 1, maxPageSize)
    : clampInt(defaultPageSize, 1, maxPageSize);

  const limit = pageSize;
  const offset = (page - 1) * pageSize;

  return { page, pageSize, limit, offset };
};
