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
                // Servidor respondeu!
                sessionStorage.setItem('appStarted', 'true');
                splashStatusText.textContent = 'Pronto! ✅';
                // Carregar limites antes de sumir a splash
                await checkLimits();
                setTimeout(() => {
                    splashScreen.classList.add('hidden');
                }, 800); // 800ms para a animação de saída ficar bonita
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
    // Se a sessão já foi iniciada, NUNCA mais mostra a splash screen (apenas na abertura do app)
    if (sessionStorage.getItem('appStarted') === 'true') {
        splashScreen.style.display = 'none'; // Remove direto do fluxo para evitar qualquer piscar
        checkLimits(); // Carrega limites no fundo silenciosamente
    } else {
        waitForServer();
    }
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

// Câmera UI
const photoBtn = document.getElementById('photoBtn');
const cameraModal = document.getElementById('cameraModal');
const cameraPreview = document.getElementById('cameraPreview');
const btnCancelCamera = document.getElementById('btnCancelCamera');
const btnCapturePhoto = document.getElementById('btnCapturePhoto');
const photoThumbnailsContainer = document.getElementById('photoThumbnailsContainer');
const photoThumbnails = document.getElementById('photoThumbnails');
let cameraStream = null;

let mediaRecorder;
let wakeLock = null;
let timerInterval = null;
let secondsRecorded = 0;
let isRecordingIntentionally = false;
let chunkIntervalTimer = null;
let currentReuniaoId = null; // ID do registro atual no banco (salva a cada chunk)
let limiteAtingido = false;  // Flag que bloqueia o início da gravação

// ==========================================
// OFFLINE RETRY QUEUE (IndexedDB)
// ==========================================
let db;
const DB_NAME = 'PlaubertDB';
const STORE_NAME = 'pending_chunks';

// Inicializar IndexedDB
const request = indexedDB.open(DB_NAME, 1);
request.onupgradeneeded = (event) => {
    db = event.target.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    }
};
request.onsuccess = (event) => {
    db = event.target.result;
    // Tenta processar fila assim que o banco estiver pronto
    processChunkQueue();
};
request.onerror = (event) => {
    console.error('[INDEXEDDB] Erro ao abrir banco local:', event.target.error);
};

// Variáveis globais (antes de app.js principal)
let currentLocalSessionId = null;

// Salvar chunk na fila
function saveChunkToQueue(blob, tempId, reuniaoId) {
    if (!db) return;
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.add({
        blob: blob,
        tempId: tempId,
        reuniaoId: reuniaoId,
        localSessionId: currentLocalSessionId,
        timestamp: Date.now()
    });
    console.log(`[QUEUE] Chunk salvo na fila local (tempId: ${tempId}, localSessionId: ${currentLocalSessionId})`);
}

