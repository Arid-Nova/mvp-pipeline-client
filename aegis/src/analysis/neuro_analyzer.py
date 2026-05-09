from datetime import time
import json
from random import random
import re
import openai as oai
import concurrent.futures
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from ..domain.models import ExecutionPath, NeuroEvidence, MethodFlowItem
from ..services.code_fetcher import CodeFetcher
from ..services.graph_traversal_service import GraphTraversalService

# LLM Service Interface (Abstract Product)
class BaseLLMService(ABC):
    @abstractmethod
    def analyze_code(self, code_snippet: str, method_name: str, context: str) -> Optional[Dict[str, Any]]:
        # Analyzes a code snippet and returns its business context.
        # This handles prompt engineering and API calls.
        pass
    
    @abstractmethod
    def analyze_path(self, path_code_context: list) -> Optional[Dict[str, Any]]:
        # Analyzes an entire execution path and returns consolidated findings.
        pass

    @abstractmethod
    def analyse_latent_vulnerabilities(self, analyzed_paths: List[ExecutionPath], batch_size: int = 5) -> List[Dict[str, Any]]:
        # Analyzes the execution paths to infer latent vulnerabilities.
        pass

# Concrete LLM Implementations (Concrete Products)
class OpenAILLMService(BaseLLMService):
    def __init__(self, api_key: str, endpoint: str, model: str = 'gpt-4o-mini'):
        self.client = oai.OpenAI(base_url=f"{endpoint}", api_key=api_key)
        self.model = model
        # print("Using OpenAI LLM Service")

    def _get_system_prompt_method(self, method_name: str, context: str) -> str:
        return f"""
        You are an expert Security and Logic Analyst. Your task is to perform a comprehensive anaysis of the Java method "{method_name}" within the {context} of a microservice system.
        
        You must extract ALL relevant semantic information, categorizing aspects of the method into three distinct dimensions:
        1. Business Utility (What feature does it serve?)
        2. Security Risks (Does it expand the attack surface or security liabilities?)
        3. Security Controls (Does it mitigate or prevent possible attacks?)

        Respond ONLY in a JSON array format with each finding object using the following keys:
        - "finding": (string) A concise description of evident security liability or attack surface expansion.
        - "confidence": (float) Your confidence in this finding (0.0 to 1.0).
        - "polarity": (string) "risk-increasing" or "risk-decreasing" or "unsure" or "business-critical"
        - "context": "{context}"

        DEFINITIONS:
        - "risk-increasing": Logic that introduces side-effects, unnecessary exposure, or specific vulnerabilities. 
            Examples: Logging sensitive data (PII), raw SQL execution, reflection, bypassing validation, unauthenticated endpoints, debug backdoors, external system calls without timeouts, or exposing internal stack traces.
        - "business-critical": High-value business logic that performs necessary state changes or data processing. 
            Examples: Booking a ticket, updating a profile, processing a payment. 
            **NOTE:** Do not label these as "risk-increasing" unless they imply a specific security weakness (e.g. "updateProfileWithoutAuth").
        - "risk-decreasing": Logic explicitly designed to reduce risk.
            Examples: Input validation/sanitization, JWT token verification, permissions checks (RBAC), data encryption, rate limiting, encryption of sensitive data.
        - "unsure": Insufficient context to classify.

        INSTRUCTIONS:
        - A single method often requires MULTIPLE findings. (e.g., A method might be "business-critical" for updating a profile AND "risk-decreasing" for validating the input).
        - Do not classify standard CRUD operations (Create, Read, Update, Delete) as "risk-increasing" solely because they modify a database. Classify them as "business-critical".
        - Focus on *semantic* security issues (data leaks, lack of controls) rather than functional importance.
        - Actively look for positive security evidence as much as negative security evidence where possible and vice versa.

        JSON FORMAT:
        [
        {{
            "finding": "(string) A concise description of the logic or risk.",
            "confidence": (float) 0.0 to 1.0,
            "polarity": "(string) One of: ['risk-increasing', 'business-critical', 'risk-decreasing', 'unsure']",
            "context": "{context}"
        }}
        ]

        Example for required business logic:
        [
        {{
            "finding": "Standard logic to allocate a seat based on travel details.",
            "confidence": 0.95,
            "polarity": "business-critical",
            "context": "Endpoint"
        }}
        ]

        Example for a logging sensitive data:
        [
        {{
            "finding": "Logs sensitive travel information which may lead to PII leakage in logs.",
            "confidence": 0.9,
            "polarity": "risk-increasing",
            "context": "Endpoint"
        }}
        ]

        Example for encrypting sensitive data:
        [
        {{
            "finding": "Likely involves cryptographic hashing before storage (implied by context).",
            "confidence": 0.70,
            "polarity": "risk-decreasing",
            "context": "Service"
        }}
        ]
        """

        # return f"""
        # You are an expert security and domain logic analyzer. Your task is to analyze
        # a Java method name "{method_name}". Determine its business context and security sensitivity. 
        
        # This is a {context} method in the micro service system.  
        
        # Respond ONLY in a JSON array format with each finding object using the following keys:
        # - "finding": (string) A concise description of the business logic.
        # - "confidence": (float) Your confidence in this finding (0.0 to 1.0).
        # - "polarity": (string) "risk-increasing" or "risk-decreasing" or "unsure".
        # - "context": "{context}"
        
        # "risk-increasing" = Logic that handles sensitive assets (PII, financial, credentials), 
        #                     performs state-changing operations (create, update, delete), 
        #                     accesses external systems, or involves critical business rules. 
        #                     Essentially, if this logic were compromised or bypassed, would it harm the business or users.
        # "risk-decreasing" = Logic that is explicitly designed to reduce risk or provides low-value utility.
        #                     Examples: Security controls (authentication, validation, sanitization), 
        #                     read-only access to public non-sensitive data, simple data transformation, 
        #                     or purely internal utility functions (logging, metrics).
        # "unsure" = Not sure if risk-increasing or risk-decreasing. 

        # There can be multiple findings that could have any polarity. Include them all in the JSON array.

        # Example for a profile update method:
        # [{{
        #   "finding": "Updates a user's profile, including address and phone number.",
        #   "confidence": 0.95,
        #   "polarity": "risk-increasing",
        #   "context": "Business Service"
        # }}]
        # """

    def _get_system_prompt_path(self) -> str:
        return """
        You are an expert Security and Logic Analyst. Your task is to perform a comprehensive analysis of a Java execution path (a sequence of method calls) within a distributed microservice system.
        
        You will receive a JSON payload detailing the sequence of methods in this path and their source code. You must extract ALL relevant semantic information across the entire flow, categorizing aspects of the execution path into three distinct dimensions:
        1. Business Utility (What overarching feature does this path serve?)
        2. Security Risks (Does the sequence expand the attack surface, leak data, or lack necessary checks?)
        3. Security Controls (Are there mitigations, validations, or protections enforced across the call chain?)

        Respond ONLY in a JSON format containing a single key "findings" which holds an array of your findings.
        Format each finding object using the following keys:
        - "finding": (string) A concise description of the logic, security liability, or control observed in the flow.
        - "confidence": (float) Your confidence in this finding (0.0 to 1.0).
        - "polarity": (string) "risk-increasing" or "risk-decreasing" or "unsure" or "business-critical"
        - "context": (string) Specify the exact method(s) or the interaction (e.g., "Method: updateProfile" or "Path: Controller -> Service") that caused this finding.

        DEFINITIONS:
        - "risk-increasing": Logic that introduces side-effects, unnecessary exposure, or specific vulnerabilities. 
            Examples: Logging sensitive data (PII) down the chain, bypassing validation, unauthenticated entry points, executing external calls without timeouts, or a repository saving unencrypted sensitive data.
        - "business-critical": High-value business logic that performs necessary state changes or data processing. 
            Examples: Booking a ticket, updating a profile across services, processing a payment. 
            **NOTE:** Do not label these as "risk-increasing" unless they imply a specific security weakness.
        - "risk-decreasing": Logic explicitly designed to reduce risk.
            Examples: Input validation at the controller, JWT verification before business logic, permissions checks (RBAC), data encryption before saving to the database.
        - "unsure": Insufficient context to classify.

        INSTRUCTIONS:
        - A single execution path WILL generate MULTIPLE findings. Evaluate individual methods as well as the holistic flow (e.g., A path might be "business-critical" overall, have a "risk-decreasing" validation step at the start, but a "risk-increasing" logging step at the end).
        - Do not classify standard CRUD operations (Create, Read, Update, Delete) as "risk-increasing" solely because they modify a database. Classify them as "business-critical".
        - Focus on *semantic* security issues (data leaks, lack of controls) rather than functional importance.
        - Actively look for positive security evidence as much as negative security evidence where possible and vice versa.

        JSON FORMAT:
        {
          "findings": [
            {
              "finding": "(string) A concise description of the logic or risk.",
              "confidence": (float) 0.0 to 1.0,
              "polarity": "(string) One of: ['risk-increasing', 'business-critical', 'risk-decreasing', 'unsure']",
              "context": "(string) The method name or flow interaction"
            }
          ]
        }

        EXAMPLE OUTPUT:
        {
          "findings": [
            {
              "finding": "Standard flow to process a user payment and update the database.",
              "confidence": 0.95,
              "polarity": "business-critical",
              "context": "Flow: PaymentController -> PaymentService -> Repository"
            },
            {
              "finding": "Validates the payment token before processing.",
              "confidence": 0.90,
              "polarity": "risk-decreasing",
              "context": "Method: validateToken"
            },
            {
              "finding": "Logs sensitive transaction details which may lead to PII leakage in the monitoring system.",
              "confidence": 0.85,
              "polarity": "risk-increasing",
              "context": "Interaction: PaymentService -> auditLog"
            }
          ]
        }
        """

    def _get_vulnarability_prompt(self) -> str:
        return """
            You are an expert Microservice Security Analyzer. 

            Data Context:
            You will receive a JSON payload containing system metadata and security findings for distributed microservice paths.
            For each path (identified by `id`, `http_method`, and `path_template`), the JSON provides:
            * `raw_ir_data`: An intermaediate representation of the distributed path in concern, detailing including remote `methodCalls`, `parameters`, and `annotations`.
            * `symbolic_evidence`: Deterministic binary security findings (e.g., UNPROTECTED_ENDPOINT, HARDCODED_SECRET, LDA). There are other variable finidings such as path_length.
            * `neuro_evidence`: Semantic security findings generated by LLMs, containing a `finding` text and `polarity` (e.g., risk-increasing).
            * `fused_opinion`: Contains a `disbelief` score representing the probability mass of the endpoint *not* being secure.

            Your Task:
            Analyze each path in the provided JSON and generate a new JSON array. For each path, infer the latent vulnerabilities (probable future exposures), their root causes, suspected locations (pinpointing exactly using `raw_ir_data`), and possible solutions.

            Output Format:
            You MUST output a valid JSON object containing a single key "results" which holds an array of your analysis. No markdown, no conversational text.
            {
            "results": [
                {
                "id": "<path_id>",
                "http_method": "<method>",
                "path_template": "<path_template>",
                "risk_score_disbelief": <float_value_from_fused_opinion>,
                "latent_vulnerabilities": ["<Vulnerability Name>"],
                "root_causes": ["<Explanation of why this vulnerability exists based on the evidence>"],
                "suspected_locations": ["<Exact pinpointed location using raw_ir_data>"],
                "possible_solutions": ["<Actionable remediation step>"]
                }
            ]
            }
        """

    def analyze_code(self, code_snippet: str, method_name: str, context: str, max_retries: int = 5) -> Optional[Dict[str, Any]]:
        base_delay = 1
        for attempt in range(max_retries):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": self._get_system_prompt_method(method_name, context)},
                        {"role": "user", "content": f"Analyze this Java method:\n\n{code_snippet}"}
                    ]
                )
                json_response = json.loads(response.choices[0].message.content)
                return json_response
            except Exception as e:
                error_msg = str(e).lower()
            
                # Checking if rate limit (429)
                if "429" in error_msg or "too_many_requests" in error_msg or "rate limit" in error_msg:
                    if attempt == max_retries - 1:
                        print(f"Max retries reached for {method_name}. Failing permanently: {e}")
                        return None
                        
                    sleep_time = (base_delay * (2 ** attempt)) + random.uniform(0, 1)
                    # print(f"Rate limit hit for {method_name}. Retrying in {sleep_time:.2f}s (Attempt {attempt + 1}/{max_retries})...")
                    time.sleep(sleep_time)
                    
                else:
                    # If it is any other type of error, fail immediately without retrying
                    print(f"Error calling OpenAI API for {method_name}: {e}")
                    return None
        return None

    def analyze_path(self, path_code_context: list, max_retries: int = 5) -> Optional[Dict[str, Any]]:
        base_delay = 1
        input_json_str = json.dumps(path_code_context, indent=2)
        
        for attempt in range(max_retries):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": self._get_system_prompt_path()},
                        {"role": "user", "content": f"Analyze this Java execution path:\n\n{input_json_str}"}
                    ]
                )
                json_response = json.loads(response.choices[0].message.content)
                return json_response
                
            except Exception as e:
                error_msg = str(e).lower()
                if "429" in error_msg or "too_many_requests" in error_msg or "rate limit" in error_msg:
                    if attempt == max_retries - 1:
                        print(f"Max retries reached for path analysis. Failing permanently: {e}")
                        return None
                    sleep_time = (base_delay * (2 ** attempt)) + random.uniform(0, 1)
                    # print(f"Rate limit hit. Retrying in {sleep_time:.2f}s (Attempt {attempt + 1}/{max_retries})...")
                    time.sleep(sleep_time)
                else:
                    print(f"Error calling OpenAI API for path analysis: {e}")
                    return None
                    
        return None
    
    def analyse_latent_vulnerabilities(self, analyzed_paths: List[ExecutionPath], batch_size: int = 5) -> List[Dict[str, Any]]:
        all_parsed_outcomes = []

        # Preparing batches of paths to analyze in parallel
        prepared_batches = []
        for i in range(0, len(analyzed_paths), batch_size):
            batch = analyzed_paths[i:i + batch_size]
            batch_data = [
                path.model_dump() if hasattr(path, 'model_dump') else (path.__dict__ if not isinstance(path, dict) else path)
                for path in batch
            ]
            batch_num = (i // batch_size) + 1
            prepared_batches.append((batch_num, json.dumps(batch_data)))
        
        # 2. Worker function that handles a single LLM call
        def _process_single_batch(batch_info: tuple) -> List[Dict[str, Any]]:
            batch_num, input_json_str = batch_info
            print(f"Processing batch {batch_num} of {len(prepared_batches)}...")
            
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": self._get_vulnarability_prompt()},
                        {"role": "user", "content": f"Here is the DATA JSON to analyze:\n{input_json_str}"}
                    ],
                    temperature=0.1
                )
                
                raw_output = response.choices[0].message.content.strip()
                
                # Parse JSON
                try:
                    parsed_json = json.loads(raw_output)
                    if "results" in parsed_json:
                        return parsed_json["results"]
                    else:
                        print(f"Warning: LLM response missing 'results' key in batch {batch_num}. Appending raw object.")
                        return [parsed_json]
                        
                except json.JSONDecodeError:
                    if raw_output.startswith("```json"):
                        raw_output = re.sub(r"^```json", "", raw_output)
                        raw_output = re.sub(r"```$", "", raw_output).strip()
                    parsed_json = json.loads(raw_output)
                    return parsed_json.get("results", [])

            except Exception as e:
                print(f"Error during LLM call on batch {batch_num}: {e}")
                return []
        
        # 3. Execute batches in parallel
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            futures = [executor.submit(_process_single_batch, b) for b in prepared_batches]
            
            for future in concurrent.futures.as_completed(futures):
                batch_result = future.result()
                if batch_result:
                    all_parsed_outcomes.extend(batch_result)
        
        return all_parsed_outcomes

