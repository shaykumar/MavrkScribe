// AWS Transcribe Medical Service - HIPAA Compliant
// Real-time medical transcription using AWS Transcribe Medical Streaming

const { TranscribeStreamingClient, StartMedicalStreamTranscriptionCommand } = require('@aws-sdk/client-transcribe-streaming');
const { PassThrough } = require('stream');

class AWSTranscribeMedical {
    constructor() {
        this.client = null;
        this.micStream = null;
        this.transcribeStream = null;
        this.isTranscribing = false;
        
        // Configure AWS client
        this.initializeClient();
    }
    
    initializeClient() {
        // Initialize AWS Transcribe Medical Streaming client
        // Use maverick-cdk profile
        const { fromIni } = require('@aws-sdk/credential-provider-ini');
        
        this.client = new TranscribeStreamingClient({
            region: process.env.AWS_REGION || 'ap-southeast-2',  // Sydney region for maverick-cdk
            credentials: fromIni({ profile: 'maverick-cdk' })
        });
    }
    
    async startTranscription(options = {}) {
        if (this.isTranscribing) {
            console.log('Transcription already in progress');
            return { success: false, error: 'Already transcribing' };
        }
        
        console.log('Starting AWS Transcribe Medical with options:', options);
        
        const {
            specialty = 'PRIMARYCARE', // PRIMARYCARE, CARDIOLOGY, NEUROLOGY, ONCOLOGY, RADIOLOGY, UROLOGY
            type = 'CONVERSATION',      // CONVERSATION or DICTATION
            onTranscript,
            onError,
            audioStream  // Pass audio stream from frontend
        } = options;
        
        this.isTranscribing = true;
        this.onTranscript = onTranscript;
        this.onError = onError;
        
        try {
            console.log('Creating audio stream...');
            // Create a passthrough stream for audio with proper settings
            const stream = new PassThrough({
                highWaterMark: 1024 * 16 // 16KB buffer
            });
            this.audioStream = stream;
            this.chunkCount = 0;
            
            // No buffering - send directly
            this.audioChunks = [];
            this.chunkTimer = null;
            
            console.log('Configuring transcription parameters...');
            // Configure transcription parameters
            const params = {
                LanguageCode: 'en-US',
                MediaEncoding: 'pcm',
                MediaSampleRateHertz: 16000,
                Specialty: specialty,
                Type: type,
                EnableChannelIdentification: false,
                ShowSpeakerLabel: true,
                AudioStream: this.createAudioPayloadStream(stream)
            };
            
            console.log('Sending command to AWS Transcribe Medical...');
            // Start medical transcription
            const command = new StartMedicalStreamTranscriptionCommand(params);
            const response = await this.client.send(command);
            
            console.log('AWS Transcribe Medical stream started successfully');
            
            // Process transcription results in background
            this.processTranscriptionStream(response.TranscriptResultStream, {
                onTranscript,
                onError
            }).catch(err => {
                console.error('Stream processing error:', err);
                if (onError) onError(err);
                this.stopTranscription();
            });
            
            // No chunk timer needed - sending directly
            
            return { success: true };
            
        } catch (error) {
            console.error('Error starting AWS Transcribe Medical:', error);
            console.error('Error details:', error.message, error.code);
            if (onError) onError(error);
            this.isTranscribing = false;
            return { success: false, error: error.message };
        }
    }
    
