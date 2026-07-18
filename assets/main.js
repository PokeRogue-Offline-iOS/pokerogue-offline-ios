const nav = document.getElementById('top-nav');
if (nav) {
  window.addEventListener('scroll', () => { nav.classList.toggle('scrolled', window.scrollY > 20); });
}

const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');
if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    mobileMenu.classList.toggle('open');
  });
}
function closeMenu() {
  if (hamburger) hamburger.classList.remove('open');
  if (mobileMenu) mobileMenu.classList.remove('open');
}

const versionBadge = document.getElementById('version-badge');
if (versionBadge) {
  fetch('https://pokerogue-offline.github.io/pokerogue-offline/repo.json')
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(data => {
      const v = data && data.apps && data.apps[0] && data.apps[0].versions && data.apps[0].versions[0];
      if (!v || !v.version) return;
      let dateStr = '';
      if (v.date) {
        const d = new Date(v.date);
        if (!isNaN(d)) dateStr = ' · ' + d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      }
      versionBadge.innerHTML = `Latest release: <strong>v${v.version}</strong>${v.buildVersion ? ` (build ${v.buildVersion})` : ''}${dateStr}`;
      versionBadge.style.display = 'block';
    })
    .catch(() => {});
}
