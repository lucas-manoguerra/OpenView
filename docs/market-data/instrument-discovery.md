# Spot instrument discovery

OpenView uses a provider-independent instrument identifier in the form `BASE-QUOTE`. Each provider is responsible for converting its public market metadata into this normalized shape. The original exchange symbol is not stored as the domain identifier because Binance and Bybit use concatenated symbols while OKX uses a dashed instrument ID.

The `MarketInstrumentDiscoveryService` exposes the optional discovery capability through the market-data provider registry. Providers that do not implement `listInstruments` remain valid market-data providers and report the capability as unavailable.

## Initial providers

| Provider     | Public endpoint                                                  | Eligibility                                  |
| ------------ | ---------------------------------------------------------------- | -------------------------------------------- |
| Binance Spot | `GET /api/v3/exchangeInfo?permissions=SPOT&symbolStatus=TRADING` | Trading symbols returned for Spot permission |
| Bybit Spot   | `GET /v5/market/instruments-info?category=spot`                  | Instruments with `status=Trading`            |
| OKX Spot     | `GET /api/v5/public/instruments?instType=SPOT`                   | Instruments with `state=live`                |

Bybit's Spot instruments endpoint returns the complete Spot list without pagination. The provider therefore makes one request and does not invent or reuse cursor pagination intended for other Bybit categories.

The optional quote-asset filter is applied after provider normalization. Results are deduplicated by normalized instrument ID and sorted by display symbol. Asset codes outside OpenView's supported identifier format are skipped individually instead of aborting the complete provider catalog; malformed response structures and missing required fields remain errors. Public metadata discovery is read-only and does not imply that historical candles or streaming are supported for every discovered instrument in every provider.

All provider tests use mocked HTTP responses. They verify endpoint parameters, response normalization, active-market filtering and error handling; they do not claim a live availability or uptime test against exchange infrastructure.

## Cache de catálogos

`MarketInstrumentDiscoveryService` conserva en memoria las respuestas correctas durante 60 segundos por defecto. La clave separa proveedor y moneda cotizada; cambiar de proveedor o de filtro no reutiliza accidentalmente otro catálogo.

La caché es volátil y no se persiste en el navegador. Los errores y las respuestas abortadas no se almacenan. Puede configurarse el TTL al construir el servicio, usar `cacheTtlMs: 0` para desactivar la caché o llamar a `clearCache(providerId)` para invalidar un proveedor; `clearCache()` elimina todas las entradas.
