# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Discord bot**: discord.js slash-command bot in `scripts/src/discord-bot.ts` with an Express keep-alive server

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/scripts run discord:dev` — run the Discord bot

## Discord Bot

The bot uses `DISCORD_TOKEN` from Replit Secrets and optionally supports `DISCORD_GUILD_ID` for instant guild-scoped slash command registration during development. Without `DISCORD_GUILD_ID`, commands are registered globally and may take up to an hour to appear in Discord.
The same bot process starts a simple Express keep-alive server on `KEEPALIVE_PORT`, `PORT`, or port `3000` by default. Health checks are available at `/health`.
The bot includes server protection for bad words/threats, suspicious pictures/files, spam bursts, repeated messages, Discord invite links, common scam links, free Nitro scams, and mass mentions. It deletes bad content, applies a 5-minute timeout, and can kick users for severe bad content when it has Discord permissions. Extra blocked words can be supplied with a comma-separated `BAD_WORDS` environment variable.
The bot sends welcome messages to `WELCOME_CHANNEL_ID` or channel `1482874761951576228`, posts staggered advertisements to `ADVERTISEMENT_CHANNEL_ID` or channel `1482874761951576228`, and maintains live server information in `SERVER_INFO_CHANNEL_ID` or channel `1484639863411183636`.
Slash commands include `/ping`, `/server`, `/help`, `/protection`, `/vote`, `/ban`, `/kick`, and `/clear`.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
