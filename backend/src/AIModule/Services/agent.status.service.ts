import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_LLM_URL } from '../Utils/llm.constants.utils';

const SUCCESS_TTL_MS = 5 * 60 * 1000;
const FAILURE_TTL_MS = 30 * 1000;
const VERIFY_TIMEOUT_MS = 5000;

@Injectable()
export class AiStatusService implements OnModuleInit {
  private readonly logger = new Logger(AiStatusService.name);
  private cached: { enabled: boolean; expiresAt: number } | null = null;
  private inflight: Promise<boolean> | null = null;
  baseURL = DEFAULT_LLM_URL;

  constructor(private readonly config: ConfigService) {
    this.baseURL = this.config.getOrThrow("LLM_BASE_URL", "Openrouter Base URL is needed to run the application");
  }

  onModuleInit(): void {
    if (this.config.get<string>('AI_ENABLED', 'true') === 'false') {
      this.logger.warn('AI_ENABLED=false: AI assistant disabled');
      return;
    }
    if (!this.apiKey()) {
      this.logger.warn('LLM_API_KEY is not set: AI assistant disabled');
      return;
    }
    void this.isEnabled();
  }

  async isEnabled(): Promise<boolean> {
    if (this.config.get<string>('AI_ENABLED', 'true') === 'false') return false;

    const apiKey = this.apiKey();
    if (!apiKey) return false;

    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.enabled;

    this.inflight ??= this.verify(apiKey).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  markInvalid(): void {
    this.cached = { enabled: false, expiresAt: Date.now() + FAILURE_TTL_MS };
  }

  private apiKey(): string | undefined {
    return this.config.get<string>('LLM_API_KEY')?.trim() || undefined;
  }

  private async verify(apiKey: string): Promise<boolean> {
    let enabled = false;

    try {
      const response = await fetch(`${this.baseURL}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      });

      enabled = response.ok;
      if (enabled) {
        this.logger.log('AI API key verified: AI assistant enabled');
      } else {
        this.logger.warn(`AI Endpoint rejected the API key (HTTP ${response.status}): AI assistant disabled`);
      }
    } catch {
      this.logger.warn('Could not reach AI to verify the API key: AI assistant disabled');
    }

    this.cached = {
      enabled,
      expiresAt: Date.now() + (enabled ? SUCCESS_TTL_MS : FAILURE_TTL_MS),
    };
    return enabled;
  }
}