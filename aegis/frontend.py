# ahp_tool.py
import json
import numpy as np
import configparser
import os
import gzip
import json
from flask_cors import CORS
from src.services.mongo_service import MongoService
from src.services.neo4j_service import Neo4jService
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from src.ahp_calculator import AHPCalculator

app = Flask(__name__,
            template_folder='templates',
            static_folder='static')
app.secret_key = os.urandom(24) 
CORS(app, origins=["http://localhost:3000","http://localhost:5600"])

CONFIG_FILE_PATH = 'configs/calibration_config.json'
try:
    with open(CONFIG_FILE_PATH, 'r') as f:
        CALIBRATION_CONFIG = json.load(f)
    
    NEGATIVE_CRITERIA = CALIBRATION_CONFIG.get("binary_negative", [])
    POSITIVE_CRITERIA = CALIBRATION_CONFIG.get("binary_positive", [])
    VARIABLE_CRITERIA = CALIBRATION_CONFIG.get("variable_metrics", [])
    
    if not NEGATIVE_CRITERIA or not POSITIVE_CRITERIA or not VARIABLE_CRITERIA:
        raise KeyError("Config file is missing one or more required keys.")
        
except FileNotFoundError:
    print(f"FATAL ERROR: The calibration config file was not found at {CONFIG_FILE_PATH}")
    exit(1)
except Exception as e:
    print(f"FATAL ERROR: Could not parse {CONFIG_FILE_PATH}: {e}")
    exit(1)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ahp')
def ahp_startup():
    if 'negative_weights' not in session:
        criteria = NEGATIVE_CRITERIA
        title = "Stage 1: Negative Evidence Comparison (Risk-Increasing)"
        criteria_type = "negative"
    elif 'positive_weights' not in session:
        criteria = POSITIVE_CRITERIA
        title = "Stage 2: Positive Evidence Comparison (Risk-Decreasing)"
        criteria_type = "positive"
    elif 'variable_weights' not in session: 
        criteria = VARIABLE_CRITERIA
        title = "Stage 3: Variable Metric Comparison (Risk-Increasing)"
        criteria_type = "variable"
    else:
        return redirect(url_for('elicit_opinions'))
    
    criteria_keys = [c['key'] for c in criteria]
        
    return render_template(
        'matrix.html', 
        criteria=criteria, 
        criteria_keys=criteria_keys, 
        title=title, 
        criteria_type=criteria_type
    )


@app.route('/calculate_weights', methods=['POST'])
def calculate_weights():
    form_data = request.form
    criteria_type = form_data.get('criteria_type')
    
    # Get the criteria keys from the form
    criteria_key_str = [key for key in form_data if key.startswith('criteria-')][0]
    criteria_keys = criteria_key_str.split(',')[1:] 
    n = len(criteria_keys)
    matrix = np.ones((n, n))

    for i in range(n):
        for j in range(i + 1, n):
            val = float(form_data[f'{criteria_keys[i]}_vs_{criteria_keys[j]}'])
            matrix[i, j] = val
            matrix[j, i] = 1.0 / val

    calc = AHPCalculator(criteria_keys, matrix)
    weights = calc.calculate_weights() 
    
    if criteria_type == 'negative':
        session['negative_weights'] = weights
    elif criteria_type == 'positive':
        session['positive_weights'] = weights
    elif criteria_type == 'variable':
        session['variable_weights'] = weights
    
    session.modified = True 
    return redirect(url_for('ahp_startup'))

@app.route('/elicit_opinions')
def elicit_opinions():

    binary_weights = {**session.get('negative_weights', {}), **session.get('positive_weights', {})}
    variable_weights = session.get('variable_weights', {})

    if not binary_weights or not variable_weights:
        return redirect(url_for('ahp_startup'))

    binary_criteria_with_weights = []
    for criterion in NEGATIVE_CRITERIA + POSITIVE_CRITERIA:
        key = criterion['key']
        binary_criteria_with_weights.append({
            "key": key,
            "description": criterion['description'],
            "weight": binary_weights.get(key, 0.0) 
        })
        
    variable_criteria_with_weights = []
    for criterion in VARIABLE_CRITERIA:
        key = criterion['key']
        variable_criteria_with_weights.append({
            "key": key,
            "description": criterion['description'],
            "weight": variable_weights.get(key, 0.0)
        })
        
    return render_template(
        'elicitation.html', 
        binary_criteria=binary_criteria_with_weights,
        variable_criteria=variable_criteria_with_weights
    )


