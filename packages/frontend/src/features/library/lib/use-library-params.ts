import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ImageSort } from '@/api/contracts';

export interface LibraryParams {
  group: string;
  page: number;
  q: string;
  sort: ImageSort;
}

export interface LibraryParamsApi extends LibraryParams {
  update: (patch: Partial<LibraryParams>) => void;
}

export function useLibraryParams(): LibraryParamsApi {
  const [searchParams, setSearchParams] = useSearchParams();

  const group = searchParams.get('group') || 'all';
  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1);
  const q = searchParams.get('q') || '';
  const sort: ImageSort =
    searchParams.get('sort') === 'newest' ? 'newest' : 'name';

  const update = useCallback(
    (patch: Partial<LibraryParams>) => {
      const merged: LibraryParams = { group, page, q, sort, ...patch };
      if (!('page' in patch)) merged.page = 1;

      const next = new URLSearchParams();
      if (merged.group !== 'all') next.set('group', merged.group);
      if (merged.page > 1) next.set('page', String(merged.page));
      if (merged.q.trim()) next.set('q', merged.q.trim());
      if (merged.sort !== 'name') next.set('sort', merged.sort);
      setSearchParams(next, { replace: true });
    },
    [group, page, q, sort, setSearchParams],
  );

  return { group, page, q, sort, update };
}
