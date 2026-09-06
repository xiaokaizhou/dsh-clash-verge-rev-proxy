/**
 * dsh-clash-verge-rev-proxy — host half (Node).
 *
 * Registers a set of `proxy_*` tools that drive a Mihomo External Controller
 * (Clash Verge Rev, Clash Meta, or a bare Mihomo kernel) over its HTTP API.
 * The row lives on the host composition, so every preset inherits the tools.
 *
 * Configuration is read live from a dsh settings namespace
 * (`clash-verge-rev-proxy`), so the user can edit controller URL and secret
 * from dsh Settings → Plugins → Plugin configuration without restarting.
 * Resolution order per tool call:
 *   1. The saved settings namespace value (user layer, set from the UI).
 *   2. Environment variables `DSH_PROXY_CONTROLLER` / `DSH_PROXY_SECRET`.
 *   3. The `config: { controller, secret }` block on this row in
 *      `cordis.patch.yml` — convenient as a deployment-time fallback.
 *   4. Defaults: controller `http://127.0.0.1:9097`, no secret.
 *
 * Missing or malformed config is surfaced through every tool's `error`
 * field rather than crashing the host composition — a half-configured
 * instance must not break other presets.
 *
 * Runtime contract for every tool:
 *   - returns a plain JSON object (no Date/Map/Set/function/undefined),
 *   - swallows HTTP / JSON errors into `{ ok: false, error }`,
 *   - caps stdout / stderr at 1 MiB per stream with a 4 MiB spill file.
 */

import { defineTool } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";

export const name = "dsh-clash-verge-rev-proxy";
export const inject = ["tools", "subprocess", "settings"];

// Single live source of truth that the settings section mutates and the
// tools read on every call. Initialized in `apply()` so the file is
// evaluated only once per process even across multiple bundle imports.
var liveConfig = null;

const SETTINGS_NAMESPACE = "clash-verge-rev-proxy";
const SETTINGS_SCHEMA = z.object({
  controller: z.string().default(""),
  secret: z.string().default(""),
});

const DEFAULT_CONTROLLER = "http://127.0.0.1:9097";
const DEFAULT_TIMEOUT_MS = 10_000;

// Parameter schema for tools that accept no inputs (root object, no fields).
const NO_PARAMS = {};

// Output schema: every tool returns a plain JSON object; we declare it as
// `additionalProperties: true` so dsh-tools accepts arbitrary keys without
// requiring a closed property map.
const OUTPUT_SCHEMA = { type: "object", additionalProperties: true };

/**
 * Resolve controller URL and secret from the live settings section first,
 * then environment variables, then the row's bundle config, then defaults.
 */
function resolveConfig(bundleConfig) {
  const live = liveConfig || {};
  const envController = typeof process.env.DSH_PROXY_CONTROLLER === "string"
    ? process.env.DSH_PROXY_CONTROLLER.trim()
    : "";
  const envSecret = typeof process.env.DSH_PROXY_SECRET === "string"
    ? process.env.DSH_PROXY_SECRET
    : "";
  const cfgController = bundleConfig && typeof bundleConfig.controller === "string"
    ? bundleConfig.controller.trim()
    : "";
  const cfgSecret = bundleConfig && typeof bundleConfig.secret === "string"
    ? bundleConfig.secret
    : "";
  const controller = (
    (typeof live.controller === "string" && live.controller.trim()) ||
    envController ||
    cfgController ||
    DEFAULT_CONTROLLER
  ).replace(/\/+$/, "");
  const secret = (
    (typeof live.secret === "string" && live.secret) ||
    envSecret ||
    cfgSecret ||
    ""
  );
  return { controller, secret, hasSecret: secret.length > 0 };
}

