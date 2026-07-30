import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { PrompterSettings } from '../models/app.models';

const SETTINGS_KEY = 'promptcam.settings';

@Injectable({ providedIn: 'root' })
export class StorageService {
  async loadSettings(): Promise<Partial<PrompterSettings>> {
    const { value } = await Preferences.get({ key: SETTINGS_KEY });
    if (!value) return {};
    try {
      return JSON.parse(value) as Partial<PrompterSettings>;
    } catch {
      return {};
    }
  }

  async saveSettings(settings: PrompterSettings): Promise<void> {
    await Preferences.set({ key: SETTINGS_KEY, value: JSON.stringify(settings) });
  }
}
