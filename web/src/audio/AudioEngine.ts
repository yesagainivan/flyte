export class AudioEngine {
    private ctx: AudioContext | null = null;
    private oscillators: OscillatorNode[] = [];
    private gainNode: GainNode | null = null;
    private isPlaying: boolean = false;
    private masterVolume: number = 0.5;
    private readonly HEADROOM_SCALE = 0.3; // Scaling to avoid clipping with multiple voices

    constructor() {
        // We instantiate the context lazily to comply with browser autoplay policies
    }

    public setVolume(val: number) {
        this.masterVolume = Math.max(0, Math.min(1, val));
        if (this.ctx && this.gainNode && this.isPlaying) {
            const now = this.ctx.currentTime;
            const targetGain = this.masterVolume * this.HEADROOM_SCALE;
            this.gainNode.gain.setTargetAtTime(targetGain, now, 0.05);
        }
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

        // Create Master Gain
        this.gainNode = this.ctx.createGain();
        this.gainNode.connect(this.ctx.destination);

        // Fade in (Attack)
        this.gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
        const targetGain = this.masterVolume * this.HEADROOM_SCALE;
        this.gainNode.gain.linearRampToValueAtTime(targetGain, this.ctx.currentTime + 0.1);

        // Voice Configuration: [Detune, Pan]
        // 1. Center (Fundamental) -> Center
        // 2. Left (-3 cents) -> Pan Left
        // 3. Right (+3 cents) -> Pan Right
        const voices = [
            { detune: 0, pan: 0 },
            { detune: -3, pan: -0.5 },
            { detune: 3, pan: 0.5 }
        ];

        this.oscillators = voices.map(voice => {
            const osc = this.ctx!.createOscillator();
            const panner = this.ctx!.createStereoPanner();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(hz, this.ctx!.currentTime);
            osc.detune.setValueAtTime(voice.detune, this.ctx!.currentTime);

            panner.pan.setValueAtTime(voice.pan, this.ctx!.currentTime);

            // Route: Osc -> Panner -> Master Gain
            osc.connect(panner);
            panner.connect(this.gainNode!);

            osc.start();
            return osc;
        });

        this.isPlaying = true;
    }

    public update(hz: number) {
        if (!this.ctx || !this.oscillators.length || !this.isPlaying) return;

        // Smooth frequency transition for all oscillators
        const now = this.ctx.currentTime;
        this.oscillators.forEach(osc => {
            osc.frequency.setTargetAtTime(hz, now, 0.05);
        });
    }

    public stop() {
        if (!this.ctx || !this.gainNode || !this.oscillators.length || !this.isPlaying) return;

        // Fade out (Release)
        const now = this.ctx.currentTime;
        // We cancel any scheduled events to ensure our release happens *now*
        // Using cancelScheduledValues on the current time + buffer helps avoid pop
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.linearRampToValueAtTime(0, now + 0.1);

        // Stop and disconnect after fade out
        const oldOscs = [...this.oscillators];
        const oldGain = this.gainNode;

        setTimeout(() => {
            oldOscs.forEach(osc => {
                osc.stop();
                // Since we have intermediate panner nodes, we rely on GC or could track them to disconnect.
                // Simple disconnect of osc is sufficient to stop processing.
                osc.disconnect();
            });
            oldGain.disconnect();
        }, 150);

        this.oscillators = [];
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
