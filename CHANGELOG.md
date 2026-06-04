# Change Log

## [0.0.4] - 2026-06-04

### Improved
- Made analysis work against the live editor buffer, so unsaved changes are reflected after the normal typing pause.
- Added Python command fallback for machines where `python3` or `py -3` is available but `python` is not.
- Tightened pandas detection for concat, merge, reassignment chains, and grouped summary steps.
- Rebuilt the DAG panel so it updates in place instead of reloading the whole view after every analysis.
- Added pan, zoom, fit, reset, visible-node rendering, and faster graph indexing for larger dataflow graphs.
- Added a larger pandas sample script for checking real-world dataflow shape and DAG behavior.

## [0.0.1] - 2026-03-01

### Added
- Inline annotations for pandas operations (read, merge, dropna, fillna, groupby, rename, drop)
- Status bar summary showing live dataframe and operation count
- DAG sidebar panel with visual dataframe flow graph
- Hover tooltips showing variable name, operation type, and inputs

## [0.0.2] - 2026-03-20

### Added
- Improved DAG panel flow graph rendering
- Added previews of the extension

## [0.0.3] - 2026-03-20

### Added
- Improved DAG panel flow graph rendering
- Improved DAG panel to show dataflow more accurately
- Decreased the opacity of inline messages
- Updated previews of the extension
