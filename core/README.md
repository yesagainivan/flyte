# Flyte Core (`flyte_core`)

The computational heart of Flyte, written in Rust. This crate handles the acoustic simulation and 3D geometry generation.

## Features

*   **Acoustic Simulation**: Uses the **Transfer Matrix Method (TMM)** to model total input impedance of the flute tube.
    *   Models conical/cylindrical bores.
    *   Models tone holes (open/closed) with end corrections.
    *   Predicts fundamental pitch using resonance search.
*   **Geometry Generation**: Generates 3D meshes of the designed flute.
    *   Exports to standard `.obj` format.
    *   Includes bore, wall thickness, and hole cutouts.

## Usage

### As a Library
You can use checks in this crate via standard `cargo` commands:

```bash
# Run unit tests
cargo test

# Check compilation
cargo check
```

### Building for Web (WASM)
This crate is designed to be compiled to WebAssembly for use in the frontend.

```bash
wasm-pack build --target web
```
This generates a `pkg/` directory containing the `.wasm` binary and JS bindings.

## Key Modules
*   `physics.rs`: Contains the `Flute` struct and impedance calculation logic.
*   `geometry.rs`: Handles procedural mesh generation for the 3D model.
*   `lib.rs`: The WASM public API surface.
