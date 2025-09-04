// AI Medical Scribe Application
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;
let currentTranscript = '';
let selectedTemplate = 'soap';
let wordCount = 0;
let sessionStartTime = Date.now();
let currentConsultationId = null; // Track current consultation ID

// Transcription service
let transcriptionService = null;

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    updateSessionTimer();
    setInterval(updateSessionTimer, 60000); // Update every minute
    
    // Initialize transcription service - ONLY AWS Transcribe Medical
    if (typeof TranscriptionMedicalService !== 'undefined') {
        transcriptionService = new TranscriptionMedicalService();
        console.log('AWS Transcribe Medical Service initialized (HIPAA Compliant)');
    } else {
        console.error('AWS Transcribe Medical service not available');
        showToast('AWS Transcribe Medical is required for HIPAA compliance', 'error');
    }
    
    // Load saved preferences
    loadPreferences();
    
    // Check for microphone permissions
    checkMicrophonePermissions();
    
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Initialize subscription badge immediately
    const badge = document.getElementById('subscriptionBadge');
    if (badge) {
        badge.style.display = 'inline-flex';
        badge.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-right: 12px;
            padding: 6px 12px;
            background: #f3f4f6;
            color: #6b7280;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        `;
        badge.innerHTML = 'Loading...';
        badge.onclick = function() { showSubscriptionModal(); };
        console.log('Subscription badge initialized');
    }
    
    // Check subscription status
    checkSubscriptionStatus();
});

// Toggle recording
async function toggleRecording() {
    if (!isRecording) {
        await startRecording();
    } else {
        await stopRecording();
    }
}

// Start recording
async function startRecording() {
    try {
        // Check subscription status first
        await checkSubscriptionStatus();
        
        // Don't clear transcript - preserve existing content for multiple recordings
        const transcriptContent = document.getElementById('transcriptContent');
        
        // If this is the first recording (empty state), clear the placeholder
        if (transcriptContent && transcriptContent.querySelector('.empty-state')) {
            transcriptContent.innerHTML = '';
        }
        
        // Add a separator if there's existing content
        if (currentTranscript && currentTranscript.trim()) {
            // Add visual separator for new recording session
            if (transcriptContent) {
                const separator = document.createElement('div');
                separator.className = 'transcript-separator';
                separator.innerHTML = `<span>── New Recording ${new Date().toLocaleTimeString()} ──</span>`;
                transcriptContent.appendChild(separator);
            }
        }
        
        // Store the transcript before this recording session
        const transcriptBeforeRecording = currentTranscript || '';
        
        // Update UI
        isRecording = true;
        recordingStartTime = Date.now();
        updateRecordingUI(true);
        
        // Start recording timer
        recordingTimer = setInterval(updateRecordingTime, 1000);
        
        // Start real-time transcription
        if (transcriptionService) {
            console.log('Starting transcription with service');
            const started = await transcriptionService.start({
                onTranscriptUpdate: (transcript, isInterim) => {
                    try {
                        console.log('Transcript update received:', { 
                            length: transcript.length, 
                            isInterim,
                            preview: transcript.substring(0, 100) 
                        });
                        
                        // Update live transcript display
                        if (!isInterim) {
                            // Append to existing transcript instead of replacing
                            if (transcriptBeforeRecording && transcriptBeforeRecording.trim()) {
                                currentTranscript = transcriptBeforeRecording + '\n\n' + transcript;
                            } else {
                                currentTranscript = transcript;
                            }
                            updateWordCount(currentTranscript);
                            
                            // Also update the display with the full transcript
                            const transcriptContent = document.getElementById('transcriptContent');
                            if (transcriptContent && transcript.trim()) {
                                // Check if we should show full transcript
                                const segments = transcriptContent.querySelectorAll('.transcript-segment');
                                if (segments.length === 0) {
                                    // No segments yet, show full transcript
                                    transcriptContent.innerHTML = `
                                        <div class="transcript-segment">
                                            <div class="segment-speaker">Transcript</div>
                                            <div>${transcript}</div>
                                        </div>
                                    `;
                                }
                            }
                        } else {
                            // Show interim results in a temporary element
                            updateInterimTranscript(transcript);
                        }
                    } catch (err) {
                        console.error('Error processing transcript update:', err);
                    }
                },
                onSegmentComplete: (segment) => {
                    try {
                        console.log('Segment complete:', segment);
                        // Add completed segment to display
                        addTranscriptSegment(segment.speaker, segment.text);
                    } catch (err) {
                        console.error('Error processing segment:', err);
                    }
                },
                onError: (error) => {
                    console.error('Transcription error:', error);
                    
                    // Check if it's a subscription limit error
                    if (error.includes('Daily limit reached') || error.includes('Upgrade to Pro')) {
                        showToast(error, 'warning');
                        // Show subscription modal
                        setTimeout(() => {
                            showSubscriptionModal();
                        }, 500);
                    } else {
                        showToast(error, 'error');
                    }
                    
                    // Stop recording on error
                    stopRecording();
                }
            });
            
            if (started) {
                console.log('Transcription service started successfully');
                showToast('Recording started - speak naturally');
            } else {
                throw new Error('Failed to start transcription service');
            }
        } else {
            console.log('No transcription service available');
            showToast('Transcription service not available', 'error');
            stopRecording();
        }
    } catch (error) {
        console.error('Error starting recording:', error);
        
        // Reset UI on error
        isRecording = false;
        updateRecordingUI(false);
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
        
        if (error.message.includes('AWS')) {
            showToast('AWS Transcribe Medical required. Please configure AWS credentials.', 'error');
        } else if (error.message.includes('microphone')) {
            showToast('Microphone access denied. Please allow microphone access.', 'error');
        } else {
            showToast('Failed to start recording: ' + error.message, 'error');
        }
    }
}

// Stop recording
async function stopRecording() {
    console.log('Stopping recording...');
    
    // Stop recording but keep UI ready for final updates
    isRecording = false;
    
    // Stop transcription service
    if (transcriptionService) {
        const result = await transcriptionService.stop();
        if (result && result.transcript) {
            currentTranscript = result.transcript;
            console.log('Final transcript length:', currentTranscript.length);
        }
    }
    
    // Update UI
    updateRecordingUI(false);
    
    // Clear timer
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
    
    // Auto-generate note if transcript exists
    if (currentTranscript && currentTranscript.trim()) {
        setTimeout(() => generateNote(), 1000);
    }
    
    showToast('Recording stopped');
}

// Update recording UI
function updateRecordingUI(recording) {
    const recordButton = document.getElementById('recordButton');
    const recordIcon = document.getElementById('recordIcon');
    const recordingStatus = document.getElementById('recordingStatus');
    const recordingTimer = document.getElementById('recordingTimer');
    const liveIndicator = document.getElementById('liveIndicator');
    
    if (recording) {
        if (recordButton) recordButton.classList.add('recording');
        if (recordIcon) recordIcon.textContent = '⏹️';
        if (recordingStatus) {
            recordingStatus.textContent = 'Recording';
            recordingStatus.classList.add('recording');
        }
        if (recordingTimer) {
            recordingTimer.style.display = 'block';
            recordingTimer.classList.add('recording');
        }
        if (liveIndicator) liveIndicator.style.display = 'inline';
    } else {
        if (recordButton) recordButton.classList.remove('recording');
        if (recordIcon) recordIcon.textContent = '🎙️';
        if (recordingStatus) {
            recordingStatus.textContent = 'Ready to record';
            recordingStatus.classList.remove('recording');
        }
        if (recordingTimer) {
            recordingTimer.textContent = '00:00';
            recordingTimer.style.display = 'block';
            recordingTimer.classList.remove('recording');
        }
        if (liveIndicator) liveIndicator.style.display = 'none';
    }
}

