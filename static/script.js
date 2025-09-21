// Global variables
let currentNote = null;
let modelInstructions = {};
let currentModelFields = [];

// Global variables for delete functionality
let deleteCurrentPage = 1;
let deleteNotesCache = [];
let deleteSelectedIds = new Set();

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
        
        const deckSelects = ['deck', 'batchDeck', 'deleteDeck'];
        deckSelects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                if (selectId === 'deleteDeck') {
                    select.innerHTML = '<option value="">All Decks</option>';
                } else {
                    select.innerHTML = '<option value="">Select a deck...</option>';
                }
                
                data.decks.forEach(deck => {
                    const option = document.createElement('option');
                    option.value = deck;
                    option.textContent = deck;
                    select.appendChild(option);
                });
            }
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
        
        // Parse string instructions to objects
        for (const [model, instruction] of Object.entries(modelInstructions)) {
            if (typeof instruction === 'string') {
                try {
                    modelInstructions[model] = JSON.parse(instruction);
                } catch (e) {
                    // Keep as string if not valid JSON
                }
            }
        }
        
        updateSavedInstructions();
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
    document.getElementById('saveFieldInstructionsBtn').addEventListener('click', handleSaveFieldInstructions);
    document.getElementById('previewInstructionBtn').addEventListener('click', handlePreviewInstruction);
    
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
    
    // Add duplicate warning if necessary
    if (!canAdd) {
        html += `
            <div class="alert alert-warning" style="margin-bottom: 20px;">
                <strong>⚠️ Duplicate Card Detected</strong><br>
                This word already exists in your Anki deck. You can still add it as a duplicate if needed.
            </div>
        `;
    }
    
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
        addBtn.classList.remove('btn-success');
        addBtn.classList.add('btn-warning');
        currentNote.options = { allowDuplicate: true };
    } else {
        addBtn.textContent = 'Add to Anki';
        addBtn.classList.remove('btn-warning');
        addBtn.classList.add('btn-success');
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
        
        // Keep the original canAdd status and options when just editing fields
        const hasOptions = currentNote.options && currentNote.options.allowDuplicate;
        showPreview(currentNote.fields, !hasOptions);
    });
}

// Global variable to store batch import results
let batchImportResults = [];

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
    progressText.textContent = 'Generating cards...';
    progressFill.style.width = '50%';
    resultsDiv.innerHTML = '';
    
    try {
        // First, generate all notes
        const response = await fetch('/api/batch_generate_preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        batchImportResults = result.results;
        progressFill.style.width = '100%';
        progressText.textContent = 'Generation complete!';
        
        // Show the new UI with checkboxes and actions
        showBatchImportPreview(result.results);
        
    } catch (error) {
        showError(`Batch generation failed: ${error.message}`);
    }
}

