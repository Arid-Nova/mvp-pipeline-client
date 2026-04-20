import math
import json
import collections
import re
from pathlib import Path
from itertools import chain

# Import core models
from ..core.ms_system import (
    MicroserviceSystem, 
    SystemConnectionGraph, 
    Microservice, 
    Endpoint, 
    Repository
)

# --- Multi Repo Mapping Helper ---
def find_best_repo_path(repo_mappings, msIR):
    """
    Heuristically attempting to match a microservice from the IR to the correct cloned repository folder.
    """
    if not repo_mappings:
        return None
        
    ms_name = msIR.get("name", "").lower()
    raw_path = msIR.get("path", "")
    ms_path_tail = raw_path.split("/")[-1].lower() if raw_path else ""
    
    # 1. Try to match the microservice name to the end of the repository URL
    for repo in repo_mappings:
        url_tail = repo["url"].split("/")[-1].replace(".git", "").lower()
        if url_tail == ms_name or (ms_path_tail and url_tail == ms_path_tail):
            return repo["path"]
    
    # 2. Try to match by checking if the original relative path exists inside any cloned repo
    relative_path = raw_path.replace("file://", "").lstrip("/")
    if relative_path:
        for repo in repo_mappings:
            if (Path(repo["path"]) / relative_path).exists():
                return repo["path"]
            
    # 3. Fallback: Return the first repository (handles legacy mono-repo behavior)
    return repo_mappings[0]["path"]


# --- Helper Functions ---

def rolesAlreadySet(endpoint: Endpoint):
    return endpoint.allowedRoles != 0 or endpoint._allowAllRoles is True

def addRoleToSystemRoles(systemRoles, roleName, ret=True):
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

def findEndpointFromURL(fullIR, url):
    if "microservices" in fullIR:
        for ms in fullIR["microservices"]:
            if "controllers" in ms:
                for controller in ms["controllers"]:
                    if "methods" in controller:
                        for method in controller["methods"]:
                            if "annotations" in method:
                                for annotation in method["annotations"]:
                                    if "attributes" in annotation:
                                        attrs = annotation["attributes"]
                                        if attrs.get("path") == url or attrs.get("value") == url:
                                            return method, ms
    return None, None

def findClassInMicroservice(msIR, className, classLocation=None):
    if not className: return None

    # Handle FQN (e.g. seat.service.SeatService -> SeatService)
    simpleName = className.split('.')[-1]

    if classLocation is None:
        ret = findClassInMicroservice(msIR, className, "controllers")
        if ret is None:
            ret = findClassInMicroservice(msIR, className, "services")
            if ret is None:
                ret = findClassInMicroservice(msIR, className, "repositories")
                if ret is None:
                    ret = findClassInMicroservice(msIR, className, "entities")
                    if ret is None:
                        ret = findClassInMicroservice(msIR, className, "feignClients")
                        if ret is None:
                            ret = findClassInMicroservice(msIR, className, "unknowns")
        return ret
    else:
        locations_to_check = [classLocation]
        if classLocation == "repositories" and "repositories" not in msIR:
             if "services" in msIR: locations_to_check.append("services")

        candidate_interface = None

        for loc in locations_to_check:
            if loc in msIR:
                for cls in msIR[loc]:
                    targetName = cls.get("name")
                    if not targetName: continue

                    is_match = (className == targetName or 
                                simpleName == targetName or 
                                className + "Impl" == targetName or
                                simpleName + "Impl" == targetName)
                    
                    if is_match:
                        if loc == "services":
                            is_interface = (cls.get("type") == "JInterface" or 
                                            cls.get("classType") == "INTERFACE" or 
                                            cls.get("isInterface") is True)
                            
                            if is_interface:
                                candidate_interface = cls
                                continue 
                            return cls
                        elif loc == "repositories":
                            return cls
                        else:
                            return cls
        
        if candidate_interface:
            return candidate_interface
            
        return None

def findMethodInClass(classIR, methodName):
    if "methods" in classIR:
        for method in classIR["methods"]:
            if method["name"] == methodName:
                return method
    return None

