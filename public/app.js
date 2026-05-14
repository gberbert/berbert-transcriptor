// SPLASH SCREEN: Aguarda servidor Render acordar com polling
const splashScreen = document.getElementById('splash-screen');
const splashStatusText = document.getElementById('splash-status-text');

const RETRY_MESSAGES = [
    'Conectando ao servidor...',
    'Servidor dormindo, acordando... ☕',
    'Isso pode levar até 30 segundos...',
    'Quase lá, aguarde um momento...',
    'Servidor acordando, já volto...',
];

async function waitForServer() {
    let attempt = 0;
    while (true) {
        try {
            splashStatusText.textContent = RETRY_MESSAGES[Math.min(attempt, RETRY_MESSAGES.length - 1)];
            const res = await fetch('/ping', { signal: AbortSignal.timeout(8000) });
            if (res.ok) {
                // Servidor respondeu! Fade out da splash
                splashStatusText.textContent = 'Pronto! ✅';
                // Carregar limites antes de sumir a splash
                await checkLimits();
                setTimeout(() => {
                    splashScreen.classList.add('hidden');
                }, 500);
                return;
            }
        } catch (e) {
            // Timeout ou erro de rede — servidor ainda dormindo, tenta de novo
        }
        attempt++;
        await new Promise(r => setTimeout(r, 3000)); // Espera 3s antes de tentar de novo
    }
}

window.addEventListener('DOMContentLoaded', () => {
    waitForServer();
});



const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const continueBtn = document.getElementById('continueBtn');
const saveBtn = document.getElementById('saveBtn');
const mainControls = document.getElementById('mainControls');
const postRecordControls = document.getElementById('postRecordControls');
const statusText = document.getElementById('statusText');
const statusIndicator = document.getElementById('status');
const transcricaoResult = document.getElementById('transcricao-result');
const timerElement = document.getElementById('timer');

let mediaRecorder;
let wakeLock = null;
let timerInterval = null;
let secondsRecorded = 0;
let isRecordingIntentionally = false;
let chunkIntervalTimer = null;
let currentReuniaoId = null; // ID do registro atual no banco (salva a cada chunk)
let limiteAtingido = false;  // Flag que bloqueia o início da gravação

// Verificar limites de uso ao carregar a tela
async function checkLimits() {
    try {
        const res = await authFetch('/user/limits');
        if (!res || !res.ok) return;
        const data = await res.json();

        const { transcricoes } = data;
        const limiteBanner = document.getElementById('limit-banner');

        if (transcricoes.usado >= transcricoes.limite) {
            limiteAtingido = true;
            startBtn.disabled = true;
            startBtn.style.opacity = '0.4';
            startBtn.style.cursor = 'not-allowed';
            statusText.textContent = '';
            if (limiteBanner) {
                limiteBanner.innerHTML = `
                    ⚠️ <strong>Limite de transcrições atingido</strong> (${transcricoes.usado}/${transcricoes.limite})<br>
                    <small>Acesse <a href="history.html" style="color:var(--primary-color)">Transcrições</a> e exclua gravações antigas para liberar espaço.</small>
                `;
                limiteBanner.classList.remove('hidden');
            }
        } else {
            // Liberar UI se estava bloqueada
            limiteAtingido = false;
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            startBtn.style.cursor = 'pointer';
            if (limiteBanner) limiteBanner.classList.add('hidden');

            // Mostrar contador no status
            if (statusText && !isRecordingIntentionally) {
                statusText.textContent = `Toque no microfone para iniciar. (${transcricoes.usado}/${transcricoes.limite} transcrições usadas)`;
            }
        }
    } catch (e) {
        console.warn('[LIMITS] Não foi possível verificar os limites.', e);
    }
}

function updateTimer() {
    secondsRecorded++;
    const hrs = String(Math.floor(secondsRecorded / 3600)).padStart(2, '0');
    const mins = String(Math.floor((secondsRecorded % 3600) / 60)).padStart(2, '0');
    const secs = String(secondsRecorded % 60).padStart(2, '0');
    timerElement.textContent = `${hrs}:${mins}:${secs}`;
}

// RENDER FREE TIER OPTIMIZATION: Chunk de 1 minuto em milissegundos
const CHUNK_TIME_MS = 60000; 

