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
import { avatarColor, avatarUrl } from '../../core/avatar';
import { CHANNEL_INFO, readableChannels, writableChannels, writeBlockReason } from '../../core/chat-rules';
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
  protected readonly avatarUrl = avatarUrl;

  protected readonly channels = computed(() => readableChannels(this.game.state()));
  private readonly chosen = signal<ChatChannel>('general');
  protected readonly active = computed(() => (this.channels().includes(this.chosen()) ? this.chosen() : 'general'));
  protected readonly visible = computed(() => this.game.messages().filter((m) => m.channel === this.active()));
  protected readonly blockReason = computed(() => writeBlockReason(this.game.state(), this.active()));
  protected readonly myId = computed(() => this.game.state()?.youId);
  /** Solo "cambia" cuando cambian los canales, no con cada actualización del estado. */
  private readonly writable = computed(() => writableChannels(this.game.state()), {
    equal: (a, b) => a.join() === b.join(),
  });

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

    // Cuando cambia el canal en el que puedes escribir (al caer la noche si eres lobo, al
    // amanecer, al morir...), te lleva a él. Solo en ese momento: si después eliges otro
    // canal para leerlo, te quedas en él aunque cambie la fase.
    effect(() => {
      const writable = this.writable();
      untracked(() => {
        if (writable.length > 0 && !writable.includes(this.active())) this.chosen.set(writable[0]);
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
