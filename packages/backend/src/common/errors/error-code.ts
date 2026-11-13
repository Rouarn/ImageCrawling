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
  /** 人工验证超时 */
  CHALLENGE_TIMEOUT: 'CHALLENGE_TIMEOUT',
  /** 人工验证失败（窗口关闭、启动失败等） */
  CHALLENGE_FAILED: 'CHALLENGE_FAILED',
  /** 当前任务没有等待中的人工验证 */
  CHALLENGE_NOT_PENDING: 'CHALLENGE_NOT_PENDING',
  /** 后端未配置 IMPORT_TOKEN，导入接口不可用 */
  IMPORT_DISABLED: 'IMPORT_DISABLED',
  /** 导入令牌缺失或不匹配 */
  IMPORT_UNAUTHORIZED: 'IMPORT_UNAUTHORIZED',
  /** 导入接口被非本机请求访问 */
  IMPORT_FORBIDDEN: 'IMPORT_FORBIDDEN',
  /** 导入内容不是可识别的图片 */
  IMPORT_INVALID_IMAGE: 'IMPORT_INVALID_IMAGE',
  /** 路由不存在 */
  NOT_FOUND: 'NOT_FOUND',
  /** 未捕获的服务器异常 */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
