# Copilot Performance Optimization Plan

Optimize the **DEIVIDTECH AI Copilot** to resolve video stuttering, audio gaps, and cumulative latency, ensuring a true real-time experience for professional meetings and interviews.

## Proposed Changes

### 1. Media Pipeline Optimization
- **Efficiency Constraints**: Update `getDisplayMedia` to request `1280x720` at `15-30 FPS` (never 60 FPS) to reduce GPU/CPU overhead.
- **Audio Worklet Isolation**: Move RMS calculation and chunking logic to an `AudioWorklet` (or at least out of the main React render cycle) to prevent UI blocking.
- **Backpressure Control**: Implement a buffer monitor to drop stale audio chunks if the STT service falls behind, preventing latency from "stacking" over time.

### 2. React Rendering Efficiency
- **Component Splitting**: Isolate the `<video>` preview into a memoized `CapturedVideoPreview` component.
- **Ref-Based Stream Management**: Store the `MediaStream` in a `useRef` to prevent re-initializing the video element on every state update (like token streaming or audio meter updates).
- **Throttled UI Updates**: Limit the audio level and partial transcription updates to a maximum of 15 FPS.

### 3. Real Diagnostics & Telemetry
- **De-mocking Latency**: Remove hardcoded "320ms" and implement real measurement for:
    - **Capture Latency**: Local processing time.
    - **Network RTT**: Actual round-trip to the server.
    - **AI TTFT**: Time To First Token for the LLM.
- **Performance Tiers**: Add a "Processing Mode" selector (Low Latency, Balanced, High Precision).

### 4. Memory & Resource Cleanup
- **Strict Disposal**: Ensure every `AudioContext`, `MediaStreamTrack`, and `AbortController` is properly closed when stopping or switching sources.
- **History Management**: Implement a sliding window for conversation history to prevent prompt bloat in long meetings.

## Technical Details

### Render Isolation Architecture
```text
[Parent CopilotoPage]
  ├─ [CapturedVideoPreview] (Memoized, uses streamRef)
  ├─ [AudioMeter] (Throttled update)
  ├─ [AIResponseDisplay] (Streaming-optimized)
  └─ [DiagnosticsPanel] (Real metrics)
```

### Audio Processing Flow
```text
AudioTrack -> AudioWorklet -> PCM Buffer -> WebSocket -> STT -> Debounced UI
```
