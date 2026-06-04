import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as path from 'path';

interface AnalysisResult {
    line: number;
    label: string;
    variable: string;
    inputs: string[];
    type: string;
}

interface DagNode {
    id: string;
    label: string;
    operation: string;
    line: number;
    type: string;
}

interface DagEdge {
    from: string;
    to: string;
}

interface AnalysisOutput {
    results: AnalysisResult[];
    nodes: DagNode[];
    edges: DagEdge[];
}

interface AnalysisSnapshot {
    uri: string;
    version: number;
    output: AnalysisOutput;
}

interface PythonCommand {
    command: string;
    args: string[];
}

const pythonCommands: PythonCommand[] = [
    { command: 'python', args: [] },
    { command: 'python3', args: [] },
    { command: 'py', args: ['-3'] },
];

export function activate(context: vscode.ExtensionContext) {
    console.log('DataFlow Copilot is active');

    const decorator = vscode.window.createTextEditorDecorationType({
        after: {
            margin: '0 0 0 2em',
            color: '#4ec9b05d',
            fontStyle: 'italic',
        },
    });

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.tooltip = 'DataFlow Copilot - click to open DAG panel';
    statusBar.command = 'dataflow-copilot.showDag';
    context.subscriptions.push(statusBar, decorator);

    let dagPanel: vscode.WebviewPanel | undefined;
    let lastSnapshot: AnalysisSnapshot | undefined;
    let timeout: NodeJS.Timeout | undefined;
    let analysisRun = 0;

    context.subscriptions.push(
        vscode.commands.registerCommand('dataflow-copilot.showDag', () => {
            dagPanel = ensureDagPanel(dagPanel);

            const editor = vscode.window.activeTextEditor;
            const currentSnapshot = editor ? getFreshSnapshot(lastSnapshot, editor.document) : undefined;
            if (currentSnapshot) {
                updateDagPanel(dagPanel, currentSnapshot.output);
            } else {
                updateDagPanel(dagPanel, { results: [], nodes: [], edges: [] });
                triggerAnalysis();
            }
        })
    );

    const hoverProvider = vscode.languages.registerHoverProvider('python', {
        async provideHover(document, position) {
            let snapshot = getFreshDocumentSnapshot(lastSnapshot, document);

            if (!snapshot) {
                try {
                    const output = await analyzeDocument(context, document);
                    snapshot = { uri: document.uri.toString(), version: document.version, output };
                } catch (error) {
                    console.error('DataFlow hover analysis failed:', error);
                    return undefined;
                }
            }

            const line = position.line + 1;
            const match = snapshot.output.results.find(result => result.line === line);

            if (!match) {
                return undefined;
            }

            const inputText = match.inputs.length > 0
                ? `**Inputs:** \`${match.inputs.join('`, `')}\``
                : '**Inputs:** none (source)';

            const markdown = new vscode.MarkdownString();
            markdown.appendMarkdown('### DataFlow Copilot\n');
            markdown.appendMarkdown(`**Variable:** \`${match.variable}\`\n\n`);
            markdown.appendMarkdown(`**Operation:** ${match.label}\n\n`);
            markdown.appendMarkdown(`**Type:** \`${match.type}\`\n\n`);
            markdown.appendMarkdown(`${inputText}\n\n`);
            markdown.appendMarkdown(`*Line ${match.line}*`);

            return new vscode.Hover(markdown);
        },
    });

    context.subscriptions.push(hoverProvider);

    function triggerAnalysis() {
        if (timeout) {
            clearTimeout(timeout);
        }

        timeout = setTimeout(() => {
            void runAnalysis();
        }, 800);
    }

    async function runAnalysis() {
        const editor = vscode.window.activeTextEditor;

        if (!editor || editor.document.languageId !== 'python') {
            statusBar.hide();
            return;
        }

        const document = editor.document;
        const runId = ++analysisRun;

        try {
            const output = await analyzeDocument(context, document);
            if (runId !== analysisRun || document.version !== editor.document.version) {
                return;
            }

            lastSnapshot = {
                uri: document.uri.toString(),
                version: document.version,
                output,
            };

            applyDecorations(editor, decorator, output.results);
            updateStatusBar(statusBar, output.results);

            if (dagPanel) {
                updateDagPanel(dagPanel, output);
            }
        } catch (error) {
            console.error('DataFlow analyzer failed:', error);
            applyDecorations(editor, decorator, []);
            statusBar.hide();
            if (dagPanel) {
                updateDagPanel(dagPanel, { results: [], nodes: [], edges: [] });
            }
        }
    }

    function ensureDagPanel(existingPanel: vscode.WebviewPanel | undefined): vscode.WebviewPanel {
        if (existingPanel) {
            existingPanel.reveal(vscode.ViewColumn.Beside);
            return existingPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'dataflowDag',
            'DataFlow DAG',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );
        panel.webview.html = buildDagHtml();
        panel.webview.onDidReceiveMessage(message => {
            if (message.type === 'ready' && lastSnapshot) {
                updateDagPanel(panel, lastSnapshot.output);
            }
        });
        panel.onDidDispose(() => { dagPanel = undefined; });

        return panel;
    }

    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor || editor.document.languageId !== 'python') {
            statusBar.hide();
            return;
        }
        triggerAnalysis();
    }, null, context.subscriptions);

    vscode.workspace.onDidChangeTextDocument(event => {
        if (vscode.window.activeTextEditor?.document === event.document) {
            triggerAnalysis();
        }
    }, null, context.subscriptions);

    triggerAnalysis();
}

