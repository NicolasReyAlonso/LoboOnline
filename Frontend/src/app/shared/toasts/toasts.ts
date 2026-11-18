import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-toasts',
  template: `
    <div class="toasts" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <button type="button" class="toast" [class]="toast.kind" (click)="toasts.dismiss(toast.id)">
          {{ toast.text }}
        </button>
      }
    </div>
  `,
  styles: `
    .toasts {
      position: fixed;
      left: 50%;
      bottom: calc(80px + env(safe-area-inset-bottom));
      z-index: 100;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: min(92vw, 420px);
      transform: translateX(-50%);
      pointer-events: none;
    }
    .toast {
      padding: 12px 16px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: #1d2142;
      color: #fff;
      font: inherit;
      text-align: left;
      box-shadow: var(--shadow);
      pointer-events: auto;
      cursor: pointer;
      animation: pop 0.2s ease-out;
    }
    .toast.error {
      background: #8f2a33;
    }
    .toast.success {
      background: #24664a;
    }
    @keyframes pop {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Toasts {
  protected readonly toasts = inject(ToastService);
}
