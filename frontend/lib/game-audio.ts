import type { GameAction } from './game-types';

export class GameAudio {
  private readonly master: GainNode;
  private readonly compressor: DynamicsCompressorNode;
  private readonly samples = new Map<string, AudioBuffer>();
  private readonly voices = new Set<AudioBufferSourceNode>();
  private loaded: Promise<void> | null = null;
  private lastVolley = -1;

  constructor(readonly context: AudioContext) {
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -7;
    this.compressor.knee.value = 8;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = .001;
    this.compressor.release.value = .12;
    this.master = context.createGain();
    this.master.gain.value = .9;
    this.compressor.connect(this.master);
    this.master.connect(context.destination);
  }

  async load(): Promise<void> {
    if (!this.loaded) {
      this.loaded = Promise.all(['rifle-shot', 'heavy-shot'].map(async name => {
        const response = await fetch('/audio/' + name + '.wav');
        if (!response.ok) throw new Error('Không tải được tiếng súng. Hãy thử bật âm thanh lại.');
        const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
        this.samples.set(name, buffer);
      })).then(() => undefined).catch(error => {
        this.loaded = null;
        throw error;
      });
    }
    return this.loaded;
  }

  playAction(action: GameAction): void {
    if (this.context.state !== 'running') return;
    if (['DAMAGE', 'DESTROY', 'MEGA_DESTROY', 'BLOCKED'].includes(action.type)) {
      // Live can deliver hundreds of hearts together; at most three audible rounds per volley.
      if (this.context.currentTime - this.lastVolley < .06) return;
      this.lastVolley = this.context.currentTime;
      const heavy = action.type === 'MEGA_DESTROY';
      const count = Math.min(3, Math.max(1, action.shotCount ?? 1));
      for (let i = 0; i < count; i++) this.gunshot(heavy, i * .075);
      if (action.type === 'BLOCKED') this.tone(1300, .16, .10, 'triangle');
      return;
    }
    if (action.type === 'SHIELD') { this.tone(1000, 0, .2, 'triangle'); this.tone(1500, .07); }
    else if (action.type === 'UPGRADE') [440, 660, 880].forEach((f, i) => this.tone(f, i * .1, .22));
    else if (action.type === 'JOIN') { this.tone(660); this.tone(880, .08); }
  }

  private gunshot(heavy: boolean, delay: number): void {
    const buffer = this.samples.get(heavy ? 'heavy-shot' : 'rifle-shot');
    if (!buffer || this.voices.size >= 6) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = heavy ? .92 : 1;
    gain.gain.value = heavy ? 1.05 : 1.15;
    source.connect(gain); gain.connect(this.compressor);
    this.voices.add(source);
    source.onended = () => { source.disconnect(); gain.disconnect(); this.voices.delete(source); };
    source.start(this.context.currentTime + delay);
  }

  tone(frequency: number, delay = 0, length = .12, wave: OscillatorType = 'sine'): void {
    if (this.context.state !== 'running') return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const start = this.context.currentTime + delay;
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(50, frequency * .55), start + length);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(.28, start + .008);
    gain.gain.exponentialRampToValueAtTime(.001, start + length);
    oscillator.connect(gain); gain.connect(this.compressor);
    oscillator.start(start); oscillator.stop(start + length + .02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  victory(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * .16, .35));
  }

  stopVoices(): void {
    for (const voice of this.voices) {
      voice.stop();
      voice.disconnect();
    }
    this.voices.clear();
  }

  async destroy(): Promise<void> {
    this.stopVoices();
    this.master.disconnect();
    this.compressor.disconnect();
    if (this.context.state !== 'closed') await this.context.close();
  }
}
