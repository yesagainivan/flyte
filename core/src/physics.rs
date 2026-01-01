use serde::{Deserialize, Serialize};

// Speed of sound in air (cm/s) at roughly 20C
const SPEED_OF_SOUND: f64 = 34500.0;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Flute {
    pub length: f64,        // cm
    pub bore_radius: f64,   // cm
    pub wall_thickness: f64,// cm
    pub holes: Vec<Hole>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Hole {
    pub position: f64,      // Distance from embouchure (cm)
    pub radius: f64,        // cm
    pub open: bool,         // Is the hole open? (`true` means it creates a node)
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

    pub fn add_hole(&mut self, position: f64, radius: f64) {
        self.holes.push(Hole {
            position,
            radius,
            open: true, // Default to open for calculation testing
        });
        // Sort holes by position (closest to embouchure first)
        self.holes.sort_by(|a, b| a.position.partial_cmp(&b.position).unwrap());
    }

    /// Calculate the fundamental frequency (Hz)
    pub fn calculate_frequency(&self) -> f64 {
        // Find the "effective" acoustic length.
        // It ends roughly at the first *open* hole, or the end of the tube.
        let first_open_hole = self.holes.iter().find(|h| h.open);

        let physical_length = match first_open_hole {
            Some(hole) => hole.position,
            None => self.length,
        };

        // End Correction (C)
        // If it's a hole: C = (A_bore / A_hole) * (t + 1.5 * r_hole)
        // If it's the end of tube: C = 0.61 * r_bore
        
        let end_correction = match first_open_hole {
            Some(hole) => {
                let a_bore = std::f64::consts::PI * self.bore_radius.powi(2);
                let a_hole = std::f64::consts::PI * hole.radius.powi(2);
                let t_eff = self.wall_thickness + 1.5 * hole.radius;
                
                (a_bore / a_hole) * t_eff
            },
            None => {
                0.61 * self.bore_radius
            }
        };

        let effective_length = physical_length + end_correction;

        // f = v / 2L
        SPEED_OF_SOUND / (2.0 * effective_length)
    }
}
