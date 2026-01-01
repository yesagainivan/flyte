import { useEffect, useState, useRef } from 'react';
import init, { FluteEngine } from 'flyte_core';
import './App.css';
import { Toast, type ToastMessage } from './components/Toast';

interface HoleData {
  id: number;
  position: number; // cm, distance from embouchure
  radius: number;   // cm
  open: boolean;
}

const PX_PER_CM = 15; // Increased scale for better visibility

function App() {
  const [engine, setEngine] = useState<FluteEngine | null>(null);
  const [pitch, setPitch] = useState<number>(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Physics Parameters State
  const [tubeLength, setTubeLength] = useState<number>(60.0);
  const [boreRadius, setBoreRadius] = useState<number>(0.95);
  const [wallThickness, setWallThickness] = useState<number>(0.4);

  // Holes State
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
  const initialized = useRef(false);

  // Initialize WASM
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    init().then(() => {

      const eng = new FluteEngine(tubeLength, boreRadius, wallThickness);
      setEngine(eng);
    });
  }, [tubeLength, boreRadius, wallThickness]);

  // Update Global Physics Parameters
  useEffect(() => {
    if (!engine) return;
    try {
      engine.set_physics_params(tubeLength, boreRadius, wallThickness);
      // Trigger a recalc - we can use an internal guess or the last known pitch
      // Passing 0 or a fixed value lets the engine use its robust guess
      const newPitch = engine.calculate_pitch(440);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (newPitch > 20 && newPitch < 5000) setPitch(newPitch);
    } catch (e) {
      console.error("Error updating physics params:", e);
    }
  }, [tubeLength, boreRadius, wallThickness, engine]);

  // Update Holes
  useEffect(() => {
    if (!engine) return;
    if (isDragging.current) return; // Skip heavy updates during drag

    try {
      const positions = new Float64Array(holes.map(h => h.position));
      const radii = new Float64Array(holes.map(h => h.radius));
      const open = new Uint8Array(holes.map(h => h.open ? 1 : 0));

      engine.set_holes(positions, radii, open);

      const newPitch = engine.calculate_pitch(440);
      if (newPitch > 20 && newPitch < 5000) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPitch(newPitch);
      }
    } catch (e) {
      console.error("Error updating physics engine:", e);
    }
  }, [holes, engine]);

  // Event Handlers
  const handlePointerDown = (id: number, e: React.PointerEvent) => {
    if (e.metaKey || e.ctrlKey) return; // Allow click for toggle
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingId(id);
    setSelectedHoleId(id);
    isDragging.current = true;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingId === null || !engine) return;

    const svgElement = e.currentTarget.closest('svg');
    if (!svgElement) return;

    const svgRect = svgElement.getBoundingClientRect();
    const x = e.clientX - svgRect.left;
    let newPos = x / PX_PER_CM;

    // Clamp relative to tube length
    newPos = Math.max(1.0, Math.min(tubeLength - 1.0, newPos));

    // Optimistic UI Update
    setHoles(prev => prev.map(h =>
      h.id === draggingId ? { ...h, position: newPos } : h
    ));

    // Zero-allocation Physics Update
    const holeIndex = holes.findIndex(h => h.id === draggingId);
    if (holeIndex !== -1) {
      try {
        const h = holes[holeIndex];
        engine.update_hole(holeIndex, newPos, h.radius, h.open);
        const newPitch = engine.calculate_pitch(440);
        if (newPitch > 20 && newPitch < 5000) setPitch(newPitch);
      } catch (err) {
        console.error("Crash during drag:", err);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setDraggingId(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
    isDragging.current = false;
  };

  const toggleHole = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.metaKey || e.ctrlKey) {
      setHoles(prev => prev.map(h =>
        h.id === id ? { ...h, open: !h.open } : h
      ));
    }
    setSelectedHoleId(id);
  };

  const addHole = () => {
    const newId = (holes.length > 0 ? Math.max(...holes.map(h => h.id)) : 0) + 1;
    setHoles(prev => [...prev, { id: newId, position: tubeLength / 2, radius: 0.35, open: true }]);
    setSelectedHoleId(newId);
  };

  const deleteHole = (id: number) => {
    setHoles(prev => prev.filter(h => h.id !== id));
    if (selectedHoleId === id) setSelectedHoleId(null);
  };

  const updateSelectedRadius = (val: number) => {
    if (selectedHoleId === null) return;
    setHoles(prev => prev.map(h => h.id === selectedHoleId ? { ...h, radius: val } : h));
  };

  const { noteName, cents } = getNoteInfo(pitch);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportProject = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result;
        if (typeof content !== 'string') return;

        const project = JSON.parse(content) as {
          params: { tubeLength: number; boreRadius: number; wallThickness?: number };
          holes: HoleData[]
        };

        if (!project.params || !project.holes) {
          setToast({ type: 'error', text: "Invalid project file format" });
          return;
        }

        setTubeLength(project.params.tubeLength);
        setBoreRadius(project.params.boreRadius);
        if (project.params.wallThickness) {
          setWallThickness(project.params.wallThickness);
        }
        setHoles(project.holes);

        // Reset input value to allow selecting the same file again
        event.target.value = '';
        setToast({ type: 'success', text: "Project imported successfully" });
      } catch (err) {
        console.error("Failed to parse project file:", err);
        setToast({ type: 'error', text: "Failed to import project" });
      }
    };
    reader.readAsText(file);
  };

  const triggerImport = () => {
    fileInputRef.current?.click();
  };

  const handleSaveProject = () => {
    const project = {
      version: 1,
      timestamp: new Date().toISOString(),
      params: {
        tubeLength,
        boreRadius,
        wallThickness
      },
      holes
    };

    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `flyte-project-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportObj = () => {
    if (!engine) return;
    try {
      const objData = engine.export_obj();
      const blob = new Blob([objData], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `flyte-model.obj`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setToast({ type: 'success', text: "Exported .OBJ successfully" });
    } catch (e) {
      console.error("Failed to export OBJ:", e);
      setToast({ type: 'error', text: "Failed to export OBJ" });
    }
  };

  return (
    <div className="app-container">
      <header>
        <div>
          <h1>Flyte <span style={{ opacity: 0.5 }}>Architect</span></h1>
          <p className="subtitle">Acoustic Simulation Engine</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".json"
            onChange={handleImportProject}
          />
          <button className="btn-outline" onClick={triggerImport}>Import Project</button>
          <button className="btn-outline" onClick={handleSaveProject}>Save Project</button>
          <button className="btn-primary" onClick={handleExportObj}>Export .OBJ</button>
        </div>
      </header>

      <main className="workspace">
        <div className="viz-card">
          <svg
            width={tubeLength * PX_PER_CM + 100}
            height={200}
            className="flute-svg"
            onPointerMove={draggingId !== null ? handlePointerMove : undefined}
            onPointerUp={draggingId !== null ? handlePointerUp : undefined}
            style={{ overflow: 'visible' }}
          >
            <defs>
              <linearGradient id="bodyGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#27272a" />
                <stop offset="50%" stopColor="#3f3f46" />
                <stop offset="100%" stopColor="#18181b" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Tube Body */}
            <rect
              x={0}
              y={80}
              width={tubeLength * PX_PER_CM}
              height={40}
              fill="url(#bodyGradient)"
              stroke="#52525b"
              strokeWidth={1}
              rx={4}
            />

            {/* Embouchure */}
            <g transform={`translate(${2 * PX_PER_CM}, 100)`}>
              <circle r={6} fill="#09090b" stroke="#52525b" strokeWidth={1} />
              <text y={25} textAnchor="middle" className="ruler-text">Mouth</text>
            </g>

            {/* Holes */}
            {holes.map(hole => (
              <g key={hole.id} transform={`translate(${hole.position * PX_PER_CM}, 100)`}>
                {/* Selection Ring */}
                {selectedHoleId === hole.id && (
                  <circle
                    r={hole.radius * PX_PER_CM * 2 + 6}
                    fill="none"
                    stroke="var(--foreground)"
                    strokeWidth={1}
                    strokeDasharray="4 2"
                    opacity={0.5}
                  />
                )}

                {/* The Hole */}
                <circle
                  r={hole.radius * PX_PER_CM * 2}
                  fill={hole.open ? "#09090b" : "#52525b"}
                  stroke={hole.open ? "#27272a" : "#3f3f46"}
                  strokeWidth={2}
                  cursor="col-resize"
                  onPointerDown={(e) => handlePointerDown(hole.id, e)}
                  onClick={(e) => toggleHole(hole.id, e)}
                  filter={selectedHoleId === hole.id ? "url(#glow)" : undefined}
                />

                {/* Guide Line */}
                <line
                  y1={25}
                  y2={50}
                  stroke="var(--muted-foreground)"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                  opacity={0.3}
                />
                <text y={65} textAnchor="middle" className="ruler-text">
                  {hole.position.toFixed(1)}
                </text>
              </g>
            ))}

            {/* Ruler Markings roughly every 10cm */}
            {Array.from({ length: Math.ceil(tubeLength / 10) }).map((_, i) => (
              <g key={i} transform={`translate(${i * 10 * PX_PER_CM}, 135)`}>
                <line y1={-5} y2={0} stroke="var(--muted-foreground)" strokeWidth={1} />
                <text y={15} textAnchor="middle" className="ruler-text">{i * 10}cm</text>
              </g>
            ))}
          </svg>
        </div>

        <div className="controls-panel">
          {/* Analysis Card */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Real-time Analysis</h3>
              <div className="status-indicator active"></div>
            </div>

            <div className="pitch-display">
              <div className="hz-value">{pitch.toFixed(1)} <span style={{ fontSize: '1rem', color: 'var(--muted-foreground)', fontWeight: 400 }}>Hz</span></div>
              <div className="note-name">{noteName} {cents > 0 ? `+${cents.toFixed(0)}` : cents.toFixed(0)}c</div>

              <div className="cents-indicator">
                <div className="cents-fill" style={{
                  left: '50%',
                  width: `${Math.abs(cents)}%`,
                  transform: `translateX(${cents < 0 ? '-100%' : '0'})`,
                  backgroundColor: Math.abs(cents) < 10 ? '#22c55e' : (Math.abs(cents) < 25 ? '#eab308' : '#ef4444')
                }} />
                <div className="cents-bar" />
              </div>
            </div>
          </div>

          {/* Physical Parameters */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Tube Dimensions</h3>
            </div>
            <div className="properties-grid">
              <div className="control-group">
                <label>Total Length (cm)</label>
                <input
                  type="number"
                  value={tubeLength}
                  onChange={(e) => setTubeLength(parseFloat(e.target.value))}
                  step="0.1"
                />
              </div>
              <div className="control-group">
                <label>Bore Radius (cm)</label>
                <input
                  type="number"
                  value={boreRadius}
                  onChange={(e) => setBoreRadius(parseFloat(e.target.value))}
                  step="0.05"
                />
              </div>
              <div className="control-group">
                <label>Wall Thickness (cm)</label>
                <input
                  type="number"
                  value={wallThickness}
                  onChange={(e) => setWallThickness(parseFloat(e.target.value))}
                  step="0.05"
                />
              </div>
            </div>
          </div>

          {/* Hole Inspector */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                {selectedHoleId ? `Hole #${selectedHoleId} Configuration` : 'Hole Configuration'}
              </h3>
              <button className="btn-primary" onClick={addHole} style={{ fontSize: '0.75rem', height: '2rem' }}>
                + Add New
              </button>
            </div>

            {selectedHoleId ? (
              <div className="hole-details">
                <div className="control-group">
                  <label>Radius (cm)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={holes.find(h => h.id === selectedHoleId)?.radius || 0.35}
                    onChange={(e) => updateSelectedRadius(parseFloat(e.target.value))}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button className="btn-outline" style={{ width: '100%' }} onClick={(e) => toggleHole(selectedHoleId, e)}>
                    {holes.find(h => h.id === selectedHoleId)?.open ? 'Close Hole' : 'Open Hole'}
                  </button>
                  <button className="btn-danger" onClick={() => deleteHole(selectedHoleId)}>
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', textAlign: 'center', padding: '1rem' }}>
                Select a hole to edit properties
              </div>
            )}
          </div>
        </div>
      </main>
      <Toast message={toast} onClose={() => setToast(null)} />
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

  // Handle negative index correctly
  const normalizedIndex = noteIndex < 0 ? 12 + noteIndex : noteIndex;

  return {
    noteName: `${notes[normalizedIndex]}${octave}`,
    cents
  };
}

export default App;
