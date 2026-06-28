# pi Web Search Plugin

A native web search extension for [pi](https://github.com/badlogic/pi-mono) that gives local models live internet access via Brave Search (primary) and Serper.dev (fallback). Automatically enabled only when the active model looks "local" (provider/id contains `unsloth`, `lmstudio`, or `ollama`); stays disabled for hosted models that already have provider-native search (Gemini, Kimi, DeepSeek, GLM, Grok, etc.).

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Slash Commands](#slash-commands)
- [How the Auto-Detection Works](#how-the-auto-detection-works)
- [Engineering Notes](#engineering-notes)
- [Sharing Across Machines](#sharing-across-machines)
- [Customization](#customization)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)

---

## Overview

| | |
|---|---|
| **File** | `~/.pi/agent/extensions/web-search.ts` |
| **Type** | pi extension (TypeScript, loaded via jiti) |
| **Tool added** | `web_search` |
| **Backends** | Brave Search API, Serper.dev API |
| **Auth** | Environment variables only (no hardcoded keys) |
| **Activation** | Auto on local-model patterns; manual override via `/search-force` |

When the user asks a local model something current (weather, prices, news, sports, anything with a freshness requirement), the model sees `web_search` in its tool list and can invoke it. The extension does the HTTP work, formats results, and returns them. The model never has to generate `curl` itself, which matters for smaller local models that struggle with tool-call generation.

---

## Features

- **Native tool** — appears in the model's tool list alongside `bash`, `read`, etc. No `/skill:` invocation needed.
- **Dual backend** — Brave Search as primary, Serper.dev (Google) as automatic fallback if Brave fails.
- **Smart auto-detection** — only enabled for local model patterns; disabled by default for hosted models (they already have native search).
- **Reactive to model switches** — uses `model_select` event, so switching from `gemini-2.5-pro` to `ollama/llama3.2` flips the tool on automatically.
- **Result truncation** — caps output at 8 KB to fit small local model context windows.
- **Manual override** — `/search-force on|off|auto` to bypass the auto-detection.
- **Manual search command** — `/search <query>` works regardless of model (always executes; doesn't go through the active-tool gate).
- **Zero npm dependencies** — single `.ts` file, no `package.json`, no `node_modules` to manage.

---

## Prerequisites

1. **pi** installed (`npm i -g @earendil-works/pi-coding-agent` or per pi's install docs).
2. **A Brave Search API key** — free tier, 2,000 queries/month. Get one at <https://brave.com/search/api/>.
3. **A Serper.dev API key** — paid but cheap, Google-quality results. Get one at <https://serper.dev/>.
4. **Both keys exported** in your shell rc file (e.g., `~/.zshrc`):

   ```bash
   export BRAVE_API_KEY="BSAxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   export SERPER_API_KEY="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   ```

5. **pi must be launched from a shell that has these env vars set.** pi inherits the environment at process start.

---

## Installation

### One-time per machine

```bash
# 1. Create the extensions directory if it doesn't exist
mkdir -p ~/.pi/agent/extensions

# 2. Copy web-search.ts into it
cp web-search.ts ~/.pi/agent/extensions/web-search.ts

# 3. (Optional) Copy this doc next to it for reference
cp pi-search-plugin.md ~/.pi/agent/extensions/

# 4. Verify your API keys are exported
echo $BRAVE_API_KEY | head -c 10
echo $SERPER_API_KEY | head -c 10

# 5. Launch pi
pi

# 6. In pi, run /reload to load the extension
#    (or just restart pi)
```

### Verify it loaded

Inside pi, run:

```
/search-status
```

You should see something like:

```
Provider:    brave  (fallback: serper)
BRAVE key:   ✓ set
SERPER key:  ✓ set
Model:       minimax/MiniMax-M3
Local match: ✗ no
Tool active: ✗ no
Local patterns: /unsloth/i, /lmstudio/i, /ollama/i
```

If keys show `✗ missing`, your env vars aren't reaching pi. Source your rc file or launch pi from a fresh shell.

---

## Usage

### Automatic (the main use case)

When you switch to a model whose provider or id matches `/unsloth/i`, `/lmstudio/i`, or `/ollama/i`, the `web_search` tool is automatically added to the active tool set. The local model can then call it for any current-information question.

**You don't need to do anything** — just switch models and the model itself decides when to search based on the user's prompt.

You'll see a footer notification like:

```
🔍 web_search ENABLED — local model: ollama/llama3.2
```

### Manual

Even when the tool is disabled (hosted model), you can force a search as the user:

```
/search bitcoin price
/search weather tokyo tomorrow
/search latest pi release notes
```

The result is injected into the session so the model can read it and answer.

### Forcing the tool on/off

```
/search-force on      # enable web_search no matter what model is active
/search-force off     # disable no matter what
/search-force auto    # return to pattern-based auto-detection
```

---

## Slash Commands

| Command | Description |
|---|---|
| `/search <query>` | Run a web search and inject results into the session |
| `/search-provider` | Show current provider + fallback |
| `/search-provider brave` | Switch active provider to Brave |
| `/search-provider serper` | Switch active provider to Serper (Google) |
| `/search-status` | Show full config: provider, keys, model, tool state |
| `/search-force on` | Force-enable the tool (overrides auto-detection) |
| `/search-force off` | Force-disable the tool |
| `/search-force auto` | Return to pattern-based auto-detection |

---

## How the Auto-Detection Works

The rule is **purely name-based**. The extension looks at `${provider}/${model.id}` and checks against three regexes:

```typescript
const LOCAL_PATTERNS = [/unsloth/i, /lmstudio/i, /ollama/i];
```

- **Match found** → `web_search` is added to active tools, model can call it freely.
- **No match** → tool is removed from active tools; model cannot call it.

This is intentionally simple because:

1. pi doesn't reliably know whether a model is hosted or local — some local models (Ollama, Unsloth) appear through LiteLLM with arbitrary provider names.
2. URL inspection is brittle (localhost can be a tunneled hosted endpoint, etc.).
3. You said "look at the name" — so the name it is.

### Examples

| Provider | Model | Tool State |
|---|---|---|
| `minimax` | `MiniMax-M3` | ✗ disabled (hosted) |
| `xai` | `grok-4-1-fast-reasoning` | ✗ disabled (hosted) |
| `zai` | `glm-5.2` | ✗ disabled (hosted) |
| `moonshot-ai` | `kimi-code` | ✗ disabled (hosted) |
| `deepseek` | `deepseek-v4-flash` | ✗ disabled (hosted) |
| `ollama` | `llama3.2` | ✓ enabled |
| `lmstudio` | `qwen2.5-coder-32b` | ✓ enabled |
| `unsloth` | `llama-3.3-70b-instruct` | ✓ enabled |
| `ollama-cloud` | `mistral` | ✓ enabled (pattern match — be careful with this) |

Edit `LOCAL_PATTERNS` at the top of `web-search.ts` to tune.

---

## Engineering Notes

### Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                       pi agent harness                          │
│                                                                  │
│  ┌────────────────────┐         ┌──────────────────────────┐   │
│  │  model_select      │────────►│  syncToolState(enabled)   │   │
│  │  session_start     │         │  pi.setActiveTools([..]) │   │
│  └────────────────────┘         └──────────────────────────┘   │
│           │                                │                    │
│           ▼                                ▼                    │
│    ctx.getModel()                  web_search tool              │
│    isLocalModel()                  (registered once)            │
│                                                                  │
│  When LLM calls web_search:                                      │
│    1. searchBrave(query, count)                                  │
│    2. on error → searchSerper(query, count)  (fallback)          │
│    3. formatResults() → markdown numbered list                  │
│    4. truncate at 8 KB if too long                               │
│    5. return { content, details }                                │
└────────────────────────────────────────────────────────────────┘
            │
            ▼
    ┌──────────────────┐         ┌────────────────────┐
    │ Brave Search API │         │ Serper.dev API     │
    │ (api.search.     │         │ (google.serper.dev │
    │  brave.com)      │         │  /search)          │
    └──────────────────┘         └────────────────────┘
```

### File map

```
~/.pi/agent/extensions/
├── web-search.ts          # the extension (single file, no deps)
└── pi-search-plugin.md    # this document
```

That's it. No `package.json`, no `node_modules`, no build step.

### pi extension API used

| API | Purpose |
|---|---|
| `pi.registerTool({...})` | Register the `web_search` tool with parameter schema |
| `pi.on("model_select", ...)` | React to model changes, toggle tool active state |
| `pi.on("session_start", ...)` | Set initial tool state from current model |
| `pi.registerCommand(name, {...})` | Register `/search`, `/search-provider`, `/search-status`, `/search-force` |
| `pi.sendMessage({...}, {...})` | Inject manual search results into session |
| `pi.getActiveTools()` / `pi.setActiveTools([...])` | Toggle the tool without clobbering other active tools |
| `ctx.getModel()` | Get current model for auto-detection |
| `ctx.ui.notify(text, level)` | Show status notifications to the user |

### Brave Search API

- Endpoint: `GET https://api.search.brave.com/res/v1/web/search?q=<query>&count=<n>`
- Header: `X-Subscription-Token: <API_KEY>`
- Response shape: `{ web: { results: [{ title, url, description, age }] } }`

### Serper.dev API

- Endpoint: `POST https://google.serper.dev/search`
- Header: `X-API-KEY: <API_KEY>`
- Body: `{ q: "<query>", num: <n> }`
- Response shape: `{ organic: [{ title, link, snippet, date }] }`

### Why TypeBox for parameters

pi uses TypeBox for tool parameter schemas because they serialize to JSON Schema for the LLM. Standard `Type.Object`, `Type.String`, `Type.Number({ minimum, maximum })` work as expected.

### Result truncation

Local models often have smaller context windows (4K–32K) than hosted ones (128K+). Capping output at 8 KB prevents one search from blowing out the context. Adjust `MAX_RESULT_CHARS` at the top of `web-search.ts` if needed.

### Fallback logic

```
If activeProvider === "brave":
    try searchBrave()
    on error, if SERPER_API_KEY set:
        try searchSerper()  ← usedProvider becomes "serper"
        on error: throw combined error
    else: throw original Brave error

If activeProvider === "serper":
    try searchSerper()
    on error: throw (no further fallback)
```

To add a third backend, add another `searchX()` function and extend the catch chain.

---

## Sharing Across Machines

To replicate on another computer:

### Step 1: Package the extension

On the source machine:

```bash
cd ~/.pi/agent/extensions
tar czf pi-web-search.tgz web-search.ts pi-search-plugin.md
# or just copy the two files via scp, git, syncthing, whatever
```

### Step 2: Install on the target machine

```bash
# Install pi if not already
# (follow pi's installation instructions for that OS)

# Create extensions directory
mkdir -p ~/.pi/agent/extensions

# Copy the files
scp you@source:web-search.ts ~/.pi/agent/extensions/
scp you@source:pi-search-plugin.md ~/.pi/agent/extensions/
# or extract from tarball
tar xzf pi-web-search.tgz -C ~/.pi/agent/extensions/

# Export API keys (add to ~/.zshrc or ~/.bashrc)
export BRAVE_API_KEY="BSAxxx..."
export SERPER_API_KEY="xxx..."

# Reload shell
source ~/.zshrc   # or: source ~/.bashrc

# Verify
pi
# In pi, run: /search-status
```

### Cross-platform notes

- The extension is pure TypeScript with no OS-specific code. Works on macOS, Linux, Windows (WSL recommended).
- `fetch()` is a Node 18+ global; no need for `node-fetch` or similar.
- pi loads extensions via `jiti`, which handles TypeScript transpilation on the fly — no build step.
- File paths assume `~/.pi/agent/extensions/`. On Windows, that's `C:\Users\<you>\.pi\agent\extensions\`.

### Keeping in sync

Options:
- Git repo: commit both files, push, pull on other machines.
- Syncthing/Dropbox/iCloud: symlink `~/.pi/agent/extensions/` to a synced folder.
- Manual: just `scp` when you change something.

---

## Customization

### Change which models get the tool

Edit the top of `web-search.ts`:

```typescript
const LOCAL_PATTERNS: RegExp[] = [/unsloth/i, /lmstudio/i, /ollama/i];
```

Add or remove patterns. Examples:

```typescript
// Also enable for vLLM-served models
const LOCAL_PATTERNS = [/unsloth/i, /lmstudio/i, /ollama/i, /vllm/i];

// Disable for OpenAI/Anthropic even if proxied through ollama (composite logic)
function isLocalModel(model) {
  if (/^openai\//.test(model.provider)) return false;
  if (/^anthropic\//.test(model.provider)) return false;
  return LOCAL_PATTERNS.some(p => p.test(`${model.provider}/${model.id}`));
}
```

### Change result truncation limit

```typescript
const MAX_RESULT_CHARS = 8000;  // adjust up for hosted models, down for tight contexts
```

### Change default result count

```typescript
const MAX_RESULTS_DEFAULT = 10;   // what the model gets if it doesn't specify
const MAX_RESULTS_LIMIT = 20;     // hard cap (Brave/Serper both support up to ~100)
```

### Add a third backend (e.g., Tavily)

```typescript
async function searchTavily(query: string, count: number): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY env var not set");
  
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: count }),
  });
  
  if (!response.ok) throw new Error(`Tavily API ${response.status}: ${await response.text()}`);
  
  const data = await response.json();
  return (data.results ?? []).map((r: any) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
  }));
}
```

Then add to the fallback chain in the `execute` function and register `tavily` in the provider type union + `/search-provider` handler.

### Change tool description to encourage/discourage usage

The `description` and `promptGuidelines` fields in `pi.registerTool({...})` are what the model reads to decide when to invoke. Tune them to match your preference. Example: be more aggressive:

```typescript
description: "ALWAYS use this for any factual question that might be outdated: weather, news, prices, sports, current events, recent releases, etc. Do not guess if the answer could have changed.",
```

Or more conservative:

```typescript
description: "Use ONLY when the user explicitly asks to look something up online or for current events that cannot be answered from training data.",
```

---

## Troubleshooting

### "BRAVE_API_KEY not set"

The env var isn't reaching pi. Causes:
- Forgot to `source ~/.zshrc` after editing it.
- Launched pi from a different shell (e.g., launched from Finder/dock which doesn't source rc files).
- Typo in env var name (must be exactly `BRAVE_API_KEY`).

Fix:

```bash
# In the shell where you'll launch pi:
echo $BRAVE_API_KEY
# Should print the key. If blank, source your rc file:
source ~/.zshrc
# Now launch:
pi
```

### "Both backends failed"

- Check your Brave key at <https://api.search.brave.com/app/dashboard> — free tier has 2 req/sec rate limit.
- Check your Serper key at <https://serper.dev/dashboard>.
- Test the APIs directly:

```bash
curl -H "X-Subscription-Token: $BRAVE_API_KEY" \
  "https://api.search.brave.com/res/v1/web/search?q=test&count=1"
```

### Extension doesn't load

1. Verify the file is at `~/.pi/agent/extensions/web-search.ts` (note: lowercase `extensions`).
2. In pi, run `/reload` to force re-scan.
3. Check for syntax errors by running `node --check ~/.pi/agent/extensions/web-search.ts` (with TypeScript stripping via `--experimental-strip-types` on Node 22+).
4. Look for error notifications at startup.

### Model doesn't call the tool

Some local models (especially smaller ones like 3B–7B) under-use tools even when available. Fixes:

1. Tune the tool `description` to be more directive (see Customization above).
2. Use a larger or more capable local model (Qwen 2.5 14B+, Llama 3.3 70B, etc. are good at tool calling).
3. Use `/search <query>` manually as a fallback.

### Model calls the tool too much

Tune the description to be more restrictive, or add a `promptGuidelines` line like:

```typescript
promptGuidelines: [
  "Use web_search ONLY for current events or facts you cannot know from training.",
  "Do NOT use web_search for code, math, or general knowledge questions.",
]
```

### Hot reload doesn't pick up changes

Run `/reload` in pi, or fully restart pi (`Ctrl+C` then `pi` again).

---

## API Reference

### `web_search` tool

**Parameters** (TypeBox schema):

```typescript
{
  query: string,           // required
  count?: number,          // optional, 1-20, default 10
}
```

**Returns**:

```typescript
{
  content: [{ type: "text", text: "<formatted markdown results>" }],
  details: {
    provider: "brave" | "serper",
    count: number,         // actual number of results returned
    query: string,         // echoed back
  }
}
```

**Result format**:

```
Found 10 results (via brave):

1. **Bitcoin price today: BTC holds above $95K amid...**
   https://example.com/btc-price
   Date: 2 hours ago
   Bitcoin held steady above $95,000 on Friday after...

2. **...**
   ...
```

Truncated with `[Results truncated]` if over `MAX_RESULT_CHARS`.

### Extension lifecycle

```
pi startup
   │
   ├─► extension factory runs
   │    ├─► pi.registerTool("web_search", ...)
   │    ├─► pi.on("model_select", ...)
   │    ├─► pi.on("session_start", ...)
   │    └─► pi.registerCommand(...) x4
   │
session_start event
   │
   ├─► ctx.getModel() → check pattern → syncToolState(enabled)
   │
user switches model
   │
   ├─► model_select event → re-check pattern → syncToolState(enabled)
   │
LLM decides to call web_search
   │
   ├─► tool_call event
   │    └─► tool execute() runs:
   │         ├─► searchBrave() → on error → searchSerper()
   │         ├─► formatResults()
   │         └─► return content + details
   │
user runs /search <query>
   │
   └─► command handler runs:
        ├─► searchBrave/Serper
        ├─► pi.sendMessage({ customType: "web-search", content, display: true })
        └─► result appears in session
```

### State that lives outside the file

- `activeProvider` (module-level `let`) — persists across tool calls within one pi session. Resets to `"brave"` on pi restart.
- Tool active/inactive state — managed by pi's session state, restored on `/resume`.

---

## License & Credits

MIT, do whatever.

Built against pi's extension API as documented at <https://github.com/badlogic/pi-mono>.

Search backends:
- [Brave Search API](https://brave.com/search/api/)
- [Serper.dev](https://serper.dev/)
