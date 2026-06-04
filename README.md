# DataFlow Copilot

**A VS Code extension for tracing pandas dataframe flow without running your script.**

[![Version](https://img.shields.io/badge/version-0.0.4-blue.svg)](https://github.com/Revguard/DataFlow-Copilot)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Python](https://img.shields.io/badge/python-3.8%2B-blue.svg)
![VSCode](https://img.shields.io/badge/vscode-1.109%2B-blue.svg)

---

## What It Does

DataFlow Copilot reads Python files with AST parsing and looks for common pandas dataframe operations. It does not execute your code, load datasets, import your project, or send anything anywhere.

The goal is simple: when a pandas script gets long enough that `df`, `cleaned`, `merged`, and `summary` all start blurring together, the extension gives you a map.

It currently adds:

- Inline annotations next to detected pandas operations
- A status bar count of dataframe sources and operations
- Hover details for each detected operation
- An interactive DAG panel showing how dataframes feed into each other

It is most useful for scripts where important dataframe steps are assigned to variables:

```python
accounts = pd.read_csv("accounts.csv")
tickets = pd.read_csv("tickets.csv")
merged = pd.merge(accounts, tickets, on="account_id")
clean = merged.dropna()
summary = clean.groupby("team", as_index=False).count()
```

---

## Installation

> Requires Python 3.8+ and VS Code 1.109+

### Install From a `.vsix`

1. Download `dataflow-copilot-0.0.4.vsix` from the [latest GitHub release](https://github.com/Revguard/DataFlow-Copilot/releases/latest)
2. Open VS Code
3. Run `Extensions: Install from VSIX...` from the command palette
4. Pick the downloaded file
5. Reload VS Code if prompted

### Install From Terminal

```bash
code --install-extension dataflow-copilot-0.0.4.vsix
```

You can also download this release directly once the VSIX is attached to GitHub Releases:

```text
https://github.com/Revguard/DataFlow-Copilot/releases/download/v0.0.4/dataflow-copilot-0.0.4.vsix
```

The extension tries `python`, then `python3`, then `py -3` when it needs to run the local analyzer.

---

## Quick Start

Open a Python file with pandas code:

```python
import pandas as pd

accounts = pd.read_csv("accounts.csv")      # >> DataFrame created
tickets = pd.read_csv("tickets.csv")        # >> DataFrame created
merged = pd.merge(accounts, tickets, on="id") # >> Merged
clean = merged.dropna()                     # >> Null rows dropped
filled = clean.fillna(0)                    # >> Nulls filled
```

After a short pause, you should see:

- Inline labels at the end of supported pandas lines
- A status bar item like `>> 2 dataframes · 3 operations`
- Hover cards with operation type, variable name, inputs, and line number
- A DAG panel from `DataFlow: Show DAG Panel`

No project setup is required.

---

## DAG Panel

The DAG panel is the main view for understanding a larger pipeline. It draws one node per detected dataframe-producing step and connects nodes when an operation uses an earlier dataframe.

Node colors:

| Color | Meaning |
|---|---|
| Teal | Dataframe sources such as `read_csv`, `read_excel`, `read_json`, and `pd.DataFrame` |
| Blue | Transform steps such as `dropna`, `fillna`, `rename`, `drop`, and `groupby` |
| Purple | Combining steps such as `merge` and `concat` |

What you can do in the panel:

- Drag to pan around the graph
- Use the mouse wheel to zoom
- Click `Fit` to bring the whole graph back into view
- Click a node to highlight its upstream and downstream lineage
- Click the same node again, empty space, or `Reset` to clear the selection
- Resize the panel; the canvas redraws itself for the new space

The graph is rendered as a long-lived canvas view. It updates in place as analysis results change, and it only draws visible nodes and edges while you pan and zoom. That keeps it usable on bigger scripts instead of rebuilding the whole panel every time.

---

## Supported Patterns

DataFlow Copilot is intentionally conservative. It tracks patterns that are common, readable, and useful in real pandas scripts.

| Category | Examples |
|---|---|
| Sources | `pd.read_csv(...)`, `pd.read_excel(...)`, `pd.read_json(...)`, `pd.DataFrame(...)` |
| Cleaning | `df.dropna()`, `df.fillna(...)`, `df.drop(...)`, `df.rename(...)` |
| Grouping | `df.groupby(...).count()`, `df.groupby(...).sum()` when assigned to a variable |
| Combining | `pd.merge(left, right, ...)`, `left.merge(right, ...)`, `pd.concat([a, b, c])` |
| Reassignment | `df = df.fillna(...)`, `df = df.rename(...)`, `df = df.dropna()` |

The analyzer understands normal pandas aliases:

```python
import pandas as pd
import pandas
```

It also analyzes the live editor buffer, so unsaved changes can show up after the normal typing pause.

---

## What It Does Not Do

This is static analysis, so there are limits.

- It does not run your code.
- It does not know row counts, column counts, schemas, or actual values.
- It does not follow runtime control flow through loops, functions, comprehensions, `eval`, or `exec`.
- It does not fully model long one-line method chains such as `df.dropna().rename(...).fillna(...)`.
- It does not track dataframes through every possible Python expression.
- It is focused on pandas, not Polars, Spark, sklearn, or SQL engines.

For best results, assign meaningful steps to variables:

```python
clean = raw.dropna()
renamed = clean.rename(columns={"id": "account_id"})
summary = renamed.groupby("team", as_index=False).count()
```

That style is easier for people to review and easier for the extension to map.

---

## Troubleshooting

**No annotations show up**

Make sure the file is detected as Python and contains supported pandas operations assigned to variables. The extension runs the analyzer with `python`, `python3`, or `py -3`, so at least one of those should be available on your PATH.

**The DAG panel is empty**

The current file may not have any supported dataframe operations, or the analyzer may not have run yet. Click back into the Python editor and wait for the typing pause, then open `DataFlow: Show DAG Panel` again.

**The graph is huge**

Use `Fit`, zoom out, then click the part of the graph you care about. Selecting a node dims unrelated paths so you can follow one lineage through a large script.

**A pandas line is not detected**

It may be outside the supported patterns. Try assigning the operation to a variable and breaking long chains into separate steps.

---

## Development

```bash
npm install
npm run compile
npm run lint
```

To run the analyzer directly:

```bash
python3 python/analyzer.py test.py
```

`test.py` is intentionally a large, busy pandas pipeline. It is there so the extension has something realistic to chew on while you test annotations, hovers, status counts, and the DAG.

---

## Roadmap

- Better support for multi-step method chains
- Search and jump-to-node inside the DAG
- Export DAG as SVG or PNG
- Optional runtime mode for exact shapes and columns
- Polars support

---

## Built By

Built by **Cybro** to make pandas scripts easier to reason about before you run them.

Found a bug or have a feature request? [Open an issue](https://github.com/Revguard/DataFlow-Copilot/issues) or reach out on [Twitter/X](https://x.com/@The_Cybro).

This is still early software, but the goal is steady: make dataframe-heavy Python files easier to read, review, and trust.
