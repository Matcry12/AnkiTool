// Global variables
let currentNote = null;
let modelInstructions = {};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    checkConnection();
    loadDecks();
    loadModels();
    loadModelInstructions();
    loadSettings();
    setupTabs();
    setupEventListeners();
});

// Tab functionality
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            
            // Update active states
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            button.classList.add('active');
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });
}

// Check AnkiConnect connection
async function checkConnection() {
    const statusElement = document.getElementById('connectionStatus');
    const statusText = statusElement.querySelector('.status-text');
    
    try {
        const response = await fetch('/api/test_connection');
        const data = await response.json();
        
        if (data.status === 'connected') {
            statusElement.classList.add('connected');
            statusElement.classList.remove('disconnected');
            statusText.textContent = 'Connected to Anki';
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        statusElement.classList.add('disconnected');
        statusElement.classList.remove('connected');
        statusText.textContent = 'Not connected to Anki';
        showError('Failed to connect to Anki. Make sure Anki is running with AnkiConnect addon.');
    }
}

// Load decks
async function loadDecks() {
    try {
        const response = await fetch('/api/decks');
        const data = await response.json();
        
        const deckSelects = ['deck', 'batchDeck'];
        deckSelects.forEach(selectId => {
            const select = document.getElementById(selectId);
            select.innerHTML = '<option value="">Select a deck...</option>';
            
            data.decks.forEach(deck => {
                const option = document.createElement('option');
                option.value = deck;
                option.textContent = deck;
                select.appendChild(option);
            });
        });
    } catch (error) {
        showError('Failed to load decks');
    }
}

// Load models
async function loadModels() {
    try {
        const response = await fetch('/api/models');
        const data = await response.json();
        
        const modelSelects = ['model', 'batchModel', 'instructionModel'];
        modelSelects.forEach(selectId => {
            const select = document.getElementById(selectId);
            select.innerHTML = '<option value="">Select a model...</option>';
            
            data.models.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                select.appendChild(option);
            });
        });
    } catch (error) {
        showError('Failed to load models');
    }
}

