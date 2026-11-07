const form = document.querySelector('#auth-form');
const authView = document.querySelector('#auth-view');
const signedInView = document.querySelector('#signed-in-view');
const nameField = document.querySelector('#name-field');
const message = document.querySelector('#form-message');
const submitButton = document.querySelector('#submit-button');
const tabs = [...document.querySelectorAll('.mode-button')];
let mode = 'login';

function setMode(nextMode) {
  mode = nextMode;
  const registering = mode === 'register';
  nameField.classList.toggle('hidden', !registering);
  form.elements.password.autocomplete = registering ? 'new-password' : 'current-password';
  document.querySelector('#form-title').textContent = registering ? 'Create your account' : 'Welcome back';
  document.querySelector('#form-subtitle').textContent = registering
    ? 'Use your HKU email to join CampusSwap.'
    : 'Sign in with your HKU email.';
  submitButton.innerHTML = registering ? 'Create account <span aria-hidden="true">→</span>' : 'Log in <span aria-hidden="true">→</span>';
  message.textContent = '';
  message.classList.remove('success');
  tabs.forEach((tab) => {
    const selected = tab.dataset.mode === mode;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
  });
}

function showUser(user) {
  authView.classList.add('hidden');
  signedInView.classList.remove('hidden');
  document.querySelector('#welcome-title').textContent = `Welcome, ${user.fullName}.`;
  document.querySelector('#welcome-email').textContent = user.email;
  document.querySelector('#user-initials').textContent = user.fullName
    .split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

async function request(path, body) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

tabs.forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  message.classList.remove('success');
  submitButton.disabled = true;
  const body = Object.fromEntries(new FormData(form));
  try {
    const result = await request(`/api/auth/${mode}`, body);
    showUser(result.user);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  try {
    await request('/api/auth/logout', {});
    signedInView.classList.add('hidden');
    authView.classList.remove('hidden');
    form.reset();
    setMode('login');
  } catch (error) {
    message.textContent = error.message;
  }
});

request('/api/auth/me').then(({ user }) => showUser(user)).catch(() => {});
