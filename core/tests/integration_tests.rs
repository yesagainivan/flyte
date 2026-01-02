use flyte_core::FluteEngine;

#[test]
fn test_pitch_calculation_sanity() {
    // Standard approx flute dimensions: 60cm length, typical bore.
    let mut engine = FluteEngine::new(60.0, 0.95, 0.4);

    // With no holes open (all closed, effectively an open-open pipe of length 60),
    // f = c / 2L = 34500 / 120 = ~287.5 Hz (approx D4)
    // The engine's calc might vary slightly due to end corrections, but should be in ballpark.
    // Use a standard playing jet velocity of 2000 cm/s
    let pitch = engine.calculate_pitch(2000.0);

    assert!(
        pitch > 250.0 && pitch < 320.0,
        "Pitch {} out of expected range for 60cm tube",
        pitch
    );
}

#[test]
fn test_hole_opening_shifts_pitch() {
    let mut engine = FluteEngine::new(60.0, 0.95, 0.4);
    let base_pitch = engine.calculate_pitch(2000.0);

    // Add a hole halfway
    let pos = [30.0];
    let rad = [0.3];
    let open = [1];

    engine.set_holes(&pos, &rad, &open).unwrap();

    let new_pitch = engine.calculate_pitch(2000.0);

    // Opening a hole shortens effective length -> higher pitch
    assert!(
        new_pitch > base_pitch,
        "Pitch did not increase after opening a hole! ({} -> {})",
        base_pitch,
        new_pitch
    );
}
