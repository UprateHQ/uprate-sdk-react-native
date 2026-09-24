const test = require('node:test');
const assert = require('node:assert/strict');
const { createUprateClient, UprateError } = require('../dist/index.cjs');

const itemId = 'b2cb46ad-6d32-4bb5-9d9d-639bbf171249';
const feature = { uuid: itemId, title: 'Dark mode', description: null, status: 'pending', created_at: '2026-01-01T00:00:00Z' };
const feedback = { uuid: itemId, rating: 4, message: 'Looks good', status: 'received', created_at: '2026-01-01T00:00:00Z' };
const roadmap = {
  settings: { voting_enabled: true, show_vote_count: false, voting_excluded_statuses: ['done'] },
  items: [{ uuid: itemId, title: 'Dark mode', description: null, status: 'planned', status_label: 'Planned', has_voted: false, voting_disabled: false }],
};

function sdk(fetch, extra = {}) {
  const client = createUprateClient({ apiKey: 'uprt_pub_test', platform: 'android', appVersion: '1.2.3', fetch, ...extra });
  client.setUserContext({ userId: 'user-123', email: 'jane@example.com', name: 'Jane' });
  return client;
}

test('all eight operations use the SDK API contract and preserve response shapes', async () => {
  const calls = [];
  const responses = [roadmap, { voted: true, votes_count: 1 }, { voted: false, votes_count: 0 },
    feature, { requests: [feature] }, feedback, { feedback: [{ ...feedback, sentiment: null }] },
    { uuid: itemId, status: 'recorded', expires_at: '2026-01-04T00:00:00Z' }];
  const client = sdk(async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(responses.shift()), { status: 200 });
  }, { deviceMetadataProvider: () => ({ model: 'Pixel', locale: 'en-US' }) });

  assert.equal((await client.roadmap.getItems()).items[0].uuid, itemId);
  assert.deepEqual(await client.roadmap.vote(itemId), { voted: true, votes_count: 1 });
  assert.deepEqual(await client.roadmap.removeVote(itemId), { voted: false, votes_count: 0 });
  assert.equal((await client.roadmap.submitRequest('Dark mode')).uuid, itemId);
  assert.equal((await client.roadmap.getMyRequests()).length, 1);
  assert.equal((await client.feedback.submit({ message: 'Looks good', rating: 4, metadata: { screen: 'home' } })).status, 'received');
  assert.equal((await client.feedback.getMySubmissions())[0].sentiment, null);
  assert.equal((await client.reviews.recordPrompt()).status, 'recorded');

  assert.deepEqual(calls.map(({ url, init }) => [init.method, new URL(url).pathname]), [
    ['GET', '/api/sdk/v1/roadmap'],
    ['POST', `/api/sdk/v1/roadmap/items/${itemId}/vote`],
    ['DELETE', `/api/sdk/v1/roadmap/items/${itemId}/vote`],
    ['POST', '/api/sdk/v1/roadmap/requests'],
    ['GET', '/api/sdk/v1/roadmap/requests'],
    ['POST', '/api/sdk/v1/feedback'],
    ['GET', '/api/sdk/v1/feedback'],
    ['POST', '/api/sdk/v1/review-signals'],
  ]);
  for (const { init } of calls) {
    assert.equal(init.headers.Authorization, 'Bearer uprt_pub_test');
    assert.equal(init.headers['X-SDK-User-Id'], 'user-123');
    assert.equal(init.headers['X-SDK-Device-Platform'], 'android');
    assert.equal(init.headers['X-SDK-App-Version'], '1.2.3');
  }
  assert.deepEqual(JSON.parse(calls[5].init.body).metadata, {
    device: { model: 'Pixel', locale: 'en-US' }, custom: { screen: 'home' },
  });
  assert.ok(new Date(JSON.parse(calls[7].init.body).triggered_at).getTime() > 0);
});

