// Simple PCM Audio Capture for AWS Transcribe Medical
// Uses MediaRecorder with conversion to PCM

class SimplePCMCapture {
    constructor() {
        this.mediaRecorder = null;
        this.audioContext = null;
        this.isRecording = false;
    }
    
    async start(stream, onData) {
        console.log('Starting SimplePCMCapture...');
        
        try {
            // Create audio context for conversion
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000 // AWS Transcribe requires 16kHz
            });
            
            // Try to use MediaRecorder with PCM if supported
            const mimeTypes = [
                'audio/webm;codecs=pcm',
                'audio/webm'
            ];
            
            let selectedMimeType = 'audio/webm';
            for (const mimeType of mimeTypes) {
                if (MediaRecorder.isTypeSupported(mimeType)) {
                    selectedMimeType = mimeType;
                    console.log('Using MIME type:', selectedMimeType);
                    break;
                }
            }
            
            // Create MediaRecorder
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: selectedMimeType,
                audioBitsPerSecond: 128000
            });
            
            let chunkCount = 0;
            
            // Handle data available
            this.mediaRecorder.ondataavailable = async (event) => {
                if (event.data.size > 0 && this.isRecording) {
                    chunkCount++;
                    
                    try {
                        // Convert blob to PCM
                        const arrayBuffer = await event.data.arrayBuffer();
                        
                        // Decode audio data to PCM
                        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice());
                        
                        // Get PCM data from first channel
                        const channelData = audioBuffer.getChannelData(0);
                        
                        // Convert Float32 to Int16
                        const pcm16 = new Int16Array(channelData.length);
                        for (let i = 0; i < channelData.length; i++) {
                            const sample = Math.max(-1, Math.min(1, channelData[i]));
                            pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                        }
                        
                        if (chunkCount % 5 === 0) {
                            console.log(`Converted audio chunk #${chunkCount} to PCM, size: ${pcm16.byteLength} bytes`);
                        }
                        
                        // Send PCM data
                        if (onData) {
                            onData(pcm16.buffer);
                        }
                        
                    } catch (error) {
                        // If decoding fails, try sending raw data
                        if (chunkCount % 5 === 0) {
                            console.log(`Sending raw audio chunk #${chunkCount}, size: ${event.data.size} bytes`);
                        }
                        
                        const buffer = await event.data.arrayBuffer();
                        if (onData) {
                            onData(buffer);
                        }
                    }
                }
            };
            
            // Start recording
            this.isRecording = true;
            this.mediaRecorder.start(250); // Get chunks every 250ms
            
            console.log('SimplePCMCapture started successfully');
            return true;
            
        } catch (error) {
            console.error('Error starting SimplePCMCapture:', error);
            return false;
        }
    }
    
    stop() {
        this.isRecording = false;
        
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            this.mediaRecorder = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        console.log('SimplePCMCapture stopped');
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SimplePCMCapture;
}