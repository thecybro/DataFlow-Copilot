# DataFlow Copilot 0.0.4

This release is mostly about making the extension feel dependable in real pandas files, not just tidy examples.

The analyzer now reads the live editor buffer, so unsaved changes show up after the normal typing pause. It also handles more of the pandas code people actually write: `pd.merge(...)`, `df.merge(...)`, `pd.concat([...])`, reassignment chains like `df = df.fillna(...)`, and grouped summary assignments such as `summary = df.groupby(...).count()`.

The DAG panel has had the biggest pass. It now stays alive and updates in place instead of reloading the whole view on every analysis. You can pan, zoom, fit the graph back into view, reset selection, and click a node to trace its upstream and downstream path. Large graphs should feel much smoother because the canvas only draws what is visible while you move around.

## Highlights

- Live-buffer analysis for unsaved edits
- Python fallback across `python`, `python3`, and `py -3`
- Better pandas lineage detection for merge, concat, groupby, and reassignment flows
- Persistent DAG webview with message-based updates
- Pan, zoom, fit, reset, and lineage highlighting in the DAG
- Faster graph indexing and visible-node rendering for larger scripts
- Larger `test.py` sample for exercising real-world-looking pandas flows
- README refreshed to match what the extension actually supports

## Upgrade Notes

Download the VSIX from GitHub Releases:

```text
https://github.com/Revguard/DataFlow-Copilot/releases/download/v0.0.4/dataflow-copilot-0.0.4.vsix
```

Then install it from the terminal:

```bash
code --install-extension dataflow-copilot-0.0.4.vsix
```

Or install it from VS Code:

1. Open the command palette
2. Run `Extensions: Install from VSIX...`
3. Select `dataflow-copilot-0.0.4.vsix`

If annotations do not appear, make sure one of these Python commands works from your terminal:

```bash
python --version
python3 --version
py -3 --version
```

Only one of them needs to work.

## Known Limits

DataFlow Copilot is still static analysis. It does not run your code, load your datasets, infer dataframe shapes, or follow every possible Python expression.

For the clearest graph, assign important pandas steps to variables:

```python
clean = raw.dropna()
renamed = clean.rename(columns={"id": "account_id"})
summary = renamed.groupby("team", as_index=False).count()
```

Long one-line chains, dynamic code, loops, helper functions, and non-pandas data tools are still areas for future work.

## Verification

This release was checked with:

```bash
npm run compile
npm run lint
python3 -m py_compile python/analyzer.py
python3 python/analyzer.py test.py
```

A temporary 10,001-line pandas file with 10,000 detected operations was also used to sanity-check analyzer performance.
