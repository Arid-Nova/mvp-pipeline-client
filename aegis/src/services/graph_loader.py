import sys
import json
import re
import traceback
from pathlib import Path
from neo4j import Transaction
from typing import Dict, Any, List
from .utils import extract_method_body
from .neo4j_service import Neo4jService
from ..domain.models import ExecutionPath

SECRET_PATTERNS = {
    "ENV_DEFAULT_SECRET": re.compile(r'\${[A-Z0-9_]+:([^}]+)}'),
    "KEYWORD_PASSWORD": re.compile(r'(password|secret|key)\s*:\s*(?!null|""|false|true)\s*([^ \s\r\n\'"]{8,})', re.IGNORECASE)
}

class GraphLoader:
    def __init__(self, neo4j_service: Neo4jService):
        self.neo4j = neo4j_service
    
    def _calculate_method_cc(self, file_path: str, method_name: str) -> int:
        # Reading the code file.
        DEFAULT_CC = 5
        BASE_CC = 1

        abs_path = self.temp_dir / file_path.lstrip('/')
        try:
            with open(abs_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except FileNotFoundError:
            # print(f"Warning: Source file not found at {file_path}. Returning default CC={DEFAULT_CC}.")
            return DEFAULT_CC
        except Exception:
            # print(f"Error reading file {file_path}: {e}. Returning default CC={DEFAULT_CC}.")
            return DEFAULT_CC

        escaped_name = re.escape(method_name)
        
        if method_name not in content:
             return BASE_CC

        try:
            # Use finditer for efficiency
            matches = list(re.finditer(r'\b' + escaped_name + r'\s*\(', content))
            
            target_match = None
            
            for m in matches:
                # Check what follows the closing ')'
                # Find the matching closing parenthesis for this opening one
                start_paren = m.end() - 1
                paren_balance = 1
                idx = start_paren + 1
                
                while idx < len(content) and paren_balance > 0:
                    if content[idx] == '(': paren_balance += 1
                    elif content[idx] == ')': paren_balance -= 1
                    idx += 1
                
                if paren_balance == 0:
                    remaining = content[idx:]
                    # Limit lookahead to avoid infinite scanning (e.g. 200 chars)
                    next_brace = re.search(r'^\s*(throws\s+[\w,\s<>]+\s*)?\{', remaining)
                    
                    if next_brace:
                        start_brace_index = idx + next_brace.end() - 1
                        target_match = start_brace_index
                        break
            
            if target_match is None:
                # print(f"Warning: Signature for '{method_name}' not found in {file_path}.")
                return BASE_CC
                
            start_brace_index = target_match

        except Exception as e:
            # print(f"Regex error for {method_name}: {e}")
            return DEFAULT_CC

        # Extracting method body using brace counting
        method_body = extract_method_body(content, start_brace_index)
        
        if not method_body:
            # print(f"Warning: Could not extract body for '{method_name}'. Returning CC={BASE_CC}.")
            return BASE_CC

        # Calculating Cyclomatic Complexity
        # Decision Points (Java): if, for, while, do, case, catch, &&, ||, ?:
        decision_keywords = [
            r'\bif\b',       # if
            r'\bfor\b',      # for loop
            r'\bwhile\b',    # while loop
            r'\bdo\b',       # do while loop
            r'\bcase\b',     # switch case
            r'\bcatch\b',    # catch block
            r'\&\&',         # Logical AND
            r'\|\|',         # Logical OR
            r'\? :'          # Ternary operator (simplified for readability)
        ]
        
        cc = BASE_CC # Base complexity is 1 (for the method entry/exit)
        
        for pattern in decision_keywords:
            cc += len(re.findall(pattern, method_body))

        return cc

    def _check_string_for_secrets(self, key: str, value: str, findings: List[Dict[str, Any]]):
        common_tags = ["root", "admin", "password", "null", "false", "true"]
        
        # Checking for ENV_DEFAULT_SECRET pattern
        for match in SECRET_PATTERNS["ENV_DEFAULT_SECRET"].finditer(value):
            secret_value = match.group(1).strip()
            if len(secret_value) > 7 and secret_value.lower() not in common_tags:
                findings.append({
                    "type": "HardcodedSecret",
                    "detail": f"Hardcoded default value for environment variable detected for key: {key}",
                    "severity": "CRITICAL",
                    "value": secret_value,
                    "context": f"Key: {key}, Value: {value}"
                })
        
        # Checking for PLAIN_PASSWORD pattern  
        if 'password' in key.lower() or 'secret' in key.lower() or 'key' in key.lower():
            clean_value = value.split(':')[-1].strip().strip('\'"').split('$')[0].strip()
            if len(clean_value) > 7 and clean_value.lower() not in common_tags:
                findings.append({
                    "type": "HardcodedSecret",
                    "detail": f"Potential plain secret detected for configuration key: {key}",
                    "severity": "CRITICAL",
                    "value": clean_value,
                    "context": f"Key: {key}, Value: {value}"
                })

    def _find_hardcoded_secrets(self, config_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        findings = []
        
        def inspect_dict(data):
            if isinstance(data, dict):
                for key, value in data.items():
                    if isinstance(value, str):
                        self._check_string_for_secrets(key, value, findings)
                    elif isinstance(value, (dict, list)):
                        inspect_dict(value)
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, str):
                        self._check_string_for_secrets("list_item", item, findings)
                    elif isinstance(item, (dict, list)):
                        inspect_dict(item)

        inspect_dict(config_data)
        return findings

    def _simulate_sqli_sink_detection(self, method_name: str) -> bool:
        # This method simulates a taint analysis by flagging repository methods 
        # that exhibit characteristics of performing dynamic/native query execution,
        # which are common SQL Injection sinks.

        # Heuristic: Flag methods that involve complex lookups (And, In) or 
        # non-standard DML operations (Delete/Remove by non-ID field).

        lower_name = method_name.lower()
        
        # High Risk: Methods that typically require complex, multi-field, or list lookups.
        # These patterns often correspond to methods annotated with @Query or involving dynamic construction.
        complex_lookup_patterns = [
            r'By[A-Z].*And[A-Z]',    # Matches XxxByField1AndField2
            r'By[A-Z].*In$'          # Matches XxxByFieldIn (ending with 'In' for list lookups)
        ]
        for pattern in complex_lookup_patterns:
            if re.search(pattern, method_name):
                return True
        
        # Moderate Risk: Delete/Remove operations based on non-primary keys.
        # These DML operations can be vulnerable if the field (e.g., userId, orderId) is user-supplied 
        # and the underlying query construction is manual or complex.
        if lower_name.startswith('deleteby') or lower_name.startswith('remove'):
             # We specifically exclude the standard 'deleteById' which is typically safe framework-level method.
             if lower_name not in ['deletebyid']:
                 return True

        # Low Risk: Standard CRUD methods (findById, findAll, save) are generally considered safe 
        # as they are handled by the framework and use parameterized statements.
        return False
    
    def load_graph_from_ir(self, ir_file_path: Path, temp_dir: Path) -> List[ExecutionPath]:
        self.temp_dir = temp_dir
        # print(f"Loading IR from {ir_file_path} into Neo4j.")
        try:
            with open(ir_file_path, 'r', encoding='utf-8') as f:
                ir_data = json.load(f)
        except Exception as e:
            # print(f"Error reading or parsing IR file: {e}")
            return []
            
        self.neo4j.clear_database()
        
        execution_paths = []
        try:
            with self.neo4j.get_session() as session:
                session.execute_write(self._load_nodes_transaction, ir_data, execution_paths)
            # print("Successfully created all nodes (System, Microservice, JClass, JMethod, Endpoint, DataEntity, Annotation).")
        
            with self.neo4j.get_session() as session:
                # Second transaction: Link all nodes
                session.execute_write(self._link_nodes_transaction, ir_data)
        except Exception as e:
            traceback.print_exc()
            sys.exit(1)
        
        # print(f"Graph loading complete. Extracted {len(execution_paths)} endpoints.")
        return execution_paths


    def _load_nodes_transaction(self, tx: Transaction, ir_data: Dict[str, Any], exec_paths_list: List):
        # Creates all nodes (Microservice, JClass, JMethod, Endpoint, Annotation, DataEntity).
        system_name = ir_data.get("name", "UnknownSystem")
        commit_id = ir_data.get("commitID", "Unknown")
        tx.run(
                """
                MERGE (s:System {name: $name})
                ON CREATE SET s.commitId = $commit
                """, 
               name=system_name, commit=commit_id) 

        for service in ir_data.get("microservices", []):
            service_name = service.get("name")
            if not service_name: continue
            
            # System -> Microservice relationship.
            tx.run(
                """
                MATCH (s:System {name: $system_name})
                MERGE (ms:Microservice {name: $name})
                ON CREATE SET ms.path = $path, ms.role = $role
                MERGE (s)-[:HAS_MICROSERVICE]->(ms)
                """,
                system_name=system_name,
                name=service_name,
                path=service.get('path'),
                role='MICROSERVICE'
            )

            # Identifying if there are configurations and keys that are in plain text.
            # This is a known vulnarability. 
            for config_file in service.get("files", []):
                if config_file.get("type") == 'ConfigFile':
                    config_name = config_file.get("name")
                    config_path = config_file.get("path")
                    config_data = config_file.get("data", {})
                    config_id = config_file.get("id", f"{service_name}&ConfigFile&{config_name}")

                    # Creating ConfigFile nodes
                    tx.run(
                        """
                        MATCH (ms:Microservice {name: $msname})
                        MERGE (cf:ConfigFile {id: $cid})
                        ON CREATE SET 
                            cf.name = $cname, 
                            cf.path = $cpath, 
                            cf.role = 'CONFIG'
                        MERGE (ms)-[:HAS_FILE]->(cf)
                        """,
                        msname=service_name,
                        cid=config_id,
                        cname=config_name,
                        cpath=config_path
                    )
                    
                    # Detecting Secrets in Plain Code
                    findings = self._find_hardcoded_secrets(config_data)
                    
                    for i, finding in enumerate(findings):
                        finding_id = f"{config_id}_finding_{i}"
                        
                        # Create Finding node and link it to the ConfigFile and Microservice.
                        tx.run(
                            """
                            MATCH (cf:ConfigFile {id: $cid})
                            MATCH (ms:Microservice {name: $msname})
                            MERGE (f:Finding {id: $fid})
                            ON CREATE SET 
                                f.type = $ftype, 
                                f.detail = $fdetail, 
                                f.severity = $fseverity,
                                f.value = $fvalue,
                                f.context = $fcontext,
                                f.filePath = $fpath,
                                f.source = 'StaticAnalysis'
                            MERGE (cf)-[:HAS_FINDING]->(f)
                            MERGE (ms)-[:HAS_FINDING]->(f)
                            """,
                            cid=config_id,
                            msname=service_name,
                            fid=finding_id,
                            ftype=finding['type'],
                            fdetail=finding['detail'],
                            fseverity=finding['severity'],
                            fvalue=finding['value'],
                            fcontext=finding['context'],
                            fpath=config_path 
                        )
            
            # The nodes are generated in the reverse order - from leaf to parent.
            # This makes it easier to create the links between nodes.
            # So, starting with generating the entity nodes.
            for entity in service.get("entities", []):
                entity_name = entity.get("name")
                if not entity_name: continue
                type_name = entity.get("type")
                label = f"{type_name}:DataEntity"

                tx.run(
                    f"""
                    MERGE (d:{label} {{name: $entity_name}})
                    ON CREATE SET 
                        d.filePath = $path,
                        d.role = $role,
                        d.protection = $protection
                    """,
                    label=label,
                    entity_name=entity_name,
                    path=entity.get("path"),
                    role=(entity.get("classRole")).capitalize(),
                    protection=entity.get("protection")
                )
                
                # TODO: Annotation identification is buggy in CIMET. 
                # Correct annotations need be crrectly associated in CIMET it self.
                for ann in entity.get("annotations", []):
                    ann_name = ann.get("name")
                    if not ann_name: continue
                    if ann_name in ("Data", "AllArgsConstructor", "NoArgsConstructor", "GenericGenerator", "Entity"):
                        attribute = ann.get('attributes')
                        if not attribute: attribute = None
                        tx.run(
                            """
                            MATCH (d:DataEntity {name: $entity_name}) 
                            MERGE (a:Annotation {name: $ann_name, attribute: $attribute}) 
                            ON CREATE SET a.role = $role
                            MERGE (d)-[:HAS_ANNOTATION]->(a)
                            """,
                            entity_name=entity_name,
                            ann_name=ann_name,
                            role='ANNOTATION',
                            attribute=json.dumps(attribute)
                        )
                
                ## The following field maping is not nessecary to the call graph.
                ## Hence, commented. This is not a problem because the business logic inference would compliment this.
                ## Symbolically, I'm only concenred with which entities are shared and accessed.
                # for fld in entity.get("fields", []):
                #     fld_name = fld.get("name")
                #     if not fld_name: continue
                #     tx.run(
                #         """
                #         MATCH (d:DataEntity {name: $entity_name}) 
                #         MERGE (a:Field {name: $fld_name}) 
                #         ON CREATE SET 
                #             a.role = $role,
                #             a.type = $type,
                #             a.protection = protection,
                #             a.isFinal = isFinal,
                #             a.isStatic = isStatic
                #         MERGE (d)-[:HAS_FIELD]->(a)
                #         """,
                #         entity_name=entity_name,
                #         fld_name=fld_name,
                #         role='FIELD',
                #         type=fld.get("fieldType"),
                #         protection=fld.get("protection"),
                #         isFinal=fld.get("isFinal"),
                #         isStatic=fld.get("isStatic")
                #     )

                # print(f"Created DataEntity: {entity_name} nodes for {service_name}.")

            # Define all class arrays to process
            class_arrays_to_process = [
                (service.get("repositories", []), "Repository"), 
                (service.get("services", []), "Service"),       
                (service.get("controllers", []), "Controller")
            ]

            for class_array, role_label in class_arrays_to_process:
                for jclass in class_array:
                    self._create_jclass_and_methods(tx, jclass, service_name, role_label, exec_paths_list)

    def __extract_entity(self, repo_name: str) -> str:
        repo_name = repo_name.strip()
        match = re.match(r"(.+?)Repository$", repo_name, re.IGNORECASE)
        if match: 
            express = match.group(1)
            if 'Money' in express: return 'Money'
            if 'ConsignPrice' in express: return 'ConsignPrice'
            if 'StationFood' in express: return 'StationFoodStore'
            if 'Consign' == express: return 'ConsignRecord'
            if 'Notify' == express: return 'NotifyInfo'
            if 'OrderOther' == express: return 'Order'
            return express
        else: repo_name
    
    def __extract_service(self, ser_name: str) -> str:
        ser_name = ser_name.strip()
        match = re.match(r"(.+?)Impl$", ser_name, re.IGNORECASE)
        if match:
            express = match.group(1)
            return express
        else: ser_name

    def _create_jclass_and_methods(self, tx: Transaction, jclass: Dict[str, Any], microservice_name: str, role_label: str, exec_paths_list: List):
        # Helper to create a JClass node (with appropriate label), 
        # all its JMethod/Endpoint nodes, and all associated Annotation nodes.

        class_name = jclass.get("name")
        if not class_name: return
        
        # 1. Create the JClass node with base label and role-specific label
        type = jclass.get("type")
        labels = f"{type}:{role_label}" # :JInterface:Repository OR :JClass:Service OR :JClass:Controller
        node_id = jclass.get("id")
        
        if role_label == 'Service':
            class_name = self.__extract_service(class_name)

        tx.run(
            f"""
            MATCH (ms:Microservice {{name: $microservice_name}})
            MERGE (c:{labels} {{id: $cid}}) 
            ON CREATE SET 
                c.packageName = $package,
                c.filePath = $path,
                c.role = $role,
                c.name = $name
            MERGE (ms)-[:HAS_CLASS]->(c)
            """,
            cid=node_id,
            microservice_name=microservice_name,
            name=class_name,
            package=jclass.get("packageName"),
            path=jclass.get("path"),
            role=role_label.capitalize()
        )
        
        # 2. Process class-level annotations
        for ann in jclass.get("annotations", []):
            ann_name = ann.get("name")
            if not ann_name: continue

            annotation_query = f"""
                        MATCH (c:{type} {{id: $parent_id}}) 
                        MERGE (a:Annotation {{name: $ann_name, attribute: $attribute}}) 
                        ON CREATE SET a.role = $role
                        MERGE (c)-[:HAS_ANNOTATION]->(a)
                        """

            # If the JClass is a Repository.
            if role_label == 'Repository':
                if ann_name in ["Repository"]:
                    attribute = ann.get("attributes")
                    if not attribute: attribute = None
                    tx.run(annotation_query,
                        type=role_label,
                        parent_id=node_id,
                        ann_name=ann_name,
                        role='ANNOTATION',
                        attribute=json.dumps(attribute)
                    )

            # If the JClass is a Business Service.
            if role_label == 'Service':
                if ann_name in ["Service"]:
                    attribute = ann.get("attributes")
                    if not attribute: attribute = None
                    tx.run(annotation_query,
                        type=role_label,
                        parent_id=node_id,
                        ann_name=ann_name,
                        role='ANNOTATION',
                        attribute=json.dumps(attribute)
                    )

            
            # If the JClass is a Controller.
            if role_label == 'Controller':
                if ann_name in ("RequestMapping", "RestController"):
                    attribute = ann.get("attributes")
                    if attribute: attribute = attribute.get("default")
                    else: attribute = None
                    tx.run(annotation_query,
                        type=role_label,
                        parent_id=node_id,
                        ann_name=ann_name,
                        role='ANNOTATION',
                        attribute=json.dumps(attribute)
                    )

        # 3. Process all methods in this class.
        for method in jclass.get("methods", []):
            method_name = method.get("name")
            method_id = method.get("id") 
            if not method_name or not method_id: continue

            ## 1. If methods of a CONTROLLER, those should be Endpoints.
            if role_label == 'Controller':
                http_method = method.get("httpMethod", "ANY")
                url = method.get("url", "/")
                
                # Clean up the URL
                if not url.startswith('/'): url = '/' + url
                full_path = re.sub(r'/+', '/', url)
                if full_path != '/' and full_path.endswith('/'): full_path = full_path[:-1]
                if not full_path: full_path = '/'

                path = jclass.get("path")
                tx.run(
                    f"""
                    MATCH (c:{type} {{id: $parent_id}})
                    MERGE (m:JMethod:Endpoint {{id: $mid}}) 
                    ON CREATE SET 
                        m.name = $name,
                        m.role = $role,
                        m.httpMethod = $http_method, 
                        m.url = $url,
                        m.path = $path,
                        m.protection = $protection,
                        m.cyclomaticComplexity = $cc
                    MERGE (c)-[:HAS_METHOD]->(m)
                    """,
                    type=role_label,
                    parent_id=node_id,
                    mid=method_id,
                    name=method_name,
                    role='ENDPOINT',
                    http_method=http_method,
                    url=full_path,
                    path=path,
                    protection=method.get("protection"),
                    cc=self._calculate_method_cc(path,method_name)
                )

                # Add to our list of paths to analyze
                exec_paths_list.append(ExecutionPath(
                    id=method_id,
                    http_method=http_method,
                    path_template=full_path,
                    raw_ir_data=method, 
                    source_file_path=jclass.get("path"),
                    method_name=method_name
                ))

                # TODO:
                # Parameters.
                # Method Calls. 
                # Annotations should come here.

            ## 2. If methods of a business service.
            if role_label == 'Service':
                path = jclass.get("path")
                tx.run(
                    f"""
                    MATCH (c:{type} {{id: $parent_id}})
                    MERGE (m:JMethod:Method {{id: $mid}}) 
                    ON CREATE SET 
                        m.name = $name,
                        m.role = $role,
                        m.path = $path,
                        m.protection = $protection,
                        m.cyclomaticComplexity = $cc
                    MERGE (c)-[:HAS_METHOD]->(m)
                    """,
                    type=role_label,
                    parent_id=node_id,
                    mid=method_id,
                    name=method_name,
                    role='METHOD',
                    protection=method.get("protection"),
                    path=path,
                    cc=self._calculate_method_cc(path,method_name)
                )

                # Parameters.
                # Method Calls. 
                # Annotations should come here.

            ## 3. If methods of a repository.
            if role_label == 'Repository':
                entity_name = self.__extract_entity(class_name)
                path = jclass.get("path",None)

                tx.run(
                    f"""
                    MATCH (d:DataEntity {{name: $entity_name}})
                    MATCH (c:{type} {{id: $parent_id}})
                    MERGE (m:JMethod:Method {{id: $mid}}) 
                    ON CREATE SET 
                        m.name = $name,
                        m.role = $role,
                        m.path = $path,
                        m.protection = $protection,
                        m.cyclomaticComplexity = $cc
                    MERGE (c)-[:HAS_METHOD]->(m)
                    MERGE (m)-[:ACCESSES]->(d)
                    """,
                    entity_name=entity_name,
                    parent_id=node_id,
                    mid=method_id,
                    role='METHOD',
                    name=method_name,
                    type=labels,
                    protection=method.get("protection"),
                    path=path,
                    cc=self._calculate_method_cc(path,method_name)
                )

                is_sqli_sink = self._simulate_sqli_sink_detection(method_name)
                if is_sqli_sink:
                    sqli_finding_id = f"{method_id}_sqli_sink"
                    tx.run(
                            """
                            MATCH (m:JMethod {id: $mid})
                            MERGE (f:Finding {id: $fid})
                            ON CREATE SET 
                                f.type = 'SQLiSink', 
                                f.detail = 'Simulated SQL Injection Sink (Dynamic Query Heuristic)', 
                                f.severity = 'HIGH',
                                f.context = 'Method name suggests dynamic query execution.',
                                f.source = 'SimulatedTaintAnalysis'
                            MERGE (m)-[:HAS_FINDING]->(f)
                            """,
                            mid=method_id,
                            fid=sqli_finding_id
                        )

            # Create method-level annotations
            for ann in method.get("annotations", []):
                ann_name = ann.get("name")
                if not ann_name: continue
                attribute = ann.get('attributes')
                tx.run(
                    """
                    MATCH (m:JMethod {id: $method_id})
                    MERGE (a:Annotation {name: $ann_name, attribute: $attribute})
                    ON CREATE SET a.role = $role
                    MERGE (m)-[:HAS_ANNOTATION]->(a)
                    """,
                    method_id=method_id,
                    ann_name=ann_name,
                    role='ANNOTATION',
                    attribute=json.dumps(attribute)
                )

    def ends_with_service(self, name: str) -> bool:
        return name.lower().endswith("service")
    
    def ends_with_repo(self, name: str) -> bool:
        return name.lower().endswith("repository")
    
    def is_ts_service(self, name: str) -> bool:
        return name.startswith("ts-") and name.endswith("-service")

    def _link_nodes_transaction(self, tx: Transaction, ir_data: Dict[str, Any]):
        # Creates relationships (:CALLS, :ACCESSES) between existing nodes.
        # print("Creating inter- and intra-service calls!")
        call_links_created = 0
        ext_links_created = 0

        # Define all class types to iterate through for linking
        all_class_types_for_linking = ["controllers", "services", "repositories"]

        for service in ir_data.get("microservices", []):
            microservice_name = service.get('name')

            for class_type in all_class_types_for_linking:
                for jclass in service.get(class_type, []):
                    class_role = jclass.get("classRole")
                    class_name = jclass.get("name")
                    
                    for method in jclass.get("methods", []):
                        caller_id = method.get("id")
                        if not caller_id: continue
                        
                        temp_interservice_callee = None
                        # This links all the generic intra-service calls.
                        for call in method.get("methodCalls", []):
                            # If the method call is from a controller, I'm interested only on calls to it's services.
                            if class_role == 'CONTROLLER':
                                if self.ends_with_service(call.get("objectType")):
                                    callee_name = call.get("name")

                                    # First retrieving the id of the callee method.
                                    result = tx.run("""
                                        MATCH (:Microservice {name: $msname})
                                            -[:HAS_CLASS]->
                                            (:Service {name: $service})
                                            -[:HAS_METHOD]->
                                            (jm:JMethod {name: $callee})
                                        RETURN jm.id AS jmethodId
                                        """,
                                        msname=microservice_name,
                                        service=call.get("objectType"),
                                        callee=callee_name
                                        )
                                    record = result.single()
                                    callee_id = record["jmethodId"] if record else None
                            
                                    # Create the :CALLS relationship
                                    result = tx.run(
                                        """
                                        MATCH (caller:JMethod {id: $caller_id})
                                        MATCH (callee:JMethod {id: $callee_id})
                                        MERGE (caller)-[:CALLS]->(callee)
                                        RETURN count(*) as link_count
                                        """,
                                        caller_id=caller_id,
                                        callee_id=callee_id
                                    )
                                    call_links_created += result.single()["link_count"] or 0

                            # If the method call is from a service, I'm interested in:
                            # 1. Calls to a repo to access an entity.
                            # 2. Calls to methods internal to the package such as helpers.
                            # 3. Calls to external endpoints including inter-service.
                            # 4. Calls to other service methods.
                            if class_role == 'SERVICE':
                                callee_name = call.get("name")
                                object_type = call.get("objectType")
                                call_type = call.get("type")

                                # Then, this is a call to a repo to access an entity (#1).
                                if self.ends_with_repo(object_type):
                                    # First retrieving the id of the callee method.
                                    result = tx.run("""
                                        MATCH (:Microservice {name: $msname})
                                            -[:HAS_CLASS]->
                                            (:Repository {name: $objName})
                                            -[:HAS_METHOD]->
                                            (jm:JMethod {name: $callee})
                                        RETURN jm.id AS jmethodId
                                        """,
                                        msname=microservice_name,
                                        objName=object_type,
                                        callee=callee_name
                                        )
                                    record = result.single()
                                    callee_id = record["jmethodId"] if record else None
                            
                                    # Create the :CALLS relationship
                                    result = tx.run(
                                        """
                                        MATCH (caller:JMethod {id: $caller_id})
                                        MATCH (callee:JMethod {id: $callee_id})
                                        MERGE (caller)-[:CALLS]->(callee)
                                        RETURN count(*) as link_count
                                        """,
                                        caller_id=caller_id,
                                        callee_id=callee_id
                                    )
                                    call_links_created += result.single()["link_count"] or 0
                                
                                # If there is no object type, that's an internal method call (#2).
                                if object_type == "":
                                    # This is a preperation for an inter-service call.
                                    if callee_name == "getServiceUrl":
                                        temp_interservice_callee = call.get("parameterContents").strip('"')
                                        continue
                                    
                                    result = tx.run("""
                                        MATCH (:Microservice {name: $msname})
                                            -[:HAS_CLASS]->
                                            (:Service {name: $service})
                                            -[:HAS_METHOD]->
                                            (jm:JMethod {name: $callee})
                                        RETURN jm.id AS jmethodId
                                        """,
                                        msname=microservice_name,
                                        service=class_name,
                                        callee=callee_name
                                        )
                                    record = result.single()
                                    callee_id = record["jmethodId"] if record else None
                            
                                    # Create the :CALLS relationship
                                    result = tx.run(
                                        """
                                        MATCH (caller:JMethod {id: $caller_id})
                                        MATCH (callee:JMethod {id: $callee_id})
                                        MERGE (caller)-[:CALLS]->(callee)
                                        RETURN count(*) as link_count
                                        """,
                                        caller_id=caller_id,
                                        callee_id=callee_id
                                    )
                                    call_links_created += result.single()["link_count"] or 0

                                # If the method call is a RestCall type, then it's an API call, including an interservice call (#3).
                                if call_type == "RestCall":
                                    # If true, it's an intersevice call.
                                    if (temp_interservice_callee is not None) and self.is_ts_service(temp_interservice_callee):
                                        result = tx.run("""
                                        MATCH (:Microservice {name: $msname})
                                            -[:HAS_CLASS]->
                                            (:Controller)
                                            -[:HAS_METHOD]->
                                            (ep:Endpoint {httpMethod: $method})
                                        RETURN ep.id AS endpointId;
                                        """,
                                        msname=temp_interservice_callee,
                                        method=call.get("httpMethod")
                                        )

                                        record = result.single()
                                        callee_id = record["endpointId"] if record else None

                                        ext_result = tx.run(
                                            """
                                            MATCH (caller:JMethod {id: $caller_id})
                                            MATCH (callee:JMethod {id: $callee_id})
                                            MERGE (caller)-[:CALLS_EXTERNAL]->(callee)
                                            RETURN count(*) as link_count
                                            """,
                                            caller_id=caller_id,
                                            callee_id=callee_id
                                        )
                                        ext_links_created += ext_result.single()["link_count"] or 0

                                    # If not, it's a completely outside API call.
                                    else:
                                        ext_result = tx.run(
                                            """
                                            MATCH (caller:JMethod {id: $caller_id})
                                            MERGE (callee:ExternalAPI {id: $apid}) 
                                            ON CREATE SET 
                                                callee.url = $url,
                                                callee.httpMethod = $method
                                            MERGE (caller)-[:CALLS_EXTERNAL]->(callee)
                                            RETURN count(*) as link_count
                                            """,
                                            caller_id=caller_id,
                                            apid=call.get("id"),
                                            url=call.get("url"),
                                            method=call.get("httpMethod")
                                        )
                                        ext_links_created += ext_result.single()["link_count"] or 0

                                    temp_interservice_callee = None
                        
        # print(f"Created {call_links_created} CALLS links.")
        # print(f"Created {ext_links_created} CALLS_EXTERNAL links.")