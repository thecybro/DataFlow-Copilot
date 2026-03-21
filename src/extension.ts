import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as path from 'path';
// >>
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

export function activate(context: vscode.ExtensionContext) {
    console.log('DataFlow Copilot is active');

    const decorator = vscode.window.createTextEditorDecorationType({
        after: {
            margin: '0 0 0 2em',
            color: '#4ec9b05d',
            fontStyle: 'italic'
        }
    });

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.tooltip = 'DataFlow Copilot — click to open DAG panel';
    statusBar.command = 'dataflow-copilot.showDag';
    context.subscriptions.push(statusBar);

    let dagPanel: vscode.WebviewPanel | undefined;
    let lastOutput: AnalysisOutput | undefined; 

    context.subscriptions.push(
        vscode.commands.registerCommand('dataflow-copilot.showDag', () => {
            if (dagPanel) {
                dagPanel.reveal(vscode.ViewColumn.Beside);
            } else {
                dagPanel = vscode.window.createWebviewPanel(
                    'dataflowDag',
                    'DataFlow DAG',
                    vscode.ViewColumn.Beside,
                    { enableScripts: true }
                );
                dagPanel.onDidDispose(() => { dagPanel = undefined; });

                if (lastOutput) {
                    dagPanel.webview.html = buildDagHtml(lastOutput.nodes, lastOutput.edges);
                }
                else {
                    triggerAnalysis();
                }
            }
        })
    );
    
    const hoverProvider = vscode.languages.registerHoverProvider('python', {
        provideHover(document, position) {
            const filePath = document.fileName;
            const scriptPath = path.join(context.extensionPath, 'python', 'analyzer.py');

            return new Promise((resolve) => {
                execFile('python', [scriptPath, filePath], { timeout: 10000 }, (error, stdout) => {
                    if (error) { resolve(undefined); return; }

                    try {
                        const output: AnalysisOutput = JSON.parse(stdout);
                        const line = position.line + 1;
                        const match = output.results.find(r => r.line === line);

                        if (!match) { resolve(undefined); return; }

                        const inputText = match.inputs.length > 0
                            ? `**Inputs:** \`${match.inputs.join('`, `')}\``
                            : '**Inputs:** none (source)';

                        const md = new vscode.MarkdownString();
                        md.isTrusted = true;
                        md.appendMarkdown(`### DataFlow Copilot\n`);
                        md.appendMarkdown(`**Variable:** \`${match.variable}\`\n\n`);
                        md.appendMarkdown(`**Operation:** ${match.label}\n\n`);
                        md.appendMarkdown(`**Type:** \`${match.type}\`\n\n`);
                        md.appendMarkdown(`${inputText}\n\n`);
                        md.appendMarkdown(`*Line ${match.line}*`);

                        resolve(new vscode.Hover(md));
                    } catch {
                        resolve(undefined);
                    }
                });
            });
        }
    });

    context.subscriptions.push(hoverProvider);

    let timeout: NodeJS.Timeout | undefined;

    function triggerAnalysis() {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(runAnalysis, 800);
    }

    function runAnalysis() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'python') return;

        const filePath = editor.document.fileName;
        const scriptPath = path.join(context.extensionPath, 'python', 'analyzer.py');

        console.log('Running analyzer:', scriptPath, 'on file:', filePath);

        execFile('python', [scriptPath, filePath], { timeout: 10000 }, (error, stdout, stderr) => {
            if (error) {
                console.error('Analyzer error:', error.message);
                console.error('stderr:', stderr);
                return;
            }

            try {
                const output: AnalysisOutput = JSON.parse(stdout);
                lastOutput = output;
                applyDecorations(editor, decorator, output.results);
                updateStatusBar(statusBar, output.results);

                if (dagPanel) {
                    dagPanel.webview.html = buildDagHtml(output.nodes, output.edges);
                }
            } catch (e) {
                console.error('Failed to parse analyzer output:', e);
            }
        });
    }

    vscode.window.onDidChangeActiveTextEditor(editor => {
        triggerAnalysis();
        if (!editor || editor.document.languageId !== 'python') {
            statusBar.hide();
        }
    }, null, context.subscriptions);

    vscode.workspace.onDidChangeTextDocument(e => {
        if (vscode.window.activeTextEditor?.document === e.document) {
            triggerAnalysis();
        }
    }, null, context.subscriptions);

    triggerAnalysis();
}