// Update recording time
function updateRecordingTime() {
    if (!recordingStartTime) return;
    
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    const timerElement = document.getElementById('recordingTimer');
    if (timerElement) {
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

// Fallback basic recording (when transcription service not available)
async function startBasicRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        const audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await processAudioForTranscription(audioBlob);
        };
        
        mediaRecorder.start(5000); // Collect data every 5 seconds
        window.currentMediaRecorder = mediaRecorder;
        window.currentStream = stream;
        
    } catch (error) {
        throw error;
    }
}

// Update word count
function updateWordCount(transcript) {
    wordCount = transcript.split(/\s+/).filter(word => word.length > 0).length;
    document.getElementById('wordCount').textContent = `Words: ${wordCount}`;
}

// Update interim transcript display
function updateInterimTranscript(transcript) {
    const transcriptContent = document.getElementById('transcriptContent');
    if (!transcriptContent) return;
    
    // Find or create interim display
    let interimDiv = document.getElementById('interimTranscript');
    if (!interimDiv) {
        interimDiv = document.createElement('div');
        interimDiv.id = 'interimTranscript';
        interimDiv.className = 'transcript-segment interim';
        interimDiv.style.opacity = '0.7';
        interimDiv.style.fontStyle = 'italic';
        transcriptContent.appendChild(interimDiv);
    }
    
    // Get only the new part (after the current transcript)
    const newText = transcript.substring(currentTranscript.length).trim();
    if (newText) {
        interimDiv.innerHTML = `
            <div class="segment-speaker">Speaking...</div>
            <div>${newText}</div>
        `;
        transcriptContent.scrollTop = transcriptContent.scrollHeight;
    }
}

// Add transcript segment
function addTranscriptSegment(speaker, text) {
    console.log('Adding transcript segment:', { speaker, text });
    
    const transcriptContent = document.getElementById('transcriptContent');
    if (!transcriptContent) {
        console.error('Transcript content element not found!');
        return;
    }
    
    // If text is empty, skip
    if (!text || text.trim().length === 0) {
        console.log('Skipping empty segment');
        return;
    }
    
    // Remove placeholder if it exists
    const placeholder = transcriptContent.querySelector('.transcript-placeholder');
    if (placeholder) {
        console.log('Removing placeholder');
        placeholder.remove();
    }
    
    // Check if we should append to the last segment or create a new one
    const lastSegment = transcriptContent.querySelector('.transcript-item:last-child');
    const lastSpeaker = lastSegment ? lastSegment.querySelector('.speaker')?.textContent : null;
    
    // Always use "Speaker" as the label, so we can append consecutive segments
    if (lastSpeaker === 'Speaker' && lastSegment && !lastSegment.classList.contains('complete')) {
        // Append to existing segment from same speaker
        const textDiv = lastSegment.querySelector('div:last-child');
        textDiv.textContent = textDiv.textContent + ' ' + text;
        console.log('Appended to existing segment');
    } else {
        // Create new segment
        const segment = document.createElement('div');
        // Use the new class names from the redesigned HTML - no classification
        segment.className = 'transcript-item';
        segment.innerHTML = `
            <div class="speaker">Speaker</div>
            <div class="message">${text}</div>
        `;
        
        // Mark previous segment as complete
        if (lastSegment) {
            lastSegment.classList.add('complete');
        }
        
        transcriptContent.appendChild(segment);
    }
    
    transcriptContent.scrollTop = transcriptContent.scrollHeight;
    
    console.log('Segment added to DOM');
    
    // Animate new segment
    segment.style.animation = 'fadeIn 0.3s ease';
    
    // Remove live class after animation
    setTimeout(() => {
        segment.classList.remove('live');
    }, 2000);
}

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const modifierKey = isMac ? event.metaKey : event.ctrlKey;
        
        // Cmd/Ctrl + M - Focus manual note input
        if (modifierKey && event.key === 'm') {
            event.preventDefault();
            const input = document.getElementById('manualTranscriptInput');
            if (input) {
                input.focus();
                input.select();
            }
        }
        
        // Cmd/Ctrl + H - Open history
        if (modifierKey && event.key === 'h') {
            event.preventDefault();
            showHistory();
        }
        
        // Escape - Close history modal
        if (event.key === 'Escape') {
            const modal = document.getElementById('historyModal');
            if (modal && modal.classList.contains('show')) {
                closeHistory();
            }
        }
        
        // Cmd/Ctrl + A - Select all text when input is focused
        if (modifierKey && event.key === 'a') {
            const input = document.getElementById('manualTranscriptInput');
            if (document.activeElement === input) {
                event.preventDefault();
                input.select();
            }
        }
        
        // Cmd/Ctrl + Enter - Add note from anywhere (if input has focus)
        if (modifierKey && event.key === 'Enter') {
            const input = document.getElementById('manualTranscriptInput');
            if (document.activeElement === input) {
                event.preventDefault();
                addManualTranscriptNote();
            }
        }
        
        // Cmd/Ctrl + R - Toggle recording
        if (modifierKey && event.key === 'r') {
            event.preventDefault();
            toggleRecording();
        }
        
        // Cmd/Ctrl + G - Generate clinical note
        if (modifierKey && event.key === 'g') {
            event.preventDefault();
            generateNote();
        }
        
        // Cmd/Ctrl + E - Toggle edit mode
        if (modifierKey && event.key === 'e') {
            const noteContent = document.getElementById('noteContent');
            const editBtn = document.getElementById('editNoteBtn');
            if (noteContent && noteContent.innerHTML && !noteContent.innerHTML.includes('AI-generated note will appear here')) {
                event.preventDefault();
                if (noteContent.contentEditable === 'true') {
                    saveEditedNote();
                } else if (editBtn && editBtn.style.display !== 'none') {
                    toggleEditMode();
                }
            }
        }
        
        // Cmd/Ctrl + S - Save edited note
        if (modifierKey && event.key === 's') {
            const noteContent = document.getElementById('noteContent');
            if (noteContent && noteContent.contentEditable === 'true') {
                event.preventDefault();
                saveEditedNote();
            }
        }
        
        // Cmd/Ctrl + P - Print clinical note
        if (modifierKey && event.key === 'p') {
            const noteContent = document.getElementById('noteContent');
            if (noteContent && noteContent.innerHTML && !noteContent.innerHTML.includes('AI-generated note will appear here')) {
                event.preventDefault();
                printNote();
            }
        }
        
        // Cmd/Ctrl + Shift + C - Copy clinical note
        if (modifierKey && event.shiftKey && event.key === 'C') {
            event.preventDefault();
            copyNote();
        }
        
        // Escape - Clear/blur manual input
        if (event.key === 'Escape') {
            const input = document.getElementById('manualTranscriptInput');
            if (document.activeElement === input) {
                input.value = '';
                input.blur();
            }
        }
    });
    
}

// Add manual note to transcript
function addManualTranscriptNote() {
    const input = document.getElementById('manualTranscriptInput');
    const transcriptContent = document.getElementById('transcriptContent');
    
    if (!input || !transcriptContent) {
        console.error('Manual input or transcript content not found');
        return;
    }
    
    const note = input.value.trim();
    if (!note) {
        showToast('Please enter a note', 'warning');
        return;
    }
    
    // Remove placeholder/empty state if it exists
    const placeholder = transcriptContent.querySelector('.transcript-placeholder');
    const emptyState = transcriptContent.querySelector('.empty-state');
    if (placeholder) placeholder.remove();
    if (emptyState) emptyState.remove();
    
    // Create timestamp
    const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
    
    // Create manual note segment
    const segment = document.createElement('div');
    segment.className = 'transcript-item manual';
    segment.innerHTML = `
        <div class="speaker">Manual Note [${timestamp}]</div>
        <div class="message">${note}</div>
    `;
    
    // Add to transcript
    transcriptContent.appendChild(segment);
    
    // Clear input
    input.value = '';
    
    // Scroll to bottom
    transcriptContent.scrollTop = transcriptContent.scrollHeight;
    
    // Add to current transcript for note generation
    currentTranscript += `\n[Manual Note ${timestamp}]: ${note}`;
    
    // Update word count
    const words = note.split(/\s+/).filter(word => word.length > 0);
    wordCount += words.length;
    document.getElementById('wordCount').textContent = `Words: ${wordCount}`;
    
    // Animate new segment
    segment.style.animation = 'fadeIn 0.3s ease';
    
    // Remove live class after animation
    setTimeout(() => {
        segment.classList.remove('live');
    }, 2000);
    
    showToast('Note added to transcript', 'success');
}

