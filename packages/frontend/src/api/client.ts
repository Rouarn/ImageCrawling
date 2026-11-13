import axios, { type AxiosRequestConfig } from 'axios';

interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId?: string | null;
    path?: string;
    timestamp?: string;
  };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(
    code: string,
    message: string,
    options: { status?: number; details?: unknown; requestId?: string } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = options.status;
    this.details = options.details;
    this.requestId = options.requestId;
  }
}

const http = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.response.use(undefined, (error: unknown) => {
  throw toApiError(error);
});

async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await http.request<SuccessEnvelope<T>>(config);
  return response.data.data;
}

export const api = {
  get: <T>(url: string, params?: Record<string, unknown>) =>
    request<T>({ method: 'GET', url, params }),
  post: <T>(url: string, data?: unknown) =>
    request<T>({ method: 'POST', url, data }),
  delete: <T>(url: string, data?: unknown) =>
    request<T>({ method: 'DELETE', url, data }),
};

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ErrorEnvelope | undefined;
    if (body?.error) {
      return new ApiError(body.error.code, body.error.message, {
        status: error.response?.status,
        details: body.error.details,
        requestId: body.meta?.requestId ?? undefined,
      });
    }
    if (error.code === 'ECONNABORTED') {
      return new ApiError('REQUEST_TIMEOUT', '请求超时，请稍后重试');
    }
    return new ApiError(
      'NETWORK_ERROR',
      '无法连接到后端服务，请确认服务已启动',
      { status: error.response?.status },
    );
  }

  if (error instanceof Error) {
    return new ApiError('UNKNOWN_ERROR', error.message);
  }
  return new ApiError('UNKNOWN_ERROR', '未知错误');
}

/**
 * 读取 SSE 错误响应体（非 2xx 时后端返回统一的 JSON 错误结构）。
 */
export async function readErrorResponse(
  response: Response,
): Promise<ApiError> {
  try {
    const body = (await response.json()) as ErrorEnvelope;
    if (body?.error) {
      return new ApiError(body.error.code, body.error.message, {
        status: response.status,
        details: body.error.details,
        requestId: body.meta?.requestId ?? undefined,
      });
    }
  } catch {
    // 忽略解析失败，回退到通用错误
  }
  return new ApiError(
    'STREAM_FAILED',
    `请求失败：HTTP ${response.status} ${response.statusText}`,
    { status: response.status },
  );
}
