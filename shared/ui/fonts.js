// Vazirmatn (the Farsi typeface) isn't bundled; it's loaded from Google Fonts only when someone uses it.
// The pages' CSP allows fonts.googleapis.com / fonts.gstatic.com for exactly this.
export function loadVazir() {
  if (document.getElementById('vazir-css')) return;
  const l = document.createElement('link');
  l.id = 'vazir-css';
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap';
  document.head.appendChild(l);
}