    // Accept audio chunks from the frontend
    sendAudioChunk(audioData) {
        if (this.isTranscribing && this.audioStream) {
            try {
                // Convert audio data to buffer if needed
                const buffer = Buffer.from(audioData);
                
                if (!this.chunkCount) this.chunkCount = 0;
                this.chunkCount++;
                
                // Log first few chunks and periodic updates
                if (this.chunkCount <= 3 || this.chunkCount % 10 === 0) {
                    console.log(`Writing chunk #${this.chunkCount} to stream, size: ${buffer.length} bytes`);
                }
                
                // Write directly to stream
                const written = this.audioStream.write(buffer);
                
                if (!written) {
                    console.log('Stream backpressure detected');
                    // Force drain the stream
                    this.audioStream.once('drain', () => {
                        console.log('Stream drained, ready for more data');
                    });
                }
                
                return { success: true };
            } catch (error) {
                console.error('Error sending audio chunk:', error);
                return { success: false, error: error.message };
            }
        } else {
            if (!this.isTranscribing) {
                console.log('Cannot send audio - not transcribing');
            } else if (!this.audioStream) {
                console.log('Cannot send audio - stream not ready');
            }
            return { success: false, error: 'Not ready' };
        }
    }
    
    // Handle backpressure by sending buffered chunks
    startChunkTimer() {
        console.log('Starting backpressure handler');
        this.chunkTimer = setInterval(() => {
            // Only process if there are buffered chunks (from backpressure)
            if (this.audioChunks && this.audioChunks.length > 0 && this.audioStream) {
                const chunks = this.audioChunks.splice(0, Math.min(5, this.audioChunks.length));
                let sent = 0;
                for (const chunk of chunks) {
                    try {
                        if (this.audioStream.write(chunk)) {
                            sent++;
                        } else {
                            // Put back if still backpressure
                            this.audioChunks.unshift(chunk);
                            break;
                        }
                    } catch (error) {
                        console.error('Error writing buffered chunk:', error);
                    }
                }
                if (sent > 0) {
                    console.log(`Cleared ${sent} buffered chunks from backpressure`);
                }
            }
        }, 1000); // Check every second
    }
    
    async* createAudioPayloadStream(audioStream) {
        console.log('Starting audio payload stream generator');
        let chunksSent = 0;
        
        try {
            // Convert audio stream to format required by AWS Transcribe Medical
            for await (const chunk of audioStream) {
                chunksSent++;
                if (chunksSent % 10 === 0) {
                    console.log(`Audio generator sent ${chunksSent} chunks to AWS Transcribe`);
                }
                yield { AudioEvent: { AudioChunk: chunk } };
            }
        } catch (error) {
            console.error('Error in audio payload stream:', error);
            throw error;
        } finally {
            console.log(`Audio payload stream ended after ${chunksSent} chunks`);
        }
    }
    
    async processTranscriptionStream(transcriptStream, callbacks) {
        const { onTranscript, onError } = callbacks;
        
        console.log('Starting to process transcription stream...');
        let eventCount = 0;
        
        try {
            for await (const event of transcriptStream) {
                eventCount++;
                
                if (event.TranscriptEvent) {
                    const results = event.TranscriptEvent.Transcript.Results;
                    console.log(`Received TranscriptEvent #${eventCount} with ${results.length} results`);
                    
                    for (const result of results) {
                        if (!result.IsPartial) {
                            // Final transcript
                            const transcript = result.Alternatives[0].Transcript;
                            const items = result.Alternatives[0].Items || [];
                            
                            console.log('AWS Final transcript:', transcript);
                            
                            // Extract medical entities if available
                            const entities = result.Alternatives[0].Entities || [];
                            
                            // Determine speaker
                            let speaker = 'Speaker';
                            if (items.length > 0 && items[0].Speaker !== undefined) {
                                speaker = items[0].Speaker === '0' ? 'Doctor' : 'Patient';
                            }
                            
                            if (onTranscript) {
                                onTranscript({
                                    text: transcript,
                                    speaker: speaker,
                                    entities: entities,
                                    timestamp: new Date().toISOString(),
                                    isFinal: true
                                });
                            } else {
                                console.warn('No onTranscript callback!');
                            }
                        } else {
                            // Partial transcript (interim results)
                            const transcript = result.Alternatives[0].Transcript;
                            
                            if (transcript) {
                                console.log('AWS Interim transcript:', transcript);
                            }
                            
                            if (onTranscript) {
                                onTranscript({
                                    text: transcript,
                                    speaker: 'Speaker',
                                    entities: [],
                                    timestamp: new Date().toISOString(),
                                    isFinal: false
                                });
                            } else {
                                console.warn('No onTranscript callback for interim!');
                            }
                        }
                    }
                } else {
                    console.log(`Event #${eventCount} - No TranscriptEvent, other event type:`, Object.keys(event));
                }
            }
        } catch (error) {
            console.error('Error processing transcription stream:', error);
            if (onError) onError(error);
        }
    }
    
