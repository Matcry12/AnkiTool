#!/usr/bin/env python3
import json
import requests
import os
import sys
from typing import List, Dict, Optional, Union
from enum import Enum

# Load .env file manually if dotenv is not available
def load_env_file():
    # Get the directory where this script is located
    script_dir = os.path.dirname(os.path.abspath(sys.argv[0])) if sys.argv else os.getcwd()
    env_path = os.path.join(script_dir, '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip()
                    # Remove quotes if present
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]
                    # Only set if not already in environment
                    if key not in os.environ:
                        os.environ[key] = value

# Try to load .env file using dotenv or fallback to manual loading
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    load_env_file()

class LLMProvider(Enum):
    OPENAI = "openai"
    GEMINI = "gemini"
    CUSTOM = "custom"

class AnkiConnectClient:
    def __init__(self, host: str = "192.168.100.17", port: int = 8765):
        self.url = f"http://{host}:{port}"
        self.version = 6
    
    def _invoke(self, action: str, params: Optional[Dict] = None) -> Union[Dict, List, int, None]:
        payload = {
            "action": action,
            "version": self.version
        }
        if params:
            payload["params"] = params
        
        response = requests.post(self.url, json=payload)
        response.raise_for_status()
        
        result = response.json()
        if result.get("error"):
            raise Exception(f"AnkiConnect error: {result['error']}")
        
        return result.get("result")
    
    def get_deck_names(self) -> List[str]:
        return self._invoke("deckNames")
    
    def create_deck(self, deck_name: str) -> int:
        return self._invoke("createDeck", {"deck": deck_name})
    
    def get_model_field_names(self, model_name: str) -> List[str]:
        return self._invoke("modelFieldNames", {"modelName": model_name})
    
    def get_model_names(self) -> List[str]:
        return self._invoke("modelNames")
    
    def can_add_notes(self, notes: List[Dict]) -> List[bool]:
        return self._invoke("canAddNotes", {"notes": notes})
    
    def add_notes(self, notes: List[Dict]) -> List[Optional[int]]:
        return self._invoke("addNotes", {"notes": notes})
    
    def find_notes(self, query: str) -> List[int]:
        return self._invoke("findNotes", {"query": query})
    
    def notes_info(self, notes: List[int]) -> List[Dict]:
        return self._invoke("notesInfo", {"notes": notes})

