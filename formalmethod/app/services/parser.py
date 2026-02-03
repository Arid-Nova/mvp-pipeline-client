import math
import re
from pathlib import Path
from typing import Dict, Any
from app.core.ms_system import (
    MicroserviceSystem, 
    SystemConnectionGraph, 
    Microservice, 
    Endpoint, 
    Repository, 
    ObjectType
)

# --- Helper Functions ---

def rolesAlreadySet(endpoint: Endpoint):
    return endpoint.allowedRoles != 0 or endpoint._allowAllRoles is True

def addRoleToSystemRoles(systemRoles: dict, roleName: str, ret=True):
    if roleName not in systemRoles.values():
        idx = 0
        while True:
            a = int(math.pow(2, idx))
            idx += 1
            if a in systemRoles:
                continue
            systemRoles[a] = roleName
            return a
    elif ret is True:
        for key, value in systemRoles.items():
            if value == roleName:
                return key

def findEndpointFromURL(full_ir: dict, url: str):
    endpoint = None
    endpointMSIR = None
    for ms in full_ir["microservices"]:
        for controller in ms["controllers"]:
            for method in controller["methods"]:
                if method["type"] == "Endpoint":
                    for annotation in method["annotations"]:
                        for attribute in annotation["attributes"]:
                            if attribute == "path":
                                if attribute["path"] == url:
                                    endpoint = method
                                    endpointMSIR = ms
                                    break
    return endpoint, endpointMSIR

def findClassInMicroservice(msIR: dict, className: str, classLocation=None):
    if classLocation is None:
        # Search everywhere
        for controller in msIR["controllers"]:
            if controller["name"] == className:
                return controller
        for entity in msIR["entities"]:
            if entity["name"] == className:
                return entity
        for other in msIR["otherClasses"]:
            if other["name"] == className:
                return other
    else:
        # Search specific location
        if classLocation == "Controller":
            for controller in msIR["controllers"]:
                if controller["name"] == className:
                    return controller
        elif classLocation == "Entity":
            for entity in msIR["entities"]:
                if entity["name"] == className:
                    return entity
        elif classLocation == "Other":
            for other in msIR["otherClasses"]:
                if other["name"] == className:
                    return other
    return None

def getAnnotationAttributeValue(method, annotationName, attributeName):
    for annotation in method["annotations"]:
        if annotation["name"] == annotationName:
            for attribute in annotation["attributes"]:
                if attribute == attributeName:
                    return annotation["attributes"][attribute]
    return None

# --- Parsing Logic ---

def parseRepository(repositoryIR: dict) -> Repository:
    return Repository(0, repositoryIR["name"])

def parseEndpoint(endpointIR: dict) -> Endpoint:
    # Default mask for new endpoint (0 or specific logic)
    endpoint = Endpoint([], 0, endpointIR["name"])
    
    # Check if this endpoint touches any repositories
    for call in endpointIR["calls"]:
        if call["type"] == "Repository":
            endpoint.repositories.append(parseRepository(call))
            
    return endpoint

def parseMicroservice(msIR: dict) -> Microservice:
    microservice = Microservice([], msIR["name"])
    for controller in msIR["controllers"]:
        for method in controller["methods"]:
            if method["type"] == "Endpoint":
                microservice.endpoints.append(parseEndpoint(method))
    return microservice

def parseConnections(msIR: dict, scg: SystemConnectionGraph, msSystem: MicroserviceSystem, full_ir: dict):
    for controller in msIR["controllers"]:
        for method in controller["methods"]:
            if method["type"] == "Endpoint":
                # Find the source endpoint object in our system model
                source_endpoint = msSystem.findEndpoint(method["name"])
                if not source_endpoint:
                    continue
                    
                for call in method["calls"]:
                    if call["type"] == "Remote":
                        # Find the target endpoint definition in the IR
                        target_method_ir, _ = findEndpointFromURL(full_ir, call["url"])
                        if target_method_ir:
                            # Find the target endpoint object in our system model
                            target_endpoint = msSystem.findEndpoint(target_method_ir["name"])
                            if target_endpoint:
                                scg.addSystemConnection(source_endpoint, target_endpoint)


