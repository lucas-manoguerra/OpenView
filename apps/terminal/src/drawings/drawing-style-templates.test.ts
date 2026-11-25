import { describe, expect, it } from 'vitest';
import { DRAWING_TOOL_TYPES } from './drawing-tool-preferences';
import {
  DEFAULT_DRAWING_STYLE_TEMPLATES,
  MAX_CUSTOM_DRAWING_TEMPLATES,
  createDrawingStyleTemplate,
  loadDrawingStyleTemplates,
  restoreDrawingStyleTemplates,
  saveDrawingStyleTemplates,
} from './drawing-style-templates';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const createTemplate = (
  id = 'custom-blueprint',
  name = 'Mi plantilla',
  tool: (typeof DRAWING_TOOL_TYPES)[number] = 'trend-line',
) =>
  createDrawingStyleTemplate(id, name, tool, {
    color: '#EF5350',
    lineWidth: 2,
    lineStyle: 'dashed',
  });

describe('drawing style templates', () => {
  it('provides immutable defaults independently for each drawing tool', () => {
    expect(DEFAULT_DRAWING_STYLE_TEMPLATES['trend-line']).toEqual({
      color: '#60a5fa',
      lineWidth: 1,
      lineStyle: 'solid',
    });
    expect(Object.keys(DEFAULT_DRAWING_STYLE_TEMPLATES)).toEqual(DRAWING_TOOL_TYPES);
  });

  it('creates normalized custom templates scoped to a drawing tool', () => {
    expect(createTemplate()).toEqual({
      id: 'custom-blueprint',
      name: 'Mi plantilla',
      tool: 'trend-line',
      color: '#ef5350',
      lineWidth: 2,
      lineStyle: 'dashed',
    });
    expect(createTemplate('custom-ray', 'Ray style', 'ray')?.tool).toBe('ray');
    expect(
      createDrawingStyleTemplate('custom-name', '   ', 'trend-line', {
        color: '#60a5fa',
        lineWidth: 1.5,
        lineStyle: 'solid',
      }),
    ).toBeNull();
  });

  it('rejects invalid identifiers, tools, colors, widths and line patterns', () => {
    const invalidTemplates = [
      { id: 'builtin-blue', name: 'Overwrite', tool: 'trend-line', color: '#ffffff', lineWidth: 1, lineStyle: 'solid' },
      { id: 'custom-invalid', name: 'No tool', color: '#ffffff', lineWidth: 1, lineStyle: 'solid' },
      { id: 'custom-invalid', name: 'No color', tool: 'trend-line', color: 'blue', lineWidth: 1, lineStyle: 'solid' },
      { id: 'custom-invalid', name: 'Too thin', tool: 'trend-line', color: '#ffffff', lineWidth: 0, lineStyle: 'solid' },
      { id: 'custom-invalid', name: 'Too thick', tool: 'trend-line', color: '#ffffff', lineWidth: 9, lineStyle: 'solid' },
      { id: 'custom-invalid', name: 'Unknown', tool: 'trend-line', color: '#ffffff', lineWidth: 1, lineStyle: 'wavy' },
      { id: 'custom-invalid', name: 'A'.repeat(33), tool: 'trend-line', color: '#ffffff', lineWidth: 1, lineStyle: 'solid' },
    ];

    expect(
      restoreDrawingStyleTemplates(JSON.stringify({ version: 2, templates: invalidTemplates })),
    ).toEqual([]);
  });

  it('ignores corrupt versions, malformed data and duplicate templates', () => {
    expect(restoreDrawingStyleTemplates('{')).toEqual([]);
    expect(restoreDrawingStyleTemplates(JSON.stringify({ version: 1, templates: [] }))).toEqual([]);
    expect(
      restoreDrawingStyleTemplates(
        JSON.stringify({
          version: 2,
          templates: [
            createTemplate(),
            createTemplate('custom-second', 'Otra plantilla'),
            { ...createTemplate('custom-third'), name: 'MI PLANTILLA' },
          ],
        }),
      ),
    ).toHaveLength(2);
  });

  it('persists, restores and caps custom templates', () => {
    const storage = new MemoryStorage();
    const templates = Array.from({ length: 25 }, (_, index) =>
      createTemplate('custom-template-' + String(index), 'Estilo ' + String(index)),
    ).filter((template) => template !== null);

    saveDrawingStyleTemplates(storage, templates);

    expect(loadDrawingStyleTemplates(storage)).toHaveLength(MAX_CUSTOM_DRAWING_TEMPLATES);
    expect(loadDrawingStyleTemplates(storage)[0]?.id).toBe('custom-template-0');
    expect(loadDrawingStyleTemplates(null)).toEqual([]);
    expect(() => saveDrawingStyleTemplates(null, templates)).not.toThrow();
  });

  it('keeps templates isolated by tool while restoring shared storage', () => {
    const storage = new MemoryStorage();
    saveDrawingStyleTemplates(storage, [
      createTemplate('custom-trend', 'Support', 'trend-line')!,
      createTemplate('custom-ray', 'Ray support', 'ray')!,
    ]);

    expect(loadDrawingStyleTemplates(storage).filter((template) => template.tool === 'trend-line')).toHaveLength(1);
    expect(loadDrawingStyleTemplates(storage).filter((template) => template.tool === 'ray')).toHaveLength(1);
  });

  it('uses an empty custom template list when browser storage is blocked', () => {
    const storage = {
      getItem: () => {
        throw new Error('Storage access is blocked.');
      },
      setItem: () => {
        throw new Error('Storage access is blocked.');
      },
    };

    expect(loadDrawingStyleTemplates(storage)).toEqual([]);
    expect(() => saveDrawingStyleTemplates(storage, [])).not.toThrow();
  });
});
