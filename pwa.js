if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', {updateViaCache:'none'}).catch(() => {}));
}
