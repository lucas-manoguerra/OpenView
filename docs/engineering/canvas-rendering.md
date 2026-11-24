# Renderer Canvas 2D

## Responsabilidades

El paquete `packages/chart-engine` posee el dibujo del gráfico, el estado del contexto Canvas 2D usado durante cada frame y las dimensiones del backing store. La aplicación posee el elemento canvas, su tamaño CSS, su ubicación en el DOM y la observación de redimensionamientos.

El renderer no depende de Astro, Preact, proveedores de datos ni componentes de interfaz. Su scheduler de frames es inyectable para probar el ciclo de vida sin depender de un navegador.

## Espacios de coordenadas

El renderer recibe geometría en píxeles lógicos. El método `resize(width, height, devicePixelRatio)` establece el backing store en dimensiones redondeadas a píxeles físicos y aplica la transformación del device pixel ratio antes de dibujar.

El renderer no cambia el tamaño CSS. `attachCanvasResizeObserver` observa el tamaño lógico del Canvas, comunica el `devicePixelRatio` actual y vuelve a medir ante cambios de ventana. El host crea un nuevo `ChartFrame` con esas dimensiones y proporciona una escena compatible. Los timestamps de las velas siguen la convención Unix en milisegundos. El adapter y el renderer pueden probarse con observadores y superficies inyectables.

## Propiedad y ciclo de vida

- La aplicación posee el elemento canvas y decide cuándo se monta o desmonta.
- `CanvasRenderer` posee el contexto 2D adquirido, el tamaño del backing store y un único identificador de frame pendiente.
- `setScene` reemplaza la escena inmutable; pasar `null` limpia la escena actual.
- `invalidate` agrupa cambios repetidos en un único frame de animación.
- `renderNow` cancela el trabajo pendiente y dibuja de forma síncrona.
- `destroy` cancela el trabajo pendiente e impide el uso posterior. No elimina ni destruye el elemento canvas de la aplicación.

Un cambio de dimensiones o DPR reinicia el backing store y descarta la escena anterior. La aplicación debe proporcionar un frame construido para las nuevas dimensiones.

## Pipeline de dibujo

Cada frame dibuja el fondo y los ejes, el fondo del panel de volumen, la rejilla compartida, las velas OHLC visibles, las barras de volumen visibles y el crosshair.

Las conversiones de precio e índice lógico reutilizan las escalas del motor. El eje temporal mapea intervalos de calendario a timestamps de velas reales, adapta el intervalo al zoom y filtra etiquetas que se solaparían. Los datos temporales se validan y congelan una sola vez al construir la escena; los repintados reutilizan esa vista ordenada y buscan el segmento visible. Las etiquetas se formatean según el intervalo (hora/minuto, día, mes o año). Las velas se validan con el contrato de market-domain y deben llegar en orden estrictamente ascendente por índice lógico. Una búsqueda binaria selecciona el segmento visible antes del dibujo, evitando recorrer toda la serie en cada frame.

Las barras de volumen se normalizan con el volumen máximo del segmento visible. El clipping de velas y volumen se limita a sus respectivas áreas.

## Observación de tamaño

`attachCanvasResizeObserver` comunica el ancho y alto CSS del Canvas junto con el `devicePixelRatio`. Utiliza `ResizeObserver` para cambios del elemento y escucha el resize de ventana para volver a medir dimensiones y densidad de píxeles. Su `destroy` desconecta el observer y libera el listener. Las dependencias del navegador pueden inyectarse para pruebas deterministas.

El host debe reconstruir el `ChartFrame` cuando cambie el tamaño lógico o el DPR. Debe conservar las opciones de la escala temporal para mantener el zoom y el desplazamiento durante el resize.

## Interacción de puntero

`ChartInteractionController` posee el estado de navegación independiente del DOM: frame actual, posición del crosshair y estado de arrastre.

- Movimiento dentro del plot actualiza el crosshair; al salir del plot lo oculta.
- El arrastre con botón primario dentro del plot desplaza el eje temporal.
- El arrastre sobre un eje de precios desplaza verticalmente el rango de precios.
- La rueda horizontal dentro del plot desplaza el eje temporal.
- La rueda vertical dentro del plot aplica zoom temporal anclado al índice lógico bajo el cursor.
- La rueda vertical sobre un eje de precios aplica zoom de precios anclado al precio bajo el cursor.
- El doble clic sobre el eje de precios puede ejecutar autoajuste usando un rango calculado por el host a partir de las velas visibles.
- El autoajuste y los datos permanecen desacoplados: el adaptador entrega un rango y el controlador aplica ese rango preservando el modo de escala.
- Los gestos de trackpad pueden combinar desplazamiento horizontal y zoom vertical.
- El zoom respeta los límites de separación de barras definidos en `TimeScale`.
- Cambiar el frame cancela el arrastre y limpia el crosshair.

`attachCanvasPointerEvents` es el adaptador DOM. Convierte coordenadas de cliente a píxeles CSS lógicos del Canvas, captura un único puntero primario durante el arrastre, evita el scroll de página solo cuando la rueda se consume dentro del plot y libera la captura y los listeners al destruirse.

El host debe configurar `touch-action: none` en el Canvas cuando quiera que los gestos táctiles se entreguen íntegramente al gráfico. El host debe preservar tanto la escala temporal como el rango y modo de la escala de precios cuando reconstruya el frame tras un resize. El adaptador no modifica estilos del elemento que pertenece a la aplicación.

## Limitaciones actuales

- El eje temporal utiliza timestamps Unix en milisegundos y selecciona intervalos legibles según el rango visible y el ancho del plot. Las etiquetas siguen la zona horaria local por defecto; se puede especificar una zona horaria y locale al generar ticks.
- El renderer no observa directamente el DOM; el host conecta `attachCanvasResizeObserver` con `CanvasRenderer.resize` y reconstruye el frame.
- No hay todavía navegación por teclado, overlays configurables ni paneles sincronizados. La zona horaria del eje aún no tiene un selector visual en la terminal.
- No se fija un presupuesto de tiempo por frame ni de memoria hasta medir un baseline repetible.

## Integración de terminal

La isla Preact `ChartCanvas` aloja el elemento, crea el renderer y los adapters en su ref callback estable, y libera todos sus recursos al desmontarse. Usa datos OHLCV de demostración explícitamente identificados como tales; todavía no consume un proveedor de mercado. Los cambios de pan, zoom y crosshair actualizan el frame de la escena sin volver a validar ni clonar la colección de velas.

## Verificación

El renderer tiene pruebas deterministas con un contexto Canvas que registra operaciones y un scheduler de frames inyectado. Verifican comandos de dibujo, dimensiones DPR, agrupación de frames, render inmediato, limpieza de escena, resize y destrucción sin depender de temporización del navegador.