// Process audio for transcription
async function processAudioForTranscription(audioBlob) {
    try {
        // In production, this would send to AWS Transcribe
        // For now, we'll use the existing transcription setup
        
        // Convert blob to base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
            const base64Audio = reader.result.split(',')[1];
            
            // Send to backend for transcription
            if (window.electronAPI && window.electronAPI.processQuery) {
                const result = await window.electronAPI.processQuery({
                    type: 'transcribe',
                    audio: base64Audio
                });
                
                if (result.transcript) {
                    currentTranscript = result.transcript;
                    displayFullTranscript(result.transcript);
                }
            }
        };
    } catch (error) {
        console.error('Error processing audio:', error);
    }
}

// Display full transcript
function displayFullTranscript(transcript) {
    const transcriptContent = document.getElementById('transcriptContent');
    transcriptContent.innerHTML = `
        <div class="transcript-segment">
            <div class="segment-speaker">Full Transcript</div>
            <div>${transcript}</div>
        </div>
    `;
}

// Generate clinical note
async function generateNote() {
    const generateBtn = document.getElementById('generateBtn');
    const noteContent = document.getElementById('noteContent');
    const billingContent = document.getElementById('billingContent');
    
    if (!currentTranscript.trim()) {
        showToast('No transcript available. Please record a consultation first.', 'error');
        return;
    }
    
    // Show loading state
    generateBtn.innerHTML = '<span class="loading"></span> Generating...';
    generateBtn.disabled = true;
    
    // Show loading in billing section
    billingContent.innerHTML = '<div class="helper-empty"><span style="opacity: 0.5;">⏳ Analyzing billing codes...</span></div>';
    
    try {
        // Get patient info
        const patientName = document.getElementById('patientName').value || 'Patient';
        const visitType = document.getElementById('visitType').value || 'Consultation';
        
        // Create prompts
        const notePrompt = createNotePrompt(currentTranscript, selectedTemplate, patientName, visitType);
        const billingPrompt = createBillingPrompt(currentTranscript, visitType);
        
        console.log('Generating clinical note and billing suggestions...');
        
        // Call AI to generate note and billing in parallel
        if (window.electronAPI && window.electronAPI.chatWithLLM) {
            try {
                // Make parallel calls
                const [noteResponse, billingResponse] = await Promise.all([
                    window.electronAPI.chatWithLLM(notePrompt),
                    window.electronAPI.chatWithLLM(billingPrompt)
                ]);
                
                // Handle note response
                if (noteResponse && noteResponse.success && noteResponse.result) {
                    console.log('AI generated note successfully');
                    displayGeneratedNote(noteResponse.result);
                    showToast('Clinical note generated successfully');
                    // Auto-save to history after successful generation
                    setTimeout(() => {
                        saveToHistory();
                    }, 500);
                } else {
                    console.error('Note generation failed:', noteResponse);
                    generateTemplateNote();
                }
                
                // Handle billing response
                if (billingResponse && billingResponse.success && billingResponse.result) {
                    console.log('Billing suggestions generated');
                    displayBillingSuggestions(billingResponse.result);
                } else {
                    console.error('Billing generation failed:', billingResponse);
                    billingContent.innerHTML = '<div class="helper-empty"><span style="opacity: 0.5;">💡 Unable to generate billing suggestions</span></div>';
                }
                
            } catch (err) {
                console.error('Error calling AI:', err);
                showToast('Error calling AI service. Using template.', 'error');
                generateTemplateNote();
                billingContent.innerHTML = '<div class="helper-empty"><span style="opacity: 0.5;">💡 Billing suggestions unavailable</span></div>';
            }
        } else {
            console.log('AI not available, using template');
            generateTemplateNote();
            billingContent.innerHTML = '<div class="helper-empty"><span style="opacity: 0.5;">💡 AI service not available</span></div>';
        }
    } catch (error) {
        console.error('Error generating note:', error);
        showToast('Using template-based note', 'warning');
        generateTemplateNote();
    } finally {
        generateBtn.innerHTML = 'Generate Note';
        generateBtn.disabled = false;
    }
}

// Create note prompt based on template
function createNotePrompt(transcript, template, patientName, visitType) {
    const date = new Date().toLocaleDateString();
    const time = new Date().toLocaleTimeString();
    
    const templates = {
        soap: `You are a medical scribe. Generate a professional SOAP note from the following medical consultation transcript.

IMPORTANT INSTRUCTIONS:
- Extract actual information from the transcript only
- Use medical terminology appropriately
- Be concise but thorough
- Include specific details mentioned in the conversation
- Format using MARKDOWN with proper headers and bullet points
- Use **bold** for important terms and findings
- Use bullet points (- or •) for lists

Patient: ${patientName}
Visit Type: ${visitType}
Date: ${date}
Time: ${time}

Transcript:
${transcript}

Generate a SOAP note in MARKDOWN format:

# SOAP Note

## Subjective
- **Chief Complaint:** 
- **History of Present Illness:** 
- **Past Medical History:** 
- **Current Medications:** 
- **Allergies:** 

## Objective
- **Vital Signs:** 
- **Physical Examination:** 
- **Laboratory/Test Results:** 

## Assessment
- **Primary Diagnosis:** 
- **Differential Diagnoses:** 
- **Clinical Reasoning:** 

## Plan
- **Medications:** 
- **Diagnostic Tests:** 
- **Follow-up:** 
- **Patient Education:**`,
        
        consult: `You are a medical scribe. Generate a professional consultation note from the following medical transcript.

IMPORTANT INSTRUCTIONS:
- Extract actual information from the transcript only
- Use medical terminology appropriately
- Be comprehensive and detailed
- Include all relevant clinical information
- Format using MARKDOWN with proper headers and bullet points
- Use **bold** for emphasis and important findings

Patient: ${patientName}
Visit Type: ${visitType}
Date: ${date}
Time: ${time}

Transcript:
${transcript}

Generate a consultation note in MARKDOWN format:

# Consultation Note

**Date:** ${date}  
**Time:** ${time}  
**Patient:** ${patientName}  
**Visit Type:** ${visitType}

## Chief Complaint

## History of Present Illness

## Past Medical History

## Current Medications
- 

## Allergies
- 

## Review of Systems
- **Constitutional:** 
- **Cardiovascular:** 
- **Respiratory:** 
- **Gastrointestinal:** 
- **Neurological:** 

## Physical Examination
### Vital Signs
- 

### General Appearance
- 

### System-Specific Findings
- 

## Assessment and Plan

### Assessment
1. 

### Plan
1. 

## Follow-up
- `,
        
        progress: `You are a medical scribe. Generate a professional progress note from the following medical consultation.

IMPORTANT INSTRUCTIONS:
- Focus on changes since last visit
- Extract actual information from the transcript only
- Note improvements or worsening of conditions
- Be concise and relevant
- Format using MARKDOWN with proper headers and bullet points

Patient: ${patientName}
Visit Type: ${visitType}
Date: ${date}
Time: ${time}

Transcript:
${transcript}

Generate a progress note in MARKDOWN format:

# Progress Note

**Date:** ${date}  
**Patient:** ${patientName}

## Interval History
*Changes since last visit:*
- 

## Current Symptoms
- **Improved:** 
- **Unchanged:** 
- **Worsened:** 
- **New:** 

## Medication Review
- **Current Medications:** 
- **Compliance:** 
- **Side Effects:** 

## Examination Findings
- **Vital Signs:** 
- **Pertinent Findings:** 

## Assessment
### Progress Since Last Visit
- 

### Current Status
- 

## Plan
### Medication Adjustments
- 

### Continued Treatments
- 

### Next Steps
- **Follow-up:** 
- **Tests Ordered:** 
- **Referrals:** `
    };
    
    return templates[template] || templates.soap;
}

