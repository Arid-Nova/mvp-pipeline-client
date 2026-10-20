"""Supported source scope for the current Java-based Aegis implementation."""
from typing import Any, Dict, Optional
from .source_scope import source_languages


def unsupported_source_analysis(ir_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    languages = source_languages(ir_data)
    if languages - {'java', 'javascript', 'typescript'}:
        return {'status': 'unsupported', 'capability': 'source-security-analysis', 'findings': [],
                'reason': 'Security analysis is unsupported for these extracted languages. No Java source analysis, graph replacement or model call was performed.',
                'languages': sorted(languages)}
    javascript = bool(languages & {'javascript', 'typescript'}) or 'javascriptExtraction' in ir_data
    metadata = ir_data.get('metadata') or {}
    javascript = javascript or metadata.get('extractor') == 'cimet-javascript'
    modules = list(ir_data.get('orphans') or [])
    for service in ir_data.get('microservices') or []:
        for collection in ('controllers', 'services', 'repositories', 'entities', 'unknowns', 'feignClients'):
            modules.extend(service.get(collection) or [])
    for module in modules:
        module_metadata = module.get('metadata') or {}
        language = module_metadata.get('language', '')
        if (module.get('type') == 'JSModule'
                or isinstance(language, str) and language.lower() in ('javascript', 'typescript', 'jsx', 'tsx')):
            javascript = True
    if not javascript:
        return None
    return {
        'status': 'unsupported',
        'capability': 'source-security-analysis',
        'reason': ('JavaScript/TypeScript source requires versioned saved Express '
                   'security evidence. The Java source/model analyzer cannot be '
                   'applied to this input. No graph replacement, '
                   'source clone, source analysis or model call was performed.'),
        'findings': [],
    }
