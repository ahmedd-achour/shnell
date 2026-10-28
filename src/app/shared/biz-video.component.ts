import { Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Narration of the Shnell Business video, one line per scene, in order.
 * Same text and timing rule as the film it was recorded from: a scene lasts
 * max(6 s, length / 14.5 + 1.6 s).
 */
const LINES = [
  "Shnell Business : l'espace professionnel de Shnell, pour automatiser vos livraisons et votre logistique en Tunisie.",
  "Aujourd'hui, organiser des livraisons, c'est appeler les chauffeurs un par un, négocier chaque prix, et tout suivre sur Excel. Des heures perdues chaque semaine.",
  "Avec Shnell Business, vous décrivez vos trajets. Shnell calcule le prix, et trouve automatiquement les chauffeurs vérifiés les plus proches. C'est le même moteur que l'application Shnell.",
  "Étape un : créez vos trajets. Jusqu'à cent trajets en une fois, avec plusieurs arrêts, le téléphone du destinataire, le montant à encaisser et votre référence de commande. Vous pouvez même coller vos lignes depuis Excel.",
  "Étape deux : Shnell envoie chaque trajet aux chauffeurs proches. Un chauffeur accepte votre prix, ou vous propose le sien. Vous choisissez l'offre qui vous convient. Vous pouvez aussi confier le trajet à vos propres chauffeurs.",
  "Étape trois : suivez tout en direct. Recherche, offres, chauffeur assigné, en route, livré : chaque état et chaque arrêt s'affichent en temps réel.",
  "Étape quatre : connectez votre logiciel. Avec l'API Shnell, votre site ou votre ERP crée les commandes tout seul, et reçoit chaque changement par webhook : offre d'un chauffeur, assignation, livraison. Plus aucune saisie manuelle.",
  "Étape cinq : gardez le contrôle. L'historique montre vos dépenses par période, avec un export Excel et un relevé pour votre comptabilité.",
  "Pour commencer : connectez-vous avec Google sur shnell point t n, vérifiez votre numéro avec le code WhatsApp, puis envoyez votre demande Shnell Business. Un conseiller vous appelle, valide votre activité, et votre accès est activé.",
  "Shnell Business. Moins d'appels, plus de livraisons. Rendez-vous sur shnell point t n, slash app.",
];
const SCENES = (() => {
  let acc = 0;
  return LINES.map((say) => {
    const dur = Math.max(6, say.length / 14.5 + 1.6);
    const s = { say, start: acc, end: acc + dur };
    acc += dur;
    return s;
  });
})();

/**
 * The Shnell Business presentation video (French, subtitles burned in).
 * The French voice-over is spoken by the browser, like the online version:
 * each scene's line starts with the scene and the picture waits on the
 * scene's last frame until the line is finished. Shown on the pro sign-in
 * page, the access request screen and the console home. Nothing downloads
 * until the viewer presses play.
 */
@Component({
  selector: 'app-biz-video',
  standalone: true,
  imports: [CommonModule],
  template: `
    <figure class="bv" [class.bv--compact]="compact">
      <div class="bv__frame">
        <video #vid *ngIf="playing" [src]="src" controls playsinline preload="auto"
          (play)="onPlay()" (pause)="onPause()" (seeked)="onSeeked()" (ended)="stopVoice()"></video>
        <button *ngIf="playing && canSpeak" type="button" class="bv__voice" (click)="toggleVoice()"
          [attr.aria-pressed]="voiceOn" [title]="voiceOn ? 'Couper la voix off' : 'Activer la voix off'">
          <i class="bi" [ngClass]="voiceOn ? 'bi-volume-up-fill' : 'bi-volume-mute-fill'"></i> Voix FR
        </button>
        <button *ngIf="!playing" type="button" class="bv__poster" (click)="start()" [attr.aria-label]="'Lire la vidéo : ' + title">
          <img [src]="poster" alt="" loading="lazy" />
          <span class="bv__play"><i class="bi bi-play-fill"></i></span>
          <span class="bv__len"><i class="bi bi-volume-up-fill"></i> 2:20</span>
        </button>
      </div>
      <figcaption *ngIf="title">
        <i class="bi bi-play-circle"></i> {{ title }}
      </figcaption>
    </figure>
  `,
  styles: [`
    .bv { margin: 0; }
    .bv__frame { position: relative; aspect-ratio: 16 / 9; border-radius: 14px; overflow: hidden; background: #0f0d09;
      box-shadow: 0 10px 30px rgba(0, 0, 0, .25); }
    .bv__frame video, .bv__poster img { width: 100%; height: 100%; display: block; object-fit: cover; }
    .bv__poster { all: unset; cursor: pointer; display: block; width: 100%; height: 100%; position: relative; }
    .bv__poster:focus-visible { outline: 3px solid #f5b301; outline-offset: -3px; }
    .bv__play { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 68px; height: 68px;
      border-radius: 50%; background: #f5b301; color: #17140d; display: grid; place-items: center; font-size: 2.2rem;
      box-shadow: 0 6px 24px rgba(0, 0, 0, .45); transition: transform .15s; }
    .bv__poster:hover .bv__play { transform: translate(-50%, -50%) scale(1.08); }
    .bv__len { position: absolute; right: 10px; bottom: 10px; background: rgba(0, 0, 0, .7); color: #fff; font-size: .75rem;
      font-weight: 600; padding: 2px 7px; border-radius: 6px; }
    .bv__voice { position: absolute; top: 10px; right: 10px; border: 0; border-radius: 999px; padding: 5px 11px; cursor: pointer;
      background: rgba(0, 0, 0, .65); color: #fff; font-size: .78rem; font-weight: 700; }
    .bv__voice[aria-pressed="true"] { background: #f5b301; color: #17140d; }
    figcaption { margin-top: 8px; font-size: .85rem; opacity: .8; display: flex; align-items: center; gap: 6px; }
    .bv--compact .bv__play { width: 52px; height: 52px; font-size: 1.7rem; }
  `],
})
export class BizVideoComponent implements OnDestroy {
  @Input() title = 'Shnell Business en 2 minutes';
  @Input() compact = false;
  readonly src = 'assets/video/shnell-business.mp4';
  readonly poster = 'assets/video/shnell-business.jpg';
  playing = false;
  voiceOn = true;
  private readonly synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  readonly canSpeak = !!this.synth;
  private frVoice: SpeechSynthesisVoice | null = null;
  private spoken = -1;      // scene whose line was started
  private speaking = false;
  private held = false;     // paused by us, waiting for the line to end
  private tick?: ReturnType<typeof setInterval>;
  @ViewChild('vid') set vidRef(r: ElementRef<HTMLVideoElement> | undefined) {
    this.video = r?.nativeElement;
    if (this.video && this.pendingStart) { this.pendingStart = false; this.video.play().catch(() => null); }
  }
  private video?: HTMLVideoElement;
  private pendingStart = false;

  constructor() {
    if (this.synth) {
      this.pickVoice();
      this.synth.addEventListener?.('voiceschanged', () => this.pickVoice());
    }
  }

  /** Same choice as the online video: a natural fr-FR voice, else any French one. */
  private pickVoice(): void {
    const vs = this.synth!.getVoices().filter((v) => /^fr(-|_|$)/i.test(v.lang));
    this.frVoice = vs.find((v) => /fr-FR/i.test(v.lang) && /google|natural|neural|online/i.test(v.name))
      || vs.find((v) => /fr-FR/i.test(v.lang)) || vs[0] || null;
  }

  start(): void {
    this.playing = true;
    this.pendingStart = true;
  }

  private sceneAt(t: number): number {
    for (let i = SCENES.length - 1; i >= 0; i--) if (t >= SCENES[i].start) return i;
    return 0;
  }

  private speak(i: number): void {
    this.spoken = i;
    if (!this.synth || !this.voiceOn) { this.speaking = false; return; }
    this.synth.cancel();
    const u = new SpeechSynthesisUtterance(SCENES[i].say);
    u.lang = 'fr-FR';
    if (this.frVoice) u.voice = this.frVoice;
    u.rate = 1.04;
    this.speaking = true;
    u.onend = u.onerror = () => {
      if (this.spoken !== i) return;
      this.speaking = false;
      if (this.held) { this.held = false; this.video?.play().catch(() => null); }
    };
    this.synth.speak(u);
  }

  stopVoice(): void {
    this.synth?.cancel();
    this.speaking = false;
    this.spoken = -1;
  }

  /** Every 100 ms while playing: start each scene's line, hold the last frame until it's said. */
  private follow(): void {
    const v = this.video;
    if (!v || v.paused) return;
    const i = this.sceneAt(v.currentTime);
    if (i !== this.spoken) this.speak(i);
    else if (this.voiceOn && this.speaking && v.currentTime >= SCENES[i].end - 0.15) {
      this.held = true;
      v.pause();
    }
  }

  onPlay(): void {
    this.held = false;
    const v = this.video!;
    // Resuming mid-scene after a pause restarts that scene, so its line is heard whole.
    const i = this.sceneAt(v.currentTime);
    if (i !== this.spoken) {
      if (this.voiceOn && this.canSpeak && v.currentTime - SCENES[i].start > 0.5) v.currentTime = SCENES[i].start;
      this.speak(i);
    }
    clearInterval(this.tick);
    this.tick = setInterval(() => this.follow(), 100);
  }

  onPause(): void {
    if (this.held) return; // our own pause: the voice keeps going
    clearInterval(this.tick);
    this.stopVoice();
  }

  onSeeked(): void {
    if (this.held || !this.video || this.video.paused) return;
    const i = this.sceneAt(this.video.currentTime);
    if (i !== this.spoken) this.speak(i);
  }

  toggleVoice(): void {
    this.voiceOn = !this.voiceOn;
    if (!this.voiceOn) {
      this.stopVoice();
      if (this.held) { this.held = false; this.video?.play().catch(() => null); }
    } else if (this.video && !this.video.paused) {
      this.speak(this.sceneAt(this.video.currentTime));
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.tick);
    this.synth?.cancel();
  }
}
