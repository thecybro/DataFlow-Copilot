# 🛠️ DataFlow Copilot

**Static Dataflow Analysis for Pandas.** Visualize your pipeline's logic without executing a single line of code.

[![Version](https://img.shields.io/badge/version-0.1.0--alpha-blue.svg)](https://github.com/Revguard/DataFlow-Copilot)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Python](https://img.shields.io/badge/python-3.8%2B-blue.svg)

---

## 🧐 What is this?
If you've ever scrolled through a 300-line pandas script and lost track of **dataframe lineage**, or wondered what the data shape is after 5 chained operations, **DataFlow Copilot** is your solution.

**The "Static" Advantage:** Unlike other extensions, **DataFlow Copilot** does not run your Python interpreter. It uses **AST (Abstract Syntax Tree) parsing**, meaning:
* **Zero Runtime Overhead:** No waiting for heavy datasets to load.
* **Privacy First:** Your data never leaves your machine. No code execution.
* **Instant Feedback:** Annotations and DAGs update as you type.

---

## ✨ Key Features

### 📝 Inline Annotations
Get real-time context exactly where you're looking. No popups, no interruptions.
```python
df = pd.read_csv("accounts.csv")        >> Source: accounts.csv

merged = pd.merge(df, tickets, on="id")  >> Merge (Inner)

clean = merged.dropna()                 >> Nulls dropped
```

## 📊 Live DAG Sidebar
Visualize your data's journey. Our custom panel renders a Directed Acyclic Graph (DAG) of your script:

- **Teal**: Data Sources (CSVs, SQL, JSON)
- **Blue**: Transformations (dropna, groupby, rename)
- **Purple**: Joins & Concatenations

## ⚡ Status Bar Summary
A lightweight footprint. See your script's complexity at a glance in the VSCode status bar:

```>> 4 DataFrames · 12 Operations```

## 🛠️ How it Works
DataFlow Copilot leverages a hybrid architecture:
1. **Python Core**: Uses the ast module to build a logical map of pandas operations without running the code.
2. **TypeScript/VSCode Layer**: Renders the map into interactive annotations and the DAG panel.

## 🚀 Supported Operations

| Category | Operations |
|---|---|
| **Ingestion** | ```read_csv```, ```read_excel```, ```read_json```, ```pd.DataFrame()``` |
| **Cleaning** | ```dropna```, ```fillna```, ```drop```, ```rename``` |
| **Analysis** | ```groupby```, ```pivot_table```, ```sort_values``` |
| **Combining** | ```merge```, ```concat```, ```join``` |

## Requirements

- Python 3.8+ installed and accessible via `python` in your terminal
- VSCode 1.109.0 or higher
- A `.py` file with pandas code


## Getting started

1. Install the extension
2. Open any Python file that uses pandas
3. Watch the annotations appear automatically
4. Click the status bar item or run `DataFlow: Show DAG Panel` from the command palette (`Ctrl+Shift+P`) to open the flow graph


## ⚠️ Known Limitations & Constraints
As a **Static Analysis** tool, there are specific trade-offs:

- **Dynamic Code**: Dataframes generated inside complex for loops or via exec() are not currently tracked.
- **Shape Inference**: Row/Column counts are estimated based on logic; exact counts require the Runtime Hook (see Roadmap).
- Currently supports pandas only (sklearn, polars, etc. coming later)

## 🗺️ Future Updates Include

- [ ] **Method Chaining Support**: Support for df.dropna().rename().fillna().
- [ ] **Polars Integration**: Expanding beyond the Pandas ecosystem.
- [ ] **Shape Inference Hook**: Optional opt-in to run code for exact metadata.
- [ ] **Exportable DAGs**: Export your pipeline logic as SVG/PNG for documentation.

## 🤝 Contributing & Feedback
Built with 💡 by the team<!-- at Revguard -->.

**DataFlow Copilot** is in active development. We prioritize features based on community need.

**Developer**: Cybro — Founder<!-- @ Revguard-->

We are building this to streamline the **Churn Intelligence Engine (CIE)** pipeline. If you find a bug or have a feature request, please **Open an Issue**.
@The_Cybro
**Direct Outreach**: For architectural discussions or integration questions, reach out via [Twitter/X](https://x.com/@The_Cybro).

**DataFlow Copilot** is an open-source utility<!-- by Revguard-->. For enterprise-grade predictive churn analytics<!--, visit Revguard.ai-->.