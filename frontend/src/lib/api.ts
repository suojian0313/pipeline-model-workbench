import type { Component, Page, Progress, RawTreeNode, Summary, WeldRecord } from '../types';

type Guard<T> = (value: unknown) => value is T;
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const hasStrings = (value: Record<string, unknown>, keys: string[]): boolean => keys.every(key => typeof value[key] === 'string');
const isComponent: Guard<Component> = (value): value is Component => object(value) && hasStrings(value, ['id', 'name', 'line_no', 'kind', 'weld_no', 'material_code', 'material_1', 'material_2']) && object(value.properties) && Object.values(value.properties).every(item => typeof item === 'string') && strings(value.geometry_ids) && (value.bounds === null || (object(value.bounds) && Array.isArray(value.bounds.min) && value.bounds.min.length === 3 && value.bounds.min.every(numeric) && Array.isArray(value.bounds.max) && value.bounds.max.length === 3 && value.bounds.max.every(numeric)));
const isWeld: Guard<WeldRecord> = (value): value is WeldRecord => object(value) && hasStrings(value, ['line_no', 'weld_no', 'material_1', 'material_2', 'updated_at']) && (value.welded_on === null || typeof value.welded_on === 'string') && typeof value.is_model === 'boolean';
const isProgress: Guard<Progress> = (value): value is Progress => object(value) && ['total_welds', 'completed_welds', 'percentage'].every(key => numeric(value[key])) && strings(value.completed_component_ids) && strings(value.completed_geometry_ids) && Array.isArray(value.missing_links) && value.missing_links.every(item => object(item) && hasStrings(item, ['line_no', 'weld_no']) && numeric(item.side));
const isSummary: Guard<Summary> = (value): value is Summary => object(value) && ['business_components', 'geometry_components', 'model_welds', 'tree_nodes', 'tile_files', 'source_weld_rows'].every(key => numeric(value[key]));
const isTreeNode: Guard<RawTreeNode> = (value): value is RawTreeNode => object(value) && hasStrings(value, ['id', 'name']) && (value.componentId === undefined || typeof value.componentId === 'string') && Array.isArray(value.children) && value.children.every(isTreeNode);

function backendError(payload: unknown, status: number): string {
  if (object(payload)) {
    if (typeof payload.error === 'string') return payload.error;
    if (typeof payload.detail === 'string') return payload.detail;
    if (Array.isArray(payload.detail)) {
      const messages = payload.detail.filter(object).map(item => {
        const location = Array.isArray(item.loc) ? item.loc.filter(part => part !== 'body').map(String).join('.') : '';
        return typeof item.msg === 'string' ? `${location ? `${location}：` : ''}${item.msg}` : '';
      }).filter(Boolean);
      if (messages.length) return messages.join('；');
    }
  }
  return `服务请求失败（HTTP ${status}）`;
}

export class ApiClient {
  constructor(private readonly base: string, private readonly signal?: AbortSignal) {}
  private async request<T>(path: string, guard: Guard<T>, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.base}${path}`, { ...init, signal: this.signal, headers: { Accept: 'application/json', ...init?.headers } });
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new Error(response.ok ? '服务返回的数据格式错误' : `服务请求失败（HTTP ${response.status}）`); }
    if (!response.ok) throw new Error(backendError(payload, response.status));
    if (!guard(payload)) throw new Error('服务返回的数据格式错误，请刷新重试');
    return payload;
  }
  private async allPages<T>(path: string, guard: Guard<T>): Promise<T[]> {
    const items: T[] = [];
    let offset = 0;
    for (;;) {
      const isPage: Guard<Page<T>> = (value): value is Page<T> => object(value) && Array.isArray(value.items) && value.items.every(guard) && numeric(value.total) && numeric(value.offset) && numeric(value.limit);
      const page = await this.request(`${path}?offset=${offset}&limit=1000`, isPage);
      if (page.offset !== offset || page.total < 0 || (page.items.length === 0 && offset < page.total)) throw new Error('分页数据不完整，请刷新重试');
      items.push(...page.items);
      offset += page.items.length;
      if (offset >= page.total) return items;
    }
  }
  summary(): Promise<Summary> { return this.request('/api/model/summary', isSummary); }
  async tree(): Promise<RawTreeNode[]> {
    const result = await this.request('/api/model/tree', (value): value is { roots: RawTreeNode[] } => object(value) && Array.isArray(value.roots) && value.roots.every(isTreeNode));
    return result.roots;
  }
  components(): Promise<Component[]> { return this.allPages('/api/components', isComponent); }
  welds(): Promise<WeldRecord[]> { return this.allPages('/api/welds', isWeld); }
  progress(): Promise<Progress> { return this.request('/api/progress', isProgress); }
  saveWeld(line: string, number: string, date: string | null): Promise<WeldRecord> {
    return this.request(`/api/welds/${encodeURIComponent(line)}/${encodeURIComponent(number)}`, isWeld, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ welded_on: date }) });
  }
}
