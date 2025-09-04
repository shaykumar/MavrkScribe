// PCM Audio Recorder using Web Audio API
// Records audio in PCM format for AWS Transcribe Medical

class PCMRecorder {
    constructor(stream, options = {}) {
        this.stream = stream;
        this.sampleRate = options.sampleRate || 16000;
        this.onDataAvailable = options.onDataAvailable || null;
        this.audioContext = null;
        this.processor = null;
        this.source = null;
        this.isRecording = false;
        this.bufferQueue = [];
        this.processingInterval = null;
    }
    
    async start() {
        if (this.isRecording) {
            console.log('Already recording');
            return false;
        }
        
        try {
            // Create audio context with desired sample rate
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate
            });
            
            // Create source from stream
            this.source = this.audioContext.createMediaStreamSource(this.stream);
            
            // Use AudioWorklet if available, otherwise fall back to ScriptProcessor
            if (this.audioContext.audioWorklet) {
                await this.startWithAudioWorklet();
            } else {
                this.startWithScriptProcessor();
            }
            
            this.isRecording = true;
            
            // Start processing buffered audio
            this.startProcessingBuffer();
            
            console.log('PCM recording started');
            return true;
            
        } catch (error) {
            console.error('Failed to start PCM recording:', error);
            return false;
        }
    }
    
    async startWithAudioWorklet() {
        console.log('Using AudioWorklet for PCM capture');
        
        // Create inline worklet processor code
        const processorCode = `
            class PCMProcessor extends AudioWorkletProcessor {
                constructor() {
                    super();
                    this.buffer = [];
                    this.bufferSize = 2048; // Smaller buffer for lower latency
                }
                
                process(inputs, outputs, parameters) {
                    const input = inputs[0];
                    if (input && input[0]) {
                        const inputData = input[0];
                        
                        // Add to buffer
                        for (let i = 0; i < inputData.length; i++) {
                            this.buffer.push(inputData[i]);
                        }
                        
                        // Send when buffer is full
                        if (this.buffer.length >= this.bufferSize) {
                            // Convert float32 to int16
                            const pcm16 = new Int16Array(this.buffer.length);
                            for (let i = 0; i < this.buffer.length; i++) {
                                const sample = Math.max(-1, Math.min(1, this.buffer[i]));
                                pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                            }
                            
                            // Send to main thread
                            this.port.postMessage({
                                type: 'audio',
                                data: pcm16.buffer
                            }, [pcm16.buffer]);
                            
                            // Clear buffer
                            this.buffer = [];
                        }
                    }
                    
                    return true; // Keep processor running
                }
            }
            
            registerProcessor('pcm-processor', PCMProcessor);
        `;
        
        // Create blob URL for worklet
        const blob = new Blob([processorCode], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        
        // Load and create worklet
        await this.audioContext.audioWorklet.addModule(workletUrl);
        const workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');
        
        // Handle messages from worklet
        workletNode.port.onmessage = (event) => {
            if (event.data.type === 'audio' && this.isRecording) {
                this.bufferQueue.push(event.data.data);
            }
        };
        
        // Connect audio graph
        this.source.connect(workletNode);
        workletNode.connect(this.audioContext.destination);
        
        this.processor = workletNode;
        
        // Clean up blob URL
        URL.revokeObjectURL(workletUrl);
    }
    
    startWithScriptProcessor() {
        console.log('Using ScriptProcessor for PCM capture (fallback)');
        
        const bufferSize = 2048; // Smaller buffer for lower latency
        this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
        
        this.processor.onaudioprocess = (e) => {
            if (!this.isRecording) return;
            
            const inputData = e.inputBuffer.getChannelData(0);
            
            // Convert float32 to int16
            const pcm16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                const sample = Math.max(-1, Math.min(1, inputData[i]));
                pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            }
            
            // Send immediately for lower latency
            if (this.onDataAvailable) {
                this.onDataAvailable(pcm16.buffer);
            }
        };
        
        // Connect audio graph with muted output to avoid echo
        this.source.connect(this.processor);
        
        // Create a gain node set to 0 to mute output
        const muteNode = this.audioContext.createGain();
        muteNode.gain.value = 0;
        this.processor.connect(muteNode);
        muteNode.connect(this.audioContext.destination);
    }
    
    startProcessingBuffer() {
        // Process buffered audio chunks more frequently
        this.processingInterval = setInterval(() => {
            if (this.bufferQueue.length > 0 && this.onDataAvailable) {
                // Send chunks immediately, don't wait to combine
                while (this.bufferQueue.length > 0) {
                    const chunk = this.bufferQueue.shift();
                    if (chunk && chunk.byteLength > 0) {
                        this.onDataAvailable(chunk);
                    }
                }
            }
        }, 50); // Process every 50ms for lower latency
    }
    
    stop() {
        this.isRecording = false;
        
        // Clear processing interval
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
        
        // Disconnect audio nodes
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        
        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }
        
        // Close audio context
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        // Clear buffer
        this.bufferQueue = [];
        
        console.log('PCM recording stopped');
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PCMRecorder;
}