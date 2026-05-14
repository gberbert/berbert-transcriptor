const historyList = document.getElementById('history-list');
const historyDetail = document.getElementById('history-detail');
const detailTitle = document.getElementById('detail-title');
const detailDate = document.getElementById('detail-date');
const detailContent = document.getElementById('detail-content');
const backToListBtn = document.getElementById('backToList');
const loadingIndicator = document.getElementById('loading');

// Modal Elements
const summaryModal = document.getElementById('summaryModal');
const btnOpenSummaryModal = document.getElementById('btnOpenSummaryModal');
const btnCloseSummaryModal = document.getElementById('btnCloseSummaryModal');
const summaryType = document.getElementById('summaryType');
const summaryPrompt = document.getElementById('summaryPrompt');
const btnSubmitSummary = document.getElementById('btnSubmitSummary');
const summaryLoadingText = document.getElementById('summaryLoadingText');

const btnCopyTranscription = document.getElementById('btnCopyTranscription');

let reunioesCache = [];
let reuniaoAtual = null;

async function loadHistory() {
    try {
        const response = await authFetch('/reunioes');
        const data = await response.json();
        
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        
        if (data.error) throw new Error(data.error);
        
        reunioesCache = data;
        
        if (data.length === 0) {
            historyList.innerHTML = '<p class="status-text">Nenhuma reunião salva ainda.</p>';
            return;
        }

        historyList.innerHTML = '';
        data.forEach((reuniao, index) => {
            const container = document.createElement('div');
            container.className = 'swipe-container';
            
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'swipe-actions';
            actionsDiv.innerHTML = `
                <button class="swipe-action-btn swipe-action-edit" title="Editar">✏️</button>
                <button class="swipe-action-btn swipe-action-delete" title="Excluir">🗑️</button>
            `;
            
            const div = document.createElement('div');
            div.className = 'history-item';
            // Prevenir scroll vertical durante swipe horizontal via CSS nativo
            div.style.touchAction = 'pan-y'; 
            
            const dataStr = new Date(reuniao.data_reuniao).toLocaleString('pt-BR');
            let preview = reuniao.conteudo_transcrito.substring(0, 150);
            if (reuniao.conteudo_transcrito.length > 150) preview += '...';
            
            div.innerHTML = `
                <div class="history-item-title">${reuniao.titulo || 'Reunião Sem Título'}</div>
                <div class="history-item-date">${dataStr}</div>
                <p class="history-item-preview">${preview}</p>
            `;
            
            // Touch Swipe Logic
            let startX = 0;
            let currentX = 0;
            const threshold = 140; // max px to swipe left (2 buttons)
            let isSwiped = false;
            
            div.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                div.classList.add('swiping');
            });
            
            div.addEventListener('touchmove', (e) => {
                const diffX = e.touches[0].clientX - startX;
                // Only allow swiping left, or swiping right to close
                if (diffX < 0 && !isSwiped) {
                    currentX = Math.max(diffX, -threshold - 20); // add a bit of elasticity
                    div.style.transform = `translateX(${currentX}px)`;
                } else if (diffX > 0 && isSwiped) {
                    currentX = Math.min(-threshold + diffX, 0);
                    div.style.transform = `translateX(${currentX}px)`;
                }
            });
            
            div.addEventListener('touchend', () => {
                div.classList.remove('swiping');
                if (currentX < -60) {
                    div.style.transform = `translateX(-${threshold}px)`;
                    isSwiped = true;
                } else {
                    div.style.transform = `translateX(0px)`;
                    isSwiped = false;
                }
                currentX = isSwiped ? -threshold : 0;
            });
            
            // Edit logic
            actionsDiv.querySelector('.swipe-action-edit').addEventListener('click', () => {
                const novoTitulo = prompt("Novo título para a transcrição:", reuniao.titulo || "Reunião Sem Título");
                if (novoTitulo) {
                    authFetch('/reunioes/' + reuniao._id, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ titulo: novoTitulo })
                    }).then(() => loadHistory());
                }
            });
            
            // Delete logic
            actionsDiv.querySelector('.swipe-action-delete').addEventListener('click', () => {
                if(confirm("Tem certeza que deseja excluir esta transcrição? (Os resumos vinculados também sumirão)")) {
                    authFetch('/reunioes/' + reuniao._id, { method: 'DELETE' })
                    .then(() => loadHistory());
                }
            });
            
            // Ao clicar no item, fecha se estiver aberto, senão abre detalhe
            div.addEventListener('click', () => {
                if (isSwiped) {
                    div.style.transform = `translateX(0px)`;
                    isSwiped = false;
                    currentX = 0;
                } else {
                    openDetail(index);
                }
            });
            
            container.appendChild(actionsDiv);
            container.appendChild(div);
            historyList.appendChild(container);
        });
    } catch (e) {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        historyList.innerHTML = `<p class="status-text" style="color:var(--danger-color)">${e.message || 'Erro ao carregar histórico.'}</p>`;
    }
}

