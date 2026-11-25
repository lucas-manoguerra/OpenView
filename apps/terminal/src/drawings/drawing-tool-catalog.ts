export type DrawingToolGroup =
  | 'lines'
  | 'channels'
  | 'pitchforks'
  | 'fibonacci'
  | 'gann'
  | 'patterns'
  | 'elliott-waves'
  | 'cycles'
  | 'forecast-measurement'
  | 'shapes'
  | 'annotations';

export type DrawingToolGeometry =
  | 'two-point-line'
  | 'horizontal-line'
  | 'vertical-line'
  | 'multi-point'
  | 'parallel-channel'
  | 'fibonacci-levels'
  | 'time-levels'
  | 'pattern-points'
  | 'freehand'
  | 'rectangle'
  | 'ellipse'
  | 'text-anchor'
  | 'price-range'
  | 'date-range'
  | 'volume-profile';

export type DrawingToolDefinition = Readonly<{
  id: string;
  label: string;
  group: DrawingToolGroup;
  geometry: DrawingToolGeometry;
  anchors: number;
  availability: 'implemented' | 'planned';
}>;

const implemented = (id: string): boolean =>
  id === 'trend-line' ||
  id === 'ray' ||
  id === 'horizontal-line' ||
  id === 'vertical-line' ||
  id === 'rectangle';

const define = (
  id: string,
  label: string,
  group: DrawingToolGroup,
  geometry: DrawingToolGeometry,
  anchors: number,
): DrawingToolDefinition =>
  Object.freeze({
    id,
    label,
    group,
    geometry,
    anchors,
    availability: implemented(id) ? 'implemented' : 'planned',
  });

