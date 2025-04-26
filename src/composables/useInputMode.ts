import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { InputMode, InputConfig } from '@/types/input';
import { recordAudio, transcribeAudio } from '@/services/audioService';

export function useInputMode() {
  const { t } = useI18n();
  const inputMode = ref<InputMode>('text');
  const isRecording = ref(false);

  const config = computed<InputConfig>(() => ({
    mode: inputMode.value,
    language: 'en' // This could be made dynamic based on user preferences
  }));

  const toggleInputMode = () => {
    inputMode.value = inputMode.value === 'text' ? 'voice' : 'text';
  };

  const startRecording = async () => {
    if (isRecording.value) return;
    
    isRecording.value = true;
    try {
      const audioFile = await recordAudio();
      const transcription = await transcribeAudio(audioFile);
      return transcription;
    } finally {
      isRecording.value = false;
    }
  };

  return {
    inputMode,
    isRecording,
    config,
    toggleInputMode,
    startRecording
  };
} 