function openDetail(index) {
    const reuniao = reunioesCache[index];
    if (!reuniao) return;
    
    reuniaoAtual = reuniao;
    
    detailTitle.textContent = reuniao.titulo || 'Reunião Sem Título';
    detailDate.textContent = new Date(reuniao.data_reuniao).toLocaleString('pt-BR');
    detailContent.textContent = reuniao.conteudo_transcrito;
    
    // Carregar fotos e comentários se houver
    const photosContainer = document.getElementById('detail-photos-container');
    photosContainer.innerHTML = '';
    
    // Mesclar fotos e comentários em uma única timeline
    let timelineItems = [];
    
    if (reuniao.fotos) {
        reuniao.fotos.forEach(foto => {
            timelineItems.push({ type: 'foto', data: foto.base64, minutagem: foto.minutagem });
        });
    }
    
    if (reuniao.comentarios) {
        reuniao.comentarios.forEach(comentario => {
            timelineItems.push({ type: 'comentario', data: comentario.texto, minutagem: comentario.minutagem });
        });
    }
    
    if (timelineItems.length > 0) {
        photosContainer.classList.remove('hidden');
        
        // Função auxiliar para converter "HH:MM:SS" em segundos
        const timeToSec = (timeStr) => {
            if (!timeStr) return 0;
            const parts = timeStr.split(':');
            if (parts.length === 3) {
                return parseInt(parts[0])*3600 + parseInt(parts[1])*60 + parseInt(parts[2]);
            }
            return 0;
        };
        
        // Ordenar cronologicamente
        timelineItems.sort((a, b) => timeToSec(a.minutagem) - timeToSec(b.minutagem));
        
        let lastTimeSec = 0;
        
        timelineItems.forEach(item => {
            let currentTimeSec = timeToSec(item.minutagem);
            
            let deltaSec = currentTimeSec - lastTimeSec;
            if (deltaSec < 0) deltaSec = 0;
            lastTimeSec = currentTimeSec;
            
            // Escala: 1 segundo = 1.5 pixels de margem. 
            const marginTop = Math.min(Math.max(deltaSec * 1.5, 10), 150);
            
            const wrapper = document.createElement('div');
            wrapper.style.position = 'relative';
            wrapper.style.marginTop = `${marginTop}px`;
            wrapper.style.display = 'flex';
            wrapper.style.flexDirection = 'column';
            wrapper.style.alignItems = 'center';

            if (item.type === 'foto') {
                const img = document.createElement('img');
                img.src = item.data;
                img.className = 'photo-thumbnail';
                img.style.width = '70px';
                img.style.height = '70px';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '8px';
                img.style.cursor = 'pointer';
                img.onclick = () => openMediaModal('foto', item.data);
                wrapper.appendChild(img);
            } else if (item.type === 'comentario') {
                const postit = document.createElement('div');
                postit.style.width = '70px';
                postit.style.height = '70px';
                postit.style.background = '#fbbf24';
                postit.style.borderRadius = '4px';
                postit.style.padding = '4px';
                postit.style.boxShadow = '2px 2px 5px rgba(0,0,0,0.3)';
                postit.style.fontFamily = "'Comic Sans MS', 'Chalkboard SE', sans-serif";
                postit.style.color = '#000';
                postit.style.overflow = 'hidden';
                postit.style.transform = `rotate(${Math.random() * 10 - 5}deg)`;
                postit.style.cursor = 'pointer';
                postit.onclick = () => openMediaModal('comentario', item.data);
                
                const textSpan = document.createElement('div');
                textSpan.textContent = item.data;
                textSpan.style.fontSize = '0.55rem';
                textSpan.style.lineHeight = '1.2';
                textSpan.style.wordBreak = 'break-word';
                postit.appendChild(textSpan);
                wrapper.appendChild(postit);
            }
            
            const timeLabel = document.createElement('span');
            timeLabel.textContent = item.minutagem || '--:--';
            timeLabel.style.fontSize = '0.65rem';
            timeLabel.style.color = 'var(--text-secondary)';
            timeLabel.style.marginTop = '4px';

            wrapper.appendChild(timeLabel);
            photosContainer.appendChild(wrapper);
        });
    } else {
        photosContainer.classList.add('hidden');
    }
    
    // Animação de entrada
    historyDetail.classList.add('visible');
}

