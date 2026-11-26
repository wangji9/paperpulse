import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('LLM endpoint resolution, friendly error classification, and per-user CCSwitch profiles work accurately', () => {
  const tmpData = mkdtempSync(path.join(tmpdir(), 'paperpulse-llm-test-'));
  try {
    const child = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `
      import assert from 'node:assert/strict';
      import {
        activateUserLlmProfile,
        classifyHttpError,
        classifyNetworkError,
        deleteUserLlmProfile,
        listUserLlmProfiles,
        resolveLlmEndpoint,
        upsertUserLlmProfile,
      } from './server/llmQa.ts';

      assert.equal(resolveLlmEndpoint('https://api.deepseek.com', 'openai'), 'https://api.deepseek.com/v1/chat/completions');
      assert.equal(resolveLlmEndpoint('https://api.deepseek.com/v1/', 'openai'), 'https://api.deepseek.com/v1/chat/completions');
      assert.equal(
        resolveLlmEndpoint('https://open.bigmodel.cn/api/paas/v4', 'openai'),
        'https://open.bigmodel.cn/api/paas/v4/chat/completions'
      );
      assert.equal(resolveLlmEndpoint('https://api.anthropic.com', 'anthropic'), 'https://api.anthropic.com/v1/messages');

      const authErr = classifyHttpError(401, JSON.stringify({ error: { message: 'Incorrect API key' } }), 'gpt-4o-mini');
      assert.equal(authErr.code, 'AUTH_ERROR');
      assert.match(authErr.error, /API Key/);

      const notFound = classifyHttpError(404, '{}', 'bad-model');
      assert.equal(notFound.code, 'NOT_FOUND');
      assert.match(notFound.hint, /Base URL/);

      const dnsErr = classifyNetworkError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND no.such.host' });
      assert.equal(dnsErr.code, 'DNS_ERROR');

      const timeoutErr = classifyNetworkError({ name: 'AbortError', message: 'The operation was aborted' });
      assert.equal(timeoutErr.code, 'TIMEOUT');

      const u1 = 'test-u1';
      const u2 = 'test-u2';
      const first = upsertUserLlmProfile(u1, {
        name: 'DeepSeek 主力',
        protocol: 'openai',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-secret-1234567890abcd',
        model: 'deepseek-chat',
      });
      assert.equal(first.profile.isActive, true);
      assert.ok(!first.profile.apiKeyMasked.includes('1234567890'));
      assert.equal(listUserLlmProfiles(u2).length, 0);

      const second = upsertUserLlmProfile(u1, {
        name: 'Claude 中转',
        protocol: 'anthropic',
        baseUrl: 'https://relay.example.com',
        apiKey: 'sk-ant-9999888877776666',
        model: 'claude-3-5-sonnet-20241022',
        isActive: false,
      });
      assert.equal(second.profiles.length, 2);

      const switched = activateUserLlmProfile(u1, second.profile.id);
      assert.equal(switched.find((p) => p.id === second.profile.id)?.isActive, true);
      assert.equal(switched.find((p) => p.id === first.profile.id)?.isActive, false);

      deleteUserLlmProfile(u1, second.profile.id);
      const afterDel = deleteUserLlmProfile(u1, first.profile.id);
      assert.equal(afterDel.length, 0);
      console.log('OK');
      `,
      ],
      { encoding: 'utf8', env: { ...process.env, DATA_DIR: tmpData } }
    );
    assert.equal(child.status, 0, child.stderr || child.stdout);
    assert.match(child.stdout, /OK/);
  } finally {
    rmSync(tmpData, { recursive: true, force: true });
  }
});
