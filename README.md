# AnkiTool

An AI-powered tool for generating Anki flashcards with support for multiple LLM providers (Gemini, OpenAI, and custom models). Features a web UI for easy interaction and batch processing capabilities.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [Docker (Recommended)](#docker-recommended)
  - [Manual Installation](#manual-installation)
- [Configuration](#configuration)
- [Usage](#usage)
  - [Web Interface](#web-interface)
  - [Command Line](#command-line)
- [Model Instructions](#model-instructions)
- [API Endpoints](#api-endpoints)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Features

- 🤖 **Multiple LLM Support**: Gemini, OpenAI, and custom models (Ollama, etc.)
- 🌐 **Web Interface**: User-friendly UI for creating cards and managing settings
- 📦 **Batch Import**: Process multiple words at once
- 🎯 **Field-Specific Instructions**: Customize AI behavior for each Anki field
- 🔧 **Flexible Configuration**: Environment-based settings
- 🐳 **Docker Support**: Easy deployment with Docker Compose
- 🌍 **Multi-language**: Generate cards in any target language

## Prerequisites

- [Anki](https://apps.ankiweb.net/) with [AnkiConnect](https://github.com/FooSoft/anki-connect) addon installed
- API key for your chosen LLM provider (Gemini, OpenAI, etc.)
- Docker and Docker Compose (for Docker installation)
- Python 3.11+ (for manual installation)

## Installation

### Docker (Recommended)

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd AnkiTool
   ```

2. **Copy and configure environment file**:
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env` with your settings**:
   ```bash
   # Key settings to configure:
   ANKI_HOST=host.docker.internal  # For Docker on Windows/Mac
   GEMINI_API_KEY=your_api_key_here
   ```

4. **Start with Docker Compose**:
   ```bash
   docker compose up -d
   ```

5. **Access the web interface**:
   Open http://localhost:5000 in your browser

### Manual Installation

1. **Clone and enter directory**:
   ```bash
   git clone <repository-url>
   cd AnkiTool
   ```

2. **Create virtual environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and settings
   ```

5. **Run the application**:
   ```bash
   python app.py
   ```

## Configuration

### Environment Variables

Create a `.env` file with the following settings:

```env
# Anki Connection
ANKI_HOST=192.168.100.17    # Your Anki host IP
ANKI_PORT=8765              # AnkiConnect port

# LLM Provider (gemini, openai, or custom)
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.0-flash-exp

# API Keys
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key

# Custom LLM (e.g., Ollama)
CUSTOM_ENDPOINT=http://localhost:11434/v1
CUSTOM_MODEL=llama2
CUSTOM_API_KEY=dummy-key
```

### AnkiConnect Setup

1. Install AnkiConnect addon in Anki (code: 2055492159)
2. Configure AnkiConnect to allow connections:
   - Tools → Add-ons → AnkiConnect → Config
   - Add your IP to `webBindAddress` or use `0.0.0.0`
   - Restart Anki

## Usage

### Web Interface

1. **Single Card Creation**:
   - Select deck and model
   - Enter word and target language
   - Preview generated content
   - Add to Anki or edit before adding

2. **Batch Import**:
   - Enter multiple words (one per line)
   - Select deck, model, and language
   - Process all words at once
   - Click on results to view details

3. **Model Instructions**:
   - Select a model to configure
   - Add instructions for each field
   - Enable strict formatting and validation
   - Save custom instructions per model

4. **Settings**:
   - Configure Anki connection
   - Choose LLM provider
   - Add API keys
   - Test connections

### Command Line

For direct Python usage:

```python
from anki_interactive import AnkiConnectClient, LLMClient, LLMProvider

# Initialize clients
anki = AnkiConnectClient(host="192.168.100.17", port=8765)
llm = LLMClient(provider=LLMProvider.GEMINI)

# Generate card
fields = llm.generate_note(
    word="example",
    model_name="Basic",
    fields=["Front", "Back"],
    language="Spanish"
)

# Add to Anki
note = {
    "deckName": "Default",
    "modelName": "Basic",
    "fields": fields,
    "tags": ["spanish", "llm-generated"]
}
anki.add_notes([note])
```

## Model Instructions

Customize how the AI generates content for each field:

### Example: THPTQG Form

```json
{
  "THPTQG form": {
    "fields": {
      "Word": "Word should be lowercase",
      "WordType": "Type should be v, n, adj, adv",
      "Phonetic": "IPA phonetic transcription",
      "Example": "Example sentence in English",
      "Suggest": "Hide 80% of characters like s___g__",
      "Meaning": "Translation in target language",
      "Audio": "empty",
      "Audio example": "empty"
    },
    "strictFormat": true,
    "validateOutput": true
  }
}
```

## API Endpoints

### Core Endpoints

- `GET /api/decks` - List all Anki decks
- `GET /api/models` - List all note types
- `GET /api/model_fields/<model>` - Get fields for a model
- `POST /api/generate_note` - Generate card content
- `POST /api/add_note` - Add note to Anki
- `POST /api/batch_generate` - Batch process words

### Settings Endpoints

- `GET /api/settings` - Get current settings
- `POST /api/settings` - Update settings
- `POST /api/test_anki_connection` - Test Anki connection
- `GET /api/model_instructions` - Get saved instructions
- `POST /api/model_instructions` - Save instructions

## Troubleshooting

### Cannot Connect to Anki

1. **Ensure Anki is running** with AnkiConnect addon
2. **Check AnkiConnect configuration** allows your IP
3. **For Docker users**:
   - Windows/Mac: Use `ANKI_HOST=host.docker.internal`
   - Linux: Use `network_mode: "host"` in docker-compose.yml

### LLM Generation Issues

1. **Check API key** is valid and has credits
2. **Verify model name** is supported
3. **Review model instructions** for syntax errors
4. **Check rate limits** for your API plan

### Docker Issues

1. **Permission errors**: Fix with `chmod 644 model_instructions.json .env`
2. **Port conflicts**: Change port in docker-compose.yml
3. **Build errors**: Try `docker compose build --no-cache`

## Development

### Project Structure

```
AnkiTool/
├── app.py                  # Flask web server
├── anki_interactive.py     # Core logic and clients
├── model_instructions.json # Model-specific instructions
├── requirements.txt        # Python dependencies
├── Dockerfile             # Docker image definition
├── docker-compose.yml     # Docker orchestration
├── templates/
│   └── index.html         # Web UI template
├── static/
│   ├── style.css          # UI styles
│   └── script.js          # Frontend JavaScript
└── .env.example           # Environment template
```

### Adding New LLM Providers

1. Add provider to `LLMProvider` enum in `anki_interactive.py`
2. Implement provider logic in `LLMClient` class
3. Update UI provider selection in `index.html`
4. Add configuration options to `.env.example`

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [AnkiConnect](https://github.com/FooSoft/anki-connect) for Anki integration
- [Gemini API](https://ai.google.dev/) for AI capabilities
- [Flask](https://flask.palletsprojects.com/) for the web framework