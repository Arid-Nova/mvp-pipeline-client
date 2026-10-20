"""Respect extraction capability metadata before deriving authorization vectors."""
from typing import Any, Optional
from ..source_scope import source_languages


def unsupported_authorization_reason(*documents: Any) -> Optional[str]:
    for document in documents:
        if not isinstance(document, dict):
            continue
        languages = source_languages(document)
        if languages - {'java'}:
            return 'The Java authorization-vector generator does not support this extracted language scope. Use the explicit JavaScript source-policy route when applicable.'
        metadata = document.get('metadata') or {}
        capability_sets = [document.get('analysisCapabilities'),
                           metadata.get('analysisCapabilities') if isinstance(metadata, dict) else None,
                           metadata.get('capabilities') if isinstance(metadata, dict) else None]
        for capabilities in capability_sets:
            if not isinstance(capabilities, dict):
                continue
            if capabilities.get('authorization') == 'unsupported' or capabilities.get('authorizationPolicy') == 'unsupported':
                return ('Authorization policy extraction is unsupported for this input. '
                        'No authorization vectors were generated; unknown policies '
                        'must not be replaced by public access or default roles.')
    return None
