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

// Carregar o histórico automaticamente quando a página abrir
loadHistory();
