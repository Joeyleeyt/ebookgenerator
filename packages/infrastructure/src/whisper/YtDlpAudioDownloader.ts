import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Result, type AudioDownloader, type ObjectStorage } from '@yeg/core';

const AUDIO_BUCKET = 'audio';

/**
 * Downloads a video's audio with yt-dlp, uploads it to storage, returns the ref.
 * Only invoked for videos lacking captions (the Whisper path).
 */
export class YtDlpAudioDownloader implements AudioDownloader {
  constructor(private readonly storage: ObjectStorage) {}

  async downloadAudio(youtubeId: string): Promise<Result<{ audioRef: string }>> {
    const localPath = join(tmpdir(), `${youtubeId}.mp3`);
    try {
      await this.runYtDlp(youtubeId, localPath);
      const bytes = await readFile(localPath);
      const audioRef = `${youtubeId}.mp3`;
      const put = await this.storage.put(AUDIO_BUCKET, audioRef, new Uint8Array(bytes), 'audio/mpeg');
      if (put.isFail()) return Result.fail(put.error);
      return Result.ok({ audioRef });
    } catch (e) {
      return Result.fail(e instanceof Error ? e.message : String(e));
    } finally {
      await rm(localPath, { force: true });
    }
  }

  private runYtDlp(youtubeId: string, output: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('yt-dlp', [
        '-x',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '5',
        '-o',
        output,
        `https://www.youtube.com/watch?v=${youtubeId}`,
      ]);
      let stderr = '';
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`yt-dlp exited ${code}: ${stderr}`))));
      proc.on('error', reject);
    });
  }
}
