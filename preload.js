const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // AWS Transcribe Medical
  startMedicalTranscription: (options) => ipcRenderer.invoke('start-medical-transcription', options),
  stopMedicalTranscription: () => ipcRenderer.invoke('stop-medical-transcription'),
  sendAudioChunk: (audioData) => ipcRenderer.invoke('send-audio-chunk', audioData),
  getMedicalSpecialties: () => ipcRenderer.invoke('get-medical-specialties'),
  onTranscriptionUpdate: (callback) => ipcRenderer.on('transcription-update', (event, data) => callback(data)),
  onTranscriptionError: (callback) => ipcRenderer.on('transcription-error', (event, data) => callback(data)),
  
  // OpenAI
  chatWithLLM: (message) => ipcRenderer.invoke('chat-with-llm', message),
  hasOpenAIKey: () => ipcRenderer.invoke('has-openai-key'),
  setApiKey: (provider, apiKey) => ipcRenderer.invoke('set-api-key', provider, apiKey),

  // Subscription Management
  getSubscriptionStatus: () => ipcRenderer.invoke('get-subscription-status'),
  getCheckoutUrl: () => ipcRenderer.invoke('get-checkout-url'),
  cancelSubscription: () => ipcRenderer.invoke('cancel-subscription'),
  setUserEmail: (email) => ipcRenderer.invoke('set-user-email', email),
  onSubscriptionStatusUpdated: (callback) => ipcRenderer.on('subscription-status-updated', (event, data) => callback(data)),
});