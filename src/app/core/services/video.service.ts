import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { SavedVideo } from '../models/app.models';

const VIDEOS_KEY = 'promptcam.videos';

@Injectable({ providedIn: 'root' })
export class VideoService {
  async save(blob: Blob): Promise<SavedVideo> {
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const name = `PromptCam_${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
    const createdAt = new Date().toISOString();

    if (!Capacitor.isNativePlatform()) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
      const video: SavedVideo = { name, uri: name, createdAt };
      await this.addToList(video);
      return video;
    }

    const data = await this.toBase64(blob);
    const result = await Filesystem.writeFile({
      path: name,
      data,
      directory: Directory.Documents,
    });
    const video: SavedVideo = { name, uri: result.uri, createdAt };
    await this.addToList(video);
    return video;
  }

  async listVideos(): Promise<SavedVideo[]> {
    const { value } = await Preferences.get({ key: VIDEOS_KEY });
    if (!value) return [];
    try {
      return JSON.parse(value) as SavedVideo[];
    } catch {
      return [];
    }
  }

  async deleteVideo(video: SavedVideo): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await Filesystem.deleteFile({ path: video.name, directory: Directory.Documents });
      } catch { /* fichier déjà supprimé */ }
    }
    const list = await this.listVideos();
    await Preferences.set({
      key: VIDEOS_KEY,
      value: JSON.stringify(list.filter((v) => v.uri !== video.uri)),
    });
  }

  async share(video: SavedVideo): Promise<void> {
    await Share.share({ title: video.name, url: video.uri, dialogTitle: 'Enregistrer ou partager' });
  }

  // Convert native file URI to a URL playable in WebView
  getWebSrc(uri: string): string {
    return Capacitor.isNativePlatform() ? Capacitor.convertFileSrc(uri) : uri;
  }

  private async addToList(video: SavedVideo): Promise<void> {
    const list = await this.listVideos();
    await Preferences.set({
      key: VIDEOS_KEY,
      value: JSON.stringify([video, ...list].slice(0, 20)),
    });
  }

  private toBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      // Split on 'base64,' to handle MIME types containing commas (e.g. video/mp4;codecs=h264,aac)
      reader.onloadend = () => {
        const result = String(reader.result);
        const marker = 'base64,';
        resolve(result.substring(result.indexOf(marker) + marker.length));
      };
      reader.readAsDataURL(blob);
    });
  }
}
