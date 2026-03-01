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

export function activate(context: vscode.ExtensionContext) {
    console.log('DataFlow Copilot is active');

    const decorator = vscode.window.createTextEditorDecorationType({
        after: {
            margin: '0 0 0 2em',
            color: '#4EC9B0',
            fontStyle: 'italic'
        }
    });

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.tooltip = 'DataFlow Copilot — click to open DAG panel';
    statusBar.command = 'dataflow-copilot.showDag';
    context.subscriptions.push(statusBar);

    let dagPanel: vscode.WebviewPanel | undefined;

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
    statusBar.text = `>> ${dfCount} dataframe${dfCount !== 1 ? 's' : ''} · ${opCount} operation${opCount !== 1 ? 's' : ''}`;
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
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            const colors = {
            source: '#4EC9B0',
            transform: '#569CD6',
            merge: '#C586C0'
            };

            const nodeMap = {};
            nodes.forEach((n, i) => { nodeMap[n.id] = n; });

            const levelH = 110;
            const nodeW = 160;
            const nodeH = 50;
            const startX = canvas.width / 2 - nodeW / 2;
            const startY = 60;

            nodes.forEach((n, i) => {
            n.x = startX + (i % 3 - 1) * 200;
            n.y = startY + i * levelH;
            });

            const positioned = new Set();
            function positionNode(node, x, y) {
            node.x = x;
            node.y = y;
            positioned.add(node.id);
            const children = edges.filter(e => e.from === node.id).map(e => nodeMap[e.to]);
            children.forEach((child, i) => {
                if (!positioned.has(child.id)) {
                positionNode(child, x + (i - (children.length-1)/2) * 220, y + levelH);
                }
            });
            }

            const roots = nodes.filter(n => !edges.some(e => e.to === n.id));
            roots.forEach((r, i) => positionNode(r, 100 + i * 250, 60));

            function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            edges.forEach(e => {
                const from = nodeMap[e.from];
                const to = nodeMap[e.to];
                if (!from || !to) return;
                ctx.beginPath();
                ctx.moveTo(from.x + nodeW/2, from.y + nodeH);
                ctx.lineTo(to.x + nodeW/2, to.y);
                ctx.strokeStyle = '#555';
                ctx.lineWidth = 2;
                ctx.stroke();

                const ax = to.x + nodeW/2;
                const ay = to.y;
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.lineTo(ax - 6, ay - 10);
                ctx.lineTo(ax + 6, ay - 10);
                ctx.fillStyle = '#555';
                ctx.fill();
            });

            nodes.forEach(n => {
                const color = colors[n.type] || '#888';
                ctx.beginPath();
                ctx.roundRect(n.x, n.y, nodeW, nodeH, 8);
                ctx.fillStyle = '#2d2d2d';
                ctx.fill();
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.fillStyle = color;
                ctx.font = 'bold 13px monospace';
                ctx.fillText(n.label, n.x + 10, n.y + 20);

                ctx.fillStyle = '#888';
                ctx.font = '11px monospace';
                ctx.fillText(n.operation, n.x + 10, n.y + 38);

                ctx.fillStyle = '#555';
                ctx.font = '10px monospace';
                ctx.fillText('line ' + n.line, n.x + nodeW - 45, n.y + 44);
            });
            }

            draw();
            window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            draw();
            });
            </script>
            </body>
            </html>
            `;
            }

export function deactivate() {}