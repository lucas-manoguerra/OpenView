# Renderer Canvas 2D

## Responsabilidades

El paquete `packages/chart-engine` posee el dibujo del gráfico, el estado del contexto Canvas 2D usado durante cada frame y las dimensiones del backing store. La aplicación posee el elemento canvas, su tamaño CSS, su ubicación en el DOM y la observación de redimensionamientos.

El renderer no depende de Astro, Preact, proveedores de datos ni componentes de interfaz. Su scheduler de frames es inyectable para probar el ciclo de vida sin depender de un navegador.

## Espacios de coordenadas

El renderer recibe geometría en píxeles lógicos. El método `resize(width, height, devicePixelRatio)` establece el backing store en dimensiones redondeadas a píxeles físicos y aplica la transformación del device pixel ratio antes de dibujar.

El renderer no cambia el tamaño CSS. La aplicación debe medir ese espacio y pasar el ancho y alto lógicos. Después de un resize, debe crear un nuevo `ChartFrame` con las dimensiones medidas y proporcionar una escena compatible.

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

Las conversiones de precio e índice lógico reutilizan las escalas del motor. Las velas se validan con el contrato de market-domain y deben llegar en orden estrictamente ascendente por índice lógico. Una búsqueda binaria selecciona el segmento visible antes del dibujo, evitando recorrer toda la serie en cada frame.

Las barras de volumen se normalizan con el volumen máximo del segmento visible. El clipping de velas y volumen se limita a sus respectivas áreas.

## Limitaciones actuales

- Las etiquetas del eje temporal muestran índices lógicos, no timestamps formateados del mercado.
- El renderer no observa eventos de resize del DOM; la aplicación debe medir y llamar a `resize`.
- La interacción de puntero y teclado, la propiedad del estado del crosshair, los overlays y los paneles sincronizados son capas posteriores.
- No se fija un presupuesto de tiempo por frame ni de memoria hasta medir un baseline repetible.

## Verificación

El renderer tiene pruebas deterministas con un contexto Canvas que registra operaciones y un scheduler de frames inyectado. Verifican comandos de dibujo, dimensiones DPR, agrupación de frames, render inmediato, limpieza de escena, resize y destrucción sin depender de temporización del navegador.
