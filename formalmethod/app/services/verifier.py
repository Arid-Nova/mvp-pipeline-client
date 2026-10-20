import time
import os
from typing import Any, Dict
from z3 import sat, unsat
import requests
import gzip
import json
from ..core.solver.auth_solver import AuthorizationConsistencySolver
from ..services.parser import getModelFromIRAndCode
from ..services.authorization_capability import unsupported_authorization
from ..javascript_policy import reports_from, verify_policy
from ..source_scope import source_languages

def run_verification(ir_id: str, repo_mappings: list, ir_data=None, expected_policy=None):
    logs = []
    suggestions = []
    start_time = time.perf_counter()

    logs.append(f"Building System Model from {len(repo_mappings)} repositories...")
    
    if ir_data is None:
        ir_data = _getIRData(ir_id)

    unsupported = unsupported_authorization(ir_data)
    if unsupported:
        try:
            reports = reports_from(ir_data)
        except ValueError:
            reports = []
        # Older reports without typed models preserve the former explicit guard.
        if source_languages(ir_data).issubset({"java", "javascript", "typescript"}) and any(endpoint.get("policyModel") for report in reports for endpoint in report.get("endpoints", [])):
            policy = verify_policy(ir_data, expected_policy)
            return {"status": "JAVASCRIPT_ANALYZED", "is_satisfiable": None,
                    "suggestions": [], "logs": ["Scoped finite JavaScript model analyzed; see property-specific verification results."],
                    "processing_time_seconds": time.perf_counter() - start_time,
                    "capability_status": policy["status"], "policyAnalysis": policy,
                    "unsupported_components": unsupported.get("unsupported_components", []),
                    "reason": "No whole-system Java authorization verdict is assigned to the JavaScript finite model."}
        logs.append(unsupported["reason"])
        return {
            "status": "UNSUPPORTED",
            "is_satisfiable": None,
            "suggestions": [],
            "logs": logs,
            "processing_time_seconds": time.perf_counter() - start_time,
            **unsupported,
        }

    ms_system = getModelFromIRAndCode(ir_data, repo_mappings)
    
    logs.append("Initializing Solver...")
    solver_wrapper = AuthorizationConsistencySolver(ms_system)
    
    # Add Standard Constraints
    solver_wrapper.addAtLeastOnePermittedRoleConstraints()
    solver_wrapper.addEndpointPermittedRoleConstraints()
    solver_wrapper.addDataEntityOperationConsistencyConstraints()

    # 1. Verify Satisfiability
    logs.append("Checking Satisfiability...")
    verifier = solver_wrapper.buildVerifier()
    check_result = verifier.check()
    
    is_satisfiable = False
    status_str = "UNKNOWN"

    if check_result == sat:
        status_str = "SAT"
        is_satisfiable = True
        logs.append("System constraints are satisfiable.")
    elif check_result == unsat:
        status_str = "UNSAT"
        logs.append("System constraints are UNSATISFIABLE.")
    
    # 2. Run Optimizer to generate suggestions
    # Even if SAT, we run this to see if permissions can be tightened or fixed
    logs.append("Running Optimizer for suggestions...")
    opt = solver_wrapper.buildOptimizer()
    opt_result = opt.check()

    if opt_result == sat:
        model = opt.model()
        suggestions = extract_suggestions(model, ms_system)
        logs.append(f"Optimizer found {len(suggestions)} suggestions.")
    else:
        logs.append("Optimizer could not find a solution.")

    end_time = time.perf_counter()

    return {
        "status": status_str,
        "is_satisfiable": is_satisfiable,
        "suggestions": suggestions,
        "logs": logs,
        "processing_time_seconds": end_time - start_time
    }

def extract_suggestions(model, msSystem):
    results = []
    
    # Z3 model declarations
    for decl in model.decls():
        var_name = decl.name()
        # Filter for role variables
        if "_permittedRoles" in var_name:
            endpoint_name = var_name.replace("_permittedRoles", "")
            suggested_mask = model[decl].as_long()
            
            # Find original endpoint
            endpoint_obj = msSystem.findEndpoint(endpoint_name)
            
            if endpoint_obj and suggested_mask != endpoint_obj.allowedRoles:
                results.append({
                    "endpoint_name": endpoint_name,
                    "id": endpoint_obj.funcName,
                    "current_role_mask": endpoint_obj.allowedRoles,
                    "suggested_role_mask": suggested_mask,
                    "description": f"Change permitted roles for {endpoint_name} from {roleMap(endpoint_obj.allowedRoles)} to {roleMap(suggested_mask)}"
                })
    return results

def roleMap(role_mask):
    if role_mask == 0: return "None"
    if role_mask == 1: return "Unauthenticated"
    if role_mask == 2: return "User Only"
    if role_mask == 4: return "Admin Only"
    if role_mask == 6: return "User + Admin Only"
    if role_mask == 7: return "Any Authenticated User"
    return role_mask

def _getIRData(ir_id: str) -> Dict[str, Any]:
    url = os.getenv("IR_SERVICE_URL", "http://host.docker.internal:8080/ir/create")

    payload = {
        "id": ir_id,
        "systemName": "",
        "systemRepositories": []
    }

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/gzip"
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        if response.status_code != 200:
            response.raise_for_status()

        decompressed_data = gzip.decompress(response.content)
        ir_data = json.loads(decompressed_data)
        
        return ir_data
    except requests.exceptions.RequestException as e:
        print(f"Error fetching IR data: {e}")
        raise
    except Exception as e:
        print(f"Error parsing IR data: {e}")
        raise
