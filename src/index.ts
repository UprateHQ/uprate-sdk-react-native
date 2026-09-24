import { UprateError } from './error.js';
import type {
  FeatureRequest,
  FeedbackResult,
  FeedbackSubmission,
  JsonObject,
  RecordPromptOptions,
  ReviewSignalResult,
  RoadmapResponse,
  SubmitFeedbackInput,
  UprateClientOptions,
  UserContext,
  VoteResult,
} from './types.js';

export { UprateError } from './error.js';
export type { UprateErrorCode } from './error.js';
export type * from './types.js';

const DEFAULT_URL = 'https://app.upratehq.com/api/sdk/v1';
const MAX_TIMEOUT_MS = 60_000;

function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function checkedHeader(value: string, name: string, maxBytes: number): string {
  if (typeof value !== 'string' || /[\r\n]/.test(value) || utf8Bytes(value) > maxBytes) {
    throw new UprateError('invalid_config', `Invalid ${name}.`);
  }
  return value;
}

function isLocalHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  if (hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '10.0.2.2') return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  const match = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname);
  return !!match && Number(match[1]) >= 16 && Number(match[1]) <= 31;
}

function checkedBaseUrl(value: string, allowInsecureHttp: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UprateError('invalid_config', 'Invalid SDK base URL.');
  }
  if (url.username || url.password || url.search || url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && allowInsecureHttp && isLocalHost(url.hostname)))) {
    throw new UprateError('invalid_config', 'SDK base URL must use HTTPS; local HTTP requires allowInsecureHttp.');
  }
  return url.toString().replace(/\/$/, '');
}

function asObject(value: unknown, status: number): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new UprateError('unexpected_response', 'Unexpected SDK response.', { status });
  }
  return value as Record<string, unknown>;
}

function assertFields(
  value: unknown,
  status: number,
  required: Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object'>,
  nullable: string[] = [],
): Record<string, unknown> {
  const object = asObject(value, status);
  for (const [key, type] of Object.entries(required)) {
    const field = object[key];
    if (nullable.includes(key) && field === null) continue;
    const valid = type === 'array' ? Array.isArray(field)
      : type === 'object' ? field !== null && typeof field === 'object' && !Array.isArray(field)
      : typeof field === type;
    if (!valid) throw new UprateError('unexpected_response', 'Unexpected SDK response.', { status });
  }
  return object;
}

function roadmapResponse(value: unknown, status: number): RoadmapResponse {
  const root = assertFields(value, status, { settings: 'object', items: 'array' });
  const settings = assertFields(root.settings, status, {
    voting_enabled: 'boolean', show_vote_count: 'boolean', voting_excluded_statuses: 'array',
  });
  if (!(settings.voting_excluded_statuses as unknown[]).every((x) => typeof x === 'string')) {
    throw new UprateError('unexpected_response', 'Unexpected SDK response.', { status });
  }
  for (const item of root.items as unknown[]) {
    const data = assertFields(item, status, {
      uuid: 'string', title: 'string', description: 'string', status: 'string',
      status_label: 'string', has_voted: 'boolean', voting_disabled: 'boolean',
    }, ['description']);
    if (data.votes_count !== undefined && typeof data.votes_count !== 'number') {
      throw new UprateError('unexpected_response', 'Unexpected SDK response.', { status });
    }
  }
  return value as RoadmapResponse;
}

function featureRequest(value: unknown, status: number): FeatureRequest {
  assertFields(value, status, {
    uuid: 'string', title: 'string', description: 'string', status: 'string', created_at: 'string',
  }, ['description']);
  return value as FeatureRequest;
}

function feedbackResult(value: unknown, status: number): FeedbackResult {
  assertFields(value, status, {
    uuid: 'string', rating: 'number', message: 'string', status: 'string', created_at: 'string',
  }, ['rating']);
  return value as FeedbackResult;
}

function feedbackSubmission(value: unknown, status: number): FeedbackSubmission {
  assertFields(value, status, {
    uuid: 'string', rating: 'number', message: 'string', sentiment: 'string', created_at: 'string',
  }, ['rating', 'sentiment']);
  return value as FeedbackSubmission;
}

function retryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : undefined;
}