class HuggingFaceLLMService(BaseLLMService):
    def __init__(self, model_name: str = "meta-llama/Llama-2-7b-chat-hf"):
        from transformers import pipeline, AutoTokenizer, AutoModelForCausalLM
        print(f"Loading Hugging Face model: {model_name}. This may take a while...")
        
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.model = AutoModelForCausalLM.from_pretrained(model_name)
        except Exception as e:
            print(f"CRITICAL ERROR: Could not load Hugging Face model '{model_name}'.")
            print("Ensure you have network access or the model is cached.")
            print(f"Error: {e}")
            raise

        self.pipe = pipeline(
            "text-generation",
            model=self.model,
            tokenizer=self.tokenizer,
            max_new_tokens=150
        )
        print("Using Hugging Face LLM Service")

    def _get_prompt(self, code_snippet: str, method_name: str, context: str) -> str:
        return f"""
        <s>[INST] <<SYS>>
        You are an expert security and domain logic analyzer. Your task is to analyze
        a Java method named "{method_name}" and determine its business context and security sensitivity.

        This is a {context} method in the microservice system. 
        
        Respond ONLY in a JSON array format with each finding object using the following keys:
        - "finding": (string) A concise description of the business logic.
        - "confidence": (float) Your confidence in this finding (0.0 to 1.0).
        - "polarity": (string) "risk-increasing" or "risk-decreasing" or "unsure".
        - "context": "{context}"
        
        "risk-increasing" = Handles PII, financial data, or critical state changes.
        "risk-decreasing" = Handles non-sensitive, read-only data.
        "unsure" = Not sure if risk-increasing or risk-decreasing. 

        There can be multiple findings. Include them all in the JSON array.

        Example for a profile update method:
        [{
          "finding": "Updates a user's profile, including address and phone number.",
          "confidence": 0.95,
          "polarity": "risk-increasing",
          "context": "Business Service"
        }]
        <<SYS>>
        
        Analyze this Java method:
        
        {code_snippet}
        [/INST]
        """

    def analyze_code(self, code_snippet: str, method_name: str, context: str) -> Optional[Dict[str, Any]]:
        try:
            prompt = self._get_prompt(code_snippet, method_name, context)
            response = self.pipe(prompt)[0]['generated_text']
            
            json_str = response.split("[/INST]")[-1].strip()
            json_str = json_str[json_str.find('{'):json_str.rfind('}')+1]
            
            json_response = json.loads(json_str)
            return json_response
        except Exception as e:
            print(f"Error running local Hugging Face model: {e}")
            return None

