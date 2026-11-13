import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_KEY = 'raw-response';

/**
 * 标记该路由自行管理响应（例如 SSE 流），跳过统一响应包装。
 */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
