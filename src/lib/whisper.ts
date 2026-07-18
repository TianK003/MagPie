// On-device Whisper (tiny.en) via whisper.rn.
//
// SCOPE: this file exists only to get live transcription showing on screen.
// It is NOT the SttStream/scripted abstraction from the design plan — that is
// intentionally out of scope. Model is downloaded once at runtime and cached in
// the app's document directory (keeps the ~75MB blob out of git / the bundle).
import * as FileSystem from 'expo-file-system/legacy';
import { initWhisper, type WhisperContext } from 'whisper.rn';

// English-only tiny model: same size as multilingual tiny, more accurate for
// English, and Magpie is English-only.
const MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin';
const MODEL_PATH = `${FileSystem.documentDirectory}ggml-tiny.en.bin`;

/**
 * Ensures the model is on disk (downloads on first launch), then initialises a
 * WhisperContext. `onProgress` reports download progress 0..1 for UI.
 */
export async function loadWhisper(
  onProgress?: (fraction: number) => void,
): Promise<WhisperContext> {
  const info = await FileSystem.getInfoAsync(MODEL_PATH);

  if (!info.exists || info.size < 1_000_000) {
    onProgress?.(0);
    const dl = FileSystem.createDownloadResumable(
      MODEL_URL,
      MODEL_PATH,
      {},
      (p) => {
        if (p.totalBytesExpectedToWrite > 0) {
          onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
        }
      },
    );
    await dl.downloadAsync();
    onProgress?.(1);
  }

  return initWhisper({ filePath: MODEL_PATH });
}