function errorFromResponse(status: number, body: unknown, retryAfter: string | null): UprateError {
  const data = body !== null && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown> : {};
  const serverMessage = typeof data.message === 'string' ? data.message : undefined;
  if (status === 401) return new UprateError('invalid_api_key', serverMessage ?? 'Invalid SDK API key.', { status });
  if (status === 403) return new UprateError('feature_not_enabled', 'SDK feature is not enabled.', { status });
  if (status === 404) return new UprateError('not_found', 'SDK resource was not found.', { status });
  if (status === 422) {
    const fields: Record<string, string[]> = {};
    if (data.errors && typeof data.errors === 'object' && !Array.isArray(data.errors)) {
      for (const [key, value] of Object.entries(data.errors)) {
        if (Array.isArray(value) && value.every((item) => typeof item === 'string')) fields[key] = value;
      }
    }
    return new UprateError('validation_error', serverMessage ?? 'Validation failed.', {
      status, validationErrors: fields,
    });
  }
  if (status === 429) return new UprateError('rate_limited', 'SDK rate limit reached.', {
    status, retryAfterSeconds: retryAfterSeconds(retryAfter),
  });
  if (status >= 500) return new UprateError('server_error', 'SDK server error.', { status });
  return new UprateError('unexpected_response', 'Unexpected SDK response.', { status });
}

function jsonBody(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (typeof json !== 'string') throw new Error();
    return json;
  } catch {
    throw new UprateError('validation_error', 'Metadata must contain JSON values.');
  }
}

function validatedMetadata(value: JsonObject | null, name: string): JsonObject | null {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new UprateError('validation_error', `${name} must be a JSON object.`);
  }
  return value;
}

