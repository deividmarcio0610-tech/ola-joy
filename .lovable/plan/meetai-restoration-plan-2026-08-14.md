# MeetAI Restoration Plan

Restore the **real-time audio/video pipeline** for the DeividTech AI Copilot, ensuring that transcription and AI responses are synchronized with actual captured content rather than demonstration mocks.

## User Review Required

> [!IMPORTANT]
> This plan focuses on replacing the mock transcription and AI response logic with a real pipeline using browser APIs and server-side processing.

## Proposed Changes

### Core Logic & Pipeline
- **Audio Capture Enhancement**: Refactor `getDisplayMedia` logic to strictly validate and measure the incoming `AudioTrack` signal using `AudioContext`.
- **Mock Removal**: Eliminate hardcoded strings like "Então, conforme discutimos na pauta..." and replace them with a dynamic `transcription` state fed by real STT events.
- **Audio Metering**: Implement a real RMS-based level meter (0-100%) instead of a simulated visualization.
- **Session Management**: Add a `sessionId` system to clear old transcriptions and AI responses when switching sources or restarting.

### Copilot UI & Diagnostics
- **Detailed Diagnostics**: Implement a "Diagnostics" panel showing real-time metrics:
    - Audio Signal (RMS)
    - STT Packet Status
    - LLM Latency
    - Memory Sources count
- **Live Preview Sync**: Ensure the video element correctly renders the captured `MediaStream` without freezing.
- **Teleprompter Integration**: Add a direct "Send to Teleprompter" action for AI suggestions.

### Technical Components
- **Server Functions**: Create a dedicated `getCopilotResponse` server function to handle LLM calls with theme and memory context.
- **Pipeline Telemetry**: Add internal counters for audio chunks produced and bytes sent to monitor the health of the STT stream.

## Technical Details

### Audio Pipeline
```text
[Browser Source] -> [MediaStream] -> [AudioContext/Analyser] -> [Chunks] -> [STT Service] -> [Live Text]
```

### State Management
- `isReconnecting` flag to handle silent source recovery.
- `AbortController` for cancelling pending AI requests when the user stops or switches the source.
- `localStorage` usage for temporary session data to survive accidental reloads.
