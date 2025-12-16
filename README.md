# Loom Transcript MCP Server

A remote MCP server that extracts transcripts, titles, descriptions, and comments from Loom videos. Deploy your own on Cloudflare Workers in one click.

## Deploy Your Own

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jackculpan/loom-remote-mcp-server-authless)

After deploying, your server will be available at:
```
https://loom-remote-mcp-server-authless.<your-subdomain>.workers.dev
```

## Tools

| Tool | Description |
|------|-------------|
| `getLoomTranscript` | Get transcript text, title, and description from a Loom video URL |
| `getLoomComments` | Get comments from a Loom video URL |

## Connect to Your MCP Server

Replace `<your-subdomain>` with your Cloudflare Workers subdomain.

### Claude Code

```bash
claude mcp add loom -t sse https://loom-remote-mcp-server-authless.<your-subdomain>.workers.dev/sse
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "loom": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://loom-remote-mcp-server-authless.<your-subdomain>.workers.dev/sse"]
    }
  }
}
```

### Claude Desktop

Add to your config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "loom": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://loom-remote-mcp-server-authless.<your-subdomain>.workers.dev/sse"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "loom": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://loom-remote-mcp-server-authless.<your-subdomain>.workers.dev/sse"]
    }
  }
}
```

### Cloudflare AI Playground

1. Go to https://playground.ai.cloudflare.com/
2. Enter your MCP server URL

### Native Remote MCP

- **SSE**: `https://loom-remote-mcp-server-authless.<your-subdomain>.workers.dev/sse`
- **HTTP**: `https://loom-remote-mcp-server-authless.<your-subdomain>.workers.dev/mcp`

## Local Development

```bash
npm install
npm run dev
```

## Manual Deploy

```bash
npm run deploy
```
