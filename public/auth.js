// =====================
// AUTH HELPER GLOBAL
// =====================

const AUTH_TOKEN_KEY = 'plaubert_token';
const AUTH_EMAIL_KEY = 'plaubert_email';

function getToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

function getEmail() {
    return localStorage.getItem(AUTH_EMAIL_KEY);
}

function saveSession(token, email) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_EMAIL_KEY, email);
}

function clearSession() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_EMAIL_KEY);
}

// Adiciona header Authorization em toda requisição autenticada
function authFetch(url, options = {}) {
    const token = getToken();
    if (!options.headers) options.headers = {};
    if (!(options.body instanceof FormData)) {
        options.headers['Content-Type'] = 'application/json';
    }
    if (token) {
        options.headers['Authorization'] = 'Bearer ' + token;
    }
    return fetch(url, options).then(res => {
        if (res.status === 401) {
            clearSession();
            window.location.href = '/login.html';
        }
        return res;
    });
}

// Redireciona para login se não autenticado (chamado em todas as páginas protegidas)
function requireAuth() {
    if (!getToken()) {
        window.location.href = '/login.html';
    }
}

// =====================
// LÓGICA DA TELA DE LOGIN
// =====================

// Splash de login (mesmo polling de conexão)
const splashScreen = document.getElementById('splash-screen');
const splashStatusText = document.getElementById('splash-status-text');

const RETRY_MESSAGES = [
    'Conectando ao servidor...',
    'Servidor dormindo, acordando... ☕',
    'Isso pode levar até 30 segundos...',
    'Quase lá, aguarde um momento...',
];

async function waitForServer() {
    let attempt = 0;
    while (true) {
        try {
            splashStatusText.textContent = RETRY_MESSAGES[Math.min(attempt, RETRY_MESSAGES.length - 1)];
            const res = await fetch('/ping', { signal: AbortSignal.timeout(8000) });
            if (res.ok) {
                splashStatusText.textContent = 'Pronto! ✅';
                // Se já tem token válido, vai direto para o app
                if (getToken()) {
                    window.location.href = '/index.html';
                    return;
                }
                setTimeout(() => splashScreen.classList.add('hidden'), 500);
                return;
            }
        } catch (e) { /* servidor dormindo */ }
        attempt++;
        await new Promise(r => setTimeout(r, 3000));
    }
}

waitForServer();

// Validações
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = message;
}

function clearErrors(...ids) {
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
    });
}

function setFormError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.classList.remove('hidden');
    }
}

function clearFormError(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.classList.add('hidden');
}

// Trocar entre tabs
function showTab(tab) {
    document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
    document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
    document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
    document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
    clearFormError('loginError');
    clearFormError('registerError');
}

// HANDLER: Login
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');

    clearErrors('loginEmailError', 'loginPasswordError');
    clearFormError('loginError');

    let hasError = false;
    if (!validateEmail(email)) {
        showError('loginEmailError', 'Digite um e-mail válido.');
        hasError = true;
    }
    if (password.length < 6) {
        showError('loginPasswordError', 'Senha deve ter pelo menos 6 caracteres.');
        hasError = true;
    }
    if (hasError) return;

    btn.disabled = true;
    btn.textContent = 'Entrando...';

    try {
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (data.error) {
            setFormError('loginError', data.error);
        } else {
            saveSession(data.token, data.email);
            window.location.href = '/index.html';
        }
    } catch (err) {
        setFormError('loginError', 'Erro de conexão. Tente novamente.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Entrar';
    }
}

// HANDLER: Cadastro
async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerConfirm').value;
    const btn = document.getElementById('registerBtn');

    clearErrors('registerEmailError', 'registerPasswordError', 'registerConfirmError');
    clearFormError('registerError');

    let hasError = false;
    if (!validateEmail(email)) {
        showError('registerEmailError', 'Digite um e-mail válido.');
        hasError = true;
    }
    if (password.length < 6) {
        showError('registerPasswordError', 'Senha deve ter pelo menos 6 caracteres.');
        hasError = true;
    }
    if (password !== confirm) {
        showError('registerConfirmError', 'As senhas não conferem.');
        hasError = true;
    }
    if (hasError) return;

    btn.disabled = true;
    btn.textContent = 'Criando conta...';

    try {
        const res = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (data.error) {
            setFormError('registerError', data.error);
        } else {
            saveSession(data.token, data.email);
            window.location.href = '/index.html';
        }
    } catch (err) {
        setFormError('registerError', 'Erro de conexão. Tente novamente.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Criar Conta';
    }
}