// Consumir fila e reenviar
let isProcessingQueue = false;
async function processChunkQueue() {
    if (!db || isProcessingQueue || !navigator.onLine) return;
    isProcessingQueue = true;

    try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = async () => {
            const chunks = request.result;
            // Ordenar por timestamp para garantir a ordem da transcrição
            chunks.sort((a, b) => a.timestamp - b.timestamp);

            const sessionMap = {}; // localSessionId -> real_id do Mongo

            for (const item of chunks) {
                // Parar processamento se a internet cair no meio
                if (!navigator.onLine) break;

                console.log(`[QUEUE] Processando chunk pendente: ${item.tempId}`);
                const formData = new FormData();
                formData.append('audio', item.blob, 'chunk.webm');
                
                let targetReuniaoId = item.reuniaoId;
                if (!targetReuniaoId && item.localSessionId && sessionMap[item.localSessionId]) {
                    targetReuniaoId = sessionMap[item.localSessionId];
                }

                if (targetReuniaoId) {
                    formData.append('reuniao_id', targetReuniaoId);
                }

                try {
                    const response = await authFetch('/transcrever', {
                        method: 'POST',
                        body: formData
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const resultElement = document.getElementById(item.tempId);
                        
                        if (resultElement && data.texto) {
                            resultElement.textContent = data.texto + ' ';
                            resultElement.style.color = 'var(--text-primary)';
                            resultElement.classList.remove('queued');
                            resultElement.removeAttribute('id');
                        }

                        // Persistir no banco após transcrição
                        if (!targetReuniaoId) {
                            // Criar nova reunião se for o primeiro chunk offline
                            const saveRes = await authFetch('/salvar-reuniao', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ conteudo_transcrito: data.texto })
                            });
                            const saveData = await saveRes.json();
                            if (saveData.reuniao && saveData.reuniao._id) {
                                targetReuniaoId = saveData.reuniao._id;
                                if (item.localSessionId) {
                                    sessionMap[item.localSessionId] = targetReuniaoId;
                                    // Sincronizar o estado global caso o usuário ainda esteja na tela sem gravar
                                    if (currentLocalSessionId === item.localSessionId && !currentReuniaoId) {
                                        currentReuniaoId = targetReuniaoId;
                                    }
                                }
                            }
                        } else {
                            // Acrescentar
                            await authFetch(`/reunioes/${targetReuniaoId}/append`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ novo_texto: data.texto })
                            });
                        }

                        // Sucesso total, remover do IndexedDB
                        const delTx = db.transaction([STORE_NAME], 'readwrite');
                        delTx.objectStore(STORE_NAME).delete(item.id);
                        console.log(`[QUEUE] Chunk ${item.tempId} enviado e removido da fila.`);
                    }
                } catch (error) {
                    console.error(`[QUEUE] Falha ao re-enviar chunk ${item.tempId}:`, error);
                    // Sai do loop para tentar o resto depois, mantendo a ordem
                    break;
                }
            }
        };
    } finally {
        isProcessingQueue = false;
    }
}

// Gatilhos para processar a fila
window.addEventListener('online', () => {
    console.log('[NETWORK] Conexão restaurada. Processando fila...');
    processChunkQueue();
});
setInterval(processChunkQueue, 15000); // Tentar a cada 15 segundos se houver algo
// ==========================================

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

        // Inicializar a sessão local para a fila offline não se misturar
        currentLocalSessionId = Date.now().toString();

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
        // Habilita os botões de controle
        stopBtn.disabled = false;
        if (photoBtn) photoBtn.disabled = false;
        const commentBtn = document.getElementById('commentBtn');
        if (commentBtn) commentBtn.disabled = false;
        
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
    if (photoBtn) photoBtn.disabled = true;
    const commentBtn = document.getElementById('commentBtn');
    if (commentBtn) commentBtn.disabled = true;
    statusText.textContent = 'Gravação pausada';
});

// ==========================================
// CÂMERA IN-APP (WEBRTC) - Captura de Fotos
// ==========================================
// Variáveis para Zoom
let videoTrack = null;
let minZoom = 1;
let maxZoom = 1;
let currentZoom = 1;
let initialPinchDistance = null;

photoBtn.addEventListener('click', async () => {
    if (!currentReuniaoId) {
        alert('Aguarde o primeiro trecho de áudio ser salvo para tirar fotos.');
        return;
    }
    
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } // Câmera traseira
        });
        cameraPreview.srcObject = cameraStream;
        cameraModal.classList.remove('hidden');
        
        // Tentar obter suporte a Zoom
        videoTrack = cameraStream.getVideoTracks()[0];
        const capabilities = videoTrack.getCapabilities();
        const settings = videoTrack.getSettings();
        
        if (capabilities.zoom) {
            minZoom = capabilities.zoom.min || 1;
            maxZoom = capabilities.zoom.max || 5;
            currentZoom = settings.zoom || minZoom;
        }
    } catch (err) {
        console.error('[CAMERA] Erro ao acessar a câmera:', err);
        alert('Não foi possível acessar a câmera.');
    }
});

// Lógica de Pinch-to-Zoom na tela da Câmera
cameraPreview.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2 && videoTrack) {
        initialPinchDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
    }
});

cameraPreview.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && initialPinchDistance && videoTrack) {
        e.preventDefault(); // Impede o scroll
        
        const currentDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        
        // Calcular o quão rápido a pinça está abrindo/fechando (ajuste sensibilidade)
        const ratio = currentDistance / initialPinchDistance;
        let newZoom = currentZoom * (ratio > 1 ? 1.05 : 0.95);
        
        newZoom = Math.max(minZoom, Math.min(newZoom, maxZoom));
        
        // Aplica o novo zoom se for suportado e atualiza a variável atual
        videoTrack.applyConstraints({ advanced: [{ zoom: newZoom }] })
            .then(() => {
                currentZoom = newZoom;
                initialPinchDistance = currentDistance; // Atualiza para suavizar o movimento
            })
            .catch(err => console.log('Zoom não aplicado:', err));
    }
}, { passive: false }); // passive false para o preventDefault funcionar

