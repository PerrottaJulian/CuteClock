import { Injectable, signal, NgZone, inject } from '@angular/core';

export type TimeFormat = '24h' | '12h';
export type BackgroundMode = 'circadian' | 'custom';
export type ClockFont = 'Outfit' | 'Plus Jakarta Sans' | 'monospace' | 'system-ui';

export interface WallpaperProperty<T = unknown> {
  value: T;
}

export interface WallpaperUserProperties {
  timeformat?: WallpaperProperty<string>;
  showseconds?: WallpaperProperty<boolean | string>;
  showdate?: WallpaperProperty<boolean | string>;
  showphase?: WallpaperProperty<boolean | string>;
  showsolartrack?: WallpaperProperty<boolean | string>;
  showwcagbadge?: WallpaperProperty<boolean | string>;
  clockscale?: WallpaperProperty<number | string>;
  clockpositiony?: WallpaperProperty<number | string>;
  fontfamily?: WallpaperProperty<string>;
  backgroundmode?: WallpaperProperty<string>;
  custombgcolor?: WallpaperProperty<string>;
  customtextcolor?: WallpaperProperty<string>;
  autocontrast?: WallpaperProperty<boolean | string>;
  enableambientorbs?: WallpaperProperty<boolean | string>;
  glassblur?: WallpaperProperty<number | string>;
  enableaudio?: WallpaperProperty<boolean | string>;
  audiovolume?: WallpaperProperty<number | string>;
  enableparallax?: WallpaperProperty<boolean | string>;
  schemecolor?: WallpaperProperty<string>;
  [key: string]: WallpaperProperty<unknown> | undefined;
}

declare global {
  interface Window {
    wallpaperPropertyListener?: {
      applyUserProperties?: (properties: WallpaperUserProperties) => void;
      applyGeneralProperties?: (properties: Record<string, unknown>) => void;
      pauseAudio?: () => void;
      unpauseAudio?: () => void;
      setPaused?: (isPaused: boolean) => void;
    };
  }
}

/**
 * Convierte el formato de color de Wallpaper Engine ("r g b" normalizado [0, 1]) a CSS rgb().
 */
export function parseWallpaperEngineColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  const parts = trimmed.split(/\s+/).map(Number);
  if (parts.length >= 3 && !parts.some(isNaN)) {
    const r = Math.round(parts[0] * 255);
    const g = Math.round(parts[1] * 255);
    const b = Math.round(parts[2] * 255);
    return `rgb(${r}, ${g}, ${b})`;
  }
  return trimmed.startsWith('#') || trimmed.startsWith('rgb') ? trimmed : fallback;
}

@Injectable({
  providedIn: 'root',
})
export class WallpaperEngineService {
  private readonly ngZone = inject(NgZone);

  // --- SIGNALS REACTIVOS DE PROPIEDADES DE WALLPAPER ENGINE ---
  readonly timeFormat = signal<TimeFormat>('24h');
  readonly showSeconds = signal<boolean>(true);
  readonly showDate = signal<boolean>(true);
  readonly showPhase = signal<boolean>(true);
  readonly showSolarTrack = signal<boolean>(true);
  readonly showWcagBadge = signal<boolean>(false);
  readonly clockScale = signal<number>(1.0);
  readonly clockPositionY = signal<number>(0);
  readonly fontFamily = signal<string>('Outfit');
  readonly backgroundMode = signal<BackgroundMode>('circadian');
  readonly customBgColor = signal<string>('#1a1e29');
  readonly customTextColor = signal<string>('#FAF6EE');
  readonly autoContrast = signal<boolean>(true);
  readonly enableAmbientOrbs = signal<boolean>(true);
  readonly glassBlur = signal<number>(28);
  readonly enableAudio = signal<boolean>(false);
  readonly audioVolume = signal<number>(20);
  readonly enableParallax = signal<boolean>(false);

  // Estado de pausa de Wallpaper Engine (juegos maximizados, ahorro de energía, etc.)
  readonly isPaused = signal<boolean>(false);

  constructor() {
    this.initWallpaperEngineListener();
    this.initVisibilityListener();
    this.parseUrlQueryParams();
  }