    stopTranscription() {
        this.isTranscribing = false;
        
        // Clear chunk timer
        if (this.chunkTimer) {
            clearInterval(this.chunkTimer);
            this.chunkTimer = null;
        }
        
        // Clear buffered chunks
        this.audioChunks = [];
        
        if (this.audioStream) {
            this.audioStream.end();
            this.audioStream = null;
        }
        
        if (this.transcribeStream) {
            this.transcribeStream.destroy();
            this.transcribeStream = null;
        }
        
        return { success: true };
    }
    
    // Get available medical specialties
    getSpecialties() {
        return [
            { value: 'PRIMARYCARE', label: 'Primary Care' },
            { value: 'CARDIOLOGY', label: 'Cardiology' },
            { value: 'NEUROLOGY', label: 'Neurology' },
            { value: 'ONCOLOGY', label: 'Oncology' },
            { value: 'RADIOLOGY', label: 'Radiology' },
            { value: 'UROLOGY', label: 'Urology' }
        ];
    }
    
    // Extract medical information from entities
    extractMedicalInfo(entities) {
        const medicalInfo = {
            medications: [],
            conditions: [],
            procedures: [],
            anatomy: [],
            testResults: []
        };
        
        entities.forEach(entity => {
            switch (entity.Category) {
                case 'MEDICATION':
                    medicalInfo.medications.push({
                        name: entity.Text,
                        type: entity.Type,
                        confidence: entity.Score
                    });
                    break;
                case 'MEDICAL_CONDITION':
                    medicalInfo.conditions.push({
                        name: entity.Text,
                        type: entity.Type,
                        confidence: entity.Score
                    });
                    break;
                case 'TEST_TREATMENT_PROCEDURE':
                    medicalInfo.procedures.push({
                        name: entity.Text,
                        type: entity.Type,
                        confidence: entity.Score
                    });
                    break;
                case 'ANATOMY':
                    medicalInfo.anatomy.push({
                        name: entity.Text,
                        type: entity.Type,
                        confidence: entity.Score
                    });
                    break;
                case 'TEST_NAME':
                case 'TEST_VALUE':
                case 'TEST_UNIT':
                    medicalInfo.testResults.push({
                        name: entity.Text,
                        type: entity.Type,
                        category: entity.Category,
                        confidence: entity.Score
                    });
                    break;
            }
        });
        
        return medicalInfo;
    }
    
    // Send test audio to verify the stream works
    sendTestAudio(stream) {
        console.log('Sending test audio to verify stream...');
        
        // Generate a simple sine wave tone at 440Hz (A4 note)
        const sampleRate = 16000;
        const frequency = 440;
        const duration = 0.5; // 500ms
        const numSamples = sampleRate * duration;
        
        const audioData = new Int16Array(numSamples);
        
        for (let i = 0; i < numSamples; i++) {
            // Generate sine wave
            const t = i / sampleRate;
            const sample = Math.sin(2 * Math.PI * frequency * t);
            
            // Convert to Int16 range
            audioData[i] = Math.floor(sample * 0x7FFF * 0.3); // 30% volume
        }
        
        // Send the test audio
        const buffer = Buffer.from(audioData.buffer);
        stream.write(buffer);
        
        console.log(`Sent ${buffer.length} bytes of test audio (440Hz tone)`);
        
        // Send silence after the tone
        const silenceBuffer = Buffer.alloc(3200, 0); // 100ms of silence
        stream.write(silenceBuffer);
        
        console.log('Test audio sent, stream should be active');
    }
}

module.exports = AWSTranscribeMedical;