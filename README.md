# NeuralMail AI

Intent-Aware Prompt Optimization for AI-Based Email Reply Generation Using Large Language Models.

## Features
- Intent Detection (7 classes)
- Prompt Optimization per intent
- Baseline vs Proposed comparison
- PDF attachment analysis
- Image analysis (Gemini Vision)
- Audio transcription (Groq Whisper)
- Prompt injection detection
- Thread-aware context

## Run Locally

### Backend
1. Open `backend/` in IntelliJ
2. Create `backend/src/main/resources/application-local.properties`
3. Add your API keys (see template)
4. Run `EmailWriterApplication`
5. Test: http://localhost:8080/api/email/health

### Chrome Extension
1. Open Chrome → chrome://extensions
2. Enable Developer Mode
3. Load unpacked → select `chrome-extension/` folder
4. Open Gmail → Reply → NeuralMail button
