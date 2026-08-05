import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import {
  LucideCameraOff,
  LucideCheck,
  LucideChevronLeft,
  LucideChevronRight,
  LucideCrown,
  LucideDownload,
  LucideFileText,
  LucideFilm,
  LucideGauge,
  LucideInfo,
  LucidePause,
  LucidePlay,
  LucideRotateCcw,
  LucideShare2,
  LucideSquare,
  LucideSwitchCamera,
  LucideTrash2,
  LucideType,
  LucideVideo,
  LucideX,
} from '@lucide/angular';
import { FREE_CHARACTER_LIMIT, PrompterSettings, SavedVideo } from './core/models/app.models';
import { StorageService } from './core/services/storage.service';
import { SubscriptionService } from './core/services/subscription.service';
import { VideoService } from './core/services/video.service';
import { AppLanguage, I18nService, TranslationKey } from './core/services/i18n.service';

const DEFAULT_SCRIPT =
  'Bienvenue sur PromptCam ! Appuyez sur « Mon script » pour écrire votre texte. Réglez la vitesse puis lancez votre enregistrement.';

@Component({
  selector: 'app-root',
  imports: [
    FormsModule,
    LucideVideo, LucideFileText, LucideCrown, LucideCameraOff,
    LucideChevronRight, LucideChevronLeft, LucideGauge, LucideType, LucideRotateCcw,
    LucidePlay, LucidePause, LucideSquare, LucideX, LucideCheck, LucideTrash2,
    LucideDownload, LucideInfo, LucideSwitchCamera, LucideFilm, LucideShare2,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild('camera') camera!: ElementRef<HTMLVideoElement>;
  @ViewChild('prompter') prompter!: ElementRef<HTMLDivElement>;
  @ViewChild('prompterFirst') prompterFirst!: ElementRef<HTMLParagraphElement>;
  @ViewChild('prompterRepeat') prompterRepeat!: ElementRef<HTMLParagraphElement>;
  @ViewChild('preview') preview!: ElementRef<HTMLVideoElement>;

  readonly subscription = inject(SubscriptionService);
  readonly videos = inject(VideoService);
  private readonly storage = inject(StorageService);
  readonly i18n = inject(I18nService);

  readonly onboarding = signal<'splash' | 'language' | 'app'>('splash');

  readonly script = signal(DEFAULT_SCRIPT);
  readonly draft = signal('');
  readonly speed = signal(3);
  readonly fontSize = signal(24);
  readonly mirrored = signal(true);
  readonly facingMode = signal<'user' | 'environment'>('user');
  readonly cameraError = signal(false);
  readonly scriptOpen = signal(false);
  readonly paywallOpen = signal(false);
  readonly previewOpen = signal(false);
  readonly previewSrc = signal('');
  readonly isRecording = signal(false);
  readonly isScrolling = signal(false);
  readonly countdown = signal<number | null>(null);
  readonly elapsed = signal(0);
  readonly busy = signal(false);
  readonly toast = signal('');
  readonly galleryOpen = signal(false);
  readonly galleryVideos = signal<SavedVideo[]>([]);
  readonly remainingCharacters = computed(() => FREE_CHARACTER_LIMIT - this.draft().length);
  readonly timer = computed(() => {
    const min = Math.floor(this.elapsed() / 60).toString().padStart(2, '0');
    const sec = (this.elapsed() % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  });

  readonly templates = [
    { label: '⚡ Accroche TikTok', text: 'Arrêtez de scroller ! Aujourd’hui, je vous partage le conseil qui a complètement changé ma façon de créer mes vidéos. Voici les trois étapes à retenir…' },
    { label: '🛍️ Présentation produit', text: 'Découvrez notre toute nouvelle création. Elle a été conçue pour vous simplifier la vie au quotidien. Regardez la différence en direct…' },
    { label: '📸 Story face caméra', text: 'Coucou tout le monde ! J’espère que vous allez bien. Petite story aujourd’hui pour répondre à une question que vous me posez très souvent…' },
  ];

  readonly localizedTemplates = computed(() => this.i18n.language() === 'fr' ? this.templates : [
    { label: '⚡ TikTok hook', text: 'Stop scrolling! Today I am sharing the tip that completely changed the way I create videos. Here are the three steps to remember…' },
    { label: '🛍️ Product presentation', text: 'Discover our brand-new creation. It was designed to make your everyday life easier. Watch the difference live…' },
    { label: '📸 Talking-head story', text: 'Hi everyone! I hope you are doing well. Today I want to answer a question you ask me very often…' },
  ]);

  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private recordedBlob: Blob | null = null;
  private animationId: number | null = null;
  private lastFrame = 0;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private toastId: ReturnType<typeof setTimeout> | null = null;
  private canvasRafId: number | null = null;

  async ngAfterViewInit(): Promise<void> {
    await this.configureStatusBar();
    const [hasLanguage, saved] = await Promise.all([
      this.i18n.initialize(),
      this.storage.loadSettings(),
    ]);
    this.script.set(saved.script || DEFAULT_SCRIPT);
    this.speed.set(saved.speed ?? 3);
    this.fontSize.set(saved.fontSize ?? 24);
    // Always derive mirror from facing mode — never load stale saved value
    this.mirrored.set(this.facingMode() === 'user');
    document.documentElement.lang = this.i18n.language();
    window.setTimeout(() => {
      this.onboarding.set(hasLanguage ? 'app' : 'language');
      if (hasLanguage) {
        void this.showAppStatusBar();
        void this.initializeApp();
      }
    }, 1200);
  }

  t(key: TranslationKey): string { return this.i18n.t(key); }

  async selectLanguage(language: AppLanguage): Promise<void> {
    await this.i18n.select(language);
    if (language === 'en' && this.script() === DEFAULT_SCRIPT) {
      this.script.set('Welcome to PromptCam! Tap “My script” to write your text. Adjust the speed, then start recording.');
    }
    this.onboarding.set('app');
    await this.showAppStatusBar();
    await this.initializeApp();
  }

  private async initializeApp(): Promise<void> {
    await Promise.allSettled([this.initCamera(), this.subscription.initialize()]);
  }

  private async configureStatusBar(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await StatusBar.setOverlaysWebView({ overlay: false });
    // The splash and language choice are intentionally full screen.
    await StatusBar.hide();
  }

  private async showAppStatusBar(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#ffffff' });
    }
    await StatusBar.show();
  }

  ngOnDestroy(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stopScroll();
    if (this.timerId) clearInterval(this.timerId);
    if (this.previewSrc()) URL.revokeObjectURL(this.previewSrc());
  }

  async initCamera(): Promise<void> {
    try {
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.facingMode(), width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      this.camera.nativeElement.srcObject = this.stream;
      this.cameraError.set(false);
    } catch {
      this.cameraError.set(true);
    }
  }

  async toggleCamera(): Promise<void> {
    if (this.isRecording()) return;
    this.facingMode.update((mode) => (mode === 'user' ? 'environment' : 'user'));
    // Mirror on for front camera (selfie), off for back camera
    this.mirrored.set(this.facingMode() === 'user');
    await this.initCamera();
    void this.persistSettings();
  }

  openScript(): void {
    this.draft.set(this.script());
    this.scriptOpen.set(true);
  }

  updateDraft(value: string): void {
    if (this.subscription.isPremium() || value.length <= FREE_CHARACTER_LIMIT) {
      this.draft.set(value);
      return;
    }
    this.draft.set(value.slice(0, FREE_CHARACTER_LIMIT));
    this.paywallOpen.set(true);
  }

  useTemplate(text: string): void {
    this.updateDraft(text);
  }

  async saveScript(): Promise<void> {
    const text = this.draft().trim();
    if (!text) {
      this.showToast('Écrivez un texte avant de continuer');
      return;
    }
    this.script.set(text);
    this.scriptOpen.set(false);
    this.resetPrompter();
    await this.persistSettings();
    this.showToast('Script appliqué avec succès');
  }

  setSpeed(value: string): void {
    this.speed.set(Number(value));
    void this.persistSettings();
  }

  setFontSize(value: string): void {
    this.fontSize.set(Number(value));
    void this.persistSettings();
  }

  toggleMirror(): void {
    this.mirrored.update((value) => !value);
    void this.persistSettings();
    this.showToast(this.mirrored() ? 'Effet miroir activé' : 'Effet miroir désactivé');
  }

  toggleScroll(): void {
    this.isScrolling() ? this.stopScroll() : this.startScroll();
  }

  startScroll(): void {
    if (this.isScrolling()) return;
    this.isScrolling.set(true);
    this.lastFrame = performance.now();
    const step = (now: number) => {
      if (!this.isScrolling()) return;
      const elapsed = Math.min(now - this.lastFrame, 50);
      this.lastFrame = now;
      const element = this.prompter.nativeElement;
      element.scrollTop += (this.speed() * 14 * elapsed) / 1000;
      const cycle = this.prompterRepeat.nativeElement.offsetTop - this.prompterFirst.nativeElement.offsetTop;
      if (cycle > 0 && element.scrollTop >= cycle) {
        element.scrollTop -= cycle;
      }
      this.animationId = requestAnimationFrame(step);
    };
    this.animationId = requestAnimationFrame(step);
  }

  stopScroll(): void {
    this.isScrolling.set(false);
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    this.animationId = null;
  }

  resetPrompter(): void {
    this.stopScroll();
    this.prompter.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async toggleRecording(): Promise<void> {
    if (this.isRecording()) {
      this.stopRecording();
      return;
    }
    if (!this.stream) {
      await this.initCamera();
      if (!this.stream) return;
    }
    for (const value of [3, 2, 1]) {
      this.countdown.set(value);
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    this.countdown.set(null);
    this.startRecording();
  }

  private startRecording(): void {
    if (!this.stream) return;
    this.chunks = [];

    const isIos = Capacitor.getPlatform() === 'ios';
    // When mirrored (front camera), record through a flipped canvas so the saved video is correctly oriented
    const recordStream = this.mirrored() ? this.buildMirroredStream() : this.stream;
    try {
      this.recorder = this.createRecorder(recordStream!, isIos);
    } catch {
      this.showToast("Ce téléphone ne permet pas l'enregistrement MP4");
      return;
    }
    this.recorder.ondataavailable = ({ data }) => data.size && this.chunks.push(data);
    this.recorder.onstop = () => {
      if (this.canvasRafId !== null) cancelAnimationFrame(this.canvasRafId);
      this.canvasRafId = null;
      void this.preparePreview();
    };
    this.recorder.start(1000);
    this.isRecording.set(true);
    this.elapsed.set(0);
    this.timerId = setInterval(() => this.elapsed.update((seconds) => seconds + 1), 1000);
    this.resetPrompter();
    setTimeout(() => this.startScroll(), 250);
  }

  private buildMirroredStream(): MediaStream {
    const video = this.camera.nativeElement;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d')!;
    const draw = () => {
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.restore();
      this.canvasRafId = requestAnimationFrame(draw);
    };
    draw();
    const canvasStream = canvas.captureStream(30);
    this.stream!.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
    return canvasStream;
  }

  private createRecorder(stream: MediaStream, isIos: boolean): MediaRecorder {
    const iosTypes = [
      'video/mp4',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=h264,aac',
    ];
    const androidTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/mp4',
    ];
    const supported = (isIos ? iosTypes : androidTypes)
      .find((type) => MediaRecorder.isTypeSupported(type));

    if (supported) return new MediaRecorder(stream, { mimeType: supported });

    const recorder = new MediaRecorder(stream);
    if (isIos && recorder.mimeType && !recorder.mimeType.includes('mp4')) {
      throw new Error(`Unsupported iOS recording format: ${recorder.mimeType}`);
    }
    return recorder;
  }

  private stopRecording(): void {
    this.recorder?.stop();
    this.isRecording.set(false);
    this.stopScroll();
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
  }

  private async preparePreview(): Promise<void> {
    const rawBlob = new Blob(this.chunks, { type: this.recorder?.mimeType });
    const header = new Uint8Array(await rawBlob.slice(0, 12).arrayBuffer());
    const signature = String.fromCharCode(...header.slice(4, 8));
    const isMp4 = signature === 'ftyp';
    const type = isMp4 ? 'video/mp4' : (this.recorder?.mimeType || 'video/webm');

    if (Capacitor.getPlatform() === 'ios' && !isMp4) {
      this.recordedBlob = null;
      this.chunks = [];
      this.showToast("Format vidéo incompatible avec Photos. Réessayez l'enregistrement.");
      return;
    }

    this.recordedBlob = new Blob(this.chunks, { type });
    if (this.previewSrc()) URL.revokeObjectURL(this.previewSrc());
    this.previewSrc.set(URL.createObjectURL(this.recordedBlob));
    this.previewOpen.set(true);
  }

  async saveVideo(): Promise<void> {
    if (!this.recordedBlob) return;
    this.busy.set(true);
    try {
      const result = await this.videos.save(this.recordedBlob);
      this.closePreview();
      this.recordedBlob = null;
      this.chunks = [];
      this.galleryVideos.set(await this.videos.listVideos());
      this.showToast(result.destination === 'gallery'
        ? 'Vidéo enregistrée dans votre galerie'
        : 'Vidéo prête : choisissez « Enregistrer la vidéo »');
    } catch {
      this.showToast("Impossible d'enregistrer la vidéo");
    } finally {
      this.busy.set(false);
    }
  }

  async openGallery(): Promise<void> {
    this.galleryVideos.set(await this.videos.listVideos());
    this.galleryOpen.set(true);
  }

  async shareGalleryVideo(video: SavedVideo): Promise<void> {
    try {
      await this.videos.share(video);
    } catch {
      this.showToast('Partage non disponible');
    }
  }

  async deleteGalleryVideo(video: SavedVideo): Promise<void> {
    await this.videos.deleteVideo(video);
    this.galleryVideos.update((list) => list.filter((v) => v.uri !== video.uri));
    this.showToast('Vidéo supprimée');
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(this.i18n.locale(), {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }

  deleteVideo(): void {
    this.closePreview();
    this.recordedBlob = null;
    this.chunks = [];
    this.showToast('Vidéo supprimée. Prêt pour une nouvelle prise !');
  }

  closePreview(): void {
    this.preview.nativeElement.pause();
    this.previewOpen.set(false);
  }

  async buyPremium(): Promise<void> {
    this.busy.set(true);
    try {
      if (await this.subscription.purchasePremium()) {
        this.paywallOpen.set(false);
        this.showToast(this.t('purchaseSuccess'));
      }
    } catch {
      this.showToast(this.t('offeringUnavailable'));
    } finally {
      this.busy.set(false);
    }
  }

  async restore(): Promise<void> {
    this.busy.set(true);
    try {
      const restored = await this.subscription.restorePurchases();
      this.showToast(this.t(restored ? 'purchasesRestored' : 'noActiveSubscription'));
      if (restored) this.paywallOpen.set(false);
    } catch {
      this.showToast(this.t('restoreFailed'));
    } finally {
      this.busy.set(false);
    }
  }

  private async persistSettings(): Promise<void> {
    const settings: PrompterSettings = {
      script: this.script(),
      speed: this.speed(),
      fontSize: this.fontSize(),
    };
    await this.storage.saveSettings(settings);
  }

  private showToast(message: string): void {
    if (this.toastId) clearTimeout(this.toastId);
    this.toast.set(message);
    this.toastId = setTimeout(() => this.toast.set(''), 2800);
  }
}