// Create billing suggestion prompt
function createBillingPrompt(transcript, visitType) {
    const date = new Date().toLocaleDateString();
    
    return `You are a medical billing specialist. Based on the following medical consultation transcript, suggest appropriate Medicare Benefits Schedule (MBS) billing codes.

IMPORTANT INSTRUCTIONS:
- Analyze the consultation type, duration, and services provided
- Suggest only applicable MBS item numbers
- Be specific about which codes apply
- Reference: MBS Online https://www.mbsonline.gov.au/internet/mbsonline/publishing.nsf/650f3eec0dfb990fca25692100069854/0b61e1e80b332754ca258c9e0000c7d8/$FILE/MBS-XML-20250701%20Version%203.XML
- Format response as a simple list without headers

Visit Type: ${visitType}
Date: ${date}

Transcript:
${transcript}

Provide billing suggestions in this format (NO HEADERS, just the codes):
[Item Number] - [Brief description]
Example: 23 - Level B consultation (6-20 minutes)`;
}

// Display billing suggestions
function displayBillingSuggestions(billingText) {
    const billingContent = document.getElementById('billingContent');
    
    // Parse billing text into items
    const lines = billingText.split('\n').filter(line => line.trim());
    let html = '';
    
    lines.forEach(line => {
        // Match pattern: [number] - [description]
        const match = line.match(/^(\d+)\s*[-–]\s*(.+)$/);
        if (match) {
            const code = match[1];
            const desc = match[2];
            html += `
                <div class="billing-item">
                    <span class="billing-code">${code}</span>
                    <span class="billing-desc">${desc}</span>
                </div>
            `;
        }
    });
    
    if (html) {
        billingContent.innerHTML = html;
        // Show copy button
        const copyBtn = document.querySelector('.helper-copy');
        if (copyBtn) copyBtn.style.display = 'block';
    } else {
        billingContent.innerHTML = '<div class="helper-empty"><span style="opacity: 0.5;">💡 No specific billing codes identified</span></div>';
    }
}

// Copy billing suggestions
function copyBilling() {
    const billingContent = document.getElementById('billingContent');
    const billingItems = billingContent.querySelectorAll('.billing-item');
    
    if (billingItems.length === 0) {
        showToast('No billing suggestions to copy', 'error');
        return;
    }
    
    let text = 'MBS Billing Codes:\n';
    billingItems.forEach(item => {
        const code = item.querySelector('.billing-code').textContent;
        const desc = item.querySelector('.billing-desc').textContent;
        text += `${code} - ${desc}\n`;
    });
    
    navigator.clipboard.writeText(text).then(() => {
        showToast('Billing codes copied to clipboard');
    }).catch(() => {
        showToast('Failed to copy billing codes', 'error');
    });
}

// Display generated note
function displayGeneratedNote(noteText) {
    const noteContent = document.getElementById('noteContent');
    
    // Always format as markdown since we're generating markdown
    const formattedHtml = formatClinicalNote(noteText);
    noteContent.innerHTML = formattedHtml;
    
    // Show edit button but keep note read-only
    const editBtn = document.getElementById('editNoteBtn');
    if (editBtn) {
        editBtn.style.display = 'inline-block';
    }
    
    // Make sure note is NOT editable by default
    noteContent.contentEditable = false;
    noteContent.classList.remove('editable');
    
    // Add markdown-specific styles if not already present
    if (!document.getElementById('markdownStyles')) {
        const style = document.createElement('style');
        style.id = 'markdownStyles';
        style.textContent = `
            .markdown-note {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #333;
            }
            .markdown-note h2.note-main-title {
                color: #2c3e50;
                border-bottom: 2px solid #3498db;
                padding-bottom: 8px;
                margin: 20px 0 15px 0;
                font-size: 1.5em;
            }
            .markdown-note h3.note-section-title {
                color: #34495e;
                margin: 15px 0 10px 0;
                font-size: 1.2em;
                font-weight: 600;
            }
            .markdown-note h4 {
                color: #7f8c8d;
                margin: 10px 0 5px 0;
                font-size: 1.1em;
            }
            .markdown-note strong {
                color: #2c3e50;
                font-weight: 600;
            }
            .markdown-note ul {
                margin: 5px 0 10px 20px;
                padding-left: 20px;
            }
            .markdown-note li {
                margin: 3px 0;
                list-style-type: disc;
            }
            .markdown-note em {
                color: #7f8c8d;
                font-style: italic;
            }
        `;
        document.head.appendChild(style);
    }
}

// Format clinical note with markdown support
function formatClinicalNote(noteText) {
    // Convert markdown to HTML
    let html = noteText;
    
    // Convert headers
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 class="note-section-title">$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2 class="note-main-title">$1</h2>');
    
    // Convert bold text
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Convert italic text
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Convert bullet points
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/^• (.+)$/gm, '<li>$1</li>');
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    
    // Wrap consecutive list items in ul tags
    html = html.replace(/(<li>.*<\/li>\n?)+/g, function(match) {
        return '<ul>' + match + '</ul>';
    });
    
    // Convert line breaks
    html = html.replace(/\n/g, '<br>');
    
    // Add styling wrapper
    return '<div class="markdown-note">' + html + '</div>';
}

// Parse note into sections
function parseNoteIntoSections(noteText) {
    // Simple parser for SOAP format
    const sections = {};
    const lines = noteText.split('\n');
    let currentSection = '';
    let currentContent = [];
    
    for (const line of lines) {
        if (line.match(/^(Subjective|Objective|Assessment|Plan|Chief Complaint|History|Examination):/i)) {
            if (currentSection) {
                sections[currentSection] = currentContent.join('\n').trim();
            }
            currentSection = line.split(':')[0].trim();
            currentContent = [line.split(':').slice(1).join(':').trim()];
        } else if (currentSection) {
            currentContent.push(line);
        }
    }
    
    if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
    }
    
    return sections;
}

// Generate template-based note when AI is not available
function generateTemplateNote() {
    console.log('Generating template-based note...');
    
    const patientName = document.getElementById('patientName').value || 'Patient';
    const visitType = document.getElementById('visitType').value || 'Consultation';
    const date = new Date().toLocaleDateString();
    
    // Extract key information from transcript
    const extractedInfo = extractInfoFromTranscript(currentTranscript);
    
    let noteText = '';
    
    if (selectedTemplate === 'soap') {
        noteText = generateSOAPTemplate(patientName, visitType, date, extractedInfo);
    } else if (selectedTemplate === 'consult') {
        noteText = generateConsultTemplate(patientName, visitType, date, extractedInfo);
    } else if (selectedTemplate === 'progress') {
        noteText = generateProgressTemplate(patientName, visitType, date, extractedInfo);
    }
    
    console.log('Template note generated');
    displayGeneratedNote(noteText);
}