// Função para impedir que a tela apague no iOS
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('[CLIENT] Wake Lock ativo.');
        } catch (err) {
            console.error(`[CLIENT] Erro no Wake Lock: ${err.name}, ${err.message}`);
        }
    } else {
        console.warn('[CLIENT] Wake Lock API não suportada neste browser.');
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release()
            .then(() => {
                wakeLock = null;
                console.log('[CLIENT] Wake Lock liberado.');
            });
    }
}

// Função central para iniciar/continuar gravação
async function startRecording() {
    if (limiteAtingido) {
        alert('Limite de transcrições atingido. Por favor, exclua algumas para continuar.');
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Ativar Wake Lock imediatamente para impedir hibernação da aba no iOS
        await requestWakeLock();

        // Remove placeholder se existir
        const placeholder = transcricaoResult.querySelector('.placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        // Configuração do MediaRecorder
        const options = { mimeType: 'audio/webm' };
        if (!MediaRecorder.isTypeSupported('audio/webm')) {
            console.warn('[CLIENT] audio/webm não suportado. Usando formato padrão.');
            mediaRecorder = new MediaRecorder(stream);
        } else {
            mediaRecorder = new MediaRecorder(stream, options);
        }

        isRecordingIntentionally = true;

        mediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0) {
                console.log(`[CLIENT] Chunk gerado. Tamanho: ${event.data.size} bytes`);
                // Enviar de forma assíncrona, sem bloquear a gravação do próximo chunk
                sendChunkToBackend(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            // Reinicia imediatamente para não perder áudio, gerando um novo header WebM
            if (isRecordingIntentionally && mediaRecorder.state === 'inactive') {
                mediaRecorder.start();
            }
        };

        // RENDER FREE TIER OPTIMIZATION: Reiniciar o gravador manualmente a cada N segundos
        mediaRecorder.start();
        
        clearInterval(chunkIntervalTimer);
        chunkIntervalTimer = setInterval(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop(); // Isso dispara o ondataavailable e em seguida o onstop (que chama o start de novo)
            }
        }, CHUNK_TIME_MS);
        
        // UI Updates
        mainControls.classList.remove('hidden');
        postRecordControls.classList.add('hidden');
        // Adiciona efeito de pulso no botão principal
        startBtn.classList.add('recording');
        // Habilita o botão de parar
        stopBtn.disabled = false;
        
        statusIndicator.classList.add('recording');
        statusText.textContent = 'Gravando...';
        
        // Resume timer or start from 0 if it's the first time
        timerElement.classList.remove('hidden');
        clearInterval(timerInterval);
        timerInterval = setInterval(updateTimer, 1000);

    } catch (err) {
        console.error('[CLIENT] Erro ao acessar o microfone:', err);
        alert('É necessário permitir o acesso ao microfone para gravar.');
    }
}

// Event Listeners
startBtn.addEventListener('click', startRecording);
continueBtn.addEventListener('click', startRecording);

// Parar a gravação
stopBtn.addEventListener('click', () => {
    isRecordingIntentionally = false;
    clearInterval(chunkIntervalTimer);
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        if (mediaRecorder.stream) {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
    }
    
    releaseWakeLock();
    clearInterval(timerInterval);

    // UI Updates - Oculta Stop, exibe opções Pós-gravação
    mainControls.classList.add('hidden');
    postRecordControls.classList.remove('hidden');
    statusIndicator.classList.remove('recording');
    startBtn.classList.remove('recording');
    stopBtn.disabled = true;
    statusText.textContent = 'Gravação pausada';
});

