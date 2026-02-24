# AG Proxy

A self-hosted proxy server that exposes an **OpenAI-compatible API** (`/v1/chat/completions`) powered by Google AI Studio and Anthropic accounts. Manage multiple accounts, rotate between them automatically, and access models like Gemini and Claude through a single, unified endpoint.

## Features

### OpenAI-Compatible API
- Drop-in replacement for OpenAI's `/v1/chat/completions` endpoint
- Works with any client or library that supports the OpenAI API format
- Supports Gemini (3.1 Pro, 3 Flash, 2.5 Pro/Flash) and Claude (Sonnet 4.6, Opus 4.6) models
- Automatic model aliasing and mapping

### Multi-Account Management
- Connect multiple Google AI Studio accounts via OAuth or token import
- Per-account quota tracking with visual indicators per model
- Account status monitoring (active, suspended, expired)
- Import/export accounts as JSON for backup or migration
- Sync account tier and quota info with one click

### Smart Account Rotation
- Automatic rotation across accounts to distribute usage
- Priority-based selection (lower priority = selected first)
- Quota-aware: skips accounts that have hit rate limits
- Automatic retry with fallback to next available account (up to 3 retries)
- Per-account rotation toggle to include/exclude from the pool

### API Tunnels
- Create named tunnels, each with its own API key
- Per-tunnel token usage limits (or unlimited)
- Two routing modes:
  - **Account Pool** — auto-select the best account from the rotation pool
  - **Tied Account** — always route through a specific account
- Built-in tunnel testing from the dashboard

### Network Proxy Support
- Configure HTTP/HTTPS/SOCKS5 proxies for outbound traffic
- Assign proxies per account for geo-distributed requests
- Bulk import proxies from TXT/CSV with auto-detected delimiters and drag-to-reorder column mapping
- One-click ping to verify proxy connectivity

### AG Switch Extension
- VS Code extension to switch Antigravity IDE accounts directly from the dashboard
- Injects OAuth credentials into the local IDE's storage and reloads automatically
- Extension health check built into the dashboard — shows connection status before switching
- Auto-versioned and released via GitHub Actions

### Dashboard
- Clean, responsive UI built with Next.js, shadcn/ui, and Tailwind CSS
- Dark / light mode toggle
- Multi-language support (English, Vietnamese, Chinese)
- User management with admin/user roles
- JWT-based authentication

### Deployment
- Dockerized with multi-stage build for minimal image size
- Standalone Next.js output for production
- CI/CD via GitHub Actions:
  - **Docker**: auto-build and push to GHCR on every push to `main`
  - **Extension**: auto-bump version, build `.vsix`, and create GitHub Release on extension changes

## Getting Started

### Prerequisites
- Node.js 20+
- MongoDB instance
- (Optional) Docker for containerized deployment

### Development

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your MongoDB URI and other config

# Start the dev server
npm run dev
```

The dashboard will be available at `http://localhost:3001`.

### Environment Variables

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for signing auth tokens |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (for account linking) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

### Docker

```bash
# Build the image
docker build -t ag-proxy .

# Run
docker run -d -p 3000:3000 \
  -e MONGODB_URI="mongodb://..." \
  -e JWT_SECRET="your-secret" \
  ag-proxy
```

Or pull the pre-built image:

```bash
docker pull ghcr.io/monokaijs/ag-proxy:latest
```

## API Usage

Once you've created a tunnel and obtained an API key, point any OpenAI-compatible client to your AG Proxy instance:

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_TUNNEL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-pro",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Supported Models

| Model ID | Maps To |
|---|---|
| `gemini-3.1-pro-high` | Gemini 3.1 Pro High |
| `gemini-3.1-pro-low` | Gemini 3.1 Pro High |
| `gemini-3-flash` | Gemini 3 Flash |
| `gemini-2.5-pro` | Gemini 2.5 Pro |
| `gemini-2.5-flash` | Gemini 2.5 Flash |
| `gemini-2.5-flash-lite` | Gemini 2.5 Flash |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 |
| `claude-sonnet-4-6-thinking` | Claude Sonnet 4.6 Thinking |
| `claude-opus-4-6-thinking` | Claude Opus 4.6 Thinking |

## Extension

The `extension/` directory contains the **AG Switch** VS Code extension. It runs a local HTTP server that the dashboard communicates with to switch accounts in Antigravity IDE.

```bash
cd extension
npm install
npm run build
npm run package  # produces .vsix file
```

Install the `.vsix` in Antigravity via *Extensions → Install from VSIX*.

## Tech Stack

- **Framework**: Next.js 16 (App Router, standalone output)
- **UI**: React 19, shadcn/ui, Tailwind CSS v4, Lucide icons
- **Database**: MongoDB via Mongoose
- **Auth**: JWT (jose) with bcryptjs password hashing
- **Extension**: VS Code Extension API, sql.js for SQLite manipulation
- **CI/CD**: GitHub Actions → GHCR (Docker) + GitHub Releases (Extension)

## License

MIT