export const DRAWING_TOOL_CATALOG: readonly DrawingToolDefinition[] = Object.freeze([
  define('trend-line', 'Línea de tendencia', 'lines', 'two-point-line', 2),
  define('ray', 'Rayo', 'lines', 'two-point-line', 2),
  define('horizontal-line', 'Línea horizontal', 'lines', 'horizontal-line', 1),
  define('vertical-line', 'Línea vertical', 'lines', 'vertical-line', 1),
  define('cross-line', 'Cruce de líneas', 'lines', 'two-point-line', 2),
  define('horizontal-ray', 'Rayo horizontal', 'lines', 'horizontal-line', 1),
  define('trend-angle', 'Ángulo de tendencia', 'lines', 'two-point-line', 2),
  define('parallel-channel', 'Canal paralelo', 'channels', 'parallel-channel', 3),
  define('regression-trend', 'Tendencia de regresión', 'channels', 'two-point-line', 2),
  define('flat-top-bottom', 'Plano superior / inferior', 'channels', 'parallel-channel', 3),
  define('disjoint-channel', 'Canal desconectado', 'channels', 'parallel-channel', 4),
  define('pitchfork', 'Tridente', 'pitchforks', 'multi-point', 3),
  define('schiff-pitchfork', 'Tridente de Schiff', 'pitchforks', 'multi-point', 3),
  define('inside-pitchfork', 'Tridente interno', 'pitchforks', 'multi-point', 3),
  define('fib-retracement', 'Retroceso de Fibonacci', 'fibonacci', 'fibonacci-levels', 2),
  define('fib-extension', 'Extensión de Fibonacci', 'fibonacci', 'fibonacci-levels', 3),
  define('fib-channel', 'Canal de Fibonacci', 'fibonacci', 'fibonacci-levels', 3),
  define('fib-time-zone', 'Zona horaria de Fibonacci', 'fibonacci', 'time-levels', 2),
  define('fib-fan', 'Abanico de Fibonacci', 'fibonacci', 'fibonacci-levels', 2),
  define('fib-time-projection', 'Proyección temporal de Fibonacci', 'fibonacci', 'time-levels', 3),
  define('fib-circles', 'Círculos de Fibonacci', 'fibonacci', 'fibonacci-levels', 2),
  define('fib-spiral', 'Espiral de Fibonacci', 'fibonacci', 'fibonacci-levels', 2),
  define('fib-arcs', 'Arcos de Fibonacci', 'fibonacci', 'fibonacci-levels', 2),
  define('fib-wedge', 'Cuña de Fibonacci', 'fibonacci', 'fibonacci-levels', 3),
  define('gann-box', 'Cuadro de Gann', 'gann', 'two-point-line', 2),
  define('gann-fan', 'Abanico de Gann', 'gann', 'two-point-line', 2),
  define('xabcd-pattern', 'Patrón XABCD', 'patterns', 'pattern-points', 5),
  define('cypher-pattern', 'Patrón Cypher', 'patterns', 'pattern-points', 5),
  define('head-and-shoulders', 'Hombro-cabeza-hombros', 'patterns', 'pattern-points', 5),
  define('abcd-pattern', 'Patrón ABCD', 'patterns', 'pattern-points', 4),
  define('triangle-pattern', 'Patrón de triángulo', 'patterns', 'pattern-points', 3),
  define('three-drives-pattern', 'Patrón de tres impulsos', 'patterns', 'pattern-points', 6),
  define('elliott-impulse', 'Onda de impulso Elliott 1–5', 'elliott-waves', 'pattern-points', 5),
  define('elliott-correction', 'Onda correctiva Elliott A–B–C', 'elliott-waves', 'pattern-points', 3),
  define('elliott-triangle', 'Triángulo Elliott A–B–C–D–E', 'elliott-waves', 'pattern-points', 5),
  define('elliott-double-combo', 'Combinación doble Elliott W–X–Y', 'elliott-waves', 'pattern-points', 3),
  define('elliott-triple-combo', 'Combinación triple Elliott W–X–Y–X–Z', 'elliott-waves', 'pattern-points', 5),
  define('cyclic-lines', 'Líneas cíclicas', 'cycles', 'time-levels', 2),
  define('time-cycles', 'Ciclos de tiempo', 'cycles', 'time-levels', 2),
  define('sine-line', 'Línea seno', 'cycles', 'two-point-line', 2),
  define('long-position', 'Posición larga', 'forecast-measurement', 'rectangle', 2),
  define('short-position', 'Posición corta', 'forecast-measurement', 'rectangle', 2),
  define('anchored-vwap', 'VWAP anclado', 'forecast-measurement', 'text-anchor', 1),
  define('price-range', 'Rango de precio', 'forecast-measurement', 'price-range', 2),
  define('date-range', 'Rango de fecha', 'forecast-measurement', 'date-range', 2),
  define('fixed-range-volume-profile', 'Perfil de volumen de rango fijo', 'forecast-measurement', 'volume-profile', 2),
  define('anchored-volume-profile', 'Perfil de volumen anclado', 'forecast-measurement', 'volume-profile', 1),
  define('date-price-range', 'Rango de fecha y precio', 'forecast-measurement', 'price-range', 2),
  define('brush', 'Pincel', 'shapes', 'freehand', 1),
  define('rectangle', 'Rectángulo', 'shapes', 'rectangle', 2),
  define('path', 'Ruta', 'shapes', 'freehand', 1),
  define('circle', 'Círculo', 'shapes', 'ellipse', 2),
  define('ellipse', 'Elipse', 'shapes', 'ellipse', 2),
  define('triangle', 'Triángulo', 'shapes', 'multi-point', 3),
  define('arc', 'Arco', 'shapes', 'multi-point', 3),
  define('curve', 'Curva', 'shapes', 'freehand', 1),
  define('arrow', 'Flecha', 'shapes', 'two-point-line', 2),
  define('text', 'Texto', 'annotations', 'text-anchor', 1),
  define('note', 'Nota', 'annotations', 'text-anchor', 1),
  define('price-note', 'Nota de precio', 'annotations', 'text-anchor', 1),
  define('table', 'Tabla', 'annotations', 'text-anchor', 1),
  define('legend', 'Leyenda', 'annotations', 'text-anchor', 1),
  define('comment', 'Comentario', 'annotations', 'text-anchor', 1),
]);

export const DRAWING_TOOL_GROUPS: readonly Readonly<{
  id: DrawingToolGroup;
  label: string;
}>[] = Object.freeze([
  { id: 'lines', label: 'Líneas' },
  { id: 'channels', label: 'Canales' },
  { id: 'pitchforks', label: 'Tridentes' },
  { id: 'fibonacci', label: 'Fibonacci' },
  { id: 'gann', label: 'Gann' },
  { id: 'patterns', label: 'Patrones' },
  { id: 'elliott-waves', label: 'Ondas de Elliott' },
  { id: 'cycles', label: 'Ciclos' },
  { id: 'forecast-measurement', label: 'Proyección y medición' },
  { id: 'shapes', label: 'Formas' },
  { id: 'annotations', label: 'Anotaciones' },
]);

export const getDrawingToolsByGroup = (
  group: DrawingToolGroup,
): readonly DrawingToolDefinition[] =>
  DRAWING_TOOL_CATALOG.filter((tool) => tool.group === group);

export const getDrawingToolById = (
  id: string,
): DrawingToolDefinition | undefined =>
  DRAWING_TOOL_CATALOG.find((tool) => tool.id === id);
