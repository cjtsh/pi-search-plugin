/**
 * Web Search Extension for pi
 *
 * Provides a native web_search tool that:
 *   - Uses Brave Search as primary backend
 *   - Falls back to Serper.dev (Google results) if Brave fails
 *   - Is ONLY enabled when the active model matches a "local" pattern
 *     (provider/id contains unsloth, lmstudio, or ollama)
 *   - Is auto-disabled for hosted models which already have native search
 *     (Gemini, Kimi, DeepSeek, GLM, Grok, Claude with search, GPT-4o, etc.)
 *
 * API keys are read from environment variables:
 *   - BRAVE_API_KEY
 *   - SERPER_API_KEY
 *
 * Slash commands:
 *   /search <query>            — manually search the web
 *   /search-provider [b|s]     — show or switch active provider
 *   /search-status             — show config and current state
 *   /search-force [on|off|auto] — override auto-detection
 */

import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ============================================================
// .env loader (zero-dependency, only fills in MISSING keys)
// ============================================================
// Searches for `.env` in three locations, in order:
//   1. The directory containing this extension file
//   2. ~/.pi/agent/extensions/.env  (system-wide install)
//   3. The current working directory (project-local dev)
// IMPORTANT: This never overrides keys already in process.env,
// so shell exports (e.g. ~/.zshrc) always win. This means your
// existing setup keeps working — .env is purely additive for
// users who don't use shell exports.
function loadEnvFile(envPath: string): void {
	if (!existsSync(envPath)) return;
	try {
		const content = readFileSync(envPath, "utf-8");
		for (const rawLine of content.split("\n")) {
			const line = rawLine.trim();
			if (!line || line.startsWith("#")) continue;
			const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
			if (!m) continue;
			const [, key, rawValue] = m;
			if (process.env[key] !== undefined) continue; // already set, never override
			let value = rawValue.trim();
			// Strip surrounding quotes (single or double)
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			process.env[key] = value;
		}
	} catch {
		// Silent — never break the extension over a malformed .env
	}
}

try {
	const here = dirname(fileURLToPath(import.meta.url));
	loadEnvFile(join(here, ".env"));
	loadEnvFile(join(homedir(), ".pi", "agent", "extensions", ".env"));
	loadEnvFile(join(process.cwd(), ".env"));
} catch {
	// import.meta.url may not be available in every loader — that's fine
}

// ============================================================
// Configuration
// ============================================================
const TOOL_NAME = "web_search";
const MAX_RESULT_CHARS = 8000;
const MAX_RESULTS_DEFAULT = 10;
const MAX_RESULTS_LIMIT = 20;

// Local model patterns (case-insensitive) — web_search is enabled
// whenever the provider or model id matches one of these.
// Hosted models always disable it (their provider supplies native search).
const LOCAL_PATTERNS: RegExp[] = [/unsloth/i, /lmstudio/i, /ollama/i];

type Provider = "brave" | "serper";
let activeProvider: Provider = "brave";

// ============================================================
// Types
// ============================================================
interface SearchResult {
	title: string;
	url: string;
	snippet: string;
	date?: string;
}

interface BraveResponse {
	web?: {
		results?: Array<{
			title: string;
			url: string;
			description: string;
			age?: string;
		}>;
	};
}

interface SerperResponse {
	organic?: Array<{
		title: string;
		link: string;
		snippet: string;
		date?: string;
	}>;
}

interface CurrentModel {
	provider: string;
	id: string;
}

// ============================================================
// Helpers
// ============================================================
function isLocalModel(model: CurrentModel | undefined): boolean {
	if (!model) return false;
	const haystack = `${model.provider}/${model.id}`;
	return LOCAL_PATTERNS.some((p) => p.test(haystack));
}

async function searchBrave(query: string, count: number): Promise<SearchResult[]> {
	const apiKey = process.env.BRAVE_API_KEY;
	if (!apiKey) throw new Error("BRAVE_API_KEY env var not set");

	const url = new URL("https://api.search.brave.com/res/v1/web/search");
	url.searchParams.set("q", query);
	url.searchParams.set("count", String(Math.min(count, MAX_RESULTS_LIMIT)));

	const response = await fetch(url, {
		headers: {
			Accept: "application/json",
			"X-Subscription-Token": apiKey,
		},
	});

	if (!response.ok) {
		throw new Error(`Brave API ${response.status}: ${await response.text()}`);
	}

	const data = (await response.json()) as BraveResponse;
	return (data.web?.results ?? []).map((r) => ({
		title: r.title,
		url: r.url,
		snippet: r.description,
		date: r.age,
	}));
}

