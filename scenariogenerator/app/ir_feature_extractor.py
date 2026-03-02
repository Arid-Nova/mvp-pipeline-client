"""
Lightweight feature extraction module for detecting:
- Potential PII data handling
- Business logic constraints
- Security annotations
"""

from typing import Dict, Any, List, Tuple

# =====================================================
# PII and Sensitive Data Patterns
# =====================================================

PII_KEYWORDS = [
    "name", "firstName", "lastName", "email", "phone", "mobile", "cpf", "ssn",
    "address", "dob", "dateOfBirth", "passport", "account", "credit", "card",
    "customerId", "uuid"
]

PII_TYPES = [
    "Email", "PhoneNumber", "CPF", "UUID", "CreditCard", "SSN", "Address"
]

SENSITIVE_ANNOTATIONS = [
    "@Sensitive", "@Encrypted", "@PII", "@Mask", "@Confidential"
]

BUSINESS_LOGIC_HINTS = [
    "amount", "price", "quantity", "total", "balance", "status", "isActive",
    "limit", "threshold", "min", "max"
]


# =====================================================
# Core Extraction Logic
# =====================================================

def extract_pii_features(ir_node: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """
    Detects whether an IR node (e.g. a class, DTO, endpoint schema)
    handles personally identifiable information (PII).
    Returns a tuple: (has_pii, evidence_list)
    """
    evidence = []
    has_pii = False

    # 1️⃣ Check field names
    for key in ir_node.keys():
        if any(kw.lower() in key.lower() for kw in PII_KEYWORDS):
            if not any(ctx in key.lower() for ctx in ["service", "component", "system", "meta"]):
                evidence.append(f"field: {key}")
                has_pii = True

    # 2️⃣ Check type names
    type_name = ir_node.get("type", "")
    if any(t in str(type_name) for t in PII_TYPES):
        evidence.append(f"type: {type_name}")
        has_pii = True

    # 3️⃣ Check annotations
    annotations = ir_node.get("annotations", [])
    for ann in annotations:
        if any(a in ann for a in SENSITIVE_ANNOTATIONS):
            evidence.append(f"annotation: {ann}")
            has_pii = True

    return has_pii, evidence


def extract_business_logic_hints(ir_node: Dict[str, Any]) -> List[str]:
    """
    Extracts business logic constraints from field names and default values.
    These hints are heuristic and meant to guide data validity generation.
    """
    constraints = []
    for key, val in ir_node.items():
        # Example rule: amount or price must be > 0
        if any(h in key.lower() for h in BUSINESS_LOGIC_HINTS):
            if "amount" in key.lower() or "price" in key.lower():
                constraints.append(f"{key} > 0 required")
            elif "status" in key.lower():
                constraints.append(f"{key} must be valid business status")
            elif "limit" in key.lower() or "threshold" in key.lower():
                constraints.append(f"{key} must be within defined range")
            elif "isactive" in key.lower():
                constraints.append(f"{key} should be True for valid flow")

        # Detect boolean fields with likely business logic meaning
        if isinstance(val, bool):
            constraints.append(f"{key} must be {val} to pass validation")

    return constraints


# =====================================================
# Combined API
# =====================================================

def analyze_ir_node(ir_node: Dict[str, Any]) -> Dict[str, Any]:
    """
    Performs combined analysis of a given IR node.
    Returns extracted features that can enrich test scenarios.
    """
    pii_flag, pii_evidence = extract_pii_features(ir_node)
    business_constraints = extract_business_logic_hints(ir_node)

    return {
        "handles_pii": pii_flag,
        "pii_evidence": pii_evidence,
        "business_logic_constraints": business_constraints
    }