@app.route('/save_configs', methods=['POST'])
def save_configs():
    form_data = request.form
    ahp_benchmarks = {}
    metric_thresholds = {}
    
    binary_weights = {**session.get('negative_weights', {}), **session.get('positive_weights', {})}
    for key in binary_weights.keys():
        try:
            b = float(form_data[f'{key}-b'])
            d = float(form_data[f'{key}-d'])
            u = float(form_data[f'{key}-u'])
            
            if not 0.999 < (b + d + u) < 1.001:
                return f"Error: Opinions for {key} do not sum to 1. Go back and fix.", 400
                
            ahp_benchmarks[key] = {
                "finding": form_data[f'{key}-finding'], 
                "opinion": {"belief": b, "disbelief": d, "uncertainty": u}
            }
        except Exception as e:
            return f"Error processing binary data for {key}: {e}", 400

    variable_weights = session.get('variable_weights', {})
    for key, weight in variable_weights.items():
        try:
            min_val = float(form_data[f'{key}-min_val'])
            max_val = float(form_data[f'{key}-max_val'])
            
            metric_thresholds[key] = {
                "description": form_data[f'{key}-desc'], 
                "min_val": min_val,
                "max_val": max_val,
                "max_disbelief": weight 
            }
        except Exception as e:
            return f"Error processing variable data for {key}: {e}", 400

    output_file_ahp = 'configs/ahp_benchmarks.json'
    with open(output_file_ahp, 'w') as f:
        json.dump(ahp_benchmarks, f, indent=2)
        
    output_file_metrics = 'configs/metric_thresholds.json'
    with open(output_file_metrics, 'w') as f:
        json.dump(metric_thresholds, f, indent=2)
        
    session.clear() 
    
    return render_template(
        'success.html',
        file_ahp=output_file_ahp,
        file_metrics=output_file_metrics,
        content_ahp=json.dumps(ahp_benchmarks, indent=2),
        content_metrics=json.dumps(metric_thresholds, indent=2)
    )

@app.route('/visualize')
def visualize():
    ir_id = request.args.get('id')
    if not ir_id:
        return render_template('notfound.html')

    config = configparser.ConfigParser()
    config.read('config.ini')
    config_dict = {s: dict(config.items(s)) for s in config.sections()}
    
    mongo_service = MongoService(
        uri=config_dict['MONGO']['uri'],
        db_name=config_dict['MONGO']['db_name']
    )
    
    try:
        mongo_query = {}
        mongo_query['irID'] = ir_id

        existing = mongo_service.find(
            config_dict['MONGO']['collection_name'], 
            mongo_query)
        
        if existing:
            return render_template('visualize.html', irID=ir_id)
        else:
            return render_template('notfound.html')
    except Exception:
        return render_template('errorpage.html')

@app.route('/api/results')
def get_results():
    config = configparser.ConfigParser()
    config.read('config.ini')
    config_dict = {s: dict(config.items(s)) for s in config.sections()}
    
    mongo_service = MongoService(
        uri=config_dict['MONGO']['uri'],
        db_name=config_dict['MONGO']['db_name']
    )

    try:
        ir_id = request.args.get('irID')

        mongo_query = {}
        if ir_id:
            mongo_query['irID'] = ir_id

        existing = mongo_service.find(
            config_dict['MONGO']['collection_name'], 
            mongo_query)
        
        if existing:
            result_doc = existing[0]
            
            if '_id' in result_doc:
                del result_doc['_id']
            
            def decompress_field(field_data):
                if isinstance(field_data, bytes):
                    try:
                        decompressed = gzip.decompress(field_data)
                        return json.loads(decompressed.decode('utf-8'))
                    except Exception as e:
                        print(f"Failed to decompress field: {e}")
                        return field_data
                return field_data

            if 'results' in result_doc:
                result_doc['results'] = decompress_field(result_doc['results'])
            
            if 'vulnerabilities' in result_doc:
                result_doc['vulnerabilities'] = decompress_field(result_doc['vulnerabilities'])

            return result_doc
        
    except Exception as e:
        print(f"Error retrieving results: {e}")

    return []