// Show batch import preview with checkboxes
function showBatchImportPreview(results) {
    const resultsDiv = document.getElementById('batchResults');
    
    // Create control buttons
    const controlsHtml = `
        <div class="batch-controls" style="margin-bottom: 20px; display: flex; gap: 10px; align-items: center;">
            <button class="btn btn-secondary btn-sm" onclick="selectAllBatch(true)">Select All</button>
            <button class="btn btn-secondary btn-sm" onclick="selectAllBatch(false)">Deselect All</button>
            <div style="flex: 1;"></div>
            <button class="btn btn-success" onclick="addSelectedBatch()">Add Selected to Anki</button>
        </div>
    `;
    
    resultsDiv.innerHTML = controlsHtml;
    
    // Add result items
    results.forEach((item, index) => {
        const resultItem = document.createElement('div');
        const isReady = item.status === 'ready';
        const isDuplicate = item.status === 'duplicate';
        const isError = item.status === 'error';
        
        resultItem.className = `result-item ${isReady ? 'success' : isDuplicate ? 'warning' : 'error'}`;
        resultItem.dataset.index = index;
        
        let statusIcon = '';
        let statusText = '';
        if (isReady) {
            statusIcon = '✓';
            statusText = 'Ready';
        } else if (isDuplicate) {
            statusIcon = '⚠️';
            statusText = 'Duplicate';
        } else {
            statusIcon = '✗';
            statusText = 'Error';
        }
        
        resultItem.innerHTML = `
            <div class="batch-item-container" style="display: flex; align-items: center; gap: 10px; padding: 10px;">
                <input type="checkbox" 
                    id="batch-item-${index}" 
                    ${item.checked ? 'checked' : ''}
                    onchange="updateBatchItemCheck(${index}, this.checked)"
                    style="width: 20px; height: 20px; cursor: pointer;"
                />
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="result-word" style="font-weight: 600;">${item.word}</span>
                        <span class="status-badge" style="display: inline-flex; align-items: center; gap: 5px;">
                            ${statusIcon} ${statusText}
                        </span>
                    </div>
                    ${item.error ? `<div class="error-text" style="color: #dc3545; font-size: 0.9em; margin-top: 5px;">${item.error}</div>` : ''}
                </div>
                <div class="action-buttons" style="display: flex; gap: 5px;">
                    ${!isReady ? `
                        <button class="btn btn-warning btn-sm" onclick="forceAddBatchItem(${index})" title="Add as duplicate">
                            Still Add
                        </button>
                    ` : ''}
                    <button class="btn btn-primary btn-sm" onclick="editBatchItem(${index})">
                        ${isError ? 'View' : 'Edit'}
                    </button>
                </div>
            </div>
            <div class="batch-item-details" id="batch-details-${index}" style="display: none; padding: 10px; border-top: 1px solid #e0e0e0;">
                ${item.fields && Object.keys(item.fields).length > 0 ? formatFields(item.fields, true) : '<p>No fields generated</p>'}
            </div>
        `;
        
        resultsDiv.appendChild(resultItem);
    });
}

// Update checkbox state
function updateBatchItemCheck(index, checked) {
    batchImportResults[index].checked = checked;
}

// Select/deselect all items
function selectAllBatch(select) {
    batchImportResults.forEach((item, index) => {
        item.checked = select;
        document.getElementById(`batch-item-${index}`).checked = select;
    });
}

// Force add a batch item (for duplicates/errors)
function forceAddBatchItem(index) {
    const item = batchImportResults[index];
    if (!item.note && item.fields && Object.keys(item.fields).length > 0) {
        // Create note if not exists but fields exist
        item.note = {
            "deckName": document.getElementById('batchDeck').value,
            "modelName": document.getElementById('batchModel').value,
            "fields": item.fields,
            "tags": [document.getElementById('batchLanguage').value.toLowerCase(), "llm-generated", "batch-import", "web-ui"]
        };
    }
    item.checked = true;
    item.force_duplicate = true;
    document.getElementById(`batch-item-${index}`).checked = true;
    
    // Update UI to show it's ready to be added
    const resultItem = document.querySelector(`[data-index="${index}"]`);
    resultItem.classList.remove('error', 'warning');
    resultItem.classList.add('success');
    
    const statusBadge = resultItem.querySelector('.status-badge');
    statusBadge.innerHTML = '✓ Ready (force)';
}

// Edit batch item
function editBatchItem(index) {
    const detailsDiv = document.getElementById(`batch-details-${index}`);
    const item = batchImportResults[index];
    
    if (detailsDiv.style.display === 'none') {
        // Show edit form
        detailsDiv.style.display = 'block';
        
        if (item.fields && Object.keys(item.fields).length > 0) {
            let editHtml = '<form id="batch-edit-form-' + index + '" onsubmit="saveBatchItemEdit(event, ' + index + ')">';
            for (const [field, value] of Object.entries(item.fields)) {
                editHtml += `
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>${field}:</label>
                        <textarea name="${field}" rows="2" style="width: 100%;">${value || ''}</textarea>
                    </div>
                `;
            }
            editHtml += '<button type="submit" class="btn btn-primary btn-sm">Save Changes</button></form>';
            detailsDiv.innerHTML = editHtml;
        }
    } else {
        detailsDiv.style.display = 'none';
    }
}

