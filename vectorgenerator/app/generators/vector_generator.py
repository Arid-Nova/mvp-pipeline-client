from typing import Dict, Any, List
from datetime import datetime, timezone

from ..models.vector import AuthVector, VectorStatistics
from ..analyzers.call_chain_analyzer import CallChainAnalyzer
from ..analyzers.permission_analyzer import PermissionAnalyzer

class VectorGenerator:
    """Orchestrate auth-role vector generation."""

    def __init__(
        self,
        roles: List[str],
        endpoints_map: Dict[str, Any],
        components_data: Dict[str, Any]
    ):
        """Initialize vector generator.

        Args:
            roles: Privilege-ordered list of roles
            endpoints_map: All endpoints from endpoints.json
            components_data: Complete components.json data
        """
        self.roles = roles
        self.endpoints_map = endpoints_map
        self.components_data = components_data

        # Initialize analyzers
        self.call_chain_analyzer = CallChainAnalyzer(
            endpoints_map,
            components_data
        )
        self.permission_analyzer = PermissionAnalyzer(roles)

    def generate_vector(self, endpoint_id: str) -> AuthVector:
        """Generate complete auth-role vector for one endpoint.

        Args:
            endpoint_id: Endpoint ID to generate vector for

        Returns:
            AuthVector with call_chain and permission_matrix
        """
        # Get endpoint info
        endpoint = self.endpoints_map.get(endpoint_id)
        if not endpoint:
            raise ValueError(f"Endpoint not found: {endpoint_id}")

        endpoint_info = {
            "id": endpoint_id,
            "uri": endpoint.get("fullUri", "UNKNOWN"),
            "method": endpoint.get("httpMethod", "UNKNOWN"),
            "service_name": endpoint.get("serviceName", "UNKNOWN")
        }

        # 1. Discover call chain
        call_chain, cycles_detected = self.call_chain_analyzer.discover_chain(
            endpoint_id
        )

        # 2. Compute permission matrix
        permission_matrix = self.permission_analyzer.compute_matrix(call_chain)

        # 3. Get nested traversal statistics from call chain analyzer
        local_methods, max_local_depth, nested_remote_calls = (
            self.call_chain_analyzer.get_nested_traversal_stats()
        )

        # 4. Gather statistics
        stats = self._compute_statistics(
            call_chain,
            cycles_detected,
            local_methods,
            max_local_depth,
            nested_remote_calls
        )

        # 4. Build AuthVector object
        return AuthVector(
            endpoint_id=endpoint_id,
            endpoint_info=endpoint_info,
            call_chain=call_chain,
            permission_matrix=permission_matrix,
            statistics=stats
        )

    def generate_all_vectors(self) -> Dict[str, AuthVector]:
        """Generate vectors for all endpoints.

        Returns:
            Dictionary mapping endpoint_id -> AuthVector
        """
        vectors = {}
        total_endpoints = len(self.endpoints_map)

        print(f"\n📊 Generating auth-role vectors for {total_endpoints} endpoints...")
        print("=" * 80)

        for idx, endpoint_id in enumerate(self.endpoints_map.keys(), 1):
            try:
                print(f"\n[{idx}/{total_endpoints}] Processing: {endpoint_id}")
                vector = self.generate_vector(endpoint_id)
                vectors[endpoint_id] = vector

                # Print summary
                print(f"Generated vector:")
                print(f"  - Call chain length: {len(vector.call_chain)}")
                print(f"  - Matrix dimensions: {len(self.roles)} roles × {len(vector.call_chain)} endpoints")
                print(f"  - Resolved: {vector.statistics.resolved_calls}/{vector.statistics.total_calls}")
                if vector.statistics.cycles_detected:
                    print(f"Cycles detected!")
                if vector.statistics.nested_remote_calls > 0:
                    print(f"Nested remote calls found: {vector.statistics.nested_remote_calls} "
                          f"(via {vector.statistics.local_methods_traversed} local methods, "
                          f"max depth: {vector.statistics.max_local_depth})")

            except Exception as e:
                print(f"Error generating vector for {endpoint_id}: {e}")
                import traceback
                traceback.print_exc()

        print("\n" + "=" * 80)
        print(f"✓ Generated {len(vectors)} vectors successfully")

        return vectors

    def _compute_statistics(
        self,
        call_chain: List,
        cycles_detected: bool,
        local_methods_traversed: int = 0,
        max_local_depth: int = 0,
        nested_remote_calls: int = 0
    ) -> VectorStatistics:
        """Compute statistics for call chain.

        Args:
            call_chain: List of CallChainEntry objects
            cycles_detected: Whether cycles were detected
            local_methods_traversed: Number of local methods traversed
            max_local_depth: Maximum depth of local method nesting
            nested_remote_calls: Number of remote calls found via nested traversal

        Returns:
            VectorStatistics object
        """
        total_calls = len(call_chain)
        resolved_calls = sum(1 for entry in call_chain if entry.resolved)
        unresolved_calls = total_calls - resolved_calls

        # Find max depth
        max_depth = max((entry.depth for entry in call_chain), default=0)

        # Count public vs restricted endpoints
        public_endpoints = sum(
            1 for entry in call_chain
            if entry.resolved and (not entry.required_roles or len(entry.required_roles) == 0)
        )
        restricted_endpoints = sum(
            1 for entry in call_chain
            if entry.resolved and entry.required_roles and len(entry.required_roles) > 0
        )

        return VectorStatistics(
            total_calls=total_calls,
            resolved_calls=resolved_calls,
            unresolved_calls=unresolved_calls,
            max_depth_reached=max_depth,
            cycles_detected=cycles_detected,
            public_endpoints=public_endpoints,
            restricted_endpoints=restricted_endpoints,
            local_methods_traversed=local_methods_traversed,
            max_local_depth=max_local_depth,
            nested_remote_calls=nested_remote_calls
        )

    def generate_metadata(self, vectors: Dict[str, AuthVector], lean: bool = False) -> Dict[str, Any]:
        """Generate metadata for output file.

        Args:
            vectors: Dictionary of generated vectors
            lean: If True, return minimal metadata

        Returns:
            Metadata dictionary
        """
        if lean:
            # Minimal metadata for lean output
            return {
                "total_endpoints": len(vectors),
                "roles": self.roles
            }

        # Full metadata
        total_endpoints = len(vectors)
        total_calls = sum(v.statistics.total_calls for v in vectors.values())
        total_resolved = sum(v.statistics.resolved_calls for v in vectors.values())
        total_unresolved = sum(v.statistics.unresolved_calls for v in vectors.values())
        endpoints_with_cycles = sum(1 for v in vectors.values() if v.statistics.cycles_detected)

        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_endpoints": total_endpoints,
            "total_roles": len(self.roles),
            "roles": self.roles,
            "generation_config": {
                "include_unresolved": True,
                "transitive_calls": True,
                "cycle_detection": "visited_tracking"
            },
            "statistics": {
                "total_remote_calls": total_calls,
                "resolved_calls": total_resolved,
                "unresolved_calls": total_unresolved,
                "endpoints_with_cycles": endpoints_with_cycles
            }
        }

    def __repr__(self) -> str:
        return f"VectorGenerator({len(self.roles)} roles, {len(self.endpoints_map)} endpoints)"
