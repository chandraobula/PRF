# React + Vite

## AI provider fallback

The chat API automatically tries every configured provider and model until one
returns a usable answer. Configure secrets only on the server/Cloudflare:

- `OPENAI_API_KEY` with optional comma-separated `OPENAI_MODELS`
- `OPENROUTER_API_KEY` with optional comma-separated `OPENROUTER_MODELS`
- `GEMINI_API_KEY` with optional comma-separated `GEMINI_CHAT_MODELS`

The fallback order is OpenAI, OpenRouter, then Gemini. Legacy singular settings
(`OPENAI_MODEL`, `OPENROUTER_MODEL`, and `GEMINI_MODEL`) are also supported.
Failed models are skipped for the rest of the same user request, including
failures that happen after a streaming response has already started.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
