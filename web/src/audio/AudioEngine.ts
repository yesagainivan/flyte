export class AudioEngine {
    private ctx: AudioContext | null = null;
    private oscillator: OscillatorNode | null = null;
    private gainNode: GainNode | null = null;
    private isPlaying: boolean = false;

    constructor() {
        // We instantiate the context lazily to comply with browser autoplay policies
    }

    private init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
    }

    public play(hz: number) {
        this.init();
        if (!this.ctx) return;

        // Resume context if suspended (browser policy)
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        if (this.isPlaying) {
            this.update(hz);
            return;
        }

        // Create nodes
        this.oscillator = this.ctx.createOscillator();
        this.gainNode = this.ctx.createGain();

        // Configuration
        this.oscillator.type = 'sine'; // Smoother than square, richer than sine
        this.oscillator.frequency.setValueAtTime(hz, this.ctx.currentTime);

        // Connect graph
        this.oscillator.connect(this.gainNode);
        this.gainNode.connect(this.ctx.destination);

        // Fade in (Attack) to prevent click
        this.gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
        this.gainNode.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + 0.1);

        this.oscillator.start();
        this.isPlaying = true;
    }

    public update(hz: number) {
        if (!this.ctx || !this.oscillator || !this.isPlaying) return;

        // Smooth frequency transition
        const now = this.ctx.currentTime;
        this.oscillator.frequency.setTargetAtTime(hz, now, 0.05);
    }

    public stop() {
        if (!this.ctx || !this.gainNode || !this.oscillator || !this.isPlaying) return;

        // Fade out (Release) to prevent click
        const now = this.ctx.currentTime;
        // We cancel any scheduled events to ensure our release happens *now*
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.linearRampToValueAtTime(0, now + 0.1);

        // Stop and disconnect after fade out
        const osc = this.oscillator;
        const gain = this.gainNode;

        setTimeout(() => {
            osc.stop();
            osc.disconnect();
            gain.disconnect();
        }, 150); // Slightly longer than the 0.1s ramp

        this.oscillator = null;
        this.gainNode = null;
        this.isPlaying = false;
    }

    public destroy() {
        this.stop();
        if (this.ctx) {
            this.ctx.close();
            this.ctx = null;
        }
    }
}
