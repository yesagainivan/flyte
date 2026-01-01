use crate::physics::Flute;
use std::f64::consts::PI;

pub struct Mesh {
    vertices: Vec<(f64, f64, f64)>,
    // Store faces per group for cleaner OBJ output: (Group Name, list of faces)
    groups: Vec<(String, Vec<Vec<usize>>)>,
    current_group: String,
}

impl Mesh {
    pub fn new() -> Self {
        Mesh {
            vertices: Vec::new(),
            groups: vec![("default".to_string(), Vec::new())],
            current_group: "default".to_string(),
        }
    }

    pub fn set_group(&mut self, name: &str) {
        if self.current_group != name {
            self.current_group = name.to_string();
            self.groups.push((name.to_string(), Vec::new()));
        }
    }

    pub fn add_vertex(&mut self, x: f64, y: f64, z: f64) -> usize {
        self.vertices.push((x, y, z));
        self.vertices.len() // 1-based index for OBJ logic if needed effectively, but returns count
    }

    pub fn add_face(&mut self, indices: &[usize]) {
        // Validation?
        if let Some((_, faces)) = self.groups.last_mut() {
            faces.push(indices.to_vec());
        }
    }

    pub fn to_obj_string(&self) -> String {
        let mut out = String::new();
        out.push_str("# Flyte Architect Export\n");
        out.push_str("o FluteProject\n");

        for (x, y, z) in &self.vertices {
            out.push_str(&format!("v {:.4} {:.4} {:.4}\n", x, y, z));
        }

        for (group_name, faces) in &self.groups {
            if faces.is_empty() {
                continue;
            }
            out.push_str(&format!("g {}\n", group_name));
            for face in faces {
                out.push_str("f");
                for idx in face {
                    // OBJ is 1-indexed
                    out.push_str(&format!(" {}", idx));
                }
                out.push('\n');
            }
        }

        out
    }
}

