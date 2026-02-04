import math
import json
import collections
import re
from pathlib import Path
from itertools import chain

# Changed import to match new structure
from core.ms_system import (
    MicroserviceSystem, 
    SystemConnectionGraph, 
    Microservice, 
    Endpoint, 
    Repository
)

def rolesAlreadySet(endpoint):
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
    endpoint = None
    endpointMSIR = None
    for ms in fullIR["microservices"]:
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


def findClassInMicroservice(msIR, className, classLocation=None):
    # Added safe guard for None to prevent crashes if IR data is incomplete
    if className is None:
        return None

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
        return ret
    else:
        theClass = None
        # Guard: ensure key exists
        if classLocation in msIR:
            for cls in msIR[classLocation]:
                # Note that some services have interface implementations, so look for those using .contains()
                if className == cls["name"] or className + "Impl" == cls["name"]:
                    if classLocation == "services" and cls.get("fileType") != "JCLASS":
                        continue
                    theClass = cls
                    break
        return theClass


def findMethodInClass(classIR, methodName):
    met = None
    if "methods" in classIR:
        for method in classIR["methods"]:
            if method["name"] == methodName:
                met = method
                break
    return met


def findMethodCallsFromMethod(classIR, methodName, requireEndpoint=False):
    mcs = []
    if "methodCalls" in classIR:
        for methodCall in classIR["methodCalls"]:
            if methodCall["calledFrom"] == methodName:
                if requireEndpoint and methodCall["type"] != "Endpoint":
                    continue
                mcs.append(methodCall)
    return mcs


def scanRestCalls(msIR, methodIR, scg, microserviceSystem):
    toScan = collections.deque()
    toScan.append(methodIR)
    visited = []

    theURL = methodIR.get("url")
    theRequestMethod = methodIR.get("httpMethod")
    if theURL is None or theRequestMethod is None:
        return

    while len(toScan) != 0:
        method = toScan.pop()

        # Use object ID or similar to track visited to avoid infinite loops if objects are reused
        if id(method) in visited:
            continue
        else:
            visited.append(id(method))

        className = method.get("className")
        theClass = findClassInMicroservice(msIR, className)
        if theClass is not None:
            methodCalls = findMethodCallsFromMethod(theClass, method["name"])
            for methodCall in methodCalls:
                if methodCall["calledFrom"] != method["name"]:
                    continue
                if methodCall["type"] == "RestCall":
                    endpointFrom = microserviceSystem.findEndpoint(f"{theRequestMethod} {theURL}")
                    if endpointFrom is None:
                        print(f"Invalid from endpoint: {theRequestMethod} {theURL}")
                        continue
                    
                    target_url = methodCall.get("url", "")
                    target_method = methodCall.get("httpMethod", "")
                    endpointTo = microserviceSystem.findEndpoint(f"{target_method} {target_url}")
                    
                    if endpointTo is None:
                        if "{?}" in target_url:
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

                                    endpointTo = microserviceSystem.findEndpoint(
                                        f"{target_method} {candidateURL}")
                                    if endpointTo is None:
                                        print(f"Invalid to endpoint: {target_method} {target_url}")
                                        # print(theClass)
                                        break
                                    else:
                                        break
                    if endpointFrom is None or endpointTo is None:
                        continue
                    
                    # Original logic checked map existence, scg now uses dict
                    scg.addSystemConnection(endpointFrom, endpointTo)
                    continue

                nextMethodName = methodCall["name"]
                className = methodCall.get("objectType", "")
                if className != "":
                    nextClass = findClassInMicroservice(msIR, className)
                else:
                    nextClass = theClass
                if nextClass is not None:
                    nextMethod = findMethodInClass(nextClass, nextMethodName)
                    if nextMethod is not None:
                        toScan.append(nextMethod)


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

    name = mcIR["name"] # kept case sensitive as per original

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
        repo = findClassInMicroservice(msIR, parentMC["objectType"], "repositories")
        if repo is not None:
            parseRepository(parentMC, repositories, originalMethod, repo)
        return
    
    if "methodCalls" in serv:
        for mc in serv["methodCalls"]:
            if mc["calledFrom"] == parentMC["name"] and mc["name"] != parentMC["name"]:
                repo = findClassInMicroservice(msIR, mc["objectType"], "repositories")
                if repo is not None:
                    parseRepository(mc, repositories, originalMethod, repo)
                parseServiceRecursively(msIR, mc, serv, repositories, originalMethod)


