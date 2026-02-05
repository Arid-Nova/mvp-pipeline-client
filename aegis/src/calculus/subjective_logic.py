from ..domain.models import Opinion
from typing import List
from functools import reduce

def fuse_two_opinions(op1: Opinion, op2: Opinion) -> Opinion:
    #Fuses two Subjective Logic opinions using the cumulative fusion operator.

    # Denominator
    denominator = op1.uncertainty + op2.uncertainty - (op1.uncertainty * op2.uncertainty)
    
    # Handle division by zero (when both opinions are dogmatic and u=0)
    if denominator == 0:
        # This case implies full certainty. We can't fuse.
        # A common approach is to pick the "strongest" opinion.
        # For simplicity, we'll just return the first one.
        # A more robust system might use a different operator (e.g., averaging).
        if op1.uncertainty == 0 and op2.uncertainty == 0:
             return op1 # or raise an error
        
        # Handle cases where one is dogmatic (u=0)
        # This is the "belief constraint"
        if op1.uncertainty == 0:
            return op1
        if op2.uncertainty == 0:
            return op2

    belief = ((op1.belief * op2.uncertainty) + (op2.belief * op1.uncertainty)) / denominator
    disbelief = ((op1.disbelief * op2.uncertainty) + (op2.disbelief * op1.uncertainty)) / denominator
    uncertainty = (op1.uncertainty * op2.uncertainty) / denominator

    # Normalize to ensure sum is exactly 1 (handles floating point drift)
    total = belief + disbelief + uncertainty
    return Opinion(belief / total, disbelief / total, uncertainty / total)

def fuse_opinions_list(opinions: List[Opinion]) -> Opinion:
    # Fuses a list of opinions into a single opinion.

    if not opinions:
        # Return a "vacuous" opinion (pure uncertainty)
        return Opinion(belief=0.0, disbelief=0.0, uncertainty=1.0)
        
    # Start with the vacuous opinion as the identity element for fusion
    identity_opinion = Opinion(belief=0.0, disbelief=0.0, uncertainty=1.0)
    
    # Use functools.reduce to cumulatively apply the fusion operator
    return reduce(fuse_two_opinions, opinions, identity_opinion)