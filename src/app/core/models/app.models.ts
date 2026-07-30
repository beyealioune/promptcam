export interface PrompterSettings {
  script: string;
  speed: number;
  fontSize: number;
  mirrored: boolean;
}

export interface SavedVideo {
  name: string;
  uri: string;
  createdAt: string;
}

export const FREE_CHARACTER_LIMIT = 280;
