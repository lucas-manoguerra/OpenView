import { useState } from 'preact/hooks';
import type { ChartRenderDrawing } from '@openview/chart-engine';
import { DrawingPropertiesPanel } from '../drawings/DrawingPropertiesPanel';
import { createDrawingStyleTemplate, type DrawingStyleTemplate } from '../../drawings/drawing-style-templates';

const DEFAULT_DRAWING: ChartRenderDrawing = {
  id: 'component-lab-trend-line',
  type: 'trend-line',
  start: { logicalIndex: 10, timestamp: 1_700_000_000_000, price: 42000 },
  end: { logicalIndex: 30, timestamp: 1_700_001_200_000, price: 43500 },
  color: '#60a5fa',
  lineWidth: 1,
  lineStyle: 'solid',
};

export function DrawingPropertiesPanelPlayground() {
  const [drawing, setDrawing] = useState<ChartRenderDrawing>(DEFAULT_DRAWING);
  const [templates, setTemplates] = useState<readonly DrawingStyleTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('default');
  const [templateName, setTemplateName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const updateStyle = (updates: Partial<ChartRenderDrawing>) => {
    setDrawing((current) => ({ ...current, ...updates }));
  };

  const saveTemplate = () => {
    const template = createDrawingStyleTemplate(
      'component-lab-' + crypto.randomUUID(),
      templateName,
      'trend-line',
      {
        color: drawing.color,
        lineWidth: drawing.lineWidth ?? 1,
        lineStyle: drawing.lineStyle ?? 'solid',
      },
    );
    if (template === null) {
      setError('Escribe un nombre de hasta 32 caracteres.');
      return;
    }
    setTemplates((current) => [...current, template]);
    setSelectedTemplateId(template.id);
    setTemplateName('');
    setError(null);
  };

  const applyTemplate = () => {
    if (selectedTemplateId === 'default') {
      setDrawing((current) => ({
        ...current,
        color: DEFAULT_DRAWING.color,
        lineWidth: DEFAULT_DRAWING.lineWidth,
        lineStyle: DEFAULT_DRAWING.lineStyle,
      }));
      return;
    }
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (template !== undefined) {
      updateStyle({
        color: template.color,
        lineWidth: template.lineWidth,
        lineStyle: template.lineStyle,
      });
    }
  };

  return (
    <section class="space-y-4" data-testid="drawing-properties-playground">
      <div class="rounded-md border border-[#2a2e39] bg-[#131722] p-4">
        <p class="text-xs font-semibold text-[#d1d4dc]">Vista previa interactiva</p>
        <p class="mt-1 text-xs leading-5 text-[#787b86]">
          Edita el estilo, guarda una plantilla personalizada y comprueba el estado del panel sin depender del gráfico.
        </p>
        <div class="mt-4 flex items-center gap-3 rounded bg-[#0b0f17] p-4">
          <span class="h-0.5 flex-1" style={{ background: drawing.color, borderTop: drawing.lineStyle === 'dashed' ? '2px dashed currentColor' : drawing.lineStyle === 'dotted' ? '2px dotted currentColor' : undefined, color: drawing.color }} />
          <span class="text-xs tabular-nums text-[#787b86]">{drawing.lineWidth ?? 1}px</span>
        </div>
      </div>
      <div class="relative min-h-[390px] overflow-hidden rounded-md border border-[#2a2e39] bg-[#0b0f17] p-4">
        <DrawingPropertiesPanel
          selectedDrawing={drawing}
          selectedDrawingIds={['component-lab-trend-line']}
          selectedDrawingsShareType
          panelPosition={null}
          templates={templates}
          activeDefaultStyle
          activeTemplateTool="trend-line"
          expanded={expanded}
          selectedTemplateId={selectedTemplateId}
          newTemplateName={templateName}
          templateError={error}
          panelRef={() => {}}
          onDragStart={() => {}}
          onClose={() => {}}
          onStyleChange={updateStyle}
          onToggleTemplates={() => setExpanded((value) => !value)}
          onTemplateChange={setSelectedTemplateId}
          onApplyTemplate={applyTemplate}
          onDeleteTemplate={() => {
            setTemplates((current) => current.filter((item) => item.id !== selectedTemplateId));
            setSelectedTemplateId('default');
          }}
          onTemplateNameChange={(name) => {
            setTemplateName(name);
            setError(null);
          }}
          onSaveTemplate={saveTemplate}
        />
      </div>
    </section>
  );
}
