# src/ahp_calculator.py
import numpy as np
from typing import List, Dict

class AHPCalculator:
    # Calculates priority weights from a pairwise comparison matrix.
    
    def __init__(self, criteria: List[str], matrix: np.ndarray):
        self.criteria = criteria
        self.matrix = matrix
        self.n = len(criteria)
        if matrix.shape != (self.n, self.n):
            raise ValueError("Matrix dimensions must match the number of criteria.")
            
    def calculate_weights(self) -> Dict[str, float]:
        # Calculates the priority weights (eigenvector) using the Normalization of Columns method.
        
        # 1. Normalize the matrix by column sums
        column_sums = self.matrix.sum(axis=0)
        normalized_matrix = self.matrix / column_sums
        
        # 2. Calculate row averages to get the priority weights
        priority_weights = normalized_matrix.mean(axis=1)
        
        # 3. Check for consistency (optional but good practice)
        self.check_consistency(priority_weights)
        
        # Return a dictionary of criteria: weight
        return {self.criteria[i]: priority_weights[i] for i in range(self.n)}

    def check_consistency(self, priority_weights: np.ndarray):
        # Checks the consistency of the judgments.

        # Random Index (RI) for n=1 to 10
        RI = {
            1: 0, 2: 0, 3: 0.58, 4: 0.90, 5: 1.12,
            6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49
        }
        
        # Calculate Eigenvalue (Lambda_max)
        weighted_sum_vector = np.dot(self.matrix, priority_weights)
        lambda_max = np.mean(weighted_sum_vector / priority_weights)
        
        # Calculate Consistency Index (CI)
        ci = (lambda_max - self.n) / (self.n - 1)
        
        # Calculate Consistency Ratio (CR)
        ri_val = RI.get(self.n, 1.49) 
        if ri_val == 0:
            cr = 0 
        else:
            cr = ci / ri_val
            
        print(f"\nAHP Consistency Check")
        print(f"Lambda Max: {lambda_max:.4f}")
        print(f"Consistency Index (CI): {ci:.4f}")
        print(f"Consistency Ratio (CR): {cr:.4f}")
        
        if cr > 0.10:
            print("WARNING: Consistency Ratio is > 0.1. Judgments are inconsistent!")
        else:
            print("Judgments are consistent (CR <= 0.1).")