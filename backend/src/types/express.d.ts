import 'express';

declare module 'express' {
  interface Request {
    user?: {
      id: number;
      email: string;
      role: string;
      iat?: number;
      exp?: number;
      jti?: string;
    };
    authz?: { requiredRoles: string[] };
  }
}

export interface PaginationQuery {
  page?: string;
  pageSize?: string;
  query?: string;
  status?: string;
  role?: string;
  department?: string;
}
