import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  effect,
  DestroyRef,
  inject,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SettingsService, TimeFormat } from './services/settings.service';
import { CircadianAudioService } from './services/circadian-audio.service';
import { SolarCalculatorService, SolarTimes } from './services/solar-calculator.service';

/**
 * Estructura de ancla horaria para el motor de iluminación natural biocéntrica.
 */
export interface TimeAnchor {
  name: string;
  hour: number;
  h: number;
  s: number;
  l: number;
  suggestedText: '#FAF6EE' | '#141312';
}

/**
 * Coordenadas HSL puras.
 */
export interface HslColor {
  h: number;
  s: number;
  l: number;
}

/**
 * 8 Anclas horarias distribuidas en ciclo circular de 24h.
 */
export const TIME_ANCHORS: TimeAnchor[] = [
  { name: 'Medianoche', hour: 2.0,   h: 240, s: 42, l: 12, suggestedText: '#FAF6EE' },
  { name: 'Madrugada',  hour: 5.0,   h: 252, s: 32, l: 22, suggestedText: '#FAF6EE' },
  { name: 'Amanecer',   hour: 7.0,   h: 28,  s: 72, l: 64, suggestedText: '#141312' },
  { name: 'Mañana',     hour: 9.5,   h: 206, s: 56, l: 64, suggestedText: '#141312' },
  { name: 'Mediodía',   hour: 12.5,  h: 198, s: 36, l: 78, suggestedText: '#141312' },
  { name: 'Tarde',      hour: 15.5,  h: 40,  s: 66, l: 62, suggestedText: '#141312' },
  { name: 'Atardecer',  hour: 18.25, h: 16,  s: 74, l: 56, suggestedText: '#141312' },
  { name: 'Noche',      hour: 21.75, h: 248, s: 40, l: 20, suggestedText: '#FAF6EE' },
];

export const COLOR_DARK_TEXT = '#141312';
export const COLOR_LIGHT_TEXT = '#FAF6EE';

/**
 * Distancia angular más corta en el círculo cromático [0, 360).
 */
export function shortestHueDiff(h1: number, h2: number): number {
  let diff = (h2 - h1) % 360;
  if (diff > 180) {
    diff -= 360;
  } else if (diff < -180) {
    diff += 360;
  }
  return diff;
}

/**
 * Interpolación lineal simple entre dos valores según factor en [0, 1].
 */
export function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

/**
 * Localiza las dos anclas que encierran el tiempo decimal continuo (cruce de medianoche 21.75 a 2.0).
 */
export function findEnclosingAnchors(
  decimalTime: number,
  anchors: TimeAnchor[] = TIME_ANCHORS
): {
  prev: TimeAnchor;
  next: TimeAnchor;
  factor: number;
} {
  const t = ((decimalTime % 24) + 24) % 24;
  const n = anchors.length;

  for (let i = 0; i < n; i++) {
    const prev = anchors[i];
    const next = anchors[(i + 1) % n];

    if (prev.hour < next.hour) {
      if (t >= prev.hour && t < next.hour) {
        const factor = (t - prev.hour) / (next.hour - prev.hour);
        return { prev, next, factor };
      }
    } else {
      if (t >= prev.hour || t < next.hour) {
        const span = (24 - prev.hour) + next.hour;
        const elapsed = t >= prev.hour ? (t - prev.hour) : ((24 - prev.hour) + t);
        const factor = elapsed / span;
        return { prev, next, factor };
      }
    }
  }

  return { prev: anchors[0], next: anchors[1], factor: 0 };
}

