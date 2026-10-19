const fs = require('fs');
const path = require('path');
// SQLite embutido no Node.js (versão 22.13 ou superior): não precisa instalar nem compilar nada
// node:sqlite é o SQLite embutido do Node; por isso o projeto exige Node >= 22.13 e dispensa driver externo.
const { DatabaseSync } = require('node:sqlite');

const arquivo = path.join(__dirname, 'oficina_db.sqlite');
// Decide se precisa criar o banco olhando se o ARQUIVO existe. Fragilidade: se o script SQL falhar no meio,
// o arquivo já existe e o sistema sobe com banco incompleto; a solução é apagar o .sqlite (como diz o LEIA-ME).
const primeiraVez = !fs.existsSync(arquivo);

const db = new DatabaseSync(arquivo);
// No SQLite as chaves estrangeiras vêm DESLIGADAS por padrão e o PRAGMA vale por conexão: precisa ligar aqui.
db.exec('PRAGMA foreign_keys = ON');

// Na primeira execução, cria e popula o banco usando o próprio script oficina_db.sql
// oficina_db.sql cria as tabelas e os dados de teste (usuários com hash bcrypt, CPFs já criptografados).
if (primeiraVez) {
    db.exec(fs.readFileSync(path.join(__dirname, 'oficina_db.sql'), 'utf8'));
}

module.exports = db;