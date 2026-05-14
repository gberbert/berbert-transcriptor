const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let serverProcess = null;

function startServer() {
    if (serverProcess) {
        console.log('\n[DEV] 🔄 Detectamos uma alteração. Derrubando e reiniciando o servidor...\n');
        serverProcess.kill();
    } else {
        console.log('\n[DEV] 🚀 Iniciando o servidor de desenvolvimento...\n');
    }

    // Inicia o server.js e direciona os logs dele para o terminal atual
    serverProcess = spawn('node', ['server.js'], { stdio: 'inherit' });

    serverProcess.on('close', (code) => {
        if (code !== null && code !== 0) {
            console.error(`[DEV] ❌ O servidor parou devido a um erro (Código: ${code})`);
        }
    });
}

// Inicia o servidor pela primeira vez
startServer();

// Função com "debounce" para não reiniciar 5 vezes seguidas se você salvar o arquivo rápido
let timeout = null;
function watchHandler(eventType, filename) {
    // Ignora a pasta temporária de uploads e o arquivo de log do banco para não dar loop infinito
    if (filename && !filename.includes('tmp') && (filename.endsWith('.js') || filename.endsWith('.html') || filename.endsWith('.css'))) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            startServer();
        }, 500);
    }
}

// Fica "olhando" a pasta raiz e a pasta public
fs.watch(__dirname, watchHandler);
if (fs.existsSync(path.join(__dirname, 'public'))) {
    fs.watch(path.join(__dirname, 'public'), watchHandler);
}

console.log('[DEV] 👀 Ambiente de Desenvolvimento Ativo!');
console.log('[DEV] A partir de agora, sempre que você SALVAR qualquer arquivo (.js, .html, .css), o servidor vai reiniciar sozinho.');
console.log('[DEV] Para sair, pressione Ctrl + C.\n');
