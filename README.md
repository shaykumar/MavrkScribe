# MavrkScribe

AI-powered medical scribe application for healthcare professionals.

## Features

- **Real-time Medical Transcription**: Uses AWS Transcribe Medical for HIPAA-compliant voice-to-text conversion
- **AI Clinical Notes**: Generates structured clinical notes using OpenAI GPT-4
- **Multiple Templates**: SOAP, Consultation, and Progress note formats
- **Consultation History**: Save and retrieve past consultations with UUID-based deduplication
- **Manual Notes**: Add custom notes during transcription
- **Export Options**: Print or copy clinical notes
- **Keyboard Shortcuts**: Efficient workflow with keyboard commands

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in `.env`:
```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
OPENAI_API_KEY=your_openai_api_key
```

3. Run the application:
```bash
npm start
```

## Building

To build the application for distribution:

```bash
# For macOS
npm run dist

# For all platforms
npm run build
```

## Keyboard Shortcuts

- `Cmd/Ctrl + N` - New consultation
- `Cmd/Ctrl + S` - Save to history
- `Cmd/Ctrl + H` - View history
- `Cmd/Ctrl + P` - Print note
- `Cmd/Ctrl + M` - Focus manual note input
- `Escape` - Close modals

## Requirements

- Node.js 16+
- AWS account with Transcribe Medical access
- OpenAI API key
- Microphone access

## Security

- HIPAA-compliant AWS Transcribe Medical
- Local storage for consultation history
- No data transmitted to external servers except AWS and OpenAI
- Secure credential management via environment variables

## License

MIT License - Copyright (c) 2024 Mavrk