function updateStatusBar(statusBar: vscode.StatusBarItem, results: AnalysisResult[]) {
    if (results.length === 0) {
        statusBar.hide();
        return;
    }
    const dfCount = results.filter(r => r.label === 'DataFrame created').length;
    const opCount = results.filter(r => r.label !== 'DataFrame created').length;
    statusBar.text = `>> ${dfCount} Dataframe${dfCount !== 1 ? 's' : ''} · ${opCount} Operation${opCount !== 1 ? 's' : ''}`;
    console.log('Status bar update:', statusBar.text);
    statusBar.show();
}

function applyDecorations(
    editor: vscode.TextEditor,
    decorator: vscode.TextEditorDecorationType,
    results: AnalysisResult[]
) {
    const decorations: vscode.DecorationOptions[] = results.map(r => {
        const line = Math.max(0, r.line - 1);
        const lineLength = editor.document.lineAt(line).text.length;
        const range = new vscode.Range(line, lineLength, line, lineLength);
        return {
            range,
            renderOptions: {
                after: { contentText: `  >> ${r.label}` }
            }
        };
    });
    editor.setDecorations(decorator, decorations);
}

function buildDagHtml(nodes: DagNode[], edges: DagEdge[]): string {
    const nodesJson = JSON.stringify(nodes);
    const edgesJson = JSON.stringify(edges);

    return `<!DOCTYPE html>
            <html>
            <head>
            <style>
            body { background: #1e1e1e; margin: 0; font-family: monospace; overflow: hidden; }
            canvas { display: block; }
            #info { position: absolute; top: 10px; left: 10px; color: #4EC9B0; font-size: 12px; }
            </style>
            </head>
            <body>
            <div id="info">DataFlow DAG</div>
            <canvas id="c"></canvas>
            <script>
            const nodes = ${nodesJson};
            const edges = ${edgesJson};

            const canvas = document.getElementById('c');
            const ctx = canvas.getContext('2d');

            const colors = {
            source: '#4EC9B0',
            transform: '#569CD6',
            merge: '#C586C0'
            };

            const nodeW = 160;
            const nodeH = 50;
            const paddingX = 40;
            const paddingY = 80;

            const nodeMap = {};
            nodes.forEach(n => { nodeMap[n.id] = n; });

            let selectedId = null;

            function getConnectedIds(id) {
            const connected = new Set();
            connected.add(id);

            // for upstream
            function walkUp(nid) {
                edges.filter(e => e.to === nid).forEach(e => {
                if (!connected.has(e.from)) {
                    connected.add(e.from);
                    walkUp(e.from);
                }
                });
            }

            // for downstream
            function walkDown(nid) {
                edges.filter(e => e.from === nid).forEach(e => {
                if (!connected.has(e.to)) {
                    connected.add(e.to);
                    walkDown(e.to);
                }
                });
            }

            walkUp(id);
            walkDown(id);
            return connected;
            }

            function assignDepths() {
            const depth = {};
            nodes.forEach(n => depth[n.id] = 0);
            let changed = true;
            while (changed) {
                changed = false;
                edges.forEach(e => {
                const newDepth = (depth[e.from] || 0) + 1;
                if (newDepth > (depth[e.to] || 0)) {
                    depth[e.to] = newDepth;
                    changed = true;
                }
                });
            }
            return depth;
            }

            function positionAllNodes() {
            const depth = assignDepths();
            const layers = {};
            nodes.forEach(n => {
                const d = depth[n.id] || 0;
                if (!layers[d]) layers[d] = [];
                layers[d].push(n);
            });

            const numLayers = Object.keys(layers).length;
            const totalH = numLayers * (nodeH + paddingY);
            const offsetY = Math.max(60, (canvas.height - totalH) / 2);

            Object.entries(layers).forEach(([d, layerNodes]) => {
                const layerW = layerNodes.length * (nodeW + paddingX) - paddingX;
                const offsetX = (canvas.width - layerW) / 2;
                layerNodes.forEach((n, i) => {
                n.x = offsetX + i * (nodeW + paddingX);
                n.y = offsetY + parseInt(d) * (nodeH + paddingY);
                });
            });
            }

            function truncate(text, maxWidth) {
            let t = String(text);
            if (ctx.measureText(t).width <= maxWidth) return t;
            while (t.length > 0 && ctx.measureText(t + '...').width > maxWidth) {
                t = t.slice(0, -1);
            }
            return t + '...';
            }

            function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const connected = selectedId ? getConnectedIds(selectedId) : null;

            edges.forEach(e => {
                const from = nodeMap[e.from];
                const to = nodeMap[e.to];
                if (!from || !to || from.x === undefined || to.x === undefined) return;

                const isHighlighted = connected &&
                connected.has(e.from) && connected.has(e.to);

                ctx.beginPath();
                ctx.moveTo(from.x + nodeW / 2, from.y + nodeH);
                ctx.lineTo(to.x + nodeW / 2, to.y);
                ctx.strokeStyle = isHighlighted ? '#aaa' : (connected ? '#2a2a2a' : '#555');
                ctx.lineWidth = isHighlighted ? 2.5 : 1.5;
                ctx.stroke();

                const ax = to.x + nodeW / 2;
                const ay = to.y;
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.lineTo(ax - 6, ay - 10);
                ctx.lineTo(ax + 6, ay - 10);
                ctx.fillStyle = isHighlighted ? '#aaa' : (connected ? '#2a2a2a' : '#555');
                ctx.fill();
            });

            nodes.forEach(n => {
                if (n.x === undefined) return;

                const isSelected = n.id === selectedId;
                const isConnected = connected && connected.has(n.id);
                const isDimmed = connected && !isConnected;

                const color = colors[n.type] || '#888';
                const borderColor = isSelected ? '#fff' : (isDimmed ? '#333' : color);
                const bgColor = isSelected ? '#3a3a3a' : (isDimmed ? '#1a1a1a' : '#2d2d2d');
                const textColor = isDimmed ? '#444' : color;
                const subTextColor = isDimmed ? '#333' : '#888';

                ctx.beginPath();
                ctx.roundRect(n.x, n.y, nodeW, nodeH, 8);
                ctx.fillStyle = bgColor;
                ctx.fill();
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = isSelected ? 2.5 : 1.5;
                ctx.stroke();

                ctx.fillStyle = textColor;
                ctx.font = 'bold 13px monospace';
                ctx.fillText(truncate(n.label, nodeW - 20), n.x + 10, n.y + 20);

                ctx.fillStyle = subTextColor;
                ctx.font = '11px monospace';
                ctx.fillText(truncate(n.operation, nodeW - 20), n.x + 10, n.y + 38);

                ctx.fillStyle = isDimmed ? '#333' : '#555';
                ctx.font = '10px monospace';
                ctx.fillText('line ' + n.line, n.x + nodeW - 45, n.y + 44);
            });
            }

            function getNodeAt(x, y) {
            return nodes.find(n =>
                n.x !== undefined &&
                x >= n.x && x <= n.x + nodeW &&
                y >= n.y && y <= n.y + nodeH
            );
            }

            canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const node = getNodeAt(x, y);

            if (node) {
                selectedId = selectedId === node.id ? null : node.id;
            } else {
                selectedId = null;
            }
            draw();
            });

            canvas.style.cursor = 'default';
            canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            canvas.style.cursor = getNodeAt(x, y) ? 'pointer' : 'default';
            });

            function init() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            positionAllNodes();
            draw();
            }

            window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            positionAllNodes();
            draw();
            });

            init();
            </script>
            </body>
            </html>`;
            }

export function deactivate() {}