class LLMFactory:
    # The Factory class for creating LLM service instances.
    def create_llm_service(self, config: Dict[str, Any]) -> BaseLLMService:
        provider = config.get("provider", "").lower()
        
        if provider == "openai":
            api_key = config.get("api_key")
            endpoint = config.get("endpoint")
            if not api_key:
                raise ValueError("OpenAI provider requires 'api_key' in config")
            return OpenAILLMService(api_key, endpoint=endpoint, model=config.get("model", "gpt-4o-mini"))
        
        elif provider == "meta":
            model_name = config.get("model", "meta-llama/Llama-2-7b-chat-hf")
            return HuggingFaceLLMService(model_name)
        
        else:
            raise ValueError(f"Unknown LLM provider: {provider}. Supported: 'openai', 'meta'")

# The Neuro-Centric Analyzer Class.
class NeuroAnalyzer:
    # Orchestrates the neuro-centric analysis for an execution path.
    def __init__(self, code_fetcher: CodeFetcher, traverser: GraphTraversalService, llm_config: Dict[str, Any]):
        self.traverser = traverser
        self.code_fetcher = code_fetcher
        # Use the factory to create the LLM service
        self.llm_service = LLMFactory().create_llm_service(llm_config)
    
    def analyse_latent_vulnerabilities(self, analyzed_paths: List[ExecutionPath]) -> List[Dict[str, Any]]:
       return self.llm_service.analyse_latent_vulnerabilities(analyzed_paths)

    def analyze(self, execution_path: ExecutionPath) -> ExecutionPath:
        execution_path.method_flow = self.traverser.get_method_flow(execution_path.id)
        execution_path.neuro_evidence = []

        path_code_context = []
        
        for flow_item in execution_path.method_flow:
            if not flow_item.source_file_path or not flow_item.method_name:
                continue
                
            code_snippet = self.code_fetcher.get_method_body(
                flow_item.source_file_path,
                flow_item.method_name
            )
            
            if code_snippet:
                path_code_context.append({
                    "method_name": flow_item.method_name,
                    "node_type": flow_item.node_type,
                    "code": code_snippet
                })

        if not path_code_context:
            print(f"No code could be fetched for path {execution_path.id}.")
            return execution_path

        # 2. Making ONE LLM call for the entire Path
        analysis_result = self.llm_service.analyze_path(path_code_context)
        if not analysis_result:
            print(f"LLM analysis failed for path {execution_path.id}.")
            return execution_path
            
        # 3. Parsing the consolidated results
        try:
            for finding in analysis_result.get('findings', []):
                evidence = NeuroEvidence(
                    finding=finding["finding"],
                    confidence=float(finding["confidence"]),
                    polarity=finding["polarity"],
                    context=finding.get("context", "")
                )
                execution_path.neuro_evidence.append(evidence)
            
        except (KeyError, ValueError, TypeError) as e:
            print(f"Error parsing LLM response for {execution_path.id}: {e}")

        return execution_path
