export interface OpenRouterModel {
  id: string;
  name: string;
  created: number;
  context_length?: number;
  pricing?: {
    prompt: string;
    completion: string;
  };
}

export interface FreeModel {
  id: string;
  name: string;
  created: number;
  context_length: number;
}

export interface ChatCompletionRequest {
  model?: string;
  messages: Array<Record<string, unknown>>;
  stream?: boolean;
  [key: string]: unknown;
}
