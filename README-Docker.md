# AnkiTool Docker Setup

This guide explains how to run AnkiTool using Docker.

## Prerequisites

- Docker and Docker Compose installed
- Anki with AnkiConnect addon installed and running
- API key for your chosen LLM provider (Gemini, OpenAI, or custom)

## Quick Start

1. **Clone the repository** (if not already done):
   ```bash
   git clone <repository-url>
   cd AnkiTool
   ```

2. **Copy the environment example**:
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env`** and add your API keys and settings:
   ```bash
   nano .env  # or use your preferred editor
   ```

4. **Build and run with Docker Compose**:
   ```bash
   docker-compose up -d
   ```

5. **Access the web UI**:
   Open http://localhost:5000 in your browser

## Configuration

### Anki Connection

The Docker container needs to connect to your Anki instance. The configuration depends on your setup:

- **Docker on Windows/Mac**: Use `ANKI_HOST=host.docker.internal`
- **Docker on Linux**: 
  - Option 1: Use `network_mode: "host"` in docker-compose.yml
  - Option 2: Use your machine's IP address
- **Remote Anki**: Use the actual IP address of the machine running Anki

### Environment Variables

Key environment variables in `.env`:

```env
# Anki connection
ANKI_HOST=host.docker.internal  # Adjust based on your setup
ANKI_PORT=8765

# LLM provider (gemini, openai, or custom)
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.0-flash-exp

# API keys
GEMINI_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

## Using with Local LLM (Ollama)

To use Ollama as your LLM provider:

1. **Uncomment the Ollama service** in `docker-compose.yml`:
   ```yaml
   ollama:
     image: ollama/ollama:latest
     container_name: ollama
     ports:
       - "11434:11434"
     volumes:
       - ollama_data:/root/.ollama
     restart: unless-stopped
   ```

2. **Configure custom LLM settings** in `.env`:
   ```env
   LLM_PROVIDER=custom
   CUSTOM_ENDPOINT=http://ollama:11434/v1
   CUSTOM_MODEL=llama2
   CUSTOM_API_KEY=dummy-key
   ```

3. **Pull a model** (after starting the container):
   ```bash
   docker exec -it ollama ollama pull llama2
   ```

## Docker Commands

### Start the application:
```bash
docker-compose up -d
```

### View logs:
```bash
docker-compose logs -f ankitool
```

### Stop the application:
```bash
docker-compose down
```

### Rebuild after code changes:
```bash
docker-compose build
docker-compose up -d
```

### Access container shell:
```bash
docker exec -it ankitool /bin/bash
```

## Troubleshooting

### Cannot connect to Anki

1. Ensure Anki is running with AnkiConnect addon
2. Check AnkiConnect configuration allows connections from Docker IP
3. Try different `ANKI_HOST` settings based on your OS

### Linux-specific issues

If using Linux, you might need to:

1. Use `network_mode: "host"` in docker-compose.yml
2. Set `ANKI_HOST=localhost` in .env
3. Or use your machine's actual IP address

### Permission issues

If you encounter permission errors with mounted files:

```bash
# Fix permissions
chmod 644 model_instructions.json
chmod 644 .env
```

## Data Persistence

The following data is persisted:

- `model_instructions.json`: Your custom model instructions
- `.env`: Your configuration and API keys

These files are mounted as volumes, so changes are preserved between container restarts.

## Security Notes

- Never commit `.env` with real API keys
- Use `.env.example` as a template
- Consider using Docker secrets for production deployments
- Restrict network access in production environments