class LLMClient:
    def __init__(self, provider: LLMProvider = LLMProvider.GEMINI, api_key: str = None, 
                 model: str = None, api_base: str = None):
        self.provider = provider
        
        if provider == LLMProvider.OPENAI:
            self.api_key = api_key or os.getenv("OPENAI_API_KEY")
            self.model = model or "gpt-3.5-turbo"
            self.api_base = api_base or "https://api.openai.com/v1"
            if not self.api_key:
                raise ValueError("OpenAI API key not found. Set OPENAI_API_KEY environment variable.")
        
        elif provider == LLMProvider.GEMINI:
            self.api_key = api_key or os.getenv("GEMINI_API_KEY")
            self.model = model or "gemini-2.5-flash-lite"
            if not self.api_key:
                raise ValueError("Gemini API key not found. Set GEMINI_API_KEY environment variable.")
        
        elif provider == LLMProvider.CUSTOM:
            self.api_key = api_key or os.getenv("CUSTOM_API_KEY", "dummy-key")
            self.model = model or os.getenv("CUSTOM_MODEL", "llama2")
            self.api_base = api_base or os.getenv("CUSTOM_ENDPOINT", "http://localhost:11434/v1")
    
    def generate_note(self, word: str, model_name: str, fields: List[str], 
                     language: str, instructions: str = None, 
                     additional_context: str = None) -> Dict[str, str]:
        """Generate note fields using LLM"""
        
        # Build prompt
        prompt = f"""Generate flashcard content for the word/phrase: "{word}"
Target language: {language}
Anki Model: {model_name}
Required fields: {', '.join(fields)}

CRITICAL: ALL content (meanings, definitions, examples, explanations) MUST be written in {language.upper()}.
Do NOT mix languages. If the word is in English but target language is Vietnamese, write meanings in Vietnamese.

"""
        if instructions:
            prompt += f"Model-specific instructions: {instructions}\n\n"
        
        if additional_context:
            prompt += f"Additional context: {additional_context}\n\n"
        
        # Add field-specific guidance
        if "Front" in fields and "Back" in fields:
            prompt += "For Basic cards, Front should contain the question/prompt, Back should contain the answer.\n"
        elif "Text" in fields:
            prompt += "For Cloze cards, use {{c1::text}} format to mark deletions. You can use multiple cloze deletions like {{c1::first}}, {{c2::second}}.\n"
        
        prompt += "\nReturn ONLY a JSON object with the field names as keys and content as values. No additional text or markdown formatting."
        
        if self.provider == LLMProvider.OPENAI:
            result = self._generate_openai(prompt)
        elif self.provider == LLMProvider.GEMINI:
            result = self._generate_gemini(prompt)
        elif self.provider == LLMProvider.CUSTOM:
            result = self._generate_custom(prompt)
        
        # Validate output for THPTQG form
        if model_name == "THPTQG form" and "suggest" in result:
            # Ensure the Word field matches input
            if "Word" in result and result["Word"] != word:
                result["Word"] = word
            
            # Validate suggest pattern
            if "suggest" in result:
                pattern = result["suggest"]
                # Check if pattern length matches word length
                if len(pattern.replace(" ", "")) != len(word):
                    # Generate a simple pattern: keep first and last letter
                    if len(word) > 2:
                        middle_underscores = "_" * (len(word) - 2)
                        result["suggest"] = word[0] + middle_underscores + word[-1]
                    else:
                        result["suggest"] = word
        
        return result
    
    def _generate_openai(self, prompt: str) -> Dict[str, str]:
        try:
            import openai
            openai.api_key = self.api_key
            openai.api_base = self.api_base
        except ImportError:
            raise ImportError("Please install openai: pip install openai")
        
        response = openai.ChatCompletion.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant that creates educational flashcards. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=500
        )
        
        content = response.choices[0].message.content.strip()
        return self._parse_json_response(content)
    
    def _generate_gemini(self, prompt: str) -> Dict[str, str]:
        try:
            import google.generativeai as genai
        except ImportError:
            raise ImportError("Please install google-generativeai: pip install google-generativeai")
        
        genai.configure(api_key=self.api_key)
        model = genai.GenerativeModel(self.model)
        
        response = model.generate_content(prompt)
        content = response.text.strip()
        return self._parse_json_response(content)
    
    def _generate_custom(self, prompt: str) -> Dict[str, str]:
        """Generate using custom OpenAI-compatible endpoint"""
        try:
            import requests
        except ImportError:
            raise ImportError("requests library is required for custom LLM endpoints")
        
        headers = {
            "Content-Type": "application/json"
        }
        
        if self.api_key and self.api_key != "dummy-key":
            headers["Authorization"] = f"Bearer {self.api_key}"
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are a helpful assistant that creates educational flashcards. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7,
            "max_tokens": 500
        }
        
        try:
            response = requests.post(
                f"{self.api_base}/chat/completions",
                headers=headers,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            
            data = response.json()
            content = data['choices'][0]['message']['content'].strip()
            return self._parse_json_response(content)
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"Custom LLM request failed: {e}")
    
    def _parse_json_response(self, content: str) -> Dict[str, str]:
        # Remove markdown code blocks if present
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        if content.endswith("```"):
            content = content.rsplit("```", 1)[0]
        
        return json.loads(content.strip())

def load_config():
    """Load configuration from file if exists"""
    config_file = "anki_config.json"
    default_config = {
        "llm_provider": "gemini",
        "llm_model": "gemini-2.0-flash-exp",
        "anki_host": "192.168.100.17",
        "anki_port": 8765,
        "default_tags": [],
        "batch_mode": False,
        "auto_add": False
    }
    
    if os.path.exists(config_file):
        with open(config_file, 'r') as f:
            loaded_config = json.load(f)
            default_config.update(loaded_config)
    
    return default_config

def save_config(config):
    """Save configuration to file"""
    with open("anki_config.json", 'w') as f:
        json.dump(config, f, indent=2)

def load_model_instructions():
    """Load model instructions from file if exists"""
    instructions_file = "model_instructions.json"
    if os.path.exists(instructions_file):
        with open(instructions_file, 'r') as f:
            return json.load(f)
    return {}

def save_model_instructions(instructions):
    """Save model instructions to file"""
    with open("model_instructions.json", 'w') as f:
        json.dump(instructions, f, indent=2)

