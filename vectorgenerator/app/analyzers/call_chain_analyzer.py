from typing import Dict, Any, List, Optional, Set
from ..models.call_chain import CallChainEntry, RemoteCallInfo

class CallChainAnalyzer:
    """Discover remote call chains via CFG traversal."""

    def __init__(self, endpoints_map: Dict[str, Any], components_data: Dict[str, Any]):
        """Initialize call chain analyzer.

        Args:
            endpoints_map: All endpoints from endpoints.json
            components_data: Complete components.json data
        """
        self.endpoints_map = endpoints_map
        self.components_data = components_data
        self._method_cache: Dict[str, Optional[Dict]] = {}

        # Statistics tracking for nested method traversal
        self._local_methods_traversed: int = 0
        self._max_local_depth: int = 0
        self._nested_remote_calls: int = 0

    def discover_chain(
        self,
        endpoint_id: str,
        visited: Optional[Set[str]] = None,
        depth: int = 0,
        position_counter: Optional[List[int]] = None
    ) -> tuple[List[CallChainEntry], bool]:
        """Perform DFS to discover all remote calls (direct + transitive).

        Args:
            endpoint_id: Starting endpoint ID
            visited: Set for cycle detection
            depth: Current depth in call chain
            position_counter: Counter for position numbering (mutable list)

        Returns:
            Tuple of (call_chain, cycles_detected)
        """
        if visited is None:
            visited = set()

        if position_counter is None:
            position_counter = [0]

        # Reset statistics tracking for new chain discovery
        if depth == 0:
            self._local_methods_traversed = 0
            self._max_local_depth = 0
            self._nested_remote_calls = 0

        cycles_detected = False

        # Check for cycle
        if endpoint_id in visited:
            print(f"  ⚠ Cycle detected at {endpoint_id} (depth={depth})")
            return [], True

        # Get endpoint details
        endpoint = self.endpoints_map.get(endpoint_id)
        if not endpoint:
            print(f"  ✗ Endpoint not found: {endpoint_id}")
            return [], False

        # Mark as visited
        visited.add(endpoint_id)

        # Create entry for current endpoint
        is_root = (depth == 0)
        current_position = position_counter[0]
        position_counter[0] += 1

        # Extract authorization info
        authorization = endpoint.get("authorization", {})
        required_roles = authorization.get("requiredRoles", [])
        is_public = authorization.get("public", False)

        # If public, set required_roles to empty list
        if is_public and not required_roles:
            required_roles = []

        entry = CallChainEntry(
            position=current_position,
            endpoint_id=endpoint_id,
            uri=endpoint.get("fullUri", "UNKNOWN"),
            is_root=is_root,
            required_roles=required_roles,
            resolved=True,
            service_name=endpoint.get("serviceName"),
            http_method=endpoint.get("httpMethod"),
            depth=depth
        )

        call_chain = [entry]

        if is_root:
            print(f"\n Discovering call chain for: {endpoint_id}")
            print(f"  Root: {entry.uri} (roles={required_roles})")

        # Get method and CFG
        method_id = endpoint.get("methodId")
        if not method_id:
            return call_chain, cycles_detected

        method = self.find_method_by_id(method_id)
        if not method or "controlFlowGraph" not in method:
            return call_chain, cycles_detected

        # Extract remote calls from CFG
        remote_calls = self.extract_remote_calls_from_cfg(
            method.get("controlFlowGraph", {})
        )

        if remote_calls:
            print(f"  Found {len(remote_calls)} remote call(s) at depth {depth}")

        # Traverse each remote call
        for remote_call in remote_calls:
            if remote_call.target_endpoint_id is None:
                # Unresolved endpoint
                unresolved_position = position_counter[0]
                position_counter[0] += 1

                unresolved_entry = CallChainEntry(
                    position=unresolved_position,
                    endpoint_id=None,
                    uri=remote_call.endpoint,
                    is_root=False,
                    required_roles=None,
                    resolved=False,
                    service_name=remote_call.target_service,
                    http_method=remote_call.http_method,
                    depth=depth + 1
                )
                call_chain.append(unresolved_entry)
                print(f"Unresolved: {remote_call.http_method} {remote_call.endpoint}")
            else:
                # Recursive traversal (transitive calls)
                transitive_chain, transitive_cycles = self.discover_chain(
                    remote_call.target_endpoint_id,
                    visited,
                    depth + 1,
                    position_counter
                )

                call_chain.extend(transitive_chain)

                if transitive_cycles:
                    cycles_detected = True

        return call_chain, cycles_detected

    def extract_remote_calls_from_cfg(
        self,
        cfg: Dict[str, Any],
        visited_methods: Optional[Set[str]] = None,
        current_depth: int = 0
    ) -> List[RemoteCallInfo]:
        """Extract all remote call nodes from control flow graph.

        This method now recursively traverses local method calls to find
        nested remote calls.

        Args:
            cfg: Control flow graph dictionary
            visited_methods: Set of method IDs already visited (for cycle detection)
            current_depth: Current depth of local method traversal

        Returns:
            List of RemoteCallInfo objects (including those found in nested local calls)
        """
        if visited_methods is None:
            visited_methods = set()

        remote_calls = []
        nodes = cfg.get("nodes", [])

        for node in nodes:
            # Check for direct remote calls
            if node.get("remoteCall") == True:
                method_call = node.get("methodCall", {})

                remote_call = RemoteCallInfo(
                    target_endpoint_id=method_call.get("targetEndpointId"),
                    endpoint=method_call.get("endpoint", "UNKNOWN"),
                    http_method=method_call.get("httpMethod"),
                    resolved=method_call.get("endpointResolved", False),
                    target_service=method_call.get("targetService")
                )

                remote_calls.append(remote_call)

            # NEW: Check for local method calls that might contain remote calls
            elif node.get("type") == "CALL":
                method_call = node.get("methodCall", {})

                # Check if it's a LOCAL call with a targetMethodId
                if (method_call.get("callType") == "LOCAL" and
                    method_call.get("targetMethodId")):

                    target_method_id = method_call["targetMethodId"]

                    # Skip if we've already visited this method (cycle detection)
                    if target_method_id in visited_methods:
                        print(f"    ⚠ Local method cycle detected: {target_method_id} at depth {current_depth}")
                        continue

                    # Log that we're traversing into a local method
                    indent = "  " * (current_depth + 2)
                    print(f"{indent}↳ Traversing local method: {target_method_id} (depth {current_depth + 1})")

                    # Recursively check the target method for remote calls
                    nested_remote_calls = self._extract_remote_calls_from_method(
                        target_method_id,
                        visited_methods,
                        current_depth + 1
                    )

                    if nested_remote_calls:
                        print(f"{indent}→ Found {len(nested_remote_calls)} nested remote call(s) in {target_method_id}")
                        for rc in nested_remote_calls:
                            print(f"{indent}  • {rc.http_method} {rc.endpoint}")
                        remote_calls.extend(nested_remote_calls)
                    else:
                        print(f"{indent}  (no remote calls found)")

        return remote_calls

    def _extract_remote_calls_from_method(
        self,
        method_id: str,
        visited_methods: Set[str],
        depth: int
    ) -> List[RemoteCallInfo]:
        """Helper to extract remote calls from a specific method by ID.

        Args:
            method_id: The method ID to examine
            visited_methods: Set of already visited method IDs
            depth: Current traversal depth

        Returns:
            List of RemoteCallInfo objects found in this method
        """
        # Mark this method as visited and track statistics
        visited_methods.add(method_id)
        self._local_methods_traversed += 1
        self._max_local_depth = max(self._max_local_depth, depth)

        # Find the method definition
        method = self.find_method_by_id(method_id)
        if not method:
            return []

        # Get its CFG
        cfg = method.get("controlFlowGraph", {})
        if not cfg:
            return []

        # Recursively extract remote calls (which may find more local calls)
        remote_calls = self.extract_remote_calls_from_cfg(cfg, visited_methods, depth)

        # Track nested remote calls found
        if remote_calls and depth > 0:
            self._nested_remote_calls += len(remote_calls)

        return remote_calls

    def find_method_by_id(self, method_id: str) -> Optional[Dict]:
        """Locate method in components.json by methodId.

        Args:
            method_id: Method ID to find

        Returns:
            Method dictionary or None if not found
        """
        # Check cache
        if method_id in self._method_cache:
            return self._method_cache[method_id]

        # Components are stored as a flat dictionary keyed by method ID
        # Each component IS a method, not a container of methods
        components = self.components_data.get("components", {})

        # Try direct lookup first (method_id as key)
        if method_id in components:
            self._method_cache[method_id] = components[method_id]
            return components[method_id]

        # Fallback: search by 'id' field in each component
        for component_key, component_data in components.items():
            if component_data.get("id") == method_id or component_data.get("fullID") == method_id:
                self._method_cache[method_id] = component_data
                return component_data

        # Not found
        self._method_cache[method_id] = None
        return None

    def get_nested_traversal_stats(self) -> tuple[int, int, int]:
        """Get statistics from the last nested method traversal.

        Returns:
            Tuple of (local_methods_traversed, max_local_depth, nested_remote_calls)
        """
        return (
            self._local_methods_traversed,
            self._max_local_depth,
            self._nested_remote_calls
        )

    def __repr__(self) -> str:
        return f"CallChainAnalyzer({len(self.endpoints_map)} endpoints)"
