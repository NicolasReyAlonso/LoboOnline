import { DatePipe } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { ChatChannel } from '@lobo/protocol';
import { avatarColor } from '../../core/avatar';
import { CHANNEL_INFO, readableChannels, writeBlockReason } from '../../core/chat-rules';
import { GameService } from '../../core/game.service';

@Component({
  selector: 'app-chat',
  imports: [DatePipe],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Chat {
  protected readonly game = inject(GameService);
  protected readonly info = CHANNEL_INFO;
  protected readonly color = avatarColor;

  protected readonly channels = computed(() => readableChannels(this.game.state()));
  private readonly chosen = signal<ChatChannel>('general');
  protected readonly active = computed(() => (this.channels().includes(this.chosen()) ? this.chosen() : 'general'));
  protected readonly visible = computed(() => this.game.messages().filter((m) => m.channel === this.active()));
  protected readonly blockReason = computed(() => writeBlockReason(this.game.state(), this.active()));
  protected readonly myId = computed(() => this.game.state()?.youId);

  private readonly lastSeen = signal<Record<ChatChannel, number>>({ general: 0, wolves: 0, dead: 0 });
  protected readonly unread = computed(() => {
    const seen = this.lastSeen();
    const counts: Record<ChatChannel, number> = { general: 0, wolves: 0, dead: 0 };
    for (const m of this.game.messages()) if (m.ts > seen[m.channel]) counts[m.channel]++;
    return counts;
  });

  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  constructor() {
    // Lo que se ve en el canal activo cuenta como leído.
    effect(() => {
      const channel = this.active();
      const last = this.visible().at(-1)?.ts ?? 0;
      untracked(() => this.lastSeen.update((seen) => ({ ...seen, [channel]: Math.max(seen[channel], last) })));
    });

    // Al cambiar de fase, si no puedes escribir donde estás pero sí en otro canal, te lleva allí
    // (p. ej. a los lobos al caer la noche).
    effect(() => {
      this.game.game()?.phaseId;
      untracked(() => {
        const state = this.game.state();
        if (!writeBlockReason(state, this.active())) return;
        const writable = this.channels().find((c) => !writeBlockReason(state, c));
        if (writable) this.chosen.set(writable);
      });
    });

    afterRenderEffect(() => {
      this.visible();
      const el = this.list()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  protected select(channel: ChatChannel): void {
    this.chosen.set(channel);
  }

  protected async send(input: HTMLInputElement): Promise<void> {
    const text = input.value.trim();
    if (!text) return;
    if (await this.game.sendChat(this.active(), text)) input.value = '';
  }
}
