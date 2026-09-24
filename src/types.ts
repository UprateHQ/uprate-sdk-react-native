export type Platform = 'ios' | 'android';
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface UserContext {
  userId: string;
  email?: string;
  name?: string;
}

export interface UprateClientOptions {
  /** Publishable SDK key (uprt_pub_...). Never embed an SDK secret key in an app. */
  apiKey: string;
  /** Pass React Native's Platform.OS. The SDK supports iOS and Android. */
  platform: Platform;
  /** Native app version, used to match review signals to store reviews. */
  appVersion?: string;
  /** Defaults to https://app.upratehq.com/api/sdk/v1. */
  baseUrl?: string;
  /** HTTP is allowed only for local development hosts when this is true. */
  allowInsecureHttp?: boolean;
  /** Request timeout in milliseconds. Defaults to 15000; maximum 60000. */
  timeoutMs?: number;
  /** Optional; called only for feedback/review signals when metadata collection is enabled. */
  deviceMetadataProvider?: () => JsonObject | null | Promise<JsonObject | null>;
  /** For tests or custom networking. Defaults to global fetch. */
  fetch?: typeof fetch;
}

export interface RoadmapSettings {
  voting_enabled: boolean;
  show_vote_count: boolean;
  voting_excluded_statuses: string[];
}

export interface RoadmapItem {
  uuid: string;
  title: string;
  description: string | null;
  status: string;
  status_label: string;
  votes_count?: number;
  has_voted: boolean;
  voting_disabled: boolean;
}

export interface RoadmapResponse {
  settings: RoadmapSettings;
  items: RoadmapItem[];
}

export interface VoteResult {
  voted: boolean;
  votes_count: number;
}

export interface FeatureRequest {
  uuid: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
}

export interface FeedbackResult {
  uuid: string;
  rating: number | null;
  message: string;
  status: string;
  created_at: string;
}

export interface FeedbackSubmission {
  uuid: string;
  rating: number | null;
  message: string;
  sentiment: string | null;
  created_at: string;
}

export interface ReviewSignalResult {
  uuid: string;
  status: string;
  expires_at: string;
}

export interface SubmitFeedbackInput {
  message: string;
  rating?: number;
  /** Custom JSON metadata. The SDK sends it under metadata.custom. */
  metadata?: JsonObject;
  /** Defaults to true. No device data is collected without a provider. */
  collectDeviceMetadata?: boolean;
}

export interface RecordPromptOptions {
  /** Defaults to true. No device data is collected without a provider. */
  collectDeviceMetadata?: boolean;
}
