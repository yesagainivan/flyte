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
}

    #[test]
    fn test_fuzz_hole_positions() {
        // Simple deterministic PRNG
        let mut seed: u32 = 123456789;
        let mut rand = || {
            seed = (seed.wrapping_mul(1103515245).wrapping_add(12345)) & 0x7fffffff;
            seed as f64 / 0x7fffffff as f64
        };

        let mut flute = Flute::new(60.0, 0.95, 0.4);
        // Add 6 holes
        for _ in 0..6 {
            flute.holes.push(Hole { position: 30.0, radius: 0.35, open: true });
        }

        for _ in 0..1000 {
            // Randomize hole positions
            for hole in &mut flute.holes {
                // Generate positions from -50.0 to 150.0 (way beyond bounds)
                hole.position = (rand() * 200.0) - 50.0;
                hole.radius = rand() * 0.5 + 0.1;
                hole.open = rand() > 0.5;
            }

            // Calculate pitch
            let _ = flute.find_resonance(440.0);
            
            // Should not panic or crash
        }
    }
