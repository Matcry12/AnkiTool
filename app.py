#!/usr/bin/env python3
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import json
import os
from dotenv import load_dotenv
from anki_interactive import AnkiConnectClient, LLMClient, LLMProvider, load_model_instructions, save_model_instructions

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)

# Load configuration
def load_web_config():
    config = {
        "llm_provider": os.getenv("LLM_PROVIDER", "gemini"),
        "llm_model": os.getenv("LLM_MODEL", "gemini-2.5-flash-lite"),
        "anki_host": os.getenv("ANKI_HOST", "192.168.100.17"),
        "anki_port": int(os.getenv("ANKI_PORT", "8765"))
    }
    return config

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/test_connection', methods=['GET'])
def test_connection():
    try:
        config = load_web_config()
        client = AnkiConnectClient(host=config["anki_host"], port=config["anki_port"])
        client.get_deck_names()
        return jsonify({"status": "connected", "message": "Successfully connected to Anki"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/decks', methods=['GET'])
def get_decks():
    try:
        config = load_web_config()
        client = AnkiConnectClient(host=config["anki_host"], port=config["anki_port"])
        decks = client.get_deck_names()
        return jsonify({"decks": sorted(decks)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/models', methods=['GET'])
def get_models():
    try:
        config = load_web_config()
        client = AnkiConnectClient(host=config["anki_host"], port=config["anki_port"])
        models = client.get_model_names()
        return jsonify({"models": sorted(models)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/model_fields/<model_name>', methods=['GET'])
def get_model_fields(model_name):
    try:
        config = load_web_config()
        client = AnkiConnectClient(host=config["anki_host"], port=config["anki_port"])
        fields = client.get_model_field_names(model_name)
        return jsonify({"fields": fields})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/model_instructions', methods=['GET'])
def get_model_instructions():
    try:
        instructions = load_model_instructions()
        # Ensure all instructions are properly formatted
        for model, inst in instructions.items():
            if isinstance(inst, str):
                # Try to parse string instructions
                try:
                    instructions[model] = json.loads(inst)
                except:
                    # Keep as string if not parseable
                    pass
        return jsonify({"instructions": instructions})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/model_instructions', methods=['POST'])
def update_model_instructions():
    try:
        data = request.json
        model_name = data.get('model_name')
        instruction = data.get('instruction')
        
        # Handle both object and string formats
        if isinstance(instruction, dict):
            # Already an object, save as-is
            instructions = load_model_instructions()
            instructions[model_name] = instruction
        elif isinstance(instruction, str):
            # String format (legacy), try to parse it
            try:
                instructions = load_model_instructions()
                instructions[model_name] = json.loads(instruction)
            except json.JSONDecodeError:
                # If it's not valid JSON, save as plain string
                instructions = load_model_instructions()
                instructions[model_name] = instruction
        else:
            instructions = load_model_instructions()
            instructions[model_name] = instruction
        
        save_model_instructions(instructions)
        
        return jsonify({"status": "success", "message": "Instructions updated"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/generate_note', methods=['POST'])
def generate_note():
    try:
        config = load_web_config()
        data = request.json
        
        word = data.get('word')
        deck_name = data.get('deck_name')
        model_name = data.get('model_name')
        language = data.get('language')
        
        # Initialize clients
        anki_client = AnkiConnectClient(host=config["anki_host"], port=config["anki_port"])
        
        # Check if LLM is available
        provider_str = config["llm_provider"].lower()
        if provider_str == "gemini":
            provider = LLMProvider.GEMINI
        elif provider_str == "openai":
            provider = LLMProvider.OPENAI
        elif provider_str == "custom":
            provider = LLMProvider.CUSTOM
        else:
            provider = LLMProvider.GEMINI
        
        # Create LLM client with appropriate settings
        if provider == LLMProvider.CUSTOM:
            llm_client = LLMClient(
                provider=provider, 
                model=config["llm_model"],
                api_base=os.getenv("CUSTOM_ENDPOINT", "http://localhost:11434/v1"),
                api_key=os.getenv("CUSTOM_API_KEY", "dummy-key")
            )
        else:
            llm_client = LLMClient(provider=provider, model=config["llm_model"])
        
        # Get model fields
        field_names = anki_client.get_model_field_names(model_name)
        
        # Load model instructions
        model_instructions = load_model_instructions()
        
        # Generate note fields using LLM
        fields = llm_client.generate_note(
            word, 
            model_name, 
            field_names, 
            language,
            model_instructions.get(model_name)
        )
        
        # Create note
        note = {
            "deckName": deck_name,
            "modelName": model_name,
            "fields": fields,
            "tags": [language.lower(), "llm-generated", "web-ui"]
        }
        
        # Check if can add
        can_add = anki_client.can_add_notes([note])[0]
        
        return jsonify({
            "status": "success",
            "fields": fields,
            "can_add": can_add,
            "note": note
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/add_note', methods=['POST'])
def add_note():
    try:
        config = load_web_config()
        data = request.json
        note = data.get('note')
        
        anki_client = AnkiConnectClient(host=config["anki_host"], port=config["anki_port"])
        
        # Check if note has options (like allowDuplicate)
        if 'options' in note and note['options']:
            # Note already has options set by frontend
            pass
        else:
            # Check if note can be added without options
            can_add = anki_client.can_add_notes([note])[0]
            if not can_add:
                # If can't add normally, add allowDuplicate option
                note['options'] = {'allowDuplicate': True}
        
        # Add note
        note_id = anki_client.add_notes([note])[0]
        
        if note_id:
            return jsonify({
                "status": "success",
                "message": f"Note added successfully with ID: {note_id}",
                "note_id": note_id
            })
        else:
            return jsonify({
                "status": "error",
                "message": "Failed to add note"
            }), 400
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/settings', methods=['GET'])
def get_settings():
    try:
        config = load_web_config()
        # Don't send sensitive data like API keys
        settings = {
            "anki_host": config["anki_host"],
            "anki_port": config["anki_port"],
            "llm_provider": config["llm_provider"],
            "llm_model": config["llm_model"]
        }
        
        # Add custom endpoint if using custom provider
        if config["llm_provider"] == "custom":
            settings["custom_endpoint"] = os.getenv("CUSTOM_ENDPOINT", "http://localhost:11434/v1")
        
        return jsonify(settings)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/settings', methods=['POST'])
def update_settings():
    try:
        data = request.json
        
        # Save to environment file
        env_path = '.env'
        env_vars = {}
        
        # Read existing env file
        if os.path.exists(env_path):
            with open(env_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        env_vars[key.strip()] = value.strip().strip('"\'')
        
        # Update with new values
        if 'anki_host' in data:
            env_vars['ANKI_HOST'] = data['anki_host']
            os.environ['ANKI_HOST'] = data['anki_host']
        if 'anki_port' in data:
            env_vars['ANKI_PORT'] = str(data['anki_port'])
            os.environ['ANKI_PORT'] = str(data['anki_port'])
        if 'llm_provider' in data:
            env_vars['LLM_PROVIDER'] = data['llm_provider']
            os.environ['LLM_PROVIDER'] = data['llm_provider']
        if 'llm_model' in data:
            env_vars['LLM_MODEL'] = data['llm_model']
            os.environ['LLM_MODEL'] = data['llm_model']
        
        # Handle API key if provided
        if 'api_key' in data and data['api_key']:
            provider = data.get('llm_provider', os.getenv('LLM_PROVIDER', 'gemini'))
            if provider == 'gemini':
                env_vars['GEMINI_API_KEY'] = data['api_key']
                os.environ['GEMINI_API_KEY'] = data['api_key']
            elif provider == 'openai':
                env_vars['OPENAI_API_KEY'] = data['api_key']
                os.environ['OPENAI_API_KEY'] = data['api_key']
            elif provider == 'custom':
                env_vars['CUSTOM_API_KEY'] = data['api_key']
                os.environ['CUSTOM_API_KEY'] = data['api_key']
        
        # Handle custom endpoint
        if 'custom_endpoint' in data and data.get('llm_provider') == 'custom':
            env_vars['CUSTOM_ENDPOINT'] = data['custom_endpoint']
            os.environ['CUSTOM_ENDPOINT'] = data['custom_endpoint']
            env_vars['CUSTOM_MODEL'] = data.get('llm_model', 'llama2')
            os.environ['CUSTOM_MODEL'] = data.get('llm_model', 'llama2')
        
        # Write back to .env file
        with open(env_path, 'w') as f:
            for key, value in env_vars.items():
                f.write(f'{key}="{value}"\n')
        
        return jsonify({"status": "success", "message": "Settings updated successfully"})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/test_anki_connection', methods=['POST'])
def test_anki_connection():
    try:
        data = request.json
        host = data.get('host', '192.168.100.17')
        port = data.get('port', 8765)
        
        client = AnkiConnectClient(host=host, port=port)
        client.get_deck_names()
        
        return jsonify({"status": "connected", "message": f"Successfully connected to Anki at {host}:{port}"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/batch_generate', methods=['POST'])
def batch_generate():
    try:
        config = load_web_config()
        data = request.json
        
        words = data.get('words', [])
        deck_name = data.get('deck_name')
        model_name = data.get('model_name')
        language = data.get('language')
        
        # Initialize clients
        anki_client = AnkiConnectClient(host=config["anki_host"], port=config["anki_port"])
        
        # Same provider logic as generate_note
        provider_str = config["llm_provider"].lower()
        if provider_str == "gemini":
            provider = LLMProvider.GEMINI
        elif provider_str == "openai":
            provider = LLMProvider.OPENAI
        elif provider_str == "custom":
            provider = LLMProvider.CUSTOM
        else:
            provider = LLMProvider.GEMINI
        
        # Create LLM client with appropriate settings
        if provider == LLMProvider.CUSTOM:
            llm_client = LLMClient(
                provider=provider, 
                model=config["llm_model"],
                api_base=os.getenv("CUSTOM_ENDPOINT", "http://localhost:11434/v1"),
                api_key=os.getenv("CUSTOM_API_KEY", "dummy-key")
            )
        else:
            llm_client = LLMClient(provider=provider, model=config["llm_model"])
        
        # Get model fields
        field_names = anki_client.get_model_field_names(model_name)
        
        # Load model instructions
        model_instructions = load_model_instructions()
        
        results = []
        
        for word in words:
            try:
                # Generate fields
                fields = llm_client.generate_note(
                    word, 
                    model_name, 
                    field_names, 
                    language,
                    model_instructions.get(model_name)
                )
                
                # Create note
                note = {
                    "deckName": deck_name,
                    "modelName": model_name,
                    "fields": fields,
                    "tags": [language.lower(), "llm-generated", "batch-import", "web-ui"]
                }
                
                # Check if note can be added
                can_add = anki_client.can_add_notes([note])[0]
                
                if can_add:
                    # Add note normally
                    note_id = anki_client.add_notes([note])[0]
                    results.append({
                        "word": word,
                        "success": bool(note_id),
                        "note_id": note_id,
                        "fields": fields,
                        "is_duplicate": False,
                        "note": note,
                        "error": None if note_id else "Failed to add note to Anki"
                    })
                else:
                    # It's a duplicate
                    results.append({
                        "word": word,
                        "success": False,
                        "note_id": None,
                        "fields": fields,
                        "is_duplicate": True,
                        "note": note,
                        "error": "Duplicate card detected"
                    })
                
            except Exception as e:
                # Try to get partial fields if generation was successful but adding failed
                fields_data = {}
                error_details = str(e)
                
                # If it's an LLM generation error, we won't have fields
                # If it's an Anki adding error, we might have fields
                try:
                    # Attempt to show what fields were attempted to be generated
                    if "fields" in locals():
                        fields_data = fields
                except:
                    pass
                
                results.append({
                    "word": word,
                    "success": False,
                    "error": error_details,
                    "fields": fields_data if fields_data else {"Error": error_details},
                    "is_duplicate": False,
                    "note": None
                })
        
        successful = sum(1 for r in results if r["success"])
        
        return jsonify({
            "status": "success",
            "results": results,
            "summary": {
                "total": len(results),
                "successful": successful,
                "failed": len(results) - successful
            }
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/batch_generate_preview', methods=['POST'])
def batch_generate_preview():
    """Generate all notes for preview without adding to Anki"""
    try:
        config = load_web_config()
        data = request.json
        
        words = data.get('words', [])
        deck_name = data.get('deck_name')
        model_name = data.get('model_name')
        language = data.get('language')
        
        # Initialize clients
        anki_client = AnkiConnectClient(host=config["anki_host"], port=config["anki_port"])
        
        # Same provider logic as generate_note
        provider_str = config["llm_provider"].lower()
        if provider_str == "gemini":
            provider = LLMProvider.GEMINI
        elif provider_str == "openai":
            provider = LLMProvider.OPENAI
        elif provider_str == "custom":
            provider = LLMProvider.CUSTOM
        else:
            provider = LLMProvider.GEMINI
        
        # Create LLM client
        if provider == LLMProvider.CUSTOM:
            llm_client = LLMClient(
                provider=provider, 
                model=config["llm_model"],
                api_base=os.getenv("CUSTOM_ENDPOINT", "http://localhost:11434/v1"),
                api_key=os.getenv("CUSTOM_API_KEY", "dummy-key")
            )
        else:
            llm_client = LLMClient(provider=provider, model=config["llm_model"])
        
        # Get model fields
        field_names = anki_client.get_model_field_names(model_name)
        
        # Load model instructions
        model_instructions = load_model_instructions()
        
        results = []
        
        for word in words:
            try:
                # Generate fields
                fields = llm_client.generate_note(
                    word, 
                    model_name, 
                    field_names, 
                    language,
                    model_instructions.get(model_name)
                )
                
                # Create note
                note = {
                    "deckName": deck_name,
                    "modelName": model_name,
                    "fields": fields,
                    "tags": [language.lower(), "llm-generated", "batch-import", "web-ui"]
                }
                
                # Check if note can be added
                can_add = anki_client.can_add_notes([note])[0]
                
                results.append({
                    "word": word,
                    "fields": fields,
                    "note": note,
                    "can_add": can_add,
                    "checked": can_add,  # Pre-check if can be added normally
                    "status": "ready" if can_add else "duplicate",
                    "error": None
                })
                
            except Exception as e:
                results.append({
                    "word": word,
                    "fields": {},
                    "note": None,
                    "can_add": False,
                    "checked": False,
                    "status": "error",
                    "error": str(e)
                })
        
        return jsonify({
            "status": "success",
            "results": results
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/batch_add_selected', methods=['POST'])
def batch_add_selected():
    """Add selected notes to Anki"""
    try:
        config = load_web_config()
        data = request.json
        notes_to_add = data.get('notes', [])
        
        anki_client = AnkiConnectClient(host=config["anki_host"], port=config["anki_port"])
        
        results = []
        for item in notes_to_add:
            note = item['note']
            force_duplicate = item.get('force_duplicate', False)
            
            if force_duplicate:
                note['options'] = {'allowDuplicate': True}
            
            try:
                note_id = anki_client.add_notes([note])[0]
                results.append({
                    "word": item['word'],
                    "success": bool(note_id),
                    "note_id": note_id,
                    "error": None if note_id else "Failed to add"
                })
            except Exception as e:
                results.append({
                    "word": item['word'],
                    "success": False,
                    "note_id": None,
                    "error": str(e)
                })
        
        successful = sum(1 for r in results if r["success"])
        
        return jsonify({
            "status": "success",
            "results": results,
            "summary": {
                "total": len(results),
                "successful": successful,
                "failed": len(results) - successful
            }
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/search_notes', methods=['POST'])
def search_notes():
    """Search notes with pagination"""
    try:
        config = load_web_config()
        data = request.json
        
        deck_name = data.get('deck_name', '')
        search_term = data.get('search_term', '')
        page = data.get('page', 1)
        per_page = data.get('per_page', 20)
        
        anki_client = AnkiConnectClient(host=config["anki_host"], port=config["anki_port"])
        
        # Build search query
        query_parts = []
        if deck_name:
            query_parts.append(f'deck:"{deck_name}"')
        if search_term:
            query_parts.append(search_term)
        
        query = ' '.join(query_parts) if query_parts else 'deck:*'
        
        # Find all matching notes
        all_note_ids = anki_client.find_notes(query)
        total_notes = len(all_note_ids)
        
        # Paginate
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        page_note_ids = all_note_ids[start_idx:end_idx]
        
        # Get note info for current page
        notes_info = []
        if page_note_ids:
            notes_data = anki_client.notes_info(page_note_ids)
            for note in notes_data:
                # Extract first field as preview
                fields = note.get('fields', {})
                first_field = next(iter(fields.values()), {}).get('value', '') if fields else ''
                
                notes_info.append({
                    'id': note['noteId'],
                    'preview': first_field[:100] + ('...' if len(first_field) > 100 else ''),
                    'tags': note.get('tags', []),
                    'model': note.get('modelName', ''),
                    'fields': {k: v.get('value', '') for k, v in fields.items()}
                })
        
        return jsonify({
            'status': 'success',
            'notes': notes_info,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total_notes,
                'pages': (total_notes + per_page - 1) // per_page
            }
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/delete_notes', methods=['POST'])
def delete_notes():
    """Delete selected notes"""
    try:
        config = load_web_config()
        data = request.json
        note_ids = data.get('note_ids', [])
        
        if not note_ids:
            return jsonify({'error': 'No notes selected'}), 400
        
        anki_client = AnkiConnectClient(host=config["anki_host"], port=config["anki_port"])
        
        # Delete notes
        anki_client.delete_notes(note_ids)
        
        return jsonify({
            'status': 'success',
            'message': f'Deleted {len(note_ids)} note(s) successfully'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/update_note', methods=['POST'])
def update_note():
    """Update an existing note"""
    try:
        config = load_web_config()
        data = request.json
        note_id = data.get('note_id')
        fields = data.get('fields')
        
        if not note_id or not fields:
            return jsonify({'error': 'Note ID and fields are required'}), 400
        
        anki_client = AnkiConnectClient(host=config["anki_host"], port=config["anki_port"])
        
        # Build note update object
        note_update = {
            "id": note_id,
            "fields": fields
        }
        
        # Update the note
        anki_client.update_note(note_update)
        
        return jsonify({
            'status': 'success',
            'message': 'Note updated successfully'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/add_duplicate_note', methods=['POST'])
def add_duplicate_note():
    try:
        config = load_web_config()
        data = request.json
        note = data.get('note')
        
        if not note:
            return jsonify({"error": "No note provided"}), 400
        
        # Force allowDuplicate option
        note['options'] = {'allowDuplicate': True}
        
        anki_client = AnkiConnectClient(host=config["anki_host"], port=config["anki_port"])
        
        # Add note with duplicate allowed
        note_id = anki_client.add_notes([note])[0]
        
        if note_id:
            return jsonify({
                "status": "success",
                "message": f"Duplicate note added successfully with ID: {note_id}",
                "note_id": note_id
            })
        else:
            return jsonify({
                "status": "error",
                "message": "Failed to add duplicate note"
            }), 400
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Create templates directory if it doesn't exist
    os.makedirs('templates', exist_ok=True)
    os.makedirs('static', exist_ok=True)
    
    app.run(debug=True, host='0.0.0.0', port=5000)