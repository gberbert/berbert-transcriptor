// RENDER FREE TIER OPTIMIZATION: Mitigação de Cold Start (Render Sleep)
// Acordar o servidor imediatamente ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
    console.log('[CLIENT] Enviando ping para acordar o servidor...');
    fetch('/ping')
        .then(res => res.text())
        .then(text => console.log('[CLIENT] Servidor acordou:', text))
        .catch(err => console.error('[CLIENT] Erro ao acordar o servidor:', err));
});

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const continueBtn = document.getElementById('continueBtn');
const saveBtn = document.getElementById('saveBtn');
const historyBtn = document.getElementById('historyBtn');
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

function updateTimer() {
    secondsRecorded++;
    const hrs = String(Math.floor(secondsRecorded / 3600)).padStart(2, '0');
    const mins = String(Math.floor((secondsRecorded % 3600) / 60)).padStart(2, '0');
    const secs = String(secondsRecorded % 60).padStart(2, '0');
    timerElement.textContent = `${hrs}:${mins}:${secs}`;
}

// RENDER FREE TIER OPTIMIZATION: Chunk de 3 minutos em milissegundos
const CHUNK_TIME_MS = 180000; 

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

        mediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0) {
                console.log(`[CLIENT] Chunk gerado. Tamanho: ${event.data.size} bytes`);
                // Enviar de forma assíncrona, sem bloquear a gravação do próximo chunk
                sendChunkToBackend(event.data);
            }
        };

        // RENDER FREE TIER OPTIMIZATION: Iniciar fatiamento (chunking) a cada 3 minutos
        mediaRecorder.start(CHUNK_TIME_MS);
        
        // UI Updates
        mainControls.classList.remove('hidden');
        postRecordControls.classList.add('hidden');
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
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
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    
    releaseWakeLock();
    clearInterval(timerInterval);

    // UI Updates - Oculta Stop, exibe opções Pós-gravação
    mainControls.classList.add('hidden');
    postRecordControls.classList.remove('hidden');
    statusIndicator.classList.remove('recording');
    statusText.textContent = 'Gravação pausada';
});

// Salvar a transcrição
saveBtn.addEventListener('click', async () => {
    // Clonar o resultado e remover spans de status temporários
    const resultClone = transcricaoResult.cloneNode(true);
    const tempSpans = resultClone.querySelectorAll('span[style*="var(--text-secondary)"], span[style*="var(--danger-color)"]');
    tempSpans.forEach(span => span.remove());
    
    const textToSave = resultClone.innerText.trim();
    if (!textToSave || textToSave === 'A transcrição aparecerá aqui...') {
        alert('Não há transcrição para salvar.');
        return;
    }

    // Salvar no Banco de Dados MongoDB via Backend
    try {
        statusText.textContent = 'Salvando no histórico...';
        await fetch('/salvar-reuniao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conteudo_transcrito: textToSave })
        });
    } catch(e) {
        console.error('[CLIENT] Erro ao salvar no BD:', e);
        alert('Erro ao salvar no banco. Baixando o arquivo de texto.');
    }

    // Download do arquivo TXT localmente
    const blob = new Blob([textToSave], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcricao_berbert_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    // Resetar UI para novo uso
    mainControls.classList.remove('hidden');
    postRecordControls.classList.add('hidden');
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    
    timerElement.classList.add('hidden');
    timerElement.textContent = '00:00:00';
    secondsRecorded = 0;
    
    statusText.textContent = 'Pronto para gravar';
    transcricaoResult.innerHTML = '<p class="placeholder">A transcrição aparecerá aqui...</p>';
});

// Lógica de Navegação para a Tela de Histórico
historyBtn.addEventListener('click', () => {
    window.location.href = 'history.html';
});

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
        const response = await fetch('/transcrever', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Erro do servidor: ${response.status}`);
        }

        const data = await response.json();
        const resultElement = document.getElementById(tempId);
        
        // Usar data.texto de acordo com os requisitos
        if (resultElement && data.texto) {
            resultElement.textContent = data.texto + ' ';
            resultElement.style.color = 'var(--text-primary)';
            resultElement.className = 'chunk-text';
            resultElement.removeAttribute('id');
        }

    } catch (error) {
        // RENDER FREE TIER OPTIMIZATION: Falhas de rede não param a gravação contínua do MediaRecorder
        console.error(`[CLIENT] Erro de rede ou timeout ao transcrever chunk. A gravação continua. Erro:`, error);
        const resultElement = document.getElementById(tempId);
        if (resultElement) {
            resultElement.textContent = ' [Erro de conexão neste trecho] ';
            resultElement.style.color = 'var(--danger-color)';
        }
    } finally {
        // Manter auto-scroll
        const container = document.querySelector('.transcription-container');
        container.scrollTop = container.scrollHeight;
    }
}
