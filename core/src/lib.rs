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

    pub fn set_holes(&mut self, positions: &[f64], radii: &[f64], open: &[u8]) {
        let mut new_holes = Vec::with_capacity(positions.len());
        for i in 0..positions.len() {
            new_holes.push(Hole {
                position: positions[i],
                radius: radii[i],
                open: open[i] != 0,
            });
        }
        self.inner.holes = new_holes;
    }

    /// Calculate pitch using TMM and Resonance search
    /// Requires a guess to avoid finding higher harmonics
    pub fn calculate_pitch(&self, guess_hz: f64) -> f64 {
        // If guess is 0, provide a reasonable default based on length
        let guess = if guess_hz <= 0.0 {
            34500.0 / (2.0 * self.inner.length)
        } else {
            guess_hz
        };

        self.inner.find_resonance(guess)
    }
}
