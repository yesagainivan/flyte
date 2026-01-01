# Flyte

**Flyte** is a modern acoustic simulation and design tool for flutes. It enables makers and enthusiasts to mathematically design flutes, simulate their pitch, and export 3D models for manufacturing.

## Project Structure

This project is organized as a monorepo containing:

*   **[core/](./core)**: The high-performance physics engine and geometry generator written in **Rust**. It compiles to WebAssembly (WASM) to run in the browser.
*   **[web/](./web)**: The frontend user interface built with **React**, **TypeScript**, and **Vite**. It provides an interactive visualization and controls for the simulation.

## Getting Started

To run the full application locally:

1.  **Build the Core (WASM)**
    ```bash
    cd core
    wasm-pack build --target web
    ```

2.  **Start the Web Interface**
    ```bash
    cd web
    npm install
    npm run dev
    ```

3.  Open browser to `http://localhost:5173`.

## Technologies

*   **Rust** & **wasm-bindgen**: For acoustic physics (Transfer Matrix Method).
*   **React** & **Vite**: For the interactive UI.
*   **SVG**: For real-time 2D visualization.
*   **OBJ**: For 3D model export.
