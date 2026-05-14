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

let reunioesCache = [];
let reuniaoAtual = null;

async function loadHistory() {
    try {
        const response = await fetch('/reunioes');
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
            const div = document.createElement('div');
            div.className = 'history-item';
            const dataStr = new Date(reuniao.data_reuniao).toLocaleString('pt-BR');
            
            // Cria um resumo/preview (até 150 caracteres)
            let preview = reuniao.conteudo_transcrito.substring(0, 150);
            if (reuniao.conteudo_transcrito.length > 150) preview += '...';
            
            div.innerHTML = `
                <div class="history-item-title">${reuniao.titulo || 'Reunião Sem Título'}</div>
                <div class="history-item-date">${dataStr}</div>
                <p class="history-item-preview">${preview}</p>
            `;
            
            // Ao clicar no item, abre a tela de detalhes
            div.addEventListener('click', () => openDetail(index));
            historyList.appendChild(div);
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
        const response = await fetch('/gerar-resumo', {
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
