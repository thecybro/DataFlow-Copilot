# DataFlow Copilot

**Static dataflow analysis for pandas. See your pipeline's logic without running a single line of code.**

[![Version](https://img.shields.io/badge/version-0.1.0--alpha-blue.svg)](https://github.com/Revguard/DataFlow-Copilot)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Python](https://img.shields.io/badge/python-3.8%2B-blue.svg)
![VSCode](https://img.shields.io/badge/vscode-1.109%2B-blue.svg)

---

## What is this?

If you've ever scrolled through a 300-line pandas script and lost track of which dataframe is which, or wondered what your data looks like after five chained operations, **DataFlow Copilot** is for you.

It reads your Python file using **AST (Abstract Syntax Tree)** parsing, which means no code execution, no runtime, no waiting for datasets to load. It annotates your editor inline, shows a live summary in the status bar, renders a visual flow graph of how your dataframes connect, and gives you rich hover tooltips on every operation.

**Why static analysis?**
- **Zero runtime overhead:** Works instantly on any file size
- **Privacy first:** Your data never leaves your machine
- No dependencies to install in your project
- Annotations update as you type, not after you run

---

## Features

### Inline Annotations

Every pandas operation gets a label on the right side of the line, right where you're already looking.

```python
df     = pd.read_csv("accounts.csv")        >> DataFrame created
df2    = pd.read_csv("tickets.csv")         >> DataFrame created
merged = pd.merge(df, df2, on="id")         >> Merge
clean  = merged.dropna()                    >> Null rows dropped
filled = clean.fillna(0)                    >> Nulls filled
```

No popups. No interruptions. Just context where you need it.

---

### Status Bar Summary

The bottom-right of your editor shows a live count of dataframes and operations in the current file. Click it to open the DAG panel.

```
>> 2 dataframes · 3 operations
```

---

### DAG Sidebar Panel

A visual flow graph that shows how data moves through your script — which dataframes feed into which operations, color-coded by type.

- **Teal:** source dataframes (`read_csv`, `read_excel`, `pd.DataFrame`, etc.)
- **Blue:** transforms (`dropna`, `fillna`, `rename`, `groupby`, `drop`)
- **Purple:** merge and concat operations

The panel updates live as you edit. Open it via the status bar or the command palette (`Ctrl+Shift+P` → `DataFlow: Show DAG Panel`).

**Interaction:**
- Click any node to highlight its full upstream and downstream path
- Everything unrelated dims out so you can trace the flow clearly
- Click the same node again or click empty space to deselect
- **Resize the panel freely:** The graph recenters automatically
- Long variable names are truncated cleanly inside node boxes

---

### Hover Tooltips

Hover over any pandas line for a detailed breakdown:

- Variable name
- Operation type
- Operation category (source / transform / merge)
- Input dataframes that fed into this operation
- Line number

---

## How it works

```
Your .py file
     │
     ▼
Python AST parser (analyzer.py)
     │  reads file without executing it
     │  detects pandas operations
     │  traces dataframe lineage
     │  outputs JSON (results + nodes + edges)
     │
     ▼
TypeScript / VSCode layer (extension.ts)
     │  applies inline decorations
     │  updates status bar
     │  renders DAG webview
     │  serves hover tooltips
```

No servers. No API calls. No internet connection required. Everything runs locally inside VSCode.

---

## Supported operations

| Category | Operations |
|---|---|
| **Ingestion** | `read_csv`, `read_excel`, `read_json`, `pd.DataFrame()` |
| **Cleaning** | `dropna`, `fillna`, `drop`, `rename` |
| **Analysis** | `groupby` |
| **Combining** | `merge`, `concat` |

---

## Requirements

- Python 3.8+ accessible via `python` in your terminal
- VSCode 1.109.0 or higher
- A `.py` file using pandas

---

## Getting started

1. Install the extension
2. Open any Python file that uses pandas
3. Inline annotations appear automatically
4. Click the status bar item or open the command palette and run `DataFlow: Show DAG Panel`
5. Hover over any pandas line to see the tooltip

---

## Known limitations

Since this is a static analysis tool, there are real trade-offs:

- **Dynamic code:** Dataframes built inside loops, list comprehensions, or via `exec()` are not tracked
- **Method chaining:** `df.dropna().rename().fillna()` on a single line is not yet supported; assign each step to a variable for full tracking
- **Shape inference:** Row and column counts require actually running the code; we show operation type, not dimensions
- **Pandas only:** Polars, sklearn, and other libraries are not yet supported

---

## Roadmap

- [ ] Method chaining support
- [ ] Zoom and pan in the DAG panel
- [ ] Curved edge routing in the DAG
- [ ] Polars support
- [ ] Optional runtime hook for exact shape inference
- [ ] Export DAG as SVG or PNG

---

## Built by

Built by **Cybro** as a tool to save us from headache trying to figure out the dataflow in our python projects. We needed this ourselves, so we built it in the open.

Found a bug or have a feature request? Open an issue.
Or reach out via [Twitter/X](https://x.com/@The_Cybro).

This is early software and we're actively improving it.