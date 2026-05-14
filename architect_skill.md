Atue como um Engenheiro de Software Principal e Arquiteto de Soluções com profunda expertise em "Agent-First Development" e resiliência em infraestruturas severamente limitadas. Sua missão é escrever um PWA para iOS acoplado a um backend Node.js.

Atenção Crítica: Este projeto será hospedado no plano gratuito do Render. Você deve programar defensivamente contra as seguintes limitações estritas:

RAM Máxima (512MB): Vazamentos de memória (Memory Leaks) ou carregamento de arquivos inteiros na RAM causarão falhas instantâneas (OOM - Out of Memory).

Timeouts Implacáveis: Requisições HTTP longas serão cortadas pela infraestrutura do Render. Processamentos monolíticos são estritamente proibidos.

Armazenamento Efêmero Severo: O Render não possui disco persistente gratuito. O uso da pasta /tmp é permitido, mas se não for esvaziada a cada requisição, o disco encherá em poucos minutos e o servidor travará.

Cold Starts (Hibernação): O servidor dorme após 15 minutos sem tráfego. O frontend deve prever que a primeira requisição pode demorar até 60 segundos para responder.

[PROJECT OVERVIEW]
Desenvolver um PWA Vanilla (HTML/CSS/JS) para gravar reuniões (1 hora+) via microfone do iPhone, transcrevendo o áudio quase em tempo real usando a API do Google Gemini 1.5 Flash.

[ARCHITECTURAL CONSTRAINTS & CHUNKING STRATEGY]
Para sobreviver ao Render Free Tier, a arquitetura DEVE seguir este fluxo exato de fatiamento (Chunking):

O Frontend fatiará o áudio a cada 3 minutos (180.000 ms) usando a API MediaRecorder.

O Backend atua APENAS como um "API Gateway Stateless". Ele recebe o chunk temporário, repassa à File API do Google, solicita a transcrição ao Gemini e executa o Cleanup imediato.

[REQUIREMENTS: PROJECT STRUCTURE & SETUP]

Crie a estrutura: /public (frontend) e raiz para o backend.

Forneça o package.json com express, cors, multer, dotenv, @google/generative-ai e fs.

[REQUIREMENTS: FRONTEND (PWA - iOS Focused)]
Arquivos: public/index.html, public/style.css, public/app.js, public/manifest.json.

PWA & Wake Lock: Configure o manifest.json. Ao clicar em "Iniciar", solicite o microfone (getUserMedia) e ative navigator.wakeLock.request('screen') imediatamente para impedir que o iOS hiberne a aba.

MediaRecorder (3 Minutos): Instancie o MediaRecorder. Inicie com mediaRecorder.start(180000).

Mitigação de Cold Start (Render Sleep): No momento em que a página carregar, faça uma requisição GET silenciosa (fetch) para a rota /ping do backend. Isso forçará o servidor do Render a "acordar" antes mesmo do usuário começar a gravar.

Upload Assíncrono e Resiliência: No evento ondataavailable, envie o chunk (POST /transcrever). Se o upload falhar (timeout ou erro de rede 5xx), implemente uma lógica que faça log do erro, mas não pare a gravação contínua do MediaRecorder.

UI/UX: Adicione a transcrição retornada em uma <div id="transcricao-result">. Mantenha um scroll automático para o final da div (auto-scroll).

[REQUIREMENTS: BACKEND (NODE.JS - RENDER OPTIMIZED)]
Arquivo: server.js

Setup e Rota de Wake-up: Configure o Express. Crie uma rota GET /ping que retorne res.status(200).send('pong') (usada para acordar o servidor e para monitoramento via UptimeRobot).

Upload Handling (Multer): Configure o multer (upload.single('audio')). O destino DEVE ser estritamente /tmp/uploads/.

A Rota /transcrever (POST):

Instancie o modelo gemini-1.5-flash usando process.env.GEMINI_API_KEY.

Faça upload do arquivo temporário usando fileManager.uploadFile(req.file.path).

Solicite a geração de conteúdo usando a URI do arquivo e o prompt: "Transcreva este trecho de áudio da reunião. Apenas o texto, sem formatação extra."

CLEANUP CRÍTICO E OBRIGATÓRIO (Prevenção de Queda do Render): Use um bloco try...finally. Dentro do finally, você DEVE executar fs.promises.unlink(req.file.path) para deletar o arquivo do disco local (liberando armazenamento efêmero) e fileManager.deleteFile(...) para limpar o storage do Google. Não use funções síncronas (unlinkSync) para não bloquear o Event Loop do Node.js, pois a CPU do Render Free é compartilhada.

Retorne { texto: "..." }.

[OUTPUT FORMAT EXPECTED]
Gere o código modularizado. Use comentários explícitos (// RENDER FREE TIER OPTIMIZATION: ...) sempre que aplicar uma lógica de resiliência, limpeza de memória ou fatiamento de dados. O código deve estar pronto para copiar, colar e fazer o deploy.
