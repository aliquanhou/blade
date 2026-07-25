/**
 * ⚔️ Blade Engine — Error Handler
 *
 * 错误分类、重试策略、退避计算。
 * 参考 Open-ClaudeCode services/api/errors.ts 简化实现。
 *
 * Copyright (c) 2026 Blade Contributors
 * Licensed under MIT License
 */

export type ErrorCategory =
  | 'rate_limit'
  | 'auth_error'
  | 'timeout'
  | 'server_error'
  | 'prompt_too_long'
  | 'tool_error'
  | 'provider_unavailable'
  | 'unknown';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

/**
 * 分类错误
 */
export function classifyError(error: unknown): ErrorCategory {
  if (!error) return 'unknown';

  const msg = String(error).toLowerCase();

  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')) {
    return 'rate_limit';
  }
  if (msg.includes('auth') || msg.includes('401') || msg.includes('403') || msg.includes('api key')) {
    return 'auth_error';
  }
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('econnaborted')) {
    return 'timeout';
  }
  if (msg.includes('service unavail') || msg.includes('5') && (msg.includes('500') || msg.includes('502') || msg.includes('503'))) {
    return 'server_error';
  }
  if (msg.includes('prompt is too long') || msg.includes('context length') || msg.includes('max tokens')) {
    return 'prompt_too_long';
  }
  if (msg.includes('tool') || msg.includes('execution error') || msg.includes('enotfound')) {
    return 'tool_error';
  }
  if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('dns')) {
    return 'provider_unavailable';
  }

  return 'unknown';
}

/**
 * 判断是否应该重试
 */
export function shouldRetry(error: unknown): boolean {
  const category = classifyError(error);
  return (
    category === 'rate_limit' ||
    category === 'timeout' ||
    category === 'server_error' ||
    category === 'provider_unavailable'
  );
}

/**
 * 获取退避延迟（指数退避 + 随机抖动）
 */
export function getRetryDelay(attempt: number, config: RetryConfig = DEFAULT_RETRY): number {
  const baseDelay = Math.min(
    config.baseDelayMs * Math.pow(2, attempt),
    config.maxDelayMs,
  );
  // Add jitter: ±10%
  const jitter = baseDelay * 0.1 * (Math.random() * 2 - 1);
  return Math.round(Math.min(baseDelay + jitter, config.maxDelayMs));
}

/**
 * 获取重试配置
 */
export function getRetryConfig(category: ErrorCategory): RetryConfig {
  switch (category) {
    case 'rate_limit':
      return { maxRetries: 5, baseDelayMs: 2000, maxDelayMs: 60000 };
    case 'timeout':
      return { maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 10000 };
    case 'server_error':
      return { maxRetries: 3, baseDelayMs: 2000, maxDelayMs: 30000 };
    case 'provider_unavailable':
      return { maxRetries: 2, baseDelayMs: 5000, maxDelayMs: 30000 };
    default:
      return DEFAULT_RETRY;
  }
}

/**
 * 格式化错误信息（用户可读）
 */
export function formatErrorMessage(error: unknown): string {
  const category = classifyError(error);
  const msg = String(error);

  switch (category) {
    case 'rate_limit':
      return '请求频率过高，请稍后再试。';
    case 'auth_error':
      return `API 认证失败。请检查 API Key 是否配置正确。\n详情: ${msg}`;
    case 'timeout':
      return '请求超时，请检查网络连接或稍后重试。';
    case 'server_error':
      return '服务端错误，请稍后重试。';
    case 'prompt_too_long':
      return '对话上下文过长，请开始新会话或简化问题。';
    case 'tool_error':
      return `工具执行错误: ${msg}`;
    case 'provider_unavailable':
      return `AI 提供商不可用。请检查网络连接或切换 Provider。`;
    default:
      return `未知错误: ${msg}`;
  }
}
