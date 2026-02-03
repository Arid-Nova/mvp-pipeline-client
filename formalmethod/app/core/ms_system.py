import typing
from dataclasses import dataclass, field
import json

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
        objType = ObjectType(objDict["name"], objDict["package"], {})
        
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
        repository = Repository(0, "")
        repository.name = objDict["name"]
        repository.accessedMethods = (objDict["accessedMethods"] if objDict["accessedMethods"] != 0b11111111
                                      else BitVec(f"{repository.name}_accessedMethods", 4))

        return repository


@dataclass
class Endpoint:
    repositories: list[Repository] = field(hash=False)
    allowedRoles: int | BitVecRef
    name: str
    funcName: str = ""
    _allowAllRoles: bool = False
    responseType: ObjectType = None
    parent: "Microservice" = None

    def asDict(self):
        repos = [r.asDict() for r in self.repositories]
        if type(self.allowedRoles) is int:
            roles = self.allowedRoles
        else:
            roles = 0b11111111 | (self.allowedRoles.size() << 8)

        return {"name": self.name,
                "funcName": self.funcName,
                "allowedRoles": roles,
                "repositories": repos}

    @staticmethod
    def fromDict(objDict: dict):
        endpoint = Endpoint([], [], "", "", False)
        endpoint.name = objDict["name"]
        endpoint.funcName = objDict["funcName"]
        if int(objDict["allowedRoles"]) & 0b11111111 == 0b11111111:
            endpoint.allowedRoles = BitVec(int(objDict["allowedRoles"]) >> 8,
                                           f"{endpoint.name}.{endpoint.funcName}_allowedRoles")
        else:
            endpoint.allowedRoles = int(objDict["allowedRoles"])
        endpoint.repositories = [Repository.fromDict(rObj) for rObj in objDict["repositories"]]
        for repo in endpoint.repositories:
            repo.parent = endpoint

        return endpoint

    def __hash__(self):
        return hash(self.name)
    
    def __eq__(self, other):
        return self.name == other.name


@dataclass
class Microservice:
    endpoints: list[Endpoint] = field(hash=False)
    name: str
    parent: "MicroserviceSystem" = None

    def addEndpoint(self, endpoint: Endpoint):
        self.endpoints.append(endpoint)
        endpoint.parent = self

    def asDict(self):
        end = [en.asDict() for en in self.endpoints]

        return {"name": self.name,
                "endpoints": end}

    @staticmethod
    def fromDict(objDict: dict):
        ms = Microservice([], "")
        ms.name = objDict["name"]
        ms.endpoints = [Endpoint.fromDict(eObj) for eObj in objDict["endpoints"]]
        for endpoint in ms.endpoints:
            endpoint.parent = ms

        return ms


@dataclass
class SystemConnectionGraph:
    connectionMap: dict = field(default_factory=lambda: {})
    reverseConnectionMap: dict = field(default_factory=lambda: {})
    parent: "MicroserviceSystem" = None

    def addSystemConnection(self, fromEndpoint: Endpoint, toEndpoint: Endpoint):
        if fromEndpoint not in self.connectionMap:
            self.connectionMap[fromEndpoint] = [toEndpoint]
        else:
            self.connectionMap[fromEndpoint].append(toEndpoint)
        if toEndpoint not in self.reverseConnectionMap:
            self.reverseConnectionMap[toEndpoint] = [fromEndpoint]
        else:
            self.reverseConnectionMap[toEndpoint].append(fromEndpoint)

    def asDict(self):
        strMap = {}
        for start, end in self.connectionMap.items():
            strArray = []
            for en in end:
                strArray.append(en.name)
            strMap[start.name] = strArray
        return strMap

    @staticmethod
    def fromDict(objDict: dict, parent):
        scg = SystemConnectionGraph()
        for start, end in objDict.items():
            for en in end:
                scg.addSystemConnection(parent.findEndpoint(start), parent.findEndpoint(en))

        return scg


@dataclass
class MicroserviceSystem:
    microservices: list[Microservice] = field(hash=False)
    systemConnections: SystemConnectionGraph
    name: str
    systemRoles: dict[int | BitVecRef, str]

    def findAllRepositoryInstances(self, repositoryName: str):
        ret = []
        for ms in self.microservices:
            for endpoint in ms.endpoints:
                for repo in endpoint.repositories:
                    if repo.name == repositoryName:
                        ret.append((endpoint, repo))
        return ret

    def findEndpoint(self, endpointName: str):
        for ms in self.microservices:
            for endpoint in ms.endpoints:
                if endpoint.name == endpointName:
                    return endpoint
        return None

    def findEndpointByFuncName(self, funcName: str):
        for ms in self.microservices:
            for endpoint in ms.endpoints:
                if endpoint.funcName == funcName:
                    return endpoint
        return None

    def findAllEndpointsWithGenericPath(self, endpointName: str, msName: str = ""):
        endpoints = []
        for ms in self.microservices:
            if msName != "" and ms.name != msName:
                continue
            for endpoint in ms.endpoints:
                name = endpoint.name
                parts = endpointName.split("/**")
                match = True
                for part in parts:
                    if part not in name:
                        match = False
                        break
                    name = name[name.find(part) + len(part):]
                if match and (name.startswith(("GET", "POST", "PUT", "DELETE", "PATCH", "/")) or name == ""):
                    endpoints.append(endpoint)

        return endpoints

    def populateBackReferences(self):
        self.systemConnections.parent = self
        for ms in self.microservices:
            ms.parent = self
            for endpoint in ms.endpoints:
                ms.parent = endpoint
                for repo in endpoint.repositories:
                    repo.parent = endpoint

    def asDict(self):
        ms = [m.asDict() for m in self.microservices]

        return {"name": self.name,
                "systemRoles": self.systemRoles,
                "microservices": ms,
                "systemConnections": self.systemConnections.asDict()}

    @staticmethod
    def fromDict(objDict: dict):
        msSystem = MicroserviceSystem([], SystemConnectionGraph(), "", {})
        msSystem.name = objDict["name"]
        for key, value in objDict["systemRoles"].items():
            msSystem.systemRoles[int(key)] = value
        msSystem.microservices = [Microservice.fromDict(msObj) for msObj in objDict["microservices"]]
        msSystem.systemConnections = SystemConnectionGraph.fromDict(objDict["systemConnections"], msSystem)
        for ms in msSystem.microservices:
            ms.parent = msSystem
        msSystem.systemConnections.parent = msSystem

        return msSystem


def modelToJSON(filePath: str, model: MicroserviceSystem):
    with open(filePath, "w") as outputFile:
        json.dump(model.asDict(), outputFile, indent=3)


def modelFromJSON(filePath: str) -> MicroserviceSystem:
    with open(filePath, "r") as inputFile:
        return MicroserviceSystem.fromDict(json.load(inputFile))

