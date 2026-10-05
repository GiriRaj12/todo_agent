# ADR-0001: LLM provider behind an OpenAI-compatible API

- **Status:** Accepted
- **Date:** 2026-10-06

## Context
The chatbot needs an LLM that supports tool calling. The project started with a local model served by Ollama. It then moved to OpenRouter's free tier, and is now configured for Groq. Reviewers and teammates need to run the app with minimal setup, and the provider may need to change again.

## Decision
The backend talks to the LLM through an OpenAI-compatible chat API. The endpoint, key, model and timeout are environment variables (`LLM_BASE_URL`, `LLM_API_KEY`, `GROQ_MODEL`, `GROQ_TIMEOUT_MS`). The default is Groq with `openai/gpt-oss-20b`.

## Alternatives considered
- **Local model with Ollama:** no data leaves the machine and no API key is needed, but it requires pulling a tool-capable model and enough local hardware, which makes setup heavier for anyone running the project.
- **OpenRouter free tier:** one key for many models, but free models vary in tool-calling quality and availability.
- **Provider-specific SDK:** simpler at first, but ties the code to one vendor.

## Consequences
- Switching provider is a configuration change, not a code change, as long as it supports the OpenAI-compatible tool-calling format.
- Todo titles and descriptions are sent to a third-party service (see ADR-0006).
- Behavior depends on the chosen model's tool-calling quality, so the agent logic validates tool calls rather than trusting them (see ADR-0002).
- Variable names still mention Groq and OpenRouter. They should be consolidated if one provider is dropped.
