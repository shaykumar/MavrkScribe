// AWS Transcribe Medical Client Service - HIPAA Compliant
// This service uses AWS Transcribe Medical through the Electron backend

class TranscriptionMedicalService {
    constructor() {
        this.isTranscribing = false;
        this.transcriptionId = null;
        this.transcript = '';
        this.segments = [];
        this.onTranscriptUpdate = null;
        this.onSegmentComplete = null;
        this.onError = null;
        this.currentSpecialty = 'PRIMARYCARE';
        
        // Set up listeners if running in Electron
        this.setupListeners();
    }
    
    setupListeners() {
        if (window.electronAPI) {
            // Listen for transcription updates from backend
            window.electronAPI.onTranscriptionUpdate((data) => {
                console.log('Transcription update received:', data);
                this.handleTranscriptionUpdate(data);
            });
            
            // Listen for errors
            window.electronAPI.onTranscriptionError((data) => {
                console.error('Transcription error:', data);
                if (this.onError) {
                    this.onError(data.error);
                }
            });
        }
    }
    
    async start(callbacks = {}) {
        console.log('Starting AWS Transcribe Medical...');
        console.log('Callbacks provided:', {
            hasTranscriptUpdate: !!callbacks.onTranscriptUpdate,
            hasSegmentComplete: !!callbacks.onSegmentComplete,
            hasError: !!callbacks.onError
        });
        
        this.onTranscriptUpdate = callbacks.onTranscriptUpdate || null;
        this.onSegmentComplete = callbacks.onSegmentComplete || null;
        this.onError = callbacks.onError || null;
        
        if (!window.electronAPI) {
            console.error('Electron API not available');
            if (this.onError) {
                this.onError('AWS Transcribe Medical requires the desktop application');
            }
            return false;
        }
        
        try {
            console.log('Requesting microphone permission...');
            // Request microphone permission
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000
                } 
            });
            console.log('Microphone permission granted, stream active');
            
            console.log('Starting AWS Transcribe Medical with specialty:', this.currentSpecialty);
            // Start AWS Transcribe Medical through backend
            const result = await window.electronAPI.startMedicalTranscription({
                specialty: this.currentSpecialty,
                type: 'CONVERSATION'
            });
            
            console.log('Backend response:', result);
            
            if (result.success) {
                this.isTranscribing = true;
                this.transcriptionId = result.id;
                this.transcript = '';
                this.segments = [];
                
                console.log('AWS Transcribe Medical started successfully with ID:', this.transcriptionId);
                
                // Keep the stream active and start capturing audio
                this.audioStream = stream;
                this.startAudioCapture(stream);
                
                return true;
            } else {
                // Check if it's a subscription limit error
                if (result.needsUpgrade) {
                    console.error('Subscription limit reached:', result.error);
                    // Stop the microphone stream
                    stream.getTracks().forEach(track => track.stop());
                    throw new Error(result.error);
                } else {
                    // AWS Transcribe Medical is required - no fallback
                    console.error('AWS Transcribe Medical not available:', result.error);
                    throw new Error(result.error || 'AWS Transcribe Medical is required.');
                }
            }
        } catch (error) {
            console.error('Error starting AWS Transcribe Medical:', error);
            if (this.onError) {
                this.onError(error.message);
            }
            return false;
        }
    }
    
    startAudioCapture(stream) {
        console.log('Starting PCM audio capture from microphone...');
        
        // Try to use PCMRecorder if available
        if (typeof PCMRecorder !== 'undefined' && PCMRecorder) {
            console.log('Using PCMRecorder for audio capture');
            this.startPCMRecorder(stream);
        } else if (typeof SimplePCMCapture !== 'undefined' && SimplePCMCapture) {
            console.log('Using SimplePCMCapture for audio capture');
            this.startSimplePCMCapture(stream);
        } else {
            console.log('Using inline PCM capture');
            this.startInlinePCMCapture(stream);
        }
    }
    
    startPCMRecorder(stream) {
        try {
            let chunkCount = 0;
            
            this.pcmRecorder = new PCMRecorder(stream, {
                sampleRate: 16000,
                onDataAvailable: (pcmData) => {
                    if (!this.isTranscribing) return;
                    
                    chunkCount++;
                    if (chunkCount % 5 === 0) {
                        console.log(`Sending PCM chunk #${chunkCount}, size: ${pcmData.byteLength} bytes`);
                    }
                    
                    // Send to backend
                    if (window.electronAPI) {
                        window.electronAPI.sendAudioChunk(pcmData).catch(err => {
                            console.error('Error sending audio chunk:', err);
                        });
                    }
                }
            });
            
            this.pcmRecorder.start();
            console.log('PCMRecorder started successfully');
            
        } catch (error) {
            console.error('Error with PCMRecorder:', error);
            this.startInlinePCMCapture(stream);
        }
    }
    
    startSimplePCMCapture(stream) {
        try {
            this.simplePCM = new SimplePCMCapture();
            
            this.simplePCM.start(stream, (pcmData) => {
                if (!this.isTranscribing) return;
                
                // Send to backend
                if (window.electronAPI) {
                    window.electronAPI.sendAudioChunk(pcmData).catch(err => {
                        console.error('Error sending audio chunk:', err);
                    });
                }
            });
            
            console.log('SimplePCMCapture started successfully');
            
        } catch (error) {
            console.error('Error with SimplePCMCapture:', error);
            this.startInlinePCMCapture(stream);
        }
    }
    
    startInlinePCMCapture(stream) {
        try {
            // Inline PCM capture without ScriptProcessor to avoid crashes
            const audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });
            
            const source = audioContext.createMediaStreamSource(stream);
            
            // Use analyser node to get audio data
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            
            // Store references
            this.audioContext = audioContext;
            this.analyser = analyser;
            this.source = source;
            
            // Start periodic audio capture
            let chunkCount = 0;
            this.captureInterval = setInterval(() => {
                if (!this.isTranscribing) {
                    clearInterval(this.captureInterval);
                    return;
                }
                
                // Get time domain data
                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Float32Array(bufferLength);
                analyser.getFloatTimeDomainData(dataArray);
                
                // Convert to PCM16
                const pcm16 = new Int16Array(bufferLength);
                for (let i = 0; i < bufferLength; i++) {
                    const sample = Math.max(-1, Math.min(1, dataArray[i]));
                    pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                }
                
                chunkCount++;
                if (chunkCount % 10 === 0) {
                    console.log(`Capturing audio chunk #${chunkCount}`);
                }
                
                // Send to backend
                if (window.electronAPI && pcm16.byteLength > 0) {
                    window.electronAPI.sendAudioChunk(pcm16.buffer).catch(err => {
                        console.error('Error sending audio:', err);
                    });
                }
            }, 100); // Capture every 100ms
            
            console.log('Inline PCM capture started');
            
        } catch (error) {
            console.error('Error starting inline PCM capture:', error);
            this.startMediaRecorderFallback(stream);
        }
    }
    
    startMediaRecorderFallback(stream) {
        console.log('Falling back to MediaRecorder...');
        
        try {
            // Try to use PCM mime type if available
            const mimeTypes = [
                'audio/pcm',
                'audio/wav',
                'audio/webm;codecs=pcm',
                'audio/webm'
            ];
            
            let mimeType = 'audio/webm'; // default
            for (const type of mimeTypes) {
                if (MediaRecorder.isTypeSupported(type)) {
                    mimeType = type;
                    console.log('Using mime type:', mimeType);
                    break;
                }
            }
            
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: mimeType,
                audioBitsPerSecond: 128000
            });
            
            let chunkCount = 0;
            
            mediaRecorder.ondataavailable = async (event) => {
                if (event.data.size > 0 && this.isTranscribing) {
                    chunkCount++;
                    console.log(`MediaRecorder chunk #${chunkCount}, size: ${event.data.size}`);
                    // Note: This won't work with AWS Transcribe without conversion
                    console.warn('MediaRecorder fallback - audio format may not be compatible with AWS Transcribe');
                }
            };
            
            mediaRecorder.start(1000);
            this.mediaRecorder = mediaRecorder;
            
        } catch (error) {
            console.error('Failed to start MediaRecorder fallback:', error);
        }
    }
    
    handleTranscriptionUpdate(data) {
        console.log('Received transcription update:', data);
        
        // Check if this is for the current session (even if just stopped)
        if (data.id !== this.transcriptionId) {
            console.log('Ignoring update - wrong session ID');
            return;
        }
        
        // Process the update even if we just stopped (to capture final results)
        if (data.isFinal) {
            // Final transcript segment
            this.processFinalTranscript(data);
        } else {
            // Interim/partial transcript - only process if still transcribing
            if (this.isTranscribing) {
                this.processInterimTranscript(data);
            }
        }
    }
    
    processFinalTranscript(data) {
        console.log('Processing final transcript:', data.text);
        
        // Don't skip short segments - they might be part of speech
        if (!data.text || data.text.trim().length === 0) {
            console.log('Skipping empty segment');
            return;
        }
        
        // Add to full transcript
        this.transcript += data.text + ' ';
        
        // Create segment
        const segment = {
            speaker: data.speaker || this.detectSpeaker(data.text),
            text: data.text,
            timestamp: data.timestamp,
            entities: data.entities || []
        };
        
        this.segments.push(segment);
        
        // Extract medical entities
        if (data.entities && data.entities.length > 0) {
            this.processMedicalEntities(data.entities);
        }
        
        // Notify callbacks - these should still work even after stopping
        if (this.onSegmentComplete) {
            console.log('Calling onSegmentComplete with:', segment);
            try {
                this.onSegmentComplete(segment);
            } catch (error) {
                console.error('Error in onSegmentComplete callback:', error);
            }
        }
        
        if (this.onTranscriptUpdate) {
            console.log('Calling onTranscriptUpdate with transcript length:', this.transcript.length);
            try {
                this.onTranscriptUpdate(this.transcript, false);
            } catch (error) {
                console.error('Error in onTranscriptUpdate callback:', error);
            }
        }
    }
    
    processInterimTranscript(data) {
        console.log('Processing interim transcript:', data.text);
        
        // Show interim results for better UX
        if (this.onTranscriptUpdate && data.text) {
            const interimTranscript = this.transcript + data.text;
            this.onTranscriptUpdate(interimTranscript, true);
        }
    }
    
    processMedicalEntities(entities) {
        // Group medical entities by type
        const medicalData = {
            medications: [],
            conditions: [],
            procedures: [],
            anatomy: [],
            tests: []
        };
        
        entities.forEach(entity => {
            const entityInfo = {
                text: entity.Text,
                type: entity.Type,
                confidence: entity.Score
            };
            
            switch (entity.Category) {
                case 'MEDICATION':
                    medicalData.medications.push(entityInfo);
                    break;
                case 'MEDICAL_CONDITION':
                    medicalData.conditions.push(entityInfo);
                    break;
                case 'TEST_TREATMENT_PROCEDURE':
                    medicalData.procedures.push(entityInfo);
                    break;
                case 'ANATOMY':
                    medicalData.anatomy.push(entityInfo);
                    break;
                case 'TEST_NAME':
                case 'TEST_VALUE':
                    medicalData.tests.push(entityInfo);
                    break;
            }
        });
        
        // Log extracted medical information
        if (Object.keys(medicalData).some(key => medicalData[key].length > 0)) {
            console.log('Medical entities extracted:', medicalData);
            
            // You can display this in a separate panel or highlight in the transcript
            this.displayMedicalEntities(medicalData);
        }
    }
    
    displayMedicalEntities(medicalData) {
        // Update a medical entities panel if it exists
        const entitiesPanel = document.getElementById('medicalEntities');
        if (entitiesPanel) {
            let html = '';
            
            if (medicalData.medications.length > 0) {
                html += '<div class="entity-group"><strong>Medications:</strong> ';
                html += medicalData.medications.map(m => m.text).join(', ');
                html += '</div>';
            }
            
            if (medicalData.conditions.length > 0) {
                html += '<div class="entity-group"><strong>Conditions:</strong> ';
                html += medicalData.conditions.map(c => c.text).join(', ');
                html += '</div>';
            }
            
            if (medicalData.procedures.length > 0) {
                html += '<div class="entity-group"><strong>Procedures:</strong> ';
                html += medicalData.procedures.map(p => p.text).join(', ');
                html += '</div>';
            }
            
            entitiesPanel.innerHTML = html;
        }
    }
    
    detectSpeaker(text) {
        // Intelligent speaker detection based on medical context
        const doctorPhrases = [
            'i recommend', 'prescribed', 'diagnosis', 'examination shows',
            'let me examine', 'blood pressure', 'temperature', 
            'any allergies', 'medical history', 'follow up',
            'take this medication', 'dosage', 'side effects'
        ];
        
        const patientPhrases = [
            'i feel', 'it hurts', 'i have been', 'my symptoms',
            'started yesterday', 'for days', 'getting worse',
            'i am taking', 'allergic to', 'family history'
        ];
        
        const lowerText = text.toLowerCase();
        
        const doctorScore = doctorPhrases.filter(p => lowerText.includes(p)).length;
        const patientScore = patientPhrases.filter(p => lowerText.includes(p)).length;
        
        if (doctorScore > patientScore) {
            return 'Doctor';
        } else if (patientScore > doctorScore) {
            return 'Patient';
        }
        
        return 'Speaker';
    }
    
    async stop() {
        console.log('Stopping transcription...');
        if (!this.isTranscribing) return { transcript: this.transcript, segments: this.segments };
        
        // Mark as not transcribing but keep callbacks active for final results
        this.isTranscribing = false;
        
        // Wait a bit for final transcription results to arrive
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Stop PCM Recorder if it exists
        if (this.pcmRecorder) {
            this.pcmRecorder.stop();
            this.pcmRecorder = null;
        }
        
        // Stop SimplePCMCapture if it exists
        if (this.simplePCM) {
            this.simplePCM.stop();
            this.simplePCM = null;
        }
        
        // Stop capture interval
        if (this.captureInterval) {
            clearInterval(this.captureInterval);
            this.captureInterval = null;
        }
        
        // Stop audio nodes
        if (this.analyser) {
            this.analyser.disconnect();
            this.analyser = null;
        }
        
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        
        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }
        
        // Stop MediaRecorder if it exists
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            this.mediaRecorder = null;
        }
        
        // Stop audio context
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        // Stop the audio stream
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }
        
        // Stop AWS Transcribe Medical
        if (window.electronAPI) {
            await window.electronAPI.stopMedicalTranscription();
        }
        
        console.log('Transcription stopped');
        
        return {
            transcript: this.transcript,
            segments: this.segments
        };
    }
    
    async setSpecialty(specialty) {
        this.currentSpecialty = specialty;
        
        // If currently transcribing, restart with new specialty
        if (this.isTranscribing) {
            await this.stop();
            await this.start({
                onTranscriptUpdate: this.onTranscriptUpdate,
                onSegmentComplete: this.onSegmentComplete,
                onError: this.onError
            });
        }
    }
    
    async getAvailableSpecialties() {
        if (window.electronAPI) {
            return await window.electronAPI.getMedicalSpecialties();
        }
        return [
            { value: 'PRIMARYCARE', label: 'Primary Care' },
            { value: 'CARDIOLOGY', label: 'Cardiology' },
            { value: 'NEUROLOGY', label: 'Neurology' },
            { value: 'ONCOLOGY', label: 'Oncology' },
            { value: 'RADIOLOGY', label: 'Radiology' },
            { value: 'UROLOGY', label: 'Urology' }
        ];
    }
    
    getTranscript() {
        return this.transcript;
    }
    
    getSegments() {
        return this.segments;
    }
    
    clear() {
        this.transcript = '';
        this.segments = [];
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TranscriptionMedicalService;
}