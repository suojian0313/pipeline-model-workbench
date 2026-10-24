import { describe, expect, it } from 'vitest';
import { buildNavigation, collectComponentIds, filterNavigation, findNodePath, frameStatistics, mergeComponentBounds, styleForGeometry } from './modelState';
import type { Component, RawTreeNode } from '../types';

const components: Component[] = [
  { id: 'w1', name: 'Weld', kind: 'Weld', line_no: 'L1', properties: {}, geometry_ids: ['gw1', 'gw2'], bounds: { min: [1, 2, 3], max: [2, 3, 4] }, weld_no: '1', material_code: '', material_1: 'P1', material_2: 'P2' },
  { id: 'p1', name: 'Pipe', kind: 'Pipe', line_no: 'L1', properties: {}, geometry_ids: ['gp'], bounds: { min: [-1, 4, 6], max: [3, 5, 8] }, weld_no: '', material_code: 'P1', material_1: '', material_2: '' },
];
const raw: RawTreeNode[] = [{ id: 'root', name: 'L1', children: [
  { id: 'w1', name: 'Weld', children: [{ id: 'leaf1', name: 'Geometry', componentId: 'gw1', children: [] }] },
  { id: 'p1', name: 'Pipe', children: [{ id: 'leaf2', name: 'Geometry', componentId: 'gp', children: [] }] },
] }];

describe('business selection and rendering state', () => {
  it('collapses geometry leaves into business objects while retaining parent structure', () => {
    const tree = buildNavigation(raw, components);
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].componentId).toBe('w1');
    expect(tree[0].children[0].children).toEqual([]);
    expect(collectComponentIds(tree[0])).toEqual(['w1', 'p1']);
  });
  it('combines bounds for group selection and tolerates missing records', () => {
    expect(mergeComponentBounds(['w1', 'p1', 'absent'], components)).toEqual({ min: [-1, 2, 3], max: [3, 5, 8] });
    expect(mergeComponentBounds([], components)).toBeNull();
  });
  it('finds ancestors for reverse tree selection and retains them in search results', () => {
    const tree = buildNavigation(raw, components);
    expect(findNodePath(tree, 'p1')).toEqual(['root', 'p1']);
    expect(filterNavigation(tree, 'P1')[0].children.some(node => node.id === 'p1')).toBe(true);
    expect(filterNavigation(tree, 'nonexistent')).toEqual([]);
  });
  it('replays selection over progress and restores progress when selection clears', () => {
    const selected = new Set(['g1']);
    const completed = new Set(['g1', 'g2']);
    expect(styleForGeometry('g1', selected, completed, true)).toBe('selected');
    selected.clear();
    expect(styleForGeometry('g1', selected, completed, true)).toBe('completed');
    expect(styleForGeometry('g1', selected, completed, false)).toBe('original');
    expect(styleForGeometry('g3', selected, completed, true)).toBe('original');
  });
  it('measures real rendered frame durations without counting idle samples', () => {
    expect(frameStatistics([10, 20, 30, 40])).toEqual({ fps: 40, p95: 40 });
    expect(frameStatistics([0, -1])).toBeNull();
  });
});
