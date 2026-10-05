import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AiStatusService } from '../agent.status.service';

describe('AiStatusService', () => {
  let service: AiStatusService;
  let configServiceMock: jest.Mocked<Partial<ConfigService>>;

  const mockBaseUrl = 'https://openrouter.ai/api/v1';
  const mockApiKey = 'sk-mock-key';

  beforeEach(async () => {
    global.fetch = jest.fn();

    configServiceMock = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'LLM_BASE_URL') return mockBaseUrl;
        throw new Error(`Missing config ${key}`);
      }),
      get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'AI_ENABLED') return 'true';
        if (key === 'LLM_API_KEY') return mockApiKey;
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiStatusService,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    service = module.get<AiStatusService>(AiStatusService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should set baseURL from ConfigService', () => {
      expect(service.baseURL).toBe(mockBaseUrl);
      expect(configServiceMock.getOrThrow).toHaveBeenCalledWith(
        'LLM_BASE_URL',
        'Openrouter Base URL is needed to run the application',
      );
    });
  });

  describe('onModuleInit', () => {
    it('should disable early and log warning if AI_ENABLED is false', () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      configServiceMock.get = jest.fn().mockImplementation((key) => {
        if (key === 'AI_ENABLED') return 'false';
        return undefined;
      });

      const isEnabledSpy = jest.spyOn(service, 'isEnabled');

      service.onModuleInit();

      expect(warnSpy).toHaveBeenCalledWith('AI_ENABLED=false: AI assistant disabled');
      expect(isEnabledSpy).not.toHaveBeenCalled();
    });

    it('should disable early and log warning if LLM_API_KEY is missing', () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      configServiceMock.get = jest.fn().mockImplementation((key) => {
        if (key === 'AI_ENABLED') return 'true';
        if (key === 'LLM_API_KEY') return '';
        return undefined;
      });

      const isEnabledSpy = jest.spyOn(service, 'isEnabled');

      service.onModuleInit();

      expect(warnSpy).toHaveBeenCalledWith('LLM_API_KEY is not set: AI assistant disabled');
      expect(isEnabledSpy).not.toHaveBeenCalled();
    });

    it('should trigger isEnabled() when configured correctly', () => {
      const isEnabledSpy = jest.spyOn(service, 'isEnabled').mockResolvedValue(true);

      service.onModuleInit();

      expect(isEnabledSpy).toHaveBeenCalled();
    });
  });

  describe('isEnabled', () => {
    it('should return false if AI_ENABLED is set to false', async () => {
      configServiceMock.get = jest.fn().mockReturnValue('false');

      const result = await service.isEnabled();

      expect(result).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return false if LLM_API_KEY is missing or empty', async () => {
      configServiceMock.get = jest.fn().mockImplementation((key) => {
        if (key === 'AI_ENABLED') return 'true';
        if (key === 'LLM_API_KEY') return '   ';
        return undefined;
      });

      const result = await service.isEnabled();

      expect(result).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should call fetch and return true on verification success', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

      const result = await service.isEnabled();

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(`${mockBaseUrl}/models`, {
        headers: { Authorization: `Bearer ${mockApiKey}` },
        signal: expect.any(AbortSignal),
      });
    });

    it('should return false if API response is not ok (e.g. 401)', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });

      const result = await service.isEnabled();

      expect(result).toBe(false);
    });

    it('should return false and catch error if fetch throws (e.g. Network error / Timeout)', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await service.isEnabled();

      expect(result).toBe(false);
    });

    it('should return cached response if cache is valid', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

      // First call populates cache
      await service.isEnabled();
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second call uses cache
      const cachedResult = await service.isEnabled();
      expect(cachedResult).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should deduct cache expiration and re-fetch after expiry', async () => {
      jest.useFakeTimers();
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      // 1. Initial Call
      await service.isEnabled();
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // 2. Fast forward past SUCCESS_TTL_MS (5 mins)
      jest.advanceTimersByTime(5 * 60 * 1000 + 1);

      // 3. Next call should trigger fetch again
      await service.isEnabled();
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should deduplicate inflight verification requests', async () => {
      let resolveFetch!: (val: unknown) => void;
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });
      (global.fetch as jest.Mock).mockReturnValue(fetchPromise);

      const promise1 = service.isEnabled();
      const promise2 = service.isEnabled();

      // Ensure fetch is only executed once
      expect(global.fetch).toHaveBeenCalledTimes(1);

      resolveFetch({ ok: true });

      const [res1, res2] = await Promise.all([promise1, promise2]);
      expect(res1).toBe(true);
      expect(res2).toBe(true);
    });
  });

  describe('markInvalid', () => {
    it('should override cache to false and set failure TTL', async () => {
      jest.useFakeTimers();
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      // Cache a successful response
      await service.isEnabled();
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Invalidate
      service.markInvalid();

      // Subsequent call should return false from cache without calling fetch again
      const result = await service.isEnabled();
      expect(result).toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Advance time past FAILURE_TTL_MS (30 seconds)
      jest.advanceTimersByTime(30 * 1000 + 1);

      // Should re-fetch after failure TTL expires
      await service.isEnabled();
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});