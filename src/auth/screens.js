// Full-screen states: sign in, can't reach the database, and set-up missing.
import { h, logo } from '../ui/dom.js';
import { supabase } from '../lib/supabase.js';

export function loginScreen(onSignedIn) {
  const email = h('input', { class: 'input', type: 'email', id: 'email', name: 'email', autocomplete: 'username', required: true });
  const password = h('input', { class: 'input', type: 'password', id: 'password', name: 'password', autocomplete: 'current-password', required: true });
  const error = h('p', { class: 'error', role: 'alert', id: 'login-error' });
  const button = h('button', { class: 'btn primary', type: 'submit' }, 'Sign in');
  const form = h('form', { class: 'panel', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    error.textContent = '';
    if (!email.value.trim() || !password.value) { error.textContent = 'Enter your email and password.'; return; }
    button.disabled = true;
    button.textContent = 'Signing in…';
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
    button.disabled = false;
    button.textContent = 'Sign in';
    if (err) {
      error.textContent = /invalid/i.test(err.message) ? 'That email and password don’t match. Try again.' : `Couldn’t sign in: ${err.message}`;
      password.select();
      return;
    }
    onSignedIn();
  } },
    h('div', { class: 'brand', style: { padding: 0 } }, logo(), h('span', { class: 'display' }, 'Money HQ')),
    h('div', null, h('h1', { class: 'display' }, 'Sign in'), h('p', { class: 'muted' }, 'Your money, only for you.')),
    h('label', { class: 'field', for: 'email' }, 'Email', email),
    h('label', { class: 'field', for: 'password' }, 'Password', password),
    error,
    button);
  queueMicrotask(() => email.focus());
  return h('main', { class: 'center' }, form);
}

const REASONS = {
  offline: ['You’re offline', 'Money HQ needs the internet to load your data. Check your connection, then try again.'],
  paused: ['Can’t reach your data', 'The database didn’t answer. Free Supabase projects pause after a week without use: open supabase.com, select the money-hq project and choose Restore, then try again here. Your data is safe while it’s paused.'],
  error: ['Can’t reach your data', 'Something went wrong talking to the database. Try again in a moment.'],
};

export function unreachableScreen(reason, onRetry) {
  const [title, body] = REASONS[reason] || REASONS.error;
  const button = h('button', { class: 'btn primary', type: 'button', onclick: async () => { button.disabled = true; button.textContent = 'Trying…'; await onRetry(); } }, 'Try again');
  return h('main', { class: 'center' }, h('div', { class: 'panel', role: 'alert' },
    h('div', { class: 'brand', style: { padding: 0 } }, logo(), h('span', { class: 'display' }, 'Money HQ')),
    h('h1', { class: 'display' }, title),
    h('p', { class: 'muted notice' }, body),
    button));
}

export function notConfiguredScreen() {
  return h('main', { class: 'center' }, h('div', { class: 'panel', role: 'alert' },
    h('h1', { class: 'display' }, 'Set-up needed'),
    h('p', { class: 'muted notice' }, 'Money HQ can’t find its Supabase settings. Copy .env.example to .env.local and add the Project URL and the publishable key, then restart.')));
}
