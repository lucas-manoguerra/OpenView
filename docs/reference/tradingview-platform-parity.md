# Plan de paridad integral con la plataforma TradingView

## Objetivo

Construir OpenView como una réplica visual y funcional de la plataforma TradingView completa. La paridad incluye el espacio de trabajo, gráficos, herramientas, investigación de mercados, análisis, alertas, operaciones, datos, scripts y funciones sociales. No se limita al lienzo del gráfico.

## Fuente única de producto

La plataforma oficial TradingView y su documentación oficial son las únicas referencias para decidir cómo debe verse y comportarse OpenView. No utilizar otras plataformas, terminales, brokers ni sistemas de diseño para completar decisiones de producto.

La documentación técnica de proveedores de datos, protocolos, estándares web y APIs puede consultarse solo para verificar hechos o contratos técnicos. Esa documentación no define patrones de interfaz ni comportamientos de producto.

OpenView debe implementar sus propias abstracciones y código. No copiar código fuente, assets propietarios, tests internos ni detalles privados de implementación de TradingView. TradingView Lightweight Charts no sustituye a la plataforma como referencia visual, funcional, arquitectónica o de interacción y no se incorpora como dependencia.

## Método de relevamiento

Para cada capacidad observada directamente en TradingView:

1. Registrar la sección de la plataforma, el contexto, el estado inicial y las condiciones necesarias.
2. Describir la secuencia exacta de acciones, incluidas las entradas de ratón, teclado y, cuando corresponda, táctiles.
3. Registrar jerarquía visual, dimensiones relativas, alineación, espaciado, tipografía, colores, iconografía, estados, menús, diálogos y mensajes.
4. Verificar estados normales, límites, errores, persistencia, sincronización y comportamiento al cambiar de símbolo, intervalo o layout.
5. Separar hechos observados de hipótesis o comportamientos todavía no verificados.
6. Convertir cada observación en criterios de aceptación funcionales, visuales y automatizables.
7. Validar OpenView contra la misma secuencia y contexto de TradingView, sin introducir comparaciones con otros productos.

Las capturas de referencia deben ser observaciones propias de la plataforma oficial, tomadas en el contexto que se está verificando. No reutilizar assets propietarios.

## Mapa de paridad

### 1. Supercharts y espacio de trabajo

- Estructura global, barras superior, lateral izquierda y lateral derecha.
- Búsqueda global de comandos y búsqueda de símbolos.
- Área de gráfico, leyendas, escalas, crosshair, grillas y paneles.
- Tipos de gráfico, intervalos estándar y personalizados.
- Layouts guardados, creación, duplicación, renombrado, guardado y restauración.
- Gráficos múltiples, maximización y sincronización de símbolo, intervalo, crosshair, rango temporal y dibujos.
- Preferencias visuales y configuración del espacio de trabajo.

### 2. Herramientas de dibujo y anotación

- Catálogo completo de herramientas y agrupaciones de la barra de dibujo.
- Creación, selección, movimiento, edición, duplicación y eliminación.
- Puntos de anclaje, manejadores, geometría y edición de cada punto.
- Ajuste magnético a precios y valores de indicadores, incluidos sus modos de intensidad.
- Propiedades específicas por figura: color, grosor, trazo, relleno, transparencia, extensiones y marcadores.
- Mantener activa una herramienta para crear objetos sucesivos.
- Bloquear, ocultar, mostrar, eliminar y sincronizar dibujos.
- Sincronización local por layout y global por símbolo.
- Historial de deshacer y rehacer, plantillas y preferencias de estilo.

### 3. Indicadores, estrategias y análisis técnico

- Catálogo de indicadores integrados y estrategias.
- Búsqueda, categorías, favoritos, configuración y eliminación.
- Overlays y paneles de indicadores independientes.
- Parámetros, estilos, escalas, fuentes de datos y visibilidad.
- Indicadores personalizados y scripts comunitarios.
- Análisis multitemporal, reconocimiento de patrones y herramientas de perfil de volumen.
- Valores de indicadores, leyendas, ventanas de datos y reglas de alertas.

### 4. Pine Script y entorno de desarrollo