pub fn generate_flute_mesh(flute: &Flute) -> Mesh {
    let mut mesh = Mesh::new();

    // Helper function moved to local scope to act on mesh
    fn add_ring(mesh: &mut Mesh, x: f64, r: f64, segments: usize) -> Vec<usize> {
        let mut indices = Vec::new();
        for i in 0..segments {
            let theta = 2.0 * PI * (i as f64) / (segments as f64);
            let y = r * theta.cos();
            let z = r * theta.sin();
            // add_vertex returns count which serves as 1-based index
            indices.push(mesh.add_vertex(x, y, z));
        }
        indices
    }

    fn stitch_rings(mesh: &mut Mesh, r1: &[usize], r2: &[usize], flip: bool, segments: usize) {
        for i in 0..segments {
            let next = (i + 1) % segments;
            let idx1 = r1[i];
            let idx2 = r2[i];
            let idx1_next = r1[next];
            let idx2_next = r2[next];

            if flip {
                mesh.add_face(&[idx1, idx1_next, idx2_next, idx2]);
            } else {
                mesh.add_face(&[idx1, idx2, idx2_next, idx1_next]);
            }
        }
    }

    // 1. Tube Body
    mesh.set_group("TubeBody");

    let segments = 64;
    let length = flute.length;
    let r_inner = flute.bore_radius;
    let r_outer = flute.bore_radius + flute.wall_thickness;

    let ring_l_in = add_ring(&mut mesh, -5.0, r_inner, segments);
    let ring_l_out = add_ring(&mut mesh, -5.0, r_outer, segments);
    let ring_r_in = add_ring(&mut mesh, length, r_inner, segments);
    let ring_r_out = add_ring(&mut mesh, length, r_outer, segments);

    // Outer Surface (facing out)
    stitch_rings(&mut mesh, &ring_l_out, &ring_r_out, true, segments);

    // Inner Surface (facing in)
    stitch_rings(&mut mesh, &ring_l_in, &ring_r_in, false, segments);

    // End Caps (Rim)
    // Left Rim (x=0): connect Outer to Inner
    stitch_rings(&mut mesh, &ring_l_out, &ring_l_in, false, segments); // Check normals... Outer is ccw?
                                                                       // Left: Normal points -X.
                                                                       // Ring L Out points in +Y. The quad 1->2->2'->1'

    // Right Rim (x=L)
    stitch_rings(&mut mesh, &ring_r_out, &ring_r_in, true, segments);

    // 2. Hole Cutters (Cylinders)
    mesh.set_group("HoleCutters");

    for hole in &flute.holes {
        if !hole.open {
            continue;
        }
        // Maybe don't export closed holes? Or export as separate group?
        // Let's export all defined holes as cutters.

        let h_segments = 32;
        let h_r = hole.radius;
        let h_x = hole.position;

        // Cutter length: needs to pass through the wall.
        // Wall extends from r_inner to r_outer.
        // Let's make cutter go from r_inner - 0.5 to r_outer + 0.5
        let y_start = r_inner - 0.5;
        let y_end = r_outer + 0.5;

        // Ring Bottom
        let mut ring_bot = Vec::new();
        for j in 0..h_segments {
            let theta = 2.0 * PI * (j as f64) / (h_segments as f64);
            // Cylinder along Y axis
            // base circle in XZ plane
            let local_x = h_r * theta.cos();
            let local_z = h_r * theta.sin();

            let vx = h_x + local_x;
            let vy = y_start;
            let vz = local_z;

            ring_bot.push(mesh.add_vertex(vx, vy, vz));
        }

        // Ring Top
        let mut ring_top = Vec::new();
        for j in 0..h_segments {
            let theta = 2.0 * PI * (j as f64) / (h_segments as f64);
            let local_x = h_r * theta.cos();
            let local_z = h_r * theta.sin();

            let vx = h_x + local_x;
            let vy = y_end;
            let vz = local_z;

            ring_top.push(mesh.add_vertex(vx, vy, vz));
        }

        // Stitch Cutter
        stitch_rings(&mut mesh, &ring_bot, &ring_top, false, h_segments);

        // Caps for cutter (so it's a solid boolean object)
        let mut bot_rev = ring_bot.clone();
        bot_rev.reverse();
        mesh.add_face(&bot_rev); // Basic n-gon cap

        let top_norm = ring_top.clone(); // top_norm need to be ccw from top?
        mesh.add_face(&top_norm);
    }

    // 3. Mouth Hole Cutter
    mesh.set_group("MouthHoleCutter");

    // Position the mouth hole at x=0, which corresponds to the acoustic start of the air column.
    // The physical tube extends backwards to -5.0cm (headjoint/stopper) for visual realism.

    let m_r = 0.4; // Approximate mouth radius
    let m_x = 0.0; // At the "start"

    // Cutter at mouth
    let y_start = r_inner - 0.5;
    let y_end = r_outer + 0.5;

    let h_segments = 32;
    // Ring Bottom
    let mut ring_bot = Vec::new();
    for j in 0..h_segments {
        let theta = 2.0 * PI * (j as f64) / (h_segments as f64);
        let local_x = m_r * theta.cos();
        let local_z = m_r * theta.sin();
        ring_bot.push(mesh.add_vertex(m_x + local_x, y_start, local_z));
    }
    let mut ring_top = Vec::new();
    for j in 0..h_segments {
        let theta = 2.0 * PI * (j as f64) / (h_segments as f64);
        let local_x = m_r * theta.cos();
        let local_z = m_r * theta.sin();
        ring_top.push(mesh.add_vertex(m_x + local_x, y_end, local_z));
    }
    stitch_rings(&mut mesh, &ring_bot, &ring_top, false, h_segments);
    let mut bot_rev = ring_bot.clone();
    bot_rev.reverse();
    mesh.add_face(&bot_rev);
    let top_norm = ring_top.clone();
    mesh.add_face(&top_norm);

    mesh
}
