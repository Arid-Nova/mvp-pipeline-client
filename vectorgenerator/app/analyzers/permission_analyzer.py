from typing import List, Optional

from ..models.vector import PermissionMatrix
from ..models.call_chain import CallChainEntry

class PermissionAnalyzer:
    """Compute permission matrices based on role hierarchy."""

    def __init__(self, roles: List[str]):
        """Initialize permission analyzer.

        Args:
            roles: Privilege-ordered list of roles (index 0 = highest privilege)
        """
        self.roles = roles

    def compute_matrix(
        self,
        call_chain: List[CallChainEntry]
    ) -> PermissionMatrix:
        """Generate 2D permission matrix for call chain.

        Matrix is organized as: matrix[endpoint_idx][role_idx]
        - Y-axis (rows) = Endpoints
        - X-axis (columns) = Roles

        Args:
            call_chain: List of CallChainEntry objects

        Returns:
            PermissionMatrix with matrix[endpoint_idx][role_idx] = {1, 0, -1}
        """
        # Build endpoint IDs list
        endpoint_ids = []
        for entry in call_chain:
            if entry.resolved:
                endpoint_ids.append(entry.endpoint_id)
            else:
                # Unresolved endpoint
                endpoint_ids.append(f"UNRESOLVED:{entry.uri}")

        # Initialize matrix: one row per endpoint
        matrix = []

        # For each endpoint, compute permissions for all roles
        for entry in call_chain:
            row = []

            for role in self.roles:
                permission = self.check_access(role, entry.required_roles)
                row.append(permission)

            matrix.append(row)

        return PermissionMatrix(
            roles=self.roles,
            endpoints=endpoint_ids,
            matrix=matrix
        )

    def check_access(
        self,
        role: str,
        required_roles: Optional[List[str]]
    ) -> int:
        """Check if role has access given required roles.

        Uses the LOWEST privilege role (highest index) as the base point when
        multiple roles are required.

        Args:
            role: Role name to check
            required_roles: List of roles required for access

        Returns:
            1 = access granted
            0 = access denied
            -1 = unknown (unresolved endpoint)
        """
        # Unresolved endpoint
        if required_roles is None:
            return -1

        # Public endpoint (no roles required)
        if not required_roles:
            return 1

        # Get role index
        try:
            role_idx = self.roles.index(role)
        except ValueError:
            # Role not in system
            return -1

        # Find MAXIMUM privilege index (lowest privilege) among required roles
        # This is the base point - the minimum role needed
        required_indices = []
        for req_role in required_roles:
            try:
                req_idx = self.roles.index(req_role)
                required_indices.append(req_idx)
            except ValueError:
                # Required role not in system
                continue

        if not required_indices:
            # No valid required roles found
            return -1

        # Use the lowest privilege role (highest index) as base point
        max_required_idx = max(required_indices)

        # Role has access if it has equal or higher privilege
        # (lower or equal index than the base point)
        if role_idx <= max_required_idx:
            return 1
        else:
            return 0

    def get_permission_summary(
        self,
        permission_matrix: PermissionMatrix
    ) -> dict:
        """Generate summary statistics for permission matrix.

        Args:
            permission_matrix: PermissionMatrix to analyze

        Returns:
            Dictionary with statistics
        """
        total_cells = len(permission_matrix.endpoints) * len(permission_matrix.roles)
        granted_count = 0
        denied_count = 0
        unknown_count = 0

        for row in permission_matrix.matrix:
            for cell in row:
                if cell == 1:
                    granted_count += 1
                elif cell == 0:
                    denied_count += 1
                elif cell == -1:
                    unknown_count += 1

        return {
            "total_cells": total_cells,
            "granted": granted_count,
            "denied": denied_count,
            "unknown": unknown_count,
            "grant_rate": granted_count / total_cells if total_cells > 0 else 0
        }

    def __repr__(self) -> str:
        return f"PermissionAnalyzer({len(self.roles)} roles)"
