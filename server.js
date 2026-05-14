const express = require('express');
const multer = require('multer');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require('@google/generative-ai/files');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

dotenv.config();

// Mongoose Connection
if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
      .then(() => console.log('[DATABASE] Connected to MongoDB Atlas'))
      .catch(err => console.error('[DATABASE ERROR] Failed to connect to MongoDB:', err));
}

// Definir Schema de Reunião
const reuniaoSchema = new mongoose.Schema({
    data_reuniao: { type: Date, default: Date.now },
    conteudo_transcrito: String,
    titulo: String
});
const Reuniao = mongoose.model('Reuniao', reuniaoSchema);

// Definir Schema de Resumo
const resumoSchema = new mongoose.Schema({
    reuniao_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Reuniao' },
    titulo_reuniao: String,
    tipo: String,
    prompt: String,
    texto_resumo: String,
    data_geracao: { type: Date, default: Date.now }
});
const Resumo = mongoose.model('Resumo', resumoSchema);

const app = express();
const port = process.env.PORT || 3000;

// Configurar o CORS e servir arquivos estáticos da pasta public
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// RENDER FREE TIER OPTIMIZATION: Garantir que a pasta /tmp/uploads/ exista
const uploadDir = '/tmp/uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// RENDER FREE TIER OPTIMIZATION: Configurar o Multer para salvar os arquivos em /tmp/uploads/ (disco efêmero)
const upload = multer({ dest: uploadDir });

// Inicializar os clientes do Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

// RENDER FREE TIER OPTIMIZATION: Rota de Wake-up para evitar/mitigar Cold Starts.
// Retorna 200 OK imediatamente para acordar o servidor e para monitoramento via UptimeRobot.
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

// Rotas de Histórico
app.post('/salvar-reuniao', async (req, res) => {
    if (!process.env.MONGO_URI) {
        return res.status(500).json({ error: 'MongoDB não configurado (.env ausente).' });
    }
    
    try {
        const { conteudo_transcrito, titulo } = req.body;
        const novaReuniao = new Reuniao({
            conteudo_transcrito,
            titulo: titulo || `Reunião ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`
        });
        await novaReuniao.save();
        res.json({ success: true, reuniao: novaReuniao });
    } catch (err) {
        console.error('[DATABASE ERROR] Erro ao salvar reunião:', err);
        res.status(500).json({ error: 'Erro ao salvar no banco.' });
    }
});

app.get('/reunioes', async (req, res) => {
    if (!process.env.MONGO_URI) {
        return res.status(500).json({ error: 'MongoDB não configurado.' });
    }

    try {
        const reunioes = await Reuniao.find().sort({ data_reuniao: -1 });
        res.json(reunioes);
    } catch (err) {
        console.error('[DATABASE ERROR] Erro ao listar reuniões:', err);
        res.status(500).json({ error: 'Erro ao buscar reuniões.' });
    }
});

app.post('/transcrever', upload.single('audio'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo de áudio recebido.' });
    }

    const localFilePath = req.file.path;
    const mimeType = req.file.mimetype || 'audio/webm';
    let uploadedFile = null;

    try {
        console.log(`[API] Uploading file to Google AI: ${localFilePath}`);
        
        // Fazer o upload para o Google AI File Manager
        const uploadResponse = await fileManager.uploadFile(localFilePath, {
            mimeType: mimeType,
            displayName: "Reuniao_Chunk_" + Date.now(),
        });
        
        uploadedFile = uploadResponse.file;
        console.log(`[API] File uploaded successfully: ${uploadedFile.uri}`);

        // Transcrever usando o modelo Gemini 2.5 Flash com instrução de sistema
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            systemInstruction: "Você é um transcritor de áudio estrito. Sua única função é retornar o texto falado no áudio em anexo. Se o áudio estiver vazio, for apenas silêncio ou não contiver fala humana inteligível, você DEVE retornar estritamente uma string vazia. JAMAIS interaja com o usuário, não adicione comentários como 'Compreendido', nem peça por arquivos. Apenas transcreva o áudio ou retorne vazio."
        });
        
        const prompt = "Transcreva este áudio da reunião. Retorne APENAS a transcrição e absolutamente mais nada.";
        
        const result = await model.generateContent([
            {
                fileData: {
                    mimeType: uploadedFile.mimeType,
                    fileUri: uploadedFile.uri
                }
            },
            { text: prompt },
        ]);

        const transcription = result.response.text();
        console.log(`[API] Transcription success, length: ${transcription.length}`);
        
        // Retornar a transcrição para o frontend com a chave "texto" conforme requisito
        res.json({ texto: transcription });

    } catch (error) {
        console.error('[API] Error during transcription:', error);
        res.status(500).json({ error: 'Erro ao transcrever o áudio.' });
    } finally {
        // RENDER FREE TIER OPTIMIZATION: CLEANUP CRÍTICO E OBRIGATÓRIO (Prevenção de Queda do Render)
        
        // Deletar o arquivo temporário local de forma ASSÍNCRONA para não bloquear o Event Loop do Node.js
        try {
            await fs.promises.unlink(localFilePath);
            console.log(`[CLEANUP] Local file deleted successfully: ${localFilePath}`);
        } catch (err) {
            // Ignorar erro se o arquivo não existir, mas logar caso contrário
            if (err.code !== 'ENOENT') {
                console.error(`[CLEANUP ERROR] Failed to delete local file:`, err);
            }
        }

        // Deletar o arquivo do Google AI File Manager de forma ASSÍNCRONA
        if (uploadedFile) {
            try {
                await fileManager.deleteFile(uploadedFile.name);
                console.log(`[CLEANUP] Remote file deleted successfully: ${uploadedFile.name}`);
            } catch (err) {
                console.error(`[CLEANUP ERROR] Failed to delete remote file:`, err);
            }
        }
    }
});