def is_call_match(called_from_val, target_method_name):
    if not called_from_val or not target_method_name:
        return False
    if called_from_val == target_method_name:
        return True
    if called_from_val.endswith(f"&{target_method_name}"):
        return True
    if called_from_val.endswith(f"#{target_method_name}"):
        return True
    if called_from_val.endswith(f".{target_method_name}"):
        return True
    return False

def findMethodCallsFromMethod(classIR, methodName, methodIR=None, requireEndpoint=False):
    mcs = []
    
    # STRATEGY 1: Check Nested Calls (New IR)
    if methodIR is not None and "methodCalls" in methodIR:
        for methodCall in methodIR["methodCalls"]:
            # Verify the call is actually from this method (use calledFrom field for consistency)
            if not is_call_match(methodCall.get("calledFrom"), methodName):
                continue
            if requireEndpoint and methodCall.get("type") != "Endpoint":
                continue
            mcs.append(methodCall)
        if len(mcs) > 0:
            return mcs

    # STRATEGY 2: Check Class-Level Calls (Old IR)
    if "methodCalls" in classIR:
        for methodCall in classIR["methodCalls"]:
            if is_call_match(methodCall.get("calledFrom"), methodName):
                if requireEndpoint and methodCall.get("type") != "Endpoint":
                    continue
                mcs.append(methodCall)
    
    return mcs

# --- Recursion Logic ---

def scanRestCalls(msIR, methodIR, scg, microserviceSystem, initialClassName):
    toScan = collections.deque()
    startClass = methodIR.get("className", initialClassName)
    toScan.append((methodIR, startClass))
    
    visited = []

    theURL = methodIR.get("url")
    theRequestMethod = methodIR.get("httpMethod")
    
    if theURL is None or theRequestMethod is None:
        return

    while len(toScan) != 0:
        method, currentClassName = toScan.pop()

        if id(method) in visited:
            continue
        visited.append(id(method))

        if not currentClassName:
            continue

        theClass = findClassInMicroservice(msIR, currentClassName)
        
        if theClass is not None:
            methodCalls = findMethodCallsFromMethod(theClass, method["name"], methodIR=method)
            
            for methodCall in methodCalls:
                is_recursive_self_call = (
                    methodCall.get("name") == method["name"] and
                    (methodCall.get("objectType", "") == "" or 
                    methodCall.get("objectType") == currentClassName)
                )
                if is_recursive_self_call:
                    continue

                if methodCall.get("type") == "RestCall":
                    endpointFrom = microserviceSystem.findEndpoint(f"{theRequestMethod} {theURL}")
                    if endpointFrom is None:
                        continue
                    
                    target_url = methodCall.get("url", "")
                    target_method = methodCall.get("httpMethod", "")
                    endpointTo = microserviceSystem.findEndpoint(f"{target_method} {target_url}")
                    
                    if endpointTo is None and "{?}" in target_url:
                        firstParameter = methodCall.get("parameterContents", "").split(",")[0]
                        fields = theClass.get("fields", [])
                        for fie in fields:
                            if fie["name"] in firstParameter:
                                constPieces = re.findall(r"\"(.+)\"", firstParameter)
                                sub = ""
                                candidatePart = fie.get("initializer", "").replace("\"", "")
                                candidatePart = re.sub(r'http[s]?://[^/]+', "", candidatePart)
                                candidateURL = ""
                                for c in firstParameter:
                                    sub += c
                                    if sub.find(fie["name"]) != -1:
                                        candidateURL += candidatePart
                                        sub = sub.replace(fie["name"], "")
                                    for piece in constPieces:
                                        if sub.find(piece) != -1:
                                            candidateURL += piece
                                            sub = sub.replace(piece, "")
                                if len(sub) != 0:
                                    candidateURL += "{?}"
                                endpointTo = microserviceSystem.findEndpoint(f"{target_method} {candidateURL}")
                                if endpointTo is not None:
                                    break
                    
                    if endpointFrom and endpointTo:
                        scg.addSystemConnection(endpointFrom, endpointTo)
                    continue

                nextMethodName = methodCall["name"]
                nextClassName = methodCall.get("objectType", "")
                
                if nextClassName == "":
                    nextClassName = currentClassName
                    nextClass = theClass
                else:
                    nextClass = findClassInMicroservice(msIR, nextClassName)
                
                if nextClass is not None:
                    nextMethod = findMethodInClass(nextClass, nextMethodName)
                    if nextMethod is not None:
                        toScan.append((nextMethod, nextClassName))

