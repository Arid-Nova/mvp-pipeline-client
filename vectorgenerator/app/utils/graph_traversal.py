from typing import Set, List, Optional, Callable

class GraphTraversal:

    @staticmethod
    def dfs(
        start_node: str,
        get_neighbors: Callable[[str], List[str]],
        visited: Optional[Set[str]] = None,
        max_depth: Optional[int] = None,
        current_depth: int = 0
    ) -> tuple[List[str], bool]:
        """Depth-First Search with cycle detection.

        Args:
            start_node: Starting node ID
            get_neighbors: Function that returns neighbors for a node
            visited: Set of already visited nodes (for cycle detection)
            max_depth: Optional maximum traversal depth
            current_depth: Current depth in traversal

        Returns:
            Tuple of (visited_nodes, cycles_detected)
        """
        if visited is None:
            visited = set()

        cycles_detected = False

        # Check for cycle
        if start_node in visited:
            return [], True

        # Check depth limit
        if max_depth is not None and current_depth >= max_depth:
            return [start_node], False

        # Mark as visited
        visited.add(start_node)
        result = [start_node]

        # Get and traverse neighbors
        try:
            neighbors = get_neighbors(start_node)
        except Exception as e:
            print(f"Warning: Error getting neighbors for {start_node}: {e}")
            return result, False

        for neighbor in neighbors:
            if neighbor is None:
                continue

            neighbor_nodes, neighbor_cycles = GraphTraversal.dfs(
                neighbor,
                get_neighbors,
                visited,
                max_depth,
                current_depth + 1
            )

            result.extend(neighbor_nodes)

            if neighbor_cycles:
                cycles_detected = True

        return result, cycles_detected

    @staticmethod
    def find_all_paths(
        start_node: str,
        get_neighbors: Callable[[str], List[str]],
        max_depth: Optional[int] = None
    ) -> List[List[str]]:
        """Find all paths from start node using DFS.

        Args:
            start_node: Starting node
            get_neighbors: Function to get neighbors
            max_depth: Maximum path depth

        Returns:
            List of all paths (each path is a list of node IDs)
        """
        all_paths = []

        def dfs_paths(
            current: str,
            path: List[str],
            visited: Set[str],
            depth: int
        ):
            if max_depth is not None and depth >= max_depth:
                all_paths.append(path.copy())
                return

            if current in visited:
                # Cycle detected, end path here
                all_paths.append(path.copy())
                return

            visited.add(current)
            path.append(current)

            try:
                neighbors = get_neighbors(current)
            except Exception:
                all_paths.append(path.copy())
                return

            if not neighbors:
                # Leaf node
                all_paths.append(path.copy())
            else:
                for neighbor in neighbors:
                    if neighbor is not None:
                        dfs_paths(neighbor, path.copy(), visited.copy(), depth + 1)

        dfs_paths(start_node, [], set(), 0)
        return all_paths

    @staticmethod
    def detect_cycles(
        nodes: List[str],
        get_neighbors: Callable[[str], List[str]]
    ) -> bool:
        """Detect if there are cycles in the graph.

        Args:
            nodes: List of node IDs to check
            get_neighbors: Function to get neighbors

        Returns:
            True if cycles detected, False otherwise
        """
        visited = set()
        rec_stack = set()

        def has_cycle_util(node: str) -> bool:
            visited.add(node)
            rec_stack.add(node)

            try:
                neighbors = get_neighbors(node)
            except Exception:
                rec_stack.remove(node)
                return False

            for neighbor in neighbors:
                if neighbor is None:
                    continue

                if neighbor not in visited:
                    if has_cycle_util(neighbor):
                        return True
                elif neighbor in rec_stack:
                    return True

            rec_stack.remove(node)
            return False

        for node in nodes:
            if node not in visited:
                if has_cycle_util(node):
                    return True

        return False
