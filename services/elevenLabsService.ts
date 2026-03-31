export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  labels?: {
    accent?: string;
    description?: string;
    age?: string;
    gender?: string;
    use_case?: string;
  };
  preview_url?: string;
}

export const getElevenLabsVoices = async (): Promise<ElevenLabsVoice[]> => {
  const response = await fetch('/api/elevenlabs/voices');
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse ElevenLabs voices response:', text);
    throw new Error(`Invalid response from server: ${text.slice(0, 100)}`);
  }

  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch voices');
  }
  return data.voices || [];
};

export const generateElevenLabsSpeech = async (text: string, voiceId: string): Promise<{ audioUrl: string, duration: number }> => {
  const response = await fetch('/api/elevenlabs/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceId })
  });

  if (!response.ok) {
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`Failed to generate speech: ${text.slice(0, 100)}`);
    }
    throw new Error(data.error || 'Failed to generate speech');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  
  return { audioUrl: url, duration: 0 };
};
