import { useEffect, useState } from 'react';
import init, { FluteEngine } from 'flyte_core';
import './App.css';

interface HoleData {
  id: number;
  position: number; // cm
  radius: number;   // cm
  open: boolean;
}

const TUBE_LENGTH = 60.0; // cm example (flute is ~60-70cm)
const BORE_RADIUS = 0.95; // cm (19mm dia)
const WALL_THICKNESS = 0.04; // cm (0.4mm)
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
    setPitch(engine.calculate_pitch());
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
    newPos = Math.max(0, Math.min(TUBE_LENGTH, newPos));

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

  return (
    <div className="app-container">
      <h1>Flyte</h1>
      <div className="readout">
        <div className="hz-display">
          {pitch.toFixed(1)} <span className="unit">Hz</span>
        </div>
        <div className="note-name">
          {/* Approximate note name logic could go here */}
          approx {getNoteName(pitch)}
        </div>
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
          <rect
            x={0}
            y={80}
            width={TUBE_LENGTH * PX_PER_CM}
            height={40}
            fill="#8d6e63"
            stroke="#5d4037"
            strokeWidth={2}
            rx={5}
          />

          {/* Embouchure (Mouth hole) - usually near 0 but physically a bit in */}
          <circle cx={2 * PX_PER_CM} cy={100} r={5} fill="black" opacity={0.8} />

          {/* Tone Holes */}
          {holes.map(hole => (
            <g key={hole.id} transform={`translate(${hole.position * PX_PER_CM}, 100)`}>
              <circle
                r={hole.radius * PX_PER_CM * 2} // Visual exaggeration for easy gripping
                fill={hole.open ? "#1a1a1a" : "#d7ccc8"}
                stroke="white"
                strokeWidth={2}
                cursor="ew-resize"
                onPointerDown={(e) => handlePointerDown(hole.id, e)}
                onClick={() => toggleHole(hole.id)}
              />
              <text y={-25} textAnchor="middle" fill="#ccc" fontSize="12">
                {hole.position.toFixed(1)}cm
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="controls">
        <p>Drag holes to adjust position. Click to close/open.</p>
      </div>
    </div>
  );
}

function getNoteName(hz: number): string {
  if (hz === 0) return "--";
  const A4 = 440;
  const semitones = 12 * Math.log2(hz / A4);
  const noteIndex = Math.round(semitones) + 69; // MIDI note number
  const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return notes[noteIndex % 12];
}

export default App;
