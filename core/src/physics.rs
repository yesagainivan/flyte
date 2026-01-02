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
    // New fields for higher accuracy
    #[serde(default)]
    pub cork_position: f64, // Distance from embouchure center to cork (cm). Default ~1.7
    #[serde(default)]
    pub embouchure_hole_radius: f64, // cm. Default ~0.5
    #[serde(default)]
    pub embouchure_chimney: f64, // Height of chimney (lip plate) cm. Default ~0.5
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
            cork_position: 1.7,
            embouchure_hole_radius: 0.5,
            embouchure_chimney: 0.5,
        }
    }
    /// Calculate input impedance at the embouchure for a given frequency
    /// Assumes holes are already sorted back-to-front by find_resonance
    fn impedance_at(&self, freq: f64, holes: &[Hole]) -> Complex64 {
        let omega = 2.0 * PI * freq;

        // Viscothermal losses
        // Alpha approx 1.2e-5 * sqrt(f) / radius_cm (N.B. check units, standard is per meter)
        // Let's use a standard approximation for wide tubes:
        // k = w/c - j * alpha
        let alpha = (1.2e-5 * freq.sqrt()) / self.bore_radius;
        let real_k = omega / SPEED_OF_SOUND;
        // Complex wavenumber k
        let k = Complex64::new(real_k, -alpha);

        // Z_c = rho * c / Area
        let bore_area = PI * self.bore_radius.powi(2);
        let z_c_val = (AIR_DENSITY * SPEED_OF_SOUND) / bore_area;
        let z_char = Complex64::new(z_c_val, 0.0);

        // 1. Start at the foot (end of tube) with Radiation Impedance
        // Z_rad for unflanged pipe approx:
        // ka = k * r
        // Z_rad = Z_c * (0.25*(ka)^2 + j*0.61*ka)
        let ka = real_k * self.bore_radius;
        let z_rad_foot = z_char * Complex64::new(0.25 * ka.powi(2), 0.61 * ka);

        // Load at the end is the radiation impedance
        let mut z_in = z_rad_foot;

        // Iterate backwards from end of tube to embouchure
        // Note: self.length is typically "embouchure to foot" physical length.
        let mut current_pos = self.length;

        // Iterate over holes (which we assume are sorted back-to-front)
        for hole in holes {
            // A. Transmission line from current_pos back to hole.position
            let dist = current_pos - hole.position;
            if dist > 0.0 {
                z_in = transmission_line_impedance(z_in, z_char, k, dist);
            }
            current_pos = hole.position;

            // B. Shunt impedance of the hole
            // For open hole, we also use a radiation impedance model if possible,
            // but the basic inertance model with end correction is robust enough for now.
            // We can add a resistance term to z_hole for radiation damping?
            // Z_hole_rad = (rho * c / A_hole) * (0.25 (ka_hole)^2)  (Resistance part)

            let hole_area = PI * hole.radius.powi(2);
            let mut z_hole = hole_impedance(hole.radius, self.wall_thickness, real_k);

            // Add radiation resistance to open hole
            if hole.open {
                let ka_hole = real_k * hole.radius;
                let hole_rad_res =
                    ((AIR_DENSITY * SPEED_OF_SOUND) / hole_area) * 0.25 * ka_hole.powi(2);
                z_hole = z_hole + Complex64::new(hole_rad_res, 0.0);
            }

            if hole.open {
                // Open hole: Parallel connection
                if z_hole.norm() < 1e-10 {
                    z_in = Complex64::new(0.0, 0.0);
                } else {
                    z_in = (z_in * z_hole) / (z_in + z_hole);
                }
            } else {
                // Closed hole
                // Calculate compliance as before...
                let hole_area = PI * hole.radius.powi(2);
                let eff_depth = self.wall_thickness + 1.5 * hole.radius; // Kept basic for now
                let volume = hole_area * eff_depth;
                let stiffness = (AIR_DENSITY * SPEED_OF_SOUND.powi(2)) / volume;
                let z_closed = Complex64::new(0.0, -stiffness / omega);
                z_in = (z_in * z_closed) / (z_in + z_closed);
            }
        }

        // C. Final segment from first hole (or end) to embouchure (pos 0)
        let dist = current_pos - 0.0;
        if dist > 0.0 {
            z_in = transmission_line_impedance(z_in, z_char, k, dist);
        }

        // --- EMBOUCHURE JOINT CORRECTION ---
        // At pos=0, we have the "Main Bore" input impedance z_in.
        // But we also have:
        // 1. The Cork Cavity (a closed tube of length 'cork_position' upstream) => Shunt Z_cork
        // 2. The Embouchure Hole (an inertance + radiation R leaking to outside) => Shunt Z_emb

        // Z_cork (Closed stub)
        // Z_cork = -j * Z_c * cot(k * L_cork)
        // transmission_line_impedance with Load=Infinity?
        // Easier: Z_input_closed_stub = Z_c / (j tan(kL)) = -j Z_c cot(kL)
        let z_cork_stub = -Complex64::i() * z_char / (k * self.cork_position).tan();

        // Z_emb (Embouchure hole impedance)
        // Similar to a tone hole: inertance + radiation
        // L = rho * t_eff / A
        // t_eff ~ chimney + correction. Benade suggests "equivalent length" ~5cm?
        // Let's use physical calculation:
        let emb_area = PI * self.embouchure_hole_radius.powi(2);
        // End corrections for embouchure hole (approximate)
        let emb_t_eff = self.embouchure_chimney + 1.5 * self.embouchure_hole_radius;

        // Radiation R for embouchure
        let ka_emb = real_k * self.embouchure_hole_radius;
        let emb_rad_res = ((AIR_DENSITY * SPEED_OF_SOUND) / emb_area) * 0.25 * ka_emb.powi(2);

        let emb_inertance = (AIR_DENSITY * emb_t_eff) / emb_area;
        let z_emb = Complex64::new(emb_rad_res, omega * emb_inertance);

        // Total Impedance seen by the flow drive:
        // Parallel of (Bore, Cork, EmbouchureHole)
        // 1/Z_total = 1/Z_bore + 1/Z_cork + 1/Z_emb
        // But wait! We look for resonance of the PIPE.
        // The condition for resonance is Im(Y_total) = 0?
        // Flutes play at minima of Input Impedance *of the bore*?
        // No, the jet drives the whole system. The resonance frequencies are the poles of the admittance (zeros of impedance) seen by the jet.
        // So we want Z_total to be minimal (Admittance maximal)?
        // Actually, Benade states: "The playing frequency is close to the frequency where the sum of admittances of the main bore, the cork cavity, and the embouchure hole is zero." (Im(Y_sum) = 0).

        let y_bore = if z_in.norm() < 1e-10 {
            Complex64::new(1e10, 0.0)
        } else {
            1.0 / z_in
        };
        let y_cork = if z_cork_stub.norm() < 1e-10 {
            Complex64::new(1e10, 0.0)
        } else {
            1.0 / z_cork_stub
        };
        let y_emb = if z_emb.norm() < 1e-10 {
            Complex64::new(1e10, 0.0)
        } else {
            1.0 / z_emb
        };

        let y_total = y_bore + y_cork + y_emb;

        // We return Z_total = 1/Y_total.
        // If Y_total is large (resonance), Z_total is small.
        // find_resonance looks for Z.im crossing 0.
        // If Im(Y) = 0, then Im(1/Y) = -Im(Y)/|Y|^2 = 0. So checking Z.im is equivalent to checking Y.im (mostly).

        if y_total.norm() < 1e-10 {
            Complex64::new(1e10, 1e10)
        } else {
            1.0 / y_total
        }
    }

    /// Find the resonance frequency closest to the target guess
    pub fn find_resonance(&mut self, guess_freq: f64) -> f64 {
        // Clone holes to avoid modifying the actual state
        let mut sorted_holes = self.holes.clone();

        // Sort holes in-place (back-to-front) to avoid allocations
        sorted_holes.sort_by(|a, b| {
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
            let z_curr = self.impedance_at(f_curr, &sorted_holes);
            let z_prev = self.impedance_at(f_prev, &sorted_holes);

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
    k: Complex64,
    len: f64,
) -> Complex64 {
    let kl = k * len;
    let tan_kl = kl.tan();
    let j_tan = Complex64::new(0.0, 1.0) * tan_kl;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_resonance_does_not_mutate_hole_order() {
        let mut flute = Flute::new(60.0, 0.95, 0.4);

        // Add holes in specific order
        // Hole 1: position 10.0
        // Hole 2: position 30.0
        // Hole 3: position 20.0
        // If sorted back-to-front, it would be 30, 20, 10.
        // We want to ensure it remains 10, 30, 20 after calculation.

        flute.holes.push(Hole {
            position: 10.0,
            radius: 0.3,
            open: true,
        });
        flute.holes.push(Hole {
            position: 30.0,
            radius: 0.3,
            open: true,
        });
        flute.holes.push(Hole {
            position: 20.0,
            radius: 0.3,
            open: true,
        });

        // Initial order check
        assert_eq!(flute.holes[0].position, 10.0);
        assert_eq!(flute.holes[1].position, 30.0);
        assert_eq!(flute.holes[2].position, 20.0);

        // Run calculation
        let _pitch = flute.find_resonance(440.0);

        // Verify order is preserved
        assert_eq!(flute.holes[0].position, 10.0, "Hole 0 moved!");
        assert_eq!(flute.holes[1].position, 30.0, "Hole 1 moved!");
        assert_eq!(flute.holes[2].position, 20.0, "Hole 2 moved!");
    }

    #[test]
    fn test_pitch_predictions() {
        let bore_radius = 0.95; // 19mm / 2
        let _wall_thickness = 0.04; // 0.4mm? Wait, 0.4 in the other test.
                                    // Note: 0.04 cm is 0.4mm.

        // C4 Check (~261 Hz)
        // Theoretical half-wave length: 34500 / 261 / 2 = 66.09 cm
        let mut flute_c4 = Flute::new(66.1, bore_radius, 0.4);
        let freq_c4 = flute_c4.find_resonance(261.0);
        println!("C4 (66.1cm): {:.2} Hz (Expected ~261)", freq_c4);

        // A4 Check (~440 Hz)
        // Theoretical half-wave length: 34500 / 440 / 2 = 39.20 cm
        let mut flute_a4 = Flute::new(39.2, bore_radius, 0.4);
        let freq_a4 = flute_a4.find_resonance(440.0);
        println!("A4 (39.2cm): {:.2} Hz (Expected ~440)", freq_a4);
    }
}
