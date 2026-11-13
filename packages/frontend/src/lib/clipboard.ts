/**
 * 复制文本到剪贴板。
 *
 * 优先使用 Clipboard API；浏览器拒绝（权限、非安全上下文、旧内核）时
 * 回退到隐藏 textarea + execCommand，保证桌面与移动端都有可用的反馈路径。
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // 继续尝试回退方案
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);

  try {
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    if (!document.execCommand('copy')) {
      throw new Error('浏览器拒绝了复制命令');
    }
  } finally {
    document.body.removeChild(textarea);
  }
}
