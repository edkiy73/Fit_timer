var AppBaseUI;
(function (AppBaseUI) {
    function setShown(element, shown, hiddenClass = 'hidden') {
        if (!element)
            return;
        element.classList.toggle(hiddenClass, !shown);
    }
    AppBaseUI.setShown = setShown;
    function setText(element, value) {
        if (!element)
            return;
        element.textContent = String(value == null ? '' : value);
    }
    AppBaseUI.setText = setText;
    function openModal(modal, openClass = 'open') {
        if (!modal)
            return false;
        modal.classList.add(openClass);
        return true;
    }
    AppBaseUI.openModal = openModal;
    function closeModal(modal, openClass = 'open') {
        if (!modal)
            return false;
        modal.classList.remove(openClass);
        return true;
    }
    AppBaseUI.closeModal = closeModal;
    function closestModal(element, selector = '.modal') {
        if (!element)
            return null;
        const modal = element.closest(selector);
        return modal instanceof HTMLElement ? modal : null;
    }
    AppBaseUI.closestModal = closestModal;
    function setBusy(button, busy, options = {}) {
        if (!button)
            return;
        const idleText = options.idleText ?? button.dataset.idleText ?? button.textContent ?? '';
        if (!button.dataset.idleText)
            button.dataset.idleText = idleText;
        button.disabled = options.disabled === false ? false : busy;
        if (options.ariaBusy !== false)
            button.setAttribute('aria-busy', busy ? 'true' : 'false');
        if (busy && options.busyText != null)
            button.textContent = options.busyText;
        if (!busy)
            button.textContent = options.idleText ?? button.dataset.idleText ?? idleText;
    }
    AppBaseUI.setBusy = setBusy;
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
    AppBaseUI.bindActions = bindActions;
})(AppBaseUI || (AppBaseUI = {}));