def parseRepositoryHelper(repositories, repo, bits):
    for r in repositories:
        if r.name == repo["name"]:
            r.accessedMethods |= bits
            return
    repositories.append(Repository(bits, repo["name"]))
    return

def parseRepository(mcIR, repositories, originalMethod, repo):
    createUpdateWords = ["create", "add", "insert", "save", "update"]
    readWords = ["read", "find", "get", "query"]
    deleteWords = ["delete", "remove"]

    name = mcIR["name"]

    if any(keyword in name for keyword in createUpdateWords):
        if originalMethod == "POST":
            parseRepositoryHelper(repositories, repo, 0b1000)
        else:
            parseRepositoryHelper(repositories, repo, 0b0010)
    elif any(keyword in name for keyword in readWords):
        parseRepositoryHelper(repositories, repo, 0b0100)
    elif any(keyword in name for keyword in deleteWords):
        parseRepositoryHelper(repositories, repo, 0b0001)

def parseServiceRecursively(msIR, parentMC, serv, repositories, originalMethod):
    if parentMC.get("objectName", "") != "":
        repo = findClassInMicroservice(msIR, parentMC.get("objectType"), "repositories")
        if repo is not None:
            parseRepository(parentMC, repositories, originalMethod, repo)
        return
    
    nested_calls = []
    if "methodCalls" in parentMC:
        # In new nested IR format, methodCalls can be stored under a method/methodCall
        nested_calls = parentMC["methodCalls"]
    else:
        # parentMC doesn't have nested methodCalls, so it's likely a method reference
        # Try to find this method in the service and get its methodCalls
        if parentMC.get("objectType") == "" or parentMC.get("objectType") == serv.get("name"):
            # This is a call within the same service - look for the method
            called_method = findMethodInClass(serv, parentMC["name"])
            if called_method and "methodCalls" in called_method:
                nested_calls = called_method["methodCalls"]
        
        # If still not found, try class-level methodCalls (old IR format fallback)
        if not nested_calls and "methodCalls" in serv:
            for mc in serv["methodCalls"]:
                if is_call_match(mc.get("calledFrom"), parentMC["name"]):
                    nested_calls.append(mc)

    for mc in nested_calls:
        if mc["name"] == parentMC["name"]: continue

        repo = findClassInMicroservice(msIR, mc.get("objectType"), "repositories")
        if repo is not None:
            parseRepository(mc, repositories, originalMethod, repo)
        else:
            parseServiceRecursively(msIR, mc, serv, repositories, originalMethod)

def parseService(msIR, mcIR, originalMethod):
    # Search "services" location first (avoid picking wrong class if name collision exists)
    # Only fallback to other locations if not found in services
    serv = findClassInMicroservice(msIR, mcIR.get("objectType"), "services")
    if serv is None:
        # If not found in services, try other locations (for services defined in unknowns, etc.)
        serv = findClassInMicroservice(msIR, mcIR.get("objectType"), "repositories")
        if serv is None:
            serv = findClassInMicroservice(msIR, mcIR.get("objectType"), "entities")
            if serv is None:
                serv = findClassInMicroservice(msIR, mcIR.get("objectType"), "unknowns")
    if serv is None:
        return []

    met = findMethodInClass(serv, mcIR["name"])
    if met is None:
        return []

    repositories = []
    
    methodCalls = findMethodCallsFromMethod(serv, met["name"], methodIR=met)
    
    for methodCall in methodCalls:
        # Skip RestCalls - they represent inter-service calls, not local database access
        # Inter-service connections are tracked by scanRestCalls for the SystemConnectionGraph
        if methodCall.get("type") == "RestCall":
            continue
        parseServiceRecursively(msIR, methodCall, serv, repositories, originalMethod)
            
    return repositories

