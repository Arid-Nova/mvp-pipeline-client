from .models.generatescenarios import GenerateScenariosRequest
from .services.data_service import DataService

from .scenario_generator import (
    generate_scenarios,
    enrich_from_endpoints,
    enrich_from_components,
    enrich_entity_schema_from_components,
    infer_data_and_sensitivity,
    categorize_scenario,
    select_prompt_template_id,
    build_prompt_context,
    analyze_ir_node,
    normalize_input_data
)

def scenario_generation_pipeline(request: GenerateScenariosRequest, df_service: DataService):
    
    # Step 1. Retreive and generate base scenarios
    full_data = df_service.fetch_index_data(request)
    base_scenarios = generate_scenarios(full_data.all_vectors)
    enriched_scenarios = []

    # Step 2. Retreive and normalize inputs
    endpoints_list = normalize_input_data(full_data.endpoints)
    components_list = normalize_input_data(full_data.components)

    # Step 3. Run the enrichment pipeline
    for s in base_scenarios:
        s["authorization"] = {"required_roles": s.get("allowed_roles", [])}
        s = enrich_from_endpoints(s, endpoints_list)
        s = enrich_from_components(s, components_list)
        s = enrich_entity_schema_from_components(s, components_list)
        s = infer_data_and_sensitivity(s)

        # Categorize and Template mapping
        s["scenario_category"] = categorize_scenario(
            s.get("type"),
            s.get("policy_inconsistencies", []),
            s.get("sensitivity_type"),
            s.get("authorization", {}).get("public", False),
        )
        s["prompt_template_id"] = select_prompt_template_id(s)
        s = build_prompt_context(s)
        
        # Extract IR features
        ir_features = analyze_ir_node(s)
        s.update({
            "handles_pii": ir_features["handles_pii"],
            "pii_evidence": ir_features["pii_evidence"],
            "business_logic_constraints": ir_features["business_logic_constraints"]
        })
        enriched_scenarios.append(s)

    # Step 4. Filter if requested
    if request.template_id:
        enriched_scenarios = [
            s for s in enriched_scenarios
            if s.get("prompt_template_id") == request.template_id
        ]

    # Step 5. Record the scenarios in the database
    df_service.add_scenarios(enriched_scenarios)

    return {
        "status": "success",
        "count": len(enriched_scenarios),
        "scenarios": enriched_scenarios
    }
