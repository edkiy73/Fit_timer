namespace AppBaseUI {
  export type ActionHandler = (element: HTMLElement, event: Event) => void;

  export interface BusyOptions {
    busyText?: string;
    idleText?: string;
    disabled?: boolean;
    ariaBusy?: boolean;
  }

  export function setShown(element: HTMLElement | null, shown: boolean, hiddenClass = 'hidden'): void {
    if(!element) return;
    element.classList.toggle(hiddenClass, !shown);
  }

  export function setText(element: HTMLElement | null, value: unknown): void {
    if(!element) return;
    element.textContent = String(value == null ? '' : value);
  }

  export function openModal(modal: HTMLElement | null, openClass = 'open'): boolean {
    if(!modal) return false;
    modal.classList.add(openClass);
    return true;
  }

  export function closeModal(modal: HTMLElement | null, openClass = 'open'): boolean {
    if(!modal) return false;
    modal.classList.remove(openClass);
    return true;
  }

  export function closestModal(element: Element | null, selector = '.modal'): HTMLElement | null {
    if(!element) return null;
    const modal = element.closest(selector);
    return modal instanceof HTMLElement ? modal : null;
  }

  export function setBusy(button: HTMLButtonElement | null, busy: boolean, options: BusyOptions = {}): void {
    if(!button) return;
    const idleText = options.idleText ?? button.dataset.idleText ?? button.textContent ?? '';
    if(!button.dataset.idleText) button.dataset.idleText = idleText;
    button.disabled = options.disabled === false ? false : busy;
    if(options.ariaBusy !== false) button.setAttribute('aria-busy', busy ? 'true' : 'false');
    if(busy && options.busyText != null) button.textContent = options.busyText;
    if(!busy) button.textContent = options.idleText ?? button.dataset.idleText ?? idleText;
  }

  export function bindActions(
    root: Document | HTMLElement,
    actions: Record<string, ActionHandler>,
    attribute = 'data-act'
  ): () => void {
    const selector = '[' + attribute + ']';
    const listener = (event: Event): void => {
      const target = event.target;
      if(!(target instanceof Element)) return;
      const element = target.closest(selector);
      if(!(element instanceof HTMLElement)) return;
      const action = element.getAttribute(attribute) || '';
      const handler = actions[action];
      if(handler) handler(element, event);
    };
    root.addEventListener('click', listener);
    return () => root.removeEventListener('click', listener);
  }
}
