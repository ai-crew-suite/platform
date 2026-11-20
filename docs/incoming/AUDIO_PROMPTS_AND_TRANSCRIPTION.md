# Transcription with Models

**It is entirely normal (and very common) to split user speech to a local agent into two separate requests: the transcription step, and the enhanced prompt.**

The approach shown in the Vercel AI SDK example code—passing raw audio directly to a multimodal model like `gpt-4o-audio-preview` for transcription—is generally reserved for simple tasks (like a "voice notes transcriber") or native, low-latency speech-to-speech agents.

If your desktop agent needs to **intercept, analyze, or augment the prompt** (e.g., executing [Retrieval-Augmented Generation (RAG)](https://vercel.com/docs/ai-gateway/modalities), applying safety filters, or adding local context), standard practice dictates a **two-step pipeline**.

## The Standard Two-Step Pipeline

### Step 1: Transcribe the Audio to Text

Instead of hitting a multimodal text-generation model, you use a dedicated transcription model (like OpenAI's Whisper or Grok STT) via the `transcribe` function. This isolates the audio processing step.

```typescript
import { openai } from '@ai-sdk/openai';
import { transcribe } from 'ai';
import fs from 'fs';

// 1. Convert speech to raw text string
const { text: userPromptText } = await transcribe({
  model: openai.transcription('whisper-1'),
  audio: fs.readFileSync('./data/galileo.mp3'),
});
```

### Step 2: Intercept, Augment, and Run the Main AI Request

Now that your local desktop agent has the prompt as a standard string (`userPromptText`), you have complete control. You can run your embedding search, inject system variables, prune conversation history, and finally submit it to your primary LLM.

```typescript
// 2. Perform your local agent logic (e.g., RAG vector search)
const relevantDocuments = await myLocalVectorDB.search(userPromptText);

// 3. Send the fully augmented text prompt to the LLM
const finalResult = await generateText({
  model: openai('gpt-4o'),
  system: `You are a helpful assistant. Use these docs to answer: ${relevantDocuments}`,
  prompt: userPromptText, 
});
```

## The Real-Time Alternative: Streaming Transcription

If making the user wait for a complete audio recording to upload and transcribe feels too slow, [Vercel AI SDK 7](https://vercel.com/changelog/ai-sdk-7) supports **streaming transcription** via `experimental_streamTranscribe`.

With this approach, the local agent streams the microphone audio chunks up to the gateway over a WebSocket in real-time. The agent receives live text updates while the user is still speaking. The moment the user finishes talking, the final text is already available locally, allowing you to trigger your RAG pipeline immediately without any processing delay.

## Summary of Architectural Trade-offs

- **Two-Step Pipeline (Transcribe ![img](data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==)→ right arrow → Augment ![img](data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==)→ right arrow → Generate):** *Best for feature-rich agents.* It gives the local application total control over the prompt text, safety auditing, and custom token-saving logic. 
- **One-Step Multimodal (Audio-in ![img](data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==)→ right arrow → Text-out):** *Best for raw speed.* It bypasses local manipulation, sacrificing the ability to attach external data to the request dynamically before execution. 

## Detecting When a User is Done Speaking

Detecting when a user is done speaking—especially in a noisy environment—is one of the hardest challenges in voice engineering. If you rely solely on volume thresholds, a slamming door or background chatter will trick your app into staying open forever, or cut the user off mid-sentence.

Modern desktop and local agents solve this by using a multi-layered approach called **Endpointing**, which shifts the task from a basic volume check to a complex stack combining local acoustics, machine learning, and artificial intelligence.

The industry standard architecture deployed in advanced voice apps breaks down as follows:

### Layer 1: Hardware & Local Denoising (The Acoustic Shield)

Before any code tries to guess if you are speaking, the microphone's raw audio stream passes through a local audio processing graph (like the browser's [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) or local native audio libraries):

- **Acoustic Echo Cancellation (AEC) & Noise Suppression (ANS):** The agent applies hardware filters or software libraries (like `RNNoise` or WebRTC's native processing) to strip out low-frequency room hums, fan whirs, and sudden static spikes.
- **Speaker Verification (Optional):** High-end local desktop agents calculate a digital fingerprint (embedding) of the primary user's voice. The agent matches incoming audio frequencies against this profile, allowing it to instantly mute or filter out other people talking in the room.

### Layer 2: Local AI Voice Activity Detection (VAD)

Once the audio is cleaned, the agent runs a highly optimized, lightweight machine learning model directly on the user's machine. The gold standard for this is a tiny neural network called [Silero VAD](https://github.com/snakers4/silero-vad) (run via WebAssembly or ONNX).

Unlike crude volume detectors that trigger on any loud decibel spike, a true VAD evaluates audio frames in 10-30 millisecond chunks and outputs a **probability score (0% to 100%)** that the sound is actually *human speech*.

- If a background crowd is muttering, the probability stays low.
- If the user speaks, the probability jumps to 95%.

To handle natural human pauses without clipping words, developers program the agent with **Hangover Time**:

```javascript
// If speech probability drops below 30%, don't stop immediately.
// Wait 800ms (hangover time) to see if they are just taking a breath.
if (speechProbability < 0.3) {
  startSilenceTimer(800); 
}
```

### Layer 3: Semantic Turn Detection (The Smart Finish)

Even with great VAD, humans pause mid-sentence to think. If the agent cuts in the second the user stops to breathe, it results in a jarring user experience. The final frontier is **Semantic VAD**. [[1](https://developers.openai.com/api/docs/guides/realtime-vad), [2](https://www.youtube.com/watch?v=XbrlOY4Z-Ow&t=233)]

Because your agent is already receiving a real-time text stream from the Speech-to-Text provider (like OpenAI Whisper or Deepgram), a lightweight language layer reads the text string *while* the user pauses.

- **Scenario A:** The user says: *"Can you tell me..."* [Silence for 1 second]. The semantic engine reads the fragment, flags it as grammatically incomplete, and tells the VAD: *"Keep waiting, they aren't done."*
- **Scenario B:** The user says: *"That makes a lot of sense."* [Silence for 1 second]. The semantic engine checks the punctuation and context, rules it a complete thought, and immediately flags the endpoint to trigger the RAG and LLM generation pipeline.

### Comparison: VAD Strategies

| Method                              | How it Handles Background Noise                              | Trade-off / Latency   |
| ----------------------------------- | ------------------------------------------------------------ | --------------------- |
| **Energy Threshold (Decibels)**     | Fails completely; triggers on background voices/coughing.    | **Ultra Low** (~0ms)  |
| **Local Neural VAD (e.g., Silero)** | Excellent. Differentiates speech frequencies from ambient clutter. | **Low** (~30ms)       |
| **Semantic Endpointing (LLM/Text)** | Flawless. Ignores ambient noise and waits for logical sentence breaks. | **Medium** (+20-50ms) |

### Processing Audio

When taking your architecture to a **Node.js application running in the cloud**, the dynamics shift completely.

If you try to process raw user microphone audio *directly on a cloud server* to detect when they stop speaking, you face a major issue: **egress/network cost and latency**. Streaming raw, uncompressed audio bytes from a user's desktop to a cloud server 24/7 just to wait for silence wastes massive cloud bandwidth.

Because of this, production systems rely on one of two specific architectural paths for a Node.js cloud app:

#### Path A: Managed Cloud Turn-Detection (Recommended)

Instead of writing your own math and frame buffers in Node, you offload the audio connection and endpointing to a specialized infrastructure provider.

- **How it works:** Your desktop agent streams audio via WebSockets or WebRTC directly to a voice gateway provider. The provider handles the VAD internally and fires a clean webhook or API event to your cloud Node.js backend *only* when a full sentence is completed.
- **The Packages:**
  - ***\*[AssemblyAI Voice Agent API](https://www.assemblyai.com/blog/node-js-voice-agent-assemblyais-voice-agent-api)\** (`ws`):** Provides a single integrated WebSocket endpoint. They handle audio noise filtering, VAD, and barge-in (when the user interrupts the bot) automatically, passing the final text cleanly to your Node app.
  - ***\*[Deepgram Real-time ASR](https://deepgram.com/learn/voice-activity-detection)\** (`@deepgram/sdk`):** A high-performance, deep-learning streaming system. It features production-ready voice endpointing that filters room noise and calculates text turns with sub-300ms latency.
  - ***\*[LiveKit Agents](https://livekit.com/blog/turn-detection-voice-agents-vad-endpointing-model-based-detection)\** (`@livekit/agents`):** An open-source framework designed explicitly for real-time voice bots. It handles server-side WebRTC pipelines and natively integrates Silero VAD for handling messy background chatter.

#### Path B: The "Self-Hosted" Cloud Pipeline (Pure Node.js)

If you want to handle the low-level processing yourself within your container (e.g., Docker on AWS or GCP), you must route the real-time audio stream over WebSockets into Node. You cannot use native microphone packages like `node-record-lpcm16` in the cloud because cloud servers don't have physical sound cards.

To build it yourself, you need an enterprise-grade VAD model wrapper capable of ignoring background noise. **Do not use traditional packages like `node-vad` or `google-webrtc-vad` ports.** They are built on ancient algorithms that treat background voices as the primary speaker.

Instead, use ***\*[avr-vad](https://github.com/agentvoiceresponse/avr-vad)\****, which brings the industry-standard **Silero VAD (v5)** neural network into Node.js via ONNX runtime. It is highly accurate, handles background noise well, and processes audio frames in milliseconds.

Production Cloud Node.js Implementation Example:

Here is how you handle the audio chunks streaming into your cloud server using `avr-vad` and an endpointing timer:

```typescript
import { SileroVad, VadModelVersion } from 'avr-vad';
import { EventEmitter } from 'events';

class CloudAudioEndpointor extends EventEmitter {
  private vad: SileroVad;
  private isSpeaking: boolean = false;
  private silenceTimeout: NodeJS.Timeout | null = null;
  private HANGOVER_TIME_MS = 1000; // Wait 1 second to make sure they are done speaking

  constructor() {
    super();
    // Initialize the 2MB pre-trained neural network (v5)
    this.vad = new SileroVad({
      modelVersion: VadModelVersion.V5,
      sampleRate: 16000, // Silero works best at 16kHz
      threshold: 0.5     // 50%+ probability of human speech triggers it
    });
  }

  // Call this method every time a raw PCM audio chunk arrives over your WebSocket
  public async handleAudioChunk(pcmFrame: Buffer) {
    // Process the frame through the local ONNX model
    const vadResult = await this.vad.processChunk(pcmFrame);

    if (vadResult.isSpeech) {
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.emit('speech_started');
      }
      // Reset the silence timer because they are still talking
      if (this.silenceTimeout) {
        clearTimeout(this.silenceTimeout);
        this.silenceTimeout = null;
      }
    } else {
      // It's silence or noise. If they were speaking, start the endpoint countdown
      if (this.isSpeaking && !this.silenceTimeout) {
        this.silenceTimeout = setTimeout(() => {
          this.isSpeaking = false;
          this.silenceTimeout = null;
          this.emit('speech_stopped'); // <--- TRIGGER RAG & LLM PIPELINE HERE
        }, this.HANGOVER_TIME_MS);
      }
    }
  }
}

// Usage in your WebSocket Server:
const endpointor = new CloudAudioEndpointor();
endpointor.on('speech_stopped', () => {
  console.log("User finished speaking! Gathering audio history to transcribe and execute RAG...");
});
```

### The Ultimate Secret to Noisy Rooms: Smart Turn

If your cloud node app uses Silero VAD, it will successfully filter out background room hiss and clapping. However, if *another person* in the room starts talking loudly while your user pauses, a pure VAD will keep the session alive thinking it's the user.

To fix this, developers pair Silero VAD with ***\*[Pipecat Smart Turn](https://github.com/pipecat-ai/smart-turn)\****. It acts as a lightweight semantic model layer. When the VAD detects silence, Smart Turn checks the audio context to decide if the voice cadence matches a logical end-of-sentence or an accidental pause, acting as a final validation gate before firing your LLM request.

### Terminating Audio Stream

When streaming audio directly from a browser client over WebRTC into a cloud Node.js backend, your server becomes a media peer.

Because Node.js cannot natively process real-time WebRTC media tracks out of the box, you must bridge the raw network stream (RTP packets) into standard audio buffers that your local Voice Activity Detection (VAD) can understand.

The standard engineering pipeline requires a two-part setup:

### Step 1: The Browser Client (Capture & Stream)

The frontend uses standard browser media APIs to capture the microphone and push it into a WebRTC peer connection.

```typescript
// 1. Grab user microphone audio track
const mediaStream = await navigator.mediaDevices.getUserMedia({ 
  audio: {
    echoCancellation: true,
    noiseSuppression: true, // Local baseline cleanup
    sampleRate: 16000      // Match what our server-side VAD wants
  } 
});

// 2. Attach it to a WebRTC Peer Connection pointing to your Node server
const pc = new RTCPeerConnection();
mediaStream.getAudioTracks().forEach(track => pc.addTrack(track, mediaStream));

// 3. Complete standard WebRTC signaling (Offer/Answer exchange via WebSockets)
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
// (Send offer to your cloud signaling server...)
```

### Step 2: The Cloud Node.js App (Receive, Convert, and Run VAD)

To handle WebRTC media directly inside Node.js, you cannot use basic sockets. You need a native WebRTC stack wrapper for Node. The industry gold standards are ***\*[werift](https://github.com/shinyoshiaki/werift-webrtc)\**** (a pure TypeScript WebRTC implementation) or ***\*[node-webrtc](https://github.com/node-webrtc/node-webrtc)\**** (C++ bindings). `werift` is highly recommended for modern cloud container deployments.

When the RTP media packets hit your server, you need to extract the raw audio chunks, decode them from the browser's default protocol (**Opus** codec) into uncompressed **PCM** linear audio, and feed them to `avr-vad`.

Cloud Server Implementation:

Here is how you wire the incoming WebRTC audio track directly into your VAD timeline:

```typescript
import { RTCPeerConnection } from 'werift';
import { OpusDecoder } from 'opusscript'; // Or any native opus decoder
import { SileroVad, VadModelVersion } from 'avr-vad';

// Initialize the neural network VAD on your server
const vad = new SileroVad({
  modelVersion: VadModelVersion.V5,
  sampleRate: 16000, 
  threshold: 0.5
});

// Setup the standard Opus Decoder (WebRTC browser audio defaults to Opus)
// WebRTC audio typically arrives at 48kHz; we decode and resample or map to 16kHz
const decoder = new OpusDecoder(16000, 1); 

const pc = new RTCPeerConnection();

// Listen for incoming audio tracks from the browser
pc.onTrack.subscribe((track) => {
  if (track.kind === 'audio') {
    console.log("Receiving audio track from browser over WebRTC...");

    // Read the incoming real-time RTP network stream chunks
    track.onReceiveRtp.subscribe((rtpPacket) => {
      // 1. Extract the raw payload bytes from the WebRTC packet
      const opusPayload = rtpPacket.payload;

      // 2. Decode the Opus bytes into raw 16kHz PCM audio buffers
      const pcmFrame = decoder.decode(opusPayload);

      // 3. Pass the PCM frame straight to your Silero VAD state machine
      processFrameWithVAD(pcmFrame);
    });
  }
});

let isSpeaking = false;
let silenceTimer: NodeJS.Timeout | null = null;

async function processFrameWithVAD(pcmFrame: Buffer) {
  const vadResult = await vad.processChunk(pcmFrame);

  if (vadResult.isSpeech) {
    if (!isSpeaking) {
      isSpeaking = true;
      console.log("🗣️ User started speaking.");
    }
    if (silenceTimer) clearTimeout(silenceTimer);
  } else {
    // If they were talking and now it's quiet, start the turn-detection countdown
    if (isSpeaking && !silenceTimer) {
      silenceTimer = setTimeout(() => {
        isSpeaking = false;
        silenceTimer = null;
        
        console.log("🛑 User stopped speaking! Triggering RAG & LLM backend loop.");
        // EXECUTE: 1. Transcribe gathered audio -> 2. Inject RAG -> 3. Run Vercel AI SDK text generation
        
      }, 1000); // 1-second silence padding (Hangover time)
    }
  }
}
```

### Why This Setup Dominates Cloud Architecture

1. **Sub-100ms Latency:** Because WebRTC runs over **UDP**, frames drop immediately if network interference occurs. Unlike standard HTTP uploads, your server doesn't wait for retransmissions, ensuring the VAD tracking perfectly mirrors the exact timeline of the human speaking.
2. **Minimal CPU Footprint:** Using `avr-vad` (via ONNX runtime) means checking an audio chunk takes less than a millisecond. Your Node app can track speech statuses for dozens of concurrent browser connections without locking up the event loop.

Are you building this on standard cloud infrastructure (like an **AWS EC2 / ECS container**), or are you trying to deploy this to a serverless platform? Serverless systems have strict limitations when it comes to keeping persistent **WebRTC UDP connections** open.

Mapping out real-time media infrastructure is a steep learning curve. When dealing with live WebRTC streams and persistent WebSocket connections, the traditional cloud models most developers rely on break down.

If you are evaluating how to deploy this cloud Node.js application, here is what you need to look out for regarding your infrastructure choices:

### Serverless is a Dead End (No Lambda, Vercel Functions, or Cloud Run)

Standard serverless architectures (like AWS Lambda or Vercel Serverless Functions) **cannot support real-time WebRTC media or continuous VAD looping**.

- **Connection Limits:** Serverless functions are built to receive a quick HTTP request, run code, and immediately spin down. WebRTC requires a persistent, continuous state to stream audio chunks frame by frame.
- **Protocol Blockers:** WebRTC relies on **UDP** ports to stream audio fast enough without latency. Serverless platforms strictly filter network traffic and only expose standard TCP/HTTP ports (Ports 80 and 443).

### The Container Route: Dedicated Virtual Machines

If you want to host and control the Node.js `avr-vad` code yourself, you must use traditional, long-running virtual instances or container orchestration:

- **Infrastructure Options:** **AWS EC2, AWS ECS (Fargate), DigitalOcean Droplets, or Render**.
- **The Caveat:** You must explicitly configure your firewall and security groups to open a range of UDP ports (e.g., ports `30000-40000`) so the browser's WebRTC connection can stream media directly to your container. You will also need a **STUN/TURN server** (like an open-source `coturn` instance) to help users connect if they are behind strict corporate firewalls.

### The Modern Alternative: Offload the Media Layer

Because managing WebRTC network states and UDP routing tables gets messy quickly, the industry standard in 2026 is to split the architecture. You let a specialized infrastructure fabric handle the media connection, and have it pipe data to your serverless or lightweight Node app.

- **Option A: LiveKit Cloud (Highly Recommended for Node.js)**
  You don't deploy any WebRTC code to your server. The browser connects its audio track directly to LiveKit's edge global network. LiveKit runs the Silero VAD at the edge. The moment it detects the user is done speaking, it fires a standard HTTP webhook containing the audio data straight to your Node app. This lets you keep your backend simple, light, and completely stateless.
- **Option B: Managed AI Voice Gateways (AssemblyAI or Retell AI)**
  The browser streams audio to their endpoints. They handle the noise filtering, the VAD, and the speech-to-text transcription completely. They simply forward a clean JSON text payload to your cloud Node backend: `{ text: "What is the audio saying?" }`. You can then run your RAG pipeline and Vercel AI SDK text generation normally.