backToListBtn.addEventListener('click', () => {
    // Animação de saída
    historyDetail.classList.remove('visible');
    reuniaoAtual = null;
});

// Ação de Copiar
btnCopyTranscription.addEventListener('click', () => {
    if (!reuniaoAtual) return;
    navigator.clipboard.writeText(reuniaoAtual.conteudo_transcrito).then(() => {
        const originalIcon = btnCopyTranscription.textContent;
        btnCopyTranscription.textContent = '✅';
        setTimeout(() => {
            btnCopyTranscription.textContent = originalIcon;
        }, 2000);
    });
});

// Lógica do Modal de Resumo
btnOpenSummaryModal.addEventListener('click', () => {
    summaryModal.classList.remove('hidden');
});

btnCloseSummaryModal.addEventListener('click', () => {
    summaryModal.classList.add('hidden');
    summaryLoadingText.classList.add('hidden');
});

btnSubmitSummary.addEventListener('click', async () => {
    if (!reuniaoAtual) return;
    
    const tipo = summaryType.value;
    const prompt_extra = summaryPrompt.value;
    
    btnSubmitSummary.disabled = true;
    summaryLoadingText.classList.remove('hidden');
    
    try {
        const response = await authFetch('/gerar-resumo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reuniao_id: reuniaoAtual._id,
                tipo: tipo,
                prompt_extra: prompt_extra
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Sucesso!
        alert('Resumo gerado com sucesso!');
        summaryModal.classList.add('hidden');
        window.location.href = 'resumos.html'; // Redireciona para a nova tela
        
    } catch (e) {
        alert('Erro ao gerar resumo: ' + e.message);
    } finally {
        btnSubmitSummary.disabled = false;
        summaryLoadingText.classList.add('hidden');
    }
});

// ==========================================
// MEDIA MODAL LOGIC (Zoom & Share)
// ==========================================
const mediaModal = document.getElementById('mediaModal');
const mediaModalContent = document.getElementById('mediaModalContent');
const btnCloseMediaModal = document.getElementById('btnCloseMediaModal');
const btnShareMedia = document.getElementById('btnShareMedia');

let currentMediaBlob = null;
let currentMediaType = null;
let currentMediaText = null;

// Variáveis de Zoom/Pan
let currentScale = 1;
let currentPanX = 0;
let currentPanY = 0;
let isPanning = false;
let startX = 0, startY = 0;
let initialDistance = 0;

window.openMediaModal = function(type, data) {
    currentScale = 1; currentPanX = 0; currentPanY = 0;
    mediaModalContent.innerHTML = '';
    currentMediaType = type;
    
    if (type === 'foto') {
        const img = document.createElement('img');
        img.src = data;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';
        img.style.transform = `scale(${currentScale}) translate(${currentPanX}px, ${currentPanY}px)`;
        img.style.transition = 'transform 0.1s ease-out';
        mediaModalContent.appendChild(img);
        
        currentMediaBlob = data;
        currentMediaText = null;
        
        // Touch events for pinch & pan
        img.addEventListener('touchstart', handleTouchStart);
        img.addEventListener('touchmove', handleTouchMove);
        img.addEventListener('touchend', handleTouchEnd);
        
    } else if (type === 'comentario') {
        const postit = document.createElement('div');
        postit.style.width = '300px';
        postit.style.minHeight = '300px';
        postit.style.background = '#fbbf24';
        postit.style.padding = '20px';
        postit.style.boxShadow = '5px 5px 15px rgba(0,0,0,0.5)';
        postit.style.fontFamily = "'Comic Sans MS', 'Chalkboard SE', sans-serif";
        postit.style.fontSize = '1.5rem';
        postit.style.color = '#000';
        postit.style.display = 'flex';
        postit.style.alignItems = 'center';
        postit.style.justifyContent = 'center';
        postit.style.textAlign = 'center';
        postit.textContent = data;
        mediaModalContent.appendChild(postit);
        
        currentMediaText = data;
        currentMediaBlob = null;
    }
    
    mediaModal.classList.remove('hidden');
};

function handleTouchStart(e) {
    if (e.touches.length === 2) {
        initialDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
    } else if (e.touches.length === 1) {
        isPanning = true;
        startX = e.touches[0].clientX - currentPanX;
        startY = e.touches[0].clientY - currentPanY;
    }
}

function handleTouchMove(e) {
    e.preventDefault(); // Impede o scroll nativo da página
    const img = mediaModalContent.querySelector('img');
    if (!img) return;
    
    if (e.touches.length === 2) {
        const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        if (initialDistance) {
            const scaleChange = dist / initialDistance;
            currentScale = Math.max(1, Math.min(currentScale * scaleChange, 5));
            initialDistance = dist;
            img.style.transform = `translate(${currentPanX}px, ${currentPanY}px) scale(${currentScale})`;
        }
    } else if (e.touches.length === 1 && isPanning) {
        currentPanX = e.touches[0].clientX - startX;
        currentPanY = e.touches[0].clientY - startY;
        img.style.transform = `translate(${currentPanX}px, ${currentPanY}px) scale(${currentScale})`;
    }
}

function handleTouchEnd(e) {
    if (e.touches.length < 2) initialDistance = 0;
    if (e.touches.length === 0) isPanning = false;
}

btnCloseMediaModal.addEventListener('click', () => {
    mediaModal.classList.add('hidden');
    mediaModalContent.innerHTML = '';
});

btnShareMedia.addEventListener('click', async () => {
    if (navigator.share) {
        try {
            if (currentMediaType === 'foto' && currentMediaBlob) {
                // Converter base64 para File para compartilhamento de imagem
                const response = await fetch(currentMediaBlob);
                const blob = await response.blob();
                const file = new File([blob], 'foto_plaubert.png', { type: blob.type });
                
                await navigator.share({
                    title: 'PlauBert Note - Foto',
                    files: [file]
                });
            } else if (currentMediaType === 'comentario' && currentMediaText) {
                await navigator.share({
                    title: 'PlauBert Note - Nota',
                    text: currentMediaText
                });
            }
        } catch (e) {
            console.log('Erro ao compartilhar:', e);
        }
    } else {
        alert('Seu dispositivo ou navegador não suporta a função de compartilhamento nativo.');
    }
});

// Carregar o histórico automaticamente quando a página abrir
loadHistory();
