# WebSpark-2026

## Environment setup

Create a local `.env` file in the project root and keep all secrets there. Do not commit `.env` files.

Example:

```bash
PORT=10000
API_KEY=your_api_key_here
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

For Render or Netlify deployments, set the same values in the platform's environment variables section instead of hardcoding them in source.

## Security notes

- Never store private keys or tokens in frontend files.
- Keep `.env` ignored by git.
- Restrict CORS to trusted domains using `ALLOWED_ORIGINS`.
- Only expose the backend through trusted hosting providers.