test('user context is required and does not survive logout or a pending metadata provider', async () => {
  let releaseMetadata;
  const calls = [];
  const client = createUprateClient({
    apiKey: 'uprt_pub_test', platform: 'ios', fetch: async (...args) => {
      calls.push(args);
      return new Response(JSON.stringify(feedback));
    },
    deviceMetadataProvider: () => new Promise((resolve) => { releaseMetadata = resolve; }),
  });
  await assert.rejects(client.feedback.getMySubmissions(), (error) => error.code === 'user_context_not_set');
  client.setUserContext({ userId: 'alice' });
  const pending = client.feedback.submit({ message: 'Hello' });
  client.clearUserContext();
  client.setUserContext({ userId: 'bob' });
  releaseMetadata({ model: 'iPhone' });
  await assert.rejects(pending, (error) => error.code === 'user_context_changed');
  assert.equal(calls.length, 0);
  client.clearUserContext();
  await assert.rejects(client.roadmap.getItems(), (error) => error.code === 'user_context_not_set');
});

test('metadata opt-out omits the provider and all device data', async () => {
  const bodies = [];
  const client = sdk(async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify(bodies.length === 1 ? feedback :
      { uuid: itemId, status: 'recorded', expires_at: '2026-01-04T00:00:00Z' }));
  }, { deviceMetadataProvider: () => { throw new Error('should not collect'); } });
  await client.feedback.submit({ message: 'Hello', collectDeviceMetadata: false });
  await client.reviews.recordPrompt({ collectDeviceMetadata: false });
  assert.equal(bodies[0].metadata, null);
  assert.equal(bodies[1].metadata, null);
});

test('invalid keys, unsafe URLs, and unsafe or overlong identity headers fail locally', () => {
  assert.throws(() => createUprateClient({ apiKey: 'uprt_secret_bad', platform: 'ios' }),
    (error) => error.code === 'invalid_config');
  assert.throws(() => createUprateClient({ apiKey: 'uprt_pub_test', platform: 'ios', baseUrl: 'http://app.upratehq.com/api/sdk/v1', allowInsecureHttp: true }),
    (error) => error.code === 'invalid_config');
  assert.doesNotThrow(() => createUprateClient({ apiKey: 'uprt_pub_test', platform: 'android', baseUrl: 'http://10.0.2.2:8000/api/sdk/v1', allowInsecureHttp: true }));
  const client = createUprateClient({ apiKey: 'uprt_pub_test', platform: 'ios' });
  assert.throws(() => client.setUserContext({ userId: 'a\r\nb' }), (error) => error.code === 'invalid_config');
  assert.throws(() => client.setUserContext({ userId: 'é'.repeat(128) }), (error) => error.code === 'invalid_config');
});

test('HTTP errors retain validation and Retry-After details without exposing response bodies', async () => {
  const cases = [
    [401, { message: 'Use publishable key' }, {}, 'invalid_api_key'],
    [403, { message: 'disabled' }, {}, 'feature_not_enabled'],
    [404, { message: 'missing' }, {}, 'not_found'],
    [422, { message: 'Invalid', errors: { title: ['Too long'] } }, {}, 'validation_error'],
    [429, { message: 'slow down' }, { 'Retry-After': '4' }, 'rate_limited'],
    [503, { message: 'sensitive internal data' }, {}, 'server_error'],
  ];
  for (const [status, data, headers, code] of cases) {
    const client = sdk(async () => new Response(JSON.stringify(data), { status, headers }));
    await assert.rejects(client.roadmap.getItems(), (error) => {
      assert.ok(error instanceof UprateError);
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      if (status === 422) assert.deepEqual(error.validationErrors, { title: ['Too long'] });
      if (status === 429) assert.equal(error.retryAfterSeconds, 4);
      if (status === 503) assert.doesNotMatch(error.message, /sensitive/);
      return true;
    });
  }
});

test('malformed success and network failure return typed errors', async () => {
  await assert.rejects(sdk(async () => new Response('<html>oops</html>')).roadmap.getItems(),
    (error) => error.code === 'unexpected_response');
  await assert.rejects(sdk(async () => new Response(JSON.stringify({ items: [] }))).roadmap.getItems(),
    (error) => error.code === 'unexpected_response');
  await assert.rejects(sdk(async () => { throw new Error('private URL or token'); }).roadmap.getItems(),
    (error) => error.code === 'network_error' && !error.message.includes('private'));
});

test('HTTP timeout aborts the request and returns a timeout error', async () => {
  let aborted = false;
  const client = sdk((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      aborted = true;
      reject(new Error('aborted'));
    }, { once: true });
  }), { timeoutMs: 5 });
  await assert.rejects(client.roadmap.getItems(), (error) => error.code === 'timeout');
  assert.equal(aborted, true);
});
