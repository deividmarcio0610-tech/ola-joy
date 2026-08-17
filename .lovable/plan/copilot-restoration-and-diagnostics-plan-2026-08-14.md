# Copilot Restoration and Diagnostics Plan

Fixing black preview, audio/STT inconsistency, and incorrect latency calculations in the Copilot.

## Diagnostics and Real-time Status
- Implement deep tracking of `MediaStream` and `MediaStreamTrack` states (live, muted, readyState).
- Add frame advancement detection using `requestVideoFrameCallback` or `requestAnimationFrame`.
- Track actual audio chunks, bytes sent, and STT responses to differentiate between "Socket Open" and "Data Flowing".

## Capture and Preview
- Use the actual `MediaStream` directly in the `<video>` element.
- Avoid canvas-based placeholders or fake "LIVE" status.
- Show specific states: `WAITING`, `CONNECTING`, `LIVE`, `NO_IMAGE`, `ENDED`, `ERROR`.
- Isolation: Ensure the video component doesn't re-render or re-assign `srcObject` unnecessarily.

## Audio and STT Pipeline
- Unified Source: The audio meter and the STT pipeline must share the same `AudioTrack`.
- Real RMS: Replace mock indicators with actual Root Mean Square (RMS) calculations from the audio buffer.
- Remove placeholders: The "Aguardando..." text will be replaced immediately by real partial transcripts.

## Telemetry and Latency
- Decompose "TOTAL" latency into real segments: Network RTT, STT Processing, and AI TTFT (Time to First Token).
- Remove hardcoded latency mocks.

## Technical Details
- **Component Isolation**: Refactor `CapturedVideoPreview` to handle its own internal state and frame detection.
- **AudioWorklet/ScriptProcessor**: Ensure stable audio chunking for STT.
- **Cleanup**: Strict `track.stop()` and `AudioContext.close()` on session end to prevent memory leaks or ghost captures.
