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
  @ViewChild('preview') preview!: ElementRef<HTMLVideoElement>;

  readonly subscription = inject(SubscriptionService);
  readonly videos = inject(VideoService);
  private readonly storage = inject(StorageService);

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

  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private recordedBlob: Blob | null = null;
  private animationId: number | null = null;
  private lastFrame = 0;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private toastId: ReturnType<typeof setTimeout> | null = null;

  async ngAfterViewInit(): Promise<void> {
    await this.configureStatusBar();
    const saved = await this.storage.loadSettings();
    this.script.set(saved.script || DEFAULT_SCRIPT);
    this.speed.set(saved.speed ?? 3);
    this.fontSize.set(saved.fontSize ?? 24);
    // Always derive mirror from facing mode — never load stale saved value
    this.mirrored.set(this.facingMode() === 'user');
    await Promise.allSettled([this.initCamera(), this.subscription.initialize()]);
  }

  private async configureStatusBar(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    // overlay:true lets CSS env(safe-area-inset-top) fill the purple area behind the status bar
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#ffffff' });
    }
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
      if (element.scrollTop + element.clientHeight >= element.scrollHeight - 2) {
        element.scrollTop = 0;
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
    // Always record the raw stream; CSS scaleX(-1) handles the mirror in the preview only
    try {
      this.recorder = this.createRecorder(this.stream, isIos);
    } catch {
      this.showToast("Ce téléphone ne permet pas l'enregistrement MP4");
      return;
    }
    this.recorder.ondataavailable = ({ data }) => data.size && this.chunks.push(data);
    this.recorder.onstop = () => void this.preparePreview();
    this.recorder.start(1000);
    this.isRecording.set(true);
    this.elapsed.set(0);
    this.timerId = setInterval(() => this.elapsed.update((seconds) => seconds + 1), 1000);
    this.resetPrompter();
    setTimeout(() => this.startScroll(), 250);
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
    return new Date(iso).toLocaleDateString('fr-FR', {
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
        this.showToast('Bienvenue dans PromptCam Premium !');
      }
    } catch {
      this.showToast('Offre indisponible : vérifiez la configuration RevenueCat');
    } finally {
      this.busy.set(false);
    }
  }

  async restore(): Promise<void> {
    this.busy.set(true);
    try {
      const restored = await this.subscription.restorePurchases();
      this.showToast(restored ? 'Achats restaurés' : 'Aucun abonnement actif trouvé');
      if (restored) this.paywallOpen.set(false);
    } catch {
      this.showToast('Restauration impossible pour le moment');
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
