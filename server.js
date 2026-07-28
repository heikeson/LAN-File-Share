const express = require('express');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const { TextDecoder } = require('util');

const app = express();
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));

app.use(express.json());
app.use(express.static('public'));

function getAllIPs() {
  const interfaces = require('os').networkInterfaces();
  const ips = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({
          name: name,
          address: iface.address,
          mac: iface.mac,
          family: iface.family
        });
      }
    }
  }
  
  return ips;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDateTime(date) {
  const d = new Date(date);
  return d.toLocaleString('zh-CN');
}

function getFileList(folderPath, relativePath = '') {
  const fullPath = path.resolve(folderPath, relativePath);
  
  if (!fs.existsSync(fullPath)) {
    return { error: '文件夹不存在', files: [], folders: [] };
  }
  
  const items = fs.readdirSync(fullPath, { withFileTypes: true });
  const files = [];
  const folders = [];
  
  for (const item of items) {
    if (item.name.startsWith('.')) continue;
    
    const stats = fs.statSync(path.join(fullPath, item.name));
    const itemPath = path.join(relativePath, item.name);
    
    if (item.isDirectory()) {
      folders.push({
        name: item.name,
        path: itemPath,
        modified: formatDateTime(stats.mtime)
      });
    } else {
      files.push({
        name: item.name,
        path: itemPath,
        size: formatFileSize(stats.size),
        sizeBytes: stats.size,
        modified: formatDateTime(stats.mtime),
        type: mime.lookup(item.name) || 'application/octet-stream'
      });
    }
  }
  
  return {
    currentPath: relativePath,
    folders: folders.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
    files: files.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  };
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/folders', (req, res) => {
  res.json(config.sharedFolders);
});

app.get('/api/files', (req, res) => {
  const folderIndex = parseInt(req.query.folderIndex) || 0;
  const folder = config.sharedFolders[folderIndex];
  const relativePath = req.query.path || '';
  
  if (!folder) {
    return res.status(404).json({ error: '文件夹不存在' });
  }
  
  const fileList = getFileList(folder.path, relativePath);
  res.json({
    folderName: folder.name,
    folderDescription: folder.description,
    folderIndex,
    ...fileList
  });
});

/**
 * 解析文件路径并验证权限
 * @param {number} folderIndex - 文件夹索引
 * @param {string} filePath - 文件相对路径
 * @returns {Object} 包含 fullPath、folder、stats 或错误信息
 */
function resolveFile(folderIndex, filePath) {
  const folder = config.sharedFolders[folderIndex];
  if (!folder) {
    return { error: '文件夹不存在', status: 404 };
  }

  const fullPath = path.resolve(folder.path, filePath);

  if (!fullPath.startsWith(path.resolve(folder.path))) {
    return { error: '禁止访问', status: 403 };
  }

  if (!fs.existsSync(fullPath)) {
    return { error: '文件不存在', status: 404 };
  }

  const stats = fs.statSync(fullPath);
  if (stats.isDirectory()) {
    return { error: '不能操作文件夹', status: 400 };
  }

  if (config.maxFileSize && stats.size > config.maxFileSize) {
    return { error: '文件过大', status: 400 };
  }

  return { fullPath, folder, stats };
}

/**
 * 短链接下载文件
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * 路由格式: /d/:folderIndex/* (例如: /d/0/folder/file.txt)
 */
app.get('/d/:folderIndex/*', (req, res) => {
  if (!config.allowDownload) {
    return res.status(403).json({ error: '下载已禁用' });
  }

  const folderIndex = parseInt(req.params.folderIndex);
  const filePath = decodeURIComponent(req.params[0]);

  if (!filePath) {
    return res.status(400).json({ error: '文件路径不能为空' });
  }

  const result = resolveFile(folderIndex, filePath);
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(result.fullPath))}"`);
  res.setHeader('Content-Length', result.stats.size);
  res.setHeader('Content-Type', mime.lookup(result.fullPath) || 'application/octet-stream');

  fs.createReadStream(result.fullPath).pipe(res);
});

const TEXT_EXT = /\.(txt|md|markdown|json|js|ts|jsx|tsx|css|html?|xml|log|csv|ini|yml|yaml|py|java|c|cpp|h|hpp|sh|bat|cmd|sql|go|rs|php|rb)$/i;

// 将文件字节解码为文本：优先 UTF-8，含大量替换符则回退 GBK，并去除 BOM，解决「新标签打开」中文乱码
function decodeTextBuffer(buf) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  const replaced = utf8.split('\uFFFD').length - 1;
  let text = utf8;
  if (replaced > 0 && replaced * 20 > utf8.length) {
    try { text = new TextDecoder('gbk').decode(buf); } catch (e) {}
  }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  return text;
}

/**
 * 短链接预览文件
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * 路由格式: /p/:folderIndex/* (例如: /p/0/folder/image.jpg)
 */
app.get('/p/:folderIndex/*', (req, res) => {
  const folderIndex = parseInt(req.params.folderIndex);
  const filePath = decodeURIComponent(req.params[0]);

  if (!filePath) {
    return res.status(400).json({ error: '文件路径不能为空' });
  }

  const result = resolveFile(folderIndex, filePath);
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  const fullPath = result.fullPath;
  const mimeType = mime.lookup(fullPath) || 'application/octet-stream';
  const isText = mimeType.startsWith('text/') || TEXT_EXT.test(fullPath);
  const MAX_TEXT_BYTES = 20 * 1024 * 1024;

  // 文本文件：检测编码并统一转 UTF-8 输出（声明 charset=utf-8），避免浏览器按默认编码解析导致中文乱码
  if (isText && result.stats && result.stats.size <= MAX_TEXT_BYTES) {
    try {
      const buf = fs.readFileSync(fullPath);
      const text = decodeTextBuffer(buf);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(Buffer.from(text, 'utf-8'));
    } catch (e) { /* 转码失败则回退原始流 */ }
  }

  res.setHeader('Content-Type', mimeType);
  fs.createReadStream(fullPath).pipe(res);
});

const PORT = config.port || 8080;
const HOST = config.host || '0.0.0.0';

app.listen(PORT, HOST, () => {
  const allIPs = getAllIPs();
  const folderCount = config.sharedFolders.length;
  
  let ipLines = '';
  allIPs.forEach((ip, index) => {
    const isLast = index === allIPs.length - 1;
    const prefix = isLast ? '└─' : '├─';
    const lineText = `http://${ip.address}:${PORT} (${ip.name})`;
    const paddingLength = Math.max(0, 44 - lineText.length);
    const padding = ' '.repeat(paddingLength);
    ipLines += `║  ${prefix} ${lineText}${padding}║\n`;
  });
  
  if (allIPs.length === 0) {
    ipLines = '║  └─ 未检测到可用网卡                          ║\n';
  }
  
  console.log(`
╔════════════════════════════════════════════════════════╗
║          局域网文件分享服务器已启动                      ║
╠════════════════════════════════════════════════════════╣
║  本地访问：http://localhost:${PORT}                      ║
║  局域网访问：                                            ║
${ipLines}║  分享文件夹数量：${String(folderCount).padEnd(48, ' ')}║
╚════════════════════════════════════════════════════════╝
  `);
});
