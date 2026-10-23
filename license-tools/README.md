# 离线激活协议

应用使用两套 RSA-3072 密钥：

- `activation-private.pem`：购买系统签发激活码，应用仅打包对应公钥。
- `device-private.pem`：购买系统解密购买链接里的设备参数，应用仅打包对应公钥。

私钥位于 `license-tools/keys`，已通过 `.gitignore` 排除。生产部署时应移出开发机器，使用密钥管理服务或仅对购买服务进程开放读取权限。

## 本地工具

```powershell
node scripts/offline-license.cjs decrypt-device --value <购买链接中的device参数>
node scripts/offline-license.cjs issue --device <设备号>
node scripts/offline-license.cjs issue --device <设备号> --expires-at 2027-12-31 --license-id <订单号>
```

激活码格式为 `LV1.<Base64URL载荷>.<RSA-PSS-SHA256签名>`。设备号由当前机器标识生成；购买页地址和设备参数名集中配置在 `src/main/offline-license.cjs`。
