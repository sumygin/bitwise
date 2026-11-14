# bitwise

An interactive digital logic circuit designer and simulator for building, testing, and visualising combinational and sequential logic diagrams.

## Overview

`bitwise` provides a canvas-based environment for designing logic circuits from fundamental gates up to reusable modular sub-circuits. Built with a focus on clean graph-based signal propagation and deterministic evaluation, it allows users to wire components, toggle inputs in real time, and inspect logic states across complex topologies.

## Features

- **Core Logic Gates:** Support for `AND`, `OR`, `NOT`, `NAND`, `NOR`, `XOR`, and `XNOR` gates.
- **Interactive I/O:** Toggleable binary input switches, clock signal generators, push buttons, and LED/7-segment output displays.
- **Event-Driven Signal Propagation:** Directed graph evaluation engine that updates downstream gate states only when upstream wire signals transition, avoiding redundant full-circuit recomputation.
- **Custom IC / Sub-Circuit Packaging:** Group existing gate networks into reusable black-box integrated circuits with custom pin mappings.
- **Interactive Canvas:** Pan, zoom, snap-to-grid placement, multi-node selection, and orthogonal wire routing.
- **Circuit Serialisation:** Export and import circuit schematics as structured JSON files.

## Architecture & Evaluation Model

1. **Netlist Graph Representation:** Circuits are represented internally as a directed graph $G = (V, E)$, where vertices $V$ represent component pins/gates and edges $E$ represent conductive wire nets.
2. **Propagation Queue:** When an input pin changes state at step $t$, affected downstream nodes are pushed onto an evaluation queue. Cycles (such as SR latches or ring oscillators) are handled using discrete propagation ticks to prevent infinite synchronous loops.
3. **Rendering Pipeline:** Decouples simulation tick frequency from the `requestAnimationFrame` viewport renderer so complex circuits remain responsive at 60 FPS.


## Usage

1. Select logic gates or I/O components from the toolbar and place them onto the grid.
2. Click and drag between output and input pins to route wires.
3. Toggle input switches to observe real-time high (`1`) and low (`0`) signal propagation along the wires.
4. Package selected components into a custom module or export your circuit to JSON.

## Roadmap

- [ ] Truth table generator for combinational sub-circuits
- [ ] Waveform timing diagram inspector
- [ ] Verilog / VHDL netlist export

## License

MIT
