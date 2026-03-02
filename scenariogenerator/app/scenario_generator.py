"""Scenario generator for AI test project authorization flow testing.

This module generates authorization scenarios from all_vectors.json by analyzing
permission matrices and call chains to detect potential inconsistencies in
authorization policies across microservice communication paths.

The generator focuses on:
- Extracting permissions by endpoint from permission_matrix
- Classifying scenarios as EntryPointAuthorization or DownstreamPolicyConsistency
- Detecting policy inconsistencies along call chains

Downstream Authorization Policy Consistency Testing:
This testing phase verifies the consistency of authorization policies across
inter-service communication paths. It analyzes whether roles and permissions
required by downstream services are coherent with upstream entry points.

Examples of inconsistencies detected:
- Over-permission: Upstream requires 'admin' but downstream allows 'user'
- Under-permission: Upstream allows 'user' but downstream requires 'admin'

Goal:
Ensure all downstream calls preserve intended authorization boundaries,
preventing privilege escalation or inconsistent access control.
"""

import json
from pathlib import Path
from typing import Dict, List, Any, Tuple
from .ir_feature_extractor import analyze_ir_node

StatusMap = {1: "2xx", 0: "403", -1: "UNKNOWN"}

def normalize_input_data(data: dict):
    return data.values()

# =====================================================
#  LOAD AUXILIARY FILES
# =====================================================
def load_json(path: str):
    """Loads and normalizes JSON data from a file.
    
    This function loads JSON data from the specified path and normalizes it
    to a list format. If the data is a dictionary with 'endpoints' or 
    'components' keys, it extracts the values into a list.
    
    Args:
        path (str): The file path to the JSON file.
        
    Returns:
        list: The normalized JSON data as a list.
        
    Raises:
        FileNotFoundError: If the specified file does not exist.
        json.JSONDecodeError: If the file contains invalid JSON.
    """
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # normalize if dict
    if isinstance(data, dict):
        # case: top-level "endpoints" or "components"
        if "endpoints" in data and isinstance(data["endpoints"], dict):
            data = list(data["endpoints"].values())
        elif "components" in data and isinstance(data["components"], dict):
            data = list(data["components"].values())

    return data


# =====================================================
#  SCENARIO CLASSIFICATION
# =====================================================
def classify_scenario(call_chain: List[Dict[str, Any]]) -> str:
    """Classifies a scenario based on its call chain characteristics.
    
    Determines whether a scenario is an EntryPointAuthorization (single endpoint)
    or DownstreamPolicyConsistency (multiple endpoints with depth > 0) scenario.
    
    Args:
        call_chain (List[Dict[str, Any]]): A list of dictionaries representing
            the call chain, where each dictionary contains endpoint information
            and depth information.
            
    Returns:
        str: Either "DownstreamPolicyConsistency" if any call in the chain
            has depth > 0, or "EntryPointAuthorization" otherwise.
    """
    return "DownstreamPolicyConsistency" if any(c.get("depth", 0) > 0 for c in call_chain) else "EntryPointAuthorization"


# =====================================================
#  PERMISSION EXTRACTION
# =====================================================
def _row_for_endpoint(pm: Dict[str, Any], endpoint_id: str) -> Tuple[List[int], List[str]]:
    """Extracts the permission row and roles for a specific endpoint from the permission matrix.
    
    Args:
        pm (Dict[str, Any]): The permission matrix dictionary containing 'roles',
            'endpoints', and 'matrix' keys.
        endpoint_id (str): The ID of the endpoint to look up in the matrix.
        
    Returns:
        Tuple[List[int], List[str]]: A tuple containing:
            - A list of integers representing the permission values for the endpoint
            - A list of role names corresponding to the permission matrix columns
            
    Returns empty lists if the endpoint is not found or the matrix is invalid.
    """
    roles: List[str] = pm.get("roles", [])
    endpoints: List[str] = pm.get("endpoints", [])
    matrix: List[List[int]] = pm.get("matrix", [])
    if not endpoints or not matrix:
        return [], roles
    try:
        row_idx = endpoints.index(endpoint_id)
    except ValueError:
        return [], roles
    return matrix[row_idx], roles


