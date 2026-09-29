import React, { useEffect, useRef } from 'react';

// Shared behaviour for every modal backdrop:
// - role="dialog" + aria-modal, labelled by the first heading inside
// - Escape closes the top-most modal only (when onClose is given)
// - Tab / Shift+Tab stay inside the modal
// - focus moves into the modal on open and back to the opener on close

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const stack = [];
let labelSeq = 0;

function visibleFocusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
  );
}

export default function ModalOverlay({ onClose, className = '', children, ...rest }) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const opener = document.activeElement;
    stack.push(node);

    const heading = node.querySelector('h1, h2, h3');
    if (heading && !node.hasAttribute('aria-labelledby') && !node.hasAttribute('aria-label')) {
      if (!heading.id) heading.id = `modal-title-${++labelSeq}`;
      node.setAttribute('aria-labelledby', heading.id);
    }

    // focus the first field, else the dialog itself; skip if something inside already has focus.
    // On touch screens only the dialog is focused so the keyboard does not pop up.
    if (!node.contains(document.activeElement)) {
      const finePointer = window.matchMedia?.('(pointer: fine)').matches;
      const field = finePointer && node.querySelector('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])');
      (field || node).focus({ preventScroll: true });
    }

    const onKeyDown = (e) => {
      if (stack[stack.length - 1] !== node) return;
      if (e.key === 'Escape' && onCloseRef.current) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = visibleFocusables(node);
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const i = stack.lastIndexOf(node);
      if (i >= 0) stack.splice(i, 1);
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1} className={`${className} outline-none`} {...rest}>
      {children}
    </div>
  );
}