def parseService(msIR, mcIR, originalMethod):
    serv = findClassInMicroservice(msIR, mcIR["objectType"], "services")
    if serv is None:
        return []

    met = findMethodInClass(serv, mcIR["name"])
    if met is None:
        return []

    repositories = []
    if "methodCalls" in serv:
        for methodCall in serv["methodCalls"]:
            if methodCall["calledFrom"] == met["name"]:
                parseServiceRecursively(msIR, methodCall, serv, repositories, originalMethod)

    return repositories


def parseEndpoint(msIR, controllerIR, endpointIR):
    # Ensure funcName is generated
    funcName = endpointIR.get("packageName", "") + "." + endpointIR.get("className", "") + "#" + endpointIR.get("name", "")
    
    endpoint = Endpoint([], 0, f"{endpointIR.get('httpMethod')} {endpointIR.get('url')}")
    # Manually attach funcName for logic compatibility
    endpoint.funcName = funcName

    repoTracker = {}

    if "methodCalls" in controllerIR:
        for methodCall in controllerIR["methodCalls"]:
            # Original: endpoint.funcName[endpoint.funcName.rfind("#") + 1:]
            # This extracts just the method name part of the funcName
            target_method = funcName[funcName.rfind("#") + 1:]
            
            if methodCall["calledFrom"] == target_method:
                repositories = parseService(msIR, methodCall, endpointIR.get("httpMethod"))
                for repository in repositories:
                    if repository.name in repoTracker:
                        repoTracker[repository.name].accessedMethods |= repository.accessedMethods
                    else:
                        repoTracker[repository.name] = repository
                        endpoint.repositories.append(repository)

    return endpoint


def parseMicroservice(msIR):
    microservice = Microservice([], msIR["name"])

    if "controllers" in msIR:
        for controller in msIR["controllers"]:
            if "methods" in controller:
                for method in controller["methods"]:
                    if method["type"] == "Endpoint":
                        microservice.endpoints.append(parseEndpoint(msIR, controller, method))

    return microservice


def parseConnections(msIR, scg, microserviceSystem):
    if "controllers" in msIR:
        for controller in msIR["controllers"]:
            if "methods" in controller:
                for method in controller["methods"]:
                    if method["type"] == "Endpoint":
                        scanRestCalls(msIR, method, scg, microserviceSystem)

# --- ADDED HELPER: Missing from ms_system.py but used in original parser ---
def findAllEndpointsWithGenericPath(msSystem, partialPath, msName=None):
    found = []
    for ms in msSystem.microservices:
        if msName and ms.name != msName:
            continue
        for endpoint in ms.endpoints:
            # Simple substring match as implied by usage
            if partialPath in endpoint.name:
                found.append(endpoint)
    return found

