# ADR 0003: Prohibición de useEffect

## Estado

Aceptado.

## Contexto

El proyecto prioriza ejecución predecible, rendering eficiente y propiedad explícita de recursos. Los efectos implícitos dificultan razonar sobre suscripciones, ciclos de vida y trabajo repetido.

## Decisión

No se permite importar ni invocar `useEffect` en el código de aplicación o paquetes. El estado local, el estado derivado, los eventos y las suscripciones explícitas deben modelarse según su responsabilidad y ciclo de vida.

La prohibición no autoriza a recrear un hook de efectos bajo otro nombre. Los recursos externos deben tener propietarios explícitos, métodos de inicio y liberación, y tests de sus transiciones.

## Consecuencias

- Las islas Preact prefieren estado local y señales cuando aportan granularidad real.
- El motor controla su propio ciclo de vida fuera de Preact.
- Las suscripciones se liberan explícitamente.
- El harness rechaza imports y llamadas a `useEffect`.