function getFreshSnapshot(snapshot: AnalysisSnapshot | undefined, document: vscode.TextDocument): AnalysisSnapshot | undefined {
    if (document.languageId !== 'python') {
        return undefined;
    }

    return getFreshDocumentSnapshot(snapshot, document);
}

function getFreshDocumentSnapshot(snapshot: AnalysisSnapshot | undefined, document: vscode.TextDocument): AnalysisSnapshot | undefined {
    if (
        snapshot
        && snapshot.uri === document.uri.toString()
        && snapshot.version === document.version
    ) {
        return snapshot;
    }

    return undefined;
}

function analyzeDocument(context: vscode.ExtensionContext, document: vscode.TextDocument): Promise<AnalysisOutput> {
    const scriptPath = path.join(context.extensionPath, 'python', 'analyzer.py');
    return runAnalyzer(scriptPath, document.getText(), 0);
}

function runAnalyzer(scriptPath: string, source: string, commandIndex: number): Promise<AnalysisOutput> {
    const pythonCommand = pythonCommands[commandIndex];
    if (!pythonCommand) {
        return Promise.reject(new Error('No Python executable found. Tried python, python3, and py -3.'));
    }

    return new Promise((resolve, reject) => {
        const child = execFile(
            pythonCommand.command,
            [...pythonCommand.args, scriptPath, '-'],
            { timeout: 10000, maxBuffer: 1024 * 1024 * 50 },
            (error, stdout, stderr) => {
                if (error) {
                    const nodeError = error as NodeJS.ErrnoException;
                    if (nodeError.code === 'ENOENT') {
                        runAnalyzer(scriptPath, source, commandIndex + 1).then(resolve, reject);
                        return;
                    }

                    reject(new Error(stderr || error.message));
                    return;
                }

                try {
                    resolve(parseAnalysisOutput(stdout));
                } catch (parseError) {
                    reject(parseError);
                }
            }
        );

        child.stdin?.end(source);
    });
}

function parseAnalysisOutput(stdout: string): AnalysisOutput {
    const parsed = JSON.parse(stdout) as Partial<AnalysisOutput>;
    return {
        results: Array.isArray(parsed.results) ? parsed.results as AnalysisResult[] : [],
        nodes: Array.isArray(parsed.nodes) ? parsed.nodes as DagNode[] : [],
        edges: Array.isArray(parsed.edges) ? parsed.edges as DagEdge[] : [],
    };
}

function updateStatusBar(statusBar: vscode.StatusBarItem, results: AnalysisResult[]) {
    if (results.length === 0) {
        statusBar.hide();
        return;
    }

    const dataframeCount = results.filter(result => result.label === 'DataFrame created').length;
    const operationCount = results.length - dataframeCount;

    statusBar.text = `>> ${dataframeCount} dataframe${dataframeCount !== 1 ? 's' : ''} · ${operationCount} operation${operationCount !== 1 ? 's' : ''}`;
    statusBar.show();
}

