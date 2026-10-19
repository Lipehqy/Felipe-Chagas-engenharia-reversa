// Criptografia reversível do CPF (AES-256-GCM).
// O CPF é gravado no banco já criptografado; só a aplicação consegue ler.
const crypto = require('crypto');

// scrypt transforma a 'senha' em chave de 32 bytes (AES-256 exige exatamente 32). Calculado UMA vez ao carregar o módulo
// (scrypt é lento de propósito). RISCO: senha e sal estão escritos aqui; quem tiver o código + o .sqlite lê todos os CPFs.
const CHAVE = crypto.scryptSync('oficina-autocerta-chave-secreta', 'sal-da-oficina', 32);

// Recebe o CPF só com dígitos e devolve 'iv:tag:dados' em base64, cabendo numa coluna TEXT.
function criptografar(texto) {
    // IV novo a cada chamada: repetir IV com a mesma chave quebra a segurança do GCM.
    // 12 bytes é o tamanho recomendado para GCM. Efeito colateral: o mesmo CPF gera textos diferentes.
    const iv = crypto.randomBytes(12);
    const cifra = crypto.createCipheriv('aes-256-gcm', CHAVE, iv);
    const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
    // A tag de autenticação prova integridade: se alguém alterar o valor no banco, a descriptografia FALHA
    // em vez de devolver lixo (testado: caso U06).
    const tag = cifra.getAuthTag();
    return [iv, tag, dados].map(b => b.toString('base64')).join(':');
}

// Faz o caminho inverso. Lança exceção se o valor estiver corrompido/adulterado; as rotas não tratam isso (viraria erro 500).
function descriptografar(valor) {
    const [iv, tag, dados] = valor.split(':').map(p => Buffer.from(p, 'base64'));
    const decifra = crypto.createDecipheriv('aes-256-gcm', CHAVE, iv);
    decifra.setAuthTag(tag);
    return Buffer.concat([decifra.update(dados), decifra.final()]).toString('utf8');
}

module.exports = { criptografar, descriptografar };