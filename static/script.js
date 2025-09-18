// Global variables
let currentNote = null;
let modelInstructions = {};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    checkConnection();
    loadDecks();
    loadModels();
    loadModelInstructions();
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
        result.results.forEach(item => {
            const resultItem = document.createElement('div');
            resultItem.className = `result-item ${item.success ? 'success' : 'error'}`;
            resultItem.innerHTML = `
                <span>${item.word}</span>
                <span>${item.success ? '✓ Added' : '✗ ' + (item.error || 'Failed')}</span>
            `;
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