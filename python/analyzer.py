import ast
import sys
import json

def analyze(filepath):
    try:
        with open(filepath, 'r') as f:
            source = f.read()
        tree = ast.parse(source)
    except Exception as e:
        print(json.dumps({"results": [], "nodes": [], "edges": []}))
        return

    visitor = DataFrameVisitor()
    visitor.visit(tree)

    print(json.dumps({
        "results": visitor.results,
        "nodes": visitor.nodes,
        "edges": visitor.edges
    }))

class DataFrameVisitor(ast.NodeVisitor):
    def __init__(self):
        self.results = []
        self.nodes = []
        self.edges = []
        self.df_vars = {}  

    def visit_Assign(self, node):
        if isinstance(node.value, ast.Call):
            call = node.value
            func_name = self._get_func_name(call)
            target = self._get_assign_target(node)
            label = None
            node_type = None
            inputs = []

            if func_name in ('pd.read_csv', 'pd.read_excel', 'pd.read_json', 'pd.DataFrame'):
                label = "DataFrame created"
                node_type = "source"

            elif func_name and 'dropna' in func_name:
                label = "Null rows dropped"
                node_type = "transform"
                inputs = self._get_receiver(call)

            elif func_name and 'fillna' in func_name:
                label = "Nulls filled"
                node_type = "transform"
                inputs = self._get_receiver(call)

            elif func_name and 'drop' in func_name:
                label = "Columns/rows dropped"
                node_type = "transform"
                inputs = self._get_receiver(call)

            elif func_name and 'merge' in func_name:
                label = "Merge"
                node_type = "merge"
                inputs = self._get_merge_inputs(call)

            elif func_name and 'groupby' in func_name:
                label = "GroupBy"
                node_type = "transform"
                inputs = self._get_receiver(call)

            elif func_name and 'concat' in func_name:
                label = "Concat"
                node_type = "merge"

            elif func_name and 'rename' in func_name:
                label = "Columns renamed"
                node_type = "transform"
                inputs = self._get_receiver(call)

            if label and target:
                node_id = f"{target}_{node.lineno}"
                self.nodes.append({
                    "id": node_id,
                    "label": f"{target}",
                    "operation": label,
                    "line": node.lineno,
                    "type": node_type
                })
                self.df_vars[target] = node_id

                for inp in inputs:
                    if inp in self.df_vars:
                        self.edges.append({
                            "from": self.df_vars[inp],
                            "to": node_id
                        })

                self.results.append({
                    "line": node.lineno,
                    "label": label,
                    "variable": target or "unknown",
                    "inputs": inputs,
                    "type": node_type
                })

        self.generic_visit(node)

    def _get_func_name(self, call):
        if isinstance(call.func, ast.Attribute):
            if isinstance(call.func.value, ast.Name):
                return f"{call.func.value.id}.{call.func.attr}"
            return call.func.attr
        elif isinstance(call.func, ast.Name):
            return call.func.id
        return None

    def _get_assign_target(self, node):
        if node.targets and isinstance(node.targets[0], ast.Name):
            return node.targets[0].id
        return None

    def _get_receiver(self, call):
        if isinstance(call.func, ast.Attribute):
            if isinstance(call.func.value, ast.Name):
                return [call.func.value.id]
        return []

    def _get_merge_inputs(self, call):
        inputs = self._get_receiver(call)
        if isinstance(call.func, ast.Name) and call.args:
            for arg in call.args[:2]:
                if isinstance(arg, ast.Name):
                    inputs.append(arg.id)
        return inputs

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"results": [], "nodes": [], "edges": []}))
    else:
        analyze(sys.argv[1])