@app.route('/api/callgraph/<path:endpoint_id>')
def get_callgraph(endpoint_id):
    config = configparser.ConfigParser()
    config.read('config.ini')
    config_dict = {s: dict(config.items(s)) for s in config.sections()}

    neo4j_service = Neo4jService(
            uri=config_dict['NEO4J']['uri'],
            user=config_dict['NEO4J']['username'],
            password=config_dict['NEO4J']['password']
        )
    
    cypher_query = """
            MATCH (start:Endpoint {id: $start_id})
            MATCH path = (start)-[:CALLS|CALLS_EXTERNAL|ACCESSES*0..10]->(node)
            UNWIND nodes(path) as n
            UNWIND relationships(path) as r
            RETURN collect(distinct n) as nodes, collect(distinct r) as relationships
            """
    
    with neo4j_service.get_session() as session:
        result = session.run(cypher_query, start_id=endpoint_id)
        record = result.single()

        if not record:
            return json.dumps([])
        
        nodes = []
        for node in record['nodes']:
            nodes.append({
                'identity': node.id,
                'labels': list(node.labels),
                'properties': dict(node),
                'elementId': node.element_id
            })
        
        relationships = []
        for rel in record['relationships']:
            relationships.append({
                'identity': rel.id,
                'start': rel.start_node.id,
                'end': rel.end_node.id,
                'type': rel.type,
                'properties': dict(rel),
                'elementId': rel.element_id,
                'startNodeElementId': rel.start_node.element_id,
                'endNodeElementId': rel.end_node.element_id
            })
        
        response_data = [{
            'nodes': nodes,
            'relationships': relationships
        }]
        
        return json.dumps(response_data)

    return {}

# def load_sonar_data():
#     with open('sonar_results_2.json', 'r') as f:
#         data = json.load(f)
#     return data

def analyze_data(data):
    severity_count = {'MINOR': 0, 'MAJOR': 0, 'CRITICAL': 0, 'BLOCKER': 0}
    impact_count = {'LOW': 0, 'MEDIUM': 0, 'HIGH': 0, 'BLOCKER': 0}
    rule_breakdown = {}
    file_issues = {}
    
    for issue in data['issues']:
        # Count by severity
        severity = issue['severity']
        severity_count[severity] = severity_count.get(severity, 0) + 1
        
        # Count by impact
        if issue['impacts']:
            impact = issue['impacts'][0]['severity']
            impact_count[impact] = impact_count.get(impact, 0) + 1
        
        # Count by rule
        rule = issue['rule']
        if rule not in rule_breakdown:
            rule_breakdown[rule] = {
                'count': 0,
                'severity': severity,
                'message': issue['message']
            }
        rule_breakdown[rule]['count'] += 1
        
        # Count by file
        file_path = issue['component'].split(':')[-1]
        file_name = file_path.split('/')[-1]
        file_issues[file_name] = file_issues.get(file_name, 0) + 1
    
    # Sort files by issue count
    top_files = sorted(file_issues.items(), key=lambda x: x[1], reverse=True)[:10]
    
    return {
        'total': data['total'],
        'effort_hours': round(data['effortTotal'] / 60, 1),
        'severity_count': severity_count,
        'impact_count': impact_count,
        'rule_breakdown': rule_breakdown,
        'top_files': top_files,
        'critical_count': severity_count.get('CRITICAL', 0) + severity_count.get('BLOCKER', 0)
    }

# @app.route('/api/sonardata')
# def get_data():
#     raw_data = load_sonar_data()
#     processed_data = analyze_data(raw_data)
#     return jsonify(processed_data)

# @app.route('/sonar')
# def dashboard():
#     return render_template('sonar.html')

if __name__ == '__main__':
    print("Starting AHP Calibration Tool (Config-Driven)!")
    print("This tool reads 'configs/calibration_config.json' to build the UI.")
    print("It will generate BOTH 'ahp_benchmarks.json' and 'metric_thresholds.json'.")
    print("Open http://127.0.0.1:5600 in your browser.")
    app.run(debug=True, port=5600)