import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_DRAWING_STYLE_TEMPLATES,
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

const createTemplate = (id = 'custom-blueprint', name = 'Mi plantilla') =>
  createDrawingStyleTemplate(id, name, {
    color: '#EF5350',
    lineWidth: 2,
    lineStyle: 'dashed',
  });

describe('drawing style templates', () => {
  it('provides built-in chart drawing styles', () => {
    expect(BUILT_IN_DRAWING_STYLE_TEMPLATES.map((template) => template.name)).toEqual([
      'Azul clásico',
      'Rojo discontinuo',
      'Verde',
      'Dorado punteado',
    ]);
    expect(BUILT_IN_DRAWING_STYLE_TEMPLATES[1]).toMatchObject({
      color: '#ef5350',
      lineWidth: 2,
      lineStyle: 'dashed',
    });
  });

  it('creates normalized custom templates from a drawing style', () => {
    expect(createTemplate()).toEqual({
      id: 'custom-blueprint',
      name: 'Mi plantilla',
      color: '#ef5350',
      lineWidth: 2,
      lineStyle: 'dashed',
    });
    expect(
      createDrawingStyleTemplate('custom-name', '   ', {
        color: '#60a5fa',
        lineWidth: 1.5,
        lineStyle: 'solid',
      }),
    ).toBeNull();
  });

  it('rejects invalid identifiers, colors, widths and line patterns', () => {
    const invalidTemplates = [
      { id: 'builtin-blue', name: 'Overwrite', color: '#ffffff', lineWidth: 1, lineStyle: 'solid' },
      { id: 'custom-invalid', name: 'No color', color: 'blue', lineWidth: 1, lineStyle: 'solid' },
      {
        id: 'custom-invalid',
        name: 'Too thin',
        color: '#ffffff',
        lineWidth: 0,
        lineStyle: 'solid',
      },
      {
        id: 'custom-invalid',
        name: 'Too thick',
        color: '#ffffff',
        lineWidth: 9,
        lineStyle: 'solid',
      },
      { id: 'custom-invalid', name: 'Unknown', color: '#ffffff', lineWidth: 1, lineStyle: 'wavy' },
      {
        id: 'custom-invalid',
        name: 'A'.repeat(33),
        color: '#ffffff',
        lineWidth: 1,
        lineStyle: 'solid',
      },
    ];

    expect(
      restoreDrawingStyleTemplates(JSON.stringify({ version: 1, templates: invalidTemplates })),
    ).toEqual([]);
  });

  it('ignores corrupt versions, malformed data and duplicate templates', () => {
    expect(restoreDrawingStyleTemplates('{')).toEqual([]);
    expect(restoreDrawingStyleTemplates(JSON.stringify({ version: 2, templates: [] }))).toEqual([]);
    expect(
      restoreDrawingStyleTemplates(
        JSON.stringify({
          version: 1,
          templates: [
            createTemplate(),
            createTemplate('custom-second', 'Otra plantilla'),
            {
              ...createTemplate('custom-third'),
              name: 'MI PLANTILLA',
            },
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
