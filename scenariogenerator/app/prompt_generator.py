"""Prompt generator for Java test creation based on LLM-ready scenarios.

Reads the JSON produced by scenario_generator.py (scenarios_llm_ready.json) and
emits natural language prompts that instruct an LLM to generate Java tests for
specific endpoints, conditioned on scenario type and template class.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, final

def get_env_config(language: str) -> str:
    lang = language.lower()
    if lang == "python":
        return (
            "Environment Configuration:\n"
            "- JWT tokens for each role are pre-configured in environment variables.\n"
            "- Token variable pattern: TEST_JWT_<ROLE> (e.g., TEST_JWT_ADMIN, TEST_JWT_USER).\n"
            "- Use os.getenv('TEST_JWT_<ROLE>') to inject tokens into tests.\n"
        )
    elif lang == "curl":
        return (
            "Environment Configuration:\n"
            "- JWT tokens for each role are exported in the shell environment.\n"
            "- Token variable pattern: $TEST_JWT_<ROLE> (e.g., $TEST_JWT_ADMIN, $TEST_JWT_USER).\n"
            "- Use these variables directly in your cURL headers.\n"
        )
    else: # default java
        return (
            "Environment Configuration:\n"
            "- JWT tokens for each role are pre-configured in environment variables/properties.\n"
            "- Token property pattern: test.jwt.<role> (e.g., test.jwt.admin, test.jwt.user)\n"
            "- Use @Value(\"${test.jwt.<role>}\") to inject tokens into test classes.\n"
        )

def _base_job(language: str) -> str:
    lang = language.lower()
    if lang == "python":
        return (
            "YOUR JOB: \n"
            "Analyze the API endpoint descriptions and authorization scenario, and "
            "generate Pytest scripts (using requests or httpx) that exercise "
            "the described role-based access control behavior. Follow clean code practices and focus on the "
            "authorization aspects (status codes, roles, and security headers)."
        )
    elif lang == "curl":
        return (
            "YOUR JOB: \n"
            "Analyze the API endpoint descriptions and authorization scenario, and "
            "generate bash scripts containing cURL commands that exercise "
            "the described role-based access controlbehavior. Focus heavily on testing authorization "
            "(status codes, roles, and security headers)."
        )
    else: # default java
        return (
            "YOUR JOB: \n"
            "Analyze the API endpoint descriptions and authorization scenario, and "
            "generate JUnit tests (using Spring MockMvc or WebTestClient) that exercise "
            "the described role-based access control behavior. Follow clean code practices and focus on the "
            "authorization aspects (status codes, roles, and security headers)."
        )

def _job_additions(inconsistency: bool = False) -> str:
    if inconsistency:
        return "These tests should detect authorization policy mismatches across microservice call chains.\n\n"
    else:
        return "\n\n"
    
def _base_prompt_header(language: str) -> str:
    lang = language.lower()
    if lang == "python":
        return (
            "You are an API authorization test generator in Python "
            "for a microservice system which makes REST calls to downstream services.\n\n "
        )
    elif lang == "curl":
        return (
            "You are an API authorization test generator in shell script format "
            "for a microservice system which makes REST calls to downstream services.\n\n "
        )
    else: # default java
        return (
            "You are an API authorization test generator in Java "
            "for a microservice system which makes REST calls to downstream services.\n\n "
        )

def _get_rules(inconsistency: bool = False) -> str:
    if inconsistency:
        return (
            "RULES:\n"
            "1. Parse the INPUT DATA JSON including the downstream_context section"
            "2. For roles in policy_inconsistency_roles:"
            "    - UnderPermissiveDownstream: Entry allows but downstream denies → expect 500 or error"
            "    - OverPermissiveDownstream: Entry denies correctly → expect 403"
            "    - PolicyExposure: Check data access control → expect appropriate denial"
            "3. For roles NOT in policy_inconsistency_roles (consistent behavior):"
            "    - Apply standard rules (allowed_roles → 2xx, denied_roles → 403)"
            "4. Use token placeholders: {{TOKEN_ROLE_ADMIN}}, {{TOKEN_ROLE_USER}}"
            "5. For ANONYMOUS tests, set authPlaceholder to \"NONE\""
            "    - If is_public=true → expect 2xx (public endpoints allow unauthenticated access)"
            "    - If is_public=false → expect 401 or 403"
            "6. For INVALID_TOKEN tests, set authPlaceholder to \"{{TOKEN_INVALID}}\" and expect 401 (or any 4xx/5xx)"
            "7. Set alternateAcceptable status codes for inconsistency roles (e.g., [500, 502, 503, 403])\n\n"
            "PATH AND QUERY PARAMETERS:\n"
            "    - Path parameters: Replace placeholders in the URL with realistic values based on type"
            "    - Query parameters: Add as URL query string if required=true"
            "    - Use chain_permissions to understand permission flow through the call chain\n\n"
            "DATA SENSITIVITY:\n"
            "    - For sensitive endpoints (PII, FINANCIAL), ensure proper access control tests"
            "    - Check for data exposure through policy inconsistencies\n"
        )

    return (
        "RULES:\n"
        "1. Parse the INPUT DATA JSON to understand the endpoint and authorization requirements\n"
        "2. Generate realistic request bodies using entity_schema.fields:\n"
        "   - String fields → realistic values (names, IDs, amounts - not \"test\" or empty)\n"
        "   - int/long fields → realistic numbers\n"
        "   - double/float fields → decimal numbers\n"
        "   - boolean fields → true/false\n"
        "   - UUID fields → use realistic UUID format like \"550e8400-e29b-41d4-a716-446655440000\"\n"
        "3. Use token placeholders: {{TOKEN_ROLE_ADMIN}}, {{TOKEN_ROLE_USER}}\n"
        "4. For ANONYMOUS tests, set authPlaceholder to \"NONE\" and omit Authorization header\n"
        "5. For INVALID_TOKEN tests, set authPlaceholder to \"{{TOKEN_INVALID}}\" (will be replaced with a corrupted token)\n"
        "6. Map roles to expected statuses:\n"
        "   - Roles in allowed_roles → expect 2xx\n"
        "   - Roles in denied_roles → expect 403\n"
        "   - ANONYMOUS when is_public=true → expect 2xx (public endpoints allow unauthenticated access)\n"
        "   - ANONYMOUS when is_public=false → expect 401 or 403\n"
        "   - INVALID_TOKEN → expect 401 (or any 4xx/5xx, use alternateAcceptable: [400, 403, 500, 502, 503])\n\n"
        "PATH AND QUERY PARAMETERS:\n"
        "   - Path parameters: Replace placeholders in the URL with realistic values based on type\n"
        "       - Long/int IDs → use numbers like 1, 123, 42\n"
        "       - UUID → use \"550e8400-e29b-41d4-a716-446655440000\"\n"
        "       - String names → use realistic values like \"john-doe\", \"order-123\"\n"
        "   - Query parameters: Add as URL query string if required=true or needed for the test\n"
        "       - Follow the type constraints (string, int, boolean, etc.)\n\n"
        "DATA SENSITIVITY:\n"
        "   - PII data: Use realistic but clearly fake data (e.g., \"John Doe\", \"john.doe@example.com\")\n"
        "   - Financial data: Use test amounts (e.g., 99.99, 1000.00)\n"
        "   - For sensitive endpoints, generate comprehensive validation tests\n\n"
    )

def _get_framework_instructions(language: str) -> str:
    lang = language.lower()
    if lang == "python":
        return (
            "TARGET FRAMEWORK:\n"
            "- Use Pytest framework.\n"
            "- Use the `requests` library to make HTTP calls.\n"
            "- Add the Authorization header as: `{'Authorization': f'Bearer {token}'}`.\n"
            "- Use clear, descriptive test function names (e.g., test_endpoint_as_role_returns_status).\n"
            "- Organize tests logically (Allowed Roles, Denied Roles, Unauthenticated).\n"
        )
    elif lang == "curl":
        return (
            "TARGET FRAMEWORK:\n"
            "- Write clean, commented bash scripts with cURL commands.\n"
            "- Use `-H \"Authorization: Bearer $TEST_JWT_<ROLE>\"` to authenticate.\n"
            "- Use `-w \"%{http_code}\"` to capture and verify HTTP status codes.\n"
            "- Group commands clearly by category (Allowed Roles, Denied Roles, Unauthenticated).\n"
        )
    else: # default java
        return (
            "TARGET FRAMEWORK:\n"
            "- Use JUnit 5 (@Test) with Spring Boot tests: @SpringBootTest + @AutoConfigureMockMvc.\n"
            "- Use MockMvc (not WebTestClient).\n"
            "- Use real JWT tokens injected via @Value from environment properties (do NOT use @WithMockUser).\n"
            "- Add Authorization: Bearer <token> header using HttpHeaders.AUTHORIZATION.\n"
            "- Use clear, descriptive method names (e.g., method_asRole_returnsStatus).\n"
            "- Use @ActiveProfiles(\"test\") to load test configuration.\n"
            "- Organize tests into @Nested classes by category.\n"
        )

def load_scenarios(path: Path) -> List[Dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)
    
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

def __base_input_format(inconsistency: bool = False) -> str:
    if inconsistency:
        return (
            "INPUT FORMAT:\n" 
            "You will receive downstream_context with policy inconsistency information " 
            "followed by scenario data as JSON, describing a downstream call chain with authorization inconsistencies." 
            "Pay special attention to the 'chain_permissions' block which details the expected access for each role at " 
            "every endpoint in the chain. Your tests should be designed to reveal these inconsistencies clearly.\n\n"
        )
    return (
        "INPUT FORMAT:\n" 
        "You will receive task instructions followed by scenario data as JSON.\n\n"
    )

def _path_param_instructions() -> str:
    return (
        "PATH PARAMETERS:\n"
        "- If the endpoint URL contains placeholders (e.g., /orders/{orderId}), replace them with realistic values.\n"
        "- Use the 'pathParameterDetails' from the scenario to understand the expected type and format of each parameter.\n"
        "- For example, if 'orderId' is a long integer, use a value like 123 or 42. If it's a UUID, use a realistic UUID format.\n"
        "- Ensure that the path parameters you choose would be considered valid by the API (e.g., existing IDs if possible)."
        "- For UUIDs: use \"550e8400-e29b-41d4-a716-446655440000\""
        "- For String names: use descriptive values like \"test-resource\".\n\n"
    )

def _query_param_instructions() -> str:
    return (
        "QUERY PARAMETERS:\n"
        "- Add query parameters to the request URL as needed, based on the 'queryParameterDetails' in the scenario.\n"
        "- Include all required query parameters, and consider adding optional ones if they are relevant to the test.\n"
        "- Follow the type and format specified for each query parameter (e.g., string, int, boolean).\n"
        "- For boolean parameters, test both true and false values if applicable.\n\n"
    )

def build_prompt_for_scenario(s: Dict[str, Any], language: str = "java") -> str:
    ctx = s.get("prompt_context", {})
    template_id = ctx.get("template_id") or s.get("prompt_template_id")
    params = ctx.get("parameters", {})

    inconsistencies = s.get("policy_inconsistencies", [])
    inconsistency = len(inconsistencies) > 0

    prompt = ""
    
    # Piecing together parts of the prompt
    prompt += _base_prompt_header(language)
    prompt += _base_job(language)
    prompt += _job_additions(inconsistency)
    prompt += __base_input_format()
    prompt += _get_rules(inconsistency)
    prompt += get_env_config(language)

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
        "- Use Simplified URI only as a human-readable identifier for the endpoint pattern.\n"
        "- If the Full URI contains path variables, fill them with realistic values based on Path Parameter Details.\n"
        "- Add query parameters based on Query Parameter Details; if a parameter is required, include it.\n"
        "- When a request body is required, construct a minimal valid JSON body consistent with the Entity Schema block.\n\n"
    )

    prompt += base_context
    prompt += _format_chain_permissions(s)
    
    # entity_schema_block = _format_entity_schema(s)

    path_params = s.get("pathParameterDetails", [])
    if len(path_params) > 0:
        prompt += _path_param_instructions()

    query_params = s.get("queryParameterDetails", [])
    if len(query_params) > 0:
        prompt += _query_param_instructions()

    sensitive = s.get("handles_pii")
    sensitivity_type = s.get("sensitivity_type")
    if sensitive:
        prompt += (
            f"SENSITIVE DATA HANDLING:\n"
            f"- This endpoint handles {sensitivity_type} data"
            f"- Generate realistic but clearly fake test data"
            f"- Ensure comprehensive access control validation.\n\n")

    complexity = ctx.get("prompt_type") or s.get("scenario_category") or "SIMPLE"
    if complexity == "CHAIN_OF_THOUGHT":
        prompt += (
            "ANALYSIS APPROACH:\n"
            "- For complex scenarios (e.g., downstream inconsistencies), include detailed comments in the tests that explain your reasoning.\n"
            "- Walk through the expected behavior at each step of the call chain, especially where inconsistencies are expected.\n"
            "- Use comments to clarify why certain roles should be allowed or denied at each endpoint, and how this relates to the overall scenario goals. "
            "- Check for potential security gaps too. \n\n"
        )

    framework_instructions = _get_framework_instructions(language)

    # Dynamic terminology based on target language
    test_word = "scripts/commands" if language.lower() == "curl" else "tests"

    if template_id == "entrypoint_status_matrix":
        allowed = params.get("allowed_roles", [])
        denied = params.get("denied_roles", [])
        expected = params.get("expected_status_by_role", {})

        body = (
            f'Generate {language.capitalize()} {test_word} that call this endpoint using the appropriate '
            'authentication for each role and assert the expected HTTP status codes.\n'
            'Follow this style strictly:\n'
            f'{framework_instructions}\n'
            'Required coverage:\n'
            f'1) For every allowed role, create at least one {test_word[:-1]} that:\n'
            '   - Authenticates as that role.\n'
            '   - Sends a minimal but valid request body (if applicable).\n'
            '   - Asserts a 2xx status as defined in expected_status_by_role.\n'
            f'2) For every denied role, create at least one {test_word[:-1]} that:\n'
            '   - Authenticates as that role.\n'
            '   - Asserts a 403 status (or the exact status specified in expected_status_by_role).\n'
            f'3) If the scenario is RESTRICTED (non-public), create a {test_word[:-1]} without authentication:\n'
            '   - Do not include any authorization headers.\n'
            '   - Asserts 401 or 403 depending on typical security behavior.\n'
            f'4) Create an additional {test_word[:-1]} with an unsupported role (e.g., GUEST) that:\n'
            '   - Authenticates as the GUEST role.\n'
            '   - Asserts a 403 status.\n\n'
            'Use these role and status expectations as the source of truth:\n'
            f'Allowed roles: {allowed}\n'
            f'Denied roles: {denied}\n'
            f'Expected status by role: {expected}\n\n'
            f'Add short comments in the {test_word} explaining why each role should be allowed '
            'or denied, focusing on authorization behavior rather than business logic.\n'
            'Generate a realistic request body from entity_schema.fields (if present and method is POST/PUT/PATCH).\n'
            'Include path_params and query_params in the request if applicable.\n'
            'Include a brief rationale explaining why this status is expected.\n\n'
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
            f'{framework_instructions}\n'
            'Required coverage:\n'
            f'1) Create a {test_word[:-1]} WITHOUT authentication that:\n'
            '   - Calls the endpoint anonymously.\n'
            '   - Asserts a 2xx status (showing that a sensitive resource is publicly reachable).\n'
            f'2) Create a {test_word[:-1]} WITH a privileged role (e.g., ADMIN) that:\n'
            '   - Authenticates as that role.\n'
            '   - Asserts a 2xx status, representing the intended protected behavior.\n'
            f'3) If applicable, create a {test_word[:-1]} with a non-privileged role that:\n'
            '   - Authenticates as a role that should not access this sensitive data.\n'
            '   - Asserts a 403 status (or another denial status consistent with the policy).\n\n'
            f'In all {test_word}, add short comments that explicitly explain why the behavior '
            'demonstrates a policy exposure (e.g., "financial endpoint accessible without auth").\n'
            'Generate a realistic request body from entity_schema.fields (if present and method is POST/PUT/PATCH).\n'
            'Include path_params and query_params in the request if applicable.\n'
            'Include a brief rationale explaining why this status is expected.\n\n'
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
            f"{framework_instructions}\n"
            "- Build request bodies using the domain type indicated in the scenario.\n\n"
            "Required coverage:\n"
            f"1) For at least one allowed role, create a {test_word[:-1]} that:\n"
            "   - Sends a realistic request that triggers the full downstream chain.\n"
            "   - Asserts a 2xx status at the entrypoint.\n"
            "   - Optionally asserts response content or headers that indicate downstream work was completed.\n"
            f"2) If the system exposes any observable error when downstream fails, create a negative-path {test_word[:-1]}:\n"
            "   - Use malformed or incomplete data (if appropriate).\n"
            "   - Assert that the failure is NOT due to authorization (focus on auth consistency, not business errors).\n\n"
            "Add brief comments to clarify that the goal is to show consistent authorization along the chain, "
            "not to exhaustively test business logic.\n"
            'Generate a realistic request body from entity_schema.fields (if present and method is POST/PUT/PATCH).\n'
            'Include path_params and query_params in the request if applicable.\n'
            'Include a brief rationale explaining why this status is expected.\n\n'
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
            f"{framework_instructions}\n"
            "- Build realistic request bodies so that all downstream calls are executed.\n\n"
            "Required coverage:\n"
            f"1) For each role in policy_inconsistency_roles, create at least two {test_word}:\n"
            f"   a) A {test_word[:-1]} that demonstrates the expected behavior at the entrypoint (baseline).\n"
            "      - Example: entrypoint returns 2xx for that role.\n"
            f"   b) A {test_word[:-1]} that demonstrates the inconsistent downstream behavior.\n"
            "      - Example: a downstream call returns 403 where 2xx would be expected, or 2xx where 403 should occur.\n"
            "2) If possible, document (in comments) which service or endpoint in the chain is misconfigured, "
            "   based on the inconsistency details provided.\n\n"
            "For 'downstream_inconsistency_cot', use more detailed comments explaining each step of the chain "
            "and why the inconsistency occurs (a chain-of-thought style explanation). For "
            "'downstream_inconsistency_simple', keep comments brief and focus only on the observed status differences.\n"
            "Generate a realistic request body from entity_schema.fields (if present and method is POST/PUT/PATCH).\n"
            "Include path_params and query_params in the request if applicable.\n"
            "Include rationale explaining the expected behavior based on the inconsistency type."
            "Note which downstream service causes the inconsistency (from policy_inconsistencies).\n\n"
        )
    else:
        body = (
            f"Generate {language.capitalize()} {test_word} for this endpoint focusing on its authorization "
            "behavior. Use the scenario metadata above (roles, expected statuses) "
            f"to design meaningful {test_word}.\n"
        )
    
    prompt += body

    s['_id'] = str(s['_id'])
    prompt += (
        "INPUT DATA JSON:\n"
        f"{json.dumps(s)}"
    )

    return prompt

def generate_prompts(
    scenarios: List[Dict[str, Any]], 
    template_filter: Optional[str] = None,
    language: str = 'java'
) -> List[Dict[str, str]]:
    items: List[Dict[str, str]] = []

    for scenario in scenarios:
        tid = scenario.get("prompt_template_id") or scenario.get("prompt_context", {}).get("template_id")
        
        if template_filter and tid != template_filter:
            continue
            
        prompt = build_prompt_for_scenario(scenario, language=language)
        items.append({
            "scenario_id": scenario.get("scenario_id", ""),
            "prompt_template_id": tid or "",
            "prompt": prompt,
        })
    return items