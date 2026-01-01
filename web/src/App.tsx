import { useEffect, useState } from 'react';
import init, { FluteEngine } from 'flyte_core';
import { Tuner } from './components/Tuner';
import './App.css';

interface HoleData {
  id: number;
  position: number; // cm
  radius: number;   // cm
  open: boolean;
}

const TUBE_LENGTH = 60.0; // cm example (flute is ~60-70cm)
const BORE_RADIUS = 0.95; // cm (19mm dia)
const WALL_THICKNESS = 0.4; // Updated from 0.04 to 0.4cm (4mm is realistic for wood, 0.4mm for metal)
const PX_PER_CM = 10;

function App() {
  const [engine, setEngine] = useState<FluteEngine | null>(null);
  const [pitch, setPitch] = useState<number>(0);
  // Default holes roughly for a D major scale whistle
  const [holes, setHoles] = useState<HoleData[]>([
    { id: 1, position: 25.0, radius: 0.35, open: true },
    { id: 2, position: 28.0, radius: 0.35, open: true },
    { id: 3, position: 32.0, radius: 0.35, open: true },
    { id: 4, position: 36.0, radius: 0.35, open: true },
    { id: 5, position: 40.0, radius: 0.4, open: true },
    { id: 6, position: 45.0, radius: 0.4, open: true },
  ]);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  useEffect(() => {
    init().then(() => {
      const eng = new FluteEngine(TUBE_LENGTH, BORE_RADIUS, WALL_THICKNESS);
      setEngine(eng);
    });
  }, []);

  useEffect(() => {
    if (!engine) return;

    // Convert our friendly HoleData to the partial struct expected by set_holes
    // Note: We need to match the Rust struct field names exactly if using serde?
    // Actually, in Rust `Hole` has `position`, `radius`, `open`.
    const rustHoles = holes.map(h => ({
      position: h.position,
      radius: h.radius,
      open: h.open
    }));

    engine.set_holes(rustHoles);
    // Use previous pitch as guess, or default if 0
    const newPitch = engine.calculate_pitch(pitch);
    // Safety check against garbage
    if (newPitch > 20 && newPitch < 5000) {
      setPitch(newPitch);
    }
  }, [holes, engine]);

  const handlePointerDown = (id: number, e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingId(id);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingId === null) return;

    const svgRect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!svgRect) return;

    // Calculate new position in cm
    // x coordinate is relative to the SVG container
    const x = e.clientX - svgRect.left;
    let newPos = x / PX_PER_CM;

    // Clamp to tube length
    newPos = Math.max(1.0, Math.min(TUBE_LENGTH - 1.0, newPos));

    setHoles(prev => prev.map(h =>
      h.id === draggingId ? { ...h, position: newPos } : h
    ));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setDraggingId(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const toggleHole = (id: number) => {
    if (draggingId !== null) return; // Don't toggle if we were dragging
    setHoles(prev => prev.map(h =>
      h.id === id ? { ...h, open: !h.open } : h
    ));
  };

  // Tuning calc
  const { noteName, cents } = getNoteInfo(pitch);

  return (
    <div className="app-container">
      <header>
        <h1>Flyte <span className="version">Pro</span></h1>
        <p className="subtitle">Acoustic Design Studio</p>
      </header>

      <div className="workspace">
        <div className="physics-panel">
          <Tuner cents={cents} noteName={noteName} />
          <div className="hz-readout">{pitch.toFixed(1)} Hz</div>
        </div>

        <div className="flute-container">
          <svg
            width={TUBE_LENGTH * PX_PER_CM + 100}
            height={200}
            className="flute-svg"
            onPointerMove={draggingId !== null ? handlePointerMove : undefined}
            onPointerUp={draggingId !== null ? handlePointerUp : undefined}
          >
            {/* Main Tube Body */}
            <defs>
              <linearGradient id="woodGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#5d4037" />
                <stop offset="50%" stopColor="#8d6e63" />
                <stop offset="100%" stopColor="#4e342e" />
              </linearGradient>
            </defs>
            <rect
              x={0}
              y={80}
              width={TUBE_LENGTH * PX_PER_CM}
              height={40}
              fill="url(#woodGradient)"
              stroke="#3e2723"
              strokeWidth={2}
              rx={5}
            />

            {/* Embouchure */}
            <circle cx={2 * PX_PER_CM} cy={100} r={5} fill="#1a1a1a" stroke="#000" strokeWidth={1} />

            {/* Tone Holes */}
            {holes.map(hole => (
              <g key={hole.id} transform={`translate(${hole.position * PX_PER_CM}, 100)`}>
                {/* Hole Rim */}
                <circle
                  r={hole.radius * PX_PER_CM * 2 + 2}
                  fill="#5d4037"
                  opacity={0.5}
                />
                {/* Hole Opening */}
                <circle
                  r={hole.radius * PX_PER_CM * 2}
                  fill={hole.open ? "#222" : "#a1887f"}
                  stroke={hole.open ? "#000" : "#5d4037"}
                  strokeWidth={2}
                  cursor="ew-resize"
                  onPointerDown={(e) => handlePointerDown(hole.id, e)}
                  onClick={() => toggleHole(hole.id)}
                />
                <line y1={12} y2={40} stroke="rgba(255,255,255,0.2)" strokeDasharray="2 2" />
                <text y={55} textAnchor="middle" fill="#ccc" fontSize="10" fontFamily="monospace">
                  {hole.position.toFixed(1)}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      <div className="controls-panel">
        <h3>Design Controls</h3>
        <p>Tube Length: {TUBE_LENGTH}cm | Bore: {BORE_RADIUS * 20}mm | Wall: {WALL_THICKNESS * 10}mm</p>
      </div>
    </div>
  );
}

function getNoteInfo(hz: number): { noteName: string, cents: number } {
  if (hz < 20) return { noteName: "--", cents: 0 };
  const A4 = 440;
  const semitonesFromA4 = 12 * Math.log2(hz / A4);
  const roundedSemitones = Math.round(semitonesFromA4);
  const cents = (semitonesFromA4 - roundedSemitones) * 100;

  const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const noteIndex = (roundedSemitones + 69) % 12;
  const octave = Math.floor((roundedSemitones + 69) / 12) - 1;

  return {
    noteName: `${notes[noteIndex < 0 ? 12 + noteIndex : noteIndex]}${octave}`,
    cents
  };
}

export default App;
