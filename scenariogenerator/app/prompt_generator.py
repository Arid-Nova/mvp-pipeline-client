"""Prompt generator for Java test creation based on LLM-ready scenarios.

Reads the JSON produced by scenario_generator.py (scenarios_llm_ready.json) and
emits natural language prompts that instruct an LLM to generate Java tests for
specific endpoints, conditioned on scenario type and template class.
"""

import json
from pathlib import Path
from typing import Any, Dict, List

ENV_CONFIG_TEMPLATE = """
Environment Configuration:
- JWT tokens for each role are pre-configured in environment variables/properties.
- Token property pattern: test.jwt.<role> (e.g., test.jwt.admin, test.jwt.user, test.jwt.guest)
- Use @Value("${test.jwt.<role>}") to inject tokens into test classes.
"""

def load_scenarios(path: Path) -> List[Dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _base_prompt_header() -> str:
    return (
        "You are a Java test generation assistant. "
        "Given an API endpoint description and authorization scenario, "
        "generate JUnit tests (using Spring MockMvc or WebTestClient) that exercise "
        "the described behavior. Follow clean code practices and focus on the "
        "authorization aspects (status codes, roles, and security headers).\n\n"
    )


def _format_entity_schema(s: Dict[str, Any]) -> str:
    """Format scenario['entity_schema'] as a Java-style entity schema block.

    Example output:

    Entity Schema (use this to construct valid request bodies):
    {
        @Id
        @Column(length = 36)
        @GeneratedValue(generator = "order-jpa-uuid")
        private String id;
        ...
    }
    """

    schema = s.get("entity_schema")
    if not schema:
        return ""

    fields = schema.get("fields") or []
    if not fields:
        return ""

    lines: List[str] = []
    lines.append("Entity Schema (use this to construct valid request bodies):")
    lines.append("{")

    def _java_type(py_type: str | None) -> str:
        t = (py_type or "").lower()
        if t in {"int", "integer"}:
            return "int"
        if t in {"long"}:
            return "long"
        if t in {"double"}:
            return "double"
        if t in {"float"}:
            return "float"
        if t in {"boolean", "bool"}:
            return "boolean"
        return "String"

    for f in fields:
        fname = f.get("name")
        ftype = _java_type(f.get("type"))

        # Annotations (e.g., @Id, @Column(name = "from_station"))
        for ann in f.get("annotations", []) or []:
            aname = ann.get("name")
            if not aname:
                continue
            attrs = ann.get("attributes") or {}
            if attrs:
                parts = []
                for k, v in attrs.items():
                    if isinstance(v, str):
                        parts.append(f"{k} = \"{v}\"")
                    else:
                        parts.append(f"{k} = {v}")
                attr_str = "(" + ", ".join(parts) + ")"
            else:
                attr_str = ""
            lines.append(f"    @{aname}{attr_str}")

        if fname:
            lines.append(f"    private {ftype} {fname};")

    lines.append("}")
    lines.append("")

    return "\n".join(lines) + "\n"


def _format_chain_permissions(s: Dict[str, Any]) -> str:
    chain = s.get("chain_permissions") or {}
    if not chain:
        return ""

    lines: List[str] = []
    lines.append("Call Chain Permissions (each endpoint in the chain and role access):")

    for eid, info in chain.items():
        allowed = info.get("allowed_roles", []) or []
        denied = info.get("denied_roles", []) or []
        unknown = info.get("unknown_roles", []) or []

        lines.append(f"- Endpoint ID: {eid}")
        lines.append(f"  - Allowed roles: {allowed}")
        lines.append(f"  - Denied roles: {denied}")
        lines.append(f"  - Unknown roles: {unknown}")

    lines.append("")
    return "\n".join(lines) + "\n"


def _format_parameter_details(title: str, items: Any) -> str:
    if not items:
        return ""
    if not isinstance(items, list):
        return f"{title}: {items}\n\n"

    lines: List[str] = []
    lines.append(f"{title}:")
    for it in items:
        if isinstance(it, dict):
            name = it.get("name") or it.get("param") or it.get("key") or "<unknown>"
            ptype = it.get("type") or it.get("schema") or it.get("dataType")
            required = it.get("required")
            description = it.get("description") or it.get("desc")

            parts: List[str] = [str(name)]
            if ptype:
                parts.append(f"type={ptype}")
            if required is not None:
                parts.append(f"required={required}")
            if description:
                parts.append(f"description={description}")

            lines.append("- " + ", ".join(parts))
        else:
            lines.append(f"- {it}")
    lines.append("")
    return "\n".join(lines) + "\n"


def build_prompt_for_scenario(s: Dict[str, Any]) -> str:
    ctx = s.get("prompt_context", {})
    template_id = ctx.get("template_id") or s.get("prompt_template_id")
    params = ctx.get("parameters", {})

    header = _base_prompt_header()

    # Common pieces used in all templates
    scenario_id = params.get("scenario_id", s.get("scenario_id"))
    endpoint = params.get("endpoint", s.get("endpoint"))
    method = params.get("method", s.get("method"))
    service_name = params.get("service_name", s.get("service_name"))

    full_uri = params.get("fullUri", s.get("fullUri"))
    simplified_uri = params.get("simplifiedUri", s.get("simplifiedUri"))
    curl_example = params.get("curlExample", s.get("curlExample"))
    path_param_details = params.get("pathParameterDetails", s.get("pathParameterDetails"))
    query_param_details = params.get("queryParameterDetails", s.get("queryParameterDetails"))

    base_context = (
        f"Scenario ID: {scenario_id}\n"
        f"Service: {service_name}\n"
        f"HTTP Method: {method}\n"
        f"Endpoint: {endpoint}\n"
        f"Full URI: {full_uri}\n"
        f"Simplified URI: {simplified_uri}\n"
        f"Scenario Category: {ctx.get('scenario_category', s.get('scenario_category'))}\n"
        f"Template ID: {template_id}\n"
        f"Goals: " + "; ".join(ctx.get("goals", [])) + "\n\n"
    )

    if curl_example:
        base_context += f"cURL Example:\n{curl_example}\n\n"
    base_context += _format_parameter_details("Path Parameter Details", path_param_details)
    base_context += _format_parameter_details("Query Parameter Details", query_param_details)

    base_context += (
        "Request Construction Guidance (follow strictly):\n"
        "- Prefer the cURL Example as the canonical reference for headers, query params, and request body shape.\n"
        "- Use Full URI as the actual path you should call in tests.\n"
        "- Use Simplified URI only as a human-readable identifier for the endpoint pattern (do not call it if it differs from Full URI).\n"
        "- If the Full URI contains path variables, fill them with realistic values based on Path Parameter Details; if details are missing, use safe placeholders (e.g., '1', 'test', UUID).\n"
        "- Add query parameters based on Query Parameter Details; if a parameter is required, include it.\n"
        "- When a request body is required, construct a minimal valid JSON body consistent with the Entity Schema block (if provided).\n\n"
    )

    entity_schema_block = _format_entity_schema(s)
    chain_permissions_block = _format_chain_permissions(s)

    if template_id == "entrypoint_status_matrix":
        allowed = params.get("allowed_roles", [])
        denied = params.get("denied_roles", [])
        expected = params.get("expected_status_by_role", {})

        body = (
            'Generate Java tests that call this endpoint using the appropriate '
            'authentication for each role and assert the expected HTTP status codes.\n'
            'Follow this style strictly:\n'
            '- Use JUnit 5 (@Test) with Spring Boot tests: @SpringBootTest + @AutoConfigureMockMvc.\n'
            '- Use MockMvc (not WebTestClient).\n'
            '- Use real JWT tokens injected via @Value from environment properties (not @WithMockUser).\n'
            '- Add Authorization: Bearer <token> header using HttpHeaders.AUTHORIZATION.\n'
            '- Use clear, descriptive method names (e.g., method_asRole_returnsStatus).\n'
            '- Use @ActiveProfiles("test") to load test configuration.\n'
            '- Organize tests into @Nested classes by category (Allowed Roles, Denied Roles, Unauthenticated, Inter-Service, Request Validation).\n\n'
            'Required coverage:\n'
            '1) For every allowed role, create at least one test method that:\n'
            '   - Authenticates as that role.\n'
            '   - Sends a minimal but valid request body (if applicable).\n'
            '   - Asserts a 2xx status as defined in expected_status_by_role.\n'
            '2) For every denied role, create at least one test method that:\n'
            '   - Authenticates as that role.\n'
            '   - Asserts a 403 status (or the exact status specified in expected_status_by_role).\n'
            '3) If the scenario is RESTRICTED (non-public), create a test without authentication:\n'
            '   - No @WithMockUser annotation.\n'
            '   - Asserts 401 or 403 depending on typical Spring Security behavior.\n'
            '4) Create an additional test with an unsupported role (e.g., GUEST) that:\n'
            '   - Uses @WithMockUser(roles = \'GUEST\').\n'
            '   - Asserts a 403 status.\n\n'
            'Use these role and status expectations as the source of truth:\n'
            f'Allowed roles: {allowed}\n'
            f'Denied roles: {denied}\n'
            f'Expected status by role: {expected}\n\n'
            'Add short comments in the tests explaining why each role should be allowed '
            'or denied, focusing on authorization behavior rather than business logic.\n'
        )
    elif template_id == "entrypoint_public_sensitive":
        sensitivity = params.get("sensitivity_type")
        authz = params.get("authorization", {})
        inconsistencies = params.get("policy_inconsistencies", [])

        body = (
            'This endpoint appears to expose a sensitive resource (e.g., financial '
            'or PII) but is configured as PUBLIC for some paths.\n\n'
            f'Sensitivity type: {sensitivity}\n'
            f'Authorization configuration: {authz}\n'
            f'Detected policy inconsistencies: {inconsistencies}\n\n'
            'Follow this style strictly:\n'
            '- Use JUnit 5 (@Test) with Spring Boot tests: @SpringBootTest + @AutoConfigureMockMvc.\n'
            '- Use MockMvc (not WebTestClient).\n'
            '- Use real JWT tokens injected via @Value from environment properties (not @WithMockUser).\n'
            '- Add Authorization: Bearer <token> header using HttpHeaders.AUTHORIZATION.\n'
            '- Use clear, descriptive method names (e.g., method_asRole_returnsStatus).\n'
            '- Use @ActiveProfiles("test") to load test configuration.\n'
            '- Organize tests into @Nested classes by category (Allowed Roles, Denied Roles, Unauthenticated, Inter-Service, Request Validation).\n\n'
            'Required coverage:\n'
            '1) Create a test WITHOUT authentication that:\n'
            '   - Calls the endpoint anonymously.\n'
            '   - Asserts a 2xx status (showing that a sensitive resource is publicly reachable).\n'
            '2) Create a test WITH a privileged role (e.g., ADMIN) that:\n'
            '   - Authenticates as that role.\n'
            '   - Asserts a 2xx status, representing the intended protected behavior.\n'
            '3) If applicable, create a test with a non-privileged role that:\n'
            '   - Authenticates as a role that should not access this sensitive data.\n'
            '   - Asserts a 403 status (or another denial status consistent with the policy).\n\n'
            'In all tests, add short comments that explicitly explain why the behavior '
            'demonstrates a policy exposure (e.g., "financial endpoint accessible without auth").\n'
        )
    elif template_id == "downstream_consistent_path":
        max_depth = params.get("max_depth")
        total_calls = params.get("total_calls")
        allowed_roles = params.get("allowed_roles", [])

        body = (
            "This scenario represents a downstream call chain with consistent "
            "authorization policies across services.\n\n"
            f"Max call graph depth: {max_depth}\n"
            f"Total calls in chain: {total_calls}\n"
            f"Allowed roles: {allowed_roles}\n\n"
            "Follow this style strictly:\n"
            "- Use JUnit 5 (@Test) with Spring Boot tests: @SpringBootTest + @AutoConfigureMockMvc.\n"
            "- Use MockMvc.\n"
            "- Use @WithMockUser for authenticated roles.\n"
            "- Build request bodies using the domain type indicated in the scenario (e.g., Seat, Order).\n\n"
            "Required coverage:\n"
            "1) For at least one allowed role, create a test that:\n"
            "   - Sends a realistic request that triggers the full downstream chain.\n"
            "   - Asserts a 2xx status at the entrypoint.\n"
            "   - Optionally asserts response content or headers that indicate downstream work was completed.\n"
            "2) If the system exposes any observable error when downstream fails, create a negative-path test:\n"
            "   - Use malformed or incomplete data (if appropriate).\n"
            "   - Assert that the failure is NOT due to authorization (focus on auth consistency, not business errors).\n\n"
            "Add brief comments to clarify that the goal is to show consistent authorization along the chain, "
            "not to exhaustively test business logic.\n"
        )
    elif template_id in ("downstream_inconsistency_cot", "downstream_inconsistency_simple"):
        max_depth = params.get("max_depth")
        total_calls = params.get("total_calls")
        inconsistencies = params.get("policy_inconsistencies", [])
        roles = params.get("policy_inconsistency_roles", [])

        body = (
            "This scenario has at least one authorization inconsistency along a "
            "downstream call chain.\n\n"
            f"Max call graph depth: {max_depth}\n"
            f"Total calls in chain: {total_calls}\n"
            f"Inconsistencies: {inconsistencies}\n"
            f"Affected roles: {roles}\n\n"
            "Follow this style strictly:\n"
            "- Use JUnit 5 (@Test) with Spring Boot tests: @SpringBootTest + @AutoConfigureMockMvc.\n"
            "- Use MockMvc.\n"
            "- Use @WithMockUser for the affected roles.\n"
            "- Build realistic request bodies so that all downstream calls are executed.\n\n"
            "Required coverage:\n"
            "1) For each role in policy_inconsistency_roles, create at least two tests:\n"
            "   a) A test that demonstrates the expected behavior at the entrypoint (baseline).\n"
            "      - Example: entrypoint returns 2xx for that role.\n"
            "   b) A test that demonstrates the inconsistent downstream behavior.\n"
            "      - Example: a downstream call returns 403 where 2xx would be expected, or 2xx where 403 should occur.\n"
            "2) If possible, document (in comments) which service or endpoint in the chain is misconfigured, "
            "   based on the inconsistency details provided.\n\n"
            "For 'downstream_inconsistency_cot', use more detailed comments explaining each step of the chain "
            "and why the inconsistency occurs (a chain-of-thought style explanation). For "
            "'downstream_inconsistency_simple', keep comments brief and focus only on the observed status differences.\n"
        )
    else:
        body = (
            "Generate Java tests for this endpoint focusing on its authorization "
            "behavior. Use the scenario metadata above (roles, expected statuses) "
            "to design meaningful test methods.\n"
        )

    return header + base_context + chain_permissions_block + entity_schema_block + ENV_CONFIG_TEMPLATE + body


def generate_prompts(scenarios: List[Dict[str, Any]], template_filter: str | None = None) -> List[Dict[str, str]]:
    items: List[Dict[str, str]] = []

    for scenario in scenarios:
        tid = scenario.get("prompt_template_id") or scenario.get("prompt_context", {}).get("template_id")
        if template_filter and tid != template_filter:
            continue
        prompt = build_prompt_for_scenario(scenario)
        items.append({
            "scenario_id": scenario.get("scenario_id", ""),
            "prompt_template_id": tid or "",
            "prompt": prompt,
        })
    return items

