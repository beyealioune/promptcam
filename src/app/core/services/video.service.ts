import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

@Injectable({ providedIn: 'root' })
export class VideoService {
  async save(blob: Blob): Promise<string> {
    const name = `PromptCam_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;

    if (!Capacitor.isNativePlatform()) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
      return name;
    }

    const data = await this.toBase64(blob);
    const result = await Filesystem.writeFile({
      path: `videos/${name}`,
      data,
      directory: Directory.Documents,
      recursive: true,
    });
    await Share.share({ title: 'Ma vidéo PromptCam', url: result.uri, dialogTitle: 'Enregistrer ou partager' });
    return result.uri;
  }

  private toBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onloadend = () => resolve(String(reader.result).split(',')[1]);
      reader.readAsDataURL(blob);
    });
  }
}
