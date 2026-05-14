const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const packageJsonPath = path.join(__dirname, 'package.json');
const versionFilePath = path.join(__dirname, 'public', 'version.js');

// 1. Ler o package.json atual
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version || "1.0.0";

// 2. Incrementar a versão (Lógica: Patch 0.0.X)
let versionParts = currentVersion.split('.').map(Number);
// Garantir que temos 3 partes (ex: 1.0.0)
if (versionParts.length !== 3) versionParts = [1, 0, 0];
versionParts[2] += 1; // Incrementa o último número (Patch)
const newVersion = versionParts.join('.');

// 3. Atualizar o package.json
packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

// 4. Criar/Atualizar o arquivo public/version.js para o App ler
const versionFileContent = `const APP_VERSION = "v${newVersion}";\ndocument.addEventListener('DOMContentLoaded', () => {\n    const el = document.getElementById('app-version-display');\n    if(el) el.textContent = APP_VERSION;\n});\n`;
fs.writeFileSync(versionFilePath, versionFileContent);

// 4.1 Injetar cache-busting nos arquivos HTML (para forçar atualização no navegador)
const htmlFiles = ['index.html', 'history.html', 'resumos.html', 'login.html'];
htmlFiles.forEach(file => {
    const filePath = path.join(__dirname, 'public', file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        // Atualiza src="qualquer.js" para src="qualquer.js?v=NOVA_VERSAO"
        content = content.replace(/(src="[^"]+\.js)(\?v=[^"]+)?(["])/g, `$1?v=${newVersion}$3`);
        // Atualiza href="qualquer.css" para href="qualquer.css?v=NOVA_VERSAO"
        content = content.replace(/(href="[^"]+\.css)(\?v=[^"]+)?(["])/g, `$1?v=${newVersion}$3`);
        fs.writeFileSync(filePath, content);
    }
});

console.log(`✅ Versão atualizada: ${currentVersion} -> ${newVersion} e Cache-Busting aplicado!`);

// 5. Executar comandos GIT
try {
    console.log('📦 Adicionando arquivos ao Git...');
    execSync('git add .', { stdio: 'inherit' });

    console.log(`🔖 Criando commit para versão ${newVersion}...`);
    execSync(`git commit -m "🚀 release: versão ${newVersion}"`, { stdio: 'inherit' });

    console.log('🚀 Enviando para o repositório (Push)...');
    execSync('git push', { stdio: 'inherit' });

    console.log('🎉 Release e Deploy realizados com sucesso!');
} catch (error) {
    console.error('❌ Erro ao executar comandos do Git. Certifique-se de que não há conflitos e que o push remoto está configurado.');
}