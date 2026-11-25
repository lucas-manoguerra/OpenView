import { Dialog } from '../ui';

export function DialogPlayground() {
  return (
    <div class="space-y-6">
      <section class="space-y-3">
        <h2 class="text-sm font-semibold text-[#d1d4dc]">Diálogo de configuración</h2>
        <div class="flex flex-wrap items-center gap-3 rounded-md border border-[#2a2e39] bg-[#131722] p-4">
          <Dialog
            triggerLabel="Abrir diálogo de configuración"
            title="Configuración del gráfico"
            description="Personaliza las opciones de visualización del espacio de trabajo."
          >
            <div class="space-y-4">
              <label class="block space-y-2 text-xs text-[#b2b5be]" for="dialog-layout-name">
                Nombre del diseño
                <input
                  id="dialog-layout-name"
                  data-dialog-autofocus
                  defaultValue="Mi espacio de trabajo"
                  class="h-9 w-full rounded border border-[#434651] bg-[#131722] px-3 text-sm text-[#d1d4dc] outline-none focus:border-[#2962ff]"
                />
              </label>
              <p class="text-xs leading-5 text-[#787b86]">
                Los cambios se aplicarán al diseño activo y podrán guardarse desde el menú de
                diseño.
              </p>
            </div>
          </Dialog>
          <Dialog
            triggerLabel="Abrir información"
            title="Información del instrumento"
            description="Panel secundario con contenido de lectura."
          >
            <p class="text-xs leading-5 text-[#b2b5be]">
              Los diálogos mantienen el foco dentro de la ventana, admiten Escape y devuelven el
              foco al control que los abrió.
            </p>
          </Dialog>
        </div>
      </section>
    </div>
  );
}
