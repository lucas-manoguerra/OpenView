import { describe, expect, it } from 'vitest';
import {
  DRAWING_TOOL_CATALOG,
  DRAWING_TOOL_GROUPS,
  getDrawingToolById,
  getDrawingToolsByGroup,
} from './drawing-tool-catalog';

describe('TradingView drawing tool catalog', () => {
  it('contains unique stable identifiers and labels', () => {
    const ids = DRAWING_TOOL_CATALOG.map((tool) => tool.id);
    const labels = DRAWING_TOOL_CATALOG.map((tool) => tool.label);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('covers every declared group', () => {
    for (const group of DRAWING_TOOL_GROUPS) {
      expect(getDrawingToolsByGroup(group.id).length).toBeGreaterThan(0);
    }
  });

  it('marks only currently implemented geometry tools as available', () => {
    const available = DRAWING_TOOL_CATALOG.filter(
      (tool) => tool.availability === 'implemented',
    ).map((tool) => tool.id);

    expect(available).toEqual([
      'trend-line',
      'ray',
      'horizontal-line',
      'vertical-line',
      'rectangle',
    ]);
  });

  it('exposes the anchor model needed by multi-point tools', () => {
    expect(getDrawingToolById('fib-extension')?.anchors).toBe(3);
    expect(getDrawingToolById('pitchfork')?.anchors).toBe(3);
    expect(getDrawingToolById('xabcd-pattern')?.anchors).toBe(5);
    expect(getDrawingToolById('elliott-triangle')?.anchors).toBe(5);
  });

  it('returns no tool for unknown identifiers', () => {
    expect(getDrawingToolById('unknown-tool')).toBeUndefined();
  });
});
