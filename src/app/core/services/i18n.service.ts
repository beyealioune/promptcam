import { Injectable, computed, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

export type AppLanguage = 'fr' | 'en';

const LANGUAGE_KEY = 'promptcam.language';
const translations = {
  fr: {
    studio: 'Studio mobile', premium: 'Premium', videos: 'Mes vidéos', script: 'Mon script',
    cameraError: 'Caméra non accessible', cameraHelp: 'Autorisez l’accès à la caméra et au micro pour utiliser PromptCam.', retry: 'Réessayer',
    speed: 'Vitesse', size: 'Taille', editorTitle: 'Votre script vidéo', savedDevice: 'Il sera sauvegardé sur cet appareil.',
    examples: 'Exemples rapides', placeholder: 'Écrivez ou collez votre texte ici…', chars: 'caractères', remaining: 'restants',
    freeLimit: 'Version gratuite : 280 caractères maximum. Débloquer l’illimité', apply: 'Appliquer au prompteur',
    recorded: 'Vidéo enregistrée !', readySocial: 'Prête à être publiée sur vos réseaux', delete: 'Supprimer', save: 'Enregistrer',
    myVideos: 'Mes vidéos', savedVideos: 'vidéo(s) sauvegardée(s)', emptyVideos: 'Aucune vidéo enregistrée.', emptyAction: 'Filmez et appuyez sur Enregistrer.',
    unlimitedTitle: 'Parlez sans limite.\nCréez sans coupure.', unlimitedBody: 'Écrivez des scripts de n’importe quelle longueur et gardez votre regard face caméra.',
    unlimitedScripts: 'Scripts longs illimités', recordShare: 'Enregistrement et partage de vos vidéos', restoreDevices: 'Restauration sur vos appareils',
    autoRenew: 'Renouvellement automatique, annulable à tout moment.', subscribe: 'Passer à Premium', loading: 'Chargement…', restore: 'Restaurer mes achats',
    legal: 'Le paiement est géré par l’App Store ou Google Play. L’abonnement se renouvelle automatiquement sauf annulation.',
    chooseLanguage: 'Choisissez votre langue', chooseLanguageSub: 'Vous pourrez la modifier plus tard dans les réglages de votre appareil.', french: 'Français', english: 'English',
  },
  en: {
    studio: 'Mobile studio', premium: 'Premium', videos: 'My videos', script: 'My script',
    cameraError: 'Camera unavailable', cameraHelp: 'Allow camera and microphone access to use PromptCam.', retry: 'Try again',
    speed: 'Speed', size: 'Size', editorTitle: 'Your video script', savedDevice: 'It will be saved on this device.',
    examples: 'Quick examples', placeholder: 'Write or paste your text here…', chars: 'characters', remaining: 'remaining',
    freeLimit: 'Free version: 280 characters maximum. Unlock unlimited', apply: 'Apply to teleprompter',
    recorded: 'Video recorded!', readySocial: 'Ready to publish on your social networks', delete: 'Delete', save: 'Save',
    myVideos: 'My videos', savedVideos: 'saved video(s)', emptyVideos: 'No videos recorded.', emptyAction: 'Record and tap Save.',
    unlimitedTitle: 'Speak without limits.\nCreate without cuts.', unlimitedBody: 'Write scripts of any length and keep looking straight at the camera.',
    unlimitedScripts: 'Unlimited long scripts', recordShare: 'Record and share your videos', restoreDevices: 'Restore on your devices',
    autoRenew: 'Auto-renewing, cancel anytime.', subscribe: 'Go Premium', loading: 'Loading…', restore: 'Restore purchases',
    legal: 'Payment is handled by the App Store or Google Play. The subscription renews automatically unless cancelled.',
    chooseLanguage: 'Choose your language', chooseLanguageSub: 'Your choice will be saved on this device.', french: 'Français', english: 'English',
  },
} as const;

export type TranslationKey = keyof typeof translations.fr;

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly language = signal<AppLanguage>('fr');
  readonly hasSelection = signal(false);
  readonly locale = computed(() => this.language() === 'fr' ? 'fr-FR' : 'en-US');

  async initialize(): Promise<boolean> {
    const { value } = await Preferences.get({ key: LANGUAGE_KEY });
    if (value === 'fr' || value === 'en') {
      this.language.set(value);
      this.hasSelection.set(true);
    }
    return this.hasSelection();
  }

  async select(language: AppLanguage): Promise<void> {
    this.language.set(language);
    this.hasSelection.set(true);
    document.documentElement.lang = language;
    await Preferences.set({ key: LANGUAGE_KEY, value: language });
  }

  t(key: TranslationKey): string {
    return translations[this.language()][key];
  }
}
