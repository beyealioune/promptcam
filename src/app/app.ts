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
import {
  LucideCameraOff,
  LucideCheck,
  LucideChevronLeft,
  LucideChevronRight,
  LucideCrown,
  LucideDownload,
  LucideFileText,
  LucideFlipHorizontal,
  LucideGauge,
  LucideInfo,
  LucidePause,
  LucidePlay,
  LucideRotateCcw,
  LucideSquare,
  LucideTrash2,
  LucideType,
  LucideVideo,
  LucideX,
} from '@lucide/angular';
import { FREE_CHARACTER_LIMIT, PrompterSettings } from './core/models/app.models';
import { StorageService } from './core/services/storage.service';
import { SubscriptionService } from './core/services/subscription.service';
import { VideoService } from './core/services/video.service';

const DEFAULT_SCRIPT =
  'Bienvenue sur PromptCam ! Appuyez sur « Mon script » pour écrire votre texte. Réglez la vitesse puis lancez votre enregistrement.';

@Component({
  selector: 'app-root',
  imports: [
    FormsModule,
    LucideVideo, LucideFileText, LucideCrown, LucideCameraOff, LucideFlipHorizontal,
    LucideChevronRight, LucideChevronLeft, LucideGauge, LucideType, LucideRotateCcw,
    LucidePlay, LucidePause, LucideSquare, LucideX, LucideCheck, LucideTrash2,
    LucideDownload, LucideInfo,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild('camera') camera!: ElementRef<HTMLVideoElement>;
  @ViewChild('prompter') prompter!: ElementRef<HTMLDivElement>;
  @ViewChild('preview') preview!: ElementRef<HTMLVideoElement>;

  readonly subscription = inject(SubscriptionService);
  private readonly storage = inject(StorageService);
  private readonly videos = inject(VideoService);

  readonly script = signal(DEFAULT_SCRIPT);
  readonly draft = signal('');
  readonly speed = signal(3);
  readonly fontSize = signal(24);
  readonly mirrored = signal(true);
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
    const saved = await this.storage.loadSettings();
    this.script.set(saved.script || DEFAULT_SCRIPT);
    this.speed.set(saved.speed ?? 3);
    this.fontSize.set(saved.fontSize ?? 24);
    this.mirrored.set(saved.mirrored ?? true);
    await Promise.allSettled([this.initCamera(), this.subscription.initialize()]);
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
        video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      this.camera.nativeElement.srcObject = this.stream;
      this.cameraError.set(false);
    } catch {
      this.cameraError.set(true);
    }
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
        this.stopScroll();
        return;
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
    const mimeType = [
      'video/mp4;codecs=h264,aac',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
    ].find((type) => MediaRecorder.isTypeSupported(type));
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = ({ data }) => data.size && this.chunks.push(data);
    this.recorder.onstop = () => this.preparePreview();
    this.recorder.start(1000);
    this.isRecording.set(true);
    this.elapsed.set(0);
    this.timerId = setInterval(() => this.elapsed.update((seconds) => seconds + 1), 1000);
    this.resetPrompter();
    setTimeout(() => this.startScroll(), 250);
  }

  private stopRecording(): void {
    this.recorder?.stop();
    this.isRecording.set(false);
    this.stopScroll();
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
  }

  private preparePreview(): void {
    const type = this.recorder?.mimeType || 'video/webm';
    this.recordedBlob = new Blob(this.chunks, { type });
    if (this.previewSrc()) URL.revokeObjectURL(this.previewSrc());
    this.previewSrc.set(URL.createObjectURL(this.recordedBlob));
    this.previewOpen.set(true);
  }

  async saveVideo(): Promise<void> {
    if (!this.recordedBlob) return;
    this.busy.set(true);
    try {
      await this.videos.save(this.recordedBlob);
      this.closePreview();
      this.showToast('Vidéo enregistrée ou partagée');
    } catch {
      this.showToast('Impossible d’enregistrer la vidéo');
    } finally {
      this.busy.set(false);
    }
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
      mirrored: this.mirrored(),
    };
    await this.storage.saveSettings(settings);
  }

  private showToast(message: string): void {
    if (this.toastId) clearTimeout(this.toastId);
    this.toast.set(message);
    this.toastId = setTimeout(() => this.toast.set(''), 2800);
  }
}
