// A microphone button that types what you say into a text box, using the browser's own speech-to-text
// (Web Speech API, UK English). Nothing is recorded or kept by Money HQ: you see the words, edit them, and
// decide what happens next. Chrome and Edge send the audio to Google or Microsoft to turn it into text;
// Safari uses Apple's. Firefox doesn't support it, so the button isn't shown there and you type instead.
import { h } from './dom.js';

const Recognition = () => (typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null);
export const canListen = () => Boolean(Recognition());
export const VOICE_PRIVACY = 'Speech is turned into text by your browser (Chrome and Edge send the audio to Google or Microsoft to do this; Safari uses Apple). Money HQ keeps only the words you save.';

const ERRORS = {
  'not-allowed': 'Microphone blocked. Allow it for this site in your browser settings, then try again.',
  'service-not-allowed': 'Microphone blocked. Allow it for this site in your browser settings, then try again.',
  'no-speech': 'Didn’t hear anything. Tap the mic and speak a little closer.',
  'audio-capture': 'No microphone found.',
  network: 'Speech needs an internet connection in this browser.',
};

// target: the textarea to fill. Returns the button (or null when the browser can't listen) plus a status line.
export function micButton(target, { onStop } = {}) {
  const R = Recognition();
  if (!R) return null;
  let rec = null;
  let base = '';
  const status = h('span', { class: 'mic-status muted small', 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn mic', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Speak', title: VOICE_PRIVACY, onclick: () => (rec ? rec.stop() : start()) },
    h('span', { class: 'mic-dot', 'aria-hidden': 'true' }), h('span', { class: 'mic-label' }, 'Speak'));
  const setLabel = (on) => { btn.setAttribute('aria-pressed', String(on)); btn.classList.toggle('on', on); btn.querySelector('.mic-label').textContent = on ? 'Stop' : 'Speak'; btn.setAttribute('aria-label', on ? 'Stop listening' : 'Speak'); };

  function start() {
    rec = new R();
    rec.lang = 'en-GB';
    rec.continuous = true;
    rec.interimResults = true;
    base = target.value.trim() ? `${target.value.trim()} ` : '';
    rec.onresult = (e) => {
      let finalText = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
      }
      target.value = `${base}${finalText}${interim}`.replace(/\s+/g, ' ');
      status.textContent = interim ? 'Listening…' : '';
    };
    rec.onerror = (e) => { status.textContent = ERRORS[e.error] || 'Couldn’t listen just now. You can type instead.'; };
    rec.onend = () => { rec = null; setLabel(false); if (status.textContent === 'Listening…') status.textContent = ''; target.value = target.value.trim(); onStop?.(); };
    try { rec.start(); setLabel(true); status.textContent = 'Listening… tap Stop when you’re done.'; } catch { rec = null; status.textContent = 'Couldn’t start the microphone.'; }
  }
  return { button: btn, status };
}
