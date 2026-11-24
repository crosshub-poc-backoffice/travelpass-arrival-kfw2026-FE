/** Web Audio 로 합성한 플랩 클릭. 외부 오디오 파일 불필요. 사용자 제스처 후 enable() 필요. */
export class FlapSound {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private last = 0;
  enabled = false;

  async enable() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      const len = Math.floor(this.ctx.sampleRate * 0.04);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.enabled = true;
  }

  disable() { this.enabled = false; }

  /** 여러 셀이 동시에 넘어가도 25ms 에 한 번만 울려서 '촤르륵' 질감이 나게 */
  tick() {
    if (!this.enabled || !this.ctx || !this.noise) return;
    const now = this.ctx.currentTime;
    if (now - this.last < 0.025) return;
    this.last = now;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.4;

    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800 + Math.random() * 1400;
    bp.Q.value = 1.2;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.5, now + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

    src.connect(bp).connect(g).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.05);
  }
}
