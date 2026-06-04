import ast
import json
import sys


EMPTY_OUTPUT = {"results": [], "nodes": [], "edges": []}


def analyze(filepath):
    try:
        source = read_source(filepath)
        tree = ast.parse(source)
    except Exception:
        print(json.dumps(EMPTY_OUTPUT))
        return

    visitor = DataFrameVisitor()
    visitor.visit(tree)

    print(json.dumps({
        "results": visitor.results,
        "nodes": visitor.nodes,
        "edges": visitor.edges,
    }))


def read_source(filepath):
    if filepath == "-":
        return sys.stdin.read()

    with open(filepath, "r", encoding="utf-8") as file:
        return file.read()


class DataFrameVisitor(ast.NodeVisitor):
    SOURCE_FUNCTIONS = {"read_csv", "read_excel", "read_json", "DataFrame"}
    TRANSFORM_METHODS = {
        "dropna": "Null rows dropped",
        "fillna": "Nulls filled",
        "drop": "Columns/rows dropped",
        "rename": "Columns renamed",
        "groupby": "GroupBy",
    }

    def __init__(self):
        self.results = []
        self.nodes = []
        self.edges = []
        self.df_vars = {}
        self.pandas_aliases = {"pd", "pandas"}

    def visit_Import(self, node):
        for alias in node.names:
            if alias.name == "pandas":
                self.pandas_aliases.add(alias.asname or alias.name)
        self.generic_visit(node)

    def visit_Assign(self, node):
        target = self._get_assign_target(node)
        if not target:
            self.generic_visit(node)
            return

        operation = self._analyze_call(node.value)
        if not operation:
            self.generic_visit(node)
            return

        label, node_type, inputs = operation
        node_id = f"{target}_{node.lineno}"

        self.nodes.append({
            "id": node_id,
            "label": target,
            "operation": label,
            "line": node.lineno,
            "type": node_type,
        })

        for input_name in inputs:
            input_id = self.df_vars.get(input_name)
            if input_id and input_id != node_id:
                self.edges.append({
                    "from": input_id,
                    "to": node_id,
                })

        self.df_vars[target] = node_id
        self.results.append({
            "line": node.lineno,
            "label": label,
            "variable": target,
            "inputs": inputs,
            "type": node_type,
        })

        self.generic_visit(node)

    def _analyze_call(self, value):
        if not isinstance(value, ast.Call):
            return None

        call = self._find_supported_call(value)
        if not call:
            return None

        function_name = self._get_function_name(call)
        receiver = self._get_receiver_name(call)

        if function_name in self.SOURCE_FUNCTIONS and receiver in self.pandas_aliases:
            return "DataFrame created", "source", []

        if function_name in self.TRANSFORM_METHODS:
            inputs = self._get_receiver_inputs(call)
            return self.TRANSFORM_METHODS[function_name], "transform", inputs

        if function_name == "merge":
            return "Merged", "merge", self._get_merge_inputs(call)

        if function_name == "concat" and receiver in self.pandas_aliases:
            return "Concat", "merge", self._get_concat_inputs(call)

        return None

    def _find_supported_call(self, call):
        current = call
        while isinstance(current, ast.Call):
            function_name = self._get_function_name(current)
            receiver = self._get_receiver_name(current)

            if (
                function_name in self.TRANSFORM_METHODS
                or function_name == "merge"
                or (function_name in self.SOURCE_FUNCTIONS and receiver in self.pandas_aliases)
                or (function_name == "concat" and receiver in self.pandas_aliases)
            ):
                return current

            if isinstance(current.func, ast.Attribute):
                current = current.func.value
            else:
                break

        return None

    def _get_assign_target(self, node):
        if node.targets and isinstance(node.targets[0], ast.Name):
            return node.targets[0].id
        return None

    def _get_function_name(self, call):
        if isinstance(call.func, ast.Attribute):
            return call.func.attr
        if isinstance(call.func, ast.Name):
            return call.func.id
        return None

    def _get_receiver_name(self, call):
        if isinstance(call.func, ast.Attribute) and isinstance(call.func.value, ast.Name):
            return call.func.value.id
        return None

    def _get_receiver_inputs(self, call):
        base_name = self._get_base_name(call.func.value) if isinstance(call.func, ast.Attribute) else None
        return [base_name] if base_name else []

    def _get_merge_inputs(self, call):
        inputs = []

        if isinstance(call.func, ast.Attribute):
            receiver = self._get_receiver_name(call)
            if receiver in self.pandas_aliases:
                inputs.extend(self._names_from_args(call.args[:2]))
            elif receiver:
                inputs.append(receiver)
                inputs.extend(self._names_from_args(call.args[:1]))

        for keyword in call.keywords:
            if keyword.arg in {"left", "right"}:
                name = self._get_base_name(keyword.value)
                if name:
                    inputs.append(name)

        return self._unique(inputs)

    def _get_concat_inputs(self, call):
        if not call.args:
            return []

        first_arg = call.args[0]
        if isinstance(first_arg, (ast.List, ast.Tuple)):
            return self._unique(self._names_from_args(first_arg.elts))

        name = self._get_base_name(first_arg)
        return [name] if name else []

    def _names_from_args(self, args):
        names = []
        for arg in args:
            name = self._get_base_name(arg)
            if name:
                names.append(name)
        return names

    def _get_base_name(self, node):
        current = node
        while isinstance(current, ast.Call) and isinstance(current.func, ast.Attribute):
            current = current.func.value

        while isinstance(current, ast.Attribute):
            current = current.value

        if isinstance(current, ast.Name):
            return current.id

        return None

    def _unique(self, values):
        seen = set()
        unique_values = []
        for value in values:
            if value not in seen:
                seen.add(value)
                unique_values.append(value)
        return unique_values


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps(EMPTY_OUTPUT))
    else:
        analyze(sys.argv[1])
