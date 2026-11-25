import { useCallback, useState } from 'preact/hooks';
import { Badge, Button, Divider, IconButton, Tooltip } from '../ui';

export function ButtonPlayground() {
  const setPlaygroundRef = useCallback((element: HTMLDivElement | null) => {
    if (element) element.dataset.hydrated = 'true';
  }, []);
  const [count, setCount] = useState(0);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div class="space-y-6" data-testid="buttons-playground" data-hydrated="false" ref={setPlaygroundRef}>
      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-[#d1d4dc]">Variantes</h2>
          <Badge tone="positive">Interactivo</Badge>
        </div>
        <div class="flex flex-wrap items-center gap-2 rounded-md border border-[#2a2e39] bg-[#131722] p-4">
          <Button variant="primary">Comprar</Button>
          <Button variant="secondary">Cancelar</Button>
          <Button variant="ghost">Más información</Button>
          <Button variant="danger">Eliminar</Button>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold text-[#d1d4dc]">Tamaños</h2>
        <div class="flex flex-wrap items-center gap-2 rounded-md border border-[#2a2e39] bg-[#131722] p-4">
          <Button size="small">Pequeño</Button>
          <Button size="medium">Mediano</Button>
          <Button size="large">Grande</Button>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold text-[#d1d4dc]">Estados</h2>
        <div class="flex flex-wrap items-center gap-2 rounded-md border border-[#2a2e39] bg-[#131722] p-4">
          <Button disabled>Deshabilitado</Button>
          <Button loading={loading} onClick={() => setLoading(!loading)}>
            {loading ? 'Cargando' : 'Simular carga'}
          </Button>
          <Button fullWidth variant="primary">
            Ancho completo
          </Button>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold text-[#d1d4dc]">IconButton y Tooltip</h2>
        <div class="flex items-center gap-2 rounded-md border border-[#2a2e39] bg-[#131722] p-4">
          <Tooltip content="Añadir al gráfico">
            <IconButton
              label="Añadir al gráfico"
              active={active}
              onClick={() => setActive(!active)}
            >
              <span class="text-base leading-none">＋</span>
            </IconButton>
          </Tooltip>
          <Tooltip content="Configuración">
            <IconButton label="Configuración">
              <span class="text-sm leading-none">⚙</span>
            </IconButton>
          </Tooltip>
          <Divider orientation="vertical" class="mx-1 h-6" />
          <Badge tone={active ? 'blue' : 'neutral'}>{active ? 'Activo' : 'Inactivo'}</Badge>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold text-[#d1d4dc]">Prueba de eventos</h2>
        <div class="flex flex-wrap items-center gap-3 rounded-md border border-[#2a2e39] bg-[#131722] p-4">
          <Button variant="primary" onClick={() => setCount(count + 1)}>
            Incrementar contador
          </Button>
          <Button variant="secondary" onClick={() => setCount(0)}>
            Reiniciar
          </Button>
          <span class="font-mono text-sm tabular-nums text-[#d1d4dc]" aria-live="polite">
            Clicks: {count}
          </span>
        </div>
      </section>
    </div>
  );
}
