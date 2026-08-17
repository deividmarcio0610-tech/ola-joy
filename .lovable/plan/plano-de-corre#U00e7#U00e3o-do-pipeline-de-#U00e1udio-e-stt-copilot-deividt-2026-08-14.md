# Plano de Correção do Pipeline de Áudio e STT - COPILOT DEIVIDTECH AI

Este plano visa resolver a falha onde o vídeo é capturado corretamente, mas a transcrição não ocorre, permanecendo em estado de "Aguardando áudio real". A estratégia foca na instrumentação profunda do áudio, unificação do pipeline e calibração dinâmica.

## 1. Instrumentação e Diagnóstico Profundo
*   **AudioTrack Audit**: Exibir no painel de diagnóstico todos os metadados da track de áudio capturada (`id`, `label`, `enabled`, `muted`, `readyState`).
*   **Métricas Reais**: Substituir animações/mocks por cálculos reais de RMS, Peak e dBFS no `AudioWorklet`.
*   **Contadores de Pipeline**: Implementar contadores exatos para `audioFramesProduced`, `chunksSent` e `bytesSent` para identificar exatamente onde o fluxo é interrompido.

## 2. Unificação e Processamento de Áudio
*   **Single Audio Source**: Garantir que a mesma `AudioTrack` do `getDisplayMedia` alimente o medidor visual, o VAD (Voice Activity Detection) e o streaming para o STT.
*   **AudioContext & Gain**: Adicionar um `GainNode` exclusivo para o pipeline de STT, permitindo ganho automático sem afetar o volume ouvido pelo usuário.
*   **Resampling & Formatting**: Garantir a conversão correta de 48kHz (ou nativo) para 16kHz Mono PCM16, conforme esperado pelos backends de STT profissionais.

## 3. Calibração e Detecção Adaptativa
*   **VAD Adaptativo**: Implementar medição inicial de ruído de fundo (noise floor) para ajustar o threshold de fala dinamicamente, evitando que falas baixas sejam ignoradas.
*   **Transmissão Contínua**: Garantir que o pipeline de áudio não seja bloqueado enquanto o VAD analisa a fala.

## 4. Fluxo de Transcrição e Modo Reunião
*   **Transcrição Prioritária**: No modo REUNIÃO, toda fala detectada deve ser transcrita e exibida imediatamente, independente de ser uma pergunta para o usuário ou não.
*   **Separação de Estados**: Diferenciar `STT SOCKET: CONNECTED` (conexão) de `STT AUDIO: RECEIVING` (fluxo de áudio) e `STT TRANSCRIPT: RECEIVED` (texto real).

## Detalhes Técnicos
*   Refatoração do loop `onaudioprocess` (ou migração para `AudioWorklet`) para processamento de alto desempenho.
*   Implementação de lógica de downmix e resampling eficiente.
*   Uso de `MediaStreamAudioSourceNode` para garantir fidelidade à fonte capturada.
*   Integração de estados de calibração na UI.
