# Proveedores de datos de mercado

## Contrato común

Los adaptadores implementan `MarketDataProvider` y solo dependen de `market-domain`. El motor de gráficos y la interfaz consumen velas del dominio y no conocen URLs, formatos de respuesta, límites ni autenticación de un exchange.

Los rangos históricos utilizan timestamps Unix en milisegundos y la semántica `[startTime, endTime)`: el instante inicial se incluye y el final se excluye. Los adaptadores devuelven velas ordenadas cronológicamente por su timestamp de apertura, normalizadas a OHLCV y congeladas. Una implementación debe respetar `AbortSignal`, indicar sus intervalos disponibles y describir de forma conservadora las condiciones de redistribución.

`MarketDataProviderRegistry` registra proveedores por un identificador estable, rechaza IDs duplicados y permite obtener el proveedor elegido por el usuario. Las credenciales privadas no forman parte del contrato de datos públicos.

## Servicio de histórico

`HistoricalCandleService` consume el registro y ofrece una entrada común para la aplicación:

- `listSources()` devuelve una instantánea inmutable de los proveedores que ofrecen velas históricas, junto con sus intervalos y metadatos de redistribución.
- `getSource(providerId)` devuelve los metadatos de la fuente seleccionada.
- `getHistoricalCandles(providerId, request)` valida la capacidad histórica y el intervalo antes de delegar en el adaptador correspondiente.

La selección del proveedor es siempre explícita. El servicio no cambia automáticamente de exchange ni reinterpreta símbolos: un fallback silencioso podría mostrar otro mercado. Conserva el `AbortSignal` y los errores del adaptador, no agrega caché y no modifica las velas devueltas.

## Integración en la terminal

La terminal utiliza `HistoricalCandleService` desde el componente `MarketChart` y entrega las velas normalizadas a `ChartCanvas`. El componente visual no conoce endpoints ni formatos de exchanges.

- La fuente inicial es `binance-spot`, con el instrumento `BTC-USDT` y temporalidad `1m`.
- El selector de fuente ofrece Binance Spot, Bybit Spot y OKX Spot. El selector de temporalidad se construye a partir de `supportedIntervals` de la fuente elegida.
- Cada consulta solicita hasta 500 períodos recientes y utiliza timestamps Unix en milisegundos con rango final exclusivo.
- Para `1M`, el inicio del rango se calcula usando límites de mes calendario UTC; no se aproxima como 30 días por mes.
- Al iniciar una consulta, se cancela la anterior. Un identificador de solicitud evita que una respuesta antigua reemplace datos más recientes.
- Los errores del proveedor se muestran con una acción de reintento; una respuesta vacía se distingue de un error.
- Los cambios de datos actualizan la escena Canvas sin reconstruir el renderer ni el controlador de interacción. Se mantienen el espaciado de velas, el desplazamiento temporal, el modo de escala, el zoom vertical y el desplazamiento vertical relativo.
- Las pruebas de navegador interceptan los endpoints públicos con respuestas sintéticas deterministas. No realizan consultas a Internet ni necesitan API keys durante CI.

Streaming, cotizaciones en vivo y Replay permanecen fuera de este flujo. Tampoco se cambia automáticamente de proveedor ante un error.

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

### Bybit Spot

- ID: `bybit-spot`
- Endpoint histórico: `GET /v5/market/kline` con `category=spot`
- Host por defecto: `https://api.bybit.com`
- Los datos públicos de mercado no requieren API key.
- Cada página admite hasta 1.000 velas; el máximo predeterminado es de 100 páginas por llamada.
- El endpoint devuelve las velas en orden descendente; el adaptador pagina hacia atrás, deduplica por timestamp y devuelve orden cronológico.
- Los intervalos comunes se traducen a la codificación V5; no se anuncian intervalos que Bybit no ofrece (por ejemplo, 1s y 8h).
- El planificador serializa las peticiones por instancia y aplica 100 ms de intervalo mínimo por defecto.
- Los errores HTTP y los códigos V5 se convierten en `MarketDataProviderError`; se propaga `Retry-After` cuando existe y no se realizan reintentos automáticos.
- Streaming todavía no está implementado.

### OKX Spot

- ID: `okx-spot`
- Endpoint histórico: `GET /api/v5/market/history-candles`
- Host por defecto: `https://www.okx.com`
- No requiere API key para datos públicos de mercado.
- Cada página admite hasta 100 velas; el máximo predeterminado es de 100 páginas por llamada.
- Usa el cursor `after` para recorrer páginas hacia timestamps anteriores y devuelve el resultado ordenado cronológicamente.
- El volumen se normaliza con `vol`, expresado en unidades del activo base para Spot.
- Para velas diarias, semanales y mensuales se utilizan las variantes UTC (`1Dutc`, `1Wutc`, `1Mutc`); el intervalo 1s tiene un histórico documentado de solo tres meses.
- El planificador serializa peticiones por instancia y aplica 110 ms entre peticiones, conservando margen frente al límite documentado de 20 peticiones cada dos segundos.
- Los códigos de error de la API y los errores HTTP se convierten en `MarketDataProviderError`; no hay reintentos automáticos.
- Streaming todavía no está implementado.
- La redistribución se clasifica como `unknown`; la aplicación no debe asumir que los datos pueden redistribuirse comercialmente.

La documentación oficial de Binance mantiene un endpoint específico de solo datos de mercado, sin credenciales, y documenta el endpoint de klines, el orden de resultados y los límites de peticiones:

- [Market Data Only URLs](https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md)
- [Spot REST API](https://developers.binance.com/en/docs/products/spot/rest-api)
- [Binance API limits](https://developers.binance.com/en/docs/products/spot/rest-api#limits)

## Candidatos para próximos adaptadores

Estos proveedores se mantienen como adaptadores independientes. Que el endpoint sea público no implica que todos los intervalos, mercados, profundidades históricas ni derechos de redistribución sean equivalentes.

- **Bybit:** Spot OHLCV implementado; Linear pendiente.
- **OKX:** Spot OHLCV implementado; Swap pendiente.
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
- [Bybit rate limit rules](https://bybit-exchange.github.io/docs/v5/rate-limit)
- [OKX API v5 — Candlesticks](https://www.okx.com/docs-v5/en/#rest-api-market-data-get-candlesticks)
- [OKX API v5 — Historical Candlesticks](https://www.okx.com/docs-v5/en/#rest-api-market-data-get-candlesticks-history)
- [BingX Open API](https://bingxservice.zendesk.com/hc/en-us)
- [Bitunix Open API](https://www.bitunix.com/api-docs/)
- [Kraken API rate limits](https://support.kraken.com/articles/206548367-what-are-the-api-rate-limits-)
- [CoinGecko API pricing](https://www.coingecko.com/en/api/pricing)
- [Alpha Vantage support and free quota](https://www.alphavantage.co/support/)
- [Twelve Data pricing and quotas](https://twelvedata.com/pricing)
- [Yahoo Finance terms](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html)
- [Google Finance Portfolio Data API status](https://developers.google.com/gdata/docs/directory)