// Extract key information from transcript
function extractInfoFromTranscript(transcript) {
    const info = {
        symptoms: [],
        medications: [],
        conditions: [],
        hasDoctor: transcript.toLowerCase().includes('doctor'),
        hasPatient: transcript.toLowerCase().includes('patient')
    };
    
    // Extract symptoms (common medical terms)
    const symptomKeywords = ['pain', 'headache', 'fever', 'cough', 'fatigue', 'nausea', 'dizziness', 'shortness of breath'];
    symptomKeywords.forEach(symptom => {
        if (transcript.toLowerCase().includes(symptom)) {
            info.symptoms.push(symptom);
        }
    });
    
    // Extract medications
    const medKeywords = ['ibuprofen', 'acetaminophen', 'aspirin', 'antibiotic', 'medication'];
    medKeywords.forEach(med => {
        if (transcript.toLowerCase().includes(med)) {
            info.medications.push(med);
        }
    });
    
    return info;
}

// Generate SOAP template
function generateSOAPTemplate(patientName, visitType, date, info) {
    return `# SOAP Note

**Date:** ${date}  
**Patient:** ${patientName}  
**Visit Type:** ${visitType}

## Subjective
- **Chief Complaint:** ${visitType}
- **Symptoms Reported:** ${info.symptoms.length > 0 ? info.symptoms.map(s => `\n  - ${s}`).join('') : 'See transcript for details'}
- **History:** As documented in transcript

## Objective
- **Vital Signs:** Per clinical assessment
- **Physical Examination:** As documented in encounter
- **Clinical Findings:** To be documented

## Assessment
- **Clinical Impression:** Based on presented symptoms and examination
${info.symptoms.length > 0 ? '- **Reported Symptoms:** ' + info.symptoms.join(', ') : ''}
- **Differential Diagnosis:** To be determined based on findings

## Plan
${info.medications.length > 0 ? '- **Medications:** ' + info.medications.join(', ') : '- **Treatment:** As discussed'}
- **Follow-up:** As recommended
- **Patient Education:** Provided
- **Additional Instructions:** Per clinical guidelines`;
}

// Generate Consultation template
function generateConsultTemplate(patientName, visitType, date, info) {
    return `# Consultation Note

**Date:** ${date}  
**Patient:** ${patientName}  
**Visit Type:** ${visitType}

## Chief Complaint
${info.symptoms.length > 0 ? info.symptoms.join(', ') : 'As per transcript'}

## History of Present Illness
*Details from consultation:*
- Documented in transcript
- Patient reports: ${info.symptoms.length > 0 ? info.symptoms.join(', ') : 'See conversation'}

## Review of Systems
- **General:** To be documented
- **Cardiovascular:** To be documented
- **Respiratory:** To be documented
- **Other Systems:** As per clinical assessment

## Physical Examination
### Vital Signs
- Per clinical encounter

### Clinical Findings
- As documented during examination

## Assessment and Plan
### Assessment
- Based on clinical findings and patient presentation
${info.symptoms.length > 0 ? '- **Presenting Symptoms:** ' + info.symptoms.join(', ') : ''}

### Plan
${info.medications.length > 0 ? '- **Medications:** ' + info.medications.join(', ') : '- **Treatment:** As discussed'}
- **Follow-up:** As recommended
- **Patient Instructions:** Provided during consultation`;
}

// Generate Progress template  
function generateProgressTemplate(patientName, visitType, date, info) {
    return `# Progress Note

**Date:** ${date}  
**Patient:** ${patientName}  
**Visit Type:** ${visitType}

## Interval History
- Patient returns for ${visitType}
- Time since last visit: To be documented
- Changes noted: As per patient report

## Current Symptoms
${info.symptoms.length > 0 ? info.symptoms.map(s => `- ${s}`).join('\n') : '- As documented in transcript'}

## Medication Review
- **Current Medications:** ${info.medications.length > 0 ? info.medications.join(', ') : 'To be reviewed'}
- **Compliance:** To be assessed
- **Effectiveness:** Based on patient response

## Assessment
### Progress Evaluation
- Based on current presentation
- Compared to previous visit

### Current Status
- Clinical status: As documented
${info.symptoms.length > 0 ? '- **Active Symptoms:** ' + info.symptoms.join(', ') : ''}

## Plan
### Treatment Plan
${info.medications.length > 0 ? '- **Medications:** ' + info.medications.join(', ') : '- Continue current treatment regimen'}
- **Modifications:** As clinically indicated

### Follow-up
- Next appointment: As scheduled
- Monitoring parameters: Per clinical guidelines`;
}

// Display sample note (fallback)
function displaySampleNote() {
    const noteContent = document.getElementById('noteContent');
    
    noteContent.innerHTML = `
        <div class="note-section">
            <div class="note-section-title">Subjective</div>
            <div class="note-section-content">Patient presents with headaches for the past few days. Describes pain as throbbing, primarily on the right side of head. Pain severity varies, reaching 7/10 at its worst.</div>
        </div>
        <div class="note-section">
            <div class="note-section-title">Objective</div>
            <div class="note-section-content">Vital signs: BP 120/80, HR 72, Temp 98.6°F
Neurological exam: Alert and oriented x3, no focal deficits
Head: No signs of trauma, temporal arteries non-tender</div>
        </div>
        <div class="note-section">
            <div class="note-section-title">Assessment</div>
            <div class="note-section-content">Tension-type headache, likely stress-related
Differential: Migraine headache, cluster headache</div>
        </div>
        <div class="note-section">
            <div class="note-section-title">Plan</div>
            <div class="note-section-content">1. Ibuprofen 400mg PO q6h PRN for pain
2. Stress management techniques discussed
3. Follow-up in 2 weeks if symptoms persist
4. Return precautions explained</div>
        </div>
    `;
}

// Toggle edit mode
function toggleEditMode() {
    const noteContent = document.getElementById('noteContent');
    const editBtn = document.getElementById('editNoteBtn');
    const saveBtn = document.getElementById('saveNoteBtn');
    
    // Enable editing
    noteContent.contentEditable = true;
    noteContent.classList.add('editable');
    noteContent.focus();
    
    // Hide edit button, show save button
    editBtn.style.display = 'none';
    saveBtn.style.display = 'inline-block';
    
    // Track changes
    if (!noteContent.hasAttribute('data-listener-added')) {
        noteContent.setAttribute('data-listener-added', 'true');
        
        noteContent.addEventListener('input', () => {
            // Mark as having unsaved changes
            noteContent.setAttribute('data-modified', 'true');
        });
        
        // Handle focus
        noteContent.addEventListener('focus', () => {
            if (noteContent.contentEditable === 'true') {
                noteContent.classList.add('focused');
            }
        });
        
        noteContent.addEventListener('blur', () => {
            noteContent.classList.remove('focused');
        });
    }
    
    showToast('You can now edit the clinical note');
}

// Save edited note and exit edit mode
function saveEditedNote() {
    const noteContent = document.getElementById('noteContent');
    const editBtn = document.getElementById('editNoteBtn');
    const saveBtn = document.getElementById('saveNoteBtn');
    
    // Get the edited content
    const editedContent = noteContent.innerHTML;
    
    // Store in memory (in production, you might want to save to a file or database)
    sessionStorage.setItem('editedClinicalNote', editedContent);
    
    // Disable editing
    noteContent.contentEditable = false;
    noteContent.classList.remove('editable', 'focused');
    
    // Show edit button, hide save button
    editBtn.style.display = 'inline-block';
    saveBtn.style.display = 'none';
    
    // Clear modified flag
    noteContent.removeAttribute('data-modified');
    
    showToast('Note saved successfully');
}

// Copy note to clipboard
async function copyNote() {
    const noteContent = document.getElementById('noteContent');
    const noteText = noteContent.innerText;
    
    if (!noteText || noteText.includes('AI-generated note will appear here')) {
        showToast('No note to copy', 'error');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(noteText);
        showToast('Note copied to clipboard');
    } catch (error) {
        console.error('Error copying to clipboard:', error);
        showToast('Failed to copy note', 'error');
    }
}

