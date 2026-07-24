# Blade Architecture

## Design Philosophy

Blade follows the **thin-shell** principle:

> **Model handles intelligence, shell handles communication.**

The CLI is a thin wrapper — all intelligence comes from the underlying AI model. Blade doesn't add its own reasoning or decision-making layer; it simply provides the tools and context for the model to do its work.

## Three-Layer Architecture

```
┌──────────────────────────────────────────┐
│  CLI Layer (bin/blade.js)                │
│  • Provider configuration                │
│  • Environment variable mapping          │
│  • Engine lifecycle                      │
├──────────────────────────────────────────┤
│  Engine Layer (engine/blade-engine.js)   │
│  • QueryEngine — core interaction loop   │
│  • Tool system — 20+ built-in tools      │
│  • Context management — compression      │
│  • Permission system                     │
├──────────────────────────────────────────┤
│  Provider Layer (src/providers/)         │
│  • ProviderAdapter abstract class        │
│  • DeepSeek / OpenAI / Ollama + more    │
│  • API Translation Proxy                 │
└──────────────────────────────────────────┘
```

## Key Components

### ProviderAdapter

Abstract base class for all providers:

```typescript
abstract class ProviderAdapter {
  abstract chat(system, messages, tools?): Promise<BladeResponse>
  abstract chatStream(system, messages, tools?): AsyncGenerator
  abstract validate(): Promise<{ ok, error? }>
}
```

### QueryEngine

The engine's core loop manages:
1. Receive user input
2. Build context (system prompt + messages)
3. Call the model API
4. Execute tool calls
5. Repeat until completion

### Tool System

Each tool is a self-contained module:
- **Prompt**: Description of when and how to use the tool
- **Validation**: Input schema
- **Execution**: The actual tool logic
- **Result formatting**: How to present results back to the model

## Adding a New Provider

1. Create `src/providers/<name>.ts`
2. Extend `ProviderAdapter`
3. Register in `PROVIDER_REGISTRY`
4. Add to `ProviderFactory`
5. Write tests

See [Adding Providers](adding-providers.md) for details.
