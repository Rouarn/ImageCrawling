import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppConfigService } from '../config/app-config.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { isPathInside, toPosixPath } from '../common/utils/path.util';

/** 单段目录名的 UTF-8 字节上限（与主流文件系统的 NAME_MAX 对齐） */
const MAX_SEGMENT_BYTES = 255;
/** 整条相对路径的 UTF-8 字节上限 */
const MAX_RELATIVE_BYTES = 1024;
/** Windows 保留设备名，带任意扩展名同样不可用（如 CON.txt） */
const WINDOWS_RESERVED_NAME =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
/** 控制字符（Cc，含 NUL / DEL） */
const CONTROL_CHARACTER = /\p{Cc}/u;
/** 错误信息里给出的可用示例 */
const EXAMPLE_DIR = '画廊 2024（精选）';

/**
 * 存储根目录的唯一入口：所有文件系统操作都必须经过这里做路径校验。
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  readonly root: string;

  constructor(config: AppConfigService) {
    this.root = config.storageRoot;
  }

  onModuleInit(): void {
    fs.mkdirSync(this.root, { recursive: true });
    this.logger.log(`存储目录已就绪: ${this.root}`);
  }

  /**
   * 把相对路径解析为绝对路径，并保证不会逃逸出存储根目录。
   */
  resolve(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const absolute = path.resolve(this.root, normalized);
    if (!isPathInside(this.root, absolute) || absolute === this.root) {
      throw new AppException(
        ErrorCode.PATH_OUTSIDE_STORAGE,
        '非法路径：目标不在存储目录内',
        HttpStatus.BAD_REQUEST,
      );
    }
    return absolute;
  }

  /**
   * 校验用户输入的输出目录（相对路径），必要时创建目录。
   *
   * 采用黑名单：以 `/` 分段后逐段拒绝危险名称，其余（空格、括号、中文标点、
   * 书名号、emoji 等）一律允许。输入先做 Unicode NFC 规范化再校验和落盘，
   * 避免同形异码产生两个目录；已存在的历史目录保持原名，不改名。
   */
  resolveDirectory(input?: string): string {
    const normalized = (input ?? '').normalize('NFC');
    if (!normalized) {
      this.reject('输出目录不能为空');
    }

    const totalBytes = Buffer.byteLength(normalized, 'utf8');
    if (totalBytes > MAX_RELATIVE_BYTES) {
      this.reject(
        `输出目录整体过长（UTF-8 共 ${totalBytes} 字节，上限 ${MAX_RELATIVE_BYTES} 字节），请减少层级或缩短名称`,
      );
    }
    if (path.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized)) {
      this.reject('输出目录必须是存储目录下的相对路径，不能是绝对路径');
    }

    const segments = normalized.replace(/\/+$/, '').split('/');
    segments.forEach((segment, index) => this.assertSegment(segment, index));

    const relative = segments.join('/');
    let absolute = this.resolve(relative);

    // 历史目录可能是 NFD 形式：若同形 NFD 目录已存在，直接复用，避免出现两个看起来一样的目录。
    if (!fs.existsSync(absolute)) {
      const decomposed = relative.normalize('NFD');
      if (decomposed !== relative) {
        const legacy = this.resolve(decomposed);
        if (isDirectory(legacy)) absolute = legacy;
      }
    }

    fs.mkdirSync(absolute, { recursive: true });
    return absolute;
  }

  /**
   * 绝对路径转相对路径（POSIX 分隔符）。
   */
  toRelative(absolutePath: string): string {
    return toPosixPath(path.relative(this.root, absolutePath));
  }

  toRelativeFromDirectory(absolutePath: string, directory: string): string {
    return toPosixPath(path.relative(directory, absolutePath));
  }

  /** 逐段黑名单校验，错误信息指明第几段、违反了哪条规则并给出可用示例 */
  private assertSegment(segment: string, index: number): void {
    const position = `输出目录第 ${index + 1} 段`;
    const shown = `「${describeSegment(segment)}」`;

    if (!segment) {
      this.reject(`${position}为空：不能出现连续的 /，也不能以 / 开头`);
    }
    if (segment === '.' || segment === '..') {
      this.reject(`${position}${shown}不是有效的目录名，不能用 . 或 ..`);
    }
    if (segment.includes('\\')) {
      this.reject(`${position}${shown}包含反斜杠，请改用 / 分隔层级`);
    }
    if (CONTROL_CHARACTER.test(segment)) {
      this.reject(`${position}${shown}包含控制字符（含 NUL）`);
    }
    if (segment.startsWith(' ')) {
      this.reject(`${position}${shown}以空格开头，请去掉段首空格`);
    }
    if (segment.endsWith(' ')) {
      this.reject(`${position}${shown}以空格结尾，请去掉段尾空格`);
    }
    if (segment.startsWith('.')) {
      this.reject(`${position}${shown}以点开头，请去掉段首的点`);
    }
    if (segment.endsWith('.')) {
      this.reject(`${position}${shown}以点结尾，请去掉段尾的点`);
    }
    if (WINDOWS_RESERVED_NAME.test(segment)) {
      this.reject(`${position}${shown}是 Windows 保留名（含带扩展名的形式）`);
    }

    const bytes = Buffer.byteLength(segment, 'utf8');
    if (bytes > MAX_SEGMENT_BYTES) {
      this.reject(
        `${position}过长（UTF-8 共 ${bytes} 字节，单段上限 ${MAX_SEGMENT_BYTES} 字节）`,
      );
    }
  }

  private reject(message: string): never {
    throw new AppException(
      ErrorCode.INVALID_OUT_DIR,
      `${message}；可用示例：${EXAMPLE_DIR}`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

/** 控制字符转义后再展示，避免把原始不可见字符回显给前端 */
function describeSegment(segment: string): string {
  const escaped = segment.replace(
    /\p{Cc}/gu,
    (char) => `\\u{${(char.codePointAt(0) ?? 0).toString(16).toUpperCase()}}`,
  );
  const chars = [...escaped];
  return chars.length > 40 ? `${chars.slice(0, 40).join('')}…` : escaped;
}

function isDirectory(absolutePath: string): boolean {
  try {
    return fs.statSync(absolutePath).isDirectory();
  } catch {
    return false;
  }
}
