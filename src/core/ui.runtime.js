"use strict";
var AppBaseUI = (() => {
    const module = { exports: {} };
    const exports = module.exports;
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.setShown = setShown;
    exports.setText = setText;
    exports.applyCssVars = applyCssVars;
    exports.openModal = openModal;
    exports.closeModal = closeModal;
    exports.closestModal = closestModal;
    exports.setBusy = setBusy;
    exports.bindActions = bindActions;
    function setShown(element, shown, hiddenClass = 'hidden') {
        if (!element)
            return;
        element.classList.toggle(hiddenClass, !shown);
    }
    function setText(element, value) {
        if (!element)
            return;
        element.textContent = String(value == null ? '' : value);
    }
    function applyCssVars(element, vars) {
        if (!element)
            return;
        Object.entries(vars).forEach(([name, value]) => {
            const key = name.startsWith('--') ? name : '--' + name;
            if (value == null || value === '')
                element.style.removeProperty(key);
            else
                element.style.setProperty(key, String(value));
        });
    }
    function openModal(modal, openClass = 'open') {
        if (!modal)
            return false;
        modal.classList.add(openClass);
        return true;
    }
    function closeModal(modal, openClass = 'open') {
        if (!modal)
            return false;
        modal.classList.remove(openClass);
        return true;
    }
    function closestModal(element, selector = '.modal') {
        if (!element)
            return null;
        const modal = element.closest(selector);
        return modal instanceof HTMLElement ? modal : null;
    }
    function setBusy(button, busy, options = {}) {
        if (!button)
            return;
        const idleText = options.idleText ?? button.dataset.idleText ?? button.textContent ?? '';
        if (!button.dataset.idleText)
            button.dataset.idleText = idleText;
        button.disabled = options.disabled ?? busy;
        if (options.ariaBusy !== false)
            button.setAttribute('aria-busy', busy ? 'true' : 'false');
        if (busy && options.busyText != null)
            button.textContent = options.busyText;
        if (!busy)
            button.textContent = options.idleText ?? button.dataset.idleText ?? idleText;
    }
    function bindActions(root, actions, attribute = 'data-act') {
        const selector = '[' + attribute + ']';
        const listener = (event) => {
            const target = event.target;
            if (!(target instanceof Element))
                return;
            const element = target.closest(selector);
            if (!(element instanceof HTMLElement))
                return;
            const action = element.getAttribute(attribute) || '';
            const handler = actions[action];
            if (handler)
                handler(element, event);
        };
        root.addEventListener('click', listener);
        return () => root.removeEventListener('click', listener);
    }
    
    return module.exports;
})();
