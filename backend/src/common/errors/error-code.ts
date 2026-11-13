/**
 * 业务错误码。响应体中的 error.code 始终取自这里，前端可据此做差异化提示。
 */
export const ErrorCode = {
  /** DTO 校验失败 */
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  /** 输出目录不合法 */
  INVALID_OUT_DIR: 'INVALID_OUT_DIR',
  /** 分页参数组合不合法 */
  INVALID_PAGINATION: 'INVALID_PAGINATION',
  /** 页面抓取失败（网络 / HTTP 状态码异常） */
  PAGE_FETCH_FAILED: 'PAGE_FETCH_FAILED',
  /** 无头浏览器不可用 */
  HEADLESS_UNAVAILABLE: 'HEADLESS_UNAVAILABLE',
  /** 单张图片下载或保存失败 */
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  /** 图片不存在 */
  IMAGE_NOT_FOUND: 'IMAGE_NOT_FOUND',
  /** 路径越界或非法 */
  PATH_OUTSIDE_STORAGE: 'PATH_OUTSIDE_STORAGE',
  /** 文件系统读写异常 */
  STORAGE_ERROR: 'STORAGE_ERROR',
  /** 任务被主动取消 */
  CRAWL_ABORTED: 'CRAWL_ABORTED',
  /** 路由不存在 */
  NOT_FOUND: 'NOT_FOUND',
  /** 未捕获的服务器异常 */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