def batch_import_from_file(client: AnkiConnectClient, llm_client: LLMClient, 
                          filename: str, deck_name: str, model_name: str, 
                          language: str, model_instructions: Dict):
    """Import words from a file (one per line)"""
    if not os.path.exists(filename):
        print(f"Error: File '{filename}' not found")
        return
    
    with open(filename, 'r', encoding='utf-8') as f:
        words = [line.strip() for line in f if line.strip()]
    
    if not words:
        print("No words found in file")
        return
    
    print(f"Found {len(words)} words to process")
    
    # Get model fields
    try:
        field_names = client.get_model_field_names(model_name)
    except:
        print(f"Error: Model '{model_name}' not found!")
        return
    
    successful = 0
    failed = 0
    
    for i, word in enumerate(words, 1):
        print(f"\nProcessing {i}/{len(words)}: {word}")
        try:
            # Generate fields
            fields = llm_client.generate_note(
                word, model_name, field_names, language,
                model_instructions.get(model_name)
            )
            
            # Create note
            note = {
                "deckName": deck_name,
                "modelName": model_name,
                "fields": fields,
                "tags": [language.lower(), "llm-generated", "batch-import"]
            }
            
            # Add note
            note_id = client.add_notes([note])[0]
            if note_id:
                successful += 1
                print(f"✓ Added: {word}")
            else:
                failed += 1
                print(f"✗ Failed: {word}")
        
        except Exception as e:
            failed += 1
            print(f"✗ Error processing '{word}': {e}")
    
    print(f"\nBatch import complete: {successful} successful, {failed} failed")

