import json
from pathlib import Path
from typing import Dict, Any, Optional

class ConfigLoader:
    _instance = None
    
    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(ConfigLoader, cls).__new__(cls, *args, **kwargs)
        return cls._instance

    def __init__(self, config_dir: Path = Path("configs")):
        if not hasattr(self, 'initialized'): 
            self.config_dir = config_dir
            try:
                self.ahp_benchmarks = self._load_json(config_dir / "ahp_benchmarks.json")
                self.metric_thresholds = self._load_json(config_dir / "metric_thresholds.json")
                self.initialized = True
            except FileNotFoundError as e:
                print(f"CRITICAL ERROR: Configuration file not found. {e}")
                exit(1)

    def _load_json(self, file_path: Path) -> Dict[str, Any]:
        with open(file_path, 'r') as f:
            return json.load(f)

    def get_ahp_opinion(self, finding_key: str) -> Optional[Dict[str, Any]]:
        return self.ahp_benchmarks.get(finding_key, {}).get("opinion")

    def get_metric_thresholds(self, metric_key: str) -> Dict[str, Any]:
        return self.metric_thresholds.get(metric_key, {})