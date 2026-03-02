from typing import List, Dict, Any, Optional

class RoleAnalyzer:
    """Extract and manage role hierarchy from components.json."""

    def __init__(self, components_data: Dict[str, Any]):
        """Initialize role analyzer.

        Args:
            components_data: Complete components.json data
        """
        self.components_data = components_data
        self._roles: Optional[List[str]] = None

    def extract_roles(self) -> List[str]:
        """Extract privilege-ordered roles from components data.

        Returns:
            List[str]: Roles where index represents privilege level
                      (0 = highest privilege)
        """
        if self._roles is not None:
            return self._roles

        roles = self.components_data.get("roles", [])

        if not roles:
            print("Warning: No roles found in components.json, using default roles")
            roles = ["ADMIN", "USER"]

        print(f"✓ Extracted {len(roles)} roles: {roles}")
        print(f"  Role hierarchy (privilege): {' > '.join(f'{r}(idx={i})' for i, r in enumerate(roles))}")

        self._roles = roles
        return self._roles

    def get_role_index(self, role: str) -> int:
        """Get privilege index for a role.

        Args:
            role: Role name

        Returns:
            Index of role (0 = highest privilege), -1 if not found
        """
        if self._roles is None:
            self.extract_roles()

        try:
            return self._roles.index(role)
        except ValueError:
            return -1

    def has_higher_privilege(self, role1: str, role2: str) -> bool:
        """Check if role1 has higher privilege than role2.

        Args:
            role1: First role
            role2: Second role

        Returns:
            True if role1 has higher privilege (lower index)
        """
        idx1 = self.get_role_index(role1)
        idx2 = self.get_role_index(role2)

        if idx1 == -1 or idx2 == -1:
            return False

        return idx1 < idx2

    def get_roles(self) -> List[str]:
        """Get the extracted roles list.

        Returns:
            List of roles in privilege order
        """
        if self._roles is None:
            return self.extract_roles()
        return self._roles

    def __repr__(self) -> str:
        if self._roles:
            return f"RoleAnalyzer({len(self._roles)} roles)"
        return "RoleAnalyzer(not initialized)"