// Load model instructions
async function loadModelInstructions() {
    try {
        const response = await fetch('/api/model_instructions');
        const data = await response.json();
        modelInstructions = data.instructions;
        updateCurrentInstructions();
    } catch (error) {
        console.error('Failed to load model instructions:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Single card form
    document.getElementById('singleCardForm').addEventListener('submit', handleSingleCardSubmit);
    
    // Preview buttons
    document.getElementById('addCardBtn').addEventListener('click', handleAddCard);
    document.getElementById('editCardBtn').addEventListener('click', handleEditCard);
    document.getElementById('cancelBtn').addEventListener('click', () => {
        document.getElementById('previewSection').style.display = 'none';
        currentNote = null;
    });
    
    // Batch import form
    document.getElementById('batchImportForm').addEventListener('submit', handleBatchImport);
    
    // Model instructions
    document.getElementById('instructionModel').addEventListener('change', handleInstructionModelChange);
    document.getElementById('saveInstructionBtn').addEventListener('click', handleSaveInstruction);
    
    // Settings
    document.getElementById('testAnkiConnection').addEventListener('click', handleTestConnection);
    document.getElementById('saveSettingsBtn').addEventListener('click', handleSaveSettings);
    document.getElementById('resetSettingsBtn').addEventListener('click', handleResetSettings);
    document.getElementById('llmProvider').addEventListener('change', handleProviderChange);
    
    // Model selection changes
    document.getElementById('geminiModel').addEventListener('change', handleModelChange);
    document.getElementById('openaiModel').addEventListener('change', handleModelChange);
}

// Handle single card form submission
async function handleSingleCardSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const data = {
        word: formData.get('word'),
        deck_name: formData.get('deck'),
        model_name: formData.get('model'),
        language: formData.get('language')
    };
    
    try {
        showLoading(true);
        const response = await fetch('/api/generate_note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        currentNote = result.note;
        showPreview(result.fields, result.can_add);
        
    } catch (error) {
        showError(`Failed to generate card: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Show preview
function showPreview(fields, canAdd) {
    const previewSection = document.getElementById('previewSection');
    const previewContent = document.getElementById('previewContent');
    
    // Build preview HTML
    let html = '';
    for (const [field, value] of Object.entries(fields)) {
        html += `
            <div class="field-preview">
                <div class="field-name">${field}:</div>
                <div class="field-value">${value || '(empty)'}</div>
            </div>
        `;
    }
    
    previewContent.innerHTML = html;
    previewSection.style.display = 'block';
    
    // Update add button based on canAdd
    const addBtn = document.getElementById('addCardBtn');
    if (!canAdd) {
        addBtn.textContent = 'Add as Duplicate';
        currentNote.options = { allowDuplicate: true };
    } else {
        addBtn.textContent = 'Add to Anki';
    }
}

// Handle add card
async function handleAddCard() {
    if (!currentNote) return;
    
    try {
        showLoading(true);
        const response = await fetch('/api/add_note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: currentNote })
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        showSuccess(result.message);
        
        // Clear form and hide preview
        document.getElementById('singleCardForm').reset();
        document.getElementById('previewSection').style.display = 'none';
        currentNote = null;
        
    } catch (error) {
        showError(`Failed to add card: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Handle edit card
function handleEditCard() {
    if (!currentNote) return;
    
    const fields = currentNote.fields;
    let html = '<form id="editForm">';
    
    for (const [field, value] of Object.entries(fields)) {
        html += `
            <div class="form-group">
                <label for="edit_${field}">${field}:</label>
                <textarea id="edit_${field}" name="${field}" rows="3">${value}</textarea>
            </div>
        `;
    }
    
    html += '<button type="submit" class="btn btn-primary">Save Changes</button></form>';
    
    document.getElementById('previewContent').innerHTML = html;
    
    // Add submit handler
    document.getElementById('editForm').addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        
        for (const [field, value] of formData.entries()) {
            currentNote.fields[field] = value;
        }
        
        showPreview(currentNote.fields, true);
    });
}

// Handle batch import
async function handleBatchImport(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const words = formData.get('batchWords').split('\n').filter(word => word.trim());
    
    if (words.length === 0) {
        showError('Please enter at least one word');
        return;
    }
    
    const data = {
        words: words,
        deck_name: formData.get('batchDeck'),
        model_name: formData.get('batchModel'),
        language: formData.get('batchLanguage')
    };
    
    // Show progress
    const progressSection = document.getElementById('batchProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const resultsDiv = document.getElementById('batchResults');
    
    progressSection.style.display = 'block';
    resultsDiv.innerHTML = '';
    
    try {
        const response = await fetch('/api/batch_generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        // Update progress
        const percentage = (result.summary.successful / result.summary.total) * 100;
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${result.summary.successful} / ${result.summary.total}`;
        
        // Show results
        result.results.forEach((item, index) => {
            const resultItem = document.createElement('div');
            resultItem.className = `result-item ${item.success ? 'success' : 'error'} clickable`;
            resultItem.dataset.index = index;
            resultItem.innerHTML = `
                <div class="result-header">
                    <span class="result-word">${item.word}</span>
                    <span class="result-status">${item.success ? '✓ Added' : '✗ ' + (item.error || 'Failed')}</span>
                </div>
                <div class="result-details" id="details-${index}" style="display: none;">
                    ${item.fields ? formatFields(item.fields, item.success) : ''}
                    ${!item.success && item.error ? formatError(item.error) : ''}
                </div>
            `;
            
            // Add click handler
            resultItem.querySelector('.result-header').addEventListener('click', () => {
                toggleDetails(index);
            });
            
            resultsDiv.appendChild(resultItem);
        });
        
        showSuccess(`Batch import complete: ${result.summary.successful} successful, ${result.summary.failed} failed`);
        
    } catch (error) {
        showError(`Batch import failed: ${error.message}`);
    }
}

// Handle instruction model change
function handleInstructionModelChange(event) {
    const model = event.target.value;
    const editGroup = document.getElementById('instructionEditGroup');
    const textArea = document.getElementById('instructionText');
    
    if (model) {
        editGroup.style.display = 'block';
        textArea.value = modelInstructions[model] || '';
    } else {
        editGroup.style.display = 'none';
    }
}

// Handle save instruction
async function handleSaveInstruction() {
    const model = document.getElementById('instructionModel').value;
    const instruction = document.getElementById('instructionText').value;
    
    if (!model) return;
    
    try {
        const response = await fetch('/api/model_instructions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model_name: model,
                instruction: instruction
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        modelInstructions[model] = instruction;
        updateCurrentInstructions();
        showSuccess('Instructions saved successfully');
        
    } catch (error) {
        showError(`Failed to save instructions: ${error.message}`);
    }
}

// Update current instructions display
function updateCurrentInstructions() {
    const container = document.getElementById('currentInstructions');
    
    if (Object.keys(modelInstructions).length === 0) {
        container.innerHTML = '<p>No model instructions configured yet.</p>';
        return;
    }
    
    let html = '<h4>Current Instructions:</h4>';
    
    for (const [model, instruction] of Object.entries(modelInstructions)) {
        html += `
            <div class="instruction-item">
                <div class="instruction-model">${model}</div>
                <div class="instruction-text">${instruction}</div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// Format fields for display
function formatFields(fields, isSuccess) {
    let html = '<div class="fields-container">';
    
    // If it failed but we have fields, show a header
    if (!isSuccess && Object.keys(fields).length > 1) {
        html += '<div class="detail-header">Generated content (failed to add):</div>';
    }
    
    for (const [field, value] of Object.entries(fields)) {
        // Skip the Error field if it exists (handled separately)
        if (field === 'Error') continue;
        
        if (value && value.toString().trim()) {  // Only show non-empty fields
            html += `
                <div class="field-detail">
                    <span class="field-label">${field}:</span>
                    <span class="field-content">${value}</span>
                </div>
            `;
        }
    }
    
    html += '</div>';
    return html;
}

// Format error message
function formatError(error) {
    return `
        <div class="error-details">
            <div class="error-header">Error Details:</div>
            <div class="error-message">${error}</div>
        </div>
    `;
}

// Toggle details visibility
function toggleDetails(index) {
    const detailsDiv = document.getElementById(`details-${index}`);
    const resultItem = detailsDiv.parentElement;
    
    if (detailsDiv.style.display === 'none') {
        detailsDiv.style.display = 'block';
        resultItem.classList.add('expanded');
    } else {
        detailsDiv.style.display = 'none';
        resultItem.classList.remove('expanded');
    }
}

// Load settings
async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();
        
        if (settings.error) {
            console.error('Failed to load settings:', settings.error);
            return;
        }
        
        // Populate settings form
        document.getElementById('ankiHost').value = settings.anki_host || '192.168.100.17';
        document.getElementById('ankiPort').value = settings.anki_port || 8765;
        
        // Set LLM provider and trigger change event
        const provider = settings.llm_provider || 'gemini';
        document.getElementById('llmProvider').value = provider;
        handleProviderChange({ target: { value: provider } });
        
        // Set model based on provider
        if (provider === 'gemini') {
            const model = settings.llm_model || 'gemini-2.5-flash-lite';
            const geminiSelect = document.getElementById('geminiModel');
            
            // Check if model exists in dropdown
            if (Array.from(geminiSelect.options).some(opt => opt.value === model)) {
                geminiSelect.value = model;
            } else {
                // It's a custom model
                geminiSelect.value = 'custom';
                document.getElementById('geminiCustomModel').value = model;
                document.getElementById('geminiCustomModelGroup').style.display = 'block';
            }
        } else if (provider === 'openai') {
            const model = settings.llm_model || 'gpt-3.5-turbo';
            const openaiSelect = document.getElementById('openaiModel');
            
            // Check if model exists in dropdown
            if (Array.from(openaiSelect.options).some(opt => opt.value === model)) {
                openaiSelect.value = model;
            } else {
                // It's a custom model
                openaiSelect.value = 'custom';
                document.getElementById('openaiCustomModel').value = model;
                document.getElementById('openaiCustomModelGroup').style.display = 'block';
            }
        } else if (provider === 'custom') {
            document.getElementById('customModel').value = settings.llm_model || '';
            document.getElementById('customEndpoint').value = settings.custom_endpoint || '';
        }
        
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

// Handle test connection
async function handleTestConnection() {
    const host = document.getElementById('ankiHost').value;
    const port = document.getElementById('ankiPort').value;
    
    if (!host || !port) {
        showError('Please enter both host and port');
        return;
    }
    
    try {
        showSettingsStatus('Testing connection...', 'info');
        
        const response = await fetch('/api/test_anki_connection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host, port: parseInt(port) })
        });
        
        const result = await response.json();
        
        if (result.status === 'connected') {
            showSettingsStatus(result.message, 'success');
        } else {
            showSettingsStatus(result.message, 'error');
        }
        
    } catch (error) {
        showSettingsStatus(`Connection failed: ${error.message}`, 'error');
    }
}

// Handle provider change
function handleProviderChange(event) {
    const provider = event.target.value;
    
    // Hide all provider configs
    document.querySelectorAll('.provider-config').forEach(config => {
        config.style.display = 'none';
    });
    
    // Show selected provider config
    if (provider === 'gemini') {
        document.getElementById('geminiConfig').style.display = 'block';
    } else if (provider === 'openai') {
        document.getElementById('openaiConfig').style.display = 'block';
    } else if (provider === 'custom') {
        document.getElementById('customConfig').style.display = 'block';
    }
}

// Handle model selection change
function handleModelChange(event) {
    const selectId = event.target.id;
    const selectedValue = event.target.value;
    
    // Determine which custom model group to show/hide
    let customGroupId;
    if (selectId === 'geminiModel') {
        customGroupId = 'geminiCustomModelGroup';
    } else if (selectId === 'openaiModel') {
        customGroupId = 'openaiCustomModelGroup';
    }
    
    if (customGroupId) {
        const customGroup = document.getElementById(customGroupId);
        if (selectedValue === 'custom') {
            customGroup.style.display = 'block';
        } else {
            customGroup.style.display = 'none';
        }
    }
}

// Handle save settings
async function handleSaveSettings() {
    const provider = document.getElementById('llmProvider').value;
    const settings = {
        anki_host: document.getElementById('ankiHost').value,
        anki_port: parseInt(document.getElementById('ankiPort').value),
        llm_provider: provider
    };
    
    // Get model and API key based on provider
    if (provider === 'gemini') {
        const geminiModel = document.getElementById('geminiModel').value;
        if (geminiModel === 'custom') {
            settings.llm_model = document.getElementById('geminiCustomModel').value;
        } else {
            settings.llm_model = geminiModel;
        }
        const apiKey = document.getElementById('geminiApiKey').value;
        if (apiKey) {
            settings.api_key = apiKey;
        }
    } else if (provider === 'openai') {
        const openaiModel = document.getElementById('openaiModel').value;
        if (openaiModel === 'custom') {
            settings.llm_model = document.getElementById('openaiCustomModel').value;
        } else {
            settings.llm_model = openaiModel;
        }
        const apiKey = document.getElementById('openaiApiKey').value;
        if (apiKey) {
            settings.api_key = apiKey;
        }
    } else if (provider === 'custom') {
        settings.llm_model = document.getElementById('customModel').value;
        settings.custom_endpoint = document.getElementById('customEndpoint').value;
        const apiKey = document.getElementById('customApiKey').value;
        if (apiKey) {
            settings.api_key = apiKey;
        }
    }
    
    try {
        showSettingsStatus('Saving settings...', 'info');
        
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        showSettingsStatus('Settings saved successfully! Refreshing page...', 'success');
        
        // Refresh page to apply new settings
        setTimeout(() => {
            window.location.reload();
        }, 1500);
        
    } catch (error) {
        showSettingsStatus(`Failed to save settings: ${error.message}`, 'error');
    }
}

// Handle reset settings
function handleResetSettings() {
    if (confirm('Reset all settings to default values?')) {
        // Reset Anki settings
        document.getElementById('ankiHost').value = '192.168.100.17';
        document.getElementById('ankiPort').value = '8765';
        
        // Reset provider
        document.getElementById('llmProvider').value = 'gemini';
        handleProviderChange({ target: { value: 'gemini' } });
        
        // Reset Gemini settings
        document.getElementById('geminiModel').value = 'gemini-2.5-flash-lite';
        document.getElementById('geminiCustomModel').value = '';
        document.getElementById('geminiCustomModelGroup').style.display = 'none';
        document.getElementById('geminiApiKey').value = '';
        
        // Reset OpenAI settings
        document.getElementById('openaiModel').value = 'gpt-3.5-turbo';
        document.getElementById('openaiCustomModel').value = '';
        document.getElementById('openaiCustomModelGroup').style.display = 'none';
        document.getElementById('openaiApiKey').value = '';
        
        // Reset Custom settings
        document.getElementById('customModel').value = '';
        document.getElementById('customEndpoint').value = '';
        document.getElementById('customApiKey').value = '';
        
        showSettingsStatus('Settings reset to defaults. Click "Save Settings" to apply.', 'info');
    }
}

// Show settings status
function showSettingsStatus(message, type) {
    const statusDiv = document.getElementById('settingsStatus');
    statusDiv.textContent = message;
    statusDiv.className = `settings-status ${type}`;
    statusDiv.style.display = 'block';
    
    if (type !== 'error') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }
}

// Toggle password visibility
function togglePasswordVisibility(fieldId) {
    const field = document.getElementById(fieldId);
    const button = field.nextElementSibling;
    
    if (field.type === 'password') {
        field.type = 'text';
        button.textContent = '🙈';
    } else {
        field.type = 'password';
        button.textContent = '👁';
    }
}

// Utility functions
function showLoading(show) {
    // You can implement a global loading indicator here
}

function showError(message) {
    // Simple alert for now, can be replaced with better UI
    alert(`Error: ${message}`);
}

function showSuccess(message) {
    // Simple alert for now, can be replaced with better UI
    alert(message);
}