- Editor Pine, pestañas, edición, autoguardado y restauración.
- Creación, edición y aplicación de indicadores, estrategias y bibliotecas.
- Diagnósticos, compilación, resultados y registros.
- Versiones, publicación y gestión de scripts.
- Integración del script con el gráfico, alertas y herramientas de análisis.

### 5. Watchlists, detalles, noticias y alertas

- Watchlists múltiples, grupos, orden, columnas, banderas y persistencia.
- Detalles del instrumento, datos fundamentales, estadísticas y noticias.
- Alertas de precio, indicadores, dibujos, scripts y listas de seguimiento.
- Condiciones simples y combinadas, frecuencia, expiración, notificaciones y gestión.
- Historial, edición, pausa, reanudación y eliminación de alertas.

### 6. Investigación y descubrimiento de mercados

- Screeners de acciones, bonos, ETFs, criptomonedas y pares centralizados y descentralizados.
- Filtros, columnas, orden, intervalos, vistas guardadas y resultados.
- Heatmaps por clase de activo, sector y filtros.
- Calendario económico, resultados corporativos y dividendos.
- Mapas macroeconómicos, indicadores por país y curvas de rendimiento.
- Exploración de símbolos, mercados y clases de activos.

### 7. Datos fundamentales y opciones

- Métricas fundamentales, ratios, estados financieros y series históricas.
- Cadena de opciones, vencimientos, griegas y volatilidad.
- Constructor de estrategias de opciones, perfiles de P&L y escenarios.
- Comparación y modificación de estrategias sobre gráficos.

### 8. Replay y simulación

- Replay histórico, selección de punto de inicio y navegación por barras.
- Reproducción, pausa, avance paso a paso y velocidades.
- Indicadores y dibujos durante la reproducción.
- Simulación y revisión de operaciones históricas.
- Sincronización del replay entre varios gráficos.

### 9. Trading y gestión de operaciones

- Panel de trading y conexión con proveedores compatibles.
- Ticket de órdenes, tipos de orden, cantidades y protección.
- Posiciones, órdenes abiertas, historial y estado de cuenta.
- Paper Trading: cuentas, saldo, moneda, apalancamiento, comisiones y operaciones virtuales.
- Gestión de riesgo y visualización de posiciones y órdenes en el gráfico.

### 10. Noticias, comunidad y cuenta

- Noticias globales, por símbolo y por empresa.
- Ideas, publicaciones, perfiles, comentarios y seguimiento de autores.
- Publicación y descubrimiento de scripts e indicadores comunitarios.
- Preferencias de cuenta, notificaciones y sincronización entre dispositivos.
- Aplicaciones web, escritorio y móviles, verificando sus diferencias reales.

## Próxima secuencia de trabajo

1. Completar la edición de dibujos con puntos de anclaje y manejadores visibles, ajuste de cada punto y comportamiento de selección fiel a TradingView.
2. Completar magnetismo, mantener herramienta activa, bloqueo, ocultación y sincronización de dibujos.
3. Consolidar el motor de indicadores y los paneles de análisis.
4. Implementar layouts multipanel y sincronización de gráficos.
5. Avanzar por alertas, replay, screeners, investigación fundamental, opciones y trading.
6. Incorporar Pine Script y el resto de módulos de la plataforma.

Esta secuencia es una cola de trabajo, no una afirmación de que las áreas ya estén completas. Cada bloque requiere relevamiento directo, criterios de aceptación y verificación.

## Referencias oficiales de TradingView

- [Funciones de TradingView](https://www.tradingview.com/features/)
- [Introducción a Supercharts](https://www.tradingview.com/support/solutions/43000746464-getting-started-with-supercharts/)
- [Herramientas de dibujo disponibles](https://www.tradingview.com/support/solutions/43000703396-drawing-tools-available-on-tradingview/)
- [Layouts, gráficos, dibujos, indicadores e interacción](https://www.tradingview.com/support/solutions/43000692404-layouts-charts-drawings-indicators-and-their-interaction/)
- [Guía de layouts de TradingView](https://www.tradingview.com/support/solutions/43000746975-tradingview-layouts-a-quick-guide/)
- [Pine Script](https://www.tradingview.com/support/solutions/43000561836-what-is-pine-script/)
- [Uso de Pine Editor](https://www.tradingview.com/support/solutions/43000763320-how-to-work-with-pine-editor/)