def getSecurityRoles(systemRoles, msIR, msSystem, codePath):
    # MODIFIED: Path handling for Git repo context
    if not codePath: return
    
    repo_root = Path(codePath)
    # Avoid double slashes or root resets
    relative_path = msIR.get("path", "").lstrip("/") 
    msPath = repo_root / relative_path

    files = chain(msPath.rglob("SecurityConfig.java"), msPath.rglob("WebSecurityConfig.java"))
    
    for path in files:
        if path.is_file() and "config" in str(path).lower():
            try:
                with open(path, 'r', encoding="utf-8") as f:
                    securityConfig = f.read()
                    pattern = r"""\.antMatchers\((.*?)\)\.hasRole\(\"(.*?)\"\)|\.antMatchers\((.*?)\)\.hasAnyRole\((.*?)\)|\.antMatchers\((.*?)\)\.permitAll\(\)|\.(.*?)\.authenticated\(\)"""
                    matches = re.findall(pattern, securityConfig)

                    authenticated = False
                    for match in matches:
                        # hasRole
                        if match[0] and match[1]:
                            roleName = match[1].lower().replace("\"", "").replace(" ", "")
                            roleBitVec = addRoleToSystemRoles(systemRoles, roleName)
                            # Removed redundant addRole call from original
                            
                            if "HttpMethod." in match[0]:
                                methodBased = re.findall(r"HttpMethod.(.*), (.*)", match[0])
                                for metRule in methodBased:
                                    url = metRule[1].replace("\"", "")
                                    httpMethod = metRule[0]
                                    if "**" in url: # simplified check
                                        url = url.replace("*", "")
                                        # MODIFIED: Call helper function
                                        endpoints = findAllEndpointsWithGenericPath(msSystem, httpMethod + ' ' + url)
                                    else:
                                        url = url.replace("*", "{?}")
                                        ep = msSystem.findEndpoint(httpMethod + ' ' + url)
                                        endpoints = [ep] if ep else []
                                    for endpoint in endpoints:
                                        if not rolesAlreadySet(endpoint):
                                            endpoint.allowedRoles |= roleBitVec
                            else:
                                urls = match[0].replace("\"", "").split(",")
                                for url in urls:
                                    # MODIFIED: Call helper function
                                    endpoints = findAllEndpointsWithGenericPath(msSystem, url)
                                    for endpoint in endpoints:
                                        if not rolesAlreadySet(endpoint):
                                            endpoint.allowedRoles |= roleBitVec
                        # hasAnyRole
                        elif match[2] and match[3]:
                            roles = match[3].lower().replace("\"", "").replace(" ", "").split(",")
                            if "HttpMethod." in match[2]:
                                methodBased = re.findall(r"HttpMethod.(.*), (.*)", match[2])
                                for metRule in methodBased:
                                    url = metRule[1].replace("\"", "")
                                    httpMethod = metRule[0]
                                    if "**" in url:
                                        url = url.replace("*", "")
                                        # MODIFIED: Call helper function
                                        endpoints = findAllEndpointsWithGenericPath(msSystem, httpMethod + ' ' + url)
                                    else:
                                        url = url.replace("*", "{?}")
                                        ep = msSystem.findEndpoint(httpMethod + ' ' + url)
                                        endpoints = [ep] if ep else []
                                    
                                    for endpoint in endpoints:
                                        if not rolesAlreadySet(endpoint):
                                            for roleName in roles:
                                                roleBitVec = addRoleToSystemRoles(systemRoles, roleName)
                                                endpoint.allowedRoles |= roleBitVec
                            else:
                                urls = match[2].replace("\"", "").split(",")
                                for url in urls:
                                    # MODIFIED: Call helper function
                                    endpoints = findAllEndpointsWithGenericPath(msSystem, url)
                                    for endpoint in endpoints:
                                        if not rolesAlreadySet(endpoint):
                                            for roleName in roles:
                                                roleBitVec = addRoleToSystemRoles(systemRoles, roleName)
                                                endpoint.allowedRoles |= roleBitVec
                        # permitAll
                        elif match[4]:
                            rule = match[4]
                            if "HttpMethod." in rule:
                                methodBased = re.findall(r"HttpMethod.(.*), (.*)", rule)
                                for metRule in methodBased:
                                    url = metRule[1].replace("\"", "")
                                    httpMethod = metRule[0]
                                    if "**" in url:
                                        url = url.replace("*", "")
                                        # MODIFIED: Call helper function
                                        endpoints = findAllEndpointsWithGenericPath(msSystem, httpMethod + ' ' + url)
                                    else:
                                        url = url.replace("*", "{?}")
                                        ep = msSystem.findEndpoint(httpMethod + ' ' + url)
                                        endpoints = [ep] if ep else []
                                    
                                    for endpoint in endpoints:
                                        if not rolesAlreadySet(endpoint):
                                            endpoint._allowAllRoles = True
                                            for role_bit in msSystem.systemRoles:
                                                endpoint.allowedRoles |= role_bit
                            else:
                                urls = rule.replace("\"", "").split(",")
                                for url in urls:
                                    # MODIFIED: Call helper function
                                    endpoints = findAllEndpointsWithGenericPath(msSystem, url, msName=msIR["name"])
                                    for endpoint in endpoints:
                                        if not rolesAlreadySet(endpoint):
                                            endpoint._allowAllRoles = True
                                            for role_bit in msSystem.systemRoles:
                                                endpoint.allowedRoles |= role_bit
                            pass
                        # authenticated
                        elif match[5]:
                            authenticated = True

                if authenticated is False:
                    for ms in msSystem.microservices:
                        if ms.name == msIR["name"]:
                            for endpoint in ms.endpoints:
                                # Fixed Original typo: `if not rolesAlreadySet:` -> `if not rolesAlreadySet(endpoint):`
                                if not rolesAlreadySet(endpoint):
                                    for role_bit in msSystem.systemRoles:
                                        endpoint.allowedRoles |= role_bit
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
            except Exception as e:
                # print(f"Error parsing security config: {e}")
                pass


