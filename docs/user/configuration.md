# Configuration Guide

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BLADE_PROVIDER` | Provider selection | `auto` (detects from available keys) |
| `BLADE_API_KEY` | API key (provider-agnostic) | - |
| `BLADE_MODEL` | Model override | Provider default |
| `BLADE_BASE_URL` | API base URL override | Provider default |
| `BLADE_DEBUG` | Enable debug output | - |
| `BLADE_PROXY_PORT` | API proxy server port | `8099` |

## Provider-Specific Variables

### DeepSeek
```bash
BLADE_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxx
# Optional:
# BLADE_MODEL=deepseek-chat
# BLADE_BASE_URL=https://api.deepseek.com
```

### OpenAI
```bash
BLADE_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
# BLADE_MODEL=gpt-4o
# BLADE_BASE_URL=https://api.openai.com/v1
```

### Anthropic API
```bash
# ANTHROPIC_API_KEY is auto-detected
ANTHROPIC_API_KEY=sk-ant-xxx
# BLADE_MODEL=sonnet-4
```

### Ollama (Local)
```bash
BLADE_PROVIDER=ollama
# BLADE_MODEL=llama3.2
# OLLAMA_BASE_URL=http://localhost:11434
```

## Config File

`~/.blade/config.json` supports all settings:

```json
{
  "provider": "deepseek",
  "apiKey": "sk-xxx",
  "model": "deepseek-chat",
  "baseUrl": "https://api.deepseek.com",
  "features": {
    "simpleMode": false,
    "disableTelemetry": true,
    "debug": false
  }
}
```

## Using the API Proxy

For providers with non-standard API formats, Blade provides a translation proxy:

```bash
# Terminal 1: Start the proxy
BLADE_PROVIDER=deepseek BLADE_API_KEY=sk-xxx node bin/blade.js --proxy

# Terminal 2: Point the engine at the proxy
ANTHROPIC_BASE_URL=http://localhost:8099 blade "hello"
```
