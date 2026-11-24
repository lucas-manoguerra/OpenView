---
name: Market Data
description: Build provider adapters, normalized market data contracts, streaming subscriptions, and compliance metadata.
---

# Market data skill

Market data integrations belong to `packages/market-data`. Domain entities belong to `packages/market-domain`.

Before adding a provider, inspect official terms and document the data rights, attribution, allowed use, redistribution, account requirements, limits, latency and rate limits.

Never embed private API keys in client bundles. Never bypass authentication or provider restrictions. Do not label delayed prices as real time.

Normalize raw responses at the adapter boundary. Validate timestamps, prices, volume, symbols and interval alignment before handing data to domain consumers.

Every subscription needs explicit ownership, cancellation and release behavior. Add fixtures for success, malformed payloads, partial responses, disconnections and rate-limit failures.

Consult `docs/product/free-data-policy.md` before making availability claims.
