# Adding a New Provider

## Step-by-Step

### 1. Create the adapter file

```bash
touch src/providers/groq.ts
```

### 2. Implement the ProviderAdapter

```typescript
// src/providers/groq.ts
import { ProviderAdapter, type BladeMessage, type BladeToolDefinition,
         type BladeResponse, type BladeStreamEvent } from './index.js';

export class GroqProvider extends ProviderAdapter {
  readonly name = 'groq' as const;
  readonly displayName = 'Groq';
  readonly defaultModel = 'llama-3.3-70b-versatile';

  constructor(
    apiKey: string,
    model = 'llama-3.3-70b-versatile',
    baseUrl = 'https://api.groq.com/openai/v1',
  ) {
    super(apiKey, model, baseUrl);
  }

  async chat(system: string, messages: BladeMessage[],
             tools?: BladeToolDefinition[]): Promise<BladeResponse> {
    // Implementation using fetch() to the provider's API
    const body = {
      model: this.getModel(),
      messages: [
        { role: 'system', content: system },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ],
    };

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return {
      content: data.choices[0].message.content,
      stop_reason: 'stop',
    };
  }

  async *chatStream(system: string, messages: BladeMessage[],
                    tools?: BladeToolDefinition[]): AsyncGenerator<BladeStreamEvent> {
    // Streaming implementation
    yield { type: 'done', response: { content: '', stop_reason: 'stop' } };
  }

  async validate(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
}
```

### 3. Register in PROVIDER_REGISTRY

In `src/providers/index.ts`:

```typescript
export const PROVIDER_REGISTRY: Record<ProviderName, ProviderConfig> = {
  // ... existing providers ...
  groq: {
    name: 'groq',
    displayName: 'Groq',
    apiKeyEnv: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
  },
};
```

### 4. Add to ProviderFactory

In `src/providers/factory.ts`:

```typescript
import { GroqProvider } from './groq.js';

// In the switch statement:
case 'groq':
  return new GroqProvider(apiKey, model, baseUrl);
```

### 5. Update ProviderName type

In `src/providers/index.ts`:

```typescript
export type ProviderName = 'anthropic' | 'deepseek' | 'openai' | 'ollama' | 'groq';
```

### 6. Export from index.ts

```typescript
export { GroqProvider } from './providers/groq.js';
```

### 7. Write tests

```typescript
// In tests/providers.test.ts
describe('Groq Provider', () => {
  it('should create instance', () => {
    const p = new GroqProvider('test-key');
    expect(p.name).toBe('groq');
  });
});
```
