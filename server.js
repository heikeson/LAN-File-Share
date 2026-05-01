const express = require('express');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

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

app.get('/api/download', (req, res) => {
  if (!config.allowDownload) {
    return res.status(403).json({ error: '下载已禁用' });
  }
  
  const folderIndex = parseInt(req.query.folderIndex) || 0;
  const filePath = req.query.path;
  
  if (!filePath) {
    return res.status(400).json({ error: '文件路径不能为空' });
  }
  
  const folder = config.sharedFolders[folderIndex];
  if (!folder) {
    return res.status(404).json({ error: '文件夹不存在' });
  }
  
  const fullPath = path.resolve(folder.path, filePath);
  
  if (!fullPath.startsWith(path.resolve(folder.path))) {
    return res.status(403).json({ error: '禁止访问' });
  }
  
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: '文件不存在' });
  }
  
  const stats = fs.statSync(fullPath);
  if (stats.isDirectory()) {
    return res.status(400).json({ error: '不能下载文件夹' });
  }
  
  if (config.maxFileSize && stats.size > config.maxFileSize) {
    return res.status(400).json({ error: '文件过大' });
  }
  
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(fullPath))}"`);
  res.setHeader('Content-Length', stats.size);
  res.setHeader('Content-Type', mime.lookup(fullPath) || 'application/octet-stream');
  
  fs.createReadStream(fullPath).pipe(res);
});

app.get('/api/preview', (req, res) => {
  const folderIndex = parseInt(req.query.folderIndex) || 0;
  const filePath = req.query.path;
  
  if (!filePath) {
    return res.status(400).json({ error: '文件路径不能为空' });
  }
  
  const folder = config.sharedFolders[folderIndex];
  if (!folder) {
    return res.status(404).json({ error: '文件夹不存在' });
  }
  
  const fullPath = path.resolve(folder.path, filePath);
  
  if (!fullPath.startsWith(path.resolve(folder.path))) {
    return res.status(403).json({ error: '禁止访问' });
  }
  
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: '文件不存在' });
  }
  
  const stats = fs.statSync(fullPath);
  if (stats.isDirectory()) {
    return res.status(400).json({ error: '不能预览文件夹' });
  }
  
  const mimeType = mime.lookup(fullPath);
  res.setHeader('Content-Type', mimeType || 'application/octet-stream');
  
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
    const lineText = `http://${ip.address}:8080 (${ip.name})`;
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
