// Offline engine for development, UI demos and load tests (no API key needed).
// It "hears" speech via audio energy and emits scripted, parallel sentences word by word.
import { EventEmitter } from 'node:events';
import { rms } from '../audio.js';

const CORPUS = [
  {
    en: 'Good morning everyone, and thank you for joining us today.',
    es: 'Buenos días a todos, y gracias por acompañarnos hoy.',
    pt: 'Bom dia a todos, e obrigado por estarem conosco hoje.',
  },
  {
    en: 'Today I want to share how a small team turned a simple idea into a global community.',
    es: 'Hoy quiero contarles cómo un equipo pequeño convirtió una idea simple en una comunidad global.',
    pt: 'Hoje quero contar como uma pequena equipe transformou uma ideia simples em uma comunidade global.',
  },
  {
    en: 'It all started with one question: what if everyone in the room could follow along?',
    es: 'Todo empezó con una pregunta: ¿y si todas las personas de la sala pudieran seguir la charla?',
    pt: 'Tudo começou com uma pergunta: e se todas as pessoas na sala pudessem acompanhar?',
  },
  {
    en: 'We learned that listening carefully is the fastest way to build something people love.',
    es: 'Aprendimos que escuchar con atención es la forma más rápida de crear algo que la gente ame.',
    pt: 'Aprendemos que ouvir com atenção é o caminho mais rápido para criar algo que as pessoas amem.',
  },
  {
    en: 'Great events are made by volunteers, speakers and an audience that cares.',
    es: 'Los grandes eventos los hacen los voluntarios, los oradores y un público que se compromete.',
    pt: 'Grandes eventos são feitos por voluntários, palestrantes e um público que se importa.',
  },
  {
    en: 'Any questions? Remember you can follow these captions on your phone by scanning the QR code.',
    es: '¿Preguntas? Recuerden que pueden seguir estos subtítulos en el celular escaneando el código QR.',
    pt: 'Perguntas? Lembrem que podem acompanhar estas legendas pelo celular escaneando o QR code.',
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
  }

  start() {
    this.state = 'connecting';
    this.emit('state', this.state);
    setTimeout(() => { this.state = 'live'; this.stats.connectedAt = Date.now(); this.emit('state', 'live'); }, 400);
  }

  stop() {
    this.state = 'idle';
    this.emit('state', 'idle');
    for (const t of this.queue) clearTimeout(t);
    this.queue = [];
  }

  restart() { this.stop(); this.start(); }
  endAudio() {}

  sendAudio(chunk) {
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
