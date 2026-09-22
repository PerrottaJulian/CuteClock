import { Injectable } from '@angular/core';

export type DayPhase =
  | 'Medianoche'
  | 'Madrugada'
  | 'Amanecer'
  | 'Mañana'
  | 'Mediodía'
  | 'Tarde'
  | 'Atardecer'
  | 'Noche';

/**
 * Motor acústico generativo circadiano con Web Audio API pura.
 * Genera paisajes sonoros orgánicos diferenciados y relajantes para cada fase del día:
 * - Medianoche / Noche: Olas oceánicas nocturnas en vaivén suave (LFO) con zumbido binaural cálido.
 * - Madrugada: Cuenco tibetano y campana etérea en silencio azul.
 * - Amanecer: Campanas de viento zen (pentatónica) con brisa matutina.
 * - Mañana: Arpegios cristalinos suaves de despertar armónico.
 * - Mediodía: Arroyuelo de agua corriente y claridad cenital para foco.
 * - Tarde: Acordes dorados cálidos y resonancia zen de bambú.
 * - Atardecer: Crepúsculo con grillos nocturnos suaves y brasa templada.
 */
@Injectable({
  providedIn: 'root',
})
export class CircadianAudioService {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private currentPhaseGain: GainNode | null = null;
  private activeIntervals: number[] = [];
  private activeNodes: { stop?: () => void; disconnect: () => void }[] = [];
  private currentPhase: string | null = null;
  private isPlaying = false;
  private volume = 0.2;

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.setValueAtTime(0.001, this.audioCtx.currentTime);
      this.masterGain.connect(this.audioCtx.destination);
    }
    return this.audioCtx;
  }

  /**
   * Ajusta el volumen maestro en tiempo real (0..100).
   */
  setVolume(volPercent: number): void {
    const clamped = Math.max(0, Math.min(100, volPercent));
    // Escalar a un rango confortable no estridente [0, 0.40]
    this.volume = (clamped / 100) * 0.40;

    if (this.audioCtx && this.masterGain && this.isPlaying) {
      const now = this.audioCtx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(this.volume, now + 0.2);
    }
  }

  /**
   * Inicia la reproducción del paisaje sonoro según la fase actual.
   */
  async start(phaseName: string): Promise<void> {
    const ctx = this.ensureAudioContext();

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (_) {}
    }

    this.isPlaying = true;
    this.switchPhaseSoundscape(phaseName, true);

    // Entrada suave (Fade in) de 1.5s adaptada al volumen configurado
    const now = ctx.currentTime;
    const targetVolume = Math.max(0.01, this.volume);
    this.masterGain!.gain.cancelScheduledValues(now);
    this.masterGain!.gain.setValueAtTime(this.masterGain!.gain.value, now);
    this.masterGain!.gain.linearRampToValueAtTime(targetVolume, now + 1.5);
  }

  /**
   * Pausa inmediata de bajo consumo para Wallpaper Engine.
   */
  pause(): void {
    if (!this.audioCtx || !this.masterGain || !this.isPlaying) return;
    const now = this.audioCtx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.1);
    if (this.audioCtx.state === 'running') {
      this.audioCtx.suspend().catch(() => {});
    }
  }

  /**
   * Reanudación tras pausa de Wallpaper Engine.
   */
  async resumeAudio(phaseName: string): Promise<void> {
    if (!this.isPlaying) return;
    const ctx = this.ensureAudioContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (_) {}
    }
    const now = ctx.currentTime;
    this.masterGain!.gain.cancelScheduledValues(now);
    this.masterGain!.gain.setValueAtTime(this.masterGain!.gain.value, now);
    this.masterGain!.gain.linearRampToValueAtTime(Math.max(0.01, this.volume), now + 1.0);
    this.updatePhaseAcoustics(phaseName);
  }

  /**
   * Detiene la reproducción con desvanecimiento gradual.
   */
  stop(): void {
    if (!this.audioCtx || !this.masterGain || !this.isPlaying) return;

    const now = this.audioCtx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 1.0);

    setTimeout(() => {
      this.clearCurrentSoundscape();
      this.isPlaying = false;
      this.currentPhase = null;
    }, 1100);
  }

  /**
   * Actualiza el paisaje sonoro inmediatamente al cambiar la fase (ej: al mover el slider o anclas).
   */
  updatePhaseAcoustics(phaseName: string): void {
    if (!this.isPlaying || !this.audioCtx) return;

    if (this.currentPhase !== phaseName) {
      this.switchPhaseSoundscape(phaseName, false);
    }
  }

  /**
   * Transición inmediata con cross-fade entre paisajes sonoros.
   */
  private switchPhaseSoundscape(newPhase: string, isInitial: boolean): void {
    const ctx = this.audioCtx!;
    const now = ctx.currentTime;
    this.currentPhase = newPhase;

    // Si ya había un nodo de fase reproduciéndose, hacer fade out rápido
    const oldPhaseGain = this.currentPhaseGain;
    if (oldPhaseGain) {
      oldPhaseGain.gain.cancelScheduledValues(now);
      oldPhaseGain.gain.setValueAtTime(oldPhaseGain.gain.value, now);
      oldPhaseGain.gain.linearRampToValueAtTime(0.0001, now + (isInitial ? 0.2 : 0.6));
      setTimeout(() => {
        try {
          oldPhaseGain.disconnect();
        } catch (_) {}
      }, 700);
    }

    // Limpiar temporizadores de notas previas
    this.clearScheduledEvents();

    // Crear nuevo nodo de ganancia para la nueva fase
    const newPhaseGain = ctx.createGain();
    newPhaseGain.gain.setValueAtTime(0.001, now);
    newPhaseGain.gain.linearRampToValueAtTime(1.0, now + (isInitial ? 1.0 : 0.8));
    newPhaseGain.connect(this.masterGain!);
    this.currentPhaseGain = newPhaseGain;

    // Instanciar el generador acústico específico
    switch (newPhase) {
      case 'Medianoche':
      case 'Noche':
        this.buildOceanWavesSoundscape(ctx, newPhaseGain);
        break;

      case 'Madrugada':
        this.buildSingingBowlSoundscape(ctx, newPhaseGain);
        break;

      case 'Amanecer':
        this.buildWindChimesSoundscape(ctx, newPhaseGain);
        break;

      case 'Mañana':
        this.buildMorningHarpSoundscape(ctx, newPhaseGain);
        break;

      case 'Mediodía':
        this.buildStreamWaterSoundscape(ctx, newPhaseGain);
        break;

      case 'Tarde':
        this.buildWarmBambooSoundscape(ctx, newPhaseGain);
        break;

      case 'Atardecer':
        this.buildDuskCricketsSoundscape(ctx, newPhaseGain);
        break;

      default:
        this.buildOceanWavesSoundscape(ctx, newPhaseGain);
        break;
    }
  }

  // =========================================================================
  // 1. NOCHE / MEDIANOCHE: Olas oceánicas lentas y relajantes
  // =========================================================================
  private buildOceanWavesSoundscape(ctx: AudioContext, destination: GainNode): void {
    const waveGain = ctx.createGain();
    waveGain.gain.setValueAtTime(0.3, ctx.currentTime);

    // Ruido rosa con filtro paso bajo dinámico
    const noise = this.createPinkNoiseNode(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(180, ctx.currentTime);
    filter.Q.setValueAtTime(1.5, ctx.currentTime);

    // LFO que simula el movimiento cadencioso de las olas (cada 6.5s)
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.15, ctx.currentTime); // ~6.6s período

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(160, ctx.currentTime); // modula 180Hz +/- 160Hz (20Hz a 340Hz)

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    // Resonancia ultra profunda (theta 65Hz)
    const deepOsc = ctx.createOscillator();
    deepOsc.type = 'sine';
    deepOsc.frequency.setValueAtTime(65.4, ctx.currentTime); // C2

    const deepGain = ctx.createGain();
    deepGain.gain.setValueAtTime(0.12, ctx.currentTime);
    deepOsc.connect(deepGain);
    deepGain.connect(waveGain);

    noise.connect(filter);
    filter.connect(waveGain);
    waveGain.connect(destination);

    lfo.start();
    deepOsc.start();
    noise.start();

    this.activeNodes.push(
      { stop: () => lfo.stop(), disconnect: () => lfo.disconnect() },
      { stop: () => deepOsc.stop(), disconnect: () => deepOsc.disconnect() },
      { stop: () => noise.stop(), disconnect: () => noise.disconnect() }
    );
  }

  // =========================================================================
  // 2. MADRUGADA: Cuenco tibetano suave y silencio azul
  // =========================================================================
  private buildSingingBowlSoundscape(ctx: AudioContext, destination: GainNode): void {
    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.setValueAtTime(108, ctx.currentTime); // Armónico de 432Hz

    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0.08, ctx.currentTime);
    drone.connect(droneGain);
    droneGain.connect(destination);
    drone.start();
    this.activeNodes.push({ stop: () => drone.stop(), disconnect: () => drone.disconnect() });

    // Pings espaciados de cuenco meditativo (cada 4-7s)
    const bowlFrequencies = [216, 324, 432];
    const triggerBowl = () => {
      if (!this.isPlaying || this.currentPhase !== 'Madrugada') return;
      const freq = bowlFrequencies[Math.floor(Math.random() * bowlFrequencies.length)];
      this.playResonantBell(ctx, destination, freq, 4.5, 0.1);
    };

    triggerBowl();
    const interval = window.setInterval(triggerBowl, 5500);
    this.activeIntervals.push(interval);
  }

  // =========================================================================
  // 3. AMANECER: Campanas de viento zen y brisa matutina
  // =========================================================================
  private buildWindChimesSoundscape(ctx: AudioContext, destination: GainNode): void {
    // Brisa matutina muy suave
    const breeze = this.createPinkNoiseNode(ctx);
    const breezeFilter = ctx.createBiquadFilter();
    breezeFilter.type = 'bandpass';
    breezeFilter.frequency.setValueAtTime(450, ctx.currentTime);
    breezeFilter.Q.setValueAtTime(0.8, ctx.currentTime);

    const breezeGain = ctx.createGain();
    breezeGain.gain.setValueAtTime(0.06, ctx.currentTime);

    breeze.connect(breezeFilter);
    breezeFilter.connect(breezeGain);
    breezeGain.connect(destination);
    breeze.start();
    this.activeNodes.push({ stop: () => breeze.stop(), disconnect: () => breeze.disconnect() });

    // Escala pentatónica zen de campanas de viento (E4, G#4, B4, E5, F#5)
    const chimeNotes = [329.63, 415.3, 493.88, 659.25, 739.99];
    const triggerChime = () => {
      if (!this.isPlaying || this.currentPhase !== 'Amanecer') return;
      const note = chimeNotes[Math.floor(Math.random() * chimeNotes.length)];
      this.playResonantBell(ctx, destination, note, 2.8, 0.08);
    };

    triggerChime();
    const interval = window.setInterval(triggerChime, 3200);
    this.activeIntervals.push(interval);
  }

  // =========================================================================
  // 4. MAÑANA: Arpegios cristalinos suaves
  // =========================================================================
  private buildMorningHarpSoundscape(ctx: AudioContext, destination: GainNode): void {
    // Acorde mayor transparente (D major 9th: D4, F#4, A4, C#5, E5)
    const harpNotes = [293.66, 369.99, 440.0, 554.37, 659.25];
    let noteIdx = 0;

    const triggerHarpNote = () => {
      if (!this.isPlaying || this.currentPhase !== 'Mañana') return;
      const freq = harpNotes[noteIdx % harpNotes.length];
      noteIdx++;
      this.playResonantBell(ctx, destination, freq, 2.2, 0.07);
    };

    triggerHarpNote();
    const interval = window.setInterval(triggerHarpNote, 2400);
    this.activeIntervals.push(interval);
  }

  // =========================================================================
  // 5. MEDIODÍA: Arroyuelo de agua corriente para foco y energía
  // =========================================================================
  private buildStreamWaterSoundscape(ctx: AudioContext, destination: GainNode): void {
    const waterNoise = this.createPinkNoiseNode(ctx);

    // Doble filtro paso banda modulado que recrea el murmullo de agua cristalina
    const bp1 = ctx.createBiquadFilter();
    bp1.type = 'bandpass';
    bp1.frequency.setValueAtTime(650, ctx.currentTime);
    bp1.Q.setValueAtTime(2.5, ctx.currentTime);

    const bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.frequency.setValueAtTime(1200, ctx.currentTime);
    bp2.Q.setValueAtTime(3.0, ctx.currentTime);

    const waterGain = ctx.createGain();
    waterGain.gain.setValueAtTime(0.14, ctx.currentTime);

    waterNoise.connect(bp1);
    waterNoise.connect(bp2);
    bp1.connect(waterGain);
    bp2.connect(waterGain);
    waterGain.connect(destination);

    waterNoise.start();
    this.activeNodes.push({ stop: () => waterNoise.stop(), disconnect: () => waterNoise.disconnect() });
  }

  // =========================================================================
  // 6. TARDE: Jardín zen de bambú y armónicos cálidos
  // =========================================================================
  private buildWarmBambooSoundscape(ctx: AudioContext, destination: GainNode): void {
    // Acorde cálido en quinta (A3 + E4)
    const root = ctx.createOscillator();
    root.type = 'sine';
    root.frequency.setValueAtTime(220, ctx.currentTime);

    const fifth = ctx.createOscillator();
    fifth.type = 'sine';
    fifth.frequency.setValueAtTime(330, ctx.currentTime);

    const warmGain = ctx.createGain();
    warmGain.gain.setValueAtTime(0.06, ctx.currentTime);

    root.connect(warmGain);
    fifth.connect(warmGain);
    warmGain.connect(destination);

    root.start();
    fifth.start();

    this.activeNodes.push(
      { stop: () => root.stop(), disconnect: () => root.disconnect() },
      { stop: () => fifth.stop(), disconnect: () => fifth.disconnect() }
    );
  }

  // =========================================================================
  // 7. ATARDECER: Crepúsculo con grillos suaves y brasas templadas
  // =========================================================================
  private buildDuskCricketsSoundscape(ctx: AudioContext, destination: GainNode): void {
    // Armónico cálido base
    const sunsetOsc = ctx.createOscillator();
    sunsetOsc.type = 'sine';
    sunsetOsc.frequency.setValueAtTime(144, ctx.currentTime);

    const sunsetGain = ctx.createGain();
    sunsetGain.gain.setValueAtTime(0.08, ctx.currentTime);
    sunsetOsc.connect(sunsetGain);
    sunsetGain.connect(destination);
    sunsetOsc.start();
    this.activeNodes.push({ stop: () => sunsetOsc.stop(), disconnect: () => sunsetOsc.disconnect() });

    // Canto sutil y rítmico de grillos crepusculares (pulsos de 4.8kHz modulados)
    const triggerCricketChirp = () => {
      if (!this.isPlaying || this.currentPhase !== 'Atardecer') return;
      this.playCricketChirp(ctx, destination);
    };

    triggerCricketChirp();
    const interval = window.setInterval(triggerCricketChirp, 3800);
    this.activeIntervals.push(interval);
  }

  // =========================================================================
  // UTILIDADES ACÚSTICAS COMPARTIDAS
  // =========================================================================

  /**
   * Genera un pulso breve similar a grillos o crepúsculo.
   */
  private playCricketChirp(ctx: AudioContext, destination: GainNode): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(4600, ctx.currentTime);

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.02, now + 0.05);
    gain.gain.linearRampToValueAtTime(0.0001, now + 0.18);

    osc.connect(gain);
    gain.connect(destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  /**
   * Toca una campana/tono armónico con caída exponencial suave (sonido zen orgánico).
   */
  private playResonantBell(
    ctx: AudioContext,
    destination: GainNode,
    freq: number,
    decaySec: number,
    volume: number
  ): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    // Segundo armónico para dar calidez natural
    const overtone = ctx.createOscillator();
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(freq * 2, ctx.currentTime);

    const bellGain = ctx.createGain();
    const now = ctx.currentTime;
    bellGain.gain.setValueAtTime(0.0001, now);
    bellGain.gain.linearRampToValueAtTime(volume, now + 0.04);
    bellGain.gain.exponentialRampToValueAtTime(0.0001, now + decaySec);

    osc.connect(bellGain);
    overtone.connect(bellGain);
    bellGain.connect(destination);

    osc.start(now);
    overtone.start(now);
    osc.stop(now + decaySec + 0.1);
    overtone.stop(now + decaySec + 0.1);
  }

  /**
   * Crea un buffer de ruido rosa filtrado orgánicamente para emular naturaleza.
   */
  private createPinkNoiseNode(ctx: AudioContext): AudioBufferSourceNode {
    const bufferSize = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Algoritmo de Paul Kellet para ruido rosa musical
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  private clearScheduledEvents(): void {
    this.activeIntervals.forEach((id) => clearInterval(id));
    this.activeIntervals = [];

    this.activeNodes.forEach((n) => {
      try {
        if (n.stop) n.stop();
        n.disconnect();
      } catch (_) {}
    });
    this.activeNodes = [];
  }

  private clearCurrentSoundscape(): void {
    this.clearScheduledEvents();
    if (this.currentPhaseGain) {
      try {
        this.currentPhaseGain.disconnect();
      } catch (_) {}
      this.currentPhaseGain = null;
    }
  }

  get active(): boolean {
    return this.isPlaying;
  }
}
