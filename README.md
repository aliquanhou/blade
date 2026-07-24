# ⚔️ Blade — 薄壳 AI 工程智能体

> **模型负责智能，壳只负责传递。**

Blade 是一个轻量、开放、可扩展的 AI 工程智能体 CLI。
基于薄壳架构设计——核心仅负责：用户输入 → 调用模型 → 执行工具 → 返回结果。
所有 Provider 即插即用，不绑定任何厂商。

[![GitHub Release](https://img.shields.io/github/v/release/aliquanhou/blade)](https://github.com/aliquanhou/blade/releases)
[![npm version](https://img.shields.io/npm/v/blade-ai.svg)](https://www.npmjs.com/package/blade-ai)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests](https://github.com/aliquanhou/blade/actions/workflows/test.yml/badge.svg)](https://github.com/aliquanhou/blade/actions)
[![GitHub stars](https://img.shields.io/github/stars/aliquanhou/blade)](https://github.com/aliquanhou/blade)

```bash
npm install -g blade-ai
# 或
bun install -g blade-ai
```

## Provider 架构

```
┌─────────────────────────────────────────┐
│  blade CLI                              │
│  bin/blade.js                           │
│  ├── --version / --help                 │
│  ├── --proxy      启动 API 翻译代理     │
│  └── [prompt]     启动引擎              │
├─────────────────────────────────────────┤
│  blade-engine.js (核心引擎)              │
│  └── ANTHROPIC_BASE_URL → proxy         │
├─────────────────────────────────────────┤
│  Provider Adapters (TypeScript)         │
│  src/providers/                         │
│  ├── index.ts       接口 + 类型定义     │
│  ├── factory.ts     工厂模式创建        │
│  ├── anthropic.ts   原生 API 适配器      │
│  ├── deepseek.ts    OpenAI 兼容格式     │
│  ├── openai.ts      OpenAI 兼容格式     │
│  └── ollama.ts      Ollama 本地模型     │
├─────────────────────────────────────────┤
│  API Translation Proxy                  │
│  src/providers/proxy-server.ts          │
│  └── /v1/messages → provider.chat()     │
└─────────────────────────────────────────┘
```

### 两种使用模式

**模式 1：直接替换环境变量（无需代理）**
```bash
# 只需设置 ANTHROPIC_BASE_URL 指向兼容 API
ANTHROPIC_API_KEY=sk-xxx ANTHROPIC_BASE_URL=https://api.deepseek.com/v1 blade
```
适用于 API 格式兼容的 Provider。

**模式 2：API 翻译代理（推荐）**
```bash
# 终端 1：启动代理
BLADE_PROVIDER=deepseek BLADE_API_KEY=sk-xxx node bin/blade.js --proxy

# 终端 2：使用 Blade（引擎走代理）
ANTHROPIC_BASE_URL=http://localhost:8099 blade
```
适用于需要格式转换的 Provider。

## 核心哲学

| 原则 | 说明 |
|------|------|
| **薄壳** | CLI 只是一个薄薄的壳，所有智能来自背后的模型 |
| **可替换** | Provider 即插即用，不绑定任何厂商 |
| **透明** | 不锁定、不遥测（默认禁用）、不厂商绑定 |

## 快速开始

```bash
# 使用 API Key
BLADE_API_KEY=sk-ant-xxx blade "帮我写一个 React 组件"

# 使用 DeepSeek
BLADE_PROVIDER=deepseek BLADE_API_KEY=sk-xxx blade "分析这段代码"

# 本地模型 (Ollama)
BLADE_PROVIDER=ollama blade "你好"
```

## 配置

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `BLADE_PROVIDER` | Provider 选择 | `auto`（自动检测） |
| `BLADE_API_KEY` | API 密钥 | - |
| `BLADE_MODEL` | 模型名称 | Provider 默认 |
| `BLADE_BASE_URL` | API 基础 URL | Provider 默认 |
| `BLADE_DEBUG` | 调试模式 | - |

### 配置文件

`~/.blade/config.json`:

```json
{
  "provider": "deepseek",
  "apiKey": "sk-xxx",
  "model": "deepseek-chat",
  "baseUrl": "https://api.deepseek.com/v1"
}
```

## 文档

| 文档 | 说明 |
|------|------|
| [快速入门](docs/user/quickstart.md) | 5 分钟上手 |
| [配置指南](docs/user/configuration.md) | 环境变量 + 配置文件 |
| [工具列表](docs/user/tools.md) | 所有内置工具 |
| [架构设计](docs/developer/architecture.md) | 薄壳架构说明 |
| [添加 Provider](docs/developer/adding-providers.md) | 扩展新模型 |
| [基础示例](docs/examples/basic-chat.md) | 常见使用场景 |

## 支持的 Provider

| Provider | 环境变量 | 默认模型 |
|----------|----------|----------|
| API Key | `ANTHROPIC_API_KEY` | sonnet-4 |
| DeepSeek | `DEEPSEEK_API_KEY` | deepseek-chat |
| OpenAI | `OPENAI_API_KEY` | gpt-4o |
| Ollama | - | llama3 |

## 项目结构

```
blade/
├── bin/
│   ├── blade.js          # CLI 入口（包装引擎+Provider配置）
│   └── patch-engine.js   # 引擎品牌替换脚本
├── engine/
│   ├── blade-engine.js   # 核心引擎（编译版）
│   └── blade-engine.js.bak  # 原始引擎备份
├── src/
│   └── providers/        # Provider 抽象层
├── config/
│   └── defaults.json     # 默认配置
└── package.json          # Blade 项目清单
```

## 架构

```
┌──────────────┐
│   blade CLI  │  ← Provider 配置、环境变量映射
├──────────────┤
│  blade-engine│  ← 核心引擎（QueryEngine + 工具系统）
├──────────────┤
│   Provider   │  ← DeepSeek / OpenAI / Ollama / ...
└──────────────┘
```

## 许可证

MIT License

---

**Blade** — 不是又一个 AI CLI，是薄壳哲学的实践。
