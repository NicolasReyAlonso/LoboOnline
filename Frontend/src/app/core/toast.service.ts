import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly list = signal<Toast[]>([]);
  readonly toasts = this.list.asReadonly();

  show(text: string, kind: Toast['kind'] = 'info', durationMs = 4000): void {
    const id = this.nextId++;
    this.list.update((all) => [...all.slice(-2), { id, text, kind }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }

  error(text: string): void {
    this.show(text, 'error', 5000);
  }

  dismiss(id: number): void {
    this.list.update((all) => all.filter((t) => t.id !== id));
  }
}