// ==================
// ROTAS DE RESUMO
// ==================

// 1. Gerar e Salvar Resumo
app.post('/gerar-resumo', async (req, res) => {
    if (!process.env.MONGO_URI || !process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'Falta configuração de banco de dados ou chave de API.' });
    }

    try {
        const { reuniao_id, tipo, prompt_extra } = req.body;
        
        // Buscar a transcrição no banco de dados
        const reuniao = await Reuniao.findById(reuniao_id);
        if (!reuniao) {
            return res.status(404).json({ error: 'Reunião não encontrada no banco de dados.' });
        }

        const transcricao = reuniao.conteudo_transcrito;
        
        // Montar o Prompt Baseado no Tipo
        let systemInstruction = "";
        if (tipo === "Reunião") {
            systemInstruction = "Você é um assistente executivo especializado em analisar transcrições de reuniões. Extraia os pontos principais, as decisões tomadas e os próximos passos (action items).";
        } else if (tipo === "Palestra") {
            systemInstruction = "Você é um professor especializado em sumarizar palestras. Crie um resumo estruturado destacando o tema principal, as ideias centrais abordadas e uma conclusão clara.";
        } else {
            systemInstruction = "Você é um assistente especialista em resumir textos.";
        }

        let userPrompt = `Abaixo está a transcrição de um áudio.\n\n[TRANSCRIÇÃO]:\n${transcricao}\n\n`;
        if (prompt_extra && prompt_extra.trim().length > 0) {
            userPrompt += `\n[INSTRUÇÕES EXTRAS DO USUÁRIO]:\n${prompt_extra}\n`;
        }
        
        userPrompt += "\nPor favor, gere o resumo conforme as instruções.";

        console.log(`[API] Gerando resumo para reunião ID ${reuniao_id} (Tipo: ${tipo})`);

        // Chamada direta para o Gemini Text (Flash)
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            systemInstruction: systemInstruction
        });

        const result = await model.generateContent(userPrompt);
        const resumoTexto = result.response.text();

        // Salvar o resumo gerado no banco de dados
        const novoResumo = new Resumo({
            reuniao_id: reuniao._id,
            titulo_reuniao: reuniao.titulo,
            tipo: tipo,
            prompt: prompt_extra,
            texto_resumo: resumoTexto
        });
        
        await novoResumo.save();
        res.json({ success: true, resumo: novoResumo });

    } catch (err) {
        console.error('[API ERROR] Erro ao gerar resumo:', err);
        res.status(500).json({ error: 'Erro ao gerar ou salvar o resumo.' });
    }
});

// 2. Listar Resumos
app.get('/resumos', async (req, res) => {
    try {
        const resumos = await Resumo.find().sort({ data_geracao: -1 });
        res.json(resumos);
    } catch (err) {
        console.error('[DATABASE ERROR] Erro ao listar resumos:', err);
        res.status(500).json({ error: 'Erro ao buscar resumos.' });
    }
});

// 3. Editar Resumo
app.put('/resumos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { texto_resumo } = req.body;
        
        const resumoAtualizado = await Resumo.findByIdAndUpdate(
            id, 
            { texto_resumo }, 
            { new: true } // Retorna o documento já atualizado
        );
        
        if (!resumoAtualizado) {
            return res.status(404).json({ error: 'Resumo não encontrado.' });
        }
        res.json({ success: true, resumo: resumoAtualizado });
    } catch (err) {
        console.error('[DATABASE ERROR] Erro ao atualizar resumo:', err);
        res.status(500).json({ error: 'Erro ao atualizar o resumo.' });
    }
});

// 4. Excluir Resumo
app.delete('/resumos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const resumoDeletado = await Resumo.findByIdAndDelete(id);
        
        if (!resumoDeletado) {
            return res.status(404).json({ error: 'Resumo não encontrado.' });
        }
        res.json({ success: true, message: 'Resumo excluído com sucesso.' });
    } catch (err) {
        console.error('[DATABASE ERROR] Erro ao excluir resumo:', err);
        res.status(500).json({ error: 'Erro ao excluir o resumo.' });
    }
});

app.listen(port, () => {
    console.log(`[SYSTEM] API Gateway running on port ${port}`);
});