  /**
   * Permite probar y previsualizar propiedades mediante parámetros URL (?timeformat=12h&showseconds=false)
   * ideal para pruebas en navegadores estándar fuera de Wallpaper Engine.
   */
  private parseUrlQueryParams(): void {
    if (typeof window === 'undefined' || !window.location.search) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const mockProps: WallpaperUserProperties = {};
      params.forEach((val, key) => {
        mockProps[key.toLowerCase()] = { value: val };
      });
      this.handleUserProperties(mockProps);
    } catch (_) {}
  }

  /**
   * Registra el callback window.wallpaperPropertyListener requerido por Wallpaper Engine.
   */
  private initWallpaperEngineListener(): void {
    if (typeof window === 'undefined') return;

    // Preservar listeners previos si existiesen
    const existingListener = window.wallpaperPropertyListener || {};

    window.wallpaperPropertyListener = {
      ...existingListener,

      applyUserProperties: (properties: WallpaperUserProperties) => {
        this.ngZone.run(() => {
          this.handleUserProperties(properties);
        });
      },

      setPaused: (isPaused: boolean) => {
        this.ngZone.run(() => {
          this.isPaused.set(isPaused);
        });
      },
    };
  }

  /**
   * Procesa las propiedades recibidas en tiempo real desde la barra lateral de Wallpaper Engine.
   */
  private handleUserProperties(props: WallpaperUserProperties): void {
    if (props.timeformat) {
      const val = String(props.timeformat.value);
      this.timeFormat.set(val === '12h' ? '12h' : '24h');
    }

    if (props.showseconds !== undefined) {
      this.showSeconds.set(this.parseBoolean(props.showseconds.value, true));
    }

    if (props.showdate !== undefined) {
      this.showDate.set(this.parseBoolean(props.showdate.value, true));
    }

    if (props.showphase !== undefined) {
      this.showPhase.set(this.parseBoolean(props.showphase.value, true));
    }

    if (props.showsolartrack !== undefined) {
      this.showSolarTrack.set(this.parseBoolean(props.showsolartrack.value, true));
    }

    if (props.showwcagbadge !== undefined) {
      this.showWcagBadge.set(this.parseBoolean(props.showwcagbadge.value, false));
    }

    if (props.clockscale !== undefined) {
      const scaleNum = typeof props.clockscale.value === 'number'
        ? props.clockscale.value
        : parseFloat(String(props.clockscale.value));
      if (!isNaN(scaleNum)) {
        this.clockScale.set(scaleNum / 100);
      }
    }

    if (props.clockpositiony !== undefined) {
      const posNum = typeof props.clockpositiony.value === 'number'
        ? props.clockpositiony.value
        : parseFloat(String(props.clockpositiony.value));
      if (!isNaN(posNum)) {
        this.clockPositionY.set(posNum);
      }
    }

    if (props.fontfamily) {
      this.fontFamily.set(String(props.fontfamily.value));
    }

    if (props.backgroundmode) {
      const mode = String(props.backgroundmode.value);
      this.backgroundMode.set(mode === 'custom' ? 'custom' : 'circadian');
    }

    if (props.custombgcolor) {
      this.customBgColor.set(
        parseWallpaperEngineColor(String(props.custombgcolor.value), '#1a1e29')
      );
    }

    if (props.customtextcolor) {
      this.customTextColor.set(
        parseWallpaperEngineColor(String(props.customtextcolor.value), '#FAF6EE')
      );
    }

    if (props.autocontrast !== undefined) {
      this.autoContrast.set(this.parseBoolean(props.autocontrast.value, true));
    }

    if (props.enableambientorbs !== undefined) {
      this.enableAmbientOrbs.set(this.parseBoolean(props.enableambientorbs.value, true));
    }

    if (props.glassblur !== undefined) {
      const blurNum = typeof props.glassblur.value === 'number'
        ? props.glassblur.value
        : parseFloat(String(props.glassblur.value));
      if (!isNaN(blurNum)) {
        this.glassBlur.set(Math.max(0, Math.min(60, blurNum)));
      }
    }

    if (props.enableaudio !== undefined) {
      this.enableAudio.set(this.parseBoolean(props.enableaudio.value, false));
    }

    if (props.audiovolume !== undefined) {
      const volNum = typeof props.audiovolume.value === 'number'
        ? props.audiovolume.value
        : parseFloat(String(props.audiovolume.value));
      if (!isNaN(volNum)) {
        this.audioVolume.set(Math.max(0, Math.min(100, volNum)));
      }
    }

    if (props.enableparallax !== undefined) {
      this.enableParallax.set(this.parseBoolean(props.enableparallax.value, false));
    }
  }

  /**
   * Suspende o reanuda si la ventana pierde visibilidad en el navegador.
   */
  private initVisibilityListener(): void {
    if (typeof document === 'undefined') return;

    document.addEventListener('visibilitychange', () => {
      this.ngZone.run(() => {
        if (document.hidden) {
          this.isPaused.set(true);
        } else {
          this.isPaused.set(false);
        }
      });
    });
  }

  private parseBoolean(val: unknown, fallback: boolean): boolean {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return val.toLowerCase() === 'true';
    return fallback;
  }
}