// Print note
function printNote() {
    const noteContent = document.getElementById('noteContent');
    const noteText = noteContent.innerText;
    
    if (!noteText || noteText.includes('AI-generated note will appear here')) {
        showToast('No note to print', 'error');
        return;
    }
    
    // If in edit mode, save first
    if (noteContent.contentEditable === 'true') {
        saveEditedNote();
    }
    
    // Add patient info to the print if available
    const patientName = document.getElementById('patientName').value;
    const visitType = document.getElementById('visitType').value;
    
    if (patientName || visitType) {
        // Create a temporary header for printing
        const printHeader = document.createElement('div');
        printHeader.id = 'printHeader';
        printHeader.style.cssText = 'display:none; margin-bottom: 20px;';
        printHeader.innerHTML = `
            <h2 style="margin: 0;">Clinical Note</h2>
            ${patientName ? `<p style="margin: 5px 0;"><strong>Patient:</strong> ${patientName}</p>` : ''}
            ${visitType ? `<p style="margin: 5px 0;"><strong>Visit Type:</strong> ${visitType}</p>` : ''}
            <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            <hr style="margin: 15px 0;">
        `;
        
        // Add header before note content
        noteContent.insertBefore(printHeader, noteContent.firstChild);
        
        // Add print-only style to show header
        const printStyle = document.createElement('style');
        printStyle.innerHTML = '@media print { #printHeader { display: block !important; } }';
        document.head.appendChild(printStyle);
        
        // Print
        window.print();
        
        // Clean up
        setTimeout(() => {
            noteContent.removeChild(printHeader);
            document.head.removeChild(printStyle);
        }, 100);
    } else {
        // Just print without header
        window.print();
    }
    
    showToast('Print dialog opened');
}

// Select template
function selectTemplate(template) {
    selectedTemplate = template;
    
    // Update UI
    document.querySelectorAll('.template-chip').forEach(chip => {
        chip.classList.remove('active');
    });
    document.querySelector(`[data-template="${template}"]`).classList.add('active');
}

// Check microphone permissions
async function checkMicrophonePermissions() {
    try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
        
        if (permissionStatus.state === 'denied') {
            showToast('Microphone access denied. Please enable in browser settings.', 'error');
        }
        
        permissionStatus.onchange = () => {
            if (permissionStatus.state === 'denied') {
                showToast('Microphone access denied. Please enable in browser settings.', 'error');
            }
        };
    } catch (error) {
        console.log('Permissions API not supported');
    }
}

// Update session timer
function updateSessionTimer() {
    const elapsed = Math.floor((Date.now() - sessionStartTime) / 60000);
    document.getElementById('sessionDuration').textContent = `Session: ${elapsed} min`;
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) {
        console.error('Toast element not found');
        return;
    }
    
    // Remove all type classes
    toast.classList.remove('error', 'success', 'warning');
    
    // Add the appropriate type class
    if (type === 'error') {
        toast.classList.add('error');
    } else if (type === 'warning') {
        toast.classList.add('warning');
    } else {
        toast.classList.add('success');
    }
    
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Load user preferences
function loadPreferences() {
    // Load saved preferences from localStorage
    const savedTemplate = localStorage.getItem('preferredTemplate');
    if (savedTemplate) {
        selectTemplate(savedTemplate);
    }
}

// Save preferences
function savePreferences() {
    localStorage.setItem('preferredTemplate', selectedTemplate);
}

// Generate UUID v4
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Start new consultation session
function startNewConsultation() {
    currentConsultationId = generateUUID();
    console.log('Started new consultation:', currentConsultationId);
}

// Clear current session for new consultation
function clearCurrentSession() {
    // Stop recording if active
    if (isRecording) {
        stopRecording();
    }
    
    // Clear form fields
    document.getElementById('patientName').value = '';
    document.getElementById('visitType').value = '';
    
    // Clear transcript
    currentTranscript = '';
    const transcriptContent = document.getElementById('transcriptContent');
    transcriptContent.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">🎙️</div>
            <div class="empty-text">Click the microphone to start recording</div>
        </div>
    `;
    
    // Clear note
    const noteContent = document.getElementById('noteContent');
    noteContent.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">✨</div>
            <div class="empty-text">Your AI-generated note will appear here</div>
        </div>
    `;
    
    // Hide edit button
    document.getElementById('editNoteBtn').style.display = 'none';
    
    // Reset word count
    wordCount = 0;
    updateWordCount('');
    
    showToast('Ready for new consultation', 'success');
}

// Save consultation to history
function saveToHistory() {
    if (!currentTranscript && !document.getElementById('noteContent').innerText.trim()) {
        return; // Don't save empty consultations
    }
    
    // Generate new ID if this is a new consultation
    if (!currentConsultationId) {
        currentConsultationId = generateUUID();
    }
    
    const consultation = {
        id: currentConsultationId,
        date: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        patientName: document.getElementById('patientName').value || 'Unknown Patient',
        visitType: document.getElementById('visitType').value || 'General Visit',
        transcript: currentTranscript,
        note: document.getElementById('noteContent').innerHTML,
        template: selectedTemplate,
        duration: recordingTimer ? document.getElementById('recordingTimer').textContent : '00:00'
    };
    
    // Get existing history
    let history = JSON.parse(localStorage.getItem('consultationHistory') || '[]');
    
    // Check if this consultation already exists
    const existingIndex = history.findIndex(item => item.id === currentConsultationId);
    
    if (existingIndex !== -1) {
        // Update existing consultation
        history[existingIndex] = consultation;
        showToast('Consultation updated', 'success');
    } else {
        // Add new consultation to beginning
        history.unshift(consultation);
        showToast('Consultation saved to history', 'success');
    }
    
    // Keep only last 500 consultations (localStorage has ~10MB limit)
    if (history.length > 500) {
        history = history.slice(0, 500);
    }
    
    // Save to localStorage
    localStorage.setItem('consultationHistory', JSON.stringify(history));
}

// Show history modal
function showHistory() {
    const modal = document.getElementById('historyModal');
    const historyList = document.getElementById('historyList');
    
    // Get history from localStorage
    const history = JSON.parse(localStorage.getItem('consultationHistory') || '[]');
    
    if (history.length === 0) {
        historyList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <div class="empty-text">No saved consultations yet</div>
            </div>
        `;
    } else {
        historyList.innerHTML = history.map(item => {
            const date = new Date(item.lastModified || item.date);
            const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
            const notePreview = item.note ? 
                item.note.replace(/<[^>]*>/g, '').substring(0, 150) + '...' : 
                'No note generated';
            
            return `
                <div class="history-item" onclick="loadConsultation('${item.id}')">
                    <div class="history-date">${formattedDate}</div>
                    <div class="history-patient">${item.patientName}</div>
                    <span class="history-type">${item.visitType}</span>
                    <span class="history-type">${item.template ? item.template.toUpperCase() : 'SOAP'}</span>
                    <span class="history-type">${item.duration || '00:00'}</span>
                    <div class="history-preview">${notePreview}</div>
                </div>
            `;
        }).join('');
    }
    
    modal.classList.add('show');
}

// Close history modal
function closeHistory() {
    const modal = document.getElementById('historyModal');
    modal.classList.remove('show');
}

// Load a consultation from history
function loadConsultation(id) {
    const history = JSON.parse(localStorage.getItem('consultationHistory') || '[]');
    const consultation = history.find(item => item.id === id);
    
    if (consultation) {
        // Stop any current recording
        if (isRecording) {
            stopRecording();
        }
        
        // Set the current consultation ID to continue editing the same record
        currentConsultationId = consultation.id;
        
        // Load the consultation data
        document.getElementById('patientName').value = consultation.patientName;
        document.getElementById('visitType').value = consultation.visitType;
        
        // Load transcript
        currentTranscript = consultation.transcript || '';
        const transcriptContent = document.getElementById('transcriptContent');
        if (consultation.transcript) {
            transcriptContent.innerHTML = `
                <div class="transcript-item">
                    <div class="speaker">Loaded from history</div>
                    <div class="message">${consultation.transcript}</div>
                </div>
            `;
        } else {
            transcriptContent.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📝</div>
                    <div class="empty-text">No transcript available for this consultation</div>
                </div>
            `;
        }
        
        // Load note
        if (consultation.note) {
            document.getElementById('noteContent').innerHTML = consultation.note;
            document.getElementById('editNoteBtn').style.display = 'inline-flex';
        }
        
        // Select template
        selectTemplate(consultation.template);
        
        // Close modal
        closeHistory();
        
        showToast('Consultation loaded from history', 'success');
    }
}

