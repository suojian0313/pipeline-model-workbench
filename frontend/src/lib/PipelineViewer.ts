import {
  ArcType, Axis, BoundingSphere, Cartesian2, Cartesian3, Cesium3DTileColorBlendMode, Cesium3DTileFeature, Cesium3DTileset,
  Color, DirectionalLight, HeadingPitchRange, Material, Matrix4, PolylineCollection,
  Transforms, Viewer,
} from 'cesium';
import type { Cesium3DTile, Cesium3DTileContent, Entity } from 'cesium';
import type { Bounds, ViewerMetrics } from '../types';
import { frameStatistics, styleForGeometry } from './modelState';

interface FeatureEntry { feature: Cesium3DTileFeature; id: string; original: Color; }
interface ContentEntry { entries: FeatureEntry[]; revision: number; }
interface Callbacks { select(id: string | null): void; ready(): void; metrics(metrics: ViewerMetrics): void; error(message: string): void; }

/** Cesium 对象保持在普通类中；Vue 只持有业务 ID 和统计值。 */
export class PipelineViewer {
  private readonly viewer: Viewer;
  private readonly modelMatrix = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(0, 0, 0));
  private readonly contents = new Map<Cesium3DTileContent, ContentEntry>();
  private readonly visibleContents = new Set<Cesium3DTileContent>();
  private selectionOutline: Entity | null = null;
  private tileset: Cesium3DTileset | null = null;
  private tileListeners: (() => void)[] = [];
  private selected = new Set<string>();
  private completed = new Set<string>();
  private progressVisible = true;
  private revision = 0;
  private epoch = 0;
  private loadVersion = 0;
  private disposed = false;
  private target = new Cartesian3();
  private heading = Math.PI / 4;
  private pitch = -Math.PI / 5;
  private range = 80;
  private homeSphere: BoundingSphere | null = null;
  private lastFrame = 0;
  private activeUntil = 0;
  private frameTimes: number[] = [];
  private firstVisible: number | null = null;
  private initialLoaded: number | null = null;
  private visibleThisFrame = 0;
  private timer: ReturnType<typeof setInterval>;
  private qualityTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver: ResizeObserver;
  private pointer: { id: number; x: number; y: number; startX: number; startY: number; button: number } | null = null;
  private cleanup: (() => void)[] = [];

  constructor(private readonly container: HTMLElement, private readonly callbacks: Callbacks) {
    this.viewer = new Viewer(container, {
      animation: false, timeline: false, baseLayer: false, baseLayerPicker: false,
      globe: false, geocoder: false, homeButton: false, sceneModePicker: false,
      navigationHelpButton: false, fullscreenButton: false, infoBox: false,
      selectionIndicator: false, skyBox: false, skyAtmosphere: false,
      requestRenderMode: true, maximumRenderTimeChange: Infinity,
      contextOptions: { webgl: { alpha: false, antialias: true } },
    });
    const scene = this.viewer.scene;
    scene.backgroundColor = Color.fromCssColorString('#e8eef3');
    scene.highDynamicRange = false;
    scene.light = new DirectionalLight({ direction: new Cartesian3(-.7, -.5, -1), intensity: 1.5 });
    scene.screenSpaceCameraController.enableInputs = false;
    scene.postProcessStages.fxaa.enabled = false;
    this.viewer.resolutionScale = Math.min(1, 1.5 / window.devicePixelRatio);
    this.viewer.clock.shouldAnimate = false;
    this.cleanup.push(scene.preRender.addEventListener(() => { this.visibleThisFrame = 0; this.visibleContents.clear(); }));
    this.cleanup.push(scene.postRender.addEventListener(() => this.onRendered()));
    this.cleanup.push(scene.renderError.addEventListener((_scene, error: Error) => callbacks.error(`三维渲染失败：${error.message}`)));
    this.bindInputs();
    this.resizeObserver = new ResizeObserver(() => { this.viewer.resize(); scene.requestRender(); });
    this.resizeObserver.observe(container);
    this.timer = setInterval(() => this.emitMetrics(), 500);
    this.addGrid();
  }

  private addGrid() {
    const grid = this.viewer.scene.primitives.add(new PolylineCollection({ modelMatrix: this.modelMatrix })) as PolylineCollection;
    const material = Material.fromType('Color', { color: Color.fromCssColorString('#bacbd8').withAlpha(.5) });
    for (let x = -15; x <= 30; x += 5) {
      grid.add({ positions: [new Cartesian3(x, 80, -.7), new Cartesian3(x, 135, -.7)], width: 1, material });
    }
    for (let y = 80; y <= 135; y += 5) {
      grid.add({ positions: [new Cartesian3(-15, y, -.7), new Cartesian3(30, y, -.7)], width: 1, material });
    }
    // 网格只作为工程尺度参照，不参与构件索引。
  }

  async load(apiBase: string) {
    const version = ++this.loadVersion;
    this.tileListeners.forEach(remove => remove());
    this.tileListeners = [];
    if (this.tileset) this.viewer.scene.primitives.remove(this.tileset);
    this.tileset = null;
    this.contents.clear();
    this.visibleContents.clear();
    this.visibleThisFrame = 0;
    this.epoch = version === 1 ? 0 : performance.now();
    this.firstVisible = null;
    this.initialLoaded = null;
    this.frameTimes = [];
    this.emitMetrics();
    try {
      const tileset = await Cesium3DTileset.fromUrl(`${apiBase}/models/tileset.json`, {
        maximumScreenSpaceError: 16,
        cacheBytes: 128 * 1024 * 1024,
        maximumCacheOverflowBytes: 64 * 1024 * 1024,
        modelMatrix: this.modelMatrix,
        // 原 tileset 的 gltfUpAxis 是小写 z；引擎轴枚举区分大小写，显式指定以保持模型与 bounds 一致。
        modelUpAxis: Axis.Z,
      });
      if (this.disposed || version !== this.loadVersion) { tileset.destroy(); return; }
      // 默认 HIGHLIGHT 将状态色乘以原材质色；REPLACE 只替换显式业务状态色，白色默认 feature 保留原材质。
      tileset.colorBlendMode = Cesium3DTileColorBlendMode.REPLACE;
      this.tileset = tileset;
      this.tileListeners.push(tileset.tileVisible.addEventListener(tile => this.onTileVisible(tile)));
      this.tileListeners.push(tileset.tileUnload.addEventListener(tile => this.removeContent(tile.content)));
      this.tileListeners.push(tileset.initialTilesLoaded.addEventListener(() => {
        this.initialLoaded = performance.now() - this.epoch;
        this.frameTimes = []; this.lastFrame = 0; this.activeUntil = 0;
        this.emitMetrics();
      }));
      this.tileListeners.push(tileset.tileFailed.addEventListener(failure => {
        callbacksGuard(this.disposed, () => this.callbacks.error(`模型瓦片加载失败：${failure.message}`));
      }));
      this.viewer.scene.primitives.add(tileset);
      this.homeSphere = BoundingSphere.clone(tileset.boundingSphere);
      this.home();
    } catch (error) {
      if (!this.disposed && version === this.loadVersion) {
        this.callbacks.error(`模型加载失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  setStyles(selected: Set<string>, completed: Set<string>, enabled: boolean) {
    if (sameSet(this.selected, selected) && sameSet(this.completed, completed) && this.progressVisible === enabled) return;
    this.selected = selected;
    this.completed = completed;
    this.progressVisible = enabled;
    this.revision++;
    for (const entry of this.contents.values()) this.applyStyles(entry);
    this.viewer.scene.requestRender();
    this.emitMetrics();
  }

  setSelectionBounds(bounds: Bounds | null) {
    if (this.selectionOutline) this.viewer.entities.remove(this.selectionOutline);
    this.selectionOutline = null;
    if (bounds) {
      const [x0, y0, z0] = bounds.min, [x1, y1, z1] = bounds.max;
      const corners = [[x0,y0,z0], [x1,y0,z0], [x1,y1,z0], [x0,y1,z0],
        [x0,y0,z1], [x1,y0,z1], [x1,y1,z1], [x0,y1,z1]];
      const path = [0,1,2,3,0,4,5,6,7,4,5,1,2,6,7,3];
      const positions = path.map(index => Matrix4.multiplyByPoint(this.modelMatrix,
        Cartesian3.fromArray(corners[index]!), new Cartesian3()));
      const color = Color.fromCssColorString('#ffc44c');
      // 附件部分焊口嵌在法兰内。透过遮挡显示真实 bounds 轮廓，说明其位置而非伪造几何。
      this.selectionOutline = this.viewer.entities.add({ polyline: {
        positions, width: 2, arcType: ArcType.NONE, material: color, depthFailMaterial: color,
      } });
    }
    this.viewer.scene.requestRender();
  }

  private onTileVisible(tile: Cesium3DTile) {
    const visit = (content: Cesium3DTileContent) => {
      if (content.innerContents?.length) { content.innerContents.forEach(visit); return; }
      this.visibleThisFrame += content.featuresLength;
      this.visibleContents.add(content);
      let entry = this.contents.get(content);
      if (!entry) {
        const entries: FeatureEntry[] = [];
        for (let i = 0; i < content.featuresLength; i++) {
          const feature: unknown = content.getFeature(i);
          if (!(feature instanceof Cesium3DTileFeature)) continue;
          const id: unknown = feature.getProperty('componentId');
          if (typeof id === 'string') entries.push({ feature, id, original: Color.clone(feature.color) });
        }
        entry = { entries, revision: -1 };
        this.contents.set(content, entry);
      }
      if (entry.revision !== this.revision) this.applyStyles(entry);
    };
    visit(tile.content);
  }

  private applyStyles(content: ContentEntry) {
    const selectedColor = Color.fromCssColorString('#ffc44c');
    const completeColor = Color.fromCssColorString('#19cf97');
    for (const entry of content.entries) {
      const style = styleForGeometry(entry.id, this.selected, this.completed, this.progressVisible);
      entry.feature.color = style === 'selected' ? selectedColor : style === 'completed' ? completeColor : entry.original;
    }
    content.revision = this.revision;
  }

  private removeContent(content: Cesium3DTileContent) {
    content.innerContents?.forEach(child => this.removeContent(child));
    this.contents.delete(content);
    this.visibleContents.delete(content);
  }

  private onRendered() {
    const now = performance.now();
    if (this.visibleThisFrame > 0 && this.firstVisible === null) {
      this.firstVisible = now - this.epoch;
      this.callbacks.ready();
      this.emitMetrics();
    }
    // 只采样交互引发的实际渲染帧，按需渲染的静止时间不算掉帧。
    if (this.initialLoaded !== null && (now < this.activeUntil || this.pointer !== null) && this.lastFrame > 0) {
      const elapsed = now - this.lastFrame;
      if (elapsed > 0) {
        this.frameTimes.push(elapsed);
        if (this.frameTimes.length > 180) this.frameTimes.shift();
      }
    }
    this.lastFrame = now;
  }

  private emitMetrics() {
    if (this.disposed) return;
    let selectedVisibleFeatures = 0;
    let progressVisibleFeatures = 0;
    // 只计最后实际渲染帧选中的瓦片；缓存中的旧 LOD 仍保留样式，但不计入可见指标。
    for (const visible of this.visibleContents) for (const entry of this.contents.get(visible)?.entries ?? []) {
      if (this.selected.has(entry.id)) selectedVisibleFeatures++;
      else if (this.progressVisible && this.completed.has(entry.id)) progressVisibleFeatures++;
    }
    const stats = frameStatistics(this.frameTimes);
    this.callbacks.metrics({ fps: stats?.fps ?? null, frameMsP95: stats?.p95 ?? null,
      firstVisibleMs: this.firstVisible, initialLoadedMs: this.initialLoaded,
      visibleFeatures: this.visibleThisFrame, selectedVisibleFeatures, progressVisibleFeatures });
  }

  private applyCamera() {
    if (performance.now() > this.activeUntil && this.pointer === null) {
      this.frameTimes = []; this.lastFrame = 0;
    }
    // 附件精细层约106万三角面，交互优先选择约16万面的粗层；具体层级仍随距离变化，停止后恢复细节。
    if (this.tileset && this.initialLoaded !== null) {
      this.tileset.maximumScreenSpaceError = 512;
      this.restoreQualityLater();
    }
    this.viewer.camera.lookAt(this.target, new HeadingPitchRange(this.heading, this.pitch, this.range));
    this.activeUntil = performance.now() + 350;
    this.viewer.scene.requestRender();
  }

  private restoreQualityLater() {
    if (this.qualityTimer) clearTimeout(this.qualityTimer);
    this.qualityTimer = setTimeout(() => {
      if (this.disposed || this.pointer || !this.tileset) return;
      this.activeUntil = 0;
      this.tileset.maximumScreenSpaceError = 16;
      this.viewer.scene.requestRender();
    }, 450);
  }

  home() {
    if (!this.homeSphere) return;
    this.target = Cartesian3.clone(this.homeSphere.center);
    this.range = Math.max(1, this.homeSphere.radius * 2.2);
    this.heading = Math.PI / 4;
    this.pitch = -Math.PI / 5;
    this.applyCamera();
  }

  focusBounds(bounds: Bounds) {
    const min = Cartesian3.fromArray(bounds.min);
    const max = Cartesian3.fromArray(bounds.max);
    const center = Cartesian3.midpoint(min, max, new Cartesian3());
    this.target = Matrix4.multiplyByPoint(this.modelMatrix, center, new Cartesian3());
    this.range = Math.max(.5, Cartesian3.distance(min, max) * 1.8);
    this.applyCamera();
  }

  zoom(factor: number) { this.range = Math.max(.15, Math.min(1500, this.range * factor)); this.applyCamera(); }
  orbit(delta: number) { this.heading += delta; this.applyCamera(); }
  pan(dx: number, dy: number) {
    const scale = this.range / Math.max(this.container.clientHeight, 1);
    const right = Cartesian3.multiplyByScalar(this.viewer.camera.rightWC, -dx * scale, new Cartesian3());
    const up = Cartesian3.multiplyByScalar(this.viewer.camera.upWC, dy * scale, new Cartesian3());
    this.target = Cartesian3.add(this.target, Cartesian3.add(right, up, new Cartesian3()), new Cartesian3());
    this.applyCamera();
  }
  setView(view: 'iso' | 'top' | 'front') {
    this.heading = view === 'iso' ? Math.PI / 4 : 0;
    this.pitch = view === 'top' ? -Math.PI / 2 + .001 : view === 'front' ? -.03 : -Math.PI / 5;
    this.applyCamera();
  }

  private bindInputs() {
    const canvas = this.viewer.canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', '动力站三维模型，左键旋转，右键平移，滚轮缩放');
    canvas.style.touchAction = 'none';
    const down = (event: PointerEvent) => {
      canvas.focus();
      canvas.setPointerCapture(event.pointerId);
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY,
        startX: event.clientX, startY: event.clientY, button: event.button };
      this.frameTimes = []; this.lastFrame = 0;
    };
    const move = (event: PointerEvent) => {
      const pointer = this.pointer;
      if (!pointer || event.pointerId !== pointer.id) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      pointer.x = event.clientX; pointer.y = event.clientY;
      if (pointer.button === 0 && !event.shiftKey) {
        this.heading -= dx * .006;
        this.pitch = Math.max(-Math.PI / 2 + .01, Math.min(-.015, this.pitch + dy * .006));
        this.applyCamera();
      } else this.pan(dx, dy);
    };
    const up = (event: PointerEvent) => {
      const pointer = this.pointer;
      this.pointer = null;
      this.restoreQualityLater();
      if (!pointer || event.pointerId !== pointer.id) return;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (pointer.button === 0 && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 4) {
        const rect = canvas.getBoundingClientRect();
        const picked: unknown = this.viewer.scene.pick(new Cartesian2(event.clientX - rect.left, event.clientY - rect.top));
        const id: unknown = picked instanceof Cesium3DTileFeature ? picked.getProperty('componentId') : null;
        this.callbacks.select(typeof id === 'string' ? id : null);
      }
    };
    const wheel = (event: WheelEvent) => { event.preventDefault(); this.zoom(Math.exp(Math.max(-200, Math.min(200, event.deltaY)) * .002)); };
    const context = (event: Event) => event.preventDefault();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Home') this.home();
      else if (event.key === '+' || event.key === '=') this.zoom(.85);
      else if (event.key === '-') this.zoom(1.18);
      else if (event.key === 'ArrowLeft') this.orbit(.08);
      else if (event.key === 'ArrowRight') this.orbit(-.08);
      else return;
      event.preventDefault();
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', context);
    canvas.addEventListener('keydown', key);
    this.cleanup.push(() => {
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('contextmenu', context);
      canvas.removeEventListener('keydown', key);
    });
  }

  destroy() {
    this.disposed = true;
    this.loadVersion++;
    clearInterval(this.timer);
    if (this.qualityTimer) clearTimeout(this.qualityTimer);
    this.resizeObserver.disconnect();
    this.tileListeners.forEach(remove => remove());
    this.cleanup.forEach(remove => remove());
    this.contents.clear();
    this.visibleContents.clear();
    this.viewer.destroy();
  }
}

function callbacksGuard(disposed: boolean, action: () => void) { if (!disposed) action(); }

function sameSet(first: Set<string>, second: Set<string>): boolean {
  return first.size === second.size && [...first].every(id => second.has(id));
}
