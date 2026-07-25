/**
 * ⚔️ 错误重试测试
 *
 * 验证错误分类、重试策略、退避计算。
 */

import { describe, it, expect } from 'bun:test';
import {
  classifyError,
  shouldRetry,
  getRetryDelay,
  getRetryConfig,
  formatErrorMessage,
} from '../../src/engine/error-handler.js';

describe('ErrorHandler', () => {
  it('should classify rate limit errors', () => {
    expect(classifyError(new Error('Rate limit exceeded'))).toBe('rate_limit');
    expect(classifyError(new Error('429 Too Many Requests'))).toBe('rate_limit');
    expect(classifyError('too many requests')).toBe('rate_limit');
  });

  it('should classify auth errors', () => {
    expect(classifyError(new Error('401 Unauthorized'))).toBe('auth_error');
    expect(classifyError(new Error('Invalid API key'))).toBe('auth_error');
    expect(classifyError('403 Forbidden')).toBe('auth_error');
  });

  it('should classify timeout errors', () => {
    expect(classifyError(new Error('Timeout'))).toBe('timeout');
    expect(classifyError('timed out')).toBe('timeout');
    expect(classifyError('ECONNABORTED')).toBe('timeout');
  });

  it('should classify server errors', () => {
    expect(classifyError(new Error('500 Internal Server Error'))).toBe('server_error');
    expect(classifyError('502 Bad Gateway')).toBe('server_error');
    expect(classifyError('Service Unavailable')).toBe('server_error');
  });

  it('should classify prompt too long errors', () => {
    expect(classifyError(new Error('Prompt is too long'))).toBe('prompt_too_long');
    expect(classifyError('context length exceeded')).toBe('prompt_too_long');
    expect(classifyError('max tokens exceeded')).toBe('prompt_too_long');
  });

  it('should classify unknown errors', () => {
    expect(classifyError(new Error('Something weird happened'))).toBe('unknown');
    expect(classifyError(null)).toBe('unknown');
    expect(classifyError(undefined)).toBe('unknown');
  });

  it('should determine retry eligibility', () => {
    expect(shouldRetry(new Error('Rate limit'))).toBe(true);
    expect(shouldRetry(new Error('Timeout'))).toBe(true);
    expect(shouldRetry(new Error('500 error'))).toBe(true);
    expect(shouldRetry(new Error('ECONNREFUSED'))).toBe(true);
    expect(shouldRetry(new Error('Auth failed'))).toBe(false);
    expect(shouldRetry(new Error('Prompt too long'))).toBe(false);
  });

  it('should calculate exponential backoff delay', () => {
    const delay1 = getRetryDelay(0);
    const delay2 = getRetryDelay(1);
    const delay3 = getRetryDelay(2);

    // Each attempt should increase delay (approximately)
    expect(delay2).toBeGreaterThanOrEqual(delay1);
    expect(delay3).toBeGreaterThanOrEqual(delay2);
  });

  it('should respect max delay', () => {
    const delay = getRetryDelay(10, { maxRetries: 10, baseDelayMs: 1000, maxDelayMs: 5000 });
    expect(delay).toBeLessThanOrEqual(5000);
  });

  it('should provide retry config for different categories', () => {
    const rateLimitConfig = getRetryConfig('rate_limit');
    expect(rateLimitConfig.maxRetries).toBe(5);

    const timeoutConfig = getRetryConfig('timeout');
    expect(timeoutConfig.maxRetries).toBe(2);
  });

  it('should format user-readable error messages', () => {
    const rateMsg = formatErrorMessage(new Error('Rate limit'));
    expect(rateMsg.length).toBeGreaterThan(0);
    expect(rateMsg).toContain('请求频率');

    const authMsg = formatErrorMessage(new Error('Auth failed'));
    expect(authMsg).toContain('API Key');

    const unknownMsg = formatErrorMessage(new Error('Unknown error'));
    expect(unknownMsg).toContain('未知错误');
  });

  it('should produce jitter in retry delays', () => {
    // Multiple calls should produce different delays due to jitter
    const delays = new Set<number>();
    for (let i = 0; i < 20; i++) {
      delays.add(getRetryDelay(1));
    }
    // With jitter, we should see at least some variation
    expect(delays.size).toBeGreaterThan(1);
  });
});
