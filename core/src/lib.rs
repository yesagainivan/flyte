mod physics;
use physics::{Flute, Hole};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct FluteEngine {
    inner: Flute,
}

#[wasm_bindgen]
impl FluteEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(length: f64, bore_radius: f64, wall_thickness: f64) -> FluteEngine {
        console_error_panic_hook::set_once();
        FluteEngine {
            inner: Flute::new(length, bore_radius, wall_thickness),
        }
    }

    pub fn set_holes(
        &mut self,
        positions: &[f64],
        radii: &[f64],
        open: &[u8],
    ) -> Result<(), JsValue> {
        if positions.len() != radii.len() || positions.len() != open.len() {
            return Err(JsValue::from_str("Arrays must have the same length"));
        }

        // Reuse existing capacity if possible
        if self.inner.holes.capacity() < positions.len() {
            self.inner
                .holes
                .reserve(positions.len() - self.inner.holes.len());
        }

        // Resize vector to match new length (either growing or shrinking)
        // We can't use resize_with easily because we need to fill with specific data,
        // so we'll just clear and push if we want to be safe, OR overwrite.
        // A safer "reuse" pattern for strict typing: use strict indexing for update if len matches.

        // Simplest safe approach that reuses allocation:
        self.inner.holes.clear();

        for i in 0..positions.len() {
            let mut pos = positions[i];
            if pos.is_nan() {
                pos = 0.0;
            }

            let mut rad = radii[i];
            if rad.is_nan() {
                rad = 0.1;
            }

            self.inner.holes.push(Hole {
                position: pos,
                radius: rad,
                open: open[i] != 0,
            });
        }
        Ok(())
    }

    pub fn update_hole(
        &mut self,
        index: usize,
        position: f64,
        radius: f64,
        open: bool,
    ) -> Result<(), JsValue> {
        if index >= self.inner.holes.len() {
            return Err(JsValue::from_str("Hole index out of bounds"));
        }

        self.inner.holes[index].position = if position.is_nan() { 0.0 } else { position };
        self.inner.holes[index].radius = if radius.is_nan() { 0.1 } else { radius };
        self.inner.holes[index].open = open;

        Ok(())
    }

    /// Calculate pitch using TMM and Resonance search
    /// Uses a smart guess based on the first open hole to ensure we find the fundamental
    /// Calculate pitch using TMM and Resonance search
    /// Uses a smart guess based on the first open hole to ensure we find the fundamental
    pub fn calculate_pitch(&mut self, _ignored_guess_hz: f64) -> f64 {
        // Find the effective length based on the first open hole (closest to embouchure, pos 0)
        // Holes are sorted by position in find_resonance, but here we just need a scan.
        // We want the hole with the smallest position that is open.

        let mut shortest_len = self.inner.length;

        for hole in &self.inner.holes {
            if hole.open && hole.position < shortest_len {
                shortest_len = hole.position;
            }
        }

        // Simple end correction approximation (0.61 * r) - crude but helps
        let effective_len = shortest_len + 0.61 * self.inner.bore_radius;

        // Fundamental of open-open pipe: f = c / 2L
        let robust_guess = 34500.0 / (2.0 * effective_len);

        self.inner.find_resonance(robust_guess)
    }
}