export function createUprateClient(options: UprateClientOptions) {
  if (!options || typeof options !== 'object') throw new UprateError('invalid_config', 'SDK options are required.');
  const apiKey = checkedHeader(options.apiKey, 'SDK API key', 512);
  if (!apiKey.startsWith('uprt_pub_')) {
    throw new UprateError('invalid_config', 'Use an SDK publishable key (uprt_pub_...).');
  }
  if (options.platform !== 'ios' && options.platform !== 'android') {
    throw new UprateError('invalid_config', 'SDK platform must be ios or android.');
  }
  const appVersion = options.appVersion === undefined ? undefined
    : checkedHeader(options.appVersion, 'app version', 50);
  const baseUrl = checkedBaseUrl(options.baseUrl ?? DEFAULT_URL, options.allowInsecureHttp === true);
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new UprateError('invalid_config', 'SDK timeout must be between 1 and 60000 milliseconds.');
  }
  const fetcher = options.fetch ?? globalThis.fetch;
  if (typeof fetcher !== 'function') throw new UprateError('invalid_config', 'Fetch is unavailable.');

  let currentUser: UserContext | null = null;
  let userRevision = 0;

  function setUserContext(context: UserContext): void {
    if (!context || typeof context !== 'object') {
      throw new UprateError('invalid_config', 'SDK user context is required.');
    }
    const userId = checkedHeader(context.userId, 'SDK user ID', 255).trim();
    if (!userId) throw new UprateError('invalid_config', 'SDK user ID must not be empty.');
    const email = context.email === undefined ? undefined : checkedHeader(context.email, 'SDK user email', 255);
    const name = context.name === undefined ? undefined : checkedHeader(context.name, 'SDK user name', 255);
    currentUser = { userId, email, name };
    userRevision++;
  }

  function clearUserContext(): void {
    currentUser = null;
    userRevision++;
  }

  function snapshotUser(): { user: UserContext; revision: number } {
    if (!currentUser) throw new UprateError('user_context_not_set', 'Set SDK user context before calling an SDK feature.');
    return { user: { ...currentUser }, revision: userRevision };
  }

  async function request(
    method: 'GET' | 'POST' | 'DELETE', path: string,
    snapshot: { user: UserContext; revision: number }, body?: unknown,
  ): Promise<{ data: unknown; status: number }> {
    if (snapshot.revision !== userRevision) {
      throw new UprateError('user_context_changed', 'SDK user changed before the request was sent.');
    }
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-SDK-User-Id': snapshot.user.userId,
      'X-SDK-Device-Platform': options.platform,
    };
    if (snapshot.user.email !== undefined) headers['X-SDK-User-Email'] = snapshot.user.email;
    if (snapshot.user.name !== undefined) headers['X-SDK-User-Name'] = snapshot.user.name;
    if (appVersion !== undefined) headers['X-SDK-App-Version'] = appVersion;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const encodedBody = body === undefined ? undefined : jsonBody(body);

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    let response: Response;
    let text: string;
    try {
      response = await fetcher(`${baseUrl}/${path}`, {
        method, headers, body: encodedBody, signal: controller.signal,
      });
      text = await response.text();
    } catch {
      throw new UprateError(timedOut ? 'timeout' : 'network_error',
        timedOut ? 'SDK request timed out.' : 'SDK network request failed.');
    } finally {
      clearTimeout(timer);
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      if (response.ok) throw new UprateError('unexpected_response', 'SDK returned invalid JSON.', { status: response.status });
      data = null;
    }
    if (!response.ok) throw errorFromResponse(response.status, data, response.headers.get('Retry-After'));
    return { data, status: response.status };
  }

  async function deviceMetadata(enabled: boolean): Promise<JsonObject | null> {
    if (!enabled || !options.deviceMetadataProvider) return null;
    return validatedMetadata(await options.deviceMetadataProvider(), 'Device metadata');
  }

  return {
    setUserContext,
    clearUserContext,
    roadmap: {
      async getItems(): Promise<RoadmapResponse> {
        const result = await request('GET', 'roadmap', snapshotUser());
        return roadmapResponse(result.data, result.status);
      },
      async vote(itemId: string): Promise<VoteResult> {
        const result = await request('POST', `roadmap/items/${encodeURIComponent(itemId)}/vote`, snapshotUser());
        assertFields(result.data, result.status, { voted: 'boolean', votes_count: 'number' });
        return result.data as VoteResult;
      },
      async removeVote(itemId: string): Promise<VoteResult> {
        const result = await request('DELETE', `roadmap/items/${encodeURIComponent(itemId)}/vote`, snapshotUser());
        assertFields(result.data, result.status, { voted: 'boolean', votes_count: 'number' });
        return result.data as VoteResult;
      },
      async submitRequest(title: string, description?: string): Promise<FeatureRequest> {
        const result = await request('POST', 'roadmap/requests', snapshotUser(), { title, description });
        return featureRequest(result.data, result.status);
      },
      async getMyRequests(): Promise<FeatureRequest[]> {
        const result = await request('GET', 'roadmap/requests', snapshotUser());
        const root = assertFields(result.data, result.status, { requests: 'array' });
        return (root.requests as unknown[]).map((item) => featureRequest(item, result.status));
      },
    },
    feedback: {
      async submit(input: SubmitFeedbackInput): Promise<FeedbackResult> {
        const snapshot = snapshotUser();
        if (!input || typeof input.message !== 'string' || !input.message.trim() || input.message.length > 5000) {
          throw new UprateError('validation_error', 'Feedback message must be 1 to 5000 characters.');
        }
        if (input.rating !== undefined && (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) {
          throw new UprateError('validation_error', 'Feedback rating must be between 1 and 5.');
        }
        const device = await deviceMetadata(input.collectDeviceMetadata !== false);
        const custom = input.metadata === undefined ? null : validatedMetadata(input.metadata, 'Custom metadata');
        const metadata = device !== null || custom !== null ? { device, custom } : null;
        if (metadata && utf8Bytes(jsonBody(metadata)) > 10_240) {
          throw new UprateError('validation_error', 'Feedback metadata must not exceed 10 KB.');
        }
        const result = await request('POST', 'feedback', snapshot, {
          message: input.message, rating: input.rating, metadata,
        });
        return feedbackResult(result.data, result.status);
      },
      async getMySubmissions(): Promise<FeedbackSubmission[]> {
        const result = await request('GET', 'feedback', snapshotUser());
        const root = assertFields(result.data, result.status, { feedback: 'array' });
        return (root.feedback as unknown[]).map((item) => feedbackSubmission(item, result.status));
      },
    },
    reviews: {
      async recordPrompt(options?: RecordPromptOptions): Promise<ReviewSignalResult> {
        const snapshot = snapshotUser();
        const triggeredAt = new Date().toISOString();
        const device = await deviceMetadata(options?.collectDeviceMetadata !== false);
        const metadata = device === null ? null : { device };
        if (metadata && utf8Bytes(jsonBody(metadata)) > 10_240) {
          throw new UprateError('validation_error', 'Review signal metadata must not exceed 10 KB.');
        }
        const result = await request('POST', 'review-signals', snapshot, { triggered_at: triggeredAt, metadata });
        assertFields(result.data, result.status, { uuid: 'string', status: 'string', expires_at: 'string' });
        return result.data as ReviewSignalResult;
      },
    },
  };
}

export type UprateClient = ReturnType<typeof createUprateClient>;
