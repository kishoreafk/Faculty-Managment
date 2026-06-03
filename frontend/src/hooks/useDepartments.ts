import { useEffect, useState } from 'react';
import api from '../utils/api';

export interface Department {
  id: number;
  organization_id: number;
  code: string;
  name: string;
  active: boolean;
  created_at: string;
}

let cache: Department[] | null = null;

export function useDepartments(forceReload = false) {
  const [departments, setDepartments] = useState<Department[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache || forceReload);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache && !forceReload) {
      setDepartments(cache);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<Department[]>('/departments')
      .then((res) => {
        if (cancelled) return;
        const list = res.data ?? [];
        cache = list;
        setDepartments(list);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.response?.data?.error ?? e?.message ?? 'Failed to load departments');
        setDepartments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [forceReload]);

  return { departments, loading, error };
}

export function invalidateDepartmentsCache(): void {
  cache = null;
}
