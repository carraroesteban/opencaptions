// Offline engine for development, UI demos and load tests (no API key needed).
// It "hears" speech via audio energy and emits scripted, parallel sentences word by word.
import { EventEmitter } from 'node:events';
import { rms } from '../audio.js';

// The sentences simulated captions cycle through, in every language they're written in (the public sandbox gives each
// visitor a sample room in their own language when it's here; others get English).
export const CORPUS = [
  {
    en: 'Good morning everyone, and thank you for joining us today.',
    es: 'Buenos días a todos, y gracias por acompañarnos hoy.',
    pt: 'Bom dia a todos, e obrigado por estarem conosco hoje.',
    fr: "Bonjour à tous, et merci d'être avec nous aujourd'hui.",
    de: "Guten Morgen zusammen, und danke, dass Sie heute dabei sind.",
    it: "Buongiorno a tutti, e grazie per essere qui con noi oggi.",
    nl: "Goedemorgen allemaal, en bedankt dat jullie er vandaag bij zijn.",
    pl: "Dzień dobry wszystkim i dziękuję, że jesteście dziś z nami.",
    ru: "Доброе утро всем, и спасибо, что вы сегодня с нами.",
    uk: "Доброго ранку всім, і дякую, що ви сьогодні з нами.",
    tr: "Herkese günaydın, bugün bize katıldığınız için teşekkür ederim.",
    ar: "صباح الخير جميعًا، وشكرًا لانضمامكم إلينا اليوم.",
    hi: "सभी को सुप्रभात, और आज हमारे साथ जुड़ने के लिए धन्यवाद।",
    ja: "皆さん、おはようございます。本日はご参加いただきありがとうございます。",
    ko: "여러분, 안녕하세요. 오늘 함께해 주셔서 감사합니다.",
    zh: "大家早上好，感谢各位今天的到来。",
    id: "Selamat pagi semuanya, dan terima kasih telah bergabung bersama kami hari ini.",
  },
  {
    en: 'Today I want to share how a small team turned a simple idea into a global community.',
    es: 'Hoy quiero contarles cómo un equipo pequeño convirtió una idea simple en una comunidad global.',
    pt: 'Hoje quero contar como uma pequena equipe transformou uma ideia simples em uma comunidade global.',
    fr: "Aujourd'hui, je veux vous raconter comment une petite équipe a transformé une idée simple en une communauté mondiale.",
    de: "Heute möchte ich erzählen, wie ein kleines Team aus einer einfachen Idee eine weltweite Community gemacht hat.",
    it: "Oggi voglio raccontarvi come un piccolo team ha trasformato un'idea semplice in una comunità globale.",
    nl: "Vandaag wil ik vertellen hoe een klein team een eenvoudig idee omvormde tot een wereldwijde gemeenschap.",
    pl: "Dziś chcę opowiedzieć, jak mały zespół zamienił prosty pomysł w globalną społeczność.",
    ru: "Сегодня я хочу рассказать, как небольшая команда превратила простую идею в глобальное сообщество.",
    uk: "Сьогодні я хочу розповісти, як невелика команда перетворила просту ідею на глобальну спільноту.",
    tr: "Bugün küçük bir ekibin basit bir fikri nasıl küresel bir topluluğa dönüştürdüğünü anlatmak istiyorum.",
    ar: "أريد اليوم أن أشارككم كيف حوّل فريق صغير فكرة بسيطة إلى مجتمع عالمي.",
    hi: "आज मैं बताना चाहता हूँ कि कैसे एक छोटी टीम ने एक सरल विचार को एक वैश्विक समुदाय में बदल दिया।",
    ja: "今日は、小さなチームがシンプルなアイデアを世界的なコミュニティに育てた話をしたいと思います。",
    ko: "오늘은 작은 팀이 단순한 아이디어를 어떻게 세계적인 커뮤니티로 키웠는지 이야기하려고 합니다.",
    zh: "今天我想和大家分享，一个小团队如何把一个简单的想法变成了一个全球社区。",
    id: "Hari ini saya ingin bercerita bagaimana sebuah tim kecil mengubah ide sederhana menjadi komunitas global.",
  },
  {
    en: 'It all started with one question: what if everyone in the room could follow along?',
    es: 'Todo empezó con una pregunta: ¿y si todas las personas de la sala pudieran seguir la charla?',
    pt: 'Tudo começou com uma pergunta: e se todas as pessoas na sala pudessem acompanhar?',
    fr: "Tout a commencé par une question : et si chaque personne dans la salle pouvait suivre ?",
    de: "Alles begann mit einer Frage: Was wäre, wenn alle im Saal folgen könnten?",
    it: "Tutto è iniziato con una domanda: e se tutti in sala potessero seguire?",
    nl: "Het begon allemaal met één vraag: wat als iedereen in de zaal kon meelezen?",
    pl: "Wszystko zaczęło się od jednego pytania: a gdyby każdy na sali mógł śledzić wystąpienie?",
    ru: "Всё началось с одного вопроса: а что, если каждый в зале сможет следить за выступлением?",
    uk: "Усе почалося з одного запитання: а що, як кожен у залі зможе стежити за виступом?",
    tr: "Her şey tek bir soruyla başladı: Ya salondaki herkes konuşmayı takip edebilseydi?",
    ar: "بدأ كل شيء بسؤال واحد: ماذا لو استطاع كل من في القاعة المتابعة؟",
    hi: "सब कुछ एक सवाल से शुरू हुआ: क्या हो अगर हॉल में हर कोई साथ-साथ समझ सके?",
    ja: "すべては一つの問いから始まりました。会場の全員が話についていけたらどうだろう？",
    ko: "모든 것은 하나의 질문에서 시작됐습니다. 객석의 모든 사람이 발표를 따라갈 수 있다면 어떨까요?",
    zh: "一切都始于一个问题：如果会场里的每个人都能跟上，会怎么样？",
    id: "Semuanya berawal dari satu pertanyaan: bagaimana jika semua orang di ruangan bisa mengikuti?",
  },
  {
    en: 'We learned that listening carefully is the fastest way to build something people love.',
    es: 'Aprendimos que escuchar con atención es la forma más rápida de crear algo que la gente ame.',
    pt: 'Aprendemos que ouvir com atenção é o caminho mais rápido para criar algo que as pessoas amem.',
    fr: "Nous avons appris qu'écouter attentivement est le moyen le plus rapide de créer quelque chose que les gens aiment.",
    de: "Wir haben gelernt, dass genaues Zuhören der schnellste Weg ist, etwas zu bauen, das Menschen lieben.",
    it: "Abbiamo imparato che ascoltare con attenzione è il modo più rapido per creare qualcosa che le persone amano.",
    nl: "We leerden dat goed luisteren de snelste manier is om iets te maken waar mensen van houden.",
    pl: "Nauczyliśmy się, że uważne słuchanie to najszybszy sposób, by stworzyć coś, co ludzie pokochają.",
    ru: "Мы поняли, что внимательно слушать — самый быстрый способ создать то, что полюбят люди.",
    uk: "Ми зрозуміли, що уважно слухати — найшвидший спосіб створити те, що люди полюблять.",
    tr: "Dikkatle dinlemenin, insanların seveceği bir şey yaratmanın en hızlı yolu olduğunu öğrendik.",
    ar: "تعلّمنا أن الإصغاء بعناية هو أسرع طريق لبناء شيء يحبه الناس.",
    hi: "हमने सीखा कि ध्यान से सुनना ऐसी चीज़ बनाने का सबसे तेज़ तरीका है जिसे लोग पसंद करें।",
    ja: "私たちは、しっかり耳を傾けることが、人に愛されるものをつくるいちばんの近道だと学びました。",
    ko: "우리는 귀 기울여 듣는 것이 사람들이 사랑하는 것을 만드는 가장 빠른 길이라는 것을 배웠습니다.",
    zh: "我们认识到，认真倾听是打造人们喜爱之物的最快途径。",
    id: "Kami belajar bahwa mendengarkan dengan saksama adalah cara tercepat untuk membangun sesuatu yang disukai orang.",
  },
  {
    en: 'Great events are made by volunteers, speakers and an audience that cares.',
    es: 'Los grandes eventos los hacen los voluntarios, los oradores y un público que se compromete.',
    pt: 'Grandes eventos são feitos por voluntários, palestrantes e um público que se importa.',
    fr: "Les grands événements sont faits par des bénévoles, des intervenants et un public engagé.",
    de: "Großartige Veranstaltungen entstehen durch Freiwillige, Vortragende und ein Publikum, dem es wichtig ist.",
    it: "I grandi eventi li fanno i volontari, i relatori e un pubblico che partecipa.",
    nl: "Geweldige evenementen worden gemaakt door vrijwilligers, sprekers en een betrokken publiek.",
    pl: "Wspaniałe wydarzenia tworzą wolontariusze, prelegenci i zaangażowana publiczność.",
    ru: "Хорошие мероприятия создают волонтёры, спикеры и неравнодушная публика.",
    uk: "Чудові події створюють волонтери, спікери та небайдужа публіка.",
    tr: "Harika etkinlikleri gönüllüler, konuşmacılar ve önemseyen bir izleyici kitlesi yapar.",
    ar: "الفعاليات الرائعة يصنعها المتطوعون والمتحدثون وجمهور مهتم.",
    hi: "शानदार कार्यक्रम स्वयंसेवक, वक्ता और परवाह करने वाले दर्शक मिलकर बनाते हैं।",
    ja: "素晴らしいイベントは、ボランティアと登壇者、そして熱心な聴衆がつくるものです。",
    ko: "훌륭한 행사는 자원봉사자와 연사, 그리고 관심을 가진 청중이 만듭니다.",
    zh: "精彩的活动，离不开志愿者、演讲者和用心的观众。",
    id: "Acara yang hebat dibuat oleh para relawan, pembicara, dan penonton yang peduli.",
  },
  {
    en: 'Any questions? Remember you can follow these captions on your phone by scanning the QR code.',
    es: '¿Preguntas? Recuerden que pueden seguir estos subtítulos en el celular escaneando el código QR.',
    pt: 'Perguntas? Lembrem que podem acompanhar estas legendas pelo celular escaneando o QR code.',
    fr: "Des questions ? N'oubliez pas que vous pouvez suivre ces sous-titres sur votre téléphone en scannant le QR code.",
    de: "Fragen? Denken Sie daran: Sie können diese Untertitel auf Ihrem Handy verfolgen, wenn Sie den QR-Code scannen.",
    it: "Domande? Ricordate che potete seguire questi sottotitoli sul telefono scansionando il codice QR.",
    nl: "Vragen? Vergeet niet dat je deze ondertiteling op je telefoon kunt volgen door de QR-code te scannen.",
    pl: "Pytania? Pamiętajcie, że możecie śledzić te napisy na telefonie, skanując kod QR.",
    ru: "Есть вопросы? Напоминаю, что эти субтитры можно смотреть на телефоне, отсканировав QR-код.",
    uk: "Є запитання? Нагадую, що ці субтитри можна читати на телефоні, відсканувавши QR-код.",
    tr: "Sorusu olan var mı? QR kodu tarayarak bu altyazıları telefonunuzdan takip edebileceğinizi unutmayın.",
    ar: "هل من أسئلة؟ تذكّروا أنه يمكنكم متابعة هذه الترجمة على هواتفكم بمسح رمز QR.",
    hi: "कोई सवाल? याद रखें, आप QR कोड स्कैन करके ये कैप्शन अपने फ़ोन पर देख सकते हैं।",
    ja: "ご質問はありますか？QRコードを読み取れば、この字幕をスマートフォンで見られます。",
    ko: "질문 있으신가요? QR 코드를 스캔하면 휴대폰에서 이 자막을 볼 수 있습니다.",
    zh: "有问题吗？别忘了，扫描二维码就能在手机上查看这些字幕。",
    id: "Ada pertanyaan? Ingat, Anda bisa mengikuti teks ini di ponsel dengan memindai kode QR.",
  },
];