/**
 * Resolve the configuration that WOULD be in effect after the settings card
 * saves `overrides`. Unlike {@link resolveConfig} (which starts from the
 * currently stored live section), a field the card sends as empty string
 * means "clear the stored value", so it must fall through to env / row
 * config / default — never to the value that is about to be deleted.
 * @param overrides - draft controller / secret from the card (may be "").
 * @param bundleConfig - row config (cordis.patch.yml), as passed to apply.
 */
function resolveDraftConfig(overrides, bundleConfig) {
  const envController = typeof process.env.DSH_PROXY_CONTROLLER === "string"
    ? process.env.DSH_PROXY_CONTROLLER.trim()
    : "";
  const envSecret = typeof process.env.DSH_PROXY_SECRET === "string"
    ? process.env.DSH_PROXY_SECRET
    : "";
  const cfgController = bundleConfig && typeof bundleConfig.controller === "string"
    ? bundleConfig.controller.trim()
    : "";
  const cfgSecret = bundleConfig && typeof bundleConfig.secret === "string"
    ? bundleConfig.secret
    : "";
  const wantController = overrides && typeof overrides.controller === "string"
    ? overrides.controller.trim()
    : "";
  const wantSecret = overrides && typeof overrides.secret === "string"
    ? overrides.secret
    : "";
  const controller = (
    wantController ||
    envController ||
    cfgController ||
    DEFAULT_CONTROLLER
  ).replace(/\/+$/, "");
  const secret = wantSecret || envSecret || cfgSecret || "";
  return { controller, secret, hasSecret: secret.length > 0 };
}

/**
 * Build a single-line shell command that calls curl against the controller.
 * Both controller and secret are interpolated from `cfg`; we keep the
 * interpolated string out of any persistent log path by routing it through
 * the cordis-managed subprocess service (which itself scrubs sensitive env
 * entries before they reach a child).
 */
function mcurl(cfg, method, path, body) {
  const authHeader = cfg.hasSecret ? `Authorization: Bearer ${cfg.secret}` : "Authorization: ";
  const url = `${cfg.controller}${path}`;
  let cmd = `curl -sS --max-time 10 -X ${method} -H '${authHeader}' -H 'Content-Type: application/json' '${url}'`;
  if (body !== undefined) {
    const json = JSON.stringify(body).replace(/'/g, "'\\''");
    cmd += ` -d '${json}'`;
  }
  return cmd;
}

function textBlock(value) {
  return [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }];
}

function makeCollect() {
  return { maxBytes: 1 << 20, spill: { maxBytes: 4 << 20 } };
}

function readReader(reader) {
  try {
    if (!reader || typeof reader.readFrom !== "function") return "";
    const read = reader.readFrom(0);
    return read && typeof read.text === "string" ? read.text : "";
  } catch {
    return "";
  }
}

