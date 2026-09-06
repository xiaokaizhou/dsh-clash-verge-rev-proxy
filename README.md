# dsh-clash-verge-rev-proxy

[![中文](https://img.shields.io/badge/语言-中文-blue)](./README.md) [![English](https://img.shields.io/badge/language-English-lightgrey)](./README.en.md) [![npm](https://img.shields.io/npm/v/dsh-clash-verge-rev-proxy)](https://www.npmjs.com/package/dsh-clash-verge-rev-proxy)

> **DSH 插件：通过本地 Mihomo External Controller 驱动 Clash Verge Rev 的 proxy_* 工具集**

当 Agent 需要查看代理状态、切换节点/模式、测试延迟或走代理访问被墙资源时，一组 `proxy_*` 工具会调用本地 Clash Verge Rev / Clash Meta / Mihomo 内核的 HTTP API 完成操作。

**外部控制器地址与密钥不需要写死在配置里**：在 dsh 的「设置 → 插件 → 插件配置」中编辑即可；保存时会先做一次连通性测试（`GET /version`），通过后才写入，并立即对所有工具生效、无需重启。

---

## 功能特性

- **7 个 `proxy_*` 工具**：状态查询、节点列表、切换节点、切换模式、延迟测试、配置重载、代理 URL 获取
- **UI 托管配置**：controller URL + secret 通过设置卡片编辑，解析顺序 `保存值 > 环境变量 > 行配置 > 默认值`
- **保存即校验**：写入前先对目标控制器发起连通性测试，避免保存错误地址
- **实时生效**：工具每次调用实时读取配置，无需重启 dsh
- **零私人信息入库**：仓库不含任何真实密钥或订阅链接
- **节点名模糊匹配**：切换节点支持子串（含 emoji / 地区标识），自动取最接近项

### 工具一览

| 工具 | 作用 |
|---|---|
| `proxy_status` | 代理模式、监听端口、当前 GLOBAL 节点、流量速率 |
| `proxy_list_nodes` | 列出 Selector/URLTest 分组的可切换节点 |
| `proxy_select_node` | 切换分组到指定节点 |
| `proxy_set_mode` | 切换 `rule` / `global` / `direct` 模式 |
| `proxy_test_latency` | 测节点延迟，或自动挑分组内最优节点 |
| `proxy_update_subscription` | 重载配置（等价于「更新订阅 / 重载配置」） |
| `proxy_urls` | 返回 Agent 应使用的 mixed/HTTP/SOCKS 代理 URL |

### 网络故障触发引导

工具描述中注入了「网络访问失败 / 被墙 / 超时 → 先用 `proxy_status` 诊断，再 `proxy_select_node` / `proxy_set_mode` 修复」的路由引导，方便 Agent 在遇到网络问题时自行处理代理链路。

---

## 安装

```bash
# 进入 DSH web profile
cd ~/.dsh/profiles/web

# 方式一（推荐）：dsh 官方命令（自动写入 bundles 与 cordis.patch.yml）
dsh plugin --profile web add xiaokaizhou/dsh-clash-verge-rev-proxy

# 方式二：pnpm 直装（需手动补一步，见下方说明）
pnpm add xiaokaizhou/dsh-clash-verge-rev-proxy
```

`package.json` 位于 DSH profile 根目录：

- 默认路径：`~/.dsh/profiles/web/package.json`（macOS / Linux）
- Windows：`%USERPROFILE%\.dsh\profiles\web\package.json`
- 自定义路径：`$DSH_HOME/profiles/web/package.json`，可通过环境变量 `DSH_HOME` 覆盖
- 如有多个 profile，对应路径为 `~/.dsh/profiles/<profile-name>/package.json`

方式二手动补全：在上面的 `package.json` 中添加：

```json
"dsh": {
  "profile": {
    "bundles": [
      "dsh-clash-verge-rev-proxy"
    ]
  }
}
```

源码修改后需重启 `dsh web`。

---

## 配置说明

在 **设置 → 插件 → 插件配置** 找到「Clash 代理（Mihomo 控制器）」卡片：

1. **外部控制器地址**：例如 `http://127.0.0.1:9097`（可省略 `http://`，保存时自动补全）；
2. **外部控制器密钥**：Mihomo External Controller 的 secret（Bearer 令牌），留空 = 清除已存值；
3. 点击「**测试并保存**」——先对目标控制器请求 `GET /version`，连通（HTTP 200）才写入。

每次工具调用按以下顺序实时解析（无需重启）：

```
UI 保存的设置  >  环境变量 DSH_PROXY_CONTROLLER / DSH_PROXY_SECRET  >  cordis.patch.yml 行配置  >  默认 http://127.0.0.1:9097
```

## 隐私与安全

- 控制器 **secret 是敏感凭证**：请通过设置 UI 保存（存入本机私有 `settings.yaml`）或环境变量 `DSH_PROXY_SECRET` 提供，**切勿提交到 `cordis.patch.yml`**；
- 插件只与本地 External Controller（默认 `127.0.0.1`）通信，不会上传任何配置或流量数据；
- 仓库已声明并核查：不含真实密钥、订阅链接或访问令牌。

---

## 限制

- 依赖本地已运行的 Mihomo / Clash 内核并开启 External Controller（含 secret）；
- 工具通过 `curl` + `bash` 子进程与控制器通信，需 dsh 运行环境可执行 `curl`；
- 节点切换只对 Selector/URLTest 分组生效。

---

## 开源协议

MIT

## 打赏支持

若这个插件帮到了你，欢迎用下面的二维码请我喝杯咖啡。

<table>
  <tr>
    <td align="center">
      <img src="https://raw.githubusercontent.com/xiaokaizhou/dsh-clash-verge-rev-proxy/main/.github/wechat-pay.jpg" width="180" alt="WeChat Pay"><br>
      <strong>微信支付</strong>
    </td>
    <td align="center">
      <img src="https://raw.githubusercontent.com/xiaokaizhou/dsh-clash-verge-rev-proxy/main/.github/alipay.jpg" width="180" alt="Alipay"><br>
      <strong>支付宝</strong>
    </td>
  </tr>
</table>
