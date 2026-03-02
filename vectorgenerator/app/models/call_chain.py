from dataclasses import dataclass
from typing import Optional, List


@dataclass
class LocalCallInfo:
    """Information about a local method call that needs traversal."""

    target_method_id: str
    depth: int = 0

    def __repr__(self) -> str:
        return f"LocalCall(method={self.target_method_id}, depth={self.depth})"


@dataclass
class RemoteCallInfo:
    """Information about a remote call extracted from CFG node."""

    target_endpoint_id: Optional[str]
    endpoint: str
    http_method: Optional[str]
    resolved: bool
    target_service: Optional[str] = None

    def __repr__(self) -> str:
        if self.resolved:
            return f"RemoteCall({self.http_method} {self.endpoint} -> {self.target_endpoint_id})"
        return f"RemoteCall({self.http_method} {self.endpoint} -> UNRESOLVED)"


@dataclass
class CallChainEntry:
    """Single entry in remote call chain."""

    position: int
    endpoint_id: Optional[str]
    uri: str
    is_root: bool
    required_roles: Optional[List[str]]
    resolved: bool
    service_name: Optional[str] = None
    http_method: Optional[str] = None
    depth: int = 0

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "position": self.position,
            "endpoint_id": self.endpoint_id,
            "uri": self.uri,
            "is_root": self.is_root,
            "required_roles": self.required_roles,
            "resolved": self.resolved,
            "service_name": self.service_name,
            "http_method": self.http_method,
            "depth": self.depth
        }

    def __repr__(self) -> str:
        role_str = f"[{','.join(self.required_roles)}]" if self.required_roles else "[]"
        status = "✓" if self.resolved else "✗"
        return f"CallChainEntry({status} pos={self.position} {self.uri} roles={role_str})"