def preScanRoles(systemRoles: dict, msIR: dict, pathToCode: str):
    # Regex to capture content inside hasRole('...') or hasRole("...")
    # It handles single or double quotes.
    role_pattern = re.compile(r"hasRole\(['\"]([^'\"]+)['\"]\)")

    # 1. Scan IR Annotations first (Fastest)
    for controller in msIR["controllers"]:
        for method in controller["methods"]:
            if method["type"] == "Endpoint":
                val = getAnnotationAttributeValue(method, "PreAuthorize", "value")
                if val:
                    found_roles = role_pattern.findall(val)
                    for role in found_roles:
                        # This helper assigns a unique bit-ID if the role is new
                        addRoleToSystemRoles(systemRoles, role)

    # 2. Scan Source Code (Fallback/Completeness)
    # This ensures we catch roles that might have been missed by the IR generator
    if pathToCode:
        try:
            code_path_obj = Path(pathToCode)
            java_files = list(code_path_obj.rglob("*.java"))
            
            for f in java_files:
                try:
                    # Read file content
                    content = f.read_text(errors='ignore')
                    
                    # Optimization: Only run regex if @PreAuthorize is present
                    if "@PreAuthorize" in content:
                        found_roles = role_pattern.findall(content)
                        for role in found_roles:
                            addRoleToSystemRoles(systemRoles, role)
                except Exception:
                    continue
        except Exception as e:
            # Non-critical warning
            print(f"Warning: Could not scan source code for roles: {str(e)}")


def getSecurityRoles(systemRoles: dict, msIR: dict, msSystem: MicroserviceSystem, pathToCode: str):
    files = list(Path(pathToCode).rglob("*.java"))
    
    for controller in msIR["controllers"]:
        for method in controller["methods"]:
            if method["type"] == "Endpoint":
                endpoint = msSystem.findEndpoint(method["name"])
                if not endpoint:
                    continue
                
                # If roles already manually set, skip
                if rolesAlreadySet(endpoint):
                    continue

                # 1. Check IR for @PreAuthorize
                val = getAnnotationAttributeValue(method, "PreAuthorize", "value")
                if val:
                    # Parse logic like "hasRole('ADMIN')"
                    # This is a simplified parser for standard Spring Security EL
                    if "hasRole('ADMIN')" in val:
                        role_bit = addRoleToSystemRoles(systemRoles, "admin")
                        endpoint.allowedRoles = endpoint.allowedRoles | role_bit
                    if "hasRole('USER')" in val:
                        role_bit = addRoleToSystemRoles(systemRoles, "user")
                        endpoint.allowedRoles = endpoint.allowedRoles | role_bit
                    # Add more parsing logic here as needed
                
                # 2. If IR was insufficient, grep the source code
                # (This is expensive but matches original intent)
                for f in files:
                    try:
                        content = f.read_text(errors='ignore')
                        if method["name"] in content and "@PreAuthorize" in content:
                            # Very naive check; in production, use a Java parser or stricter regex
                            if "hasRole('ADMIN')" in content and method["name"] in content: # Context check needed
                                role_bit = addRoleToSystemRoles(systemRoles, "admin")
                                endpoint.allowedRoles = endpoint.allowedRoles | role_bit
                    except:
                        continue

# --- Main Entry Point ---

def getModelFromIRAndCode(ir_data: dict, pathToCode: str) -> MicroserviceSystem:
    # Prepare system connection graph
    scg = SystemConnectionGraph()

    # Prepare system roles
    sysRoles = {}
    addRoleToSystemRoles(sysRoles, "UnauthenticatedRole")

    # Prepare microservice system
    msSystem = MicroserviceSystem([], scg, "", sysRoles)

    # 1. Parse Basic Structure
    msSystem.name = ir_data.get("name", "Unknown")

    for ms in ir_data["microservices"]:
        msSystem.microservices.append(parseMicroservice(ms))
    
    # 2. Parse Connections (Pass full ir_data for lookups)
    for ms in ir_data["microservices"]:
        parseConnections(ms, scg, msSystem, ir_data) # <--- UPDATED: Pass ir_data
    
    # 3. Pre-scan roles (Populate sysRoles definitions)
    for ms in ir_data["microservices"]:
        preScanRoles(sysRoles, ms, pathToCode)

    # 4. Legacy Bit Flipping Logic (Maintain backward compatibility)
    if 2 in sysRoles and 4 in sysRoles and sysRoles[4] == "user" and sysRoles[2] == "admin":
        sysRoles[2] = "user"
        sysRoles[4] = "admin"

    # 5. Extract Security Roles (The missing piece)
    for ms in ir_data["microservices"]:
        getSecurityRoles(sysRoles, ms, msSystem, pathToCode)

    msSystem.populateBackReferences()
    return msSystem