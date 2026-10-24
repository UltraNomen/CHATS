// Vazirmatn, the Farsi typeface (SIL OFL 1.1, see client/public/fonts/Vazirmatn-OFL.txt), ships with CHATS, so Farsi
// renders properly even when only the domestic internet works. Two families from the same file:
//   "Vazirmatn"        the whole font, for people who pick it as the main typeface
//   "Vazirmatn Arabic" limited to Arabic-script characters, appended to the other font stacks; browsers only fetch it
//                      once Farsi text appears, so English-only users never download it
const ARABIC = 'U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F';

export function loadVazir(src) {
  if (document.getElementById('vazir-css')) return;
  const face = (family, range) => `@font-face { font-family: "${family}"; src: url("${src}") format("truetype"); font-weight: 100 900; font-display: swap;${range ? ' unicode-range: ' + range + ';' : ''} }`;
  const st = document.createElement('style');
  st.id = 'vazir-css';
  st.textContent = face('Vazirmatn') + '\n' + face('Vazirmatn Arabic', ARABIC);
  document.head.appendChild(st);
}