def parseEndpoint(msIR, controllerIR, endpointIR):
    # 1. Determine Simple Name (Internal Logic)
    if "id" in endpointIR:
        raw_id = endpointIR["id"]
        # Convert "package.Class&method" -> "method"
        simple_name = raw_id.split("&")[-1] if "&" in raw_id else raw_id
    else:
        simple_name = endpointIR.get("name", "")

    # 2. Construct Display ID (User Requested Format)
    # Format: {microserviceName}.{controllerName}.{methodName}
    ms_name = msIR.get("name", "UnknownMS")
    ctrl_name = controllerIR.get("name", "UnknownController")
    
    # Create the ID
    custom_id = f"{ms_name}.{ctrl_name}.{simple_name}"
    
    endpoint = Endpoint([], 0, f"{endpointIR.get('httpMethod')} {endpointIR.get('url')}")
    endpoint.funcName = custom_id  # Store formatted ID here

    repoTracker = {}

    # Extract calls using simple_name for logic matching
    methodCalls = findMethodCallsFromMethod(controllerIR, simple_name, methodIR=endpointIR)
    
    for methodCall in methodCalls:
        repositories = parseService(msIR, methodCall, endpointIR.get("httpMethod"))
        for repository in repositories:
            if repository.name in repoTracker:
                repoTracker[repository.name].accessedMethods |= repository.accessedMethods
            else:
                repoTracker[repository.name] = repository
                endpoint.repositories.append(repository)

    return endpoint

def parseMicroservice(msIR):
    microservice = Microservice([], msIR.get("name", "Unknown"))

    if "controllers" in msIR:
        for controller in msIR["controllers"]:
            if "methods" in controller:
                for method in controller["methods"]:
                    if method.get("type") == "Endpoint" or method.get("httpMethod") is not None:
                        microservice.endpoints.append(parseEndpoint(msIR, controller, method))

    return microservice

def parseConnections(msIR: dict, scg: SystemConnectionGraph, microserviceSystem: MicroserviceSystem):
    if "controllers" in msIR:
        for controller in msIR["controllers"]:
            if "methods" in controller:
                for method in controller["methods"]:
                    if method.get("type") == "Endpoint" or method.get("httpMethod") is not None:
                        scanRestCalls(msIR, method, scg, microserviceSystem, controller.get("name"))

def findAllEndpointsWithGenericPath(msSystem, partialPath, msName=None):
    found = []
    for ms in msSystem.microservices:
        if msName and ms.name != msName:
            continue
        for endpoint in ms.endpoints:
            if partialPath in endpoint.name:
                found.append(endpoint)
    return found

# --- Security Parsing ---

def preScanRoles(systemRoles, msIR, repo_mappings):
    if not repo_mappings: return

    best_repo_path = find_best_repo_path(repo_mappings, msIR)
    if not best_repo_path: return

    repo_root = Path(best_repo_path)
    
    # Clean path for older IR version compatibility (file:// prefix)
    raw_path = msIR.get("path", "")
    if raw_path.startswith("file://"):
        raw_path = raw_path.replace("file://", "")
        
    relative_path = raw_path.lstrip("/") 
    msPath = repo_root / relative_path

    files = chain(msPath.rglob("SecurityConfig.java"), msPath.rglob("WebSecurityConfig.java"))
    for path in files:
        if path.is_file() and "config" in str(path).lower():
            try:
                with open(path, 'r', encoding="utf-8") as f:
                    securityConfig = f.read()
                    pattern = r"""\.antMatchers\((.*?)\)\.hasRole\(\"(.*?)\"\)|\.antMatchers\((.*?)\)\.hasAnyRole\((.*?)\)"""
                    matches = re.findall(pattern, securityConfig)

                    for match in matches:
                        if match[0] and match[1]:
                            roleName = match[1].lower().replace("\"", "").replace(" ", "")
                            addRoleToSystemRoles(systemRoles, roleName, False)
                        elif match[2] and match[3]:
                            roles = match[3].lower().replace("\"", "").replace(" ", "").split(",")
                            for roleName in roles:
                                addRoleToSystemRoles(systemRoles, roleName, False)
            except:
                pass

