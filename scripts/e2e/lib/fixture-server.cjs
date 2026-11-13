/* eslint-disable */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const FIXTURE_ROOT = path.resolve(__dirname, '../fixture');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.js': 'text/javascript; charset=utf-8',
};

/**
 * 启动 E2E 静态站点。端口被占用时视为已有实例，直接复用（不负责关闭）。
 * 返回 { close }，无论测试成功失败都应在 finally 中调用。
 */
function startFixtureServer(port = 8899) {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const filePath = path.join(FIXTURE_ROOT, pathname);
    if (!filePath.startsWith(FIXTURE_ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    fs.readFile(filePath, (error, content) => {
      if (error) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
      res.end(content);
    });
  });

  return new Promise((resolve) => {
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.log(`FIXTURE reuse existing server on :${port}`);
        resolve({ close: () => {} });
        return;
      }
      throw error;
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`FIXTURE listening on http://127.0.0.1:${port}`);
      resolve({ close: () => new Promise((done) => server.close(done)) });
    });
  });
}

module.exports = { startFixtureServer };
