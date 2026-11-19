import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Role } from '@lobo/game/types';
import { ROLES_WITH_CARD } from '../../core/role-cards';
import { ROLE_ICON, roleName } from '../../core/roles';

/** `url(...)` absoluta, para que funcione igual en local y en GitHub Pages (/LoboOnline/). */
function assetUrl(path: string): string {
  return `url("${new URL(path, document.baseURI).href}")`;
}

/**
 * El dibujo de la tarjeta de un personaje, coloreado con el tema: de día tinta
 * oscura sobre papel claro y de noche en negativo (ver --card-ink y
 * --card-paper en styles.scss). Las imágenes son máscaras que genera
 * `npm run tarjetas`. Si un personaje aún no tiene dibujo, se pinta una
 * tarjeta provisional con el mismo estilo.
 */
@Component({
  selector: 'app-card-art',
  template: `
    @if (drawn()) {
      <span class="layer paper" [style.--mask]="silhouette()"></span>
      <span class="layer lines" [style.--mask]="lines()"></span>
    } @else {
      <span class="placeholder">
        <span class="icon">{{ icon() }}</span>
        <span class="label">{{ name() }}</span>
      </span>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      aspect-ratio: 1;
      container-type: inline-size;
    }

    .layer {
      position: absolute;
      inset: 0;
      -webkit-mask: var(--mask) center / 100% 100% no-repeat;
      mask: var(--mask) center / 100% 100% no-repeat;
      transition: background-color 0.8s ease;
    }

    .paper {
      background-color: var(--card-paper);
    }

    .lines {
      background-color: var(--card-ink);
    }

    .placeholder {
      position: absolute;
      inset: 3.5%;
      display: grid;
      grid-template-rows: 1fr 17%;
      border: max(1.5px, 1.6cqw) solid var(--card-ink);
      border-radius: 6cqw;
      background: var(--card-paper);
      color: var(--card-ink);
      transition:
        background-color 0.8s ease,
        border-color 0.8s ease,
        color 0.8s ease;
    }

    .icon {
      place-self: center;
      font-size: 34cqw;
      line-height: 1;
      filter: grayscale(1) contrast(1.3);
    }

    .label {
      display: grid;
      place-items: center;
      border-top: max(1.5px, 1.4cqw) solid var(--card-ink);
      font-family: var(--font-display);
      font-size: 8cqw;
      text-transform: uppercase;
      transition: border-color 0.8s ease;
    }
  `,
  host: {
    role: 'img',
    '[attr.aria-label]': '"Tarjeta: " + name()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardArt {
  readonly role = input.required<Role>();

  protected readonly drawn = computed(() => ROLES_WITH_CARD.has(this.role()));
  protected readonly silhouette = computed(() => assetUrl(`tarjetas/${this.role()}-silueta.png`));
  protected readonly lines = computed(() => assetUrl(`tarjetas/${this.role()}-lineas.png`));
  protected readonly name = computed(() => roleName(this.role()));
  protected readonly icon = computed(() => ROLE_ICON[this.role()]);
}
