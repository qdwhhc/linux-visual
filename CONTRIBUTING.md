# 参与贡献

感谢你愿意为 Linux Visual 做出贡献。

## 开始之前

```bash
npm install
npm run dev
```

## 提交前请确认

- 代码可以正常构建：`npm run build`
- 没有提交任何密钥、凭据或本地配置
- 没有提交 `node_modules`、`dist`、`release`、`runtime-logs`
- 修改尽量聚焦，一次提交解决一个问题

## 代码约定

- 主进程代码位于 `src/main/`，渲染层代码位于 `src/renderer/`
- 渲染层使用 Vue 3 组合式 API
- 保持与现有代码一致的风格和命名
- 不要引入与现有功能重复的依赖

## 提交信息

请用简短、明确的说明描述改动，例如：

```text
fix: 修复远程文件重名粘贴时的覆盖判断
feat: 新增端口占用进程查看
docs: 补充联网行为说明
```

## 安全要求

- 不要在任何文件中硬编码密钥、密码或私有地址
- 新增网络请求时，必须在 `docs/network.md` 中补充说明
- 不要弱化凭据加密和授权校验逻辑

## 报告问题

- 功能建议和普通缺陷：提交 Issue
- 安全问题：见 [SECURITY.md](SECURITY.md)，请勿公开提交
