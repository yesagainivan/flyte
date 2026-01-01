# Flyte: Acoustic Flute Simulation Engine

Flyte is a web-based acoustic simulation tool for designing and analyzing flutes. It combines a high-performance Rust/WASM physics engine with a modern React frontend to provide real-time pitch prediction and ergonomic design capabilities.

## Features

*   **Real-time Physics**: Uses Transfer Matrix Method (TMM) to calculate pitch based on tube geometry.
*   **Interactive Design**: Drag-and-drop holes, adjust tube length, bore radius, and wall thickness.
*   **WASM Powered**: computationally intensive acoustics logic runs in WebAssembly for near-native performance.
*   **Import/Export**: Save your designs as JSON or export 3D models (.OBJ) for CAD/rendering.

## Prerequisites

*   **Rust**: [Install Rust](https://www.rust-lang.org/tools/install)
*   **Node.js**: [Install Node.js](https://nodejs.org/) (v20+)
*   **wasm-pack**: `cargo install wasm-pack`

## Development Setup

1.  **Build the WASM Core**:
    ```bash
    cd core
    wasm-pack build --target web
    ```

2.  **Install Web Dependencies**:
    ```bash
    cd ../web
    npm install
    ```

3.  **Run Development Server**:
    ```bash
    npm run dev
    ```
    Open [http://localhost:5173](http://localhost:5173) in your browser.

## Building for Production

To create a production build:

1.  Ensure the WASM module is built:
    ```bash
    cd core && wasm-pack build --target web
    ```
2.  Build the web app:
    ```bash
    cd ../web && npm run build
    ```
    The output will be in `web/dist`.

## Project Structure

*   `core/`: Rust crate containing the physics engine and geometry logic.
*   `web/`: React + TypeScript frontend application.
