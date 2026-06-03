import { useEffect, useState } from 'react';
import api from '../utils/api';

/**
 * `useMasterCodes(category)` — fetch the list of active codes for a
 * `master_codes` category and return it as a plain array. The list is
 * cached in memory for the lifetime of the page (it does not change
 * often) but re-fetches on demand if `category` changes.
 *
 * Examples:
 *   const roles = useMasterCodes('role');
 *   const statuses = useMasterCodes('approval_status');
 */
export interface MasterCode {
  id: number;
  category: string;
  code: string;
  name: string | null;
  display_order: number;
  active: boolean;
  created_at: string;
}

const cache: Record<string, MasterCode[]> = {};

export function useMasterCodes(category: string): { codes: MasterCode[]; loading: boolean; error: string | null } {
  const [codes, setCodes] = useState<MasterCode[]>(cache[category] ?? []);
  const [loading, setLoading] = useState(!cache[category]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache[category]) {
      setCodes(cache[category]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<MasterCode[]>(`/master-codes/${encodeURIComponent(category)}`)
      .then((res) => {
        if (cancelled) return;
        const list = res.data ?? [];
        cache[category] = list;
        setCodes(list);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.response?.data?.error ?? e?.message ?? 'Failed to load codes');
        setCodes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  return { codes, loading, error };
}
