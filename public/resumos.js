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
            const div = document.createElement('div');
            div.className = 'history-item';
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
            
            div.addEventListener('click', () => openDetail(index));
            resumosList.appendChild(div);
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
