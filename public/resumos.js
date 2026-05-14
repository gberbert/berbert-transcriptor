const resumosList = document.getElementById('resumos-list');
const resumosDetail = document.getElementById('resumos-detail');
const detailTitle = document.getElementById('detail-title');
const detailDate = document.getElementById('detail-date');
const detailBadge = document.getElementById('detail-badge');
const detailContent = document.getElementById('detail-content');
const backToListBtn = document.getElementById('backToList');
const loadingIndicator = document.getElementById('loading');

const btnEditResumo = document.getElementById('btnEditResumo');
const btnDeleteResumo = document.getElementById('btnDeleteResumo');
const btnCopyResumo = document.getElementById('btnCopyResumo');
const editContent = document.getElementById('edit-content');
const editTextarea = document.getElementById('edit-textarea');
const btnCancelEdit = document.getElementById('btnCancelEdit');
const btnSaveEdit = document.getElementById('btnSaveEdit');

let resumosCache = [];
let resumoAtual = null;

async function loadResumos() {
    try {
        const response = await fetch('/resumos');
        const data = await response.json();
        
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        
        if (data.error) throw new Error(data.error);
        
        resumosCache = data;
        
        if (data.length === 0) {
            resumosList.innerHTML = '<p class="status-text">Nenhum resumo gerado ainda.</p>';
            return;
        }

        resumosList.innerHTML = '';
        data.forEach((resumo, index) => {
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
            div.style.touchAction = 'pan-y'; 
            
            const dataStr = new Date(resumo.data_geracao).toLocaleString('pt-BR');
            let preview = resumo.texto_resumo.substring(0, 150);
            if (resumo.texto_resumo.length > 150) preview += '...';
            
            div.innerHTML = `
                <div class="history-item-title">${resumo.titulo_reuniao || 'Sem Título'}</div>
                <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 10px;">
                    <div class="history-item-date" style="margin-bottom: 0;">${dataStr}</div>
                    <span class="version-badge" style="background: var(--bg-dark); padding: 2px 6px; border-radius: 4px;">${resumo.tipo}</span>
                </div>
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
                if (diffX < 0 && !isSwiped) {
                    currentX = Math.max(diffX, -threshold - 20);
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
            
            // Edit logic from swipe (Apenas renomear título para manter o padrão, ou abrir o resumo)
            actionsDiv.querySelector('.swipe-action-edit').addEventListener('click', () => {
                // Para edição profunda do texto, já existe o botão dentro do detalhe
                // Aqui na lista vamos permitir abrir direto em modo edição
                openDetail(index);
                document.getElementById('btnEditResumo').click();
            });
            
            // Delete logic from swipe
            actionsDiv.querySelector('.swipe-action-delete').addEventListener('click', () => {
                if(confirm("Tem certeza que deseja excluir permanentemente este resumo?")) {
                    fetch('/resumos/' + resumo._id, { method: 'DELETE' })
                    .then(() => loadResumos());
                }
            });
            
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
            resumosList.appendChild(container);
        });
    } catch (e) {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        resumosList.innerHTML = `<p class="status-text" style="color:var(--danger-color)">${e.message || 'Erro ao carregar resumos.'}</p>`;
    }
}

function openDetail(index) {
    const resumo = resumosCache[index];
    if (!resumo) return;
    
    resumoAtual = resumo;
    
    detailTitle.textContent = resumo.titulo_reuniao || 'Sem Título';
    detailDate.textContent = new Date(resumo.data_geracao).toLocaleString('pt-BR');
    detailBadge.textContent = resumo.tipo;
    detailContent.textContent = resumo.texto_resumo;
    
    // Garantir que estamos no modo visualização
    detailContent.classList.remove('hidden');
    editContent.classList.add('hidden');
    
    resumosDetail.classList.add('visible');
}

backToListBtn.addEventListener('click', () => {
    resumosDetail.classList.remove('visible');
    resumoAtual = null;
});

// Ação de Copiar
btnCopyResumo.addEventListener('click', () => {
    if (!resumoAtual) return;
    navigator.clipboard.writeText(resumoAtual.texto_resumo).then(() => {
        const originalIcon = btnCopyResumo.textContent;
        btnCopyResumo.textContent = '✅';
        setTimeout(() => {
            btnCopyResumo.textContent = originalIcon;
        }, 2000);
    });
});

// Ações de Edição
btnEditResumo.addEventListener('click', () => {
    if (!resumoAtual) return;
    editTextarea.value = resumoAtual.texto_resumo;
    detailContent.classList.add('hidden');
    editContent.classList.remove('hidden');
});

btnCancelEdit.addEventListener('click', () => {
    detailContent.classList.remove('hidden');
    editContent.classList.add('hidden');
});

btnSaveEdit.addEventListener('click', async () => {
    if (!resumoAtual) return;
    
    const novoTexto = editTextarea.value.trim();
    if (!novoTexto) {
        alert('O resumo não pode ficar vazio.');
        return;
    }
    
    btnSaveEdit.disabled = true;
    btnSaveEdit.textContent = 'Salvando...';
    
    try {
        const response = await fetch('/resumos/' + resumoAtual._id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texto_resumo: novoTexto })
        });
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        
        // Sucesso
        resumoAtual.texto_resumo = novoTexto;
        detailContent.textContent = novoTexto;
        detailContent.classList.remove('hidden');
        editContent.classList.add('hidden');
        
        // Recarregar lista silenciosamente
        loadResumos();
        
    } catch (e) {
        alert('Erro ao salvar: ' + e.message);
    } finally {
        btnSaveEdit.disabled = false;
        btnSaveEdit.textContent = 'Salvar Edição';
    }
});

// Ação de Exclusão
btnDeleteResumo.addEventListener('click', async () => {
    if (!resumoAtual) return;
    
    if (!confirm('Tem certeza que deseja excluir permanentemente este resumo?')) {
        return;
    }
    
    btnDeleteResumo.disabled = true;
    
    try {
        const response = await fetch('/resumos/' + resumoAtual._id, { method: 'DELETE' });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        
        // Sucesso
        resumosDetail.classList.remove('visible');
        resumoAtual = null;
        loadResumos();
        
    } catch (e) {
        alert('Erro ao excluir: ' + e.message);
    } finally {
        btnDeleteResumo.disabled = false;
    }
});

loadResumos();