def getSecurityRoles(systemRoles, msIR, msSystem, repo_mappings):
    if not repo_mappings: return
    
    best_repo_path = find_best_repo_path(repo_mappings, msIR)
    if not best_repo_path: return
    
    repo_root = Path(best_repo_path)

    # Clean path for older IR version compatibility (file:// prefix)
    raw_path = msIR.get("path", "")
    if raw_path.startswith("file://"):
        raw_path = raw_path.replace("file://", "")

    relative_path = raw_path.lstrip("/") 
    msPath = repo_root / relative_path

    files = chain(msPath.rglob("SecurityConfig.java"), msPath.rglob("WebSecurityConfig.java"))
    
    for path in files:
        if path.is_file() and "config" in str(path).lower():
            try:
                with open(path, 'r', encoding="utf-8") as f:
                    securityConfig = f.read()

                    if not "WebSecurityConfigurerAdapter" in securityConfig and not "EnableWebSecurity" in securityConfig and not "EnableGlobalMethodSecurity" in securityConfig:
                        continue

                    pattern = r"""\.antMatchers\((.*?)\)\.hasRole\(\"(.*?)\"\)|\.antMatchers\((.*?)\)\.hasAnyRole\((.*?)\)|\.antMatchers\((.*?)\)\.permitAll\(\)|\.(.*?)\.authenticated\(\)"""
                    matches = re.findall(pattern, securityConfig)

                    authenticated = False
                    for match in matches:
                        # hasRole
                        if match[0] and match[1]:
                            roleName = match[1].lower().replace("\"", "").replace(" ", "")
                            roleBitVec = addRoleToSystemRoles(systemRoles, roleName)
                            addRoleToSystemRoles(systemRoles, roleName)
                            if "HttpMethod." in match[0]:
                                methodBased = re.findall("HttpMethod.(.*), (.*)", match[0])
                                for metRule in methodBased:
                                    url = metRule[1].replace("\"", "")
                                    httpMethod = metRule[0]
                                    if url.endswith("**"):
                                        url = url.replace("*", "").rstrip("/")
                                        endpoints = msSystem.findAllEndpointsWithGenericPath(httpMethod + ' ' + url)
                                    else:
                                        url = url.replace("*", "{?}")
                                        endpoints = msSystem.findEndpoint(httpMethod + ' ' + url)
                                        if endpoints is not None:
                                            endpoints = [endpoints]
                                        else:
                                            endpoints = []
                                    for endpoint in endpoints:
                                        if not rolesAlreadySet(endpoint):
                                            endpoint.allowedRoles |= roleBitVec
                            else:
                                urls = match[0].replace("\"", "").split(",")
                                for url in urls:
                                    if url.endswith("**"):
                                        url = url.replace("*", "").rstrip("/")
                                    else:
                                        url = url.replace("*", "{?}")
                                    endpoints = msSystem.findAllEndpointsWithGenericPath(url, msName=msIR["name"])
                                    for endpoint in endpoints:
                                        if not rolesAlreadySet(endpoint):
                                            endpoint.allowedRoles |= roleBitVec
                        # hasAnyRole
                        elif match[2] and match[3]:
                            roles = match[3].lower().replace("\"", "").replace(" ", "").split(",")
                            if "HttpMethod." in match[2]:
                                methodBased = re.findall("HttpMethod.(.*), (.*)", match[2])
                                for metRule in methodBased:
                                    url = metRule[1].replace("\"", "")
                                    httpMethod = metRule[0]
                                    if url.endswith("**"):
                                        url = url.replace("*", "").rstrip("/")
                                        endpoints = msSystem.findAllEndpointsWithGenericPath(httpMethod + ' ' + url, msName=msIR["name"])
                                    else:
                                        url = url.replace("*", "{?}")
                                        endpoints = msSystem.findEndpoint(httpMethod + ' ' + url)
                                        if endpoints is not None:
                                            endpoints = [endpoints]
                                        else:
                                            endpoints = []
                                    for endpoint in endpoints:
                                        if not rolesAlreadySet(endpoint):
                                            for roleName in roles:
                                                roleBitVec = addRoleToSystemRoles(systemRoles, roleName)
                                                endpoint.allowedRoles |= roleBitVec
                            else:
                                urls = match[2].replace("\"", "").split(",")
                                for url in urls:
                                    if url.endswith("**"):
                                        url = url.replace("*", "").rstrip("/")
                                    else:
                                        url = url.replace("*", "{?}")
                                    endpoints = msSystem.findAllEndpointsWithGenericPath(url, msName=msIR["name"])
                                    for endpoint in endpoints:
                                        if not rolesAlreadySet(endpoint):
                                            for roleName in roles:
                                                roleBitVec = addRoleToSystemRoles(systemRoles, roleName)
                                                endpoint.allowedRoles |= roleBitVec
                        # permitAll
                        elif match[4]:
                            rule = match[4]
                            if "HttpMethod." in rule:
                                methodBased = re.findall("HttpMethod.(.*), (.*)", rule)
                                for metRule in methodBased:
                                    url = metRule[1].replace("\"", "")
                                    httpMethod = metRule[0]
                                    if url.endswith("**"):
                                        url = url.replace("*", "").rstrip("/")
                                        endpoints = msSystem.findAllEndpointsWithGenericPath(httpMethod + ' ' + url, msName=msIR["name"])
                                    else:
                                        url = url.replace("*", "{?}")
                                        endpoints = msSystem.findEndpoint(httpMethod + ' ' + url)
                                        if endpoints is not None:
                                            endpoints = [endpoints]
                                        else:
                                            endpoints = []
                                    for endpoint in endpoints:
                                        if not rolesAlreadySet(endpoint):
                                            endpoint._allowAllRoles = True
                                            for role in systemRoles.keys():
                                                endpoint.allowedRoles |= role
                            else:
                                urls = rule.replace("\"", "").split(",")
                                for url in urls:
                                    if url.endswith("**"):
                                        url = url.replace("*", "").rstrip("/")
                                    else:
                                        url = url.replace("*", "{?}")
                                    endpoints = msSystem.findAllEndpointsWithGenericPath(url, msName=msIR["name"])
                                    for endpoint in endpoints:
                                        if not rolesAlreadySet(endpoint):
                                            endpoint._allowAllRoles = True
                                            for role in systemRoles.keys():
                                                endpoint.allowedRoles |= role
                        # authenticated
                        elif match[5]:
                            authenticated = True

                    if authenticated is False:
                        for ms in msSystem.microservices:
                            if ms.name == msIR["name"]:
                                for endpoint in ms.endpoints:
                                    if not rolesAlreadySet(endpoint):
                                        for roleVec in systemRoles.keys():
                                            endpoint.allowedRoles |= roleVec
                                break
                    else:
                        for ms in msSystem.microservices:
                            if ms.name == msIR["name"]:
                                for endpoint in ms.endpoints:
                                    if not rolesAlreadySet(endpoint):
                                        for roleVec, roleName in systemRoles.items():
                                            if roleName == "UnauthenticatedRole":
                                                continue
                                            endpoint.allowedRoles |= roleVec
                                break
            except Exception:
                pass

def getModelFromIRAndCode(ir_dict: dict, repo_mappings: list):
    scg = SystemConnectionGraph()
    sysRoles = {}
    addRoleToSystemRoles(sysRoles, "UnauthenticatedRole")
    msSystem = MicroserviceSystem([], scg, "", sysRoles)
    
    msSystem.name = ir_dict.get("name", "Unknown")

    if "microservices" in ir_dict:
        for ms in ir_dict["microservices"]:
            msSystem.microservices.append(parseMicroservice(ms))
        
        for ms in ir_dict["microservices"]:
            parseConnections(ms, scg, msSystem)
            
        for ms in ir_dict["microservices"]:
            preScanRoles(sysRoles, ms, repo_mappings)

    if 2 in sysRoles and 4 in sysRoles and sysRoles[4] == "user" and sysRoles[2] == "admin":
        sysRoles[2] = "user"
        sysRoles[4] = "admin"

    if "microservices" in ir_dict:
        for ms in ir_dict["microservices"]:
            getSecurityRoles(sysRoles, ms, msSystem, repo_mappings)

    msSystem.populateBackReferences()

    return msSystem