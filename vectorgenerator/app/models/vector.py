from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from .call_chain import CallChainEntry


@dataclass
class PermissionMatrix:
    """2D permission matrix: endpoints x roles.

    Matrix layout:
    - Y-axis (rows) = Endpoints
    - X-axis (columns) = Roles
    """

    roles: List[str]
    endpoints: List[str]  # Endpoint IDs or URIs for unresolved
    matrix: List[List[int]]  # matrix[endpoint_idx][role_idx] = {1, 0, -1}

    def get_permission(self, role: str, endpoint_idx: int) -> int:
        """Get permission for specific role and endpoint.

        Args:
            role: Role name
            endpoint_idx: Index of endpoint in endpoints list

        Returns:
            1 = access granted, 0 = access denied, -1 = unknown
        """
        if role not in self.roles:
            return -1

        role_idx = self.roles.index(role)

        if endpoint_idx < 0 or endpoint_idx >= len(self.endpoints):
            return -1

        return self.matrix[endpoint_idx][role_idx]

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "roles": self.roles,
            "endpoints": self.endpoints,
            "matrix": self.matrix
        }

    def __repr__(self) -> str:
        return f"PermissionMatrix({len(self.roles)} roles × {len(self.endpoints)} endpoints)"


@dataclass
class VectorStatistics:
    """Statistics for generated auth vector."""

    total_calls: int
    resolved_calls: int
    unresolved_calls: int
    max_depth_reached: int
    cycles_detected: bool
    public_endpoints: int = 0
    restricted_endpoints: int = 0
    local_methods_traversed: int = 0
    max_local_depth: int = 0
    nested_remote_calls: int = 0

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "total_calls": self.total_calls,
            "resolved_calls": self.resolved_calls,
            "unresolved_calls": self.unresolved_calls,
            "max_depth_reached": self.max_depth_reached,
            "cycles_detected": self.cycles_detected,
            "public_endpoints": self.public_endpoints,
            "restricted_endpoints": self.restricted_endpoints,
            "local_methods_traversed": self.local_methods_traversed,
            "max_local_depth": self.max_local_depth,
            "nested_remote_calls": self.nested_remote_calls
        }

    def __repr__(self) -> str:
        return (f"VectorStatistics(total={self.total_calls}, "
                f"resolved={self.resolved_calls}, "
                f"cycles={'Yes' if self.cycles_detected else 'No'}, "
                f"nested={self.nested_remote_calls})")


@dataclass
class AuthVector:
    """Complete auth-role vector for one endpoint."""

    endpoint_id: str
    endpoint_info: Dict[str, Any]
    call_chain: List[CallChainEntry]
    permission_matrix: PermissionMatrix
    statistics: VectorStatistics

    def to_dict(self, lean: bool = False) -> dict:
        """Convert to dictionary for JSON serialization.

        Args:
            lean: If True, return minimal output with only matrix data
        """
        if lean:
            # Lean format: only x-axis, y-axis, and matrix
            # X-axis = roles (columns)
            # Y-axis = endpoints (rows)
            return {
                "endpoint": self.endpoint_info["uri"],
                "x_axis": self.permission_matrix.roles,
                "y_axis": [
                    entry.uri for entry in self.call_chain
                ],
                "matrix": self.permission_matrix.matrix
            }

        # Full format
        return {
            "endpoint_info": self.endpoint_info,
            "call_chain": [entry.to_dict() for entry in self.call_chain],
            "permission_matrix": self.permission_matrix.to_dict(),
            "statistics": self.statistics.to_dict()
        }

    def __repr__(self) -> str:
        return (f"AuthVector(endpoint={self.endpoint_id}, "
                f"chain_length={len(self.call_chain)}, "
                f"matrix={self.permission_matrix})")
