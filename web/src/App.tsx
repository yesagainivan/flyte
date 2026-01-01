import { useEffect, useState, useRef } from 'react';
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
  const [selectedHoleId, setSelectedHoleId] = useState<number | null>(null);
  const isDragging = useRef<boolean>(false);

  useEffect(() => {
    init().then(() => {
      const eng = new FluteEngine(TUBE_LENGTH, BORE_RADIUS, WALL_THICKNESS);
      setEngine(eng);
    });
  }, []);

  useEffect(() => {
    if (!engine) return;

    // Skip heavy full-array update if we are just dragging (we handle that manually)
    if (isDragging.current) return;

    // Convert our friendly HoleData to the partial struct expected by set_holes
    // Convert our friendly HoleData to the partial struct expected by set_holes
    try {
      const positions = new Float64Array(holes.map(h => h.position));
      const radii = new Float64Array(holes.map(h => h.radius));
      const open = new Uint8Array(holes.map(h => h.open ? 1 : 0));

      engine.set_holes(positions, radii, open);

      // Use previous pitch as guess, or default if 0
      const newPitch = engine.calculate_pitch(pitch);
      // Safety check against garbage
      if (newPitch > 20 && newPitch < 5000) {
        setPitch(newPitch);
      }
    } catch (e) {
      console.error("Error updating physics engine:", e);
    }
  }, [holes, engine]);

  // Removed manual free() to check for double-free issues in React StrictMode
  // useEffect(() => {
  //   return () => {
  //     engine?.free();
  //   };
  // }, [engine]);

  const handlePointerDown = (id: number, e: React.PointerEvent) => {
    // If modifier key is pressed, we want to toggle (handled in onClick), not drag.
    if (e.metaKey || e.ctrlKey) return;

    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingId(id);
    setSelectedHoleId(id);
    isDragging.current = true;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingId === null) return;
    if (!engine) return;

    const svgRect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!svgRect) return;

    // Calculate new position in cm
    // x coordinate is relative to the SVG container
    const x = e.clientX - svgRect.left;
    let newPos = x / PX_PER_CM;

    // Clamp to tube length
    newPos = Math.max(1.0, Math.min(TUBE_LENGTH - 1.0, newPos));

    // 1. Update React State (UI)
    setHoles(prev => prev.map(h =>
      h.id === draggingId ? { ...h, position: newPos } : h
    ));

    // 2. Direct Physics Update (WASM) - Zero Allocation
    // Find index of hole in the array
    const holeIndex = holes.findIndex(h => h.id === draggingId);
    if (holeIndex !== -1) {
      try {
        const h = holes[holeIndex];
        engine.update_hole(holeIndex, newPos, h.radius, h.open);

        // Recalculate pitch immediately
        const newPitch = engine.calculate_pitch(pitch);
        if (newPitch > 20 && newPitch < 5000) {
          setPitch(newPitch);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setDraggingId(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
    isDragging.current = false;

    // Trigger a full sync when drag ends to ensure consistency
    // We do this by toggling a dummy state or just letting the next effect run?
    // Actually, setting state in handlePointerMove triggers effect, but we blocked it with isDragging.
    // Now that isDragging is false, we want one final sync.
    // We can force it by shallow copying holes, but setHoles above already queued a render.
    // The render happened, effect ran, saw isDragging=true, and skipped.
    // Now we are done. We need to trigger effect one last time.
    // Simplest way: just call the update logic manually here or force an effect.
    // Let's just setHoles with exact same content to trigger effect? No, React bails out.
    // We can just call setHoles/trigger sync explicitly if we want, but actually
    // since we updated physics manually, we are in sync!
    // The NEXT operation (adding hole etc) will be fine.
  };

  const toggleHole = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    // Only toggle if Cmd/Ctrl is pressed
    if (e.metaKey || e.ctrlKey) {
      setHoles(prev => prev.map(h =>
        h.id === id ? { ...h, open: !h.open } : h
      ));
    }
    // Always select the hole we clicked on
    setSelectedHoleId(id);
  };

  const addHole = () => {
    const newId = (holes.length > 0 ? Math.max(...holes.map(h => h.id)) : 0) + 1;
    // Default to halfway of tube or near end
    setHoles(prev => [...prev, { id: newId, position: TUBE_LENGTH / 2, radius: 0.35, open: true }]);
    setSelectedHoleId(newId);
  };

  const deleteHole = (id: number) => {
    setHoles(prev => prev.filter(h => h.id !== id));
    if (selectedHoleId === id) setSelectedHoleId(null);
  };

  const updateRadius = (id: number, newRadius: number) => {
    if (isNaN(newRadius)) return;
    setHoles(prev => prev.map(h => h.id === id ? { ...h, radius: newRadius } : h));
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
                  stroke={selectedHoleId === hole.id ? "#4caf50" : "none"}
                  strokeWidth={selectedHoleId === hole.id ? 2 : 0}
                />
                {/* Hole Opening */}
                <circle
                  r={hole.radius * PX_PER_CM * 2}
                  fill={hole.open ? "#222" : "#a1887f"}
                  stroke={hole.open ? "#000" : "#5d4037"}
                  strokeWidth={2}
                  cursor="ew-resize"
                  onPointerDown={(e) => handlePointerDown(hole.id, e)}
                  onClick={(e) => toggleHole(hole.id, e)}
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
        <div className="design-controls">
          <h3>Design Controls</h3>
          <p>Tube Length: {TUBE_LENGTH}cm | Bore: {BORE_RADIUS * 20}mm</p>
          <button className="btn-primary" onClick={addHole}>+ Add Hole</button>
        </div>

        {selectedHoleId !== null && (
          <div className="hole-inspector">
            <h4>Hole #{selectedHoleId}</h4>
            <div className="control-group">
              <label>Radius (cm)</label>
              <input
                type="number"
                step="0.05"
                value={holes.find(h => h.id === selectedHoleId)?.radius || 0.35}
                onChange={(e) => updateRadius(selectedHoleId, parseFloat(e.target.value))}
              />
            </div>
            <button className="btn-danger" onClick={() => deleteHole(selectedHoleId)}>Remove</button>
          </div>
        )}
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
