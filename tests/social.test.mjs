import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('authenticated social reading is traceable, isolated and durable', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'paperpulse-test-'));
  const port = 13991;
  let server;
  let logs = '';
  const start = async () => {
    server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/index.ts'], {
      env: { ...process.env, DATA_DIR: dir, HOST: '127.0.0.1', PORT: String(port), DISABLE_AUTO_SYNC: '1', BOOTSTRAP_ADMIN_PASSWORD: 'test-admin-password' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', b => { logs += b; });
    server.stderr.on('data', b => { logs += b; });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return; } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(logs);
  };
  const stop = async () => {
    if (server.exitCode !== null) return;
    const done = new Promise(r => server.once('exit', r));
    // Kill the launcher and its child on Windows; avoid leaving a test server behind.
    if (process.platform === 'win32') await new Promise(r => spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }).once('exit', r));
    else server.kill();
    await done;
  };
  const request = async (url, token, method = 'GET', body) => {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie') };
  };
  try {
    await start();
    for (const route of ['/api/papers', '/api/users', '/api/auto-sync/config', '/api/kb/anything', '/paper-assets/private.png']) {
      assert.equal((await request(route)).status, 401, route);
    }
    assert.equal((await request('/api/health')).data.storage, undefined);
    const a = await request('/api/auth/register', null, 'POST', { username: 'alice', password: 'test-alice', displayName: '读者甲' });
    const b = await request('/api/auth/register', null, 'POST', { username: 'bob', password: 'test-bob', displayName: '读者乙' });
    assert.equal(a.status, 201);
    assert.match(a.cookie, /HttpOnly/);
    const ta = a.data.token, tb = b.data.token;
    const id = (await request('/api/papers', ta)).data.papers[0].id;
    const route = `/api/papers/${encodeURIComponent(id)}`;
    const heartbeat = { visitId: 'test-session-123456', elapsedSeconds: 3 };
    await request(`${route}/read`, ta, 'POST', heartbeat);
    const repeated = await request(`${route}/read`, ta, 'POST', heartbeat);
    assert.equal(repeated.data.paper.totalVisits, 1);
    assert.equal(repeated.data.paper.totalDwellSeconds, 3);
    await request(`${route}/like`, ta, 'POST');
    await request(`/api/kb/${encodeURIComponent(id)}`, ta, 'POST', { personalTags: ['我的标签'], readingStatus: 'mastered' });
    const comment = await request(`${route}/comments`, ta, 'POST', { content: '甲的评论', author: '伪造名字' });
    assert.equal(comment.data.comment.userId, a.data.user.id);
    assert.equal(comment.data.comment.author, '读者甲');
    const reply = await request(`${route}/comments`, tb, 'POST', { content: '乙的回复', parentId: comment.data.comment.id, replyToAuthor: '伪造回复对象' });
    assert.equal(reply.data.comment.replyToAuthor, '读者甲');
    assert.equal((await request(`${route}/comments/${comment.data.comment.id}`, tb, 'PUT', { content: '越权修改' })).status, 403);
    assert.equal((await request(`${route}/comments/${comment.data.comment.id}`, tb, 'DELETE')).status, 403);
    await request(`${route}/comments/${comment.data.comment.id}/like`, tb, 'POST');
    const view = (await request(route, tb)).data.paper;
    assert.equal(view.likedByMe, false);
    assert.equal(view.inMyKb, false);
    assert.equal(view.readingStatus, 'unread');
    assert.equal(view.likers[0].userId, a.data.user.id);
    assert.equal(view.collectors[0].userId, a.data.user.id);
    assert.equal(view.readers.find(r => r.userId === a.data.user.id).commentCount, 1);
    assert.equal(view.comments.find(c => c.id === comment.data.comment.id).likes[0].userId, b.data.user.id);
    assert.equal((await request('/api/papers?scope=my_kb', tb)).data.total, 0);
    assert.equal((await request(`/api/papers?interactedBy=${a.data.user.id}`, tb)).data.total, 1);
    assert.equal((await request('/api/users/' + b.data.user.id, tb, 'PUT', { role: 'admin' })).data.user.role, 'member');
    await stop();
    await start();
    const durable = (await request(route, ta)).data.paper;
    assert.equal(durable.likedByMe, true);
    assert.equal(durable.totalVisits, 1);
    assert.equal(durable.totalDwellSeconds, 3);
    assert.equal(durable.inMyKb, true);
    assert.equal(durable.comments.length, view.comments.length);
    const rootLogin = await request('/api/auth/login', null, 'POST', { username: 'admin', password: 'test-admin-password' });
    assert.equal(rootLogin.status, 200);
    const root = rootLogin.data.token;
    assert.equal((await request('/api/users', tb, 'POST', { username: 'forbidden', password: 'test' })).status, 403);
    const managed = await request('/api/users', root, 'POST', { username: 'managed', password: 'test-managed', role: 'member' });
    assert.equal(managed.status, 201);
    const managedId = managed.data.user.id;
    const oldLogin = await request('/api/auth/login', null, 'POST', { username: 'managed', password: 'test-managed' });
    const updated = await request('/api/users/' + managedId, root, 'PUT', { username: 'managed-renamed', displayName: '托管用户', userTags: ['测试方向'], role: 'admin', newPassword: 'updated-password' });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.user.role, 'admin');
    assert.equal(updated.data.user.username, 'managed-renamed');
    assert.equal((await request('/api/users', oldLogin.data.token)).status, 401);
    const newLogin = await request('/api/auth/login', null, 'POST', { username: 'managed-renamed', password: 'updated-password' });
    assert.equal(newLogin.status, 200);
    assert.equal((await request('/api/users/' + managedId, root, 'PUT', { username: 'bob' })).status, 400);
    assert.equal((await request('/api/users/' + managedId, root, 'PUT', { newPassword: '123' })).status, 400);
    assert.equal((await request('/api/users/usr-admin', root, 'PUT', { role: 'member' })).status, 400);
    assert.equal((await request('/api/users/usr-admin', root, 'DELETE')).status, 400);
    assert.equal((await request('/api/users/' + managedId, root, 'PUT', { role: 'member' })).data.user.role, 'member');
    assert.equal((await request('/api/users/' + managedId, tb, 'DELETE')).status, 403);
    assert.equal((await request('/api/users/' + managedId, root, 'DELETE')).status, 200);
    assert.equal((await request('/api/users', newLogin.data.token)).status, 401);
    await request('/api/auth/logout', ta, 'POST');
    assert.equal((await request(route, ta)).status, 401);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