function applyDecorations(
    editor: vscode.TextEditor,
    decorator: vscode.TextEditorDecorationType,
    results: AnalysisResult[]
) {
    const decorations: vscode.DecorationOptions[] = results
        .filter(result => result.line > 0 && result.line <= editor.document.lineCount)
        .map(result => {
            const line = result.line - 1;
            const lineLength = editor.document.lineAt(line).text.length;
            const range = new vscode.Range(line, lineLength, line, lineLength);
            return {
                range,
                renderOptions: {
                    after: { contentText: `  >> ${result.label}` },
                },
            };
        });

    editor.setDecorations(decorator, decorations);
}

function updateDagPanel(panel: vscode.WebviewPanel, output: AnalysisOutput) {
    void panel.webview.postMessage({
        type: 'graph',
        nodes: output.nodes,
        edges: output.edges,
    });
}

function buildDagHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { box-sizing: border-box; }
html, body { width: 100%; height: 100%; }
body {
    background: #181818;
    margin: 0;
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    overflow: hidden;
    color: var(--vscode-foreground, #d4d4d4);
}
#stage { position: fixed; inset: 0; }
canvas { display: block; width: 100%; height: 100%; }
#toolbar {
    align-items: center;
    background: rgba(37, 37, 38, 0.94);
    border: 1px solid rgba(128, 128, 128, 0.25);
    border-radius: 6px;
    display: flex;
    gap: 6px;
    left: 12px;
    padding: 6px;
    position: absolute;
    top: 12px;
}
button {
    background: #2d2d30;
    border: 1px solid #3f3f46;
    border-radius: 4px;
    color: var(--vscode-button-foreground, #fff);
    cursor: pointer;
    font: inherit;
    height: 28px;
    min-width: 32px;
    padding: 0 9px;
}
button:hover { background: #38383d; }
#stats {
    background: rgba(24, 24, 24, 0.78);
    border: 1px solid rgba(128, 128, 128, 0.18);
    border-radius: 6px;
    bottom: 12px;
    color: #c8c8c8;
    font-size: 12px;
    left: 12px;
    line-height: 1.5;
    padding: 7px 9px;
    position: absolute;
    user-select: none;
}
#hint {
    color: #858585;
    font-size: 12px;
    position: absolute;
    right: 12px;
    top: 16px;
    user-select: none;
}
</style>
</head>
<body>
<div id="stage">
    <canvas id="c"></canvas>
    <div id="toolbar">
        <button id="fit" title="Fit graph to view">Fit</button>
        <button id="zoomIn" title="Zoom in">+</button>
        <button id="zoomOut" title="Zoom out">-</button>
        <button id="reset" title="Reset selection and view">Reset</button>
    </div>
    <div id="hint">Drag to pan · Wheel to zoom · Click a node to trace lineage</div>
    <div id="stats">No pandas dataflow detected</div>
</div>
<script>
const vscode = acquireVsCodeApi();
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const stats = document.getElementById('stats');
const colors = { source: '#4EC9B0', transform: '#569CD6', merge: '#C586C0' };
const nodeW = 190;
const nodeH = 56;
const layerGap = 105;
const nodeGap = 30;
const minScale = 0.08;
const maxScale = 2.5;
let nodes = [];
let edges = [];
let nodeById = new Map();
let outgoing = new Map();
let incoming = new Map();
let selectedConnected = null;
let selectedId = null;
let hoveredId = null;
let view = { x: 0, y: 0, scale: 1 };
let graphBounds = { x: 0, y: 0, width: 1, height: 1 };
let dragging = false;
let dragStart = { x: 0, y: 0 };
let viewStart = { x: 0, y: 0 };
let movedDuringDrag = false;
let visibleNodeCache = [];
let raf = 0;
let needsFit = true;

function scheduleDraw() {
    if (raf) {
        return;
    }

    raf = requestAnimationFrame(() => {
        raf = 0;
        draw();
    });
}

function resizeCanvas() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (needsFit && nodes.length > 0) {
        fitToView();
    } else {
        scheduleDraw();
    }
}

function setGraph(nextNodes, nextEdges) {
    nodes = nextNodes.map(node => ({ ...node }));
    edges = nextEdges.map(edge => ({ ...edge }));
    selectedId = selectedId && nodes.some(node => node.id === selectedId) ? selectedId : null;
    hoveredId = null;
    selectedConnected = null;
    buildIndexes();
    layoutGraph();
    updateStats();
    needsFit = true;
    fitToView();
}