// Salvar / Finalizar a transcrição
saveBtn.addEventListener('click', async () => {
    // Se já foi salvo no banco via chunks, só precisamos resetar a UI
    if (currentReuniaoId) {
        statusText.textContent = 'Transcrição finalizada! ✅';
    } else {
        // Fallback: salva tudo de uma vez caso nenhum chunk tenha sido transcrito ainda
        const resultClone = transcricaoResult.cloneNode(true);
        const tempSpans = resultClone.querySelectorAll('span[style*="var(--text-secondary)"], span[style*="var(--danger-color)"]');
        tempSpans.forEach(span => span.remove());
        
        const textToSave = resultClone.innerText.trim();
        if (!textToSave || textToSave === 'A transcrição aparecerá aqui...') {
            alert('Não há transcrição para salvar.');
            return;
        }

        try {
            statusText.textContent = 'Salvando no histórico...';
            await authFetch('/salvar-reuniao', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conteudo_transcrito: textToSave })
            });
        } catch(e) {
            console.error('[CLIENT] Erro ao salvar no BD:', e);
            alert('Erro ao salvar no banco.');
        }
    }

    // Resetar UI para novo uso
    currentReuniaoId = null;
    mainControls.classList.remove('hidden');
    postRecordControls.classList.add('hidden');
    startBtn.classList.remove('recording');
    stopBtn.disabled = true;
    
    timerElement.classList.add('hidden');
    timerElement.textContent = '00:00:00';
    secondsRecorded = 0;
    
    statusText.textContent = 'Pronto para gravar';
    transcricaoResult.innerHTML = '<p class="placeholder">A transcrição aparecerá aqui...</p>';
    
    // Atualizar limites após salvar novo item
    checkLimits();
});

// historyBtn removido pois usamos Bottom Tabs (links a)

// RENDER FREE TIER OPTIMIZATION: Upload Assíncrono e Resiliência
async function sendChunkToBackend(blob) {
    const formData = new FormData();
    formData.append('audio', blob, 'chunk.webm');

    const tempId = 'chunk-' + Date.now();
    const tempSpan = document.createElement('span');
    tempSpan.id = tempId;
    tempSpan.style.color = 'var(--text-secondary)';
    tempSpan.textContent = ' [Processando...] ';
    transcricaoResult.appendChild(tempSpan);

    try {
        console.log(`[CLIENT] Enviando chunk para o backend...`);
        const response = await authFetch('/transcrever', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Erro do servidor: ${response.status}`);
        }

        const data = await response.json();
        const resultElement = document.getElementById(tempId);
        
        if (resultElement && data.texto) {
            resultElement.textContent = data.texto + ' ';
            resultElement.style.color = 'var(--text-primary)';
            resultElement.className = 'chunk-text';
            resultElement.removeAttribute('id');

            // PERSIST: Salvar no banco a cada chunk transcrito com sucesso
            if (!currentReuniaoId) {
                // Primeira vez: cria um novo registro no banco
                try {
                    const saveRes = await authFetch('/salvar-reuniao', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ conteudo_transcrito: data.texto })
                    });
                    const saveData = await saveRes.json();
                    if (saveData.reuniao && saveData.reuniao._id) {
                        currentReuniaoId = saveData.reuniao._id;
                        console.log(`[PERSIST] Novo registro criado no banco. ID: ${currentReuniaoId}`);
                    }
                } catch(e) {
                    console.error('[PERSIST] Falha ao criar registro inicial:', e);
                }
            } else {
                // Chunks seguintes: acrescenta ao registro existente
                try {
                    await authFetch(`/reunioes/${currentReuniaoId}/append`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ novo_texto: data.texto })
                    });
                    console.log(`[PERSIST] Chunk acrescentado ao registro ID: ${currentReuniaoId}`);
                } catch(e) {
                    console.error('[PERSIST] Falha ao acrescentar chunk:', e);
                }
            }
        }

    } catch (error) {
        console.error(`[CLIENT] Erro de rede ou timeout ao transcrever chunk:`, error);
        const resultElement = document.getElementById(tempId);
        if (resultElement) {
            resultElement.textContent = ' [Erro de conexão neste trecho] ';
            resultElement.style.color = 'var(--danger-color)';
        }
    } finally {
        const container = document.querySelector('.app-content');
        if(container) container.scrollTop = container.scrollHeight;
    }
}

// BACKGROUND FAILSAFE: Salva a gravação automaticamente se o app for minimizado
document.addEventListener("visibilitychange", () => {
    // Se o usuário saiu do app e estava gravando
    if (document.visibilityState === 'hidden' && isRecordingIntentionally) {
        console.log('[BACKGROUND] App minimizado. Pausando e salvando a gravação por segurança.');
        
        // 1. Para a gravação
        stopBtn.click();
        
        // 2. Dá 2 segundos de margem para o último chunk subir para o servidor, então salva.
        setTimeout(() => {
            saveBtn.click();
        }, 2000);
    }
});