function safeString(value) {
  return value === undefined || value === null ? "" : String(value);
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function trim(value, max) {
  return value && value.length > max ? value.slice(0, max) + "...(truncated)" : (value || "");
}

export function apply(ctx, config = {}) {
  const subprocess = ctx.subprocess;
  // Fallback live values while no settings service is mounted (headless /
  // minimal hosts): resolveConfig() still lets env vars and the row's bundle
  // `config` (cordis.patch.yml) win over these empty strings.
  const initialEntry = {
    controller: typeof config.controller === "string" ? config.controller : "",
    secret: typeof config.secret === "string" ? config.secret : "",
  };
  liveConfig = { ...initialEntry };

  function runCommand(cmd) {
    return new Promise((resolve) => {
      const spec = {
        argv: ["/bin/bash", "-c", cmd],
        cwd: "/",
        stdio: { stdin: "ignore", stdout: makeCollect(), stderr: makeCollect() },
        graceMs: 3000,
      };
      try {
        const handle = subprocess.spawn(spec);
        if (!handle || !handle.done || typeof handle.done.then !== "function") {
          resolve({ error: "subprocess handle missing done promise" });
          return;
        }
        handle.done.then((outcome) => {
          const stdout = readReader(handle.collected && handle.collected.stdout);
          const stderr = readReader(handle.collected && handle.collected.stderr);
          resolve({
            stdout,
            stderr,
            exitCode: outcome && typeof outcome.exitCode === "number" ? outcome.exitCode : -1,
            signal: safeString(outcome && outcome.signal),
          });
        }).catch((err) => resolve({ error: String((err && err.message) || err) }));
      } catch (err) {
        resolve({ error: String((err && err.message) || err) });
      }
    });
  }

  async function run(method, path, body) {
    const cfg = resolveConfig(config);
    if (!cfg.hasSecret) {
      return { ok: false, error: "未配置 Mihomo External Controller 密钥(secret)。请在 dsh 设置 → 插件 → 插件配置 中填写,或设置环境变量 DSH_PROXY_SECRET。" };
    }
    const r = await runCommand(mcurl(cfg, method, path, body));
    if (r.error) return { ok: false, error: String(r.error) };
    if (r.exitCode !== 0) return { ok: false, error: trim(r.stderr || r.stdout, 500) };
    return { ok: true, stdout: r.stdout };
  }

  const disposers = [];

  function register(def) {
    disposers.push(ctx.tools.register(def));
  }

  register(defineTool({
    name: "proxy_status",
    description: "获取 Clash Verge Rev 的当前状态：代理模式、监听端口、当前 GLOBAL 选中节点、上行/下行流量速率。当任何网络访问失败/超时/被墙、或怀疑本地代理链路有问题时，先调用本工具诊断（代理是否开启、模式与当前节点是否合理），再决定是否切换节点或模式。",
    parameters: NO_PARAMS,
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => textBlock(value) },
    timeoutMs: DEFAULT_TIMEOUT_MS * 4,
    async execute() {
      const cfg = resolveConfig(config);
      const r1 = await run("GET", "/configs");
      if (!r1.ok) return r1;
      let cfgJson;
      try { cfgJson = JSON.parse(r1.stdout); } catch { return { ok: false, error: "configs 响应不是合法 JSON" }; }

      // Sequential rather than Promise.all — each call is a bash subprocess
      // (with collect-mode output buffers) and concurrent dispatch can exceed
      // the tool-level deadline when the controller is busy.
      const traffic = await run("GET", "/traffic");
      const proxies = await run("GET", "/proxies");

      let selected = "";
      let globalCount = 0;
      if (proxies.ok) {
        try {
          const pj = JSON.parse(proxies.stdout);
          const g = pj && pj.proxies && pj.proxies.GLOBAL;
          if (g) {
            selected = safeString(g.now);
            globalCount = Array.isArray(g.all) ? g.all.length : 0;
          }
        } catch { /* ignore */ }
      }
      let up = 0, down = 0;
      if (traffic.ok) {
        try {
          const t = JSON.parse(traffic.stdout);
          up = safeNumber(t && t.up);
          down = safeNumber(t && t.down);
        } catch { /* ignore */ }
      }
      return {
        ok: true,
        controller: safeString(cfgJson && cfgJson["external-controller"]) || cfg.controller,
        mode: safeString(cfgJson && cfgJson.mode),
        ports: {
          http: safeNumber(cfgJson && cfgJson.port),
          socks: safeNumber(cfgJson && cfgJson["socks-port"]),
          mixed: safeNumber(cfgJson && cfgJson["mixed-port"]),
          redir: safeNumber(cfgJson && cfgJson["redir-port"]),
        },
        selected_node: selected,
        node_count_in_global: globalCount,
        traffic_Bps: { up, down },
      };
    },
  }));

  register(defineTool({
    name: "proxy_list_nodes",
    description: "当网络访问失败/被墙/超时、准备更换节点之前，列出 Mihomo 中所有 Selector/URLTest 分组的可切换节点（按分组返回，可选 group 参数过滤单个分组）。name 含 emoji 和地区标识，结果可用作 proxy_select_node 的 node 子串匹配。",
    parameters: {
      group: { type: "string", description: "可选：只列某个分组（不填则返回所有 Selector/URLTest 分组）" },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => textBlock(value) },
    timeoutMs: DEFAULT_TIMEOUT_MS,
    async execute(args) {
      const r = await run("GET", "/proxies");
      if (!r.ok) return r;
      let pj;
      try { pj = JSON.parse(r.stdout); } catch { return { ok: false, error: "proxies 响应不是合法 JSON" }; }
      const out = {};
      const proxies = pj.proxies || {};
      for (const name of Object.keys(proxies)) {
        const info = proxies[name];
        if (!info || (info.type !== "Selector" && info.type !== "URLTest")) continue;
        if (args && args.group && name !== args.group) continue;
        out[name] = {
          type: safeString(info.type),
          current: safeString(info.now),
          all: Array.isArray(info.all) ? info.all : [],
        };
      }
      return { ok: true, groups: out };
    },
  }));

  register(defineTool({
    name: "proxy_select_node",
    description: "切换某个代理分组到指定节点，用于修复网络问题（被墙/超时/慢）。group 必填（如 \"GLOBAL\" 或某个 Selector 名）；node 必填，可以是节点名子串（不区分大小写、保留 emoji），如 \"日本01\"、\"香港\"、\"AWS\"。匹配到多个时按子串长度选最接近的，并返回全部候选。切换成功后应重试此前失败的请求。",
    parameters: {
      group: { type: "string", required: true, description: "代理分组名（通常是 GLOBAL，也可指定某个 Selector 分组）" },
      node: { type: "string", required: true, description: "节点名或子串（如 \"日本01\"、\"香港\"、\"AWS日本03\"）" },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => textBlock(value) },
    timeoutMs: DEFAULT_TIMEOUT_MS,
    async execute(args) {
      const r = await run("GET", "/proxies");
      if (!r.ok) return r;
      let pj;
      try { pj = JSON.parse(r.stdout); } catch { return { ok: false, error: "proxies 响应不是合法 JSON" }; }
      const g = pj.proxies && pj.proxies[args.group];
      if (!g) {
        const avail = Object.entries(pj.proxies || {})
          .filter(([, v]) => v && (v.type === "Selector" || v.type === "URLTest"))
          .map(([k]) => k);
        return { ok: false, error: `group 不存在: ${args.group}`, available_groups: avail };
      }
      if (g.type !== "Selector" && g.type !== "URLTest") {
        return { ok: false, error: `该分组不是 Selector/URLTest 类型: ${args.group}` };
      }
      const all = Array.isArray(g.all) ? g.all : [];
      const needle = String(args.node).toLowerCase().trim();
      const matches = all.filter((n) => String(n).toLowerCase().includes(needle));
      if (matches.length === 0) {
        return { ok: false, error: `未找到节点 ${args.node}`, candidates: all.slice(0, 30) };
      }
      let chosen;
      if (matches.length === 1) {
        chosen = matches[0];
      } else {
        const sorted = matches.slice().sort(
          (a, b) => Math.abs(a.length - needle.length) - Math.abs(b.length - needle.length)
        );
        chosen = sorted[0];
      }
      const sr = await run("PUT", `/proxies/${encodeURIComponent(args.group)}`, { name: chosen });
      if (!sr.ok) return sr;
      return {
        ok: true,
        group: args.group,
        from: safeString(g.now),
        to: safeString(chosen),
        matched: matches.length,
        ambiguous: matches,
      };
    },
  }));

  register(defineTool({
    name: "proxy_set_mode",
    description: "切换 Mihomo 代理模式。mode ∈ {rule, global, direct}。rule=按规则分流；global=全部走代理；direct=直连。当目标站点按当前模式仍无法访问（例如规则漏配导致直连失败、或需强制全部走代理）时，切换模式后重试。",
    parameters: {
      mode: {
        type: "string",
        required: true,
        enum: ["rule", "global", "direct"],
        description: "目标模式",
      },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => textBlock(value) },
    timeoutMs: DEFAULT_TIMEOUT_MS,
    async execute(args) {
      const r = await run("PATCH", "/configs", { mode: args.mode });
      if (!r.ok) return r;
      return { ok: true, mode: args.mode };
    },
  }));

  register(defineTool({
    name: "proxy_test_latency",
    description: "测试节点延迟。group 必填；node 可选（不填测整个分组并自动选最优）。返回毫秒延迟，负数代表超时/失败。当网络变慢、当前节点不可用或需要挑最快节点时调用。",
    parameters: {
      group: { type: "string", required: true, description: "代理分组名" },
      node: { type: "string", description: "可选：测指定节点" },
      timeout_ms: { type: "number", description: "可选：超时毫秒（默认 5000）" },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => textBlock(value) },
    timeoutMs: DEFAULT_TIMEOUT_MS + 5000,
    async execute(args) {
      const tmo = safeNumber(args.timeout_ms) || 5000;
      const url = args.node
        ? `/proxies/${encodeURIComponent(args.group)}/delay?url=http%3A%2F%2Fwww.gstatic.com%2Fgenerate_204&timeout=${tmo}`
        : `/group/${encodeURIComponent(args.group)}/delay?url=http%3A%2F%2Fwww.gstatic.com%2Fgenerate_204&timeout=${tmo}`;
      const r = await run("GET", url);
      if (!r.ok) return r;
      let parsed;
      try { parsed = JSON.parse(r.stdout); } catch { parsed = { raw: r.stdout }; }
      return { ok: true, group: args.group, node: args.node || null, delay_ms: parsed };
    },
  }));

  register(defineTool({
    name: "proxy_update_subscription",
    description: "触发 Mihomo 重新加载当前配置（等价于在 Verge UI 点 \"更新订阅 / 重载配置\"）。当节点列表过期、节点大量不可用、或刚在别处更新了订阅需要刷新时调用。",
    parameters: NO_PARAMS,
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => textBlock(value) },
    timeoutMs: DEFAULT_TIMEOUT_MS,
    async execute() {
      const r = await run("PUT", "/configs?force=true");
      if (!r.ok) return r;
      return { ok: true, note: "已触发配置重载；返回空字符串是正常的" };
    },
  }));

  register(defineTool({
    name: "proxy_urls",
    description: "返回 Agent 该用的代理 URL：mixed/HTTP/SOCKS 端口及对应代理 URL。当 Agent 需要访问被直连封锁/墙外的资源、或被告知走代理请求时，先用本工具拿端口，再 curl -x socks5h://127.0.0.1:<port> <url>。",
    parameters: NO_PARAMS,
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => textBlock(value) },
    timeoutMs: DEFAULT_TIMEOUT_MS,
    async execute() {
      const r = await run("GET", "/configs");
      if (!r.ok) return r;
      let c;
      try { c = JSON.parse(r.stdout); } catch { return { ok: false, error: "configs 响应不是合法 JSON" }; }
      const mixed = safeNumber(c["mixed-port"]);
      const socks = safeNumber(c["socks-port"]);
      const http = safeNumber(c.port);
      return {
        ok: true,
        mixed_port: mixed,
        socks_port: socks,
        http_port: http,
        proxy_url: mixed ? `http://127.0.0.1:${mixed}` : "",
        socks_url: socks ? `socks5h://127.0.0.1:${socks}` : "",
        hint: `bash 工具目前不支持自定义 env。如果想走代理，请用 curl -x socks5h://127.0.0.1:${socks || mixed || 7897} <url>`,
      };
    },
  }));

  ctx.effect(() => () => {
    for (const dispose of disposers) {
      try { dispose(); } catch { /* ignore */ }
    }
  });

  // ── 连通性测试端点（设置卡「测试并保存」调用）──────────────────────────
  // POST { controller?, secret? } → curl 该 External Controller 的 /version。
  // 空字段表示"保存后将清除该项"，由 resolveDraftConfig 落到 env / 行配置 /
  // 默认，与保存后的实际生效值一致。端点本身不修改任何设置。
  async function pingController(overrides) {
    const cfg = resolveDraftConfig(overrides, config);
    if (!cfg.hasSecret) {
      return { ok: false, httpCode: 0, controller: cfg.controller, error: "未配置密钥(secret)：留空保存后需由 DSH_PROXY_SECRET 或部署配置提供" };
    }
    const url = `${cfg.controller}/version`;
    const authHeader = `Authorization: Bearer ${cfg.secret}`;
    const cmd = `curl -sS --max-time 5 -o /dev/null -w '%{http_code}' -X GET -H '${authHeader}' '${url}'`;
    const r = await runCommand(cmd);
    if (r.error) return { ok: false, httpCode: 0, controller: cfg.controller, error: String(r.error) };
    const codeText = (r.stdout || "").trim();
    const code = Number.parseInt(codeText, 10);
    if (code === 200) return { ok: true, httpCode: 200, controller: cfg.controller };
    if (code === 401) {
      return { ok: false, httpCode: 401, controller: cfg.controller, error: "控制器拒绝访问(HTTP 401)：secret 不正确或未授权" };
    }
    if (Number.isNaN(code) || code === 0) {
      return { ok: false, httpCode: 0, controller: cfg.controller, error: `无法连接控制器 ${cfg.controller}${codeText ? `（curl 输出: ${codeText}）` : ""}` };
    }
    return { ok: false, httpCode: code, controller: cfg.controller, error: `控制器返回 HTTP ${code}` };
  }

  const webServer = ctx.get("webServer");
  if (webServer && typeof webServer.register === "function") {
    webServer.register({
      kind: "exact",
      path: "/api/clash-verge-rev-proxy/ping",
      handler: async (req, res) => {
        let raw = "";
        try {
          for await (const chunk of req) raw += chunk;
        } catch { /* body read failure → treat as empty */ }
        let body = {};
        try { body = raw.trim() ? JSON.parse(raw) : {}; } catch { /* malformed body */ }
        const out = await pingController(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(out));
      },
    });
    console.log(`[dsh-clash-verge-rev-proxy] registered /api/clash-verge-rev-proxy/ping`);
  }

  // Live settings namespace: the browser half binds the same namespace
  // (`clash-verge-rev-proxy`) through `settingsScope` and writes user values
  // here; the tools read `liveConfig` on every call, so a save from the
  // Settings UI takes effect immediately, no restart needed.
  const settings = ctx.settings;
  if (settings && typeof settings.register === "function") {
    const scope = settings.register(SETTINGS_NAMESPACE, SETTINGS_SCHEMA, {
      validate: (value) => {
        const raw = value && value.controller;
        if (typeof raw === "string" && raw.trim() !== "") {
          try {
            const url = new URL(raw);
            if (url.protocol !== "http:" && url.protocol !== "https:") {
              throw new Error("protocol must be http(s)");
            }
          } catch {
            throw new Error(`controller 不是合法 http(s) URL: ${raw}`);
          }
        }
      },
    });
    const read = () => {
      const resolved = scope.get();
      liveConfig = { ...resolved };
    };
    read();
    scope.watch(() => read());
    console.log(`[dsh-clash-verge-rev-proxy] registered settings namespace "${SETTINGS_NAMESPACE}"`);
  } else {
    // No settings service (headless / minimal hosts): stay on the initial
    // values — bundle config still flows through resolveConfig().
    liveConfig = { ...initialEntry };
  }

  console.log(`[dsh-clash-verge-rev-proxy] registered ${disposers.length} tools`);
}