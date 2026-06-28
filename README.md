# pi Web Search Plugin

A native web search extension for [pi](https://github.com/badlogic/pi-mono) that gives local models live internet access via **Brave Search** (primary) and **Serper.dev** (fallback).

Auto-enabled only when the active model looks "local" (`unsloth`, `lmstudio`, or `ollama`). Stays disabled for hosted models that already have provider-native search (Gemini, Kimi, DeepSeek, GLM, Grok, Claude, GPT-4o, etc.).

---

## ⚡ Quick Install (30 seconds)

```bash
# 1. Copy the extension into pi's extensions folder
mkdir -p ~/.pi/agent/extensions
curl -o ~/.pi/agent/extensions/web-search.ts https://raw.githubusercontent.com/mypbs/pi-search-plugin/main/web-search.ts

# 2. Get API keys (both have free tiers)
#    Brave:  https://brave.com/search/api/        (free, 2,000/month)
#    Serper: https://serper.dev/                  (paid, cheap)

# 3. Set the keys (pick ONE of the two methods)
```

### Option A: Shell exports (recommended for personal use)

Add to `~/.zshrc` or `~/.bashrc`:

```bash
export BRAVE_API_KEY="your_brave_key_here"
export SERPER_API_KEY="your_serper_key_here"
```

Then `source ~/.zshrc` and restart pi.

### Option B: `.env` file (recommended for portability)

```bash
# Create your local .env from the template
cp .env.example ~/.pi/agent/extensions/.env
nano ~/.pi/agent/extensions/.env    # paste in your real keys
```

Restart pi. Done.

---

## ✅ Verify It Worked

Launch pi and run:

```
/search-status
```

You should see:

```
Provider:    brave  (fallback: serper)
BRAVE key:   ✓ set
SERPER key:  ✓ set
Model:       your-model/here
Local match: ✗ no        (or ✓ yes if you're on a local model)
Tool active: ✗ no        (or ✓ yes)
```

---

## 🎯 Usage

**Automatic** — switch to a local model (`ollama`, `lmstudio`, `unsloth`), and the `web_search` tool appears in its tool list. The model uses it whenever your question is about current information.

**Manual** — works on any model:
```
/search bitcoin price today
/search weather tokyo tomorrow
/search latest pi release notes
```

**Force on/off**:
```
/search-force on
/search-force off
/search-force auto
```

---

## 🧩 Features

- ✅ Native tool (no `/skill:` invocation needed)
- ✅ Dual-backend fallback (Brave → Serper)
- ✅ Smart auto-detection (local models only)
- ✅ Reactive to model switches (no restart needed)
- ✅ Result truncation for small context windows
- ✅ Zero npm dependencies (single file)
- ✅ Works with shell exports OR `.env` files (no override)

---

## 📚 Documentation

See [`docs/pi-search-plugin.md`](docs/pi-search-plugin.md) for the full reference:

- Slash command reference
- How auto-detection works
- Customization (add a 3rd backend, change patterns, etc.)
- Sharing across machines
- Troubleshooting
- API reference

---

## 🔐 Security & Privacy

- **No hardcoded keys.** The extension reads from `process.env` only.
- **No telemetry.** It makes one HTTP request per search to the configured backend.
- **`.env` is gitignored.** The repo ships with `.env.example` (placeholders only).
- **No key collection.** This repo will never ask for, log, or transmit your API keys.

---

## 🤝 Contributing

Issues and PRs welcome. For new search backends, see the "Add a third backend" section in `docs/pi-search-plugin.md`.

---

## 📄 License

MIT © 2026 [mypbs](https://github.com/mypbs)