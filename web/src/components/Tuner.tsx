import { useEffect, useRef } from 'react';

interface TunerProps {
    cents: number; // Deviation from nearest note (-50 to +50)
    noteName: string;
}

export function Tuner({ cents, noteName }: TunerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width;
        const h = canvas.height;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Background arc
        ctx.beginPath();
        ctx.arc(w / 2, h, w / 2 - 10, Math.PI, 0);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 10;
        ctx.stroke();

        // Center tick (0 cents)
        ctx.beginPath();
        ctx.moveTo(w / 2, h - (w / 2 - 20));
        ctx.lineTo(w / 2, h - (w / 2));
        ctx.strokeStyle = '#4caf50';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Needle
        // Map cents -50..+50 to angle Math.PI..0
        const clampedCents = Math.max(-50, Math.min(50, cents));
        const angle = Math.PI - ((clampedCents + 50) / 100) * Math.PI;

        ctx.save();
        ctx.translate(w / 2, h);
        ctx.rotate(angle); // 0 is exactly right (3 o'clock). We want UP to be 0 cents.
        // Actually standard canvas: 0 is right. PI is left.
        // We want 0 cents (middle) to be -PI/2 (up).
        // Let's stick to simple trig:
        // -50 cents = 180 deg (PI)
        // 0 cents = 90 deg (PI/2)
        // +50 cents = 0 deg (0)
        // Wait, let's map left-to-right.

        // Let's calculate tip position
        const needleLen = w / 2 - 20;
        // Wait, simple visualization:
        // Up is good. Left is flat. Right is sharp.
        // Up = -90 deg.
        // -50 cents = -135 deg (-90 - 45)
        // +50 cents = -45 deg (-90 + 45)

        const rad = (-90 + clampedCents * 0.9) * (Math.PI / 180);

        ctx.restore();

        // Draw needle
        ctx.beginPath();
        ctx.moveTo(w / 2, h);
        ctx.lineTo(w / 2 + Math.cos(rad) * needleLen, h + Math.sin(rad) * needleLen);
        ctx.strokeStyle = Math.abs(cents) < 10 ? '#4caf50' : '#f44336';
        ctx.lineWidth = 5;
        ctx.stroke();

        // Text
        ctx.fillStyle = '#aaa';
        ctx.font = '20px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(`${cents > 0 ? '+' : ''}${Math.round(cents)} ct`, w / 2, h - 20);

    }, [cents]);

    return (
        <div className="tuner">
            <div className="note-large">{noteName}</div>
            <canvas ref={canvasRef} width={300} height={160} />
        </div>
    );
}
