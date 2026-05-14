// auth-helper.js — Injetado em todas as páginas protegidas

const AUTH_TOKEN_KEY = 'plaubert_token';
const AUTH_EMAIL_KEY = 'plaubert_email';

function getToken() { return localStorage.getItem(AUTH_TOKEN_KEY); }
function getEmail() { return localStorage.getItem(AUTH_EMAIL_KEY); }

function clearSession() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_EMAIL_KEY);
}

function logout() {
    clearSession();
    window.location.href = '/login.html';
}

// Redireciona se não autenticado
(function requireAuth() {
    if (!getToken()) {
        window.location.href = '/login.html';
    }
})();

// Exibe email do usuário no badge
(function showUserEmail() {
    const display = document.getElementById('userEmailDisplay');
    if (display) display.textContent = getEmail() || '';
})();

// authFetch: fetch com Authorization header automático
function authFetch(url, options = {}) {
    const token = getToken();
    if (!options.headers) options.headers = {};
    if (!(options.body instanceof FormData)) {
        if (!options.headers['Content-Type']) {
            options.headers['Content-Type'] = 'application/json';
        }
    }
    if (token) options.headers['Authorization'] = 'Bearer ' + token;

    return fetch(url, options).then(res => {
        if (res.status === 401) {
            clearSession();
            window.location.href = '/login.html';
        }
        return res;
    });
}