function buildIndexes() {
    nodeById = new Map(nodes.map(node => [node.id, node]));
    outgoing = new Map(nodes.map(node => [node.id, []]));
    incoming = new Map(nodes.map(node => [node.id, []]));

    edges = edges.filter(edge => nodeById.has(edge.from) && nodeById.has(edge.to));
    edges.forEach(edge => {
        outgoing.get(edge.from).push(edge);
        incoming.get(edge.to).push(edge);
    });
}

function layoutGraph() {
    if (nodes.length === 0) {
        graphBounds = { x: 0, y: 0, width: 1, height: 1 };
        return;
    }

    const indegree = new Map(nodes.map(node => [node.id, incoming.get(node.id).length]));
    const depth = new Map(nodes.map(node => [node.id, 0]));
    const queue = nodes.filter(node => indegree.get(node.id) === 0);
    let visited = 0;

    for (let i = 0; i < queue.length; i += 1) {
        const node = queue[i];
        visited += 1;
        outgoing.get(node.id).forEach(edge => {
            const nextDepth = Math.max(depth.get(edge.to), depth.get(edge.from) + 1);
            depth.set(edge.to, nextDepth);
            indegree.set(edge.to, indegree.get(edge.to) - 1);
            if (indegree.get(edge.to) === 0) {
                queue.push(nodeById.get(edge.to));
            }
        });
    }

    if (visited < nodes.length) {
        edges.forEach(edge => {
            depth.set(edge.to, Math.max(depth.get(edge.to), depth.get(edge.from) + 1));
        });
    }

    const layers = new Map();
    nodes.forEach(node => {
        const layer = depth.get(node.id) || 0;
        if (!layers.has(layer)) {
            layers.set(layer, []);
        }
        layers.get(layer).push(node);
    });

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    [...layers.entries()].forEach(([layer, layerNodes]) => {
        layerNodes.sort((a, b) => a.line - b.line || a.label.localeCompare(b.label));
        const layerWidth = layerNodes.length * nodeW + (layerNodes.length - 1) * nodeGap;
        const startX = -layerWidth / 2;
        const y = layer * (nodeH + layerGap);

        layerNodes.forEach((node, index) => {
            node.x = startX + index * (nodeW + nodeGap);
            node.y = y;
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x + nodeW);
            maxY = Math.max(maxY, node.y + nodeH);
        });
    });

    graphBounds = {
        x: minX - 80,
        y: minY - 80,
        width: Math.max(1, maxX - minX + 160),
        height: Math.max(1, maxY - minY + 160),
    };
}

function updateStats() {
    const sourceCount = nodes.filter(node => node.type === 'source').length;
    const mergeCount = nodes.filter(node => node.type === 'merge').length;
    const transformCount = nodes.filter(node => node.type === 'transform').length;
    stats.textContent = nodes.length === 0
        ? 'No pandas dataflow detected'
        : nodes.length + ' nodes · ' + edges.length + ' edges · ' + sourceCount + ' sources · ' + mergeCount + ' joins · ' + transformCount + ' transforms';
}

function getConnectedIds(id) {
    const connected = new Set([id]);
    const queueUp = [id];
    const queueDown = [id];

    while (queueUp.length > 0) {
        const nodeId = queueUp.shift();
        incoming.get(nodeId).forEach(edge => {
            if (!connected.has(edge.from)) {
                connected.add(edge.from);
                queueUp.push(edge.from);
            }
        });
    }

    while (queueDown.length > 0) {
        const nodeId = queueDown.shift();
        outgoing.get(nodeId).forEach(edge => {
            if (!connected.has(edge.to)) {
                connected.add(edge.to);
                queueDown.push(edge.to);
            }
        });
    }

    return connected;
}

function fitToView() {
    const rect = canvas.getBoundingClientRect();
    if (nodes.length === 0 || rect.width === 0 || rect.height === 0) {
        view = { x: rect.width / 2, y: rect.height / 2, scale: 1 };
        scheduleDraw();
        return;
    }

    const scaleX = (rect.width - 72) / graphBounds.width;
    const scaleY = (rect.height - 96) / graphBounds.height;
    const scale = clamp(Math.min(scaleX, scaleY), minScale, 1.35);
    view.scale = scale;
    view.x = rect.width / 2 - (graphBounds.x + graphBounds.width / 2) * scale;
    view.y = rect.height / 2 - (graphBounds.y + graphBounds.height / 2) * scale;
    needsFit = false;
    scheduleDraw();
}

