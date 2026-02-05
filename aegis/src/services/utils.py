import re

def extract_method_body(code: str, start_brace_index: int) -> str:
    if start_brace_index < 0 or code[start_brace_index] != '{':
        return ""
        
    brace_balance = 1 
    end_index = -1
    
    # Iterate from the character after the initial '{'
    for i in range(start_brace_index + 1, len(code)):
        char = code[i]
        if char == '{':
            brace_balance += 1
        elif char == '}':
            brace_balance -= 1

        if brace_balance == 0:
            end_index = i
            break
            
    if end_index == -1:
        return "" 

    return strip_comments_and_strings(code[start_brace_index + 1: end_index])

def strip_comments_and_strings(java_code: str) -> str:
    # One of the problems is having control keywords in comments and else where as well.
    # Hence, this cleans the code of comments and other noise.
   
   # Removes single-line comments
    code_no_single_comments = re.sub(r'//.*$', '', java_code, flags=re.MULTILINE)

    # Removes multi-line comments (non-greedy)
    code_no_comments = re.sub(r'/\*.*?\*/', '', code_no_single_comments, flags=re.DOTALL)

    # Removes string literals (handles escaped quotes)
    code_no_strings = re.sub(r'"(?:\\.|[^"\\])*"', '', code_no_comments)

    # Removes character literals (handles escaped chars)
    code_clean = re.sub(r"'(?:\\.|[^'\\])*'", '', code_no_strings)

    return code_clean