def preScanRoles(systemRoles, msIR, codePath):
    if not codePath: return
    repo_root = Path(codePath)
    relative_path = msIR.get("path", "").lstrip("/")
    msPath = repo_root / relative_path

    files = chain(msPath.rglob("SecurityConfig.java"), msPath.rglob("WebSecurityConfig.java"))
    for path in files:
        if path.is_file() and "config" in str(path).lower():
            try:
                with open(path, 'r', encoding="utf-8") as f:
                    securityConfig = f.read()
                    pattern = r"""\.antMatchers\((.*?)\)\.hasRole\(\"(.*?)\"\)|\.antMatchers\((.*?)\)\.hasAnyRole\((.*?)\)|\.antMatchers\((.*?)\)\.permitAll\(\)|\.(.*?)\.authenticated\(\)"""
                    matches = re.findall(pattern, securityConfig)

                    for match in matches:
                        # hasRole
                        if match[0] and match[1]:
                            roleName = match[1].lower().replace("\"", "").replace(" ", "")
                            addRoleToSystemRoles(systemRoles, roleName, False)
                        # hasAnyRole
                        elif match[2] and match[3]:
                            roles = match[3].lower().replace("\"", "").replace(" ", "").split(",")
                            for roleName in roles:
                                addRoleToSystemRoles(systemRoles, roleName, False)
            except:
                pass


# MODIFIED: Accepts Dict instead of path
def getModelFromIRAndCode(ir_dict: dict, pathToCode: str):
    # Prepare system connection graph
    scg = SystemConnectionGraph()

    # Prepare system roles
    sysRoles = {}
    addRoleToSystemRoles(sysRoles, "UnauthenticatedRole")

    # Prepare microservice system
    msSystem = MicroserviceSystem([], scg, "", sysRoles)

    # MODIFIED: Removed file open, used dict directly
    # with (open(pathToIR, 'r') as fileIR):
    #    ir = json.load(fileIR)

    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(ir_dict, f, indent=2, sort_keys=True)
    
    msSystem.name = ir_dict.get("name", "Unknown")

    for ms in ir_dict["microservices"]:
        msSystem.microservices.append(parseMicroservice(ms))
    for ms in ir_dict["microservices"]:
        parseConnections(ms, scg, msSystem)
    for ms in ir_dict["microservices"]:
        preScanRoles(sysRoles, ms, pathToCode)

    # Legacy bit flipping
    if 2 in sysRoles and 4 in sysRoles and sysRoles[4] == "user" and sysRoles[2] == "admin":
        sysRoles[2] = "user"
        sysRoles[4] = "admin"

    for ms in ir_dict["microservices"]:
        getSecurityRoles(sysRoles, ms, msSystem, pathToCode)

    msSystem.populateBackReferences()

    return msSystem