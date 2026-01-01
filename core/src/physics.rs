use num_complex::Complex64;
use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

const SPEED_OF_SOUND: f64 = 34500.0; // cm/s
const AIR_DENSITY: f64 = 0.0012; // g/cm^3

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Flute {
    pub length: f64,         // Total length cm
    pub bore_radius: f64,    // cm
    pub wall_thickness: f64, // cm
    pub holes: Vec<Hole>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Hole {
    pub position: f64, // Distance from embouchure (cm)
    pub radius: f64,   // cm
    pub open: bool,
}

impl Flute {
    pub fn new(length: f64, bore_radius: f64, wall_thickness: f64) -> Self {
        Flute {
            length,
            bore_radius,
            wall_thickness,
            holes: Vec::new(),
        }
    }
    /// Calculate input impedance at the embouchure for a given frequency
    /// Assumes holes are already sorted back-to-front by find_resonance
    fn impedance_at(&self, freq: f64) -> Complex64 {
        let omega = 2.0 * PI * freq;
        let k = omega / SPEED_OF_SOUND;

        // Z_c = rho * c / Area
        let bore_area = PI * self.bore_radius.powi(2);
        let z_c = (AIR_DENSITY * SPEED_OF_SOUND) / bore_area;
        let z_char = Complex64::new(z_c, 0.0);

        // 1. Start at the foot (end of tube)
        let mut z_in = Complex64::new(0.0, 0.0); // Ideally open

        // Iterate backwards from end of tube to embouchure
        let mut current_pos = self.length;

        // Iterate over holes (which we assume are sorted back-to-front)
        for hole in &self.holes {
            // A. Transmission line from current_pos back to hole.position
            let dist = current_pos - hole.position;
            if dist > 0.0 {
                z_in = transmission_line_impedance(z_in, z_char, k, dist);
            }
            current_pos = hole.position;

            // B. Shunt impedance of the hole
            let z_hole = hole_impedance(hole.radius, self.wall_thickness, k);

            if hole.open {
                // Open hole: Parallel connection
                // 1/Z_eq = 1/Z_in + 1/Z_hole => Z_eq = (Z_in * Z_hole) / (Z_in + Z_hole)
                if z_hole.norm() < 1e-10 {
                    z_in = Complex64::new(0.0, 0.0);
                } else {
                    z_in = (z_in * z_hole) / (z_in + z_hole);
                }
            } else {
                // Closed hole: Acts as a compliance (small volume)
                // V = Area * effective_height
                // Z_compliance = 1 / (j * omega * C_a) where C_a = V / (rho * c^2)
                // Z_closed = -j * (rho * c^2) / (omega * V)

                let hole_area = PI * hole.radius.powi(2);
                // Effective depth includes wall thickness + correction (approx same as open hole end correction)
                let eff_depth = self.wall_thickness + 1.5 * hole.radius;
                let volume = hole_area * eff_depth;

                let stiffness = (AIR_DENSITY * SPEED_OF_SOUND.powi(2)) / volume;
                // Z = -j * stiffness / omega
                let z_closed = Complex64::new(0.0, -stiffness / omega);

                z_in = (z_in * z_closed) / (z_in + z_closed);
            }
        }

        // C. Final segment from first hole (or end) to embouchure (pos 0)
        let dist = current_pos - 0.0;
        if dist > 0.0 {
            z_in = transmission_line_impedance(z_in, z_char, k, dist);
        }

        z_in
    }

    /// Find the resonance frequency closest to the target guess
    pub fn find_resonance(&mut self, guess_freq: f64) -> f64 {
        // Sort holes in-place (back-to-front) to avoid allocations
        self.holes.sort_by(|a, b| {
            b.position
                .partial_cmp(&a.position)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Secant method loop
        let _f0 = guess_freq * 0.8;
        let _f1 = guess_freq * 1.2;

        let mut f_curr = guess_freq;
        let mut f_prev = guess_freq - 10.0;

        for _ in 0..20 {
            let z_curr = self.impedance_at(f_curr);
            let z_prev = self.impedance_at(f_prev);

            let y_curr = z_curr.im;
            let y_prev = z_prev.im;

            if (y_curr - y_prev).abs() < 1e-6 {
                break;
            }

            let f_next = f_curr - y_curr * (f_curr - f_prev) / (y_curr - y_prev);

            if f_next < 20.0 || f_next > 5000.0 {
                f_prev = f_curr;
                f_curr = (f_curr + guess_freq) / 2.0;
            } else {
                f_prev = f_curr;
                f_curr = f_next;
            }

            if (f_curr - f_prev).abs() < 0.01 {
                break;
            }
        }

        f_curr
    }
}

// Transmission Line Equation
// Z_in = Zc * (Z_L + j Zc tan(kL)) / (Zc + j Z_L tan(kL))
fn transmission_line_impedance(
    z_load: Complex64,
    z_char: Complex64,
    k: f64,
    len: f64,
) -> Complex64 {
    let tan_kl = (k * len).tan();
    let j_tan = Complex64::new(0.0, tan_kl);

    let numer = z_load + z_char * j_tan;
    let denom = z_char + z_load * j_tan;

    z_char * (numer / denom)
}

fn hole_impedance(radius: f64, wall_thickness: f64, k: f64) -> Complex64 {
    // Z_hole = j * rho * omega * t_eff / A_hole
    // t_eff = wall_thickness + 1.5 * radius (roughly)

    let area = PI * radius.powi(2);
    let t_eff = wall_thickness + 1.5 * radius; // Benade's end correction for hole

    // Inertance L = (rho * t_eff) / Area
    // Z = j * omega * L

    // Note: omega is in k = omega/c => omega = k*c
    let omega = k * SPEED_OF_SOUND;

    let inertance = (AIR_DENSITY * t_eff) / area;
    Complex64::new(0.0, omega * inertance)
}
