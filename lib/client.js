window.__ModuleLoader__.load({
	id: "dsh-clash-verge-rev-proxy",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		// ── Browser half of dsh-clash-verge-rev-proxy ─────────────────────────
		//
		// Registers one "card" under the Plugins settings section
		// (`settings.plugin.item`, keyed by the settings namespace the host half
		// registers: `clash-verge-rev-proxy`). From dsh → Settings → Plugins →
		// "Plugin configuration" the user can edit the Mihomo External Controller
		// URL and its secret; every save lands in the `clash-verge-rev-proxy`
		// settings document, which the host tools read live on every call.
		//
		// Follows the same shape as dsh-llm-multimodal's browser half:
		//   - inject: ["slots", "locale", "settingsScope"]
		//   - apply(): bind the namespace scope, keep one snapshot store, register
		//     the slot under ctx.slots.inject("settings.plugin.item", ...).
		// Edits are staged locally (draft); only Save writes (scope.set / unset),
		// so an in-progress URL that is temporarily invalid never reaches the
		// document. Discard drops the draft.

		/** Distinct plugin name for the browser-side cordis entry. */
		const name = "dsh-clash-verge-rev-proxy-client";
		/** Cordis service injections for the browser half. */
		const inject = [
			"slots",
			"locale",
			"settingsScope"
		];

		/** Settings namespace the host half registers (must match lib/index.js). */
		const SETTINGS_NS = "clash-verge-rev-proxy";
		/** Locale dictionary namespace owned by this card. */
		const NS = "clash-verge-rev-proxy.card";

		// ── locale dictionaries ────────────────────────────────────────────────
		const zh = {
			title: "Clash 代理（Mihomo 控制器）",
			description: "配置 Mihomo External Controller 地址与密钥，proxy_* 工具（proxy_status、proxy_select_node、proxy_set_mode 等）通过它驱动 Clash Verge Rev。",
			expand: "展开",
			collapse: "收起",
			readOnly: "当前设置不可写（settings 提供方为只读）。",
			unavailable: "控制器设置暂不可用。",
			controllerLabel: "外部控制器地址",
			controllerHint: "例如 http://127.0.0.1:9097（也可只填 127.0.0.1:9097，自动补全协议）。留空 = 使用环境变量 DSH_PROXY_CONTROLLER 或部署默认。",
			controllerPlaceholder: "http://127.0.0.1:9097",
			secretLabel: "外部控制器密钥",
			secretHint: "Mihomo External Controller 的 secret（Bearer 令牌）。留空并保存 = 清除已存密钥（此时需要 DSH_PROXY_SECRET 或部署配置提供）。",
			secretPlaceholder: "未配置",
			invalidUrl: "地址不是合法的 http(s) URL。",
			unsaved: "未保存",
			overridden: "已覆盖",
			composition: "默认",
			save: "测试并保存",
			discard: "放弃修改",
			reset: "重置",
			saved: "已保存，控制器连通正常（HTTP 200），立即生效。",
			saveFailed: "保存失败：值未被接受（地址不合法、校验未通过或版本冲突）。请修改后重试；若字段下方有红色提示，请按提示填写。",
			pingFailed: "未保存：控制器连通性测试未通过。",
			conflict: "此设置在别处已被修改。点「放弃修改」载入最新值；或直接保存，若版本冲突将被拒绝。",
			saving: "测试中…"
		};
		const en = {
			title: "Clash proxy (Mihomo controller)",
			description: "Configure the Mihomo External Controller URL and secret; the proxy_* tools (proxy_status, proxy_select_node, proxy_set_mode, …) drive Clash Verge Rev through it.",
			expand: "Expand",
			collapse: "Collapse",
			readOnly: "These settings are read-only.",
			unavailable: "Controller settings are unavailable.",
			controllerLabel: "External controller URL",
			controllerHint: "e.g. http://127.0.0.1:9097 (or just 127.0.0.1:9097 — http:// is added automatically). Leave empty to fall back to DSH_PROXY_CONTROLLER or the deployment default.",
			controllerPlaceholder: "http://127.0.0.1:9097",
			secretLabel: "Controller secret",
			secretHint: "The Mihomo External Controller secret (Bearer token). Save empty to clear a stored secret (DSH_PROXY_SECRET or the deployment config is then required).",
			secretPlaceholder: "Not configured",
			invalidUrl: "Not a valid http(s) URL.",
			unsaved: "Unsaved",
			overridden: "Overridden",
			composition: "Default",
			save: "Test & save",
			discard: "Discard changes",
			reset: "Reset",
			saved: "Saved — controller reachable (HTTP 200); effective immediately.",
			saveFailed: "Save failed: the value was not accepted (invalid address, validation, or a version conflict). Fix it and retry — follow the red hint under the field if shown.",
			pingFailed: "Not saved: the controller connectivity check failed. ",
			conflict: "These settings were changed elsewhere. Use “Discard changes” to reload, or save anyway — a stale revision will be refused.",
			saving: "Testing…"
		};

		// ── tiny snapshot store (uSES-compatible surface) ─────────────────────
		function createStore(initial) {
			let snapshot = initial;
			const listeners = new Set();
			return {
				getSnapshot() {
					return snapshot;
				},
				subscribe(fn) {
					listeners.add(fn);
					return () => listeners.delete(fn);
				},
				set(next) {
					if (next === snapshot) return;
					snapshot = next;
					for (const fn of [...listeners]) {
						try { fn(); } catch { /* one bad listener must not kill the card */ }
					}
				}
			};
		}

		// ── helpers ────────────────────────────────────────────────────────────
		function asString(value) {
			return typeof value === "string" ? value : "";
		}

		function sectionKeys(section) {
			return section && typeof section === "object" ? Object.keys(section) : [];
		}

		/**
		* Normalize a controller URL draft. Empty → clear (fall back). A scheme
		* must be http(s); a bare host[:port] such as `127.0.0.1:9097` is
		* auto-prefixed with `http://` so a user does not have to type it.
		* @returns `{ url }` when acceptable (`url` is the value to store, "" for
		*   clear), or `null` when the input is not an http(s) address at all.
		*/
		function controllerCandidate(value) {
			const raw = asString(value).trim();
			if (raw === "") return { url: "" };
			let candidate = raw;
			if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
				candidate = `http://${candidate}`;
			}
			try {
				const url = new URL(candidate);
				if (url.protocol !== "http:" && url.protocol !== "https:") return null;
				return { url: candidate };
			} catch {
				return null;
			}
		}

		/** Draft-level validity used only to show/hide the inline red hint. */
		function isInvalidDraft(value) {
			const raw = asString(value).trim();
			return raw !== "" && controllerCandidate(raw) === null;
		}

		/** Derive the card snapshot from the live scope snapshot. */
		function project(scope) {
			const snap = scope.getSnapshot();
			const ready = snap.status === "ready" || snap.status === "loading";
			const value = snap.value && typeof snap.value === "object" ? snap.value : {};
			const user = sectionKeys(snap.user);
			return {
				available: ready,
				writable: !!snap.writable,
				controller: asString(value.controller),
				secret: asString(value.secret),
				overriddenController: user.includes("controller"),
				overriddenSecret: user.includes("secret"),
				revision: snap.revision
			};
		}

		/** Card editor state held between renders (in the apply closure). */
		function makeEditor(scope, store) {
			// Draft: the user's in-progress edits. `null` = no draft (show live).
			let draft = null;
			let dirty = false;
			let conflict = false;
			let saving = false;
			let outcome = ""; // "" | "saved" | "failed"
			let pingError = ""; // connectivity test failure detail (host-provided)

			const publish = () => {
				store.set(flatten());
			};

			const flatten = () => {
				const live = project(scope);
				return {
					...live,
					controller: draft ? draft.controller : live.controller,
					secret: draft ? draft.secret : live.secret,
					dirty,
					conflict,
					saving,
					outcome,
					pingError
				};
			};

			const liveValue = (field) => {
				const snap = scope.getSnapshot();
				const value = snap.value && typeof snap.value === "object" ? snap.value : {};
				return asString(value[field]);
			};

			const beginDraft = () => {
				if (draft) return;
				draft = { controller: liveValue("controller"), secret: liveValue("secret") };
			};

			/** POST the would-be values to the host connectivity endpoint. */
			async function testConnection(controllerValue, secretValue) {
				try {
					const response = await fetch("/api/clash-verge-rev-proxy/ping", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ controller: controllerValue, secret: secretValue })
					});
					if (!response.ok) {
						return { ok: false, error: `连通性测试端点不可用(HTTP ${response.status})` };
					}
					const data = await response.json();
					return data && typeof data === "object"
						? data
						: { ok: false, error: "连通性测试返回异常数据" };
				} catch (error) {
					return { ok: false, error: String((error && error.message) || error) || "连通性测试请求失败" };
				}
			}

			const actions = {
				setController(value) {
					const snap = scope.getSnapshot();
					if (saving || !snap.writable) return;
					beginDraft();
					draft.controller = value;
					dirty = true;
					conflict = false;
					outcome = "";
					pingError = "";
					publish();
				},
				setSecret(value) {
					const snap = scope.getSnapshot();
					if (saving || !snap.writable) return;
					beginDraft();
					draft.secret = value;
					dirty = true;
					conflict = false;
					outcome = "";
					pingError = "";
					publish();
				},
				resetField(field) {
					const snap = scope.getSnapshot();
					if (saving || !snap.writable) return;
					if (!snap.user || !Object.prototype.hasOwnProperty.call(snap.user, field)) return;
					// Staged clear: the draft field goes empty and saving unsets it,
					// so the value falls back to env / deployment defaults.
					beginDraft();
					draft[field] = "";
					dirty = true;
					conflict = false;
					outcome = "";
					pingError = "";
					publish();
				},
				discard() {
					if (saving) return;
					draft = null;
					dirty = false;
					conflict = false;
					outcome = "";
					pingError = "";
					publish();
				},
				async save() {
					const snap = scope.getSnapshot();
					if (saving || !snap.writable || !draft) return;
					// Auto-prefix a bare host[:port]; null means genuinely invalid.
					const candidate = controllerCandidate(draft.controller);
					if (candidate === null) {
						outcome = "failed";
						pingError = "";
						publish();
						return;
					}
					const controllerValue = candidate.url; // "" → clear
					const secretValue = draft.secret;
					saving = true;
					outcome = "";
					pingError = "";
					publish();
					try {
						// 1) Connectivity first: only persist once the would-be
						// controller answers /version with the draft credentials.
						// Empty fields mean "clear", so the host tests what the
						// effective configuration will actually be.
						const test = await testConnection(controllerValue, secretValue);
						if (!test || !test.ok) {
							pingError = asString(test && test.error) || "控制器连通性测试失败";
							outcome = "failed";
							return; // keep the draft so the user can fix it
						}
						// 2) A field left empty is a clear (unset); anything else is
						// a write. scope.set/unset are revision-fenced and queued,
						// and the controller re-validates on the host side too.
						if (controllerValue === "") {
							await scope.unset("controller");
						} else {
							await scope.set("controller", controllerValue);
						}
						if (secretValue === "") {
							await scope.unset("secret");
						} else {
							await scope.set("secret", secretValue);
						}
						// scope.set/unset swallow host-side refusals (conflict,
						// validation) and recover by re-reading, so verify the
						// document actually reached what we asked for.
						const after = scope.getSnapshot();
						const userAfter = after.user && typeof after.user === "object" ? after.user : {};
						const controllerOk = controllerValue === ""
							? !Object.prototype.hasOwnProperty.call(userAfter, "controller")
							: asString(userAfter.controller) === controllerValue;
						const secretOk = secretValue === ""
							? !Object.prototype.hasOwnProperty.call(userAfter, "secret")
							: asString(userAfter.secret) === secretValue;
						if (!controllerOk || !secretOk) {
							// Re-sync: drop the stale draft so the card shows the
							// document's actual values next to the failure message.
							draft = null;
							dirty = false;
							conflict = false;
							outcome = "failed";
						} else {
							draft = null;
							dirty = false;
							conflict = false;
							outcome = "saved";
						}
					} catch (error) {
						// Reaching here means an unexpected transport failure —
						// surface it for debugging.
						if (typeof console !== "undefined" && typeof console.error === "function") {
							console.error("[dsh-clash-verge-rev-proxy] save failed", error);
						}
						outcome = "failed";
					} finally {
						saving = false;
						publish();
					}
				}
			};

			// Follow external changes: when nothing is staged, re-project; when a
			// draft exists and the document moved while we were not writing, flag
			// a conflict (saves issued by this card are revision-fenced anyway).
			const unsubscribe = scope.subscribe(() => {
				if (saving) return; // our own writes landing — ignore mid-flight revisions
				if (dirty) conflict = true;
				publish();
			});

			return { actions, store, dispose: () => unsubscribe() };
		}

		// ── card component ─────────────────────────────────────────────────────
		function FieldRow(props) {
			const invalid = props.invalid;
			const input = react.createElement("input", {
				id: props.id,
				className: invalid ? "dsh-cvr-input dsh-cvr-invalid" : "dsh-cvr-input",
				type: props.type || "text",
				value: props.value,
				placeholder: props.placeholder,
				disabled: props.disabled,
				spellCheck: false,
				autoComplete: "off",
				"aria-invalid": invalid || undefined,
				onChange: (event) => props.onChange(event.target.value)
			});
			return react.createElement("div", { className: "dsh-cvr-field" },
				react.createElement("div", { className: "dsh-cvr-field-head" },
					react.createElement("label", { className: "dsh-cvr-field-label", htmlFor: props.id }, props.label),
					props.overridden
						? react.createElement("span", { className: "dsh-cvr-field-badges" },
							react.createElement("span", { className: "dsh-cvr-badge" }, props.overriddenLabel),
							react.createElement("button", {
								type: "button",
								className: "dsh-cvr-reset",
								disabled: props.disabled,
								onClick: () => props.onReset(props.field)
							}, props.resetLabel))
						: null),
				input,
				props.hint ? react.createElement("p", { className: "dsh-cvr-hint" }, props.hint) : null,
				invalid ? react.createElement("p", { className: "dsh-cvr-invalid-text", role: "alert" }, props.invalidLabel) : null);
		}

		function ClashCard(props) {
			const { t, useClashProxy, save, discard, resetField, setController, setSecret } = props;
			const snap = useClashProxy((s) => s);
			const [open, setOpen] = react.useState(false);
			const disabled = !snap.writable || snap.saving;

			const showSaveRow = open && !disabled && snap.available;
			const controllerInvalid = snap.dirty && isInvalidDraft(snap.controller);

			return react.createElement("li", {
				className: open ? "dsh-cvr-card dsh-cvr-card-open" : "dsh-cvr-card"
			},
				react.createElement("button", {
					type: "button",
					className: "dsh-cvr-header",
					"aria-expanded": open,
					"aria-label": `${t(open ? "collapse" : "expand")}: ${t("title")}`,
					onClick: () => setOpen(!open)
				},
					react.createElement("span", { className: "dsh-cvr-head-text" },
						react.createElement("span", { className: "dsh-cvr-name" }, t("title")),
						react.createElement("span", { className: "dsh-cvr-description" }, t("description"))),
					snap.dirty
						? react.createElement("span", { className: "dsh-cvr-unsaved" }, t("unsaved"))
						: null,
					react.createElement("svg", {
						className: open ? "dsh-cvr-chevron dsh-cvr-chevron-open" : "dsh-cvr-chevron",
						viewBox: "0 0 14 14",
						width: 14,
						height: 14,
						"aria-hidden": "true"
					}, react.createElement("path", {
						d: "M3.5 5.5 7 9l3.5-3.5",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: 1.5,
						strokeLinecap: "round",
						strokeLinejoin: "round"
					}))),
				open ? react.createElement("div", { className: "dsh-cvr-body" },
					!snap.available
						? react.createElement("p", { className: "dsh-cvr-hint", role: "status" }, t("unavailable"))
						: react.createElement(react.Fragment, null,
							!snap.writable && snap.available
								? react.createElement("p", { className: "dsh-cvr-hint", role: "status" }, t("readOnly"))
								: null,
							react.createElement(FieldRow, {
								id: "dsh-cvr-controller",
								field: "controller",
								label: t("controllerLabel"),
								value: snap.controller,
								placeholder: t("controllerPlaceholder"),
								type: "text",
								disabled,
								overridden: snap.overriddenController,
								overriddenLabel: t("overridden"),
								resetLabel: t("reset"),
								hint: t("controllerHint"),
								invalid: controllerInvalid,
								invalidLabel: t("invalidUrl"),
								onReset: resetField,
								onChange: setController
							}),
							react.createElement(FieldRow, {
								id: "dsh-cvr-secret",
								field: "secret",
								label: t("secretLabel"),
								value: snap.secret,
								placeholder: snap.secret === "" ? t("secretPlaceholder") : "",
								type: "password",
								disabled,
								overridden: snap.overriddenSecret,
								overriddenLabel: t("overridden"),
								resetLabel: t("reset"),
								hint: t("secretHint"),
								invalid: false,
								invalidLabel: "",
								onReset: resetField,
								onChange: setSecret
							}),
							snap.conflict
								? react.createElement("p", { className: "dsh-cvr-hint dsh-cvr-warn", role: "status" }, t("conflict"))
								: null,
							snap.outcome === "saved"
								? react.createElement("p", { className: "dsh-cvr-hint dsh-cvr-ok", role: "status" }, t("saved"))
								: null,
							snap.outcome === "failed" && snap.pingError !== ""
								? react.createElement("p", { className: "dsh-cvr-invalid-text", role: "alert" }, `${t("pingFailed")} ${snap.pingError}`)
								: null,
							snap.outcome === "failed" && snap.pingError === ""
								? react.createElement("p", { className: "dsh-cvr-invalid-text", role: "alert" }, t("saveFailed"))
								: null,
							showSaveRow
								? react.createElement("div", { className: "dsh-cvr-actions" },
									react.createElement("button", {
										type: "button",
										className: "dsh-cvr-primary",
										disabled: snap.saving || (!snap.dirty && !snap.conflict && !controllerInvalid),
										onClick: () => save()
									}, snap.saving ? t("saving") : t("save")),
									react.createElement("button", {
										type: "button",
										className: "dsh-cvr-ghost",
										disabled: snap.saving || !snap.dirty,
										onClick: () => discard()
									}, t("discard")))
								: null))
					: null);
		}

		// ── styles (one injected <style>, idempotent) ──────────────────────────
		function ensureStyles() {
			if (typeof document === "undefined") return;
			const tagId = "dsh-clash-verge-rev-proxy/card.css";
			if (document.querySelector(`style[data-plugin-css="${tagId}"]`)) return;
			const css = `
.dsh-cvr-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);transition:border-color .16s,background .16s;margin-bottom:12px;padding:12px 14px 14px}
.dsh-cvr-card:hover{border-color:var(--dsw-alias-label-dimmed)}
.dsh-cvr-card-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.dsh-cvr-header{align-items:center;gap:8px;width:100%;text-align:left;background:none;border:none;padding:0;display:flex;cursor:pointer;color:var(--dsw-alias-label-primary);font:inherit}
.dsh-cvr-head-text{min-width:0;flex:1}
.dsh-cvr-name{display:block;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:1.5}
.dsh-cvr-description{display:block;color:var(--dsw-alias-label-tertiary);margin:2px 0 0;font-size:12px;line-height:1.5}
.dsh-cvr-unsaved{white-space:nowrap;color:var(--dsw-alias-brand-primary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px;background:var(--dsw-alias-bg-module-platform)}
.dsh-cvr-chevron{color:var(--dsw-alias-label-secondary);flex:none;transition:transform .15s ease}
.dsh-cvr-chevron-open{transform:rotate(180deg)}
.dsh-cvr-body{flex-direction:column;padding-top:4px;display:flex}
.dsh-cvr-field{flex-direction:column;gap:6px;padding:12px 0;display:flex}
.dsh-cvr-field + .dsh-cvr-field{border-top:.5px solid var(--dsw-alias-border-l2)}
.dsh-cvr-field-head{align-items:center;gap:8px;display:flex}
.dsh-cvr-field-label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}
.dsh-cvr-field-badges{align-items:center;gap:8px;display:inline-flex}
.dsh-cvr-badge{corner-shape:round;white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}
.dsh-cvr-reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:none;border:none;padding:0;font-size:12px;line-height:1.5}
.dsh-cvr-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.dsh-cvr-reset:disabled{cursor:default}
.dsh-cvr-input{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5;width:100%;box-sizing:border-box}
.dsh-cvr-input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}
.dsh-cvr-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.dsh-cvr-invalid{border-color:var(--dsw-alias-label-error)}
.dsh-cvr-hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}
.dsh-cvr-invalid-text{color:var(--dsw-alias-label-error);margin:0;font-size:12px;line-height:1.5}
.dsh-cvr-ok{color:var(--dsw-alias-label-secondary)}
.dsh-cvr-warn{color:var(--dsw-alias-label-error)}
.dsh-cvr-actions{align-items:center;gap:8px;padding-top:4px;display:flex}
.dsh-cvr-primary{font:inherit;cursor:pointer;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground,#101014);border:none;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:500;line-height:1.5}
.dsh-cvr-primary:disabled{cursor:default;opacity:.5}
.dsh-cvr-ghost{font:inherit;cursor:pointer;background:transparent;color:var(--dsw-alias-label-secondary);border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;padding:6px 14px;font-size:12px;line-height:1.5}
.dsh-cvr-ghost:disabled{cursor:default;opacity:.5}`;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-clash-verge-rev-proxy";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		// ── apply ──────────────────────────────────────────────────────────────
		function apply(ctx) {
			ensureStyles();
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-clash-verge-rev-proxy: card dictionaries");

			const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NS });
			const store = createStore(project(scope));
			const editor = makeEditor(scope, store);
			ctx.effect(() => () => editor.dispose(), "dsh-clash-verge-rev-proxy: card scope");

			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				key: SETTINGS_NS,
				locale: NS,
				inject: () => ({
					hooks: { clashProxy: store },
					save: editor.actions.save,
					discard: editor.actions.discard,
					resetField: editor.actions.resetField,
					setController: editor.actions.setController,
					setSecret: editor.actions.setSecret
				})
			}, ClashCard));
		}

		exports.name = name;
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});
