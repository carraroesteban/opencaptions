// Which language a sentence is in, from its text alone. Transcribe Live never says (docs/latency.md), and without
// it an "auto" room can't tell that the speaker uses one of its caption languages: that track would be machine
// translated into its own language (later, choppier, reworded) instead of showing the words as spoken.
// Latin-script languages by their most frequent short words, the others by their script. null when unsure.
// shortcut: Latin-script languages missing from WORDS are never detected (their rooms translate as before); add
// a line of words to cover one.
const WORDS = Object.fromEntries(Object.entries({
  en: 'the and is are was were you that this with for have has not what they we be will can my your there about just from our i it to of had he she his her let how who why when',
  es: 'el los las y es son está están muy hay pero porque cuando yo ustedes también más esto eso qué cómo hoy sus del al para por como todos una con gracias entonces ahora así nuestro nuestra hace años tiene puede mucho muchas muchos',
  pt: 'o os não um uma é são está estão com para por como muito também isso esse essa eu nós vocês você dos das ao pelo pela todos obrigado agora então nosso nossa anos pode tem aqui foi',
  fr: 'le les des et est une un pour pas avec vous nous je sur dans qui ce mais au du sont très aussi cette il elle merci avons notre ans maintenant alors oui comme',
  it: 'il gli di che è non un una per con sono ma anche come più questo questa della nel alla io noi siamo molto grazie ora anni nostro nostra oggi abbiamo questi perché',
  de: 'der die das und ist nicht ein eine ich wir sie mit auf für den dem zu auch sich wie aber noch wird sind haben danke heute jetzt unser unsere jahre also war hat kann einen',
  ca: 'els les i és amb per però també molt aquest aquesta això jo nosaltres som dels més perquè quan gràcies',
  nl: 'het een van niet ik we dat op met voor zijn maar ook wij hebben dit er je naar wat bedankt',
}).map(([lang, w]) => [lang, new Set(w.split(' '))]));

/** @type {[RegExp, string[]][]} */
const SCRIPTS = [ // kana before Han: Japanese mixes both
  [/[぀-ヿ]/, ['ja']], [/[가-힯]/, ['ko']], [/[一-鿿]/, ['zh', 'ja']],
  [/[Ѐ-ӿ]/, ['ru', 'uk', 'bg', 'sr', 'mk', 'be', 'kk']], [/[؀-ۿ]/, ['ar', 'fa', 'ur']],
  [/[֐-׿]/, ['he', 'yi']], [/[Ͱ-Ͽ]/, ['el']], [/[ऀ-ॿ]/, ['hi', 'mr', 'ne']], [/[฀-๿]/, ['th']],
];

/**
 * @param {string} text  a sentence (or more)
 * @param {string[]} langs  the room's caption languages: decide between scripts' languages (Russian or Ukrainian?)
 * @returns {string | null}
 */
export function guessLang(text, langs) {
  for (const [re, group] of SCRIPTS) {
    if (!re.test(text)) continue;
    const ours = group.filter((l) => langs.includes(l));
    return ours.length === 1 ? ours[0] : ours.length ? null : group[0]; // none of ours: still not one of the room's
  }
  const tokens = text.toLowerCase().match(/\p{L}+/gu) || [];
  const [best, next] = Object.entries(WORDS).map(([lang, set]) => ({ lang, n: tokens.filter((t) => set.has(t)).length })).sort((a, b) => b.n - a.n);
  return best.n >= 2 && best.n >= 2 * next.n ? best.lang : null;
}

// Between two languages only (two helpers listening, src/engines/apple.js), more words count: short ones several
// Latin languages share, and letters only one of the two writes. Too loose for guessLang's open question.
const MORE = {
  en: 'a an in on at by as or if so do does did me us him them our out up all one some any no yes very really here now then than but because',
  es: 'me te se lo la le de en que a un mi tu su sin o ni ya muy esta este estos estas aquí allí llamo quiero vamos señoras señores bienvenidos bueno',
  pt: 'me te se lo a de em que um meu seu sem ou já muito esta este aqui chamo quero vamos bem-vindos bom',
  fr: 'je me te se de en que un mon ton son sans ou très cette ici appelle veux allons bienvenue bon',
  it: 'mi ti si lo la le di in che un mio tuo suo senza o già molto qui chiamo voglio andiamo benvenuti buono',
  de: 'ich mich mir du er es in im an am um von vom bei aus nach sehr hier heiße will gehen willkommen gut',
};
const LETTERS = { es: /[ñáéíóú¿¡]/, pt: /[ãõçâêô]/, fr: /[èêëçàùœ]/, it: /[àèìòù]/, de: /[äöüß]/, ca: /[àèòç·]/ };
const MORE_SETS = Object.fromEntries(Object.entries(MORE).map(([l, w]) => [l, new Set(w.split(' '))]));

/**
 * Which of two languages a sentence leans to, or null when it doesn't clearly: the room's two candidates, when a
 * garbled sentence from the wrong model has to be told apart from the right one.
 * @returns {string | null}
 */
export function leans(text, a, b) {
  const [sa, sb] = langScores(text, a, b);
  return sa >= 2 && sa > 2 * sb ? a : sb >= 2 && sb > 2 * sa ? b : null;
}

/** How many of a sentence's words point to each of two languages: [a's, b's]. */
export function langScores(text, a, b) {
  const tokens = String(text).toLowerCase().match(/[\p{L}¿¡]+/gu) || [];
  const score = (l) => tokens.filter((t) => WORDS[l]?.has(t) || MORE_SETS[l]?.has(t) || LETTERS[l]?.test(t)).length;
  return [score(a), score(b)];
}