function truncate(text, maxWidth) {
    let t = String(text);
    if (ctx.measureText(t).width <= maxWidth) {
        return t;
    }
    while (t.length > 0 && ctx.measureText(t + '...').width > maxWidth) {
        t = t.slice(0, -1);
    }
    return t + '...';
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function screenToWorld(x, y) {
    return {
        x: (x - view.x) / view.scale,
        y: (y - view.y) / view.scale,
    };
}

function worldToScreen(x, y) {
    return {
        x: x * view.scale + view.x,
        y: y * view.scale + view.y,
    };
}

function visibleWorldBounds() {
    const rect = canvas.getBoundingClientRect();
    const topLeft = screenToWorld(0, 0);
    const bottomRight = screenToWorld(rect.width, rect.height);
    const pad = 120 / view.scale;
    return {
        left: topLeft.x - pad,
        top: topLeft.y - pad,
        right: bottomRight.x + pad,
        bottom: bottomRight.y + pad,
    };
}

function isNodeVisible(node, bounds) {
    return node.x + nodeW >= bounds.left
        && node.x <= bounds.right
        && node.y + nodeH >= bounds.top
        && node.y <= bounds.bottom;
}

function drawEmptyState() {
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#858585';
    ctx.font = '13px var(--vscode-font-family, system-ui, sans-serif)';
    ctx.textAlign = 'center';
    ctx.fillText('No pandas dataflow detected in the active editor', rect.width / 2, rect.height / 2);
    ctx.textAlign = 'left';
}

function draw() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (nodes.length === 0) {
        drawEmptyState();
        return;
    }

    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);

    const bounds = visibleWorldBounds();
    const connected = selectedConnected;
    let visibleNodes = 0;
    let visibleEdges = 0;
    visibleNodeCache = [];

    edges.forEach(edge => {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        if (!from || !to || (!isNodeVisible(from, bounds) && !isNodeVisible(to, bounds))) {
            return;
        }
        visibleEdges += 1;

        const isHighlighted = connected && connected.has(edge.from) && connected.has(edge.to);
        const isDimmed = connected && !isHighlighted;
        const startX = from.x + nodeW / 2;
        const startY = from.y + nodeH;
        const endX = to.x + nodeW / 2;
        const endY = to.y;
        const midY = startY + Math.max(36, (endY - startY) / 2);

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.bezierCurveTo(startX, midY, endX, midY, endX, endY);
        ctx.strokeStyle = isHighlighted ? '#dddddd' : (isDimmed ? '#2a2a2a' : '#555');
        ctx.lineWidth = (isHighlighted ? 2.5 : 1.25) / view.scale;
        ctx.stroke();

        if (view.scale > 0.16 || isHighlighted) {
            const arrow = 7 / view.scale;
            const ax = endX;
            const ay = endY;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax - arrow, ay - arrow * 1.45);
            ctx.lineTo(ax + arrow, ay - arrow * 1.45);
            ctx.fillStyle = isHighlighted ? '#dddddd' : (isDimmed ? '#2a2a2a' : '#555');
            ctx.fill();
        }
    });

    nodes.forEach(node => {
        if (!isNodeVisible(node, bounds)) {
            return;
        }
        visibleNodes += 1;
        visibleNodeCache.push(node);

        const isSelected = node.id === selectedId;
        const isHovered = node.id === hoveredId;
        const isConnected = connected && connected.has(node.id);
        const isDimmed = connected && !isConnected;
        const color = colors[node.type] || '#888';
        const borderColor = isSelected ? '#fff' : (isHovered ? '#dcdcaa' : (isDimmed ? '#333' : color));
        const bgColor = isSelected ? '#333842' : (isDimmed ? '#1c1c1c' : '#252526');
        const textColor = isDimmed ? '#444' : color;
        const subTextColor = isDimmed ? '#333' : '#c0c0c0';

        ctx.beginPath();
        ctx.roundRect(node.x, node.y, nodeW, nodeH, 7);
        ctx.fillStyle = bgColor;
        ctx.fill();
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = (isSelected || isHovered ? 2.25 : 1.4) / view.scale;
        ctx.stroke();

        if (view.scale < 0.18 && !isSelected && !isHovered) {
            return;
        }

        ctx.fillStyle = textColor;
        ctx.font = 'bold 13px var(--vscode-editor-font-family, monospace)';
        ctx.fillText(truncate(node.label, nodeW - 22), node.x + 11, node.y + 21);

        ctx.fillStyle = subTextColor;
        ctx.font = '11px var(--vscode-editor-font-family, monospace)';
        ctx.fillText(truncate(node.operation, nodeW - 22), node.x + 11, node.y + 39);

        ctx.fillStyle = isDimmed ? '#333' : '#858585';
        ctx.font = '10px var(--vscode-editor-font-family, monospace)';
        ctx.fillText('line ' + node.line, node.x + nodeW - 48, node.y + 45);
    });

    ctx.restore();

    if (nodes.length > 0) {
        const base = nodes.length + ' nodes · ' + edges.length + ' edges';
        stats.textContent = base + ' · showing ' + visibleNodes + ' nodes / ' + visibleEdges + ' edges · ' + Math.round(view.scale * 100) + '%';
    }
}