def summarize_permissions(pm: Dict[str, Any], endpoint_id: str) -> Dict[str, Any]:
    """Summarizes permissions and detects potential inconsistencies for a specific endpoint.
    
    Analyzes the permission matrix for an endpoint to categorize roles as allowed,
    denied, or unknown. Also detects sensitive endpoints that may be incorrectly
    marked as public, which could indicate security policy violations.
    
    Args:
        pm (Dict[str, Any]): The permission matrix dictionary containing roles,
            endpoints, and permission values.
        endpoint_id (str): The ID of the endpoint to analyze.
        
    Returns:
        Dict[str, Any]: A dictionary containing:
            - allowed_roles (List[str]): Roles with permission value 1
            - denied_roles (List[str]): Roles with permission value 0  
            - unknown_roles (List[str]): Roles with permission value -1
            - expected_status_by_role (Dict[str, str]): Mapping of roles to expected
              HTTP status codes (2xx, 403, UNKNOWN)
            - is_public_endpoint (bool): True if all roles have -1 value
            - policy_inconsistencies (List[Dict]): List of detected policy violations
              such as sensitive endpoints marked as public
    """
    row, roles = _row_for_endpoint(pm, endpoint_id)
    allowed, denied, unknown = [], [], []
    expected_status_by_role = {}
    policy_inconsistencies = []
    is_public_endpoint = False

    if row:
        for i, v in enumerate(row):
            role = roles[i]
            if v == 1:
                allowed.append(role)
            elif v == 0:
                denied.append(role)
            else:
                unknown.append(role)
            expected_status_by_role[role] = StatusMap.get(v, "UNKNOWN")

        # Check if all roles are -1 (fully public endpoint)
        if all(v == -1 for v in row):
            is_public_endpoint = True

        # Sensitivity detection (based on endpoint name)
        eid_lower = endpoint_id.lower()
        if any(k in eid_lower for k in ["pay", "refund", "payment", "transaction"]):
            sensitivity_type = "FINANCIAL"
        elif any(k in eid_lower for k in ["user", "profile", "personal", "account"]):
            sensitivity_type = "PII"
        elif any(k in eid_lower for k in ["admin", "config", "manage", "report"]):
            sensitivity_type = "INTERNAL"
        else:
            sensitivity_type = "PUBLIC"

        # Mark inconsistency if a sensitive endpoint is public
        if is_public_endpoint and sensitivity_type in ["FINANCIAL", "PII", "INTERNAL"]:
            policy_inconsistencies.append({
                "type": "PolicyExposure",
                "details": {
                    "reason": f"Sensitive endpoint ({sensitivity_type}) marked as PUBLIC (-1)",
                    "endpoint": endpoint_id
                }
            })

    return {
        "allowed_roles": allowed,
        "denied_roles": denied,
        "unknown_roles": unknown,
        "expected_status_by_role": expected_status_by_role,
        "is_public_endpoint": is_public_endpoint,
        "policy_inconsistencies": policy_inconsistencies,
    }