// Clear history
function clearHistory() {
    if (confirm('Are you sure you want to clear all consultation history?')) {
        localStorage.removeItem('consultationHistory');
        showToast('History cleared', 'success');
        showHistory(); // Refresh the modal
    }
}

// Open settings
function openSettings() {
    showToast('Settings feature coming soon');
}

// Handle window close
window.addEventListener('beforeunload', (e) => {
    if (isRecording) {
        e.preventDefault();
        e.returnValue = 'Recording in progress. Are you sure you want to leave?';
    }
});

// Subscription Management Functions
let subscriptionStatus = null;

async function checkSubscriptionStatus() {
    try {
        console.log('Checking subscription status...');
        if (window.electronAPI && window.electronAPI.getSubscriptionStatus) {
            subscriptionStatus = await window.electronAPI.getSubscriptionStatus();
            console.log('Subscription status:', subscriptionStatus);
            updateSubscriptionUI();
        } else {
            console.log('electronAPI.getSubscriptionStatus not available');
        }
    } catch (error) {
        console.error('Error checking subscription status:', error);
    }
}

function updateSubscriptionUI() {
    console.log('Updating subscription UI with:', subscriptionStatus);
    if (!subscriptionStatus) {
        console.log('No subscription status available, using defaults');
        subscriptionStatus = { tier: 'free', remainingToday: 5 };
    }
    
    // Get the subscription badge element
    const badge = document.getElementById('subscriptionBadge');
    console.log('Badge element found:', badge);
    
    if (badge) {
        // Show and update the existing badge
        badge.style.display = 'inline-flex';
        badge.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-right: 12px;
            padding: 6px 12px;
            background: ${subscriptionStatus.tier === 'pro' ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' : '#f3f4f6'};
            color: ${subscriptionStatus.tier === 'pro' ? '#7c2d12' : '#6b7280'};
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        `;
        
        // Add hover effect
        badge.onmouseover = function() {
            this.style.transform = 'scale(1.05)';
            this.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        };
        badge.onmouseout = function() {
            this.style.transform = 'scale(1)';
            this.style.boxShadow = 'none';
        };
        
        if (subscriptionStatus.tier === 'pro') {
            badge.innerHTML = '👑 Pro';
        } else {
            const remaining = subscriptionStatus.remainingToday !== undefined ? subscriptionStatus.remainingToday : 5;
            badge.innerHTML = `Free (${remaining}/5 today)`;
        }
        
        badge.onclick = function() {
            console.log('Badge clicked!');
            showSubscriptionModal();
        };
        
        console.log('Badge updated with:', badge.innerHTML);
    } else {
        console.error('Subscription badge element not found');
    }
}

async function showSubscriptionModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    
    const isProActive = subscriptionStatus && subscriptionStatus.tier === 'pro';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2>MavrkScribe ${isProActive ? 'Pro' : 'Subscription'}</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
            </div>
            <div class="modal-body">
                ${isProActive ? `
                    <div style="text-align: center; padding: 20px;">
                        <div style="font-size: 48px; margin-bottom: 16px;">👑</div>
                        <h3 style="color: var(--primary); margin-bottom: 8px;">Pro Subscription Active</h3>
                        <p style="color: var(--gray-text); margin-bottom: 24px;">Enjoy unlimited transcriptions and all premium features!</p>
                        
                        <div style="background: var(--gray-light); padding: 16px; border-radius: 12px; margin: 20px 0;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <span>Status:</span>
                                <strong style="color: var(--success);">Active</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <span>Daily Limit:</span>
                                <strong>Unlimited</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Total Transcriptions:</span>
                                <strong>${subscriptionStatus.stats?.totalTranscriptions || 0}</strong>
                            </div>
                        </div>
                        
                        <button class="btn btn-secondary" onclick="cancelSubscriptionPrompt()">Cancel Subscription</button>
                    </div>
                ` : `
                    <div style="padding: 20px;">
                        <div style="text-align: center; margin-bottom: 24px;">
                            <h3 style="color: var(--text-dark); margin-bottom: 8px;">Upgrade to Pro</h3>
                            <p style="color: var(--gray-text); font-size: 14px;">Unlock unlimited transcriptions and premium features</p>
                        </div>
                        
                        <!-- Pricing Comparison -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                            <div style="border: 1px solid var(--gray-mid); border-radius: 12px; padding: 20px;">
                                <h4 style="margin-bottom: 12px;">Free</h4>
                                <div style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">$0<span style="font-size: 14px; color: var(--gray-text);">/month</span></div>
                                <ul style="list-style: none; padding: 0;">
                                    <li style="padding: 8px 0;">✓ 5 transcriptions/day</li>
                                    <li style="padding: 8px 0;">✓ Basic templates</li>
                                    <li style="padding: 8px 0;">✓ Local history</li>
                                    <li style="padding: 8px 0; opacity: 0.5;">✗ Priority support</li>
                                </ul>
                            </div>
                            
                            <div style="border: 2px solid var(--primary); border-radius: 12px; padding: 20px; background: var(--primary-light); position: relative;">
                                <div style="position: absolute; top: -12px; right: 20px; background: var(--primary); color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px;">BEST VALUE</div>
                                <h4 style="margin-bottom: 12px; color: var(--primary);">Pro</h4>
                                <div style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">$29<span style="font-size: 14px; color: var(--gray-text);">/month</span></div>
                                <ul style="list-style: none; padding: 0;">
                                    <li style="padding: 8px 0; font-weight: 600;">✓ Unlimited transcriptions</li>
                                    <li style="padding: 8px 0;">✓ All templates</li>
                                    <li style="padding: 8px 0;">✓ Cloud sync</li>
                                    <li style="padding: 8px 0;">✓ Priority support</li>
                                </ul>
                            </div>
                        </div>
                        
                        <!-- Current Usage -->
                        <div style="background: var(--gray-light); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span>Today's Usage:</span>
                                <strong>${5 - (subscriptionStatus?.remainingToday || 0)}/5 transcriptions used</strong>
                            </div>
                            <div style="margin-top: 8px; height: 8px; background: white; border-radius: 4px; overflow: hidden;">
                                <div style="height: 100%; background: var(--primary); width: ${((5 - (subscriptionStatus?.remainingToday || 0)) / 5 * 100)}%; transition: width 0.3s;"></div>
                            </div>
                        </div>
                        
                        <!-- Action Button -->
                        <div style="text-align: center;">
                            <button class="btn btn-primary" style="padding: 14px 32px; font-size: 16px;" id="upgradeButton" onclick="window.subscribeToPro()">
                                Upgrade to Pro - $29/month
                            </button>
                        </div>
                        
                        <p style="text-align: center; color: var(--gray-text); font-size: 12px; margin-top: 16px;">
                            80% cheaper than competitors • Cancel anytime
                        </p>
                    </div>
                `}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add click event to upgrade button
    const upgradeBtn = document.getElementById('upgradeButton');
    if (upgradeBtn) {
        upgradeBtn.addEventListener('click', subscribeToPro);
    }
}

window.subscribeToPro = async function() {
    try {
        console.log('subscribeToPro called');
        const url = 'https://buy.stripe.com/test_28EeVcfnZeXBeU62eIdwc00';
        
        // Update modal FIRST, before opening checkout window
        console.log('Updating modal before opening checkout...');
        
        // Find the subscription modal specifically (the one with the upgrade button)
        const allModals = document.querySelectorAll('.modal');
        let subscriptionModal = null;
        
        for (const modal of allModals) {
            if (modal.innerHTML.includes('MavrkScribe') && modal.innerHTML.includes('upgradeButton')) {
                subscriptionModal = modal;
                break;
            }
        }
        
        if (subscriptionModal) {
            console.log('Subscription modal found, updating content...');
            const modalContent = subscriptionModal.querySelector('.modal-content');
            if (modalContent) {
                modalContent.innerHTML = `
                <div class="modal-header">
                    <h2>Complete Your Payment</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body" style="padding: 40px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 24px;">💳</div>
                    <h3 style="margin-bottom: 16px; color: var(--text-dark);">Opening Checkout...</h3>
                    <p style="color: var(--gray-text); margin-bottom: 24px;">
                        A new window is opening for payment.<br>
                        After completing payment, click the button below to activate Pro.
                    </p>
                    
                    <button class="btn btn-primary" onclick="checkPaymentStatus()" style="padding: 14px 32px; font-size: 16px; margin-bottom: 12px;">
                        ✓ I've Completed Payment
                    </button>
                    
                    <p style="font-size: 12px; color: var(--gray-text);">
                        It may take a few seconds for your payment to process
                    </p>
                    
                    <div style="margin-top: 20px;">
                        <a href="#" onclick="window.open('${url}', '_blank'); return false;" style="color: var(--primary); text-decoration: underline; font-size: 14px;">
                            Checkout didn't open? Click here
                        </a>
                    </div>
                </div>
            `;
                console.log('Subscription modal updated successfully');
            } else {
                console.error('Modal content div not found');
            }
        } else {
            console.error('Subscription modal not found');
        }
        
        // Now open the Stripe checkout window AFTER updating modal
        setTimeout(() => {
            console.log('Opening Stripe checkout window...');
            const checkoutWindow = window.open(url, '_blank');
            showToast('Checkout page opened', 'info');
        }, 100); // Small delay to ensure modal updates first
        
        // Start checking for subscription updates
        startSubscriptionPolling();
        
    } catch (error) {
        console.error('Error opening checkout:', error);
        showToast('Error opening checkout', 'error');
    }
}

// Check payment status and activate subscription
window.checkPaymentStatus = async function() {
    console.log('checkPaymentStatus called');
    
    // Find the modal that contains payment-related content
    const allModals = document.querySelectorAll('.modal');
    let targetModal = null;
    
    for (const modal of allModals) {
        // Skip the history modal
        if (modal.id === 'historyModal') continue;
        
        // Look for the modal with payment content
        if (modal.innerHTML.includes('Complete Your Payment') || 
            modal.innerHTML.includes('Opening Checkout') ||
            modal.innerHTML.includes('Payment in Progress')) {
            targetModal = modal;
            break;
        }
    }
    
    // If not found, look for any visible modal that's not history
    if (!targetModal) {
        for (const modal of allModals) {
            if (modal.id !== 'historyModal' && modal.style.display !== 'none') {
                targetModal = modal;
                break;
            }
        }
    }
    
    console.log('Target modal found:', targetModal);
    
    if (targetModal) {
        const modalContent = targetModal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.innerHTML = `
                <div class="modal-header">
                    <h2>Verify Payment</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body" style="padding: 40px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 24px;">✅</div>
                    <h3 style="margin-bottom: 16px; color: var(--text-dark);">Payment Completed?</h3>
                    <p style="color: var(--gray-text); margin-bottom: 24px;">
                        Enter the email address you used for payment to activate your Pro subscription.
                    </p>
                    
                    <input type="email" id="paymentEmail" placeholder="your@email.com" 
                        style="width: 100%; padding: 12px; border: 1px solid var(--gray-mid); border-radius: 8px; font-size: 16px; margin-bottom: 20px;">
                    
                    <button class="btn btn-primary" onclick="verifyPaymentWithEmail()" style="padding: 14px 32px; font-size: 16px;">
                        Verify & Activate Pro
                    </button>
                    
                    <p style="font-size: 12px; color: var(--gray-text); margin-top: 16px;">
                        It may take a few seconds for your payment to process
                    </p>
                </div>
            `;
            
            // Focus on email input
            setTimeout(() => {
                const emailInput = document.getElementById('paymentEmail');
                if (emailInput) emailInput.focus();
            }, 100);
        }
    }
}

// Verify payment with email
window.verifyPaymentWithEmail = async function() {
    const emailInput = document.getElementById('paymentEmail');
    const email = emailInput ? emailInput.value : '';
    
    if (!email) {
        showToast('Please enter your email address', 'error');
        return;
    }
    
    showToast('Verifying payment...', 'info');
    
    try {
        // Check subscription via API
        const response = await fetch('https://fth8em7xy0.execute-api.ap-southeast-2.amazonaws.com/prod/subscription/check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: email.toLowerCase() })
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Subscription check response:', data);
            
            if (data.subscription && data.subscription.tier === 'pro') {
                // Save email for future checks
                if (window.electronAPI && window.electronAPI.setUserEmail) {
                    await window.electronAPI.setUserEmail(email);
                }
                
                // Update local subscription status
                if (window.electronAPI && window.electronAPI.getSubscriptionStatus) {
                    // Force update subscription manager
                    subscriptionStatus = data.subscription;
                    updateSubscriptionUI();
                }
                
                showToast('🎉 Pro subscription activated!', 'success');
                
                // Close all modals
                const modals = document.querySelectorAll('.modal');
                modals.forEach(modal => modal.remove());
                
                // Refresh subscription status
                setTimeout(() => {
                    checkSubscriptionStatus();
                }, 1000);
            } else {
                showToast('Payment not yet processed. Please try again in a few seconds.', 'warning');
            }
        }
    } catch (error) {
        console.error('Error checking payment:', error);
        showToast('Error verifying payment. Please try again.', 'error');
    }
}

// Poll for subscription updates
let subscriptionPollingInterval = null;

function startSubscriptionPolling() {
    // Stop any existing polling
    if (subscriptionPollingInterval) {
        clearInterval(subscriptionPollingInterval);
    }
    
    // Poll every 5 seconds for 2 minutes
    let pollCount = 0;
    subscriptionPollingInterval = setInterval(async () => {
        pollCount++;
        
        // Stop after 24 attempts (2 minutes)
        if (pollCount > 24) {
            clearInterval(subscriptionPollingInterval);
            subscriptionPollingInterval = null;
            return;
        }
        
        // Check subscription status
        await checkSubscriptionStatus();
        
        // If Pro activated, stop polling
        if (subscriptionStatus && subscriptionStatus.tier === 'pro') {
            clearInterval(subscriptionPollingInterval);
            subscriptionPollingInterval = null;
            
            // Close modal if still open
            const modal = document.querySelector('.modal');
            if (modal && modal.innerHTML.includes('Payment in Progress')) {
                modal.remove();
                showToast('🎉 Pro subscription activated!', 'success');
            }
        }
    }, 5000);
}

// License activation removed - using Stripe payment link only

async function cancelSubscriptionPrompt() {
    if (confirm('Are you sure you want to cancel your Pro subscription? You will lose access to unlimited transcriptions.')) {
        try {
            const result = await window.electronAPI.cancelSubscription();
            showToast('Subscription cancelled', 'info');
            subscriptionStatus = result;
            updateSubscriptionUI();
            document.querySelector('.modal').remove();
        } catch (error) {
            showToast('Error cancelling subscription', 'error');
        }
    }
}