async function searchSerper(query: string, count: number): Promise<SearchResult[]> {
	const apiKey = process.env.SERPER_API_KEY;
	if (!apiKey) throw new Error("SERPER_API_KEY env var not set");

	const response = await fetch("https://google.serper.dev/search", {
		method: "POST",
		headers: {
			"X-API-KEY": apiKey,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			q: query,
			num: Math.min(count, MAX_RESULTS_LIMIT),
		}),
	});

	if (!response.ok) {
		throw new Error(`Serper API ${response.status}: ${await response.text()}`);
	}

	const data = (await response.json()) as SerperResponse;
	return (data.organic ?? []).map((r) => ({
		title: r.title,
		url: r.link,
		snippet: r.snippet,
		date: r.date,
	}));
}

function formatResults(results: SearchResult[], provider: Provider): string {
	if (results.length === 0) {
		return `No results from ${provider}.`;
	}

	const lines: string[] = [
		`Found ${results.length} result${results.length === 1 ? "" : "s"} (via ${provider}):`,
		"",
	];

	for (const [i, r] of results.entries()) {
		lines.push(`${i + 1}. **${r.title}**`);
		lines.push(`   ${r.url}`);
		if (r.date) lines.push(`   Date: ${r.date}`);
		lines.push(`   ${r.snippet}`);
		lines.push("");
	}

	let output = lines.join("\n");
	if (output.length > MAX_RESULT_CHARS) {
		output = output.slice(0, MAX_RESULT_CHARS) + "\n\n[Results truncated]";
	}
	return output;
}

// Toggle the tool in the active set without clobbering other active tools.
function syncToolState(pi: ExtensionAPI, enabled: boolean): void {
	const active = pi.getActiveTools();
	const has = active.includes(TOOL_NAME);
	if (enabled && !has) {
		pi.setActiveTools([...active, TOOL_NAME]);
	} else if (!enabled && has) {
		pi.setActiveTools(active.filter((n) => n !== TOOL_NAME));
	}
}

