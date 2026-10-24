import type { Bounds, Component, NavNode, RawTreeNode } from '../types';

export function buildNavigation(roots: RawTreeNode[], components: Component[]): NavNode[] {
  const byId = new Map(components.map(item => [item.id, item]));
  function visit(node: RawTreeNode): NavNode | null {
    const item = byId.get(node.id);
    if (item) {
      return { id: node.id, label: item.weld_no ? `焊口 ${item.weld_no}` : `${item.name} · ${item.material_code || item.id}`,
        searchText: `${item.name} ${item.kind} ${item.line_no} ${item.material_code} ${item.weld_no} ${item.id}`,
        componentId: item.id, children: [] };
    }
    const children = node.children.map(visit).filter((item): item is NavNode => item !== null);
    return children.length ? { id: node.id, label: node.name, searchText: node.name, children } : null;
  }
  return roots.map(visit).filter((item): item is NavNode => item !== null);
}
export function collectComponentIds(node: NavNode): string[] {
  return node.componentId ? [node.componentId] : node.children.flatMap(collectComponentIds);
}
export function mergeComponentBounds(ids: string[], components: Component[]): Bounds | null {
  const selected = new Set(ids);
  let result: Bounds | null = null;
  for (const item of components) {
    if (!selected.has(item.id) || !item.bounds) continue;
    if (!result) result = { min: [...item.bounds.min], max: [...item.bounds.max] };
    else {
      result.min = result.min.map((value, axis) => Math.min(value, item.bounds!.min[axis]));
      result.max = result.max.map((value, axis) => Math.max(value, item.bounds!.max[axis]));
    }
  }
  return result;
}
export function findNodePath(roots: NavNode[], id: string): string[] {
  for (const node of roots) {
    if (node.id === id) return [node.id];
    const child = findNodePath(node.children, id);
    if (child.length) return [node.id, ...child];
  }
  return [];
}
export function filterNavigation(roots: NavNode[], term: string): NavNode[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return roots;
  return roots.flatMap(node => {
    if (node.searchText.toLowerCase().includes(needle)) return [node];
    const children = filterNavigation(node.children, needle);
    return children.length ? [{ ...node, children }] : [];
  });
}
export function styleForGeometry(id: string, selected: Set<string>, completed: Set<string>, enabled: boolean): 'selected' | 'completed' | 'original' {
  return selected.has(id) ? 'selected' : enabled && completed.has(id) ? 'completed' : 'original';
}
export function frameStatistics(frames: number[]): { fps: number; p95: number } | null {
  const valid = frames.filter(value => Number.isFinite(value) && value > 0);
  if (!valid.length) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  return { fps: 1000 * valid.length / valid.reduce((sum, value) => sum + value, 0),
    p95: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] };
}