def main():
    config = load_config()
    
    # Initialize Anki client
    try:
        client = AnkiConnectClient(host=config["anki_host"], port=config["anki_port"])
        # Test connection
        client.get_deck_names()
    except Exception as e:
        print(f"Error connecting to AnkiConnect: {e}")
        print("Please ensure Anki is running with AnkiConnect addon installed")
        sys.exit(1)
    
    model_instructions = load_model_instructions()
    
    # Check if LLM is available
    llm_available = False
    llm_client = None
    
    provider_str = config["llm_provider"].lower()
    if provider_str == "openai" and os.getenv("OPENAI_API_KEY"):
        try:
            llm_client = LLMClient(LLMProvider.OPENAI, model=config.get("llm_model"))
            llm_available = True
        except Exception as e:
            print(f"OpenAI not available: {e}")
    elif provider_str == "gemini" and os.getenv("GEMINI_API_KEY"):
        try:
            llm_client = LLMClient(LLMProvider.GEMINI, model=config.get("llm_model"))
            llm_available = True
        except Exception as e:
            print(f"Gemini not available: {e}")
    
    if not llm_available:
        print(f"\n⚠️  LLM not configured. Set {config['llm_provider'].upper()}_API_KEY environment variable for AI features.")
    
    while True:
        print("\n=== AnkiConnect Interactive Tool ===")
        print("1. List all decks")
        print("2. Create new deck")
        print("3. List all models")
        print("4. Get model field names")
        print("5. Search notes")
        print("6. Check if notes can be added")
        print("7. Add notes (manual)")
        
        if llm_available:
            print("8. Add notes with LLM assistance")
            print("9. Batch import from file")
            print("10. Configure model instructions")
            print("11. Configuration settings")
            print("12. Exit")
        else:
            print("8. Configuration settings")
            print("9. Exit")
        
        choice = input("\nSelect option: ")
        
        try:
            if choice == "1":
                decks = client.get_deck_names()
                print(f"\nFound {len(decks)} decks:")
                for deck in sorted(decks):
                    print(f"  - {deck}")
            
            elif choice == "2":
                deck_name = input("Enter new deck name: ")
                deck_id = client.create_deck(deck_name)
                print(f"Deck created with ID: {deck_id}")
            
            elif choice == "3":
                models = client.get_model_names()
                print(f"\nFound {len(models)} models:")
                for model in sorted(models):
                    print(f"  - {model}")
            
            elif choice == "4":
                models = client.get_model_names()
                print("\nAvailable models:")
                for i, model in enumerate(sorted(models), 1):
                    print(f"  {i}. {model}")
                
                model_choice = input("\nSelect model number (or type model name): ")
                if model_choice.isdigit() and 1 <= int(model_choice) <= len(models):
                    model_name = sorted(models)[int(model_choice) - 1]
                else:
                    model_name = model_choice
                
                try:
                    fields = client.get_model_field_names(model_name)
                    print(f"\nFields for {model_name}:")
                    for field in fields:
                        print(f"  - {field}")
                except:
                    print(f"Error: Model '{model_name}' not found!")
            
            elif choice == "5":
                query = input("Enter search query (e.g., 'deck:Default', 'tag:japanese'): ")
                note_ids = client.find_notes(query)
                print(f"\nFound {len(note_ids)} notes")
                
                if note_ids and len(note_ids) <= 10:
                    show = input("Show note details? (y/n): ")
                    if show.lower() == 'y':
                        notes = client.notes_info(note_ids)
                        for note in notes:
                            print(f"\nNote ID: {note['noteId']}")
                            print(f"Model: {note['modelName']}")
                            print(f"Tags: {', '.join(note['tags'])}")
                            print("Fields:")
                            for field, value in note['fields'].items():
                                print(f"  {field}: {value['value'][:50]}...")
            
            elif choice == "6":
                print("\nChecking if notes can be added...")
                
                # Get available decks
                decks = client.get_deck_names()
                print("\nAvailable decks:")
                for i, deck in enumerate(sorted(decks), 1):
                    print(f"  {i}. {deck}")
                
                deck_choice = input("\nSelect deck number (or type deck name): ")
                if deck_choice.isdigit() and 1 <= int(deck_choice) <= len(decks):
                    deck_name = sorted(decks)[int(deck_choice) - 1]
                else:
                    deck_name = deck_choice
                    if deck_name not in decks:
                        print(f"Warning: Deck '{deck_name}' not found!")
                        continue
                
                # Get model
                models = client.get_model_names()
                print("\nAvailable models:")
                for i, model in enumerate(sorted(models), 1):
                    print(f"  {i}. {model}")
                
                model_choice = input("\nSelect model number (or type model name): ")
                if model_choice.isdigit() and 1 <= int(model_choice) <= len(models):
                    model_name = sorted(models)[int(model_choice) - 1]
                else:
                    model_name = model_choice
                
                # Get fields for the model
                try:
                    field_names = client.get_model_field_names(model_name)
                    print(f"\nFields for {model_name}: {field_names}")
                except:
                    print(f"Error: Model '{model_name}' not found!")
                    continue
                
                notes = []
                while True:
                    print(f"\nNote {len(notes) + 1}:")
                    fields = {}
                    
                    # Get values for each field
                    for field in field_names:
                        value = input(f"{field}: ")
                        if not value and field == field_names[0]:  # First field is required
                            break
                        if value:
                            fields[field] = value
                    
                    if not fields:
                        break
                    
                    tags_input = input("Tags (comma separated, optional): ")
                    tags = [t.strip() for t in tags_input.split(",")] if tags_input else []
                    tags.extend(config.get("default_tags", []))
                    
                    note = {
                        "deckName": deck_name,
                        "modelName": model_name,
                        "fields": fields,
                        "tags": tags
                    }
                    notes.append(note)
                    
                    more = input("\nAdd another note? (y/n): ")
                    if more.lower() != 'y':
                        break
                
                if notes:
                    results = client.can_add_notes(notes)
                    print("\nResults:")
                    for i, can_add in enumerate(results):
                        print(f"  Note {i+1}: {'Can be added' if can_add else 'Cannot be added (duplicate?)'}")
            
            elif choice == "7":
                print("\nAdding notes manually...")
                
                # Get available decks
                decks = client.get_deck_names()
                print("\nAvailable decks:")
                for i, deck in enumerate(sorted(decks), 1):
                    print(f"  {i}. {deck}")
                
                deck_choice = input("\nSelect deck number (or type deck name): ")
                if deck_choice.isdigit() and 1 <= int(deck_choice) <= len(decks):
                    deck_name = sorted(decks)[int(deck_choice) - 1]
                else:
                    deck_name = deck_choice
                    if deck_name not in decks:
                        print(f"Warning: Deck '{deck_name}' not found!")
                        create = input("Create new deck? (y/n): ")
                        if create.lower() == 'y':
                            client.create_deck(deck_name)
                            print(f"Created deck: {deck_name}")
                        else:
                            continue
                
                # Get model
                models = client.get_model_names()
                print("\nAvailable models:")
                for i, model in enumerate(sorted(models), 1):
                    print(f"  {i}. {model}")
                
                model_choice = input("\nSelect model number (or type model name): ")
                if model_choice.isdigit() and 1 <= int(model_choice) <= len(models):
                    model_name = sorted(models)[int(model_choice) - 1]
                else:
                    model_name = model_choice
                
                # Get fields for the model
                try:
                    field_names = client.get_model_field_names(model_name)
                    print(f"\nFields for {model_name}: {field_names}")
                except:
                    print(f"Error: Model '{model_name}' not found!")
                    continue
                
                notes = []
                while True:
                    print(f"\nNote {len(notes) + 1}:")
                    fields = {}
                    
                    # Get values for each field
                    for field in field_names:
                        if "cloze" in model_name.lower() and field == "Text":
                            print("(Use {{c1::text}} format for cloze deletions)")
                        value = input(f"{field}: ")
                        if not value and field == field_names[0]:  # First field is required
                            break
                        if value:
                            fields[field] = value
                    
                    if not fields:
                        break
                    
                    tags_input = input("Tags (comma separated, optional): ")
                    tags = [t.strip() for t in tags_input.split(",")] if tags_input else []
                    tags.extend(config.get("default_tags", []))
                    
                    allow_dup = input("Allow duplicate? (y/n, default n): ")
                    
                    note = {
                        "deckName": deck_name,
                        "modelName": model_name,
                        "fields": fields,
                        "tags": tags
                    }
                    
                    if allow_dup.lower() == 'y':
                        note["options"] = {"allowDuplicate": True}
                    
                    notes.append(note)
                    
                    more = input("\nAdd another note? (y/n): ")
                    if more.lower() != 'y':
                        break
                
                if notes:
                    note_ids = client.add_notes(notes)
                    print("\nResults:")
                    for i, note_id in enumerate(note_ids):
                        if note_id:
                            print(f"  Note {i+1}: Added with ID {note_id}")
                        else:
                            print(f"  Note {i+1}: Failed to add")
            
            elif choice == "8" and llm_available:
                print("\nAdding notes with LLM assistance...")
                print(f"Using {llm_client.provider.value} ({llm_client.model})")
                
                # Get available decks
                decks = client.get_deck_names()
                print("\nAvailable decks:")
                for i, deck in enumerate(sorted(decks), 1):
                    print(f"  {i}. {deck}")
                
                deck_choice = input("\nSelect deck number (or type deck name): ")
                if deck_choice.isdigit() and 1 <= int(deck_choice) <= len(decks):
                    deck_name = sorted(decks)[int(deck_choice) - 1]
                else:
                    deck_name = deck_choice
                    if deck_name not in decks:
                        print(f"Warning: Deck '{deck_name}' not found!")
                        create = input("Create new deck? (y/n): ")
                        if create.lower() == 'y':
                            client.create_deck(deck_name)
                            print(f"Created deck: {deck_name}")
                        else:
                            continue
                
                # Get model
                models = client.get_model_names()
                print("\nAvailable models:")
                for i, model in enumerate(sorted(models), 1):
                    print(f"  {i}. {model}")
                
                model_choice = input("\nSelect model number (or type model name): ")
                if model_choice.isdigit() and 1 <= int(model_choice) <= len(models):
                    model_name = sorted(models)[int(model_choice) - 1]
                else:
                    model_name = model_choice
                
                # Get fields for the model
                try:
                    field_names = client.get_model_field_names(model_name)
                    print(f"\nFields for {model_name}: {field_names}")
                except:
                    print(f"Error: Model '{model_name}' not found!")
                    continue
                
                # Show/set instructions for this model
                if model_name in model_instructions:
                    print(f"\nCurrent instructions for {model_name}:")
                    print(f"  {model_instructions[model_name]}")
                    update = input("Update instructions? (y/n): ")
                    if update.lower() == 'y':
                        instructions = input("Enter new instructions: ")
                        model_instructions[model_name] = instructions
                        save_model_instructions(model_instructions)
                else:
                    print(f"\nNo instructions set for {model_name}.")
                    instructions = input("Enter instructions for this model (or press Enter to skip): ")
                    if instructions:
                        model_instructions[model_name] = instructions
                        save_model_instructions(model_instructions)
                
                # Get language
                language = input("\nTarget language (e.g., English, Spanish, Japanese): ")
                
                # Get additional context
                context = input("Additional context (e.g., difficulty level, topic) (optional): ")
                
                # Get default tags
                default_tags_input = input("Default tags for all cards (comma separated, optional): ")
                default_tags = [t.strip() for t in default_tags_input.split(",")] if default_tags_input else []
                default_tags.extend(config.get("default_tags", []))
                
                # Auto-add mode
                auto_add = input("Auto-add cards without confirmation? (y/n): ").lower() == 'y'
                
                # Generate notes
                print("\nEnter words/phrases to create cards (empty line to finish):")
                added_count = 0
                
                while True:
                    word = input("\nWord/phrase: ")
                    if not word:
                        break
                    
                    try:
                        # Generate fields using LLM
                        print("Generating card...")
                        fields = llm_client.generate_note(
                            word, 
                            model_name, 
                            field_names, 
                            language,
                            model_instructions.get(model_name),
                            context
                        )
                        
                        # Show generated content
                        print("\nGenerated content:")
                        for field, value in fields.items():
                            print(f"  {field}: {value}")
                        
                        # Create note
                        note = {
                            "deckName": deck_name,
                            "modelName": model_name,
                            "fields": fields,
                            "tags": [language.lower(), "llm-generated"] + default_tags
                        }
                        
                        # Check if can add
                        can_add = client.can_add_notes([note])[0]
                        
                        if auto_add and can_add:
                            # Auto-add mode
                            note_id = client.add_notes([note])[0]
                            if note_id:
                                added_count += 1
                                print(f"✓ Auto-added with ID: {note_id}")
                            else:
                                print("✗ Failed to add note")
                        elif can_add:
                            print("✓ This note can be added.")
                            confirm = input("Add this note? (y/n/e to edit): ")
                            if confirm.lower() == 'y':
                                note_id = client.add_notes([note])[0]
                                if note_id:
                                    added_count += 1
                                    print(f"✓ Note added with ID: {note_id}")
                                else:
                                    print("✗ Failed to add note")
                            elif confirm.lower() == 'e':
                                # Edit fields
                                for field in field_names:
                                    current = fields.get(field, "")
                                    print(f"\nCurrent {field}: {current}")
                                    new_value = input(f"New {field} (press Enter to keep current): ")
                                    if new_value:
                                        fields[field] = new_value
                                
                                note["fields"] = fields
                                note_id = client.add_notes([note])[0]
                                if note_id:
                                    added_count += 1
                                    print(f"✓ Note added with ID: {note_id}")
                                else:
                                    print("✗ Failed to add note")
                        else:
                            print("✗ Cannot add this note (duplicate?)")
                            allow_dup = input("Try adding as duplicate? (y/n): ")
                            if allow_dup.lower() == 'y':
                                note["options"] = {"allowDuplicate": True}
                                note_id = client.add_notes([note])[0]
                                if note_id:
                                    added_count += 1
                                    print(f"✓ Note added with ID: {note_id}")
                                else:
                                    print("✗ Failed to add note")
                    
                    except Exception as e:
                        print(f"Error generating note: {e}")
                
                print(f"\nTotal cards added: {added_count}")
            
            elif choice == "9" and llm_available:
                print("\nBatch import from file...")
                print(f"Using {llm_client.provider.value} ({llm_client.model})")
                
                filename = input("Enter filename (one word/phrase per line): ")
                
                # Get deck
                decks = client.get_deck_names()
                print("\nAvailable decks:")
                for i, deck in enumerate(sorted(decks), 1):
                    print(f"  {i}. {deck}")
                
                deck_choice = input("\nSelect deck number (or type deck name): ")
                if deck_choice.isdigit() and 1 <= int(deck_choice) <= len(decks):
                    deck_name = sorted(decks)[int(deck_choice) - 1]
                else:
                    deck_name = deck_choice
                
                # Get model
                models = client.get_model_names()
                print("\nAvailable models:")
                for i, model in enumerate(sorted(models), 1):
                    print(f"  {i}. {model}")
                
                model_choice = input("\nSelect model number (or type model name): ")
                if model_choice.isdigit() and 1 <= int(model_choice) <= len(models):
                    model_name = sorted(models)[int(model_choice) - 1]
                else:
                    model_name = model_choice
                
                language = input("\nTarget language: ")
                
                batch_import_from_file(client, llm_client, filename, deck_name, 
                                     model_name, language, model_instructions)
            
            elif choice == "10" and llm_available:
                print("\nModel Instructions Configuration")
                print("Current instructions:")
                if model_instructions:
                    for model, instruction in model_instructions.items():
                        print(f"\n{model}:")
                        print(f"  {instruction}")
                else:
                    print("  No instructions configured yet.")
                
                print("\nOptions:")
                print("1. Add/update instructions for a model")
                print("2. Remove instructions for a model")
                print("3. View example instructions")
                print("4. Back to main menu")
                
                sub_choice = input("\nSelect option: ")
                if sub_choice == "1":
                    models = client.get_model_names()
                    print("\nAvailable models:")
                    for i, model in enumerate(sorted(models), 1):
                        print(f"  {i}. {model}")
                    
                    model_choice = input("\nSelect model number (or type model name): ")
                    if model_choice.isdigit() and 1 <= int(model_choice) <= len(models):
                        model_name = sorted(models)[int(model_choice) - 1]
                    else:
                        model_name = model_choice
                    
                    instructions = input("Enter instructions: ")
                    model_instructions[model_name] = instructions
                    save_model_instructions(model_instructions)
                    print("Instructions saved.")
                
                elif sub_choice == "2":
                    model_name = input("Model name to remove: ")
                    if model_name in model_instructions:
                        del model_instructions[model_name]
                        save_model_instructions(model_instructions)
                        print("Instructions removed.")
                    else:
                        print("Model not found.")
                
                elif sub_choice == "3":
                    print("\nExample instructions:")
                    print("\nFor vocabulary cards:")
                    print("  'Include example sentence, pronunciation, and part of speech'")
                    print("\nFor cloze cards:")
                    print("  'Create 2-3 cloze deletions focusing on key concepts'")
                    print("\nFor language learning:")
                    print("  'Include native pronunciation, literal translation, and usage context'")
            
            elif (choice == "11" and llm_available) or (choice == "8" and not llm_available):
                print("\nConfiguration Settings")
                print(f"Current configuration:")
                print(f"  LLM Provider: {config['llm_provider']}")
                print(f"  LLM Model: {config['llm_model']}")
                print(f"  Anki Host: {config['anki_host']}")
                print(f"  Anki Port: {config['anki_port']}")
                print(f"  Default Tags: {', '.join(config['default_tags'])}")
                
                print("\nOptions:")
                print("1. Change LLM provider")
                print("2. Change LLM model")
                print("3. Change Anki connection")
                print("4. Set default tags")
                print("5. Back to main menu")
                
                sub_choice = input("\nSelect option: ")
                if sub_choice == "1":
                    print("\nAvailable providers:")
                    print("1. Gemini (default)")
                    print("2. OpenAI")
                    provider_choice = input("Select provider: ")
                    if provider_choice == "1":
                        config["llm_provider"] = "gemini"
                        config["llm_model"] = "gemini-2.0-flash-exp"
                    elif provider_choice == "2":
                        config["llm_provider"] = "openai"
                        config["llm_model"] = "gpt-3.5-turbo"
                    save_config(config)
                    print("Provider updated. Restart to apply changes.")
                
                elif sub_choice == "2":
                    new_model = input(f"Enter new model name (current: {config['llm_model']}): ")
                    if new_model:
                        config["llm_model"] = new_model
                        save_config(config)
                        print("Model updated. Restart to apply changes.")
                
                elif sub_choice == "3":
                    host = input(f"Enter Anki host (current: {config['anki_host']}): ")
                    port = input(f"Enter Anki port (current: {config['anki_port']}): ")
                    if host:
                        config["anki_host"] = host
                    if port and port.isdigit():
                        config["anki_port"] = int(port)
                    save_config(config)
                    print("Connection settings updated. Restart to apply changes.")
                
                elif sub_choice == "4":
                    tags_input = input("Enter default tags (comma separated): ")
                    config["default_tags"] = [t.strip() for t in tags_input.split(",")] if tags_input else []
                    save_config(config)
                    print("Default tags updated.")
            
            elif (choice == "12" and llm_available) or (choice == "9" and not llm_available):
                print("Exiting...")
                break
            
            else:
                print("Invalid option")
        
        except Exception as e:
            print(f"\nError: {e}")

if __name__ == "__main__":
    main()