from z3 import *

from core.ms_system import Endpoint, MicroserviceSystem

class AuthorizationConsistencySolver:
    def __init__(self, microserviceSystem: MicroserviceSystem):
        self.microserviceSystem = copy.deepcopy(microserviceSystem)
        self.variableSystem = copy.deepcopy(microserviceSystem)
        self.constraints = []

        for ms in self.variableSystem.microservices:
            for endpoint in ms.endpoints:
                endpoint.allowedRoles = BitVec(f"{endpoint.name}_permittedRoles", len(self.variableSystem.systemRoles))

    # Helper Function
    def bfs(self, exclude: list[str], current_endpoint: Endpoint):
        ret = []
        if current_endpoint not in self.variableSystem.systemConnections.connectionMap:
            return ret
        for endpoint in self.variableSystem.systemConnections.connectionMap[current_endpoint]:
            if endpoint not in exclude:
                exclude.append(endpoint)
                ret.append(endpoint)
        return ret
    
    def notASuperSet(self, s1, s2):
        return (s1 & s2) != s2

    def minimumPermissionsMet(self, userPermissions, requiredPermissions):
        return (userPermissions & requiredPermissions) == requiredPermissions

    def authorizedRoleMet(self, userRole, requiredRoles):
        return (userRole & requiredRoles) == userRole

    # Constraint Definition
    def addAtLeastOnePermittedRoleConstraints(self):
        for ms in self.variableSystem.microservices:
            for endpoint in ms.endpoints:
                self.constraints.append(endpoint.allowedRoles != 0)

    def addEndpointPermittedRoleConstraints(self):
        for ms in self.variableSystem.microservices:
            for endpoint in ms.endpoints:
                if endpoint in self.variableSystem.systemConnections.reverseConnectionMap:
                    for prevEndpoint in self.variableSystem.systemConnections.reverseConnectionMap[endpoint]:
                        self.constraints.append(self.authorizedRoleMet(prevEndpoint.allowedRoles, endpoint.allowedRoles))

    def addDataEntityOperationConsistencyConstraints(self):
        skPermittedCache = {}

        for role in self.variableSystem.systemRoles:
            eitherRepos = []
            for ms in self.variableSystem.microservices:
                for endpoint in ms.endpoints:
                    for repo in endpoint.repositories:
                        eitherRepos.append((repo, endpoint))

            for (aRepo, e1) in eitherRepos:
                for (dRepo, e2) in eitherRepos:
                    if aRepo.name != dRepo.name:
                        continue

                    # Check for extra repositories with different permissions that could cause a false positive
                    otherEntitiesConstraints = []
                    for extraRepo in e2.repositories:
                        if extraRepo.name == dRepo.name:
                            continue
                        found = None
                        for otherRepo in e1.repositories:
                            if otherRepo.name == extraRepo.name:
                                found = otherRepo
                                break
                        if found is None:
                            continue
                        otherEntitiesConstraints.append(self.notASuperSet(found.accessedMethods, extraRepo.accessedMethods))

                    # Making sure that there are no admin-only endpoint, etc. calls that could cause a false positive
                    if e2 not in skPermittedCache:
                        nextEndpoints = [e2]
                        visited = []
                        skPermittedConstraints = []
                        skipFirst = True
                        while len(nextEndpoints) > 0:
                            for endpoint in nextEndpoints:
                                if endpoint is None:
                                    continue
                                if skipFirst is True:
                                    skipFirst = False
                                    continue
                                skPermittedConstraints.append(Not(self.authorizedRoleMet(role, endpoint.allowedRoles)))

                            # Visit neighboring endpoints
                            toVisit = []
                            for endpoint in nextEndpoints:
                                next_calls = self.bfs(visited, endpoint)
                                for call in next_calls:
                                    toVisit.append(call)
                                    visited.append(call)

                            nextEndpoints = toVisit
                        skPermittedCache[e2] = skPermittedConstraints
                    else:
                        skPermittedConstraints = skPermittedCache[e2]

                    self.constraints.append(Or([self.notASuperSet(aRepo.accessedMethods, dRepo.accessedMethods),
                                        self.authorizedRoleMet(role, e2.allowedRoles),
                                        Not(self.authorizedRoleMet(role, e1.allowedRoles)),
                                        Or(skPermittedConstraints),
                                        Or(otherEntitiesConstraints)]))

    # Solvers
    def clearSolver(self):
        self.constraints = []

    def buildVerifier(self):
        ver = Solver()

        ver.add(*self.constraints)

        for ms in self.microserviceSystem.microservices:
            for endpoint in ms.endpoints:
                ver.add(endpoint.allowedRoles == 
                                BitVec(f"{endpoint.name}_permittedRoles", 
                                                        len(self.microserviceSystem.systemRoles)))
                
        return ver

    def buildOptimizer(self):
        opt = Optimize()

        opt.add(*self.constraints)

        distances = []
        for ms in self.microserviceSystem.microservices:
            for endpoint in ms.endpoints:
                original = BitVecVal(endpoint.allowedRoles, len(self.microserviceSystem.systemRoles))
                bitvec = BitVec(f"{endpoint.name}_permittedRoles", 
                                                        len(self.microserviceSystem.systemRoles))
                distances.append(If(original == bitvec, IntVal(0), IntVal(1)))
        opt.minimize(Sum(distances))
        return opt