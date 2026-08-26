import { GlobalFonts } from '@napi-rs/canvas';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TITLE_FONT_FAMILY = 'Poppins ExtraBold';
const FALLBACK_FONT_FAMILY = 'Noto Sans';
// Couvre spécifiquement les "Mathematical Alphanumeric Symbols" (U+1D400+)
// des pseudos "stylisés" générés par les sites de police fantaisie — ni
// Poppins ni Noto Sans classique ne les couvrent, ils s'affichaient en
// carrés (tofu) sans cette police dédiée.
const MATH_FALLBACK_FONT_FAMILY = 'Noto Sans Math';
// Autre style de pseudo "fantaisie" courant : des syllabaires Cherokee
// (U+13A0-U+13FF) utilisés comme sosies visuels de lettres latines.
const CHEROKEE_FALLBACK_FONT_FAMILY = 'Noto Sans Cherokee';

GlobalFonts.registerFromPath(path.resolve(__dirname, '../../assets/fonts/Poppins-ExtraBold.ttf'), TITLE_FONT_FAMILY);
GlobalFonts.registerFromPath(path.resolve(__dirname, '../../assets/fonts/NotoSans-Variable.ttf'), FALLBACK_FONT_FAMILY);
GlobalFonts.registerFromPath(path.resolve(__dirname, '../../assets/fonts/NotoSansMath-Regular.ttf'), MATH_FALLBACK_FONT_FAMILY);
GlobalFonts.registerFromPath(
  path.resolve(__dirname, '../../assets/fonts/NotoSansCherokee-Variable.ttf'),
  CHEROKEE_FALLBACK_FONT_FAMILY
);

// Pile de polices à utiliser pour tout ctx.font dessinant du texte fourni
// par un utilisateur (pseudo, nom de rôle...) — Skia (moteur de
// @napi-rs/canvas) bascule automatiquement sur la police suivante de la
// liste pour les caractères absents de la précédente.
export const FONT_STACK = `"${TITLE_FONT_FAMILY}", "${FALLBACK_FONT_FAMILY}", "${MATH_FALLBACK_FONT_FAMILY}", "${CHEROKEE_FALLBACK_FONT_FAMILY}"`;

// Même repli, mais sans Poppins en tête — aucune des polices de secours
// n'a d'équivalent gras (@napi-rs/canvas ne sait pas synthétiser un gras
// pour elles), donc mélanger Poppins (toujours gras) avec elles donne un
// rendu à moitié gras/moitié fin. Utilisée quand le texte contient des
// caractères que Poppins ne couvre pas, pour rester visuellement cohérent
// (tout en fin) plutôt qu'à moitié gras.
const NON_BOLD_FONT_STACK = `"${FALLBACK_FONT_FAMILY}", "${MATH_FALLBACK_FONT_FAMILY}", "${CHEROKEE_FALLBACK_FONT_FAMILY}"`;

// Plage de caractères que Poppins couvre correctement : latin de base
// ( -ɏ), latin étendu additionnel (Ḁ-ỿ) et ponctuation
// générale courante ( -⁯) — testée manuellement, voir l'historique
// de ce fichier. En dehors de cette plage (grec, cyrillique, cherokee,
// symboles mathématiques...), on bascule tout le texte sur NON_BOLD_FONT_STACK
// plutôt que de mélanger les deux rendus.
const POPPINS_SAFE_PATTERN = /^[ -ɏḀ-ỿ -⁯]*$/;

export function fontStackFor(text: string): string {
  return POPPINS_SAFE_PATTERN.test(text) ? FONT_STACK : NON_BOLD_FONT_STACK;
}
