import { api } from './client';
import type {
  DeleteImagesResponse,
  ImageGroupsResponse,
  ImageItem,
  ImageListQuery,
  ImageListResponse,
} from './contracts';

export function fetchImageGroups(): Promise<ImageGroupsResponse> {
  return api.get<ImageGroupsResponse>('/images/groups');
}

export function fetchImages(query: ImageListQuery): Promise<ImageListResponse> {
  return api.get<ImageListResponse>('/images', {
    group: query.group ?? 'all',
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 48,
    q: query.q || undefined,
    sort: query.sort ?? 'name',
  });
}

export function fetchImageMetadata(path: string): Promise<ImageItem> {
  return api.get<ImageItem>('/images/metadata', { path });
}

export function deleteImages(paths: string[]): Promise<DeleteImagesResponse> {
  return api.delete<DeleteImagesResponse>('/images', { paths });
}
