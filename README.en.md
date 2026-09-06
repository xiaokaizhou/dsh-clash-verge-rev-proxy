# dsh-clash-verge-rev-proxy

[![中文](https://img.shields.io/badge/语言-中文-blue)](./README.md) [![English](https://img.shields.io/badge/language-English-lightgrey)](./README.en.md) [![npm](https://img.shields.io/npm/v/dsh-clash-verge-rev-proxy)](https://www.npmjs.com/package/dsh-clash-verge-rev-proxy)

> **DSH plugin: a set of `proxy_*` tools that drive Clash Verge Rev through the local Mihomo External Controller**

When an Agent needs proxy status, node/mode switching, latency checks, or proxied access to blocked resources, these `proxy_*` tools call the HTTP API of a local Clash Verge Rev / Clash Meta / Mihomo kernel.

**No credentials are hard-coded.** Edit the controller URL and secret from **Settings → Plugins → Plugin configuration** in dsh; saving runs a live connectivity check (`GET /version`) first and only persists on success — effective for every tool immediately, no restart.

---

## Features

- **7 `proxy_*` tools**: status, list nodes, select node, set mode, test latency, reload config, proxy URLs
- **UI-managed configuration**: controller URL + secret edited via the settings card; resolution `saved value > env > row config > default`
- **Test before save**: a connectivity probe runs before the value is persisted, so a bad address is never stored
- **Live config reads**: tools re-resolve configuration on every call — no dsh restart needed
- **No private data in the repo**: no real secrets or subscription links
- **Fuzzy node matching**: substring selection (emoji / region tags included), closest match wins

### Tool overview

| Tool | Purpose |
|---|---|
| `proxy_status` | Mode, listening ports, current GLOBAL node, traffic rates |
| `proxy_list_nodes` | List switchable nodes of Selector/URLTest groups |
| `proxy_select_node` | Switch a group to a given node |
| `proxy_set_mode` | Switch `rule` / `global` / `direct` mode |
| `proxy_test_latency` | Measure node latency, or auto-pick the fastest in a group |
| `proxy_update_subscription` | Reload config (same as “Update subscription / Reload config”) |
| `proxy_urls` | Return the mixed/HTTP/SOCKS proxy URLs an Agent should use |

### Network-failure trigger guidance

Tool descriptions embed routing hints like “network failure / blocked / timeout → diagnose with `proxy_status` first, then fix with `proxy_select_node` / `proxy_set_mode`”, so an Agent can handle proxy-chain issues on its own.

---

## Installation

```bash
# enter the DSH web profile
cd ~/.dsh/profiles/web

# Option 1 (recommended): dsh official command (writes bundles + cordis.patch.yml)
dsh plugin --profile web add xiaokaizhou/dsh-clash-verge-rev-proxy

# Option 2: pnpm (requires the extra step below)
pnpm add xiaokaizhou/dsh-clash-verge-rev-proxy
```

`package.json` lives at the DSH profile root:

- Default: `~/.dsh/profiles/web/package.json` (macOS / Linux)
- Windows: `%USERPROFILE%\.dsh\profiles\web\package.json`
- Custom: `$DSH_HOME/profiles/web/package.json` (override via `DSH_HOME`)
- Multiple profiles: `~/.dsh/profiles/<profile-name>/package.json`

Manual step for Option 2 — add to the `package.json` above:

```json
"dsh": {
  "profile": {
    "bundles": [
      "dsh-clash-verge-rev-proxy"
    ]
  }
}
```

Restart `dsh web` after source changes.

---

## Configuration

Open the “Clash proxy (Mihomo controller)” card under **Settings → Plugins → Plugin configuration**:

1. **External controller URL**: e.g. `http://127.0.0.1:9097` (`http://` may be omitted; it is added on save);
2. **Controller secret**: the Mihomo External Controller secret (Bearer token); leave empty to clear the stored value;
3. Press “**Test & save**” — it first requests `GET /version` from the controller and only persists on HTTP 200.

Every tool call resolves configuration live in this order (no restart):

```
saved settings  >  env DSH_PROXY_CONTROLLER / DSH_PROXY_SECRET  >  cordis.patch.yml row config  >  http://127.0.0.1:9097
```

## Privacy & security

- The controller **secret is a credential**: provide it via the Settings UI (stored in your private `settings.yaml`) or the `DSH_PROXY_SECRET` environment variable — **never commit it to `cordis.patch.yml`**;
- The plugin only talks to your local External Controller (`127.0.0.1` by default) and uploads no configuration or traffic data;
- The repository is verified free of real secrets, subscription links and access tokens.

---

## Limitations

- Requires a running local Mihomo / Clash kernel with the External Controller (and secret) enabled;
- Tools talk to the controller via `curl` subprocesses, so `curl` must be available to dsh;
- Node switching applies to Selector/URLTest groups only.

---

## License

MIT

## Sponsorship

If this plugin saves you time, you can buy me a coffee with one of the following QR codes.

<table>
  <tr>
    <td align="center">
      <img src="https://raw.githubusercontent.com/xiaokaizhou/dsh-clash-verge-rev-proxy/main/.github/wechat-pay.jpg" width="180" alt="WeChat Pay"><br>
      <strong>WeChat Pay</strong>
    </td>
    <td align="center">
      <img src="https://raw.githubusercontent.com/xiaokaizhou/dsh-clash-verge-rev-proxy/main/.github/alipay.jpg" width="180" alt="Alipay"><br>
      <strong>Alipay</strong>
    </td>
  </tr>
</table>