def compute_chain_permissions(pm: Dict[str, Any], call_chain: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Computes permissions for an entire call chain using the permission matrix.

    For each endpoint in the call chain that is present in the permission matrix,
    this function computes allowed/denied/unknown roles and then derives the set
    of roles that are allowed on *every* endpoint in the chain (i.e., roles that
    can successfully traverse the whole chain without an authorization failure).

    Returns a dictionary containing:
        - chain_allowed_roles: roles allowed at all covered endpoints in the chain
        - per_endpoint: mapping endpoint_id -> {allowed_roles, denied_roles, unknown_roles}
    """

    roles: List[str] = pm.get("roles", [])
    endpoints: List[str] = pm.get("endpoints", [])
    matrix: List[List[int]] = pm.get("matrix", [])

    if not roles or not endpoints or not matrix or not call_chain:
        return {"chain_allowed_roles": [], "per_endpoint": {}}

    per_endpoint: Dict[str, Dict[str, List[str]]] = {}

    # Collect per-endpoint permissions along the chain where we have matrix rows.
    for chain in call_chain:
        eid = chain.get("endpoint_id")
        uri = chain.get("uri")

        # Resolve the identifier used in the permission_matrix. Prefer endpoint_id
        # when present, otherwise fall back to URI-based matching, including
        # entries prefixed with "UNRESOLVED:".
        pm_eid = None
        if eid and eid in endpoints:
            pm_eid = eid
        elif uri:
            # Exact URI match or UNRESOLVED:URI match, plus suffix match as a
            # safety net for slightly different encodings.
            for e in endpoints:
                if e == uri:
                    pm_eid = e
                    break
                if e.startswith("UNRESOLVED:") and e[len("UNRESOLVED:"):] == uri:
                    pm_eid = e
                    break
                if e.endswith(uri):
                    pm_eid = e
                    break

        if not pm_eid:
            continue

        row, row_roles = _row_for_endpoint(pm, pm_eid)
        if not row or not row_roles:
            continue

        allowed: List[str] = []
        denied: List[str] = []
        unknown: List[str] = []

        for r_name, v in zip(row_roles, row):
            if v == 1:
                allowed.append(r_name)
            elif v == 0:
                denied.append(r_name)
            else:
                unknown.append(r_name)

        per_endpoint[pm_eid] = {
            "allowed_roles": allowed,
            "denied_roles": denied,
            "unknown_roles": unknown,
        }

    if not per_endpoint:
        return {"chain_allowed_roles": [], "per_endpoint": {}}

    # Roles that are allowed on every endpoint for which we have data.
    chain_allowed_roles: List[str] = roles[:]
    for info in per_endpoint.values():
        chain_allowed_roles = [r for r in chain_allowed_roles if r in info["allowed_roles"]]

    return {
        "chain_allowed_roles": chain_allowed_roles,
        "per_endpoint": per_endpoint,
    }


# =====================================================
#  POLICY INCONSISTENCY DETECTION (ENHANCED)
# =====================================================
def detect_policy_inconsistency(pm: Dict[str, Any], call_chain: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Detects and classifies authorization policy inconsistencies along a call chain.

    Analyzes consecutive endpoints in a call chain to identify authorization
    policy mismatches that could lead to security vulnerabilities such as
    privilege escalation or access control bypasses.

    Enhanced to detect RestrictiveUpstream pattern where the entry point is more
    restrictive than downstream services (e.g., entry allows only ROLE_USER but
    downstream allows ROLE_ADMIN and ROLE_USER).

    Args:
        pm (Dict[str, Any]): The permission matrix containing roles, endpoints,
            and permission values.
        call_chain (List[Dict[str, Any]]): A list of dictionaries representing
            the call chain with endpoint information.

    Returns:
        List[Dict[str, Any]]: A list of inconsistency dictionaries, each containing:
            - role (str): The role affected by the inconsistency
            - type (str): The type of inconsistency (UnderPermissiveDownstream,
              OverPermissiveDownstream, UndefinedPolicy, RoleMismatch, RestrictiveUpstream)
            - details (Dict): Information about upstream/downstream endpoints
              and their permission values

    Returns an empty list if no endpoints are found in the permission matrix
    or if the matrix data is incomplete.
    """

    roles = pm.get("roles", [])
    endpoints = [c.get("endpoint_id") for c in call_chain if c.get("endpoint_id")]
    pm_endpoints: List[str] = pm.get("endpoints", [])
    matrix: List[List[int]] = pm.get("matrix", [])

    if not matrix or not roles or not endpoints:
        return []

    # Collect permission rows (in order) for the endpoints in the call chain
    rows = []
    for eid in endpoints:
        if eid in pm_endpoints:
            idx = pm_endpoints.index(eid)
            rows.append({"endpoint": eid, "values": matrix[idx]})

    inconsistencies = []

    # Compare consecutive endpoints for each role
    for r_idx, role in enumerate(roles):
        for i in range(len(rows) - 1):
            up = rows[i]
            down = rows[i + 1]
            v_up = up["values"][r_idx]
            v_down = down["values"][r_idx]

            if v_up == v_down:
                continue  # No inconsistency for this role in this transition

            # Classify type of inconsistency
            if -1 in (v_up, v_down):
                inconsistency_type = "UndefinedPolicy"
            elif v_up == 1 and v_down == 0:
                inconsistency_type = "UnderPermissiveDownstream"
            elif v_up == 0 and v_down == 1:
                inconsistency_type = "OverPermissiveDownstream"
            else:
                inconsistency_type = "RoleMismatch"

            inconsistencies.append({
                "role": role,
                "type": inconsistency_type,
                "details": {
                    "upstream_endpoint": up["endpoint"],
                    "downstream_endpoint": down["endpoint"],
                    "upstream_value": v_up,
                    "downstream_value": v_down
                }
            })

    # NEW: Check for RestrictiveUpstream pattern using call_chain.required_roles
    # This detects when the entry point is more restrictive than downstream services
    if len(call_chain) > 1:
        entry_point = call_chain[0]
        entry_roles = set(entry_point.get("required_roles") or [])

        # Skip if entry point is public (no role restrictions)
        if entry_roles:
            # Track which downstream endpoints we've already flagged for each role
            flagged_combinations = set()

            for downstream in call_chain[1:]:
                downstream_roles = set(downstream.get("required_roles") or [])

                # Skip public downstream endpoints
                if not downstream_roles:
                    continue

                # Find roles allowed downstream but NOT explicitly at entry point
                for role in roles:
                    entry_explicit = role in entry_roles
                    downstream_explicit = role in downstream_roles

                    # RestrictiveUpstream: Role can access downstream but not entry
                    if not entry_explicit and downstream_explicit:
                        # Avoid duplicate entries for the same role
                        combo_key = (role, downstream.get("endpoint_id"))
                        if combo_key not in flagged_combinations:
                            flagged_combinations.add(combo_key)
                            inconsistencies.append({
                                "role": role,
                                "type": "RestrictiveUpstream",
                                "details": {
                                    "upstream_endpoint": entry_point.get("endpoint_id"),
                                    "downstream_endpoint": downstream.get("endpoint_id"),
                                    "entry_required_roles": list(entry_roles),
                                    "downstream_required_roles": list(downstream_roles),
                                    "reason": f"{role} can access downstream but is blocked at entry point"
                                }
                            })

    return inconsistencies


# =====================================================
#  SCENARIO CATEGORIZATION & GENERATION
# =====================================================
def categorize_scenario(scenario_type: str,
                        inconsistencies: List[Dict[str, Any]],
                        sensitivity: str,
                        is_public: bool) -> str:
    """Derives a high-level scenario category for theoretical classification.

    This makes explicit the cross-product of:
    - scenario_type: EntryPointAuthorization vs DownstreamPolicyConsistency
    - presence and type of policy inconsistencies
    - sensitivity: FINANCIAL, PII, INTERNAL, PUBLIC
    - exposure: public vs restricted endpoint

    The result is a stable label that can be used in analysis, reporting and
    prompt template selection.
    """

    base = "ENTRYPOINT" if scenario_type == "EntryPointAuthorization" else "DOWNSTREAM"

    if not inconsistencies:
        inconsistency_part = "CONSISTENT"
    else:
        types = {i.get("type") for i in inconsistencies}
        if "PolicyExposure" in types and is_public:
            inconsistency_part = "POLICY_EXPOSURE"
        elif "OverPermissiveDownstream" in types:
            inconsistency_part = "OVER_PERMISSIVE"
        elif "UnderPermissiveDownstream" in types:
            inconsistency_part = "UNDER_PERMISSIVE"
        elif "UndefinedPolicy" in types:
            inconsistency_part = "UNDEFINED_POLICY"
        else:
            inconsistency_part = "ROLE_MISMATCH"

    sensitivity_part = sensitivity or "UNKNOWN"

    exposure_part = "PUBLIC" if is_public else "RESTRICTED"

    return f"{base}_{inconsistency_part}_{sensitivity_part}_{exposure_part}"


def generate_scenarios(av: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Generates structured test scenarios from all_vectors.json data.
    
    Processes each endpoint vector to create comprehensive test scenarios
    including permission analysis, policy inconsistency detection, and metadata
    for authorization testing.
    
    Args:
        av (Dict[str, Any]): The all_vectors data containing endpoint information,
            call chains, permission matrices, and statistics.
            
    Returns:
        List[Dict[str, Any]]: A list of scenario dictionaries, each containing:
            - scenario_id (str): Unique identifier for the scenario
            - type (str): EntryPointAuthorization or DownstreamPolicyConsistency
            - service_name (str): Name of the service
            - endpoint (str): The endpoint URI
            - method (str): HTTP method
            - allowed_roles/denied_roles/unknown_roles (List[str]): Permission categories
            - expected_status_by_role (Dict[str, str]): Role-to-status mapping
            - max_depth (int): Maximum call chain depth
            - total_calls (int): Total number of calls in the chain
            - policy_inconsistencies (List[Dict]): Detected authorization issues
            - policy_inconsistency_roles (List[str]): Roles with inconsistencies
            - expected_outcome (str): Description of expected test results
    """
    scenarios = []
    for endpoint_id, v in av["vectors"].items():
        ep = v["endpoint_info"]
        call_chain = v.get("call_chain", [])
        pm = v.get("permission_matrix", {})
        stats = v.get("statistics", {})

        scenario_type = classify_scenario(call_chain)
        perms_summary = summarize_permissions(pm, ep["id"])
        inconsistencies = detect_policy_inconsistency(pm, call_chain)
        chain_perms = compute_chain_permissions(pm, call_chain)

        # Use entry point's required_roles for allowed_roles (respects entry point restrictions)
        entry_point = call_chain[0] if call_chain else {}
        entry_required_roles = entry_point.get("required_roles", [])

        # If entry point has explicit requirements, use those
        # Otherwise fall back to chain_allowed_roles (for public endpoints)
        if entry_required_roles:
            effective_allowed_roles = entry_required_roles
        else:
            # Public entry point - use roles that can traverse entire chain
            effective_allowed_roles = chain_perms.get("chain_allowed_roles") or perms_summary["allowed_roles"]

        # Compute denied roles: roles not in effective_allowed_roles
        all_roles = set(pm.get("roles", []))
        effective_denied_roles = list(all_roles - set(effective_allowed_roles))

        # Compute expected status based on entry point restrictions
        expected_status_by_role = {}
        for role in pm.get("roles", []):
            if role in effective_allowed_roles:
                expected_status_by_role[role] = "2xx"
            else:
                expected_status_by_role[role] = "403"

        scenario = {
            "scenario_id": f"scn_{endpoint_id}",
            "type": scenario_type,
            "service_name": ep["service_name"],
            "endpoint": ep["uri"],
            "method": ep["method"],

            # Permissions (based on entry point restrictions)
            "allowed_roles": effective_allowed_roles,
            "denied_roles": effective_denied_roles,
            "unknown_roles": perms_summary["unknown_roles"],
            "expected_status_by_role": expected_status_by_role,
            "chain_permissions": chain_perms.get("per_endpoint", {}),

            # Metadata
            "max_depth": stats.get("max_depth_reached", 0),
            "total_calls": stats.get("total_calls", 0),
            
            # Policy inconsistencies
            "policy_inconsistencies": inconsistencies,
            "policy_inconsistency_roles": list({i["role"] for i in inconsistencies}),
            "expected_outcome": (
                "Detect and explain inconsistency in downstream authorization policies"
                if inconsistencies and scenario_type == "DownstreamPolicyConsistency"
                else "Return 2xx for allowed roles and 403 for denied roles"
            ),
        }

        # scenario_category will be enriched later, once sensitivity/authorization
        # exposure are known. For now we keep a placeholder for clarity.
        scenario["scenario_category"] = "UNSET"

        scenarios.append(scenario)
    return scenarios


# =====================================================
#  FEATURE EXTRACTION FROM ENDPOINTS.JSON
# =====================================================
def enrich_from_endpoints(scenario: Dict[str, Any], endpoints: list):
    """Enriches a scenario with detailed endpoint information from endpoints.json.
    
    Matches the scenario's endpoint URI against the endpoints data using multiple
    strategies (exact match, partial match, service-based fallback) and extracts
    authentication, authorization, API, and data schema information.
    
    Args:
        scenario (Dict[str, Any]): The scenario dictionary to enrich.
        endpoints (list): A list of endpoint data dictionaries from endpoints.json.
        
    Returns:
        Dict[str, Any]: The enriched scenario dictionary with additional fields:
            - auth (Dict): Authentication requirements and mechanisms
            - authorization (Dict): Enhanced authorization source and patterns
            - api (Dict): API characteristics like resource type and idempotency
            - data (Dict): Request/response schema information
            - notes (str): Warning message if endpoint is not found
    """
    ep_uri = scenario.get("endpoint")
    method = scenario.get("method")
    service_name = scenario.get("service_name", "").lower()

    # 1️⃣ Try exact match
    endpoint_data = next((e for e in endpoints if e.get("fullUri") == ep_uri and e.get("httpMethod") == method), None)

    # 2️⃣ Try partial match (URI contained or suffix match)
    if not endpoint_data and ep_uri:
        endpoint_data = next(
            (e for e in endpoints if ep_uri.endswith(e.get("fullUri", "")) or e.get("fullUri", "").endswith(ep_uri)),
            None,
        )

    # 3️⃣ Try service-based fallback (same service_name)
    if not endpoint_data:
        endpoint_data = next(
            (e for e in endpoints if service_name in e.get("fullUri", "").lower()),
            None,
        )

    # 4️⃣ If still nothing, skip safely
    if not endpoint_data:
        scenario["notes"] = f"[WARN] Endpoint not found for URI: {ep_uri}"
        return scenario

    # 5️⃣ Extract safely
    auth_info = endpoint_data.get("authentication") or {}
    mech_info = auth_info.get("mechanism") or {}
    authz_info = endpoint_data.get("authorization") or {}
    resp_info = endpoint_data.get("responseSchema") or {}

    scenario["auth"] = {
        "required": auth_info.get("required", False),
        "mechanism": mech_info.get("type", "Unknown"),
        "claims": mech_info.get("claims", []),
        "validation_rules": mech_info.get("validation", []),
    }

    scenario["authorization"].update({
        "source": authz_info.get("source"),
        "priority": authz_info.get("matchPriority"),
        "scope_pattern": authz_info.get("matchedPattern"),
        "public": authz_info.get("public", False),
    })

    scenario["api"] = {
        "resource_type": ep_uri.split("/")[-1] if ep_uri else None,
        "is_idempotent": endpoint_data.get("httpMethod") in ["GET", "HEAD", "OPTIONS"],
        "http_method": endpoint_data.get("httpMethod"),
    }

    status_map = (resp_info.get("statusCodes") or {})

    scenario["data"] = {
        "request_body_type": (endpoint_data.get("requestBodyDetail") or {}).get("type"),
        "response_type_name": (status_map.get("200") or {}).get("typeName"),
        "status_code_map": {k: (v or {}).get("typeName", "") for k, v in status_map.items()},
        "error_descriptions": {k: (v or {}).get("description", "") for k, v in status_map.items()},
    }

    # Expose raw parameter and URI metadata from endpoints.json for downstream consumers.
    scenario["pathParameterDetails"] = endpoint_data.get("pathParameterDetails", [])
    scenario["queryParameterDetails"] = endpoint_data.get("queryParameterDetails", [])
    scenario["fullUri"] = endpoint_data.get("fullUri")
    scenario["simplifiedUri"] = endpoint_data.get("simplifiedUri")
    scenario["curlExample"] = endpoint_data.get("curlExample")

    return scenario


# =====================================================
#  FEATURE EXTRACTION FROM COMPONENTS.JSON
# =====================================================
def enrich_from_components(scenario: Dict[str, Any], components: list):
    """Enriches a scenario with architectural information from components.json.
    
    Matches the scenario's service name against component data to extract
    architectural context including layer classification, dependencies, and
    entry point status.
    
    Args:
        scenario (Dict[str, Any]): The scenario dictionary to enrich.
        components (list): A list of component data dictionaries from components.json.
        
    Returns:
        Dict[str, Any]: The enriched scenario dictionary with additional
            'architecture' field containing:
            - layer (str): Component type or architectural layer
            - dependencies (List[str]): List of component dependencies
            - is_entrypoint (bool): True if component has no callers
            
        Returns the original scenario unchanged if no matching component is found.
    """
    service = scenario["service_name"]
    comp_data = next(
        (
            c for c in components
            if service in c.get("name", "") or service in c.get("id", "") or service in str(c)
        ),
        None,
    )
    if not comp_data:
        return scenario

    scenario["architecture"] = {
        "layer": comp_data.get("type", "Unknown"),
        "dependencies": comp_data.get("dependencies", []),
        "is_entrypoint": not bool(comp_data.get("calledBy", [])),
    }

    return scenario


def enrich_entity_schema_from_components(scenario: Dict[str, Any], components: list):
    """Attach an entity_schema for the request body type using components.json.

    Looks up the scenario's request_body_type (from endpoints.json enrichment)
    and collects all matching Field components (and their field-level
    annotations) for the corresponding entity class. The result is stored under
    scenario["entity_schema"], which can be used to construct valid request
    bodies in LLM prompts.

    If no request_body_type is present or no matching fields are found, the
    scenario is returned unchanged.
    """

    data_info = scenario.get("data") or {}
    entity_type = data_info.get("request_body_type")
    if not entity_type:
        return scenario

    service = scenario.get("service_name", "")

    fields: List[Dict[str, Any]] = []

    # Pre-collect annotations by class for efficient lookup
    annotations_by_class: Dict[str, List[Dict[str, Any]]] = {}
    for c in components:
        if c.get("type") == "Annotation":
            cls = c.get("className")
            if cls:
                annotations_by_class.setdefault(cls, []).append(c)

    class_annotations = annotations_by_class.get(entity_type, [])

    for c in components:
        if c.get("type") != "Field":
            continue
        if c.get("className") != entity_type:
            continue
        micro = c.get("microservice", "")
        if service and service not in micro:
            continue

        field_name = c.get("name")
        field_type = c.get("effectiveTypeName") or c.get("fieldType")

        field_annotations: List[Dict[str, Any]] = []
        seen_ann: set[tuple] = set()
        for a in class_annotations:
            full_id = a.get("fullID") or a.get("fullId") or ""
            if f"#field:instance#field:{field_name}:" not in full_id:
                continue

            aname = a.get("name")
            attrs = a.get("attributes", {}) or {}

            # Build a hashable key (annotation name + sorted attributes) to
            # avoid duplicates when components.json contains repeated entries
            # for the same field-level annotation.
            key = (aname, tuple(sorted(attrs.items())))
            if key in seen_ann:
                continue
            seen_ann.add(key)

            field_annotations.append({
                "name": aname,
                "attributes": attrs,
            })

        fields.append({
            "name": field_name,
            "type": field_type,
            "annotations": field_annotations,
        })

    if not fields:
        return scenario

    scenario["entity_schema"] = {
        "entity_name": entity_type,
        "service_name": service,
        "fields": fields,
    }

    return scenario

# infer sensitivity and data awareness from endpoint
def infer_data_and_sensitivity(scenario: Dict[str, Any]):
    """Infers data awareness level and endpoint sensitivity from scenario characteristics.
    
    Analyzes the endpoint URI and call chain depth to determine the sensitivity
    type (FINANCIAL, PII, INTERNAL, PUBLIC) and data awareness level (HIGH/LOW).
    Also detects policy violations where sensitive endpoints are marked as public.
    
    Args:
        scenario (Dict[str, Any]): The scenario dictionary to analyze and enrich.
            Must contain 'endpoint' and 'max_depth' fields, and 'authorization'
            field with 'public' key.
            
    Returns:
        Dict[str, Any]: The enriched scenario dictionary with additional fields:
            - data_awareness_level (str): "HIGH" for multi-call scenarios, "LOW" otherwise
            - llm_prompt_type (str): "CHAIN_OF_THOUGHT" for HIGH, "SIMPLE" for LOW
            - sensitivity_type (str): One of "FINANCIAL", "PII", "INTERNAL", "PUBLIC"
            - policy_inconsistencies (List[Dict]): Additional violations if sensitive
              endpoints are marked as public
    """
    uri = scenario.get("endpoint", "").lower()
    depth = scenario.get("max_depth", 0)

    # Data awareness
    if depth > 0:
        scenario["data_awareness_level"] = "HIGH"
        scenario["llm_prompt_type"] = "CHAIN_OF_THOUGHT"
    else:
        scenario["data_awareness_level"] = "LOW"
        scenario["llm_prompt_type"] = "SIMPLE"

    # Sensitivity inference
    if any(k in uri for k in ["pay", "refund", "payment"]):
        scenario["sensitivity_type"] = "FINANCIAL"
    elif any(k in uri for k in ["user", "profile", "personal", "account"]):
        scenario["sensitivity_type"] = "PII"
    elif any(k in uri for k in ["admin", "config", "report", "manage"]):
        scenario["sensitivity_type"] = "INTERNAL"
    else:
        scenario["sensitivity_type"] = "PUBLIC"

    # Public financial or PII endpoints = anomaly
    if scenario["sensitivity_type"] in ["FINANCIAL", "PII"] and scenario["authorization"].get("public", False):
        scenario.setdefault("policy_inconsistencies", []).append({
            "role": "PUBLIC",
            "type": "PolicyExposure",
            "details": {"reason": "Sensitive endpoint marked as PUBLIC (-1)"}
        })

    return scenario


# =====================================================
#  BUILD LLM PROMPT CONTEXT
# =====================================================
def select_prompt_template_id(scenario: Dict[str, Any]) -> str:
    """Selects a prompt template identifier based on scenario classification.

    Uses scenario_category together with scenario type and data awareness level
    to map each scenario into a stable prompt template class that the Test
    Generator/LLM can target.
    """

    category = scenario.get("scenario_category", "UNSET") or "UNSET"
    scenario_type = scenario.get("type")
    data_level = scenario.get("data_awareness_level", "LOW")

    if category == "UNSET":
        return "generic_authorization"

    # Entry-point focused templates
    if scenario_type == "EntryPointAuthorization":
        if "POLICY_EXPOSURE" in category:
            return "entrypoint_public_sensitive"
        return "entrypoint_status_matrix"

    # Downstream consistency templates
    if "CONSISTENT" in category:
        return "downstream_consistent_path"

    if data_level == "HIGH":
        return "downstream_inconsistency_cot"
    return "downstream_inconsistency_simple"


def build_prompt_context(scenario: Dict[str, Any]):
    """Builds LLM prompt context with goals and sensitivity information.
    
    Creates structured prompt context for LLM-based test generation based on
    scenario type, data awareness level, and sensitivity characteristics.
    
    Args:
        scenario (Dict[str, Any]): The scenario dictionary to build context for.
            Should contain 'type', 'data_awareness_level', and 'sensitivity_type' fields.
            
    Returns:
        Dict[str, Any]: The scenario dictionary with added 'prompt_context' field:
            - goals (List[str]): List of testing goals tailored to scenario type
            - prompt_type (str): LLM prompt type (CHAIN_OF_THOUGHT or SIMPLE)
            - sensitivity (str): Endpoint sensitivity classification
    """
    is_downstream = scenario.get("type") == "DownstreamPolicyConsistency"
    data_level = scenario.get("data_awareness_level", "LOW")

    base_goals = [
        "Validate role-based access control enforcement.",
        "Check that PUBLIC endpoints do not expose sensitive resources (PII/Financial)."
    ]
    if is_downstream:
        base_goals.append("Detect inconsistent authorization policies across services.")
        if data_level == "HIGH":
            base_goals.append("Ensure test data enables full downstream traversal without mid-chain exceptions.")

    template_id = scenario.get("prompt_template_id", "generic_authorization")

    # Build a focused view of parameters that the LLM prompt should receive.
    # This makes explicit which scenario fields are considered inputs per
    # template class.
    if template_id == "entrypoint_status_matrix":
        parameters = {
            "scenario_id": scenario.get("scenario_id"),
            "endpoint": scenario.get("endpoint"),
            "method": scenario.get("method"),
            "service_name": scenario.get("service_name"),
            "allowed_roles": scenario.get("allowed_roles", []),
            "denied_roles": scenario.get("denied_roles", []),
            "expected_status_by_role": scenario.get("expected_status_by_role", {}),
        }
    elif template_id == "entrypoint_public_sensitive":
        parameters = {
            "scenario_id": scenario.get("scenario_id"),
            "endpoint": scenario.get("endpoint"),
            "method": scenario.get("method"),
            "service_name": scenario.get("service_name"),
            "sensitivity_type": scenario.get("sensitivity_type"),
            "authorization": scenario.get("authorization", {}),
            "policy_inconsistencies": scenario.get("policy_inconsistencies", []),
        }
    elif template_id == "downstream_consistent_path":
        parameters = {
            "scenario_id": scenario.get("scenario_id"),
            "service_name": scenario.get("service_name"),
            "endpoint": scenario.get("endpoint"),
            "method": scenario.get("method"),
            "max_depth": scenario.get("max_depth", 0),
            "total_calls": scenario.get("total_calls", 0),
            "allowed_roles": scenario.get("allowed_roles", []),
        }
    elif template_id in ("downstream_inconsistency_cot", "downstream_inconsistency_simple"):
        parameters = {
            "scenario_id": scenario.get("scenario_id"),
            "service_name": scenario.get("service_name"),
            "endpoint": scenario.get("endpoint"),
            "method": scenario.get("method"),
            "max_depth": scenario.get("max_depth", 0),
            "total_calls": scenario.get("total_calls", 0),
            "policy_inconsistencies": scenario.get("policy_inconsistencies", []),
            "policy_inconsistency_roles": scenario.get("policy_inconsistency_roles", []),
        }
    else:
        # Generic fallback with core identification fields.
        parameters = {
            "scenario_id": scenario.get("scenario_id"),
            "service_name": scenario.get("service_name"),
            "endpoint": scenario.get("endpoint"),
            "method": scenario.get("method"),
            "type": scenario.get("type"),
        }

    scenario["prompt_context"] = {
        "goals": base_goals,
        "prompt_type": scenario.get("llm_prompt_type", "SIMPLE"),
        "sensitivity": scenario.get("sensitivity_type", "UNKNOWN"),
        "scenario_category": scenario.get("scenario_category", "UNSET"),
        "template_id": template_id,
        "parameters": parameters,
    }

    return scenario

