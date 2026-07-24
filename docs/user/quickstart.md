# Quickstart Guide

Get Blade running in 5 minutes.

## Installation

```bash
npm install -g blade-ai
```

## Set Up a Provider

### Option 1: DeepSeek (Recommended for new users)

```bash
export BLADE_PROVIDER=deepseek
export DEEPSEEK_API_KEY=sk-your-key-here
blade "Hello, what can you do?"
```

### Option 2: API Key

```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
blade "Hello, what can you do?"
```

### Option 3: OpenAI

```bash
export BLADE_PROVIDER=openai
export OPENAI_API_KEY=sk-your-key-here
blade "Hello, what can you do?"
```

## First Chat

```bash
# Basic
blade "List the files in the current directory"

# Code generation
blade "Create a React component for a todo list"

# Code analysis
blade "Review the code in this project for potential bugs"

# File operations
blade "Read package.json and tell me about the dependencies"
```

## Configuration File

Create `~/.blade/config.json`:

```json
{
  "provider": "deepseek",
  "apiKey": "sk-your-key-here",
  "model": "deepseek-chat"
}
```

## Next Steps

- Read the [Configuration Guide](configuration.md) for all options
- See the [Tool List](tools.md) for available tools
- Browse [Examples](../examples/basic-chat.md) for common use cases
