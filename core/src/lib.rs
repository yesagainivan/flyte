mod physics;
use physics::{Flute, Hole};
use wasm_bindgen::prelude::*;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
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
        self.inner
            .holes
            .sort_by(|a, b| a.position.partial_cmp(&b.position).unwrap());
    }

    pub fn calculate_pitch(&self) -> f64 {
        self.inner.calculate_frequency()
    }

    /// Calculate required position for a specific frequency given a hole size
    /// This is a naive inversion of the frequency formula
    pub fn calculate_hole_position(&self, target_freq: f64, hole_radius: f64) -> f64 {
        // f = v / 2(L + C)
        // L + C = v / 2f
        // L = (v / 2f) - C

        let a_bore = std::f64::consts::PI * self.inner.bore_radius.powi(2);
        let a_hole = std::f64::consts::PI * hole_radius.powi(2);
        let t_eff = self.inner.wall_thickness + 1.5 * hole_radius;
        let c = (a_bore / a_hole) * t_eff;

        // speed of sound / (2 * freq) - correction
        (34500.0 / (2.0 * target_freq)) - c
    }
}