// ============================================================
// Extension
// ============================================================
export default function webSearchExtension(pi: ExtensionAPI) {
	// ---- Register the tool (always available, may be disabled in active set) ----
	pi.registerTool({
		name: TOOL_NAME,
		label: "Web Search",
		description:
			"Search the web for current information: news, weather, prices, recent events, sports scores, or anything where the answer may have changed recently or might not be in the model's training data. Returns a numbered list of results with titles, URLs, and snippets.",
		promptSnippet: "Search the web (Brave primary, Serper fallback) for current information",
		promptGuidelines: [
			"Use web_search when the user asks about current events, weather, prices, news, sports scores, or anything requiring up-to-date information that may have changed since the model's training cutoff.",
			"Do NOT use web_search for code questions, file operations, math, general knowledge, or anything answerable from the current conversation context.",
			"Prefer web_search when in doubt about whether information is current.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "The search query string" }),
			count: Type.Optional(
				Type.Number({
					description: `Number of results to return (1-${MAX_RESULTS_LIMIT}, default ${MAX_RESULTS_DEFAULT})`,
					minimum: 1,
					maximum: MAX_RESULTS_LIMIT,
				}),
			),
		}),

		async execute(_toolCallId, params, _signal, onUpdate, _ctx) {
			const count = params.count ?? MAX_RESULTS_DEFAULT;

			onUpdate?.({
				content: [{ type: "text", text: `Searching ${activeProvider}: ${params.query}` }],
			});

			let results: SearchResult[];
			let usedProvider: Provider = activeProvider;

			try {
				results = await searchBrave(params.query, count);
			} catch (braveErr) {
				const msg = braveErr instanceof Error ? braveErr.message : String(braveErr);
				// Try Serper fallback only if primary was Brave and Serper key exists
				if (activeProvider === "brave" && process.env.SERPER_API_KEY) {
					try {
						results = await searchSerper(params.query, count);
						usedProvider = "serper";
					} catch (serperErr) {
						const sMsg = serperErr instanceof Error ? serperErr.message : String(serperErr);
						throw new Error(`Both backends failed.\nBrave: ${msg}\nSerper: ${sMsg}`);
					}
				} else {
					throw new Error(msg);
				}
			}

			const formatted = formatResults(results, usedProvider);
			return {
				content: [{ type: "text", text: formatted }],
				details: {
					provider: usedProvider,
					count: results.length,
					query: params.query,
				},
			};
		},
	});

	// ---- Update tool active state when the model changes ----
	pi.on("model_select", async (event, ctx) => {
		const local = isLocalModel(event.model);
		syncToolState(pi, local);
		ctx.ui.notify(
			local
				? `🔍 web_search ENABLED — local model: ${event.model.provider}/${event.model.id}`
				: `🔍 web_search disabled — hosted model ${event.model.id} uses provider-native search`,
			"info",
		);
	});

	// ---- Set initial state on session start ----
	pi.on("session_start", async (_event, ctx) => {
		const model = ctx.getModel() as CurrentModel | undefined;
		const local = isLocalModel(model);
		syncToolState(pi, local);

		if (model) {
			ctx.ui.notify(
				local
					? `🔍 web_search ready (local model: ${model.id})`
					: `🔍 web_search disabled for hosted model: ${model.id}`,
				"info",
			);
		} else {
			ctx.ui.notify("🔍 web_search loaded (no active model yet)", "info");
		}
	});

	// ---- /search <query> — manual search from the user ----
	pi.registerCommand("search", {
		description: "Search the web manually: /search <query>",
		handler: async (args, ctx) => {
			const query = args.trim();
			if (!query) {
				ctx.ui.notify("Usage: /search <query>", "warn");
				return;
			}

			let results: SearchResult[];
			let usedProvider: Provider = activeProvider;

			try {
				results = await searchBrave(query, MAX_RESULTS_DEFAULT);
			} catch (braveErr) {
				const bMsg = braveErr instanceof Error ? braveErr.message : String(braveErr);
				if (activeProvider === "brave" && process.env.SERPER_API_KEY) {
					try {
						results = await searchSerper(query, MAX_RESULTS_DEFAULT);
						usedProvider = "serper";
					} catch (serperErr) {
						const sMsg = serperErr instanceof Error ? serperErr.message : String(serperErr);
						ctx.ui.notify(`Search failed.\nBrave: ${bMsg}\nSerper: ${sMsg}`, "error");
						return;
					}
				} else {
					ctx.ui.notify(`Search failed: ${bMsg}`, "error");
					return;
				}
			}

			const formatted = formatResults(results, usedProvider);
			// Inject result into session so the model can act on it
			pi.sendMessage(
				{
					customType: "web-search",
					content: `Web search results for: "${query}"\n\n${formatted}`,
					display: true,
				},
				{ triggerTurn: false },
			);
		},
	});

	// ---- /search-provider — show or switch provider ----
	pi.registerCommand("search-provider", {
		description: "Show or switch search provider: /search-provider [brave|serper]",
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();
			if (!arg) {
				const fallback = activeProvider === "brave" ? "serper" : "brave";
				ctx.ui.notify(
					`Provider: ${activeProvider}\nFallback: ${fallback}\nSwitch with: /search-provider brave|serper`,
					"info",
				);
				return;
			}
			if (arg === "brave" || arg === "b") {
				activeProvider = "brave";
				ctx.ui.notify("Search provider → brave", "info");
			} else if (arg === "serper" || arg === "s") {
				activeProvider = "serper";
				ctx.ui.notify("Search provider → serper", "info");
			} else {
				ctx.ui.notify("Provider must be 'brave' or 'serper'", "warn");
			}
		},
	});

	// ---- /search-status — show full status ----
	pi.registerCommand("search-status", {
		description: "Show web search status, configuration, and current model",
		handler: async (_args, ctx) => {
			const model = ctx.getModel() as CurrentModel | undefined;
			const active = pi.getActiveTools();
			const local = isLocalModel(model);
			const enabled = active.includes(TOOL_NAME);

			const lines = [
				`Provider:    ${activeProvider}  (fallback: ${activeProvider === "brave" ? "serper" : "brave"})`,
				`BRAVE key:   ${process.env.BRAVE_API_KEY ? "✓ set" : "✗ missing"}`,
				`SERPER key:  ${process.env.SERPER_API_KEY ? "✓ set" : "✗ missing"}`,
				`Model:       ${model ? `${model.provider}/${model.id}` : "?"}`,
				`Local match: ${local ? "✓ yes" : "✗ no"}`,
				`Tool active: ${enabled ? "✓ yes" : "✗ no"}`,
				`Local patterns: ${LOCAL_PATTERNS.map((p) => p.source).join(", ")}`,
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// ---- /search-force — override auto-detection ----
	pi.registerCommand("search-force", {
		description: "Force web_search on/off: /search-force on|off|auto",
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();
			if (arg === "on") {
				syncToolState(pi, true);
				ctx.ui.notify("web_search FORCE-ENABLED (overrides auto-detection)", "info");
			} else if (arg === "off") {
				syncToolState(pi, false);
				ctx.ui.notify("web_search FORCE-DISABLED (overrides auto-detection)", "info");
			} else if (arg === "auto" || !arg) {
				const model = ctx.getModel() as CurrentModel | undefined;
				const local = isLocalModel(model);
				syncToolState(pi, local);
				ctx.ui.notify(
					`web_search → AUTO (${local ? "enabled" : "disabled"} for ${model?.id ?? "?"})`,
					"info",
				);
			} else {
				ctx.ui.notify("Usage: /search-force on|off|auto", "warn");
			}
		},
	});
}
