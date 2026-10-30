// Keep native link keys from also activating the game behind it.
const credits = document.getElementById('public-credits')!;
for (const type of ['keydown', 'keyup']) {
  credits.addEventListener(type, event => event.stopPropagation());
}

// Some game menus capture Tab. Offer a focus shortcut without changing their controls.
window.addEventListener('keydown', event => {
  if (!document.body.classList.contains('main-menu-active')) return;
  if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'l') {
    event.preventDefault();
    event.stopPropagation();
    credits.focus({ preventScroll: true });
  }
}, true);
