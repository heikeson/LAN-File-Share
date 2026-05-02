# 局域网文件分享网站 LAN File Share

一个简单、高效的局域网文件分享服务器，支持通过配置文件自定义分享文件夹。

## 功能特点

- ✅ 支持配置多个分享文件夹
- ✅ 文件浏览和下载
- ✅ 图片、PDF 在线预览
- ✅ 响应式设计，支持移动端
- ✅ 文件类型图标识别
- ✅ 面包屑导航
- ✅ 文件大小和修改时间显示
- ✅ 安全路径验证，防止目录穿越
- ✅ 短链接下载和预览（更简洁的分享链接）

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 启动服务器
npm start
```

启动成功后会显示访问地址：
- 本地访问：http://localhost:8080
- 局域网访问：http://[你的 IP]:8080

## 配置说明

编辑 `config.json` 文件进行配置：

```json
{
  "port": 8080,              // 服务器端口
  "host": "0.0.0.0",         // 监听地址
  "sharedFolders": [         // 分享文件夹列表
    {
      "name": "默认分享",     // 文件夹显示名称
      "path": "./shared",    // 文件夹路径（支持绝对路径和相对路径）
      "description": "默认共享文件夹"  // 文件夹描述
    }
  ],
  "allowDownload": true,     // 是否允许下载
  "allowUpload": false,      // 是否允许上传（暂未实现）
  "maxFileSize": 104857600   // 最大文件大小（字节），100MB
}
```

### 配置多个分享文件夹示例

```json
{
  "port": 8080,
  "host": "0.0.0.0",
  "sharedFolders": [
    {
      "name": "文档资料",
      "path": "D:\\Documents",
      "description": "工作文档和资料"
    },
    {
      "name": "媒体文件",
      "path": "E:\\Media",
      "description": "图片和视频文件"
    },
    {
      "name": "软件工具",
      "path": "./tools",
      "description": "常用软件和工具"
    }
  ]
}
```

## 项目结构

```
sharepythodev/
├── config.json          # 配置文件
├── server.js            # 服务器主程序
├── package.json         # 项目依赖配置
├── start.bat            # Windows 启动脚本
├── public/
│   └── index.html       # 前端页面
└── shared/              # 默认分享文件夹
```

## API 接口

### 获取文件夹列表
```
GET /api/folders
```

### 获取文件列表
```
GET /api/files?folderIndex=0&path=/子文件夹
```

### 下载文件

**传统 API 方式：**
```
GET /api/download?folderIndex=0&path=/文件.txt
```

**短链接方式（推荐）：**
```
GET /d/0/文件.txt
GET /d/0/文件夹/子文件夹/文件.txt
```

短链接更简洁，适合分享和复制。路径会自动处理 URL 编码，支持中文和空格。

### 预览文件

**传统 API 方式：**
```
GET /api/preview?folderIndex=0&path=/图片.jpg
```

**短链接方式（推荐）：**
```
GET /p/0/图片.jpg
GET /p/0/文件夹/图片.jpg
```

## 安全说明

1. 服务器会验证文件路径，防止目录穿越攻击
2. 建议不要分享系统敏感文件夹
3. 可以在配置文件中设置 `allowDownload: false` 禁用下载功能
4. 建议设置合理的 `maxFileSize` 防止大文件下载

## 技术栈

- **后端**: Node.js + Express
- **前端**: 原生 HTML/CSS/JavaScript
- **文件类型识别**: mime-types

## 系统要求

- Node.js 20.0 或更高版本
- Windows 10 或更高版本

## 常见问题

### Q: 如何修改端口？
A: 编辑 `config.json` 文件，修改 `port` 字段即可。

### Q: 为什么局域网其他设备无法访问？
A: 检查防火墙设置，确保对应端口已开放。

### Q: 如何分享其他文件夹？
A: 编辑 `config.json` 文件，在 `sharedFolders` 数组中添加新的文件夹配置。

### Q: 支持文件上传吗？
A: 当前版本仅支持下载，上传功能 planned 中。

## License

MIT
