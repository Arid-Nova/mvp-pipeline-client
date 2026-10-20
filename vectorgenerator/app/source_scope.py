"""Observed extraction languages. Language metadata never implies policy support."""
from typing import Any


def source_languages(ir: Any) -> set[str]:
    if not isinstance(ir, dict):
        return set()
    languages: set[str] = set()
    aliases = {'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript', 'c#': 'csharp'}
    def add(value):
        if isinstance(value, str) and value.lower() not in ('', 'auto', 'polyglot'):
            languages.add(aliases.get(value.lower(), value.lower()))
    metadata = ir.get('metadata') or {}
    for value in metadata.get('languages') or []:
        add(value)
    add(metadata.get('language'))
    if ir.get('javascriptExtraction') is not None:
        add('javascript')
    def add_module(module, context):
        explicit = (module.get('metadata') or {}).get('language')
        if explicit:
            add(explicit)
            return
        filename = str(module.get('filePath') or module.get('fileName') or module.get('path') or '').lower()
        extension = filename.rsplit('.', 1)[-1] if '.' in filename else ''
        extensions = {'java': 'java', 'py': 'python', 'go': 'go', 'cs': 'csharp', 'js': 'javascript', 'jsx': 'javascript', 'mjs': 'javascript', 'cjs': 'javascript', 'ts': 'typescript', 'tsx': 'typescript'}
        if extension in extensions:
            add(extensions[extension])
        elif module.get('type') == 'JSModule':
            add('javascript')
        elif module.get('type') == 'JClass' and not any(str(value or '').lower() not in ('java', 'auto', 'polyglot', '') for value in context):
            add('java')
    context = list(metadata.get('languages') or []) + [metadata.get('language')]
    for module in ir.get('orphans') or []:
        add_module(module, context)
    for service in ir.get('microservices') or []:
        service_metadata = service.get('metadata') or {}
        service_context = context + list(service_metadata.get('languages') or []) + [service_metadata.get('language')]
        for value in service_context:
            add(value)
        for key in ('controllers', 'services', 'repositories', 'entities', 'unknowns', 'feignClients'):
            for module in service.get(key) or []:
                add_module(module, service_context)
    return languages