// Save batch item edit
function saveBatchItemEdit(event, index) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const item = batchImportResults[index];
    
    // Update fields
    for (const [field, value] of formData.entries()) {
        if (!item.fields) item.fields = {};
        item.fields[field] = value;
    }
    
    // Create/update note
    item.note = {
        "deckName": document.getElementById('batchDeck').value,
        "modelName": document.getElementById('batchModel').value,
        "fields": item.fields,
        "tags": [document.getElementById('batchLanguage').value.toLowerCase(), "llm-generated", "batch-import", "web-ui", "edited"]
    };
    
    // Mark as ready
    item.status = 'ready';
    item.checked = true;
    item.error = null;
    
    // Refresh the item display
    showBatchImportPreview(batchImportResults);
}

// Add selected items to Anki
async function addSelectedBatch() {
    const selectedItems = batchImportResults.filter(item => item.checked && item.note);
    
    if (selectedItems.length === 0) {
        showError('No items selected for import');
        return;
    }
    
    const notesToAdd = selectedItems.map(item => ({
        word: item.word,
        note: item.note,
        force_duplicate: item.force_duplicate || item.status === 'duplicate'
    }));
    
    try {
        showLoading(true);
        const response = await fetch('/api/batch_add_selected', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: notesToAdd })
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        showSuccess(`Added ${result.summary.successful} cards successfully!`);
        
        // Clear successful items
        if (result.summary.successful > 0) {
            document.getElementById('batchWords').value = '';
            document.getElementById('batchResults').innerHTML = '';
            document.getElementById('batchProgress').style.display = 'none';
            batchImportResults = [];
        }
        
    } catch (error) {
        showError(`Failed to add cards: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Handle instruction model change
async function handleInstructionModelChange(event) {
    const modelName = event.target.value;
    const fieldsConfig = document.getElementById('modelFieldsConfig');
    const selectedModelName = document.getElementById('selectedModelName');
    const fieldsList = document.getElementById('modelFieldsList');
    
    if (!modelName) {
        fieldsConfig.style.display = 'none';
        return;
    }
    
    try {
        // Get model fields
        const response = await fetch(`/api/model_fields/${encodeURIComponent(modelName)}`);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        currentModelFields = data.fields;
        selectedModelName.textContent = modelName;
        
        // Build fields UI
        let fieldsHtml = '';
        data.fields.forEach(field => {
            const fieldInstructions = modelInstructions[modelName]?.fields?.[field] || '';
            const fieldType = guessFieldType(field);
            
            fieldsHtml += `
                <div class="field-instruction-item">
                    <div class="field-header">
                        <span class="field-name">${field}</span>
                        <span class="field-type">${fieldType}</span>
                    </div>
                    <textarea 
                        class="field-instruction-input" 
                        data-field="${field}"
                        placeholder="Describe what content should be generated for this field..."
                    >${fieldInstructions}</textarea>
                </div>
            `;
        });
        
        fieldsList.innerHTML = fieldsHtml;
        fieldsConfig.style.display = 'block';
        
        // Load saved format settings
        if (modelInstructions[modelName]) {
            document.getElementById('strictFormat').checked = modelInstructions[modelName].strictFormat !== false;
            document.getElementById('validateOutput').checked = modelInstructions[modelName].validateOutput !== false;
        }
        
    } catch (error) {
        showError(`Failed to load model fields: ${error.message}`);
    }
}

// Guess field type based on name
function guessFieldType(fieldName) {
    const lower = fieldName.toLowerCase();
    if (lower.includes('audio') || lower.includes('sound')) return 'Audio';
    if (lower.includes('image') || lower.includes('picture')) return 'Image';
    if (lower.includes('example') || lower.includes('sentence')) return 'Example';
    if (lower.includes('meaning') || lower.includes('definition')) return 'Definition';
    if (lower.includes('pronunciation')) return 'Pronunciation';
    return 'Text';
}

// Handle save field instructions
async function handleSaveFieldInstructions() {
    const modelName = document.getElementById('instructionModel').value;
    if (!modelName) return;
    
    // Collect field instructions (only non-empty ones)
    const fieldInstructions = {};
    let hasAnyInstructions = false;
    
    document.querySelectorAll('.field-instruction-input').forEach(input => {
        const field = input.dataset.field;
        const value = input.value.trim();
        if (value) {
            fieldInstructions[field] = value;
            hasAnyInstructions = true;
        }
    });
    
    // Get format settings
    const strictFormat = document.getElementById('strictFormat').checked;
    const validateOutput = document.getElementById('validateOutput').checked;
    
    // Build instruction object (even if no field instructions)
    const instruction = {
        fields: fieldInstructions,
        strictFormat: strictFormat,
        validateOutput: validateOutput
    };
    
    // Show info if no field instructions
    if (!hasAnyInstructions) {
        console.log('No field-specific instructions provided, LLM will use defaults');
    }
    
    try {
        const response = await fetch('/api/model_instructions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model_name: modelName,
                instruction: instruction  // Send as object, not string
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        modelInstructions[modelName] = instruction;
        updateSavedInstructions();
        showSuccess('Field instructions saved successfully');
        
    } catch (error) {
        showError(`Failed to save instructions: ${error.message}`);
    }
}

// Handle preview instruction
function handlePreviewInstruction() {
    const modelName = document.getElementById('instructionModel').value;
    if (!modelName) return;
    
    const fieldInstructions = {};
    document.querySelectorAll('.field-instruction-input').forEach(input => {
        const field = input.dataset.field;
        const value = input.value.trim();
        if (value) {
            fieldInstructions[field] = value;
        }
    });
    
    const strictFormat = document.getElementById('strictFormat').checked;
    
    let preview = `Model: ${modelName}\nWord: [example word]\nLanguage: [target language]\n\n`;
    preview += `Instructions:\n`;
    
    for (const [field, instruction] of Object.entries(fieldInstructions)) {
        preview += `\n${field}: ${instruction}`;
    }
    
    if (strictFormat) {
        preview += `\n\nOutput Format: STRICT JSON - Return ONLY a JSON object with these exact fields.`;
    }
    
    alert(preview);
}

// Update saved instructions display
function updateSavedInstructions() {
    const container = document.getElementById('savedInstructionsList');
    
    if (Object.keys(modelInstructions).length === 0) {
        container.innerHTML = '<p class="text-muted">No instructions saved yet.</p>';
        return;
    }
    
    let html = '';
    
    for (const [modelName, instruction] of Object.entries(modelInstructions)) {
        // Parse instruction if it's a string
        const inst = typeof instruction === 'string' ? JSON.parse(instruction) : instruction;
        const fieldCount = inst.fields ? Object.keys(inst.fields).length : 0;
        
        html += `
            <div class="saved-instruction-card">
                <div class="saved-instruction-header">
                    <span class="saved-model-name">${modelName}</span>
                    <span class="saved-fields-count">${fieldCount} field${fieldCount !== 1 ? 's' : ''} configured</span>
                </div>
        `;
        
        if (inst.fields) {
            for (const [field, fieldInst] of Object.entries(inst.fields)) {
                html += `
                    <div class="saved-field-item">
                        <div class="saved-field-name">${field}</div>
                        <div class="saved-field-instruction">${fieldInst}</div>
                    </div>
                `;
            }
        }
        
        html += `</div>`;
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

// Add duplicate from batch import
async function addDuplicateFromBatch(index) {
    const resultItem = document.querySelector(`[data-index="${index}"]`);
    const noteData = resultItem.dataset.noteData;
    
    if (!noteData) {
        showError('Note data not found');
        return;
    }
    
    try {
        const note = JSON.parse(noteData);
        const button = resultItem.querySelector('.btn-warning');
        button.disabled = true;
        button.textContent = 'Adding...';
        
        const response = await fetch('/api/add_duplicate_note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            // Update UI to show success
            const header = resultItem.querySelector('.result-header');
            const statusSpan = header.querySelector('.result-status');
            statusSpan.textContent = '✓ Added as duplicate';
            
            resultItem.classList.remove('warning');
            resultItem.classList.add('success');
            
            // Hide the button
            button.style.display = 'none';
            
            showSuccess(`Duplicate added successfully for: ${note.fields[Object.keys(note.fields)[0]]}`);
        } else {
            throw new Error(result.error || 'Failed to add duplicate');
        }
        
    } catch (error) {
        const button = resultItem.querySelector('.btn-warning');
        button.disabled = false;
        button.textContent = 'Add as Duplicate';
        showError(`Failed to add duplicate: ${error.message}`);
    }
}

// Delete Notes Functionality
async function searchNotes(page = 1) {
    const deck = document.getElementById('deleteDeck').value;
    const searchTerm = document.getElementById('deleteSearch').value;
    
    try {
        showLoading(true);
        const response = await fetch('/api/search_notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deck_name: deck,
                search_term: searchTerm,
                page: page,
                per_page: 20
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        deleteCurrentPage = page;
        displayDeleteResults(result);
        
    } catch (error) {
        showError(`Search failed: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

function displayDeleteResults(data) {
    const resultsDiv = document.getElementById('deleteResults');
    const notesList = document.getElementById('notesList');
    const statsSpan = document.getElementById('deleteStats');
    const paginationDiv = document.getElementById('deletePagination');
    
    // Update stats
    statsSpan.textContent = `Found ${data.pagination.total} notes (Page ${data.pagination.page} of ${data.pagination.pages})`;
    
    // Build notes list
    let notesHtml = '';
    data.notes.forEach(note => {
        const isSelected = deleteSelectedIds.has(note.id);
        notesHtml += `
            <div class="delete-note-item" data-note-id="${note.id}">
                <input type="checkbox" 
                    id="delete-note-${note.id}" 
                    ${isSelected ? 'checked' : ''}
                    onchange="toggleDeleteSelection(${note.id})"
                    class="delete-checkbox"
                />
                <div class="note-info">
                    <div class="note-preview">${note.preview}</div>
                    <div class="note-meta">
                        <span class="note-model">${note.model}</span>
                        ${note.tags.length > 0 ? `<span class="note-tags">Tags: ${note.tags.join(', ')}</span>` : ''}
                    </div>
                </div>
                <div class="note-actions" style="display: flex; gap: 5px;">
                    <button class="btn btn-sm btn-primary" onclick="editNote(${JSON.stringify(note).replace(/"/g, '&quot;')})">
                        Edit
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="viewNoteDetails(${JSON.stringify(note).replace(/"/g, '&quot;')})">
                        View
                    </button>
                </div>
            </div>
        `;
    });
    
    notesList.innerHTML = notesHtml || '<p>No notes found</p>';
    
    // Build pagination
    let paginationHtml = '';
    if (data.pagination.pages > 1) {
        // Previous button
        if (data.pagination.page > 1) {
            paginationHtml += `<button class="btn btn-sm" onclick="searchNotes(${data.pagination.page - 1})">Previous</button>`;
        }
        
        // Page numbers
        let startPage = Math.max(1, data.pagination.page - 2);
        let endPage = Math.min(data.pagination.pages, data.pagination.page + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            paginationHtml += `<button class="btn btn-sm ${i === data.pagination.page ? 'btn-primary' : ''}" 
                onclick="searchNotes(${i})">${i}</button>`;
        }
        
        // Next button
        if (data.pagination.page < data.pagination.pages) {
            paginationHtml += `<button class="btn btn-sm" onclick="searchNotes(${data.pagination.page + 1})">Next</button>`;
        }
    }
    
    paginationDiv.innerHTML = paginationHtml;
    resultsDiv.style.display = 'block';
    
    // Update delete button
    updateDeleteButton();
}

function toggleDeleteSelection(noteId) {
    if (deleteSelectedIds.has(noteId)) {
        deleteSelectedIds.delete(noteId);
    } else {
        deleteSelectedIds.add(noteId);
    }
    updateDeleteButton();
}

function selectAllDelete(select) {
    const checkboxes = document.querySelectorAll('.delete-checkbox');
    checkboxes.forEach(checkbox => {
        const noteId = parseInt(checkbox.id.replace('delete-note-', ''));
        checkbox.checked = select;
        if (select) {
            deleteSelectedIds.add(noteId);
        } else {
            deleteSelectedIds.delete(noteId);
        }
    });
    updateDeleteButton();
}

function updateDeleteButton() {
    const btn = document.getElementById('deleteSelectedBtn');
    btn.textContent = `Delete Selected (${deleteSelectedIds.size})`;
    btn.disabled = deleteSelectedIds.size === 0;
}

async function deleteSelected() {
    if (deleteSelectedIds.size === 0) {
        showError('No notes selected');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete ${deleteSelectedIds.size} note(s)? This cannot be undone.`)) {
        return;
    }
    
    try {
        showLoading(true);
        const response = await fetch('/api/delete_notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                note_ids: Array.from(deleteSelectedIds)
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        showSuccess(result.message);
        
        // Clear selection and refresh
        deleteSelectedIds.clear();
        searchNotes(deleteCurrentPage);
        
    } catch (error) {
        showError(`Delete failed: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

function viewNoteDetails(note) {
    let detailsHtml = `<h3>${note.preview}</h3>\n<p><strong>Model:</strong> ${note.model}</p>\n`;
    
    if (note.tags.length > 0) {
        detailsHtml += `<p><strong>Tags:</strong> ${note.tags.join(', ')}</p>\n`;
    }
    
    detailsHtml += '<h4>Fields:</h4>\n';
    for (const [field, value] of Object.entries(note.fields)) {
        detailsHtml += `<div style="margin-bottom: 10px;">
            <strong>${field}:</strong><br>
            <div style="background: #f5f5f5; padding: 10px; border-radius: 5px;">
                ${value || '(empty)'}
            </div>
        </div>`;
    }
    
    // Create a modal or use alert for now
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); max-width: 80%; max-height: 80%; overflow: auto; z-index: 1000;';
    modal.innerHTML = detailsHtml + '<button class="btn btn-primary" onclick="this.parentElement.remove()">Close</button>';
    
    document.body.appendChild(modal);
}

// Check duplicate for single card
async function checkDuplicate() {
    const word = document.getElementById('word').value.trim();
    const deck = document.getElementById('deck').value;
    
    if (!word) {
        showError('Please enter a word to check');
        return;
    }
    
    if (!deck) {
        showError('Please select a deck');
        return;
    }
    
    try {
        showLoading(true);
        const response = await fetch('/api/search_notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deck_name: deck,
                search_term: `w:${word}`,
                page: 1,
                per_page: 10
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        if (result.notes.length === 0) {
            showSuccess(`No exact match found for the word "${word}" in deck "${deck}"`);
        } else {
            // Show duplicates in a modal
            let duplicatesHtml = `<h3>Found ${result.notes.length} note(s) with the exact word "${word}"</h3>`;
            result.notes.forEach(note => {
                duplicatesHtml += `
                    <div style="margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                        <strong>${note.preview}</strong><br>
                        <small>Model: ${note.model}</small>
                    </div>`;
            });
            
            const modal = document.createElement('div');
            modal.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); max-width: 80%; max-height: 80%; overflow: auto; z-index: 1000;';
            modal.innerHTML = duplicatesHtml + '<button class="btn btn-primary" onclick="this.parentElement.remove()">Close</button>';
            document.body.appendChild(modal);
        }
        
    } catch (error) {
        showError(`Failed to check duplicate: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Check duplicates in batch
async function checkBatchDuplicates() {
    const words = document.getElementById('batchWords').value.split('\n').filter(word => word.trim());
    const deck = document.getElementById('batchDeck').value;
    
    if (words.length === 0) {
        showError('Please enter words to check');
        return;
    }
    
    if (!deck) {
        showError('Please select a deck');
        return;
    }
    
    try {
        showLoading(true);
        const duplicates = [];
        
        // Check each word
        for (const word of words) {
            const response = await fetch('/api/search_notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    deck_name: deck,
                    search_term: `w:${word.trim()}`,
                    page: 1,
                    per_page: 1
                })
            });
            
            const result = await response.json();
            if (result.notes && result.notes.length > 0) {
                duplicates.push(word);
            }
        }
        
        // Show results
        if (duplicates.length === 0) {
            showSuccess(`No duplicates found! All ${words.length} words are new.`);
        } else {
            let message = `Found ${duplicates.length} duplicate(s) out of ${words.length} words:\n\n`;
            message += duplicates.join('\n');
            message += '\n\nThese words already exist in the deck. You can still import them as duplicates.';
            
            const modal = document.createElement('div');
            modal.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); max-width: 80%; max-height: 80%; overflow: auto; z-index: 1000;';
            modal.innerHTML = `
                <h3>Duplicate Check Results</h3>
                <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px;">${message}</pre>
                <div style="margin-top: 10px;">
                    <button class="btn btn-primary" onclick="this.parentElement.parentElement.remove()">Close</button>
                    <button class="btn btn-warning" onclick="this.parentElement.parentElement.remove(); document.getElementById('batchImportForm').requestSubmit()">Import Anyway</button>
                </div>
            `;
            document.body.appendChild(modal);
        }
        
    } catch (error) {
        showError(`Failed to check duplicates: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Edit note function
function editNote(note) {
    // Create edit modal
    let editHtml = `<h3>Edit Note</h3>`;
    editHtml += `<form id="editNoteForm" onsubmit="saveNoteEdit(event, ${note.id})">`;
    
    for (const [field, value] of Object.entries(note.fields)) {
        editHtml += `
            <div class="form-group" style="margin-bottom: 15px;">
                <label style="font-weight: bold;">${field}:</label>
                <textarea name="${field}" rows="3" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">${value || ''}</textarea>
            </div>
        `;
    }
    
    editHtml += `
        <div style="margin-top: 20px; display: flex; gap: 10px;">
            <button type="submit" class="btn btn-primary">Save Changes</button>
            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        </div>
    </form>`;
    
    // Create modal with overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 999;';
    
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); max-width: 80%; max-height: 80%; overflow: auto; z-index: 1000;';
    modal.innerHTML = editHtml;
    
    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);
}

// Save note edit
async function saveNoteEdit(event, noteId) {
    event.preventDefault();
    const formData = new FormData(event.target);
    
    const fields = {};
    for (const [field, value] of formData.entries()) {
        fields[field] = value;
    }
    
    try {
        showLoading(true);
        const response = await fetch('/api/update_note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                note_id: noteId,
                fields: fields
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        showSuccess('Note updated successfully!');
        document.querySelector('.modal-overlay').remove();
        
        // Refresh the search results
        searchNotes(deleteCurrentPage);
        
    } catch (error) {
        showError(`Failed to update note: ${error.message}`);
    } finally {
        showLoading(false);
    }
}