cameraPreview.addEventListener('touchend', () => {
    initialPinchDistance = null;
});

btnCancelCamera.addEventListener('click', () => {
    fecharCamera();
});

btnCapturePhoto.addEventListener('click', async () => {
    if (!cameraStream) return;
    
    // Feedback visual
    btnCapturePhoto.textContent = '⏳ Salvando...';
    btnCapturePhoto.disabled = true;

    // Desenhar o frame atual em um canvas
    const canvas = document.createElement('canvas');
    canvas.width = cameraPreview.videoWidth;
    canvas.height = cameraPreview.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cameraPreview, 0, 0, canvas.width, canvas.height);
    
    // Exportar para Base64 (compressão JPEG 0.7)
    const base64Image = canvas.toDataURL('image/jpeg', 0.7);
    
    // Pegar minutagem atual
    const minutagem = timerElement.textContent;
    
    // Exibir miniatura na UI
    adicionarMiniatura(base64Image, minutagem);
    
    // Enviar para o backend
    try {
        const res = await authFetch(`/reunioes/${currentReuniaoId}/fotos`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ foto_base64: base64Image, minutagem: minutagem })
        });
        
        if (!res.ok) throw new Error('Erro ao salvar foto no backend');
        console.log('[CAMERA] Foto anexada com sucesso à reunião:', currentReuniaoId);
    } catch (err) {
        console.error('[CAMERA]', err);
        alert('A foto foi tirada, mas houve um erro ao salvá-na nuvem.');
    } finally {
        fecharCamera();
        btnCapturePhoto.textContent = '📸 Capturar';
        btnCapturePhoto.disabled = false;
    }
});

function fecharCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    cameraModal.classList.add('hidden');
}

function adicionarMiniatura(base64Src, minutagem) {
    photoThumbnailsContainer.classList.remove('hidden');
    const imgWrapper = document.createElement('div');
    imgWrapper.style.position = 'relative';
    imgWrapper.style.display = 'inline-block';
    
    const img = document.createElement('img');
    img.src = base64Src;
    img.className = 'photo-thumbnail';
    
    if (minutagem) {
        const timeLabel = document.createElement('span');
        timeLabel.textContent = minutagem;
        timeLabel.style.position = 'absolute';
        timeLabel.style.bottom = '2px';
        timeLabel.style.right = '2px';
        timeLabel.style.background = 'rgba(0,0,0,0.7)';
        timeLabel.style.color = '#fff';
        timeLabel.style.fontSize = '0.6rem';
        timeLabel.style.padding = '2px 4px';
        timeLabel.style.borderRadius = '4px';
        imgWrapper.appendChild(img);
        imgWrapper.appendChild(timeLabel);
        photoThumbnails.appendChild(imgWrapper);
    } else {
        photoThumbnails.appendChild(img);
    }
}

// ==========================================
// NOTAS RÁPIDAS (POST-ITS)
// ==========================================
const commentBtn = document.getElementById('commentBtn');
const commentModal = document.getElementById('commentModal');
const commentInput = document.getElementById('commentInput');
const commentCharCount = document.getElementById('commentCharCount');
const btnCancelComment = document.getElementById('btnCancelComment');
const btnSaveComment = document.getElementById('btnSaveComment');
let commentMinutagem = null;

if (commentBtn) {
    commentBtn.addEventListener('click', () => {
        if (!currentReuniaoId) {
            alert('Aguarde o primeiro trecho de áudio ser salvo para adicionar notas.');
            return;
        }
        commentMinutagem = timerElement.textContent; // Captura o tempo no clique
        commentInput.value = '';
        commentCharCount.textContent = '0/50';
        commentModal.classList.remove('hidden');
        setTimeout(() => commentInput.focus(), 100);
    });
}

if (commentInput) {
    commentInput.addEventListener('input', () => {
        commentCharCount.textContent = `${commentInput.value.length}/50`;
    });
}

