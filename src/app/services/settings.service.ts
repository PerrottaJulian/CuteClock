import { Injectable, signal, effect } from '@angular/core';

export type TimeFormat = '24h' | '12h';

export interface UserPreferences {
  timeFormat: TimeFormat;
  showSeconds: boolean;
  isZenMode: boolean;
  isAudioEnabled: boolean;
  isRealSunEnabled: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  timeFormat: '24h',
  showSeconds: true,
  isZenMode: false,
  isAudioEnabled: false,
  isRealSunEnabled: false,
};

const STORAGE_KEY = 'cute_clock_preferences_v2';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  readonly timeFormat = signal<TimeFormat>(this.loadInitial().timeFormat);
  readonly showSeconds = signal<boolean>(this.loadInitial().showSeconds);
  readonly isZenMode = signal<boolean>(this.loadInitial().isZenMode);
  readonly isAudioEnabled = signal<boolean>(this.loadInitial().isAudioEnabled);
  readonly isRealSunEnabled = signal<boolean>(this.loadInitial().isRealSunEnabled);

  constructor() {
    // Sincronización reactiva automática con LocalStorage
    effect(() => {
      const prefs: UserPreferences = {
        timeFormat: this.timeFormat(),
        showSeconds: this.showSeconds(),
        isZenMode: this.isZenMode(),
        isAudioEnabled: this.isAudioEnabled(),
        isRealSunEnabled: this.isRealSunEnabled(),
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      } catch (e) {
        // Fallback silencioso en entornos restringidos
      }
    });
  }

  toggleTimeFormat(): void {
    this.timeFormat.update((fmt) => (fmt === '24h' ? '12h' : '24h'));
  }

  toggleSeconds(): void {
    this.showSeconds.update((s) => !s);
  }

  toggleZenMode(): void {
    this.isZenMode.update((z) => !z);
  }

  toggleAudio(): void {
    this.isAudioEnabled.update((a) => !a);
  }

  toggleRealSun(): void {
    this.isRealSunEnabled.update((rs) => !rs);
  }

  private loadInitial(): UserPreferences {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) };
      }
    } catch (e) {
      // Ignorar error de parsing
    }
    return DEFAULT_PREFERENCES;
  }
}