function getNodeAt(x, y) {
    const point = screenToWorld(x, y);
    const candidates = visibleNodeCache.length > 0 ? visibleNodeCache : nodes;
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
        const node = candidates[i];
        if (
            point.x >= node.x
            && point.x <= node.x + nodeW
            && point.y >= node.y
            && point.y <= node.y + nodeH
        ) {
            return node;
        }
    }
    return null;
}

function zoomAt(clientX, clientY, nextScale) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const before = screenToWorld(x, y);
    view.scale = clamp(nextScale, minScale, maxScale);
    view.x = x - before.x * view.scale;
    view.y = y - before.y * view.scale;
    needsFit = false;
    scheduleDraw();
}

canvas.addEventListener('click', event => {
    if (movedDuringDrag) {
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const node = getNodeAt(x, y);

    selectedId = node ? (selectedId === node.id ? null : node.id) : null;
    selectedConnected = selectedId ? getConnectedIds(selectedId) : null;
    scheduleDraw();
});

canvas.addEventListener('mousedown', event => {
    dragging = true;
    movedDuringDrag = false;
    dragStart = { x: event.clientX, y: event.clientY };
    viewStart = { x: view.x, y: view.y };
});

canvas.addEventListener('mousemove', event => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (dragging) {
        const dx = event.clientX - dragStart.x;
        const dy = event.clientY - dragStart.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) {
            movedDuringDrag = true;
        }
        view.x = viewStart.x + dx;
        view.y = viewStart.y + dy;
        needsFit = false;
        scheduleDraw();
        return;
    }

    const hovered = getNodeAt(x, y);
    const nextHoveredId = hovered ? hovered.id : null;
    if (nextHoveredId !== hoveredId) {
        hoveredId = nextHoveredId;
        canvas.style.cursor = hovered ? 'pointer' : 'grab';
        scheduleDraw();
    }
});

window.addEventListener('mouseup', () => {
    dragging = false;
});

canvas.addEventListener('mouseleave', () => {
    dragging = false;
    hoveredId = null;
    canvas.style.cursor = 'default';
    scheduleDraw();
});

canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 0.89;
    zoomAt(event.clientX, event.clientY, view.scale * factor);
}, { passive: false });

document.getElementById('fit').addEventListener('click', fitToView);
document.getElementById('zoomIn').addEventListener('click', () => {
    const rect = canvas.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, view.scale * 1.18);
});
document.getElementById('zoomOut').addEventListener('click', () => {
    const rect = canvas.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, view.scale * 0.84);
});
document.getElementById('reset').addEventListener('click', () => {
    selectedId = null;
    selectedConnected = null;
    fitToView();
});

window.addEventListener('resize', () => {
    resizeCanvas();
});

window.addEventListener('message', event => {
    if (event.data.type === 'graph') {
        setGraph(event.data.nodes || [], event.data.edges || []);
    }
});

resizeCanvas();
setGraph([], []);
vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}

export function deactivate() {}
