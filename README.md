# Linux Visual

Linux Visual 是一款面向 Linux 服务器运维的桌面可视化管理工具，基于 Electron + Vue 3 构建。

目标是把日常高频的服务器操作从命令行搬到可视化界面：连接服务器、传文件、改 Nginx、看日志、管容器、连数据库，不需要反复记命令。

- 官网：https://qdwh.site
- 源码（GitHub）：https://github.com/qdwhhc/linux-visual
- 源码（Gitee）：https://gitee.com/wenhe-huichuang/linux-visual

## 功能

- **连接账号**：保存和管理服务器连接配置，支持密码与私钥认证
- **命令终端**：内置 xterm 终端，直接执行 Linux 命令
- **文件管理**：本地与服务器双栏，支持上传、下载、编辑、预览、复制粘贴
- **对象存储**：管理腾讯云 COS、阿里云 OSS、华为云 OBS、兼容 S3 的存储
- **内置浏览器**：页签、地址栏和书签栏
- **系统账户**：管理 Linux 系统用户和权限
- **服务管理**：可视化管理常用系统服务
- **防火墙**：管理 ufw / firewalld 规则
- **端口管理**：查看监听端口、Docker 映射
- **数据库管理**：连接 MySQL / MariaDB 并执行 SQL（可选功能）
- **Nginx 管理**：管理站点配置和 SSL 证书
- **PM2 管理**：管理 PM2 进程
- **Docker 容器**：可视化管理容器状态
- **日志中心**：查看应用日志和系统日志
- **应用授权**：本地激活码校验

## 信任与联网说明

我们开源这个客户端，是为了让任何人都能审查它到底做了什么。

**客户端不会向我们自己的服务器上传任何数据。** 应用运行时的对外连接只有以下几类，且都由你主动发起：

1. SSH / SFTP → 你填写的服务器
2. MySQL → 你填写的数据库
3. 对象存储 → 你配置的存储地址
4. 内置浏览器 → 你访问的网站
5. 点击“获取授权”时，用系统浏览器打开官网链接

详细清单见 [`docs/network.md`](docs/network.md)。

客户端**不包含**任何遥测、埋点、统计上报或后台心跳。

## 本地数据

应用自身的数据保存在本机，使用内置的 WASM 版 SQLite（`sql.js`），文件为：

```text
<用户数据目录>/app-data.sqlite
```

存储内容包括连接配置、偏好设置、快照和激活状态。**应用运行不需要你安装任何数据库。**

“数据库管理”是可选的独立功能：只有当你主动连接某个 MySQL / MariaDB 服务器时，才会用到对应驱动；不使用该功能就完全不涉及数据库。

## 运行环境

- Node.js 18 或更高版本
- Windows 10 或更高版本（当前官方构建目标）
- 你需要管理的 Linux 服务器

## 本地开发

```bash
npm install
npm run dev
```

默认开发端口范围为 `35040-35049`，`npm run dev` 会自动选择空闲端口，配置见 `scripts/dev.config.cjs`。

## 构建

```bash
npm run build            # 只构建渲染层
npm run dist             # 构建并打包 Windows NSIS 安装包
```

## 目录结构

```text
src/main/        Electron 主进程
  main.cjs       主进程逻辑（SSH、文件、数据库、Nginx 等）
  preload.cjs    上下文桥接
  offline-license.cjs  本地激活码校验
  schema/        本地 SQLite 表结构
  license-keys/  激活校验公钥
src/renderer/    Vue 3 渲染层
scripts/         开发与构建脚本
build/           打包资源（图标等）
docs/            文档
```

## 授权机制

应用采用**离线激活码**校验：

- 授权签发在独立的私有系统中完成
- 客户端只内置**公钥**，用于本地校验激活码签名
- 客户端不持有签发私钥，无法自行生成有效激活码
- 校验在本地完成，不联网

因此公开客户端源码不会导致授权被绕过。

## 安全说明

- 服务器密码和私钥使用系统凭据加密后保存在本机
- 应用不上传任何凭据
- 发现安全问题请见 [`SECURITY.md`](SECURITY.md)

## 已知事项

- 已升级 Electron 与 Electron Builder，修复了此前的高危和严重依赖公告。
- 仍有两项依赖公告待处理：
  - `vite` / `esbuild`（构建期，影响低）
  - `monaco-editor` / `dompurify`（编辑器运行时）
  修复这两项需要跨主版本迁移（Vite 8 改用 Rolldown，monaco 0.57 调整了 worker 路径和中文语言包加载方式），属于单独的迁移任务。
- 打包 Windows NSIS 安装包时，Electron Builder 需要从 GitHub 下载资源；网络受限时可能失败。

## 相关链接

- 官网：https://qdwh.site
- GitHub：https://github.com/qdwhhc/linux-visual
- Gitee：https://gitee.com/wenhe-huichuang/linux-visual

## 许可证

本项目使用 [GNU General Public License v3.0](LICENSE)。

## 免责声明

本工具会以你提供的凭据连接并操作远程服务器。请在授权范围内使用，并对你的操作负责。

Linux Visual 与各 Linux 发行版、腾讯云、阿里云、华为云等厂商无隶属关系。
