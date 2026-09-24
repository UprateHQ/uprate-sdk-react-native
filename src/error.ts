export type UprateErrorCode =
  | 'invalid_config'
  | 'user_context_not_set'
  | 'user_context_changed'
  | 'invalid_api_key'
  | 'feature_not_enabled'
  | 'not_found'
  | 'validation_error'
  | 'rate_limited'
  | 'timeout'
  | 'network_error'
  | 'server_error'
  | 'unexpected_response';

export class UprateError extends Error {
  readonly code: UprateErrorCode;
  readonly status?: number;
  readonly validationErrors?: Record<string, string[]>;
  readonly retryAfterSeconds?: number;

  constructor(
    code: UprateErrorCode,
    message: string,
    details: {
      status?: number;
      validationErrors?: Record<string, string[]>;
      retryAfterSeconds?: number;
    } = {},
  ) {
    super(message);
    this.name = 'UprateError';
    this.code = code;
    this.status = details.status;
    this.validationErrors = details.validationErrors;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}
