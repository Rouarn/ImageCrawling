import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteImages,
  fetchImageGroups,
  fetchImages,
} from '@/api/images';
import type { ImageListQuery } from '@/api/contracts';

export const imageQueryKeys = {
  all: ['images'] as const,
  groups: ['image-groups'] as const,
  list: (query: ImageListQuery) => ['images', 'list', query] as const,
};

export function useImageGroups() {
  return useQuery({
    queryKey: imageQueryKeys.groups,
    queryFn: fetchImageGroups,
    staleTime: 30_000,
  });
}

export function useImageList(query: ImageListQuery) {
  return useQuery({
    queryKey: imageQueryKeys.list(query),
    queryFn: () => fetchImages(query),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useDeleteImages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteImages,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: imageQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: imageQueryKeys.groups });
    },
  });
}