export class MockEngine extends EventEmitter {
  constructor({ label, target, source = 'en' }) {
    super();
    this.label = label;
    this.target = target;
    this.source = source === 'auto' ? 'en' : source;
    this.state = 'idle';
    this.stats = { reconnects: 0, resumes: 0, errors: 0, lastError: '', connectedAt: 0, audioMs: 0, lastInputAt: 0, lastOutputAt: 0, tokens: 0 };
    this.sentence = Math.floor(Math.random() * CORPUS.length);
    this.word = 0;
    this.speechMs = 0;
    this.queue = [];
    this.pending = []; // audio that arrives while "connecting", sent once live (as the Gemini engine buffers it)
  }

  start() {
    this.state = 'connecting';
    this.emit('state', this.state);
    setTimeout(() => {
      if (this.state !== 'connecting') return; // stopped meanwhile
      this.state = 'live';
      this.stats.connectedAt = Date.now();
      this.emit('state', 'live');
      for (const c of this.pending.splice(0)) this.sendAudio(c);
    }, 400);
  }

  stop() {
    this.state = 'idle';
    this.pending = [];
    this.emit('state', 'idle');
    for (const t of this.queue) clearTimeout(t);
    this.queue = [];
  }

  restart() { this.stop(); this.start(); }
  endAudio() {}

