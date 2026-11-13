import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { config } from 'dotenv';

/**
 * 加载 backend/.env（若存在）。
 *
 * dotenv 默认不会覆盖已存在的变量，因此真实进程环境变量优先级始终高于文件。
 * 该模块必须在其余模块之前以副作用方式引入，保证读取配置前已完成加载。
 */
export const envFilePath = path.resolve(__dirname, '../../.env');
export const envFileExists = existsSync(envFilePath);

config({ path: envFilePath, quiet: true });
