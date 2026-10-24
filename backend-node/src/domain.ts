export interface Component {
  id: string;
  name: string;
  line_no: string;
  kind: string;
  properties: Record<string, unknown>;
  geometry_ids: string[];
  bounds: { min: number[]; max: number[] } | null;
  [key: string]: unknown;
}
export interface ModelWeld {
  line_no: string;
  weld_no: string;
  component_id: string | null;
  side_1_ids: string[];
  side_2_ids: string[];
  missing_sides: number[];
}
export interface ModelData {
  source: { asset_dir: string };
  summary: Record<string, unknown>;
  tree: unknown[];
  components: Component[];
  geometry_to_component: Record<string, string>;
  node_to_component: Record<string, string>;
  model_welds: ModelWeld[];
}
export function normalizeId(value: string): string {
  const normalized = value.replace(/[\s\p{White_Space}]+/gu, '');
  return normalized === '-' ? '' : normalized;
}
// 不用本地时区解析日期；逐项验证，避免 JS 将 2 月 30 日自动滚动到 3 月。
export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
export function weldKey(line: string, weld: string): string {
  return JSON.stringify([normalizeId(line), normalizeId(weld)]);
}
