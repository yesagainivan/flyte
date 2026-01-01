mod physics;
use physics::{Flute, Hole};
use wasm_bindgen::prelude::*;

#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

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

    pub fn set_holes(&mut self, holes: JsValue) {
        let holes: Vec<Hole> = serde_wasm_bindgen::from_value(holes).unwrap();
        self.inner.holes = holes;
        // physics.rs handles sorting when optimizing, but good to keep state consistent?
        // Actually physics.rs sorts inside the method.
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
