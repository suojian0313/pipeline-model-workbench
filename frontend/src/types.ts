export interface Bounds { min: number[]; max: number[]; }
export interface Component {
  id: string; name: string; line_no: string; kind: string;
  properties: Record<string, string>;
  geometry_ids: string[]; bounds: Bounds | null;
  weld_no: string; material_code: string; material_1: string; material_2: string;
}
export interface RawTreeNode { id: string; name: string; componentId?: string; children: RawTreeNode[]; }
export interface NavNode { id: string; label: string; searchText: string; componentId?: string; children: NavNode[]; }
export interface WeldRecord {
  line_no: string; weld_no: string; material_1: string; material_2: string;
  welded_on: string | null; updated_at: string; is_model: boolean;
}
export interface Progress {
  total_welds: number; completed_welds: number; percentage: number;
  completed_component_ids: string[]; completed_geometry_ids: string[];
  missing_links: { line_no: string; weld_no: string; side: number }[];
}
export interface Summary {
  business_components: number; geometry_components: number; model_welds: number;
  tree_nodes: number; tile_files: number; source_weld_rows: number;
}
export interface Page<T> { items: T[]; total: number; offset: number; limit: number; }
export interface ViewerMetrics {
  fps: number | null; frameMsP95: number | null;
  firstVisibleMs: number | null; initialLoadedMs: number | null;
  visibleFeatures: number; selectedVisibleFeatures: number; progressVisibleFeatures: number;
}
export interface ViewportHandle {
  home(): void; focusBounds(bounds: Bounds): void; zoom(factor: number): void;
  setView(view: 'iso' | 'top' | 'front'): void; orbit(delta: number): void; pan(dx: number, dy: number): void;
}
