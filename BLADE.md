# BLADE.md

> This file provides guidance to Blade (blade CLI) when working with this repository.

## Project Overview

Blade is a thin-shell AI engineering agent â€?a fork of the Blade engine architecture with multi-provider support.

## Quick Start

```bash
# Build
bun run build

# Test
bun test

# Run
BLADE_API_KEY=sk-xxx blade "hello"
```

## Key Files

| File | Purpose |
|------|---------|
| `src/providers/` | Provider adapters (DeepSeek/OpenAI/Anthropic/Ollama) |
| `bin/blade.js` | CLI entry point |
| `engine/blade-engine.js` | Core engine (based on Blade engine compiled output) |

## Conventions

- TypeScript with `.js` import extensions (ESM compatibility)
- `bun` for build and test
- `ProviderAdapter` abstract class for all providers

