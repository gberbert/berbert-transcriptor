document.getElementById('backHomeBtn').addEventListener('click', () => {
    window.location.href = '/';
});

const listView = document.getElementById('listView');
const detailView = document.getElementById('detailView');
const historyList = document.getElementById('historyList');
const backToListBtn = document.getElementById('backToListBtn');

const detailTitle = document.getElementById('detailTitle');
const detailDate = document.getElementById('detailDate');
const detailContent = document.getElementById('detailContent');

let reunioesCache = [];

async function loadHistory() {
    try {
        const response = await fetch('/reunioes');
        const data = await response.json();
        
        if (data.error) throw new Error(data.error);
        
        reunioesCache = data;
        
        if (data.length === 0) {
            historyList.innerHTML = '<p class="placeholder">Nenhuma reunião salva ainda.</p>';
            return;
        }

        historyList.innerHTML = '';
        data.forEach((reuniao, index) => {
            const div = document.createElement('div');
            div.className = 'history-item clickable';
            const dataStr = new Date(reuniao.data_reuniao).toLocaleString('pt-BR');
            
            // Cria um resumo/preview (até 150 caracteres)
            let preview = reuniao.conteudo_transcrito.substring(0, 150);
            if (reuniao.conteudo_transcrito.length > 150) preview += '...';
            
            div.innerHTML = `
                <h3>${reuniao.titulo || 'Reunião Sem Título'}</h3>
                <div class="date">${dataStr}</div>
                <p class="preview-text">${preview}</p>
            `;
            
            // Ao clicar no item, abre a tela de detalhes
            div.addEventListener('click', () => openDetail(index));
            historyList.appendChild(div);
        });
    } catch (e) {
        historyList.innerHTML = `<p class="placeholder" style="color:var(--danger-color)">${e.message || 'Erro ao carregar histórico.'}</p>`;
    }
}

function openDetail(index) {
    const reuniao = reunioesCache[index];
    if (!reuniao) return;
    
    detailTitle.textContent = reuniao.titulo || 'Reunião Sem Título';
    detailDate.textContent = new Date(reuniao.data_reuniao).toLocaleString('pt-BR');
    detailContent.textContent = reuniao.conteudo_transcrito;
    
    // Esconder lista, mostrar detalhes
    listView.classList.add('hidden');
    detailView.classList.remove('hidden');
    
    // Rolar para o topo
    window.scrollTo(0, 0);
}

backToListBtn.addEventListener('click', () => {
    // Esconder detalhes, mostrar lista
    detailView.classList.add('hidden');
    listView.classList.remove('hidden');
});

// Carregar o histórico automaticamente quando a página abrir
loadHistory();
