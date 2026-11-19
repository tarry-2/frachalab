const install = document.getElementById('site-install');
const share = document.getElementById('site-share');
const dialog = document.getElementById('site-share-dialog');
const address = document.getElementById('site-share-url');
const feedback = document.getElementById('site-share-status');
const runningAsApp = matchMedia('(display-mode: standalone)').matches;
let installPrompt;

function updateInstall() {
  install.hidden = runningAsApp || !(installPrompt || typeof navigator.install === 'function');
}
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  updateInstall();
});
window.addEventListener('appinstalled', () => {
  installPrompt = undefined;
  install.hidden = true;
});
install.addEventListener('click', async () => {
  const prompt = installPrompt;
  installPrompt = undefined;
  try {
    if (prompt) await prompt.prompt();
    else if (typeof navigator.install === 'function') await navigator.install();
  } catch (error) {
    if (error.name !== 'AbortError') console.warn('앱 설치 창을 열 수 없어.', error);
  } finally {
    if (typeof navigator.install !== 'function') updateInstall();
  }
});
updateInstall();

share.addEventListener('click', async () => {
  const url = new URL(location.pathname + location.search + location.hash, 'https://atoz.xn--zk5biyyw.com').href;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({title: document.title, url});
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  address.value = url;
  feedback.textContent = '';
  dialog.showModal();
});
document.getElementById('site-share-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(address.value);
    feedback.textContent = '복사했어. 카카오톡 채팅방에 붙여넣어 줘.';
  } catch {
    address.focus();
    address.select();
    feedback.textContent = '선택된 주소를 복사해 카카오톡 채팅방에 붙여넣어 줘.';
  }
});
