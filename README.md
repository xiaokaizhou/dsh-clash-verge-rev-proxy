# dsh-clash-verge-rev-proxy

[English](#english) · 中文

DSH (DeepSeek Harness) plugin — 注册一组 `proxy_*` 工具，通过本地 Mihomo 的 **External Controller** HTTP API 驱动 Clash Verge Rev / Clash Meta / Mihomo 内核（查看状态、切换节点、切换模式、测延迟、重载配置、获取代理 URL）。

配置不需要写死在代码里：在 dsh 的 **设置 → 插件 → 插件配置** 中编辑「外部控制器地址」与「密钥」，保存时会先做一次连通性测试（`GET /version`），通过后才写入、且立即对所有工具生效。

## 功能

| 工具 | 作用 |
|---|---|
| `proxy_status` | 代理模式、监听端口、当前 GLOBAL 节点、流量速率 |
| `proxy_list_nodes` | 列出 Selector/URLTest 分组的可选节点 |
| `proxy_select_node` | 切换分组到指定节点（支持名称子串，含 emoji/地区名） |
| `proxy_set_mode` | 切换 `rule` / `global` / `direct` 模式 |
| `proxy_test_latency` | 测节点延迟，或自动挑分组内最优节点 |
| `proxy_update_subscription` | 重载配置（等价于 Verge UI 的「更新订阅/重载配置」） |
| `proxy_urls` | 返回 Agent 应使用的 mixed/HTTP/SOCKS 代理 URL |

工具描述中注入了「网络访问失败 / 被墙 / 超时 → 先用 `proxy_status` 诊断、再 `proxy_select_node` / `proxy_set_mode` 修复」的引导，便于 Agent 在遇到网络问题时自行处理代理链路。

## 安装

1. 将本仓库放入 DSH 插件目录（例如 `~/.dsh/plugins/dsh-clash-verge-rev-proxy`，可软链指向 clone 位置），并确保 `dsh-clash-verge-rev-proxy` 出现在目标 profile 的 `package.json#dsh.profile.bundles`（或本地 `cordis.patch.yml` 的 bundles 声明）中；
2. 重启 dsh。

> 插件结构：host 半侧 `lib/index.js`（工具 + settings 命名空间 + 连通性测试端点），浏览器半侧 `lib/client.js`（插件配置卡片），两者通过 `cordis.patch.yml` 行与 `package.json#dsh.client` 声明装配。浏览器半侧按 DSH 客户端模块系统的 lazy-CJS factory 格式构建，无需额外编译即可直接加载。

## 配置

配置解析顺序（每次工具调用实时生效，无需重启）：

```
UI 保存的设置  >  环境变量 DSH_PROXY_CONTROLLER / DSH_PROXY_SECRET  >  cordis.patch.yml 行配置  >  默认 http://127.0.0.1:9097
```

## 隐私与安全

- 控制器 **secret 是敏感凭证**：仓库中不含任何真实密钥或订阅链接。请通过 设置 UI（存入你本机私有的 `settings.yaml`）或环境变量 `DSH_PROXY_SECRET` 提供，不要提交到 `cordis.patch.yml`。
- 本插件只与本地 External Controller（默认 `127.0.0.1`）通信，不会上传任何配置或流量数据。

---

## English

DSH (DeepSeek Harness) plugin that registers a set of `proxy_*` tools to drive a local Mihomo **External Controller** (Clash Verge Rev / Clash Meta / bare Mihomo) over its HTTP API: status, node switching, mode switching, latency tests, config reload and proxy URL lookup.

No credentials are hard-coded. Edit the controller URL and secret from **Settings → Plugins → Plugin configuration** in dsh; saving runs a live connectivity check (`GET /version`) first and only persists on success.

### Config resolution (per tool call, no restart)

```
saved settings  >  env DSH_PROXY_CONTROLLER / DSH_PROXY_SECRET  >  cordis.patch.yml row config  >  http://127.0.0.1:9097
```

### Privacy

The controller secret is a credential. This repository contains **no real secrets or subscription links** — provide the secret via the Settings UI (stored in your private `settings.yaml`) or the `DSH_PROXY_SECRET` environment variable, never in `cordis.patch.yml`. The plugin only talks to your local controller (`127.0.0.1` by default).
