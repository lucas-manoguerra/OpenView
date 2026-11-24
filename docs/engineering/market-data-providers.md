# Proveedores de datos de mercado

## Contrato común

Los adaptadores implementan `MarketDataProvider` y solo dependen de `market-domain`. El motor de gráficos y la interfaz consumen velas del dominio y no conocen URLs, formatos de respuesta, límites ni autenticación de un exchange.

Los rangos históricos utilizan timestamps Unix en milisegundos y la semántica `[startTime, endTime)`: el instante inicial se incluye y el final se excluye. Los adaptadores devuelven velas ordenadas cronológicamente por su timestamp de apertura, normalizadas a OHLCV y congeladas. Una implementación debe respetar `AbortSignal`, indicar sus intervalos disponibles y describir de forma conservadora las condiciones de redistribución.

`MarketDataProviderRegistry` registra proveedores por un identificador estable, rechaza IDs duplicados y permite obtener el proveedor elegido por el usuario. Las credenciales privadas no forman parte del contrato de datos públicos.

## Adaptador implementado

### Binance Spot

- ID: `binance-spot`
- Endpoint histórico: `GET /api/v3/klines`
- Host por defecto: `https://data-api.binance.vision`
- Los endpoints públicos de mercado no necesitan API key.
- Cada petición solicita hasta 1.000 velas; el rango se pagina secuencialmente y el máximo predeterminado es 100 páginas por llamada.
- Los timestamps de apertura se conservan en milisegundos; el volumen normalizado es el volumen del activo base.
- El adaptador no reintenta automáticamente ante HTTP 429/418. Expone el status y el valor `Retry-After` mediante `MarketDataProviderError` para que una política superior pueda aplicar backoff.
- Streaming todavía no está implementado.
- La redistribución se clasifica como `unknown`; la aplicación no debe asumir que los datos pueden redistribuirse comercialmente.

La documentación oficial de Binance mantiene un endpoint específico de solo datos de mercado, sin credenciales, y documenta el endpoint de klines, el orden de resultados y los límites de peticiones:

- [Market Data Only URLs](https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md)
- [Spot REST API](https://developers.binance.com/en/docs/products/spot/rest-api)
- [Binance API limits](https://developers.binance.com/en/docs/products/spot/rest-api#limits)

## Candidatos para próximos adaptadores

Estos proveedores se mantienen como adaptadores independientes. Que el endpoint sea público no implica que todos los intervalos, mercados, profundidades históricas ni derechos de redistribución sean equivalentes.

- **Bybit:** Spot y Linear OHLCV. Pendiente.
- **OKX:** Spot y Swap OHLCV. Pendiente.
- **BingX:** Spot y Perpetual OHLCV. Pendiente.
- **Bitunix:** Spot y Futures OHLCV. Pendiente.
- **Kraken:** Spot OHLCV. Pendiente.
- **Coinbase Exchange:** Spot OHLCV. Pendiente.
- **CoinGecko:** datos agregados y metadatos; plan Demo limitado. Pendiente.
- **Twelve Data / Alpha Vantage:** acciones, FX y otros mercados; cuotas y licencias por mercado. Pendiente.
- **Yahoo Finance:** acciones e índices; no usar endpoints no oficiales como dependencia por defecto.
- **Google Finance:** no disponible como API soportada.

### Criterios de incorporación

1. Priorizar endpoints documentados, públicos y de solo lectura.
2. Mantener la autenticación fuera de los adaptadores cuando no sea necesaria.
3. Declarar límites, intervalos, granularidad histórica y mercados disponibles por proveedor.
4. Normalizar timestamps, volumen, orden, paginación y rangos de tiempo en el adaptador.
5. Aplicar backoff respetando `Retry-After`; no reintentar en bucle ni acercarse deliberadamente al límite del proveedor.
6. Mantener `redistribution: 'unknown'` hasta confirmar las condiciones aplicables al uso previsto.
7. No usar APIs no oficiales o scraping como fuente estable sin revisar sus términos y licencias.

## Fuentes de referencia para los candidatos

- [Bybit V5 Get Kline](https://bybit-exchange.github.io/docs/v5/market/kline)
- [OKX API v5](https://www.okx.com/docs-v5/en/)
- [BingX Open API](https://bingxservice.zendesk.com/hc/en-us)
- [Bitunix Open API](https://www.bitunix.com/api-docs/)
- [Kraken API rate limits](https://support.kraken.com/articles/206548367-what-are-the-api-rate-limits-)
- [CoinGecko API pricing](https://www.coingecko.com/en/api/pricing)
- [Alpha Vantage support and free quota](https://www.alphavantage.co/support/)
- [Twelve Data pricing and quotas](https://twelvedata.com/pricing)
- [Yahoo Finance terms](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html)
- [Google Finance Portfolio Data API status](https://developers.google.com/gdata/docs/directory)