if (btnCancelComment) {
    btnCancelComment.addEventListener('click', () => {
        commentModal.classList.add('hidden');
    });
}

if (btnSaveComment) {
    btnSaveComment.addEventListener('click', async () => {
        const texto = commentInput.value.trim();
        if (!texto) return;

        btnSaveComment.textContent = 'Fixando...';
        btnSaveComment.disabled = true;

        try {
            const res = await authFetch(`/reunioes/${currentReuniaoId}/comentarios`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texto: texto, minutagem: commentMinutagem })
            });
            
            if (!res.ok) throw new Error('Erro ao salvar comentário');
            
            // Adicionar miniatura visual do post-it na UI
            adicionarMiniaturaPostit(texto, commentMinutagem);
            
        } catch (err) {
            console.error('[COMMENT]', err);
            alert('A nota foi criada, mas houve um erro ao salvá-la na nuvem.');
        } finally {
            commentModal.classList.add('hidden');
            btnSaveComment.textContent = 'Fixar';
            btnSaveComment.disabled = false;
        }
    });
}

function adicionarMiniaturaPostit(texto, minutagem) {
    photoThumbnailsContainer.classList.remove('hidden');
    const postitWrapper = document.createElement('div');
    postitWrapper.style.position = 'relative';
    postitWrapper.style.display = 'inline-block';
    postitWrapper.style.width = '60px';
    postitWrapper.style.height = '60px';
    postitWrapper.style.background = '#fbbf24';
    postitWrapper.style.borderRadius = '4px';
    postitWrapper.style.padding = '4px';
    postitWrapper.style.boxShadow = '2px 2px 5px rgba(0,0,0,0.3)';
    postitWrapper.style.fontFamily = "'Comic Sans MS', 'Chalkboard SE', sans-serif";
    postitWrapper.style.color = '#000';
    postitWrapper.style.overflow = 'hidden';
    postitWrapper.style.transform = `rotate(${Math.random() * 10 - 5}deg)`;
    
    const textSpan = document.createElement('div');
    textSpan.textContent = texto;
    textSpan.style.fontSize = '0.5rem';
    textSpan.style.lineHeight = '1.2';
    textSpan.style.wordBreak = 'break-word';
    postitWrapper.appendChild(textSpan);
    
    if (minutagem) {
        const timeLabel = document.createElement('span');
        timeLabel.textContent = minutagem;
        timeLabel.style.position = 'absolute';
        timeLabel.style.bottom = '2px';
        timeLabel.style.right = '2px';
        timeLabel.style.background = 'rgba(0,0,0,0.5)';
        timeLabel.style.color = '#fff';
        timeLabel.style.fontSize = '0.5rem';
        timeLabel.style.padding = '1px 3px';
        timeLabel.style.borderRadius = '2px';
        postitWrapper.appendChild(timeLabel);
    }
    
    photoThumbnails.appendChild(postitWrapper);
}

// ==========================================

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
        const hasQueuedChunks = transcricaoResult.querySelectorAll('.queued').length > 0;
        
        if (!textToSave || textToSave === 'A transcrição aparecerá aqui...') {
            if (hasQueuedChunks) {
                // Deixa a fila offline resolver no background e apenas avisa
                statusText.textContent = 'Salvo na fila offline! ⏳';
            } else {
                alert('Não há transcrição para salvar.');
                return;
            }
        } else {
            try {
                statusText.textContent = 'Salvando no histórico...';
                await authFetch('/salvar-reuniao', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ conteudo_transcrito: textToSave })
                });
            } catch(e) {
                console.error('[CLIENT] Erro ao salvar no BD:', e);
                // Mesmo com erro de rede, se caiu aqui, a UI deve liberar
                alert('Erro ao sincronizar. O app tentará novamente em background.');
            }
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
    photoThumbnailsContainer.classList.add('hidden');
    photoThumbnails.innerHTML = '';
    
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
        
        // Salvar na fila offline
        saveChunkToQueue(blob, tempId, currentReuniaoId);
        
        const resultElement = document.getElementById(tempId);
        if (resultElement) {
            resultElement.textContent = ' [⏳ Na fila de reenvio...] ';
            resultElement.style.color = '#eab308'; // Amarelo/warning
            resultElement.classList.add('queued');
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
