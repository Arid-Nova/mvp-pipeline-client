import typing
from dataclasses import dataclass, field
from z3 import *

@dataclass
class ObjectType:
    name: str
    fields: typing.Dict[str, typing.Union[str, "ObjectType"]]
    package: str = ""
    parent: typing.Union["ObjectType", "Endpoint"] = None

    def asDict(self):
        parsedFields = {}
        for identifier, field in self.fields.items():
            if type(field) == str:
                parsedFields[identifier] = field
            else:
                parsedFields[identifier] = field.asDict()

        return {"name": self.name,
                "package": self.package,
                "fields": parsedFields}

    @staticmethod
    def fromDict(objDict: dict):
        objType = ObjectType(objDict["name"], objDict.get("package", ""), {})
        for key, value in objDict["fields"].items():
            if type(value) == str:
                objType.fields[key] = value
            else:
                objType.fields[key] = ObjectType.fromDict(value)
                objType.fields[key].parent = objType
        return objType


@dataclass
class Repository:
    accessedMethods: int
    name: str
    parent: "Endpoint" = None

    def asDict(self):
        return {"name": self.name,
                "accessedMethods": self.accessedMethods if type(self.accessedMethods) is int else 0b11111111}

    @staticmethod
    def fromDict(objDict: dict):
        return Repository(objDict["accessedMethods"], objDict["name"])


@dataclass
class Endpoint:
    repositories: typing.List[Repository]
    allowedRoles: typing.Union[int, BitVecRef]
    name: str
    _allowAllRoles: bool = False
    parent: "Microservice" = None
    funcName: str = "" 

    # --- FIX 1: Make Endpoint Hashable for Dictionary Keys ---
    def __hash__(self):
        return hash(self.name)

    def __eq__(self, other):
        if not isinstance(other, Endpoint):
            return False
        return self.name == other.name
    # ---------------------------------------------------------

    def asDict(self):
        val = self.allowedRoles
        if not isinstance(val, int):
            val = 0
        return {"name": self.name,
                "repositories": [r.asDict() for r in self.repositories],
                "allowedRoles": val}

    @staticmethod
    def fromDict(objDict: dict):
        return Endpoint(
            [Repository.fromDict(r) for r in objDict["repositories"]],
            objDict.get("allowedRoles", 0),
            objDict["name"]
        )


@dataclass
class Microservice:
    endpoints: typing.List[Endpoint]
    name: str
    parent: "MicroserviceSystem" = None

    def asDict(self):
        return {"name": self.name,
                "endpoints": [e.asDict() for e in self.endpoints]}

    @staticmethod
    def fromDict(objDict: dict):
        return Microservice(
            [Endpoint.fromDict(e) for e in objDict["endpoints"]],
            objDict["name"]
        )


@dataclass
class SystemConnectionGraph:
    connectionMap: typing.Dict[Endpoint, typing.List[Endpoint]] = field(default_factory=dict)
    # --- FIX 2: Add Reverse Map ---
    reverseConnectionMap: typing.Dict[Endpoint, typing.List[Endpoint]] = field(default_factory=dict)
    # ------------------------------
    parent: "MicroserviceSystem" = None

    def addSystemConnection(self, e1: Endpoint, e2: Endpoint):
        # Forward connection
        if e1 not in self.connectionMap:
            self.connectionMap[e1] = []
        if e2 not in self.connectionMap[e1]:
            self.connectionMap[e1].append(e2)

        # Reverse connection (Essential for Solver)
        if e2 not in self.reverseConnectionMap:
            self.reverseConnectionMap[e2] = []
        if e1 not in self.reverseConnectionMap[e2]:
            self.reverseConnectionMap[e2].append(e1)

    def asDict(self):
        connections = {}
        for source, targets in self.connectionMap.items():
            connections[source.name] = [t.name for t in targets]
        return connections

    @staticmethod
    def fromDict(objDict: dict, system: "MicroserviceSystem"):
        scg = SystemConnectionGraph()
        for source_name, target_names in objDict.items():
            source = system.findEndpoint(source_name)
            if source:
                for target_name in target_names:
                    target = system.findEndpoint(target_name)
                    if target:
                        scg.addSystemConnection(source, target)
        return scg


@dataclass
class MicroserviceSystem:
    microservices: typing.List[Microservice]
    systemConnections: SystemConnectionGraph
    name: str
    systemRoles: typing.Dict[int, str]

    def findEndpoint(self, name: str) -> typing.Union[Endpoint, None]:
        for ms in self.microservices:
            for endpoint in ms.endpoints:
                if endpoint.name == name:
                    return endpoint
        return None

    def findAllEndpointsWithGenericPath(self, partialPath: str, msName: str = None):
        found = []
        for ms in self.microservices:
            if msName and ms.name != msName:
                continue
            for endpoint in ms.endpoints:
                if partialPath in endpoint.name:
                    found.append(endpoint)
        return found

    def populateBackReferences(self):
        self.systemConnections.parent = self
        for ms in self.microservices:
            ms.parent = self
            for endpoint in ms.endpoints:
                endpoint.parent = ms
                for repo in endpoint.repositories:
                    repo.parent = endpoint

    def asDict(self):
        ms = [m.asDict() for m in self.microservices]
        roles = {str(k): v for k, v in self.systemRoles.items()}
        return {"name": self.name,
                "systemRoles": roles,
                "microservices": ms,
                "systemConnections": self.systemConnections.asDict()}

    @staticmethod
    def fromDict(objDict: dict):
        roles = {}
        if "systemRoles" in objDict:
            for key, value in objDict["systemRoles"].items():
                roles[int(key)] = value
        
        msSystem = MicroserviceSystem([], SystemConnectionGraph(), "", roles)
        msSystem.name = objDict.get("name", "")
        
        if "microservices" in objDict:
            msSystem.microservices = [Microservice.fromDict(msObj) for msObj in objDict["microservices"]]
        
        if "systemConnections" in objDict:
            msSystem.systemConnections = SystemConnectionGraph.fromDict(objDict["systemConnections"], msSystem)
        
        msSystem.populateBackReferences()
        return msSystem