  sendAudio(chunk) {
    if (this.state === 'connecting') { this.pending.push(chunk); if (this.pending.length > 120) this.pending.shift(); return; } // 12 s, like Gemini's buffer
    if (this.state !== 'live') return;
    this.stats.audioMs += 100;
    if (rms(chunk) < 0.008) return;
    this.speechMs += 100;
    if (this.speechMs < 380) return; // ~2.6 words/s
    this.speechMs = 0;
    const s = CORPUS[this.sentence];
    const src = (s[this.source] || s.en).split(' ');
    const tgt = (s[this.target] || s.en).split(' ');
    const i = this.word++;
    const done = this.word >= src.length;
    if (i < src.length) {
      this.stats.lastInputAt = Date.now();
      this.emit('input', { text: (i ? ' ' : '') + src[i], finished: done, lang: this.source });
    }
    // Translation follows ~1.2 s behind, proportionally mapped onto target words.
    const from = Math.floor((i / src.length) * tgt.length);
    const to = done ? tgt.length : Math.floor(((i + 1) / src.length) * tgt.length);
    if (to > from) {
      const text = (from ? ' ' : '') + tgt.slice(from, to).join(' ');
      this.queue.push(setTimeout(() => {
        this.stats.lastOutputAt = Date.now();
        this.emit('output', { text, finished: done, lang: this.target });
      }, 1200));
      if (this.queue.length > 50) this.queue.shift();
    }
    if (done) { this.word = 0; this.sentence = (this.sentence + 1) % CORPUS.length; }
  }

  status() {
    return { target: this.target, echo: false, state: this.state, level: 'mock', ...this.stats };
  }
}
