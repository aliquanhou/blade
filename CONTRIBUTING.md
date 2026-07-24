# Contributing to Blade

## Development Setup

```bash
# Clone
git clone https://github.com/yuqiuhong/blade.git
cd blade

# Install dependencies
npm install -g bun

# Build
bun run build

# Test
bun test
```

## Project Structure

```
src/
├── index.ts          # Main entry point (Blade class)
├── providers/        # Provider adapters
│   ├── index.ts      # Types + ProviderAdapter base class
│   ├── deepseek.ts   # DeepSeek adapter
│   ├── openai.ts     # OpenAI adapter
│   ├── anthropic.ts  # Anthropic adapter
│   ├── ollama.ts     # Ollama adapter
│   └── factory.ts    # ProviderFactory
└── proxy-server.ts   # API translation proxy
```

## Adding a New Provider

1. Create `src/providers/<name>.ts`
2. Extend `ProviderAdapter` abstract class
3. Implement `chat()`, `chatStream()`, `validate()`
4. Register in `PROVIDER_REGISTRY` in `index.ts`
5. Add to `ProviderFactory` in `factory.ts`
6. Write tests in `tests/providers.test.ts`

## Coding Standards

- TypeScript with ESM (`.js` import extensions)
- 2-space indentation
- Descriptive variable names
- JSDoc comments for public APIs
- Tests for all provider methods

## Commit Convention

```
feat: description     # New feature
fix: description      # Bug fix
docs: description     # Documentation
chore: description    # Maintenance
test: description     # Tests
refactor: description # Refactoring
```

## Pull Request Process

1. Ensure tests pass: `bun test`
2. Build the project: `bun run build`
3. Update CHANGELOG.md
4. Submit PR with description of changes
