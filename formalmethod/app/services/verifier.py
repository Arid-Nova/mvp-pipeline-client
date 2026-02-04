import time
from z3 import sat, unsat
from ..core.solver.auth_solver import AuthorizationConsistencySolver
from ..services.parser import getModelFromIRAndCode

def run_verification(ir_data: dict, code_path: str):
    logs = []
    suggestions = []
    start_time = time.perf_counter()

    logs.append("Building System Model...")
    msSystem = getModelFromIRAndCode(ir_data, code_path)

    logs.append("Initializing Solver...")
    solver_wrapper = AuthorizationConsistencySolver(msSystem)
    
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
        suggestions = extract_suggestions(model, msSystem)
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
                    "current_role_mask": endpoint_obj.allowedRoles,
                    "suggested_role_mask": suggested_mask,
                    "description": f"Change permitted roles for {endpoint_name} from {endpoint_obj.allowedRoles} to {suggested_mask}"
                })
    return results