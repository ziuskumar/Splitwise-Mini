import os
import json
import logging
from anthropic import Anthropic

logger = logging.getLogger(__name__)

def call_llm_for_split_parsing(description, split_type, split_details, member_names, total_amount):
    api_key = os.getenv('ANTHROPIC_API_KEY')
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY not found in environment. Fallback to equal split.")
        return None

    # Use model as specified in requirements, defaulting to claude-sonnet-4-6
    model_name = os.getenv('ANTHROPIC_MODEL', 'claude-sonnet-4-6')
    
    client = Anthropic(api_key=api_key)

    prompt = f"""You are a parsing assistant. Your task is to parse unstructured split details for a shared expense.
Expense Description: "{description}"
Split Type: "{split_type}" (can be 'unequal' or 'percentage')
Total Amount: {total_amount}
Available Canonical Member Names: {member_names}
Split Details Text: "{split_details}"

Instructions:
1. Parse the Split Details Text. Understand how the amount or percentage is divided among the members.
2. Resolve any name variants or abbreviations in the text to the exact available canonical member names list.
3. If split_type is 'unequal', identify the absolute share amount for each participating member.
4. If split_type is 'percentage', identify the percentage share (0-100) for each participating member.
5. Identify any members explicitly mentioned as not charged or excluded (e.g. "Aisha not charged" or "Aisha 0") and list them under "excluded_members".
6. If the text does not mention a member, they may be excluded or they might get a default/remaining share. Use your best judgement.
7. Set "confidence" to "high" only if the parsing is clear and unambiguous and all amounts/percentages sum up to the total/100%. Set to "low" otherwise.
8. Output MUST be a strict JSON object with EXACTLY the following structure (no markdown formatting, no code fences, no extra text, just raw JSON):
{{
  "splits": [
    {{
      "member": "canonical_name",
      "amount": float, // only for unequal split type, otherwise omit or null
      "percentage": float // only for percentage split type, otherwise omit or null
    }}
  ],
  "excluded_members": ["canonical_name"],
  "confidence": "high" or "low",
  "notes": "short explanation of how you parsed this"
}}
"""
    try:
        response = client.messages.create(
            model=model_name,
            max_tokens=1000,
            temperature=0,
            system="You are a strict data extraction tool that returns ONLY valid JSON conforming to the requested schema. Never output markdown, code blocks, or explanatory text outside the JSON.",
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        content = response.content[0].text.strip()
        
        # Clean any accidental code block wraps
        if content.startswith("```"):
            lines = content.splitlines()
            if lines[0].startswith("```json") or lines[0].startswith("```"):
                lines = lines[1:-1]
            content = "\n".join(lines).strip()
            
        data = json.loads(content)
        return data
    except Exception as e:
        logger.error(f"Error calling Anthropic API or parsing response: {str(e)}")
        return None
