# DataFlow Copilot

**Static dataflow analysis for pandas. See your pipeline's logic without running a single line of code.**

[![Version](https://img.shields.io/badge/version-0.1.0--alpha-blue.svg)](https://github.com/Revguard/DataFlow-Copilot)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Python](https://img.shields.io/badge/python-3.8%2B-blue.svg)
![VSCode](https://img.shields.io/badge/vscode-1.109%2B-blue.svg)

---

## What is this?

If you've ever scrolled through a 300-line pandas script and lost track of which dataframe is which, or wondered what your data looks like after five chained operations, **DataFlow Copilot** is for you.

It reads your Python file using **AST (Abstract Syntax Tree)** parsing — no code execution, no runtime, no waiting for datasets to load. It annotates your editor inline, shows a live summary in the status bar, renders a visual flow graph of how your dataframes connect, and gives you rich hover tooltips on every operation.

**Why static analysis?**
- **Zero runtime overhead:** Works instantly on any file size
- **Privacy first:** Your data never leaves your machine
- No dependencies to install in your project
- Annotations update as you type, not after you run

---

## Installation

> **Requires:** Python 3.8+ and VSCode 1.109+

### Option 1: Install from .vsix file

1. Download `dataflow-copilot-0.0.1.vsix` from the [releases page](https://github.com/Revguard/DataFlow-Copilot/releases)
2. Open VSCode
3. Press `Ctrl+Shift+P` to open the command palette
4. Type `Extensions: Install from VSIX` and select it
5. Navigate to the downloaded `.vsix` file and open it
6. Reload VSCode when prompted

### Option 2: Install from terminal

```bash
# This option might not work sometimes
code --install-extension dataflow-copilot-0.0.1.vsix
```

### Verify it's working

Open any `.py` file that uses pandas. Within a second you should see `>> DataFrame created` annotations appear to the right of your `pd.read_csv()` lines and a counter in the bottom-right status bar.

---

## Quick start

```python
import pandas as pd

df     = pd.read_csv("accounts.csv")       # >> DataFrame created
df2    = pd.read_csv("tickets.csv")        # >> DataFrame created
merged = pd.merge(df, df2, on="id")        # >> Merge
clean  = merged.dropna()                   # >> Null rows dropped
filled = clean.fillna(0)                   # >> Nulls filled
```

1. Open any `.py` file with pandas: annotations appear automatically
2. Check the bottom-right status bar: `>> 2 dataframes · 3 operations`
3. Click the status bar item or press `Ctrl+Shift+P` → `DataFlow: Show DAG Panel` to open the flow graph
4. Hover over any pandas line to see a detailed tooltip

That's it. Nothing to configure.

---

## Features

### Inline Annotations

Every pandas operation gets a label on the right side of the line, right where you're already looking. No popups, no interruptions.

---

### Status Bar Summary

Live count of dataframes and operations in the current file, always visible in the bottom-right corner. Click it to open the DAG panel instantly.

```
>> 2 dataframes · 3 operations
```

---

### DAG Sidebar Panel

A visual flow graph showing how data moves through your script, color-coded by operation type.

| Color | Meaning |
|---|---|
| 🟢 Teal | Source dataframes (`read_csv`, `read_excel`, `pd.DataFrame`, etc.) |
| 🔵 Blue | Transforms (`dropna`, `fillna`, `rename`, `groupby`, `drop`) |
| 🟣 Purple | Merge and concat operations |

**Tips:**
- Click any node to highlight its full upstream and downstream path, everything unrelated dims out
- Click the same node again or click empty space to deselect
- Resize the panel freely: The graph recenters automatically

---

### Hover Tooltips

Hover over any pandas line to see:

- Variable name
- Operation type
- Operation category (source / transform / merge)
- Input dataframes that fed into this operation
- Line number

---

## Supported operations

| Category | Operations |
|---|---|
| **Ingestion** | `read_csv`, `read_excel`, `read_json`, `pd.DataFrame()` |
| **Cleaning** | `dropna`, `fillna`, `drop`, `rename` |
| **Analysis** | `groupby` |
| **Combining** | `merge`, `concat` |

---

## Troubleshooting

**No annotations showing up**

Make sure `python` is accessible from your terminal. Run `python --version`, if that fails, Python isn't on your PATH. On some systems you may need `python3` instead; if so, let us know via an issue and we'll add a setting for it.

**DAG panel is blank**

Click somewhere in your `.py` file to trigger a re-analysis, or close and reopen the panel. If it's still blank, check that your file has valid pandas operations assigned to variables (e.g. `df = pd.read_csv(...)`).

**Annotations disappeared after editing**

They re-appear after an 800ms pause in typing. This is intentional to avoid flickering while you type.

---

## Known limitations

Since this is a static analysis tool, there are real trade-offs:

- **Dynamic code:** Dataframes built inside loops, list comprehensions, or via `exec()` are not tracked
- **Method chaining:** `df.dropna().rename().fillna()` on a single line is not yet fully supported; assign each step to a variable for full tracking
- **Shape inference:** Row and column counts require running the code; we show operation type, not dimensions
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

Built by **Cybro** to stop the headache of tracing dataflow in large Python projects. We needed this ourselves, so we built it in the open.

Found a bug or have a feature request? [Open an issue](https://github.com/Revguard/DataFlow-Copilot/issues) or reach out on [Twitter/X](https://x.com/@The_Cybro).

This is early software and we're actively improving it.