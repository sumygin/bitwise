    /*************************************************************************
     * BITWISE — LOGIC GATE WORKSPACE
     * Pure white background, orthogonal right-angle wires, automatic
     * solder-dot junctions, barycenter auto-layout, multi-tab duplication.
     *************************************************************************/

    const SVG_NS = "http://www.w3.org/2000/svg";
    const STORAGE_KEY = 'logicdraft_workspace_v1';
    let storageWarningShown = false;

    // Gate geometry specifications (matching crisp textbook proportions)
    const GATE_SPECS = {
      INPUT:  { width: 44, height: 30, minInputs: 0, maxInputs: 0, hasOutput: true },
      OUTPUT: { width: 44, height: 30, minInputs: 1, maxInputs: 1, hasOutput: false },
      NOT:    { width: 56, height: 40, minInputs: 1, maxInputs: 1, hasOutput: true },
      AND:    { width: 64, height: 48, minInputs: 2, maxInputs: 4, hasOutput: true },
      NAND:   { width: 72, height: 48, minInputs: 2, maxInputs: 4, hasOutput: true },
      OR:     { width: 66, height: 48, minInputs: 2, maxInputs: 4, hasOutput: true },
      NOR:    { width: 74, height: 48, minInputs: 2, maxInputs: 4, hasOutput: true },
      XOR:    { width: 72, height: 48, minInputs: 2, maxInputs: 4, hasOutput: true },
      XNOR:   { width: 80, height: 48, minInputs: 2, maxInputs: 4, hasOutput: true }
    };

    // Application workspace State
    let workspace = {
      activecircuitId: null,
      circuits: [],
      showGrid: false
    };

    // Viewport pan & zoom per session
    let view = {
      x: 0,
      y: 0,
      scale: 1
    };

    // Undo / Redo stacks (per active circuit)
    let undoStack = [];
    let redoStack = [];

    // Interactive state
    let selectedNodeIds = new Set();
    let selectedWireIds = new Set();

    let interaction = {
      mode: null, // 'DRAG_NODES', 'WIRE_CREATE', 'DRAG_WIRE_SEGMENT', 'MARQUEE', 'PAN'
      startX: 0,
      startY: 0,
      startViewX: 0,
      startViewY: 0,
      nodeStartPositions: new Map(),
      wireSource: null, // { nodeId }
      activeWireDrag: null, // { wireId, trunkGroupWires, startMidX }
      spacePressed: false,
      quickAddPos: { x: 200, y: 200 }
    };

    // DOM references
    const svgEl = document.getElementById('circuit-svg');
    const viewportGroup = document.getElementById('viewport-group');
    const wiresLayer = document.getElementById('wires-layer');
    const junctionsLayer = document.getElementById('junctions-layer');
    const nodesLayer = document.getElementById('nodes-layer');
    const tempWireEl = document.getElementById('temp-wire');
    const marqueeBoxEl = document.getElementById('marquee-box');
    const inspectorEl = document.getElementById('selection-inspector');
    const canvasContainer = document.getElementById('canvas-container');
    const quickAddMenu = document.getElementById('quick-add-menu');
    const truthTableDialog = document.getElementById('truth-table-dialog');
    const truthTableContent = document.getElementById('truth-table-content');
    const truthTableSubtitle = document.getElementById('truth-table-subtitle');

    /*************************************************************************
     * 1. REFERENCE STARTER CIRCUIT (Exact match to user's attached image!)
     *************************************************************************/
    function createreferencecircuit() {
      // Matches the attached image:
      // Inputs on left: A, C1, C0, B
      // Output on right: R
      // Top section, middle section, bottom section with exact trunk vertical drops & solder dots
      return {
        id: 'circuit_' + Date.now() + '_ref',
        name: 'coursework diagram 1',
        nodes: [
          // Left Column Inputs
          { id: 'in_A',  type: 'INPUT',  label: 'A',  x: 65, y: 70,  inputs: 0 },
          { id: 'in_C1', type: 'INPUT',  label: 'C1', x: 65, y: 120, inputs: 0 },
          { id: 'in_C0', type: 'INPUT',  label: 'C0', x: 65, y: 165, inputs: 0 },
          { id: 'in_B',  type: 'INPUT',  label: 'B',  x: 65, y: 350, inputs: 0 },

          // NOT Gates for A, C0, B, and C1
          { id: 'not_A',  type: 'NOT', label: '', x: 215, y: 70,  inputs: 1 },
          { id: 'not_C0', type: 'NOT', label: '', x: 215, y: 275, inputs: 1 },
          { id: 'not_B',  type: 'NOT', label: '', x: 215, y: 350, inputs: 1 },
          { id: 'not_C1', type: 'NOT', label: '', x: 390, y: 235, inputs: 1 },

          // Upper-Middle & Middle AND Gates
          { id: 'and_1', type: 'AND', label: '', x: 625, y: 142, inputs: 2 }, // C1, C0
          { id: 'and_2', type: 'AND', label: '', x: 510, y: 255, inputs: 2 }, // not_C1, not_C0
          { id: 'and_3', type: 'AND', label: '', x: 625, y: 315, inputs: 2 }, // and_2, not_B

          // Upper-Middle OR & Top-Right AND
          { id: 'or_top',      type: 'OR',  label: '', x: 750, y: 168, inputs: 2 }, // and_1, and_3
          { id: 'and_topright',type: 'AND', label: '', x: 845, y: 92,  inputs: 2 }, // not_A, or_top

          // Bottom Section Gates
          { id: 'and_4', type: 'AND', label: '', x: 510, y: 500, inputs: 2 }, // not_C1, A
          { id: 'and_5', type: 'AND', label: '', x: 510, y: 600, inputs: 2 }, // C1, not_A
          { id: 'or_bot1', type: 'OR', label: '', x: 635, y: 522, inputs: 2 }, // and_4, and_5
          { id: 'or_bot2', type: 'OR', label: '', x: 760, y: 478, inputs: 2 }, // C0, or_bot1
          { id: 'and_botright', type: 'AND', label: '', x: 850, y: 420, inputs: 2 }, // B, or_bot2

          // Final Output OR Gate & Output R
          { id: 'or_final', type: 'OR',     label: '',  x: 960, y: 115, inputs: 2 },
          { id: 'out_R',    type: 'OUTPUT', label: 'R', x: 1090, y: 115, inputs: 1 }
        ],
        wires: [
          // Input A wires (trunk at x=125)
          { id: 'w1',  from: 'in_A',  to: 'not_A',        toPin: 0, midX: 125 },
          { id: 'w2',  from: 'in_A',  to: 'and_4',        toPin: 1, midX: 125 },

          // Output of NOT_A wires (trunk at x=295)
          { id: 'w3',  from: 'not_A', to: 'and_topright', toPin: 0, midX: 295 },
          { id: 'w4',  from: 'not_A', to: 'and_5',        toPin: 1, midX: 295 },

          // Input C1 wires (trunk at x=320)
          { id: 'w5',  from: 'in_C1', to: 'and_1',        toPin: 0, midX: 320 },
          { id: 'w6',  from: 'in_C1', to: 'not_C1',       toPin: 0, midX: 320 },
          { id: 'w7',  from: 'in_C1', to: 'and_5',        toPin: 0, midX: 320 },

          // Output of NOT_C1 wires (trunk at x=460)
          { id: 'w8',  from: 'not_C1', to: 'and_2',       toPin: 0, midX: 460 },
          { id: 'w9',  from: 'not_C1', to: 'and_4',       toPin: 0, midX: 460 },

          // Input C0 wires (trunk at x=150)
          { id: 'w10', from: 'in_C0', to: 'and_1',        toPin: 1, midX: 150 },
          { id: 'w11', from: 'in_C0', to: 'not_C0',       toPin: 0, midX: 150 },
          { id: 'w12', from: 'in_C0', to: 'or_bot2',      toPin: 0, midX: 150 },

          // Output of NOT_C0 wire
          { id: 'w13', from: 'not_C0', to: 'and_2',       toPin: 1, midX: 350 },

          // Input B wires (trunk at x=180)
          { id: 'w14', from: 'in_B',  to: 'not_B',        toPin: 0, midX: 180 },
          { id: 'w15', from: 'in_B',  to: 'and_botright', toPin: 0, midX: 180 },

          // Output of NOT_B wire
          { id: 'w16', from: 'not_B', to: 'and_3',        toPin: 1, midX: 400 },

          // Intermediate upper/middle gates
          { id: 'w17', from: 'and_2',  to: 'and_3',        toPin: 0, midX: 575 },
          { id: 'w18', from: 'and_1',  to: 'or_top',       toPin: 0, midX: 690 },
          { id: 'w19', from: 'and_3',  to: 'or_top',       toPin: 1, midX: 695 },
          { id: 'w20', from: 'or_top', to: 'and_topright', toPin: 1, midX: 798 },
          { id: 'w21', from: 'and_topright', to: 'or_final', toPin: 0, midX: 905 },

          // Intermediate bottom gates
          { id: 'w22', from: 'and_4',   to: 'or_bot1',      toPin: 0, midX: 575 },
          { id: 'w23', from: 'and_5',   to: 'or_bot1',      toPin: 1, midX: 575 },
          { id: 'w24', from: 'or_bot1', to: 'or_bot2',      toPin: 1, midX: 702 },
          { id: 'w25', from: 'or_bot2', to: 'and_botright', toPin: 1, midX: 808 },
          { id: 'w26', from: 'and_botright', to: 'or_final', toPin: 1, midX: 912 },

          // Final output R
          { id: 'w27', from: 'or_final', to: 'out_R',       toPin: 0, midX: 1025 }
        ]
      };
    }

    /*************************************************************************
     * 2. ACTIVE CIRCUIT HELPERS & HISTORY (UNDO / REDO)
     *************************************************************************/
    function getActivecircuit() {
      return workspace.circuits.find(c => c.id === workspace.activecircuitId) || workspace.circuits[0];
    }

    // Tabs are either logic circuits (default) or database diagrams (kind: 'db').
    function tabKind(tab) {
      return tab && tab.kind === 'db' ? 'db' : 'circuit';
    }

    function isDbActive() {
      return tabKind(getActivecircuit()) === 'db';
    }

    function activateTab(id) {
      workspace.activecircuitId = id;
      selectedNodeIds.clear();
      selectedWireIds.clear();
      undoStack = [];
      redoStack = [];
      updateUndoRedoButtons();
      renderAll();
      if (!isDbActive()) fitViewToDiagram();
      saveToStorage();
    }

    function switchMode(mode) {
      const current = getActivecircuit();
      if (tabKind(current) === mode) return;
      const key = mode === 'db' ? 'lastDbTabId' : 'lastCircuitTabId';
      const candidate = workspace.circuits.find(c => c.id === workspace[key] && tabKind(c) === mode)
        || workspace.circuits.find(c => tabKind(c) === mode);
      if (candidate) {
        activateTab(candidate.id);
      } else if (mode === 'db') {
        createNewDbTab();
      } else {
        createNewBlankcircuitTab();
      }
    }

    function createNewDbTab() {
      const count = workspace.circuits.filter(c => tabKind(c) === 'db').length;
      const tab = DB.newDiagram(`database ${count + 1}`);
      workspace.circuits.push(tab);
      activateTab(tab.id);
    }

    function saveToStorage() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      } catch (error) {
        console.warn('Could not save Bitwise workspace to localStorage.', error);
        if (!storageWarningShown) {
          storageWarningShown = true;
          showToast('Could not save changes in this browser');
        }
      }
    }

    function pushUndoState() {
      const circuit = getActivecircuit();
      if (!circuit) return;
      undoStack.push(JSON.stringify({ nodes: circuit.nodes, wires: circuit.wires }));
      if (undoStack.length > 50) undoStack.shift();
      redoStack = [];
      updateUndoRedoButtons();
    }

    function undo() {
      if (isDbActive()) { DB.undo(); return; }
      if (undoStack.length === 0) return;
      const circuit = getActivecircuit();
      redoStack.push(JSON.stringify({ nodes: circuit.nodes, wires: circuit.wires }));
      const prev = JSON.parse(undoStack.pop());
      circuit.nodes = prev.nodes;
      circuit.wires = prev.wires;
      selectedNodeIds.clear();
      selectedWireIds.clear();
      updateUndoRedoButtons();
      renderAll();
      saveToStorage();
    }

    function redo() {
      if (isDbActive()) { DB.redo(); return; }
      if (redoStack.length === 0) return;
      const circuit = getActivecircuit();
      undoStack.push(JSON.stringify({ nodes: circuit.nodes, wires: circuit.wires }));
      const next = JSON.parse(redoStack.pop());
      circuit.nodes = next.nodes;
      circuit.wires = next.wires;
      selectedNodeIds.clear();
      selectedWireIds.clear();
      updateUndoRedoButtons();
      renderAll();
      saveToStorage();
    }

    function updateUndoRedoButtons() {
      document.getElementById('btn-undo').disabled = undoStack.length === 0;
      document.getElementById('btn-redo').disabled = redoStack.length === 0;
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.style.opacity = '1';
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => {
        toast.style.opacity = '0';
      }, 2100);
    }

    function evaluateTruthTable(circuit) {
      const nodeMap = new Map(circuit.nodes.map(node => [node.id, node]));
      const incoming = new Map(circuit.nodes.map(node => [node.id, []]));
      for (const wire of circuit.wires) {
        if (incoming.has(wire.to) && nodeMap.has(wire.from)) incoming.get(wire.to).push(wire);
      }

      const inputs = circuit.nodes.filter(node => node.type === 'INPUT').sort((a, b) => a.y - b.y || a.x - b.x);
      const outputs = circuit.nodes.filter(node => node.type === 'OUTPUT').sort((a, b) => a.y - b.y || a.x - b.x);
      if (!inputs.length || !outputs.length) throw new Error('Add at least one input and one output terminal first.');

      const makeHeaders = (nodes, prefix, used) => nodes.map((node, index) => {
        const base = ((node.label || `${prefix}${index + 1}`).trim() || `${prefix}${index + 1}`).toUpperCase();
        const count = (used.get(base) || 0) + 1;
        used.set(base, count);
        return count === 1 ? base : `${base}${count}`;
      });
      const usedLabels = new Map();
      const inputHeaders = makeHeaders(inputs, 'I', usedLabels);
      const outputHeaders = makeHeaders(outputs, 'O', usedLabels);
      const rows = [];

      for (let mask = 0; mask < 2 ** inputs.length; mask++) {
        const values = new Map(inputs.map((node, index) => [
          node.id,
          Boolean(mask & (1 << (inputs.length - index - 1)))
        ]));
        const visiting = new Set();

        function evaluateNode(nodeId) {
          if (values.has(nodeId)) return values.get(nodeId);
          if (visiting.has(nodeId)) throw new Error('The circuit contains a feedback loop.');
          const node = nodeMap.get(nodeId);
          if (!node) throw new Error('The circuit contains a missing connection.');
          visiting.add(nodeId);

          const wires = (incoming.get(nodeId) || []).slice().sort((a, b) => (a.toPin || 0) - (b.toPin || 0));
          const pinCount = node.inputs || GATE_SPECS[node.type]?.minInputs || 1;
          const pinValues = [];
          for (let pin = 0; pin < pinCount; pin++) {
            const wire = wires.find(candidate => (candidate.toPin || 0) === pin);
            if (!wire) throw new Error(`${node.type} "${node.label || node.id}" has an unconnected input.`);
            pinValues.push(evaluateNode(wire.from));
          }

          let result;
          switch (node.type) {
            case 'NOT': result = !pinValues[0]; break;
            case 'AND': result = pinValues.every(Boolean); break;
            case 'NAND': result = !pinValues.every(Boolean); break;
            case 'OR': result = pinValues.some(Boolean); break;
            case 'NOR': result = !pinValues.some(Boolean); break;
            case 'XOR': result = pinValues.filter(Boolean).length % 2 === 1; break;
            case 'XNOR': result = pinValues.filter(Boolean).length % 2 === 0; break;
            case 'OUTPUT': result = pinValues[0]; break;
            default: throw new Error(`Unsupported node type: ${node.type}.`);
          }
          visiting.delete(nodeId);
          values.set(nodeId, result);
          return result;
        }

        rows.push({
          inputs: inputs.map(node => values.get(node.id)),
          outputs: outputs.map(node => evaluateNode(node.id))
        });
      }
      return { inputHeaders, outputHeaders, rows };
    }

    function showTruthTable() {
      const circuit = getActivecircuit();
      if (!circuit) return;
      try {
        const result = evaluateTruthTable(circuit);
        truthTableSubtitle.textContent = `${circuit.name} · ${result.rows.length} input combinations`;
        truthTableContent.innerHTML = '';

        const table = document.createElement('table');
        table.className = 'w-full text-sm border-collapse';
        const headers = [...result.inputHeaders, ...result.outputHeaders];
        const thead = document.createElement('thead');
        thead.className = 'bg-slate-50 text-slate-700';
        const headerRow = document.createElement('tr');
        headers.forEach((header, index) => {
          const cell = document.createElement('th');
          cell.className = `px-3 py-2 text-left font-semibold border-b-2 border-slate-300 ${index === result.inputHeaders.length ? 'border-l-2 border-l-violet-200' : ''}`;
          cell.textContent = header;
          headerRow.appendChild(cell);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        result.rows.forEach(row => {
          const tr = document.createElement('tr');
          tr.className = 'hover:bg-violet-50/50';
          [...row.inputs, ...row.outputs].forEach((value, index) => {
            const cell = document.createElement('td');
            cell.className = `px-3 py-2 border-b border-slate-100 font-mono ${index === result.inputHeaders.length ? 'border-l-2 border-l-violet-100' : ''} ${value ? 'text-emerald-700' : 'text-slate-500'}`;
            cell.textContent = value ? '1' : '0';
            tr.appendChild(cell);
          });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        truthTableContent.appendChild(table);
        truthTableDialog.classList.remove('hidden');
      } catch (error) {
        showToast(error.message);
      }
    }

    /*************************************************************************
     * 3. PIN POSITION CALCULATIONS & IEEE GATE SVG GEOMETRY
     *************************************************************************/
    function getNodeSpec(node) {
      return GATE_SPECS[node.type] || GATE_SPECS.AND;
    }

    /**
     * Returns input pin coordinates in world space for a node and pin index.
     * Note: node.x, node.y is the center of the node!
     */
    function getInputPinPos(node, pinIndex) {
      const spec = getNodeSpec(node);
      const count = node.inputs || spec.minInputs || 1;
      if (node.type === 'OUTPUT') {
        return { x: node.x - 18, y: node.y };
      }
      if (node.type === 'NOT') {
        return { x: node.x - 24, y: node.y };
      }
      // Distribute pins evenly along the vertical span of the gate's left side
      const span = count === 2 ? 22 : (count === 3 ? 28 : 34);
      const offsetY = count === 1 ? 0 : -span / 2 + (span * pinIndex) / (count - 1);

      // For OR/NOR/XOR/XNOR, the back curve bows inward slightly near the middle
      let leftX = node.x - spec.width / 2;
      return { x: leftX, y: Math.round(node.y + offsetY) };
    }

    /**
     * Returns output pin coordinate in world space for a node.
     */
    function getOutputPinPos(node) {
      const spec = getNodeSpec(node);
      if (node.type === 'INPUT') {
        return { x: node.x + 18, y: node.y };
      }
      if (node.type === 'NOT') {
        return { x: node.x + 25, y: node.y };
      }
      return { x: node.x + spec.width / 2, y: node.y };
    }

    /**
     * Creates textbook IEEE SVG inner elements for a node centered at (0, 0).
     */
    function buildNodeGraphicSVG(node) {
      const g = document.createElementNS(SVG_NS, 'g');
      const spec = getNodeSpec(node);
      const w = spec.width;
      const h = spec.height;
      const count = node.inputs || spec.minInputs || 1;

      if (node.type === 'INPUT') {
        // Textbook serif label on left + short horizontal lead stub to output pin at +18
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', '2');
        text.setAttribute('y', '7');
        text.setAttribute('text-anchor', 'end');
        text.setAttribute('font-family', "'Newsreader', 'Times New Roman', Georgia, serif");
        text.setAttribute('font-size', '22');
        text.setAttribute('fill', '#000000');
        text.textContent = (node.label || 'A').toUpperCase();
        g.appendChild(text);

        const stub = document.createElementNS(SVG_NS, 'line');
        stub.setAttribute('x1', '10');
        stub.setAttribute('y1', '0');
        stub.setAttribute('x2', '18');
        stub.setAttribute('y2', '0');
        stub.setAttribute('stroke', '#000000');
        stub.setAttribute('stroke-width', '1.8');
        g.appendChild(stub);
        return g;
      }

      if (node.type === 'OUTPUT') {
        // Short horizontal lead stub from -18 + textbook serif label on right
        const stub = document.createElementNS(SVG_NS, 'line');
        stub.setAttribute('x1', '-18');
        stub.setAttribute('y1', '0');
        stub.setAttribute('x2', '-8');
        stub.setAttribute('y2', '0');
        stub.setAttribute('stroke', '#000000');
        stub.setAttribute('stroke-width', '1.8');
        g.appendChild(stub);

        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', '0');
        text.setAttribute('y', '7');
        text.setAttribute('text-anchor', 'start');
        text.setAttribute('font-family', "'Newsreader', 'Times New Roman', Georgia, serif");
        text.setAttribute('font-size', '22');
        text.setAttribute('fill', '#000000');
        text.textContent = (node.label || 'R').toUpperCase();
        g.appendChild(text);
        return g;
      }

      if (node.type === 'NOT') {
        // Triangle from x=-24 to x=15, height 34, plus inversion circle at x=19.5, r=4.5
        const tri = document.createElementNS(SVG_NS, 'polygon');
        tri.setAttribute('points', '-24,-17 -24,17 15,0');
        tri.setAttribute('fill', '#ffffff');
        tri.setAttribute('stroke', '#000000');
        tri.setAttribute('stroke-width', '2.1');
        tri.setAttribute('stroke-linejoin', 'miter');
        g.appendChild(tri);

        const bubble = document.createElementNS(SVG_NS, 'circle');
        bubble.setAttribute('cx', '20');
        bubble.setAttribute('cy', '0');
        bubble.setAttribute('r', '4.3');
        bubble.setAttribute('fill', '#ffffff');
        bubble.setAttribute('stroke', '#000000');
        bubble.setAttribute('stroke-width', '2.1');
        g.appendChild(bubble);

        if (node.label) {
          const lbl = document.createElementNS(SVG_NS, 'text');
          lbl.setAttribute('x', '-7');
          lbl.setAttribute('y', '4');
          lbl.setAttribute('text-anchor', 'middle');
          lbl.setAttribute('font-family', "'Inter', sans-serif");
          lbl.setAttribute('font-size', '10');
          lbl.setAttribute('font-weight', '600');
          lbl.setAttribute('fill', '#334155');
          lbl.textContent = node.label;
          g.appendChild(lbl);
        }
        return g;
      }

      // For OR/NOR/XOR/XNOR, add short input lead extensions so wires meet the curved back cleanly
      const span = count === 2 ? 22 : (count === 3 ? 28 : 34);
      const isCurvedBack = ['OR', 'NOR', 'XOR', 'XNOR'].includes(node.type);
      const isXor = ['XOR', 'XNOR'].includes(node.type);
      const hasBubble = ['NAND', 'NOR', 'XNOR'].includes(node.type);

      if (isCurvedBack) {
        for (let i = 0; i < count; i++) {
          const py = count === 1 ? 0 : -span / 2 + (span * i) / (count - 1);
          const lead = document.createElementNS(SVG_NS, 'line');
          lead.setAttribute('x1', -w / 2);
          lead.setAttribute('y1', py);
          lead.setAttribute('x2', -w / 2 + (isXor ? 11 : 6));
          lead.setAttribute('y2', py);
          lead.setAttribute('stroke', '#000000');
          lead.setAttribute('stroke-width', '1.8');
          g.appendChild(lead);
        }
      }

      // Build Gate Body Path
      if (node.type === 'AND' || node.type === 'NAND') {
        const leftX = -w / 2;
        const bodyRight = hasBubble ? w / 2 - 9 : w / 2;
        const arcStart = bodyRight - 22;
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute(
          'd',
          `M ${leftX},-22 L ${arcStart},-22 A 22,22 0 0,1 ${arcStart},22 L ${leftX},22 Z`
        );
        path.setAttribute('fill', '#ffffff');
        path.setAttribute('stroke', '#000000');
        path.setAttribute('stroke-width', '2.1');
        path.setAttribute('stroke-linejoin', 'round');
        g.appendChild(path);

        if (hasBubble) {
          const bubble = document.createElementNS(SVG_NS, 'circle');
          bubble.setAttribute('cx', w / 2 - 4.5);
          bubble.setAttribute('cy', '0');
          bubble.setAttribute('r', '4.3');
          bubble.setAttribute('fill', '#ffffff');
          bubble.setAttribute('stroke', '#000000');
          bubble.setAttribute('stroke-width', '2.1');
          g.appendChild(bubble);
        }
      } else if (isCurvedBack) {
        const leftBase = -w / 2 + (isXor ? 6 : 0);
        const tipX = hasBubble ? w / 2 - 9 : w / 2;

        if (isXor) {
          const extraArc = document.createElementNS(SVG_NS, 'path');
          const arcX = -w / 2;
          extraArc.setAttribute(
            'd',
            `M ${arcX},-22 C ${arcX + 9},-10 ${arcX + 9},10 ${arcX},22`
          );
          extraArc.setAttribute('fill', 'none');
          extraArc.setAttribute('stroke', '#000000');
          extraArc.setAttribute('stroke-width', '2.1');
          extraArc.setAttribute('stroke-linecap', 'round');
          g.appendChild(extraArc);
        }

        const orBody = document.createElementNS(SVG_NS, 'path');
        orBody.setAttribute(
          'd',
          `M ${leftBase},-22 C ${leftBase + 18},-22 ${tipX - 14},-15 ${tipX},0 C ${tipX - 14},15 ${leftBase + 18},22 ${leftBase},22 C ${leftBase + 10},10 ${leftBase + 10},-10 ${leftBase},-22 Z`
        );
        orBody.setAttribute('fill', '#ffffff');
        orBody.setAttribute('stroke', '#000000');
        orBody.setAttribute('stroke-width', '2.1');
        orBody.setAttribute('stroke-linejoin', 'round');
        g.appendChild(orBody);

        if (hasBubble) {
          const bubble = document.createElementNS(SVG_NS, 'circle');
          bubble.setAttribute('cx', w / 2 - 4.5);
          bubble.setAttribute('cy', '0');
          bubble.setAttribute('r', '4.3');
          bubble.setAttribute('fill', '#ffffff');
          bubble.setAttribute('stroke', '#000000');
          bubble.setAttribute('stroke-width', '2.1');
          g.appendChild(bubble);
        }
      }

      // Optional subtle gate text label if user set one on a gate
      if (node.label) {
        const lbl = document.createElementNS(SVG_NS, 'text');
        lbl.setAttribute('x', '-2');
        lbl.setAttribute('y', '4');
        lbl.setAttribute('text-anchor', 'middle');
        lbl.setAttribute('font-family', "'Inter', sans-serif");
        lbl.setAttribute('font-size', '11');
        lbl.setAttribute('font-weight', '600');
        lbl.setAttribute('fill', '#334155');
        lbl.textContent = node.label;
        g.appendChild(lbl);
      }

      return g;
    }

    /*************************************************************************
     * 4. ORTHOGONAL WIRE ROUTING & AUTOMATIC SOLDER-DOT JUNCTIONS
     *************************************************************************/
    /**
     * Computes the orthogonal path points for a wire:
     * p1 (source output pin) -> (midX, p1.y) -> (midX, p2.y) -> p2 (target input pin)
     * If p2 is behind p1 (feedback loop), routes cleanly around.
     */
    function computeWirePoints(wire, nodeMap) {
      const fromNode = nodeMap.get(wire.from);
      const toNode = nodeMap.get(wire.to);
      if (!fromNode || !toNode) return null;

      const p1 = getOutputPinPos(fromNode);
      const p2 = getInputPinPos(toNode, wire.toPin || 0);

      // Determine vertical channel X (midX)
      let midX = typeof wire.midX === 'number' ? wire.midX : Math.round((p1.x + p2.x) / 2);

      const horizontalPathBlocked = Array.from(nodeMap.values())
        .filter(node => node.id !== fromNode.id && node.id !== toNode.id)
        .some(node => {
          const spec = getNodeSpec(node);
          return (
            node.x + spec.width / 2 + 8 > p1.x &&
            node.x - spec.width / 2 - 8 < p2.x &&
            node.y - spec.height / 2 - 8 < p1.y &&
            node.y + spec.height / 2 + 8 > p1.y
          );
        });

      // If straight horizontal line (within 1.5px vertically and p2 is to the right of p1)
      if (Math.abs(p1.y - p2.y) <= 1.5 && p2.x >= p1.x && !horizontalPathBlocked) {
        return {
          p1,
          p2: { x: p2.x, y: p1.y },
          midX,
          points: [p1, { x: p2.x, y: p1.y }]
        };
      }

      // For long connections, route the horizontal run through a clear lane.
      // Without this, a perfectly valid orthogonal route can still pass
      // through gates in columns between the source and destination.
      const targetSpec = getNodeSpec(toNode);
      const targetChannelX = p2.x - targetSpec.width / 2 - 14;
      if (targetChannelX > midX + 8) {
        const obstacles = Array.from(nodeMap.values())
          .filter(node => node.id !== fromNode.id && node.id !== toNode.id)
          .map(node => {
            const spec = getNodeSpec(node);
            return {
              left: node.x - spec.width / 2 - 8,
              right: node.x + spec.width / 2 + 8,
              top: node.y - spec.height / 2 - 8,
              bottom: node.y + spec.height / 2 + 8
            };
          });

        const laneCandidates = [p1.y, p2.y];
        for (const obstacle of obstacles) {
          laneCandidates.push(obstacle.top - 1, obstacle.bottom + 1);
        }
        laneCandidates.push(
          Math.min(...Array.from(nodeMap.values()).map(node => node.y)) - 30,
          Math.max(...Array.from(nodeMap.values()).map(node => node.y)) + 30
        );

        const laneIsclear = (laneY) => !obstacles.some(obstacle =>
          obstacle.right > midX &&
          obstacle.left < targetChannelX &&
          laneY > obstacle.top &&
          laneY < obstacle.bottom
        );
        const clearLanes = laneCandidates
          .filter((laneY, index, lanes) => lanes.indexOf(laneY) === index)
          .filter(laneIsclear)
          .sort((a, b) =>
            (Math.abs(a - p1.y) + Math.abs(a - p2.y)) -
            (Math.abs(b - p1.y) + Math.abs(b - p2.y))
          );
        const laneY = clearLanes[0];

        if (typeof laneY === 'number') {
          return {
            p1,
            p2,
            midX,
            points: [
              p1,
              { x: midX, y: p1.y },
              { x: midX, y: laneY },
              { x: targetChannelX, y: laneY },
              { x: targetChannelX, y: p2.y },
              p2
            ]
          };
        }
      }

      return {
        p1,
        p2,
        midX,
        points: [
          p1,
          { x: midX, y: p1.y },
          { x: midX, y: p2.y },
          p2
        ]
      };
    }

    /**
     * Automatically computes textbook solder-dot junction coordinates where wires from the
     * SAME output pin branch off a horizontal or vertical trunk line!
     */
    function computeSolderJunctions(wires, nodeMap) {
      const junctions = [];
      const bySource = new Map();

      for (const w of wires) {
        const pts = computeWirePoints(w, nodeMap);
        if (!pts) continue;
        if (!bySource.has(w.from)) bySource.set(w.from, []);
        bySource.get(w.from).push({ wire: w, pts });
      }

      // For every source that drives 2 or more destinations:
      for (const [sourceId, items] of bySource.entries()) {
        if (items.length < 2) continue;

        // Collect all orthogonal segments for this net
        const hSegs = []; // { y, x1, x2 }
        const vSegs = []; // { x, y1, y2 }

        for (const item of items) {
          const p = item.pts.points;
          for (let i = 0; i < p.length - 1; i++) {
            const a = p[i];
            const b = p[i + 1];
            if (Math.abs(a.y - b.y) < 1 && Math.abs(a.x - b.x) > 1) {
              hSegs.push({ y: a.y, x1: Math.min(a.x, b.x), x2: Math.max(a.x, b.x) });
            } else if (Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) > 1) {
              vSegs.push({ x: a.x, y1: Math.min(a.y, b.y), y2: Math.max(a.y, b.y) });
            }
          }
        }

        // Merge collinear overlapping segments so shared trunks become one continuous segment
        const mergedH = mergeSegments1D(hSegs, 'y', 'x1', 'x2');
        const mergedV = mergeSegments1D(vSegs, 'x', 'y1', 'y2');

        // A T-junction or 4-way branch occurs wherever a merged H segment and merged V segment intersect
        // AND at least 3 directions continue from that intersection point!
        for (const h of mergedH) {
          for (const v of mergedV) {
            if (v.x >= h.x1 - 1 && v.x <= h.x2 + 1 && h.y >= v.y1 - 1 && h.y <= v.y2 + 1) {
              const ix = v.x;
              const iy = h.y;
              let branches = 0;
              if (ix - h.x1 > 2) branches++; // goes left
              if (h.x2 - ix > 2) branches++; // goes right
              if (iy - v.y1 > 2) branches++; // goes up
              if (v.y2 - iy > 2) branches++; // goes down

              if (branches >= 3) {
                junctions.push({ x: ix, y: iy });
              }
            }
          }
        }
      }

      return junctions;
    }

    function mergeSegments1D(segs, fixedKey, minKey, maxKey) {
      const groups = new Map();
      for (const s of segs) {
        const k = Math.round(s[fixedKey]);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push({ min: s[minKey], max: s[maxKey] });
      }
      const result = [];
      for (const [k, intervals] of groups.entries()) {
        intervals.sort((a, b) => a.min - b.min);
        let cur = { ...intervals[0] };
        for (let i = 1; i < intervals.length; i++) {
          if (intervals[i].min <= cur.max + 2) {
            cur.max = Math.max(cur.max, intervals[i].max);
          } else {
            result.push({ [fixedKey]: k, [minKey]: cur.min, [maxKey]: cur.max });
            cur = { ...intervals[i] };
          }
        }
        result.push({ [fixedKey]: k, [minKey]: cur.min, [maxKey]: cur.max });
      }
      return result;
    }

    /*************************************************************************
     * 5. SMART AUTO-LAYOUT ENGINE ("Auto Arrange")
     *************************************************************************/
    function autoArrangecircuit() {
      const circuit = getActivecircuit();
      if (!circuit || circuit.nodes.length === 0) return;
      pushUndoState();

      const nodes = circuit.nodes;
      const wires = circuit.wires;
      const nodeMap = new Map(nodes.map(n => [n.id, n]));

      // 1. Assign topological columns (levels) from left to right
      const levelMap = new Map();
      const incomingMap = new Map();
      const outgoingMap = new Map();

      for (const n of nodes) {
        incomingMap.set(n.id, []);
        outgoingMap.set(n.id, []);
        if (n.type === 'INPUT') {
          levelMap.set(n.id, 0);
        }
      }

      for (const w of wires) {
        if (nodeMap.has(w.from) && nodeMap.has(w.to) && w.from !== w.to) {
          incomingMap.get(w.to).push(w.from);
          outgoingMap.get(w.from).push(w.to);
        }
      }

      // Compute longest path level for gates
      const visited = new Set();
      function computeLevel(nodeId, stack = new Set()) {
        if (levelMap.has(nodeId)) return levelMap.get(nodeId);
        if (stack.has(nodeId)) return 1; // break cycle
        stack.add(nodeId);

        const preds = incomingMap.get(nodeId) || [];
        let maxPredLevel = 0;
        for (const pId of preds) {
          maxPredLevel = Math.max(maxPredLevel, computeLevel(pId, stack));
        }
        const lvl = preds.length === 0 ? 1 : maxPredLevel + 1;
        levelMap.set(nodeId, lvl);
        stack.delete(nodeId);
        return lvl;
      }

      for (const n of nodes) {
        if (n.type !== 'INPUT' && n.type !== 'OUTPUT') {
          computeLevel(n.id);
        }
      }

      // Find max gate level so OUTPUT nodes sit in the rightmost column
      let maxGateLevel = 1;
      for (const [id, lvl] of levelMap.entries()) {
        maxGateLevel = Math.max(maxGateLevel, lvl);
      }

      for (const n of nodes) {
        if (n.type === 'OUTPUT') {
          levelMap.set(n.id, maxGateLevel + 1);
        }
      }

      // Group nodes by column
      const maxCol = maxGateLevel + 1;
      const columns = Array.from({ length: maxCol + 1 }, () => []);
      for (const n of nodes) {
        const c = levelMap.get(n.id) ?? 1;
        columns[c].push(n);
      }

      // Initial sort within each column by current Y so user's top-to-bottom intent is preserved
      for (const col of columns) {
        col.sort((a, b) => a.y - b.y);
      }

      // 2. Assign compact coordinates. Input order is the visual anchor;
      // downstream nodes follow the median Y of their predecessors. A single
      // pass avoids the vertical drift caused by repeatedly re-spacing columns.
      const startX = 80;
      const colSpacing = 158;
      const minGapY = 62;

      for (let c = 0; c <= maxCol; c++) {
        const col = columns[c];
        if (col.length === 0) continue;
        const colX = startX + c * colSpacing;

        if (c === 0) {
          col.sort((a, b) => a.y - b.y);
          col.forEach((n, i) => {
            n.x = colX;
            n.y = 70 + i * minGapY;
          });
          continue;
        }

        const positioned = col.map(n => {
          const preds = incomingMap.get(n.id) || [];
          const neighborYs = preds
            .map(id => nodeMap.get(id))
            .filter(Boolean)
            .map(node => node.y)
            .sort((a, b) => a - b);
          const desiredY = neighborYs.length
            ? neighborYs[Math.floor(neighborYs.length / 2)]
            : n.y;
          return { node: n, desiredY };
        }).sort((a, b) => a.desiredY - b.desiredY);

        let previousY = 70 - minGapY;
        for (const item of positioned) {
          item.node.x = colX;
          item.node.y = Math.max(item.desiredY, previousY + minGapY);
          previousY = item.node.y;
        }
      }

      // 3. Route vertical channels through the gap between columns. Never place
      // a trunk relative to the source pin: that can put it inside a wide gate
      // in the source column or directly over a gate in the next column.
      // Group wires by source node so wires from the same source share a trunk midX (creating solder dots!)
      const wiresBySource = new Map();
      for (const w of wires) {
        if (!wiresBySource.has(w.from)) wiresBySource.set(w.from, []);
        wiresBySource.get(w.from).push(w);
      }

      const maxHalfWidthByColumn = new Map();
      for (let c = 0; c <= maxCol; c++) {
        maxHalfWidthByColumn.set(
          c,
          Math.max(0, ...columns[c].map(node => getNodeSpec(node).width / 2))
        );
      }

      // Track channels used in each gap between columns. Channels are packed
      // from the source side, leaving a clearance before the next column.
      const channelIndexByColumn = new Map();
      for (const [sourceId, sWires] of wiresBySource.entries()) {
        const srcNode = nodeMap.get(sourceId);
        if (!srcNode) continue;

        const srcCol = levelMap.get(sourceId) ?? 0;
        const slot = (channelIndexByColumn.get(srcCol) || 0);
        channelIndexByColumn.set(srcCol, slot + 1);

        const sourceColumnX = startX + srcCol * colSpacing;
        const sourceHalfWidth = maxHalfWidthByColumn.get(srcCol) || 0;
        const nextColumn = Math.min(srcCol + 1, maxCol);
        const nextColumnX = startX + nextColumn * colSpacing;
        const nextHalfWidth = maxHalfWidthByColumn.get(nextColumn) || 0;
        const gapStart = sourceColumnX + sourceHalfWidth + 14;
        const gapEnd = nextColumnX - nextHalfWidth - 14;
        const preferredTrunkX = gapStart + slot * 12;
        const trunkX = Math.min(preferredTrunkX, gapEnd);

        for (const w of sWires) {
          w.midX = trunkX;
        }
      }

      renderAll();
      fitViewToDiagram();
      saveToStorage();
      showToast('Cleaned circuit with horizontal-first wiring');
    }

    /*************************************************************************
     * 6. RENDERING PIPELINE (SVG)
     *************************************************************************/
    function renderAll() {
      renderTabs();
      const circuit = getActivecircuit();
      if (!circuit) return;

      if (tabKind(circuit) === 'db') {
        workspace.lastDbTabId = circuit.id;
        DB.show(circuit);
        return;
      }
      workspace.lastCircuitTabId = circuit.id;
      if (typeof DB !== 'undefined') DB.hide();

      const nodeMap = new Map(circuit.nodes.map(n => [n.id, n]));

      // Update viewport transform
      viewportGroup.setAttribute('transform', `translate(${view.x}, ${view.y}) scale(${view.scale})`);
      document.getElementById('zoom-label').textContent = `${Math.round(view.scale * 100)}%`;

      // 1. Render Wires
      wiresLayer.innerHTML = '';
      for (const wire of circuit.wires) {
        const route = computeWirePoints(wire, nodeMap);
        if (!route) continue;

        const wg = document.createElementNS(SVG_NS, 'g');
        wg.setAttribute('class', `wire-group cursor-pointer ${selectedWireIds.has(wire.id) ? 'selected' : ''}`);
        wg.dataset.wireId = wire.id;

        const d = route.points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`).join(' ');

        // Invisible wide hit path for easy clicking/dragging
        const hitPath = document.createElementNS(SVG_NS, 'path');
        hitPath.setAttribute('d', d);
        hitPath.setAttribute('fill', 'none');
        hitPath.setAttribute('stroke', 'transparent');
        hitPath.setAttribute('stroke-width', '12');
        wg.appendChild(hitPath);

        // Crisp black visible wire path
        const visPath = document.createElementNS(SVG_NS, 'path');
        visPath.setAttribute('d', d);
        visPath.setAttribute('class', 'wire-visible transition-colors');
        visPath.setAttribute('fill', 'none');
        visPath.setAttribute('stroke', '#000000');
        visPath.setAttribute('stroke-width', '1.8');
        visPath.setAttribute('stroke-linejoin', 'miter');
        visPath.setAttribute('stroke-linecap', 'square');
        wg.appendChild(visPath);

        // If wire has a vertical segment (4 points), add a subtle drag handle on the vertical segment
        if (route.points.length === 4) {
          const vMidY = (route.points[1].y + route.points[2].y) / 2;
          const handle = document.createElementNS(SVG_NS, 'rect');
          handle.setAttribute('class', 'wire-handle opacity-0 hover:opacity-100 transition-opacity cursor-ew-resize');
          handle.setAttribute('x', route.midX - 4);
          handle.setAttribute('y', vMidY - 8);
          handle.setAttribute('width', '8');
          handle.setAttribute('height', '16');
          handle.setAttribute('rx', '3');
          handle.setAttribute('fill', '#2563eb');
          wg.appendChild(handle);
        }

        wiresLayer.appendChild(wg);
      }

      // 2. Render Automatic Solder-Dot Junctions
      junctionsLayer.innerHTML = '';
      const junctions = computeSolderJunctions(circuit.wires, nodeMap);
      for (const j of junctions) {
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', j.x);
        dot.setAttribute('cy', j.y);
        dot.setAttribute('r', '3.3');
        dot.setAttribute('fill', '#000000');
        junctionsLayer.appendChild(dot);
      }

      // 3. Render Nodes (Gates, Inputs, Outputs)
      nodesLayer.innerHTML = '';
      for (const node of circuit.nodes) {
        const spec = getNodeSpec(node);
        const ng = document.createElementNS(SVG_NS, 'g');
        const isSelected = selectedNodeIds.has(node.id);
        ng.setAttribute('class', `node-group cursor-grab active:cursor-grabbing ${isSelected ? 'selected' : ''}`);
        ng.setAttribute('transform', `translate(${node.x}, ${node.y})`);
        ng.dataset.nodeId = node.id;

        // selection halo (hidden during screenshots)
        const halo = document.createElementNS(SVG_NS, 'rect');
        const hw = spec.width + 18;
        const hh = spec.height + 16;
        halo.setAttribute('class', 'selection-halo pointer-events-none transition-opacity');
        halo.setAttribute('x', -hw / 2);
        halo.setAttribute('y', -hh / 2);
        halo.setAttribute('width', hw);
        halo.setAttribute('height', hh);
        halo.setAttribute('rx', '7');
        halo.setAttribute('fill', 'rgba(37, 99, 235, 0.05)');
        halo.setAttribute('stroke', '#2563eb');
        halo.setAttribute('stroke-width', '1.5');
        halo.setAttribute('stroke-dasharray', '4,3');
        halo.setAttribute('opacity', isSelected ? '1' : '0');
        ng.appendChild(halo);

        // Transparent hit box so clicking inside open gate areas works reliably
        const hitRect = document.createElementNS(SVG_NS, 'rect');
        hitRect.setAttribute('x', -spec.width / 2 - 4);
        hitRect.setAttribute('y', -spec.height / 2 - 4);
        hitRect.setAttribute('width', spec.width + 8);
        hitRect.setAttribute('height', spec.height + 8);
        hitRect.setAttribute('fill', 'transparent');
        ng.appendChild(hitRect);

        // Textbook IEEE Symbol Graphic
        ng.appendChild(buildNodeGraphicSVG(node));

        // Render Input Pins (left side)
        const inCount = node.inputs || spec.minInputs || 0;
        for (let i = 0; i < inCount; i++) {
          const pinWorld = getInputPinPos(node, i);
          const relX = pinWorld.x - node.x;
          const relY = pinWorld.y - node.y;

          const pg = document.createElementNS(SVG_NS, 'g');
          pg.setAttribute('class', 'pin-group cursor-crosshair');
          pg.dataset.nodeId = node.id;
          pg.dataset.pinType = 'IN';
          pg.dataset.pinIndex = i;

          const hit = document.createElementNS(SVG_NS, 'circle');
          hit.setAttribute('class', 'pin-hit');
          hit.setAttribute('cx', relX);
          hit.setAttribute('cy', relY);
          hit.setAttribute('r', '10');
          hit.setAttribute('fill', 'transparent');
          pg.appendChild(hit);

          const dot = document.createElementNS(SVG_NS, 'circle');
          dot.setAttribute('class', 'pin-dot transition-all');
          dot.setAttribute('cx', relX);
          dot.setAttribute('cy', relY);
          dot.setAttribute('r', '3');
          dot.setAttribute('fill', '#94a3b8');
          pg.appendChild(dot);

          ng.appendChild(pg);
        }

        // Render Output Pin (right side)
        if (spec.hasOutput) {
          const pinWorld = getOutputPinPos(node);
          const relX = pinWorld.x - node.x;
          const relY = pinWorld.y - node.y;

          const pg = document.createElementNS(SVG_NS, 'g');
          const isActiveSource = interaction.wireSource && interaction.wireSource.nodeId === node.id;
          pg.setAttribute('class', `pin-group cursor-crosshair ${isActiveSource ? 'active-source' : ''}`);
          pg.dataset.nodeId = node.id;
          pg.dataset.pinType = 'OUT';

          const hit = document.createElementNS(SVG_NS, 'circle');
          hit.setAttribute('class', 'pin-hit');
          hit.setAttribute('cx', relX);
          hit.setAttribute('cy', relY);
          hit.setAttribute('r', '11');
          hit.setAttribute('fill', 'transparent');
          pg.appendChild(hit);

          const dot = document.createElementNS(SVG_NS, 'circle');
          dot.setAttribute('class', 'pin-dot transition-all');
          dot.setAttribute('cx', relX);
          dot.setAttribute('cy', relY);
          dot.setAttribute('r', '3.2');
          dot.setAttribute('fill', '#64748b');
          pg.appendChild(dot);

          ng.appendChild(pg);
        }

        nodesLayer.appendChild(ng);
      }

      updateselectionInspector();
      updateduplicateButtonLabel();
    }

    /*************************************************************************
     * 7. SELECTION INSPECTOR & CIRCUIT TABS UI
     *************************************************************************/
    function renderTabs() {
      const container = document.getElementById('circuit-tabs');
      container.innerHTML = '';
      const activeKind = tabKind(getActivecircuit());
      document.querySelectorAll('#mode-switch .mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === activeKind);
      });
      document.querySelector('#btn-new-tab span').textContent = activeKind === 'db' ? 'new diagram' : 'new tab';
      document.querySelector('#btn-dup-tab span').textContent = activeKind === 'db' ? 'duplicate diagram tab' : 'duplicate circuit tab';

      for (const c of workspace.circuits) {
        if (tabKind(c) !== activeKind) continue;
        const isActive = c.id === workspace.activecircuitId;
        const tab = document.createElement('div');
        tab.className = `group flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer border transition shrink-0 ${
          isActive
            ? 'bg-white text-slate-900 border-slate-300 shadow-2xs'
            : 'bg-slate-100/70 text-slate-600 border-transparent hover:bg-slate-200/60'
        }`;

        const titleSpan = document.createElement('span');
        titleSpan.textContent = c.name;
        titleSpan.title = 'Double-click to rename circuit tab';
        titleSpan.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          promptRenamecircuit(c);
        });
        tab.appendChild(titleSpan);

        if (workspace.circuits.length > 1) {
          const closeBtn = document.createElement('button');
          closeBtn.className = 'opacity-50 hover:opacity-100 hover:text-red-600 ml-1 text-[11px] leading-none';
          closeBtn.innerHTML = '&times;';
          closeBtn.title = 'Delete circuit Tab';
          closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deletecircuitTab(c.id);
          });
          tab.appendChild(closeBtn);
        }

        tab.addEventListener('click', () => {
          if (workspace.activecircuitId !== c.id) activateTab(c.id);
        });

        container.appendChild(tab);
      }
    }

    function promptRenamecircuit(circuit) {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = circuit.name;
      input.className = 'px-1.5 py-0.5 text-xs border border-blue-400 rounded bg-white text-slate-900 w-32 focus:outline-none';
      const tabsEl = document.getElementById('circuit-tabs');
      renderTabs();
      const visibleTabs = workspace.circuits.filter(c => tabKind(c) === tabKind(circuit));
      const activeTab = tabsEl.children[visibleTabs.indexOf(circuit)];
      if (!activeTab) return;
      activeTab.innerHTML = '';
      activeTab.appendChild(input);
      input.focus();
      input.select();

      const commit = () => {
        const val = input.value.trim();
        if (val) circuit.name = val;
        renderTabs();
        saveToStorage();
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') renderTabs();
      });
    }

    function updateduplicateButtonLabel() {
      const lbl = document.getElementById('dup-btn-label');
      if (selectedNodeIds.size > 0) {
        lbl.textContent = `duplicate selection (${selectedNodeIds.size})`;
      } else {
        lbl.textContent = 'clone circuit on canvas';
      }
    }

    function updateselectionInspector() {
      const circuit = getActivecircuit();
      if (!circuit) return;

      if (selectedNodeIds.size === 0 && selectedWireIds.size === 0) {
        inspectorEl.classList.add('hidden');
        return;
      }

      inspectorEl.classList.remove('hidden');
      inspectorEl.innerHTML = '';

      if (selectedNodeIds.size === 1) {
        const nodeId = Array.from(selectedNodeIds)[0];
        const node = circuit.nodes.find(n => n.id === nodeId);
        if (!node) return;
        const spec = getNodeSpec(node);

        // Node Type Badge
        const badge = document.createElement('span');
        badge.className = 'font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded';
        badge.textContent = node.type;
        inspectorEl.appendChild(badge);

        // Label Input (especially for INPUT / OUTPUT or labeling gates)
        const lblWrap = document.createElement('div');
        lblWrap.className = 'flex items-center gap-1.5';
        lblWrap.innerHTML = `<span class="text-slate-500">Label:</span>`;
        const lblInput = document.createElement('input');
        lblInput.type = 'text';
        lblInput.value = ['INPUT', 'OUTPUT'].includes(node.type)
          ? (node.label || '').toUpperCase()
          : (node.label || '');
        lblInput.placeholder = node.type === 'INPUT' ? 'A' : (node.type === 'OUTPUT' ? 'R' : 'optional');
        lblInput.className = 'w-20 px-2 py-0.5 border border-slate-300 rounded text-xs font-serif text-slate-900 focus:outline-none focus:border-blue-500';
        lblInput.addEventListener('input', () => {
          node.label = ['INPUT', 'OUTPUT'].includes(node.type)
            ? lblInput.value.toUpperCase()
            : lblInput.value;
          renderAllWithoutInspectorRebuild();
          saveToStorage();
        });
        lblWrap.appendChild(lblInput);
        inspectorEl.appendChild(lblWrap);

        // Gate Type Switcher (for logic gates)
        if (!['INPUT', 'OUTPUT'].includes(node.type)) {
          const typeSelect = document.createElement('select');
          typeSelect.className = 'px-1.5 py-0.5 border border-slate-300 rounded text-xs bg-white text-slate-800';
          ['NOT', 'AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR'].forEach(gt => {
            const opt = document.createElement('option');
            opt.value = gt;
            opt.textContent = gt;
            if (node.type === gt) opt.selected = true;
            typeSelect.appendChild(opt);
          });
          typeSelect.addEventListener('change', () => {
            pushUndoState();
            node.type = typeSelect.value;
            if (node.type === 'NOT') {
              node.inputs = 1;
              circuit.wires = circuit.wires.filter(w => !(w.to === node.id && w.toPin > 0));
            } else if ((node.inputs || 1) < 2) {
              node.inputs = 2;
            }
            renderAll();
            saveToStorage();
          });
          inspectorEl.appendChild(typeSelect);
        }

        // Input Pin Count Selector (2, 3, 4) for multi-input gates
        if (spec.maxInputs > 1) {
          const pinWrap = document.createElement('div');
          pinWrap.className = 'flex items-center gap-1';
          pinWrap.innerHTML = `<span class="text-slate-500">Inputs:</span>`;
          [2, 3, 4].forEach(cnt => {
            const btn = document.createElement('button');
            btn.className = `px-2 py-0.5 rounded border text-xs font-medium ${
              (node.inputs || 2) === cnt
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`;
            btn.textContent = cnt;
            btn.addEventListener('click', () => {
              pushUndoState();
              node.inputs = cnt;
              circuit.wires = circuit.wires.filter(w => !(w.to === node.id && w.toPin >= cnt));
              renderAll();
              saveToStorage();
            });
            pinWrap.appendChild(btn);
          });
          inspectorEl.appendChild(pinWrap);
        }
      } else {
        const info = document.createElement('span');
        info.className = 'font-medium text-slate-700';
        info.textContent = `${selectedNodeIds.size} nodes, ${selectedWireIds.size} wires selected`;
        inspectorEl.appendChild(info);
      }

      // duplicate & Delete Buttons in Inspector
      if (selectedNodeIds.size > 0) {
        const dupBtn = document.createElement('button');
        dupBtn.className = 'px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-medium transition';
        dupBtn.textContent = 'duplicate';
        dupBtn.addEventListener('click', duplicateselectionOrcircuitonCanvas);
        inspectorEl.appendChild(dupBtn);
      }

      const delBtn = document.createElement('button');
      delBtn.className = 'px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-600 rounded font-medium transition';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', deleteSelected);
      inspectorEl.appendChild(delBtn);
    }

    // Re-renders SVG without losing focus inside the label text box
    function renderAllWithoutInspectorRebuild() {
      const savedFocus = document.activeElement;
      const circuit = getActivecircuit();
      if (!circuit) return;
      const nodeMap = new Map(circuit.nodes.map(n => [n.id, n]));
      nodesLayer.innerHTML = '';
      for (const node of circuit.nodes) {
        const spec = getNodeSpec(node);
        const ng = document.createElementNS(SVG_NS, 'g');
        const isSelected = selectedNodeIds.has(node.id);
        ng.setAttribute('class', `node-group cursor-grab ${isSelected ? 'selected' : ''}`);
        ng.setAttribute('transform', `translate(${node.x}, ${node.y})`);
        ng.dataset.nodeId = node.id;
        ng.appendChild(buildNodeGraphicSVG(node));
        nodesLayer.appendChild(ng);
      }
      if (savedFocus) savedFocus.focus();
    }

    /*************************************************************************
     * 8. DUPLICATION, ADDING, DELETING NODES & WIRES
     *************************************************************************/
    function getNextDefaultLabel(type) {
      const circuit = getActivecircuit();
      const existing = new Set(circuit.nodes.filter(n => n.type === type).map(n => n.label));
      if (type === 'INPUT') {
        const candidates = ['A', 'B', 'C', 'D', 'C0', 'C1', 'X', 'Y', 'Z', 'S0', 'S1'];
        for (const c of candidates) {
          if (!existing.has(c)) return c;
        }
        return 'IN' + (existing.size + 1);
      }
      if (type === 'OUTPUT') {
        const candidates = ['R', 'Q', 'Y', 'Z', 'F', 'S', 'Cout'];
        for (const c of candidates) {
          if (!existing.has(c)) return c;
        }
        return 'OUT' + (existing.size + 1);
      }
      return '';
    }

    function screenToWorld(clientX, clientY) {
      const rect = svgEl.getBoundingClientRect();
      return {
        x: (clientX - rect.left - view.x) / view.scale,
        y: (clientY - rect.top - view.y) / view.scale
      };
    }

    function addNode(type, customWorldPos = null) {
      const circuit = getActivecircuit();
      if (!circuit) return;
      pushUndoState();

      const spec = GATE_SPECS[type];
      let pos = customWorldPos;
      if (!pos) {
        // Place neatly near center of current viewport, staggered slightly if occupied
        const rect = svgEl.getBoundingClientRect();
        pos = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
        if (type === 'INPUT') pos.x -= 220;
        if (type === 'OUTPUT') pos.x += 220;
      }

      // Avoid exact overlap with existing node
      while (circuit.nodes.some(n => Math.hypot(n.x - pos.x, n.y - pos.y) < 28)) {
        pos.x += 20;
        pos.y += 30;
      }

      const newNode = {
        id: 'n_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        type,
        label: getNextDefaultLabel(type),
        x: Math.round(pos.x / 5) * 5,
        y: Math.round(pos.y / 5) * 5,
        inputs: spec.minInputs
      };

      circuit.nodes.push(newNode);
      selectedNodeIds.clear();
      selectedWireIds.clear();
      selectedNodeIds.add(newNode.id);

      renderAll();
      saveToStorage();
      return newNode;
    }

    /**
     * duplicates either the currently selected nodes+wires OR (if nothing is selected)
     * clones the entire current circuit right below on the same canvas!
     */
    function duplicateselectionOrcircuitonCanvas() {
      const circuit = getActivecircuit();
      if (!circuit || circuit.nodes.length === 0) return;
      pushUndoState();

      const sourceNodes = selectedNodeIds.size > 0
        ? circuit.nodes.filter(n => selectedNodeIds.has(n.id))
        : [...circuit.nodes];

      if (sourceNodes.length === 0) return;

      // Determine bounding box so if we clone the whole circuit, we place it cleanly below
      let minY = Infinity, maxY = -Infinity;
      for (const n of sourceNodes) {
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y);
      }
      const isWholecircuit = selectedNodeIds.size === 0;
      const offsetX = isWholecircuit ? 0 : 40;
      const offsetY = isWholecircuit ? (maxY - minY) + 120 : 45;

      const idMap = new Map();
      const newNodes = [];

      for (const n of sourceNodes) {
        const newId = 'n_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
        idMap.set(n.id, newId);
        newNodes.push({
          ...n,
          id: newId,
          x: n.x + offsetX,
          y: n.y + offsetY
        });
      }

      // duplicate all wires connecting any two duplicated nodes
      const newWires = [];
      for (const w of circuit.wires) {
        if (idMap.has(w.from) && idMap.has(w.to)) {
          newWires.push({
            id: 'w_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
            from: idMap.get(w.from),
            to: idMap.get(w.to),
            toPin: w.toPin,
            midX: typeof w.midX === 'number' ? w.midX + offsetX : undefined
          });
        }
      }

      circuit.nodes.push(...newNodes);
      circuit.wires.push(...newWires);

      selectedNodeIds.clear();
      selectedWireIds.clear();
      for (const nn of newNodes) selectedNodeIds.add(nn.id);

      renderAll();
      saveToStorage();
      showToast(isWholecircuit ? 'cloned entire circuit below on canvas' : `duplicated ${newNodes.length} component(s)`);
    }

    /**
     * duplicates the entire active circuit into a brand new tab!
     */
    function duplicatecircuitToNewTab() {
      const current = getActivecircuit();
      if (!current) return;

      const copy = JSON.parse(JSON.stringify(current));
      copy.id = (tabKind(current) === 'db' ? 'db_' : 'circuit_') + Date.now();
      copy.name = current.name + ' (Copy)';

      workspace.circuits.push(copy);
      workspace.activecircuitId = copy.id;
      selectedNodeIds.clear();
      selectedWireIds.clear();
      undoStack = [];
      redoStack = [];
      updateUndoRedoButtons();
      renderAll();
      saveToStorage();
      showToast(`Created duplicate tab "${copy.name}"`);
    }

    function createNewBlankcircuitTab() {
      const newcircuit = {
        id: 'circuit_' + Date.now(),
        name: `circuit ${workspace.circuits.length + 1}`,
        nodes: [
          { id: 'in_1', type: 'INPUT', label: 'A', x: 140, y: 180, inputs: 0 },
          { id: 'in_2', type: 'INPUT', label: 'B', x: 140, y: 260, inputs: 0 },
          { id: 'g_1',  type: 'AND',   label: '',  x: 340, y: 220, inputs: 2 },
          { id: 'out_1',type: 'OUTPUT',label: 'R', x: 520, y: 220, inputs: 1 }
        ],
        wires: [
          { id: 'w_1', from: 'in_1', to: 'g_1', toPin: 0, midX: 240 },
          { id: 'w_2', from: 'in_2', to: 'g_1', toPin: 1, midX: 240 },
          { id: 'w_3', from: 'g_1',  to: 'out_1', toPin: 0, midX: 430 }
        ]
      };
      workspace.circuits.push(newcircuit);
      workspace.activecircuitId = newcircuit.id;
      selectedNodeIds.clear();
      selectedWireIds.clear();
      undoStack = [];
      redoStack = [];
      updateUndoRedoButtons();
      renderAll();
      fitViewToDiagram();
      saveToStorage();
    }

    function deletecircuitTab(id) {
      if (workspace.circuits.length <= 1) return;
      const removed = workspace.circuits.find(c => c.id === id);
      workspace.circuits = workspace.circuits.filter(c => c.id !== id);
      if (workspace.activecircuitId === id) {
        const sameKind = workspace.circuits.find(c => tabKind(c) === tabKind(removed));
        workspace.activecircuitId = (sameKind || workspace.circuits[0]).id;
      }
      renderAll();
      saveToStorage();
    }

    function deleteSelected() {
      const circuit = getActivecircuit();
      if (!circuit) return;
      if (selectedNodeIds.size === 0 && selectedWireIds.size === 0) return;

      pushUndoState();
      circuit.nodes = circuit.nodes.filter(n => !selectedNodeIds.has(n.id));
      circuit.wires = circuit.wires.filter(
        w => !selectedWireIds.has(w.id) && !selectedNodeIds.has(w.from) && !selectedNodeIds.has(w.to)
      );
      selectedNodeIds.clear();
      selectedWireIds.clear();
      renderAll();
      saveToStorage();
    }

    function connectPins(fromNodeId, toNodeId, toPinIndex) {
      const circuit = getActivecircuit();
      if (!circuit || fromNodeId === toNodeId) return;

      const fromNode = circuit.nodes.find(n => n.id === fromNodeId);
      const toNode = circuit.nodes.find(n => n.id === toNodeId);
      if (!fromNode || !toNode) return;

      pushUndoState();

      // Remove any existing wire occupying the same target input pin
      circuit.wires = circuit.wires.filter(w => !(w.to === toNodeId && w.toPin === toPinIndex));

      // Check if source node already has an existing wire so we can share its trunk midX (for automatic solder dot!)
      const existingFromSameSource = circuit.wires.find(w => w.from === fromNodeId);
      const p1 = getOutputPinPos(fromNode);
      const p2 = getInputPinPos(toNode, toPinIndex);

      let defaultMidX = Math.round((p1.x + p2.x) / 2);
      if (existingFromSameSource && typeof existingFromSameSource.midX === 'number') {
        defaultMidX = existingFromSameSource.midX;
      }

      circuit.wires.push({
        id: 'w_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
        from: fromNodeId,
        to: toNodeId,
        toPin: toPinIndex,
        midX: defaultMidX
      });

      interaction.wireSource = null;
      tempWireEl.classList.add('hidden');
      renderAll();
      saveToStorage();
    }

    /*************************************************************************
     * 9. MOUSE / POINTER & KEYBOARD INTERACTION HANDLERS
     *************************************************************************/
    svgEl.addEventListener('mousedown', (e) => {
      quickAddMenu.classList.add('hidden');
      const circuit = getActivecircuit();
      if (!circuit) return;

      const worldPt = screenToWorld(e.clientX, e.clientY);

      // Middle mouse button or Space+Drag -> Pan canvas
      if (e.button === 1 || (e.button === 0 && interaction.spacePressed)) {
        interaction.mode = 'PAN';
        interaction.startX = e.clientX;
        interaction.startY = e.clientY;
        interaction.startViewX = view.x;
        interaction.startViewY = view.y;
        e.preventDefault();
        return;
      }

      if (e.button !== 0) return;

      // 1. Check if clicked on a Pin
      const pinEl = e.target.closest('.pin-group');
      if (pinEl) {
        const nodeId = pinEl.dataset.nodeId;
        const pinType = pinEl.dataset.pinType;
        const pinIndex = parseInt(pinEl.dataset.pinIndex || '0', 10);

        if (pinType === 'OUT') {
          interaction.mode = 'WIRE_CREATE';
          interaction.wireSource = { nodeId };
          renderAll();
          e.stopPropagation();
          return;
        } else if (pinType === 'IN') {
          if (interaction.wireSource) {
            connectPins(interaction.wireSource.nodeId, nodeId, pinIndex);
            interaction.mode = null;
            e.stopPropagation();
            return;
          }
        }
      }

      // 2. Check if clicked on a Node (Gate / Input / Output)
      const nodeEl = e.target.closest('.node-group');
      if (nodeEl) {
        const nodeId = nodeEl.dataset.nodeId;
        const clickedNode = circuit.nodes.find(n => n.id === nodeId);

        // If user was in click-to-wire mode from an output pin and clicked a gate body, connect to first free input pin!
        if (interaction.wireSource && interaction.wireSource.nodeId !== nodeId && clickedNode && clickedNode.type !== 'INPUT') {
          const pinIdx = findBestInputPin(clickedNode, worldPt.y, circuit.wires);
          connectPins(interaction.wireSource.nodeId, nodeId, pinIdx);
          interaction.mode = null;
          e.stopPropagation();
          return;
        }

        interaction.wireSource = null;
        tempWireEl.classList.add('hidden');

        if (e.shiftKey) {
          if (selectedNodeIds.has(nodeId)) selectedNodeIds.delete(nodeId);
          else selectedNodeIds.add(nodeId);
        } else if (!selectedNodeIds.has(nodeId)) {
          selectedNodeIds.clear();
          selectedWireIds.clear();
          selectedNodeIds.add(nodeId);
        }

        // Start dragging selected nodes
        pushUndoState();
        interaction.mode = 'DRAG_NODES';
        interaction.startX = worldPt.x;
        interaction.startY = worldPt.y;
        interaction.nodeStartPositions.clear();
        for (const id of selectedNodeIds) {
          const n = circuit.nodes.find(item => item.id === id);
          if (n) interaction.nodeStartPositions.set(id, { x: n.x, y: n.y });
        }
        renderAll();
        return;
      }

      // 3. Check if clicked on a Wire
      const wireEl = e.target.closest('.wire-group');
      if (wireEl) {
        const wireId = wireEl.dataset.wireId;
        interaction.wireSource = null;
        tempWireEl.classList.add('hidden');

        if (!e.shiftKey) {
          selectedNodeIds.clear();
          selectedWireIds.clear();
        }
        selectedWireIds.add(wireId);

        const wire = circuit.wires.find(w => w.id === wireId);
        if (wire) {
          pushUndoState();
          // Find all wires from same source sharing the exact same midX trunk so dragging moves the whole vertical trunk together!
          const sharedWires = circuit.wires.filter(
            w => w.from === wire.from && Math.abs((w.midX || 0) - (wire.midX || 0)) < 2
          );
          interaction.mode = 'DRAG_WIRE_SEGMENT';
          interaction.startX = worldPt.x;
          interaction.activeWireDrag = {
            wires: e.altKey ? [wire] : sharedWires, // Hold Alt to detach a single wire from a shared trunk
            startMidX: wire.midX || worldPt.x
          };
        }
        renderAll();
        return;
      }

      // 4. Clicked on empty canvas: clear wire creation & start Marquee selection box
      interaction.wireSource = null;
      tempWireEl.classList.add('hidden');
      if (!e.shiftKey) {
        selectedNodeIds.clear();
        selectedWireIds.clear();
      }
      interaction.mode = 'MARQUEE';
      interaction.startX = worldPt.x;
      interaction.startY = worldPt.y;
      marqueeBoxEl.setAttribute('x', worldPt.x);
      marqueeBoxEl.setAttribute('y', worldPt.y);
      marqueeBoxEl.setAttribute('width', '0');
      marqueeBoxEl.setAttribute('height', '0');
      marqueeBoxEl.classList.remove('hidden');
      renderAll();
    });

    window.addEventListener('mousemove', (e) => {
      const circuit = getActivecircuit();
      if (!circuit) return;
      const worldPt = screenToWorld(e.clientX, e.clientY);

      if (interaction.mode === 'PAN') {
        view.x = interaction.startViewX + (e.clientX - interaction.startX);
        view.y = interaction.startViewY + (e.clientY - interaction.startY);
        viewportGroup.setAttribute('transform', `translate(${view.x}, ${view.y}) scale(${view.scale})`);
        return;
      }

      if (interaction.mode === 'DRAG_NODES') {
        const dx = worldPt.x - interaction.startX;
        const dy = worldPt.y - interaction.startY;
        const snap = workspace.showGrid ? 10 : 2;
        for (const [id, startPos] of interaction.nodeStartPositions.entries()) {
          const node = circuit.nodes.find(n => n.id === id);
          if (node) {
            node.x = Math.round((startPos.x + dx) / snap) * snap;
            node.y = Math.round((startPos.y + dy) / snap) * snap;
          }
        }
        renderAll();
        return;
      }

      if (interaction.mode === 'DRAG_WIRE_SEGMENT' && interaction.activeWireDrag) {
        const dx = worldPt.x - interaction.startX;
        const newMidX = Math.round((interaction.activeWireDrag.startMidX + dx) / 2) * 2;
        for (const w of interaction.activeWireDrag.wires) {
          w.midX = newMidX;
        }
        renderAll();
        return;
      }

      if (interaction.mode === 'MARQUEE') {
        const x = Math.min(interaction.startX, worldPt.x);
        const y = Math.min(interaction.startY, worldPt.y);
        const w = Math.abs(worldPt.x - interaction.startX);
        const h = Math.abs(worldPt.y - interaction.startY);
        marqueeBoxEl.setAttribute('x', x);
        marqueeBoxEl.setAttribute('y', y);
        marqueeBoxEl.setAttribute('width', w);
        marqueeBoxEl.setAttribute('height', h);

        selectedNodeIds.clear();
        for (const n of circuit.nodes) {
          if (n.x >= x && n.x <= x + w && n.y >= y && n.y <= y + h) {
            selectedNodeIds.add(n.id);
          }
        }
        renderAll();
        return;
      }

      // Live orthogonal wire preview while creating a wire
      if (interaction.wireSource) {
        const srcNode = circuit.nodes.find(n => n.id === interaction.wireSource.nodeId);
        if (srcNode) {
          const p1 = getOutputPinPos(srcNode);
          const midX = Math.round((p1.x + worldPt.x) / 2);
          tempWireEl.setAttribute(
            'd',
            `M ${p1.x},${p1.y} L ${midX},${p1.y} L ${midX},${worldPt.y} L ${worldPt.x},${worldPt.y}`
          );
          tempWireEl.classList.remove('hidden');
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      const circuit = getActivecircuit();
      const worldPt = screenToWorld(e.clientX, e.clientY);

      if (interaction.mode === 'WIRE_CREATE' && interaction.wireSource) {
        // Check if mouse released over an input pin or gate body
        const pinEl = e.target.closest('.pin-group');
        if (pinEl && pinEl.dataset.pinType === 'IN') {
          connectPins(
            interaction.wireSource.nodeId,
            pinEl.dataset.nodeId,
            parseInt(pinEl.dataset.pinIndex || '0', 10)
          );
          interaction.mode = null;
          return;
        }

        const nodeEl = e.target.closest('.node-group');
        if (nodeEl && nodeEl.dataset.nodeId !== interaction.wireSource.nodeId) {
          const targetNode = circuit.nodes.find(n => n.id === nodeEl.dataset.nodeId);
          if (targetNode && targetNode.type !== 'INPUT') {
            const pinIdx = findBestInputPin(targetNode, worldPt.y, circuit.wires);
            connectPins(interaction.wireSource.nodeId, targetNode.id, pinIdx);
            interaction.mode = null;
            return;
          }
        }
        // Keep wireSource active if user just clicked the output pin (so click-then-click also works!)
      }

      if (interaction.mode === 'MARQUEE') {
        marqueeBoxEl.classList.add('hidden');
      }

      if (interaction.mode === 'DRAG_NODES' || interaction.mode === 'DRAG_WIRE_SEGMENT') {
        saveToStorage();
      }

      interaction.mode = null;
      interaction.activeWireDrag = null;
    });

    function findBestInputPin(targetNode, clickY, wires) {
      const spec = getNodeSpec(targetNode);
      const count = targetNode.inputs || spec.minInputs || 1;
      if (count <= 1) return 0;

      // Prefer unoccupied pin closest to cursor Y
      const occupied = new Set(wires.filter(w => w.to === targetNode.id).map(w => w.toPin));
      let bestPin = 0;
      let bestDist = Infinity;

      for (let i = 0; i < count; i++) {
        const pos = getInputPinPos(targetNode, i);
        const dist = Math.abs(pos.y - clickY) + (occupied.has(i) ? 1000 : 0);
        if (dist < bestDist) {
          bestDist = dist;
          bestPin = i;
        }
      }
      return bestPin;
    }

    // Double-click canvas to open quick add menu, or double-click node to focus its label input
    svgEl.addEventListener('dblclick', (e) => {
      const nodeEl = e.target.closest('.node-group');
      if (nodeEl) {
        const inputEl = inspectorEl.querySelector('input[type="text"]');
        if (inputEl) {
          inputEl.focus();
          inputEl.select();
        }
        return;
      }

      // open quick-add popup at cursor
      const rect = canvasContainer.getBoundingClientRect();
      interaction.quickAddPos = screenToWorld(e.clientX, e.clientY);
      quickAddMenu.style.left = `${Math.min(rect.width - 230, e.clientX - rect.left)}px`;
      quickAddMenu.style.top = `${Math.min(rect.height - 200, e.clientY - rect.top)}px`;
      quickAddMenu.classList.remove('hidden');
    });

    // Mouse Wheel Zoom
    svgEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      zoomAroundPoint(zoomFactor, e.clientX, e.clientY);
    }, { passive: false });

    function zoomAroundPoint(factor, clientX, clientY) {
      if (isDbActive()) { DB.zoomCentre(factor); return; }
      const rect = svgEl.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;

      const newScale = Math.min(2.5, Math.max(0.3, view.scale * factor));
      const scaleRatio = newScale / view.scale;

      view.x = mx - (mx - view.x) * scaleRatio;
      view.y = my - (my - view.y) * scaleRatio;
      view.scale = newScale;
      renderAll();
    }

    function fitViewToDiagram() {
      if (isDbActive()) { DB.fitView(); return; }
      const circuit = getActivecircuit();
      if (!circuit || circuit.nodes.length === 0) {
        view = { x: 0, y: 0, scale: 1 };
        renderAll();
        return;
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of circuit.nodes) {
        minX = Math.min(minX, n.x - 60);
        minY = Math.min(minY, n.y - 45);
        maxX = Math.max(maxX, n.x + 60);
        maxY = Math.max(maxY, n.y + 45);
      }

      const rect = svgEl.getBoundingClientRect();
      const diagW = Math.max(200, maxX - minX);
      const diagH = Math.max(200, maxY - minY);
      const pad = 90;

      const scaleX = (rect.width - pad * 2) / diagW;
      const scaleY = (rect.height - pad * 2) / diagH;
      view.scale = Math.min(1.25, Math.max(0.4, Math.min(scaleX, scaleY)));

      view.x = Math.round((rect.width - diagW * view.scale) / 2 - minX * view.scale);
      view.y = Math.round((rect.height - diagH * view.scale) / 2 - minY * view.scale);
      renderAll();
    }

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (isDbActive()) return; // database mode handles its own shortcuts (db.js)
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        interaction.spacePressed = true;
        svgEl.style.cursor = 'grab';
      }
      if (e.key === 'Escape') {
        interaction.wireSource = null;
        tempWireEl.classList.add('hidden');
        quickAddMenu.classList.add('hidden');
        if (document.body.classList.contains('screenshot-mode')) {
          toggleScreenshotMode(false);
        } else {
          selectedNodeIds.clear();
          selectedWireIds.clear();
          renderAll();
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateselectionOrcircuitonCanvas();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const circuit = getActivecircuit();
        if (circuit) {
          selectedNodeIds = new Set(circuit.nodes.map(n => n.id));
          renderAll();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        interaction.spacePressed = false;
        svgEl.style.cursor = 'default';
      }
    });

    /*************************************************************************
     * 10. SCREENSHOT MODE, EXPORT HIGH-RES PNG, SAVE & OPEN JSON
     *************************************************************************/
    function toggleScreenshotMode(enable) {
      const exitBar = document.getElementById('screenshot-exit-bar');
      if (enable) {
        if (isDbActive()) DB.clearSelection();
        selectedNodeIds.clear();
        selectedWireIds.clear();
        interaction.wireSource = null;
        tempWireEl.classList.add('hidden');
        renderAll();
        document.body.classList.add('screenshot-mode');
        exitBar.classList.remove('hidden');
      } else {
        document.body.classList.remove('screenshot-mode');
        exitBar.classList.add('hidden');
      }
    }

    /**
     * Renders a tightly cropped, 3x resolution crisp PNG on a pure #ffffff background
     * and downloads it immediately.
     */
    function exportHighResPNG() {
      if (isDbActive()) { DB.exportPNG(); return; }
      const circuit = getActivecircuit();
      if (!circuit || circuit.nodes.length === 0) {
        showToast('Canvas is empty');
        return;
      }

      // Compute tight bounding box of all nodes and wire points
      const nodeMap = new Map(circuit.nodes.map(n => [n.id, n]));
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      for (const n of circuit.nodes) {
        const spec = getNodeSpec(n);
        minX = Math.min(minX, n.x - spec.width / 2 - 42);
        minY = Math.min(minY, n.y - spec.height / 2 - 24);
        maxX = Math.max(maxX, n.x + spec.width / 2 + 42);
        maxY = Math.max(maxY, n.y + spec.height / 2 + 24);
      }

      for (const w of circuit.wires) {
        const r = computeWirePoints(w, nodeMap);
        if (r) {
          for (const pt of r.points) {
            minX = Math.min(minX, pt.x - 20);
            minY = Math.min(minY, pt.y - 20);
            maxX = Math.max(maxX, pt.x + 20);
            maxY = Math.max(maxY, pt.y + 20);
          }
        }
      }

      const width = Math.ceil(maxX - minX);
      const height = Math.ceil(maxY - minY);

      // Clone SVG and strip interactive elements
      const cloneSvg = document.createElementNS(SVG_NS, 'svg');
      cloneSvg.setAttribute('xmlns', SVG_NS);
      cloneSvg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
      cloneSvg.setAttribute('width', width);
      cloneSvg.setAttribute('height', height);

      const bg = document.createElementNS(SVG_NS, 'rect');
      bg.setAttribute('x', minX);
      bg.setAttribute('y', minY);
      bg.setAttribute('width', width);
      bg.setAttribute('height', height);
      bg.setAttribute('fill', '#ffffff');
      cloneSvg.appendChild(bg);

      const contentGroup = document.createElementNS(SVG_NS, 'g');
      // Copy wires (only visible black paths)
      for (const w of circuit.wires) {
        const r = computeWirePoints(w, nodeMap);
        if (!r) continue;
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', r.points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`).join(' '));
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', '#000000');
        p.setAttribute('stroke-width', '1.8');
        p.setAttribute('stroke-linejoin', 'miter');
        p.setAttribute('stroke-linecap', 'square');
        contentGroup.appendChild(p);
      }

      // Copy solder junctions
      const junctions = computeSolderJunctions(circuit.wires, nodeMap);
      for (const j of junctions) {
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', j.x);
        dot.setAttribute('cy', j.y);
        dot.setAttribute('r', '3.3');
        dot.setAttribute('fill', '#000000');
        contentGroup.appendChild(dot);
      }

      // Copy nodes
      for (const node of circuit.nodes) {
        const ng = document.createElementNS(SVG_NS, 'g');
        ng.setAttribute('transform', `translate(${node.x}, ${node.y})`);
        ng.appendChild(buildNodeGraphicSVG(node));
        contentGroup.appendChild(ng);
      }

      cloneSvg.appendChild(contentGroup);

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(cloneSvg);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        const scale = 2.5; // High-res Retina export for coursework documents
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);

        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `${(circuit.name || 'circuit').replace(/\s+/g, '_').toLowerCase()}.png`;
        a.click();
        showToast('exported high-resolution PNG');
      };
      img.src = url;
    }

    function saveworkspaceJSON() {
      const dataStr = JSON.stringify(workspace, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const circuit = getActivecircuit();
      a.href = url;
      a.download = `${(circuit ? circuit.name : 'circuits').replace(/\s+/g, '_').toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('saved circuit file (.json)');
    }

    function openworkspaceJSON(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (parsed && Array.isArray(parsed.circuits) && parsed.circuits.length > 0) {
            workspace = parsed;
            workspace.circuits.forEach(c => { c.nodes = c.nodes || []; c.wires = c.wires || []; });
          } else if (parsed && parsed.kind === 'db' && Array.isArray(parsed.items)) {
            const imported = { ...parsed, id: 'db_' + Date.now(), nodes: [], wires: [], links: parsed.links || [] };
            workspace.circuits.push(imported);
            workspace.activecircuitId = imported.id;
          } else if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.wires)) {
            // Single circuit JSON format
            const imported = {
              id: 'circuit_' + Date.now(),
              name: parsed.name || file.name.replace(/\.json$/i, ''),
              nodes: parsed.nodes,
              wires: parsed.wires
            };
            workspace.circuits.push(imported);
            workspace.activecircuitId = imported.id;
          } else {
            showToast('Invalid circuit JSON file');
            return;
          }
          selectedNodeIds.clear();
          selectedWireIds.clear();
          renderAll();
          fitViewToDiagram();
          saveToStorage();
          showToast('loaded circuit file successfully');
        } catch (err) {
          showToast('Could not parse JSON file');
        }
      };
      reader.readAsText(file);
    }

    /*************************************************************************
     * 11. WIRE UP TOOLBAR BUTTONS & INITIALIZATION
     *************************************************************************/
    document.querySelectorAll('.add-node-btn[data-add-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        addNode(btn.dataset.addType);
      });
    });

    document.querySelectorAll('.quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        addNode(btn.dataset.quickType, interaction.quickAddPos);
        quickAddMenu.classList.add('hidden');
      });
    });

    document.getElementById('btn-auto-layout').addEventListener('click', autoArrangecircuit);
    document.getElementById('btn-truth-table').addEventListener('click', showTruthTable);
    document.getElementById('btn-close-truth-table').addEventListener('click', () => {
      truthTableDialog.classList.add('hidden');
    });
    truthTableDialog.addEventListener('click', (event) => {
      if (event.target === truthTableDialog) truthTableDialog.classList.add('hidden');
    });
    document.getElementById('btn-clone-selection').addEventListener('click', duplicateselectionOrcircuitonCanvas);
    document.getElementById('btn-dup-tab').addEventListener('click', duplicatecircuitToNewTab);
    document.getElementById('btn-new-tab').addEventListener('click', () => {
      if (isDbActive()) createNewDbTab();
      else createNewBlankcircuitTab();
    });
    document.querySelectorAll('#mode-switch .mode-btn').forEach(btn => {
      btn.addEventListener('click', () => switchMode(btn.dataset.mode));
    });

    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);

    document.getElementById('btn-toggle-grid').addEventListener('click', (e) => {
      workspace.showGrid = !workspace.showGrid;
      canvasContainer.classList.toggle('canvas-grid', workspace.showGrid);
      e.currentTarget.textContent = `grid: ${workspace.showGrid ? 'on' : 'off'}`;
      saveToStorage();
    });

    document.getElementById('btn-fit-view').addEventListener('click', fitViewToDiagram);

    document.getElementById('btn-clear').addEventListener('click', () => {
      if (isDbActive()) { DB.clearAll(); return; }
      const circuit = getActivecircuit();
      if (!circuit || circuit.nodes.length === 0) return;
      pushUndoState();
      circuit.nodes = [];
      circuit.wires = [];
      selectedNodeIds.clear();
      selectedWireIds.clear();
      renderAll();
      saveToStorage();
      showToast('cleared canvas (Press Ctrl+Z to undo)');
    });

    document.getElementById('btn-load-ref').addEventListener('click', () => {
      if (isDbActive()) { DB.loadExample('nested'); return; }
      const ref = createreferencecircuit();
      workspace.circuits.push(ref);
      workspace.activecircuitId = ref.id;
      selectedNodeIds.clear();
      selectedWireIds.clear();
      renderAll();
      fitViewToDiagram();
      saveToStorage();
      showToast('loaded reference coursework diagram');
    });

    document.getElementById('btn-screenshot-mode').addEventListener('click', () => toggleScreenshotMode(true));
    document.getElementById('btn-exit-screenshot').addEventListener('click', () => toggleScreenshotMode(false));
    document.getElementById('btn-export-png').addEventListener('click', exportHighResPNG);

    document.getElementById('btn-save-json').addEventListener('click', saveworkspaceJSON);
    document.getElementById('btn-open-json').addEventListener('click', () => {
      document.getElementById('file-input-json').click();
    });
    document.getElementById('file-input-json').addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        openworkspaceJSON(e.target.files[0]);
        e.target.value = '';
      }
    });

    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      const rect = svgEl.getBoundingClientRect();
      zoomAroundPoint(1.15, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      const rect = svgEl.getBoundingClientRect();
      zoomAroundPoint(0.85, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });

    window.addEventListener('resize', () => {
      renderAll();
    });

    // Initialize Application
    function initApp() {
      DB.init();
      let loaded = false;
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && Array.isArray(parsed.circuits) && parsed.circuits.length > 0) {
            workspace = parsed;
            workspace.showGrid = !!(workspace.showGrid ?? workspace.showgrid);
            delete workspace.showgrid;
            workspace.circuits.forEach(circuit => {
              circuit.nodes = circuit.nodes || [];
              circuit.wires = circuit.wires || [];
              circuit.nodes.forEach(node => {
                if (node.label && ['INPUT', 'OUTPUT'].includes(node.type)) {
                  node.label = node.label.toUpperCase();
                }
              });
            });
            saveToStorage();
            loaded = true;
          }
        }
      } catch (e) {
        loaded = false;
      }

      if (!loaded) {
        const refcircuit = createreferencecircuit();
        workspace.circuits = [refcircuit];
        workspace.activecircuitId = refcircuit.id;
      }

      // Persist the initial workspace too, so the first circuit and any
      // recovered workspace are available after the next browser refresh.
      saveToStorage();
      canvasContainer.classList.toggle('canvas-grid', !!workspace.showGrid);
      document.getElementById('btn-toggle-grid').textContent = `grid: ${workspace.showGrid ? 'on' : 'off'}`;

      updateUndoRedoButtons();
      renderAll();
      setTimeout(fitViewToDiagram, 30);
    }

    window.onload = initApp;
