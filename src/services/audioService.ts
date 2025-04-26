/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { useI18n } from 'vue-i18n';

declare global {
  interface Navigator {
    mediaDevices: {
      getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
    };
  }
}

interface AudioRecordingError extends Error {
  type: 'permission' | 'recording' | 'transcription';
}

interface MediaRecorderEventMap {
  dataavailable: BlobEvent;
  error: Event;
  pause: Event;
  resume: Event;
  start: Event;
  stop: Event;
}

interface MediaRecorderOptions {
  mimeType?: string;
  audioBitsPerSecond?: number;
  videoBitsPerSecond?: number;
  bitsPerSecond?: number;
}

declare class MediaRecorder extends EventTarget {
  readonly state: 'inactive' | 'recording' | 'paused';
  readonly stream: MediaStream;
  readonly mimeType: string;
  audioBitsPerSecond: number;
  videoBitsPerSecond: number;

  constructor(stream: MediaStream, options?: MediaRecorderOptions);

  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  requestData(): void;

  ondataavailable: ((event: BlobEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onpause: ((event: Event) => void) | null;
  onresume: ((event: Event) => void) | null;
  onstart: ((event: Event) => void) | null;
  onstop: ((event: Event) => void) | null;

  addEventListener<K extends keyof MediaRecorderEventMap>(
    type: K,
    listener: (event: MediaRecorderEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
}

export async function recordAudio(): Promise<Blob> {
  const { t } = useI18n();
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    const audioChunks: BlobPart[] = [];

    return new Promise((resolve, reject) => {
      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        resolve(audioBlob);
      };

      mediaRecorder.onerror = () => {
        const error = new Error(t('audio.recording.error')) as AudioRecordingError;
        error.type = 'recording';
        reject(error);
      };

      mediaRecorder.start();
    });
  } catch (error) {
    const recordingError = new Error(t('audio.recording.error')) as AudioRecordingError;
    recordingError.type = 'permission';
    throw recordingError;
  }
}

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const { t } = useI18n();
  
  try {
    // Here you would integrate with your chosen speech-to-text service
    // For example, using OpenAI's Whisper API or Google Cloud Speech-to-Text
    throw new Error('Transcription service not implemented');
  } catch (error) {
    const transcriptionError = new Error(t('audio.transcription.error')) as AudioRecordingError;
    transcriptionError.type = 'transcription';
    throw transcriptionError;
  }
} 