/**
 * Convierte valores HSL a RGB normalizado [0, 1].
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let rPrime = 0, gPrime = 0, bPrime = 0;
  if (h >= 0 && h < 60) {
    rPrime = c; gPrime = x; bPrime = 0;
  } else if (h >= 60 && h < 120) {
    rPrime = x; gPrime = c; bPrime = 0;
  } else if (h >= 120 && h < 180) {
    rPrime = 0; gPrime = c; bPrime = x;
  } else if (h >= 180 && h < 240) {
    rPrime = 0; gPrime = x; bPrime = c;
  } else if (h >= 240 && h < 300) {
    rPrime = x; gPrime = 0; bPrime = c;
  } else {
    rPrime = c; gPrime = 0; bPrime = x;
  }

  return [rPrime + m, gPrime + m, bPrime + m];
}

/**
 * Luminancia relativa según estándar WCAG 2.1.
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function calculateContrastRatio(lum1: number, lum2: number): number {
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

const LUM_DARK = getRelativeLuminance(20 / 255, 19 / 255, 18 / 255);
const LUM_LIGHT = getRelativeLuminance(250 / 255, 246 / 255, 238 / 255);

export function evaluateWcagContrast(hsl: HslColor): {
  textColor: string;
  contrastRatio: number;
  wcagLevel: 'AA' | 'AAA';
} {
  const [r, g, b] = hslToRgb(hsl.h, hsl.s, hsl.l);
  const bgLuminance = getRelativeLuminance(r, g, b);

  const ratioWithLight = calculateContrastRatio(LUM_LIGHT, bgLuminance);
  const ratioWithDark = calculateContrastRatio(LUM_DARK, bgLuminance);

  const useLightText = hsl.l < 45 || ratioWithLight >= ratioWithDark;

  const textColor = useLightText ? COLOR_LIGHT_TEXT : COLOR_DARK_TEXT;
  const contrastRatio = useLightText ? ratioWithLight : ratioWithDark;
  const wcagLevel = contrastRatio >= 7.0 ? 'AAA' : 'AA';

  return { textColor, contrastRatio, wcagLevel };
}

@Component({
  selector: 'app-clock',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './clock.component.html',
  styleUrls: ['./clock.component.css']
})
export class ClockComponent implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  readonly settings = inject(SettingsService);
  readonly audio = inject(CircadianAudioService);
  readonly solarCalc = inject(SolarCalculatorService);

  private timerId: ReturnType<typeof setInterval> | null = null;

  // --- SIGNALS REACTIVOS PRINCIPALES ---
  readonly currentTime = signal<Date>(new Date());
  readonly isSimulationActive = signal<boolean>(false);
  readonly simulatedDecimalHour = signal<number>(12.0);
  readonly showControls = signal<boolean>(false);
  readonly showSettingsMenu = signal<boolean>(false);
  readonly geoSolarTimes = signal<SolarTimes | null>(null);

  /**
   * Cálculo continuo del tiempo en formato decimal
   */
  readonly decimalTime = computed<number>(() => {
    if (this.isSimulationActive()) {
      return this.simulatedDecimalHour();
    }
    const d = this.currentTime();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  });

  /**
   * Formateo adaptable del reloj digital: 24h o 12h con o sin segundos
   */
  readonly timeFormattedData = computed<{
    mainTime: string;
    period: string;
  }>(() => {
    let hours: number;
    let minutes: number;
    let seconds: number;

    if (this.isSimulationActive()) {
      const dec = this.simulatedDecimalHour();
      hours = Math.floor(dec);
      const remM = (dec - hours) * 60;
      minutes = Math.floor(remM);
      seconds = Math.floor((remM - minutes) * 60);
    } else {
      const d = this.currentTime();
      hours = d.getHours();
      minutes = d.getMinutes();
      seconds = d.getSeconds();
    }

    let period = '';
    const is12h = this.settings.timeFormat() === '12h';

    if (is12h) {
      period = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
    }

    const hStr = this.padZero(hours);
    const mStr = this.padZero(minutes);
    const sStr = this.padZero(seconds);

    const mainTime = this.settings.showSeconds()
      ? `${hStr}:${mStr}:${sStr}`
      : `${hStr}:${mStr}`;

    return { mainTime, period };
  });

  readonly timeString = computed(() => this.timeFormattedData().mainTime);
  readonly timePeriod = computed(() => this.timeFormattedData().period);

  readonly dateString = computed<string>(() => {
    const d = this.currentTime();
    return d.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  });

  /**
   * Porcentaje de recorrido solar dentro del ciclo de 24 horas [0, 100%]
   */
  readonly solarProgressPercent = computed<number>(() => {
    return Math.round((this.decimalTime() / 24) * 1000) / 10;
  });

  /**
   * Motor de interpolación circular HSL
   */
  readonly colorState = computed(() => {
    const t = this.decimalTime();
    const { prev, next, factor } = findEnclosingAnchors(t);

    const hDiff = shortestHueDiff(prev.h, next.h);
    const h = Math.round((((prev.h + hDiff * factor) % 360) + 360) % 360);

    // Modelo biocéntrico de atenuación solar (Rayleigh Scattering) para saltos angulares amplios (> 110°):
    // Suaviza la transición hacia un tono crema/marfil etéreo, eliminando fucsias neón y verdes indeseados
    const absDiff = Math.abs(hDiff);
    let sInterp = lerp(prev.s, next.s, factor);
    let lInterp = lerp(prev.l, next.l, factor);

    if (absDiff > 110) {
      const dipWeight = Math.min(1.0, (absDiff - 110) / 60) * 0.62;
      const dip = Math.sin(factor * Math.PI) * dipWeight;
      sInterp = sInterp * (1 - dip);

      // Sutil realce lumínico diurno para mantener la radiancia natural de la atmósfera
      const solarLuminanceBoost = Math.sin(factor * Math.PI) * (dipWeight * 4);
      lInterp = Math.min(88, lInterp + solarLuminanceBoost);
    }

    const s = Math.round(sInterp * 10) / 10;
    const l = Math.round(lInterp * 10) / 10;

    const hsl: HslColor = { h, s, l };
    const contrastInfo = evaluateWcagContrast(hsl);

    const phaseName = factor < 0.5 ? prev.name : next.name;

    // Colores armónicos biocéntricos para los orbes de luz ambiental flotantes
    const orb1Hue = (h + 38) % 360;
    const orb1Sat = Math.min(95, Math.max(45, s + 15));
    const orb1Lum = Math.min(80, Math.max(25, l + 6));

    const orb2Hue = (h - 32 + 360) % 360;
    const orb2Sat = Math.min(90, Math.max(40, s + 10));
    const orb2Lum = Math.min(75, Math.max(20, l - 6));

    const orb3Hue = (h + 160) % 360;
    const orb3Sat = Math.min(75, Math.max(30, s));
    const orb3Lum = Math.min(70, Math.max(18, l));

    return {
      hsl,
      backgroundColor: `hsl(${h}, ${s}%, ${l}%)`,
      textColor: contrastInfo.textColor,
      contrastRatio: contrastInfo.contrastRatio.toFixed(2),
      wcagLevel: contrastInfo.wcagLevel,
      phaseName,
      prevAnchor: prev.name,
      nextAnchor: next.name,
      factorPercent: Math.round(factor * 100),
      orb1Color: `hsl(${orb1Hue}, ${orb1Sat}%, ${orb1Lum}%)`,
      orb2Color: `hsl(${orb2Hue}, ${orb2Sat}%, ${orb2Lum}%)`,
      orb3Color: `hsl(${orb3Hue}, ${orb3Sat}%, ${orb3Lum}%)`,
    };
  });

  readonly backgroundColor = computed(() => this.colorState().backgroundColor);
  readonly textColor = computed(() => this.colorState().textColor);
  readonly phaseName = computed(() => this.colorState().phaseName);
  readonly contrastRatio = computed(() => this.colorState().contrastRatio);
  readonly wcagLevel = computed(() => this.colorState().wcagLevel);
  readonly isLightMode = computed(() => this.textColor() === COLOR_DARK_TEXT);
  readonly orb1Color = computed(() => this.colorState().orb1Color);
  readonly orb2Color = computed(() => this.colorState().orb2Color);
  readonly orb3Color = computed(() => this.colorState().orb3Color);
  readonly anchors = TIME_ANCHORS;

  getAnchorId(name: string): string {
    const map: Record<string, string> = {
      'Medianoche': 'chipMedianoche',
      'Madrugada': 'chipMadrugada',
      'Amanecer': 'chipAmanecer',
      'Mañana': 'chipManana',
      'Mediodía': 'chipMediodia',
      'Tarde': 'chipTarde',
      'Atardecer': 'chipAtardecer',
      'Noche': 'chipNoche',
    };
    return map[name] || `chip${name}`;
  }

  readonly phaseIcon = computed<string>(() => {
    switch (this.phaseName()) {
      case 'Medianoche': return '🌙';
      case 'Madrugada': return '🌌';
      case 'Amanecer': return '🌅';
      case 'Mañana': return '🌤️';
      case 'Mediodía': return '☀️';
      case 'Tarde': return '🌞';
      case 'Atardecer': return '🌇';
      case 'Noche': return '🌠';
      default: return '✨';
    }
  });

  constructor() {
    // Sincronización reactiva inmediata del paisaje sonoro ante cualquier cambio de fase horaria
    effect(() => {
      const phase = this.phaseName();
      if (this.audio.active) {
        this.audio.updatePhaseAcoustics(phase);
      }
    });
  }

  ngOnInit(): void {
    this.startClock();
  }

  ngOnDestroy(): void {
    this.stopClock();
    this.audio.stop();
  }

  /**
   * Atajos de teclado para productividad y confort visual:
   * - Z: Modo Zen
   * - F: Pantalla Completa
   * - M: Silenciar / Activar Audio Ambiental
   * - Esc: Salir de Modo Zen / Controles
   */
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    const target = event.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      return;
    }

    if (key === 'z') {
      this.toggleZenMode();
    } else if (key === 'f') {
      this.toggleFullscreen();
    } else if (key === 'm') {
      this.toggleAudio();
    } else if (key === 'escape') {
      if (this.settings.isZenMode()) {
        this.settings.isZenMode.set(false);
      }
      this.showControls.set(false);
      this.showSettingsMenu.set(false);
    }
  }

  private startClock(): void {
    this.timerId = setInterval(() => {
      this.currentTime.set(new Date());
      // Actualización acústica suave si el audio está activo
      if (this.audio.active) {
        this.audio.updatePhaseAcoustics(this.phaseName());
      }
    }, 1000);

    this.destroyRef.onDestroy(() => {
      this.stopClock();
    });
  }

  private stopClock(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  toggleZenMode(): void {
    this.settings.toggleZenMode();
  }

  toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  async toggleAudio(): Promise<void> {
    if (this.audio.active) {
      this.audio.stop();
      this.settings.isAudioEnabled.set(false);
    } else {
      await this.audio.start(this.phaseName());
      this.settings.isAudioEnabled.set(true);
    }
  }

  toggleSettings(): void {
    this.showSettingsMenu.update(v => !v);
  }

  toggleControls(): void {
    this.showControls.update(v => !v);
  }

  onSimulationChange(event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value);
    this.simulatedDecimalHour.set(value);
    this.isSimulationActive.set(true);
    if (this.audio.active) {
      this.audio.updatePhaseAcoustics(this.phaseName());
    }
  }

  toggleLiveMode(): void {
    this.isSimulationActive.set(false);
    this.currentTime.set(new Date());
    if (this.audio.active) {
      this.audio.updatePhaseAcoustics(this.phaseName());
    }
  }

  selectAnchor(hour: number): void {
    this.simulatedDecimalHour.set(hour);
    this.isSimulationActive.set(true);
    if (this.audio.active) {
      this.audio.updatePhaseAcoustics(this.phaseName());
    }
  }

  requestGeolocation(): void {
    if (this.settings.isRealSunEnabled()) {
      // Si ya está activo, desactivar y volver al ciclo biocéntrico estándar
      this.settings.isRealSunEnabled.set(false);
      this.geoSolarTimes.set(null);
      return;
    }

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const times = this.solarCalc.calculateSolarTimes(
            new Date(),
            pos.coords.latitude,
            pos.coords.longitude
          );
          this.geoSolarTimes.set(times);
          this.settings.isRealSunEnabled.set(true);
        },
        () => {
          // Fallback a coordenadas de referencia si el usuario no otorga permisos
          const times = this.solarCalc.calculateSolarTimes(new Date(), -34.6037, -58.3816);
          this.geoSolarTimes.set(times);
          this.settings.isRealSunEnabled.set(true);
        }
      );
    }
  }

  private padZero(num: number): string {
    return num < 10 ? `0${num}` : `${num}`;
  }
}
