// server.js - ponto de entrada. Concentra middlewares, autenticação e TODAS as rotas da API.
// Decisão do projeto: um arquivo só, sem camadas (controller/service). Simples de ler,
// mas a regra de negócio fica misturada com o acesso ao banco.
const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
// conexao.js devolve uma instância única do SQLite (node:sqlite), compartilhada por todas as rotas.
const db = require('./db/conexao');
const { criptografar, descriptografar } = require('./seguranca');

const app = express();
// Constante nomeada para o tempo de sessão ser trocado em um lugar só (RN02).
const MINUTOS_SESSAO = 30; // tempo de expiração do login

// Sem isto, req.body seria undefined. Só interpreta JSON: o front sempre envia Content-Type: application/json (ver api() em comum.js).
app.use(express.json());
// Sessão no servidor: o navegador guarda só um ID no cookie; o usuário logado fica na memória do servidor (MemoryStore, padrão).
// Por isso reiniciar o servidor desloga todo mundo.
app.use(session({
    // ATENÇÃO (segurança): segredo fixo no código. Quem ler o repositório consegue forjar cookies. O correto é process.env.SESSION_SECRET.
    secret: 'oficina-autocerta-sessao',
    // resave:false  -> não regrava sessão que não mudou.
    // saveUninitialized:false -> não cria sessão (nem cookie) para quem não fez login.
    resave: false,
    saveUninitialized: false,
    // httpOnly impede que JavaScript da página leia o cookie (mitiga roubo via XSS).
    // maxAge = 30 min FIXO desde o login: não renova com o uso (não há 'rolling').
    // Não há 'secure' nem 'sameSite' definidos.
    cookie: { maxAge: MINUTOS_SESSAO * 60 * 1000, httpOnly: true }
}));
// Serve a pasta public/ (HTML/JS/CSS). Os arquivos estáticos NÃO exigem login; só a API exige.
// A proteção das telas é feita no navegador: iniciarPagina() chama /api/me e redireciona se der 401.
app.use(express.static(path.join(__dirname, 'public')));

// A raiz não tem página própria: manda para o login.
app.get('/', (req, res) => res.redirect('/login.html'));

// Middleware de autorização (RN01). Responde 401 em JSON (e não redireciona) porque quem chama é o fetch() do front,
// que trata o 401 em api() em comum.js. Só verifica SE há login; não há perfis/papéis (todos os usuários podem tudo).
function exigirLogin(req, res, next) {
    if (!req.session.usuario) {
        return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
    }
    next();
}

// ===================== LOGIN =====================
// Rota pública (única, junto com logout). Retorna a mesma mensagem para 'usuário inexistente' e 'senha errada'
// para não revelar quais logins existem. Limitação: não há limite de tentativas (força bruta) e,
// se o login não existe, o bcrypt nem é executado (diferença de tempo permite descobrir logins).
app.post('/api/login', (req, res) => {
    const { login, senha } = req.body;
    if (!login || !senha) {
        return res.status(400).json({ erro: 'Informe usuário e senha.' });
    }
    // Consulta parametrizada (?) -> o valor nunca é concatenado no SQL, o que evita SQL injection.
    const usuario = db.prepare('SELECT * FROM usuarios WHERE login = ?').get(login.trim());
    if (!usuario || !bcrypt.compareSync(senha, usuario.senha)) {
        return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
    }
    // Guarda só id e nome na sessão, NUNCA o hash da senha. O ID da sessão não é regenerado aqui (session fixation).
    req.session.usuario = { id: usuario.id, nome: usuario.nome };
    res.json({ ok: true });
});

// destroy() apaga a sessão no servidor; só limpar o cookie no navegador não bastaria.
app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
});

// Usado pelo front (iniciarPagina) para exibir o nome e descobrir se a sessão ainda vale.
app.get('/api/me', exigirLogin, (req, res) => res.json(req.session.usuario));

// ===================== CLIENTES =====================
// O CPF é gravado criptografado, então toda saída de cliente precisa passar por aqui para voltar em claro.
const clienteJson = c => ({ ...c, cpf: descriptografar(c.cpf) });

// Valida e devolve a mensagem de erro (string) ou null se estiver tudo certo.
// O parâmetro idAtual existe para a EDIÇÃO: o cliente não pode ser considerado 'duplicado' dele mesmo.
function validarCliente(corpo, idAtual) {
    const nome = (corpo.nome || '').trim();
    const cpf = String(corpo.cpf || '').replace(/\D/g, '');
    if (!nome) return 'Informe o nome do cliente.';
    if (cpf.length !== 11) return 'O CPF deve ter 11 dígitos.';
    if (corpo.email && !/^\S+@\S+\.\S+$/.test(corpo.email)) return 'E-mail inválido.';
    // Unicidade do CPF checada na aplicação, não no banco: como o IV é aleatório, o mesmo CPF vira textos diferentes,
    // então UNIQUE no banco seria inútil. Custo: lê e descriptografa TODOS os clientes (O(n)) e há risco de
    // condição de corrida (2 cadastros simultâneos do mesmo CPF).
    const repetido = db.prepare('SELECT * FROM clientes').all()
        .some(c => c.id !== idAtual && descriptografar(c.cpf) === cpf);
    if (repetido) return 'Já existe um cliente com este CPF.';
    return null;
}

// A busca precisa ser feita em memória pelo mesmo motivo (CPF criptografado não permite LIKE no SQL).
// Se o termo tem dígitos, também procura no CPF; nome/e-mail/telefone são comparados como texto.
app.get('/api/clientes', exigirLogin, (req, res) => {
    const termo = (req.query.busca || '').trim().toLowerCase();
    const digitos = termo.replace(/\D/g, '');
    const lista = db.prepare('SELECT * FROM clientes ORDER BY nome').all().map(clienteJson);
    // o CPF está criptografado no banco, então a busca é feita depois de descriptografar
    res.json(lista.filter(c => !termo
        || c.nome.toLowerCase().includes(termo)
        || (c.email || '').toLowerCase().includes(termo)
        || (c.telefone || '').includes(termo)
        || (digitos && c.cpf.includes(digitos))));
});

// Fluxo: sessão -> validar -> criptografar CPF (só dígitos, sem máscara) -> INSERT. Devolve 201 (criado).
app.post('/api/clientes', exigirLogin, (req, res) => {
    const erro = validarCliente(req.body, null);
    if (erro) return res.status(400).json({ erro });
    const { nome, cpf, telefone, email } = req.body;
    db.prepare('INSERT INTO clientes (nome, cpf, telefone, email) VALUES (?,?,?,?)')
        .run(nome.trim(), criptografar(String(cpf).replace(/\D/g, '')), telefone || '', email || '');
    res.status(201).json({ ok: true });
});

// Checa a existência ANTES de validar para devolver 404 (recurso inexistente) em vez de 400.
// Substitui todos os campos (PUT completo); o CPF é regravado com novo IV.
app.put('/api/clientes/:id', exigirLogin, (req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT id FROM clientes WHERE id = ?').get(id)) {
        return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }
    const erro = validarCliente(req.body, id);
    if (erro) return res.status(400).json({ erro });
    const { nome, cpf, telefone, email } = req.body;
    db.prepare('UPDATE clientes SET nome=?, cpf=?, telefone=?, email=? WHERE id=?')
        .run(nome.trim(), criptografar(String(cpf).replace(/\D/g, '')), telefone || '', email || '', id);
    res.json({ ok: true });
});

// ===================== VEÍCULOS =====================
// aceita placa antiga (ABC1234) e Mercosul (ABC1D23)
// Padrão antigo ABC1234 e Mercosul ABC1D23: 3 letras + 1 dígito + (letra ou dígito) + 2 dígitos.
const PLACA_VALIDA = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;

// JOIN traz o nome do dono para a tela não precisar de uma segunda chamada.
app.get('/api/veiculos', exigirLogin, (req, res) => {
    res.json(db.prepare(`
        SELECT v.*, c.nome AS cliente_nome
        FROM veiculos v JOIN clientes c ON c.id = v.cliente_id
        ORDER BY v.modelo`).all());
});

// Placa normalizada (sem espaço/hífen, maiúscula) ANTES de validar, para 'abc-1d23' e 'ABC1D23' serem a mesma placa.
// O tipo aceita qualquer texto: a lista Carro/Moto/Utilitário só existe no <select> do front (não é regra do servidor).
app.post('/api/veiculos', exigirLogin, (req, res) => {
    const { modelo, tipo, marca, cliente_id } = req.body;
    const placa = String(req.body.placa || '').replace(/[\s-]/g, '').toUpperCase();
    if (!PLACA_VALIDA.test(placa)) return res.status(400).json({ erro: 'Informe uma placa válida.' });
    if (!modelo || !modelo.trim()) return res.status(400).json({ erro: 'Informe o modelo do veículo.' });
    if (!tipo || !tipo.trim()) return res.status(400).json({ erro: 'Informe o tipo do veículo.' });
    if (!cliente_id) return res.status(400).json({ erro: 'Selecione o cliente do veículo.' });
    if (!db.prepare('SELECT id FROM clientes WHERE id = ?').get(cliente_id)) {
        return res.status(400).json({ erro: 'Cliente não encontrado.' });
    }
    if (db.prepare('SELECT id FROM veiculos WHERE placa = ?').get(placa)) {
        return res.status(400).json({ erro: 'Já existe um veículo com esta placa.' });
    }
    db.prepare('INSERT INTO veiculos (placa, modelo, tipo, marca, cliente_id) VALUES (?,?,?,?,?)')
        .run(placa, modelo.trim(), tipo.trim(), (marca || '').trim(), cliente_id);
    res.status(201).json({ ok: true });
});

// ===================== AGENDAMENTOS =====================
// Valida formato E existência no calendário: o Date 'corrige' 31/02 para 03/03, então comparamos o resultado com o texto original.
// BUG conhecido: new Date(...T00:00:00) usa fuso LOCAL e toISOString() usa UTC. Em servidor com fuso a leste de UTC
// (ex.: Europe/Paris) TODA data é rejeitada (provado em testes/testes-unitarios.js, caso U11). Em UTC e em São Paulo funciona.
function dataValida(texto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto || '')) return false;
    const d = new Date(texto + 'T00:00:00');
    return !isNaN(d) && d.toISOString().slice(0, 10) === texto;
}

// Junta agendamento -> veículo -> cliente. A ordenação por mês antes da data é redundante (ordenar só pela data dá o mesmo resultado).
// O front agrupa por mês (agendamentos.js) e depende dessa ordem. O CPF sai descriptografado.
app.get('/api/agendamentos', exigirLogin, (req, res) => {
    const lista = db.prepare(`
        SELECT a.id, a.data_agendamento, a.servico,
               v.placa, v.modelo AS veiculo_modelo, v.tipo, v.marca,
               c.nome AS cliente_nome, c.cpf AS cliente_cpf, c.telefone, c.email
        FROM agendamentos a
        JOIN veiculos v ON v.id = a.veiculo_id
        JOIN clientes c ON c.id = v.cliente_id
        ORDER BY strftime('%Y-%m', a.data_agendamento), a.data_agendamento`).all();
    res.json(lista.map(a => ({ ...a, cliente_cpf: descriptografar(a.cliente_cpf) })));
});

// Não bloqueia datas passadas nem conflito de horário (não há hora, só data).
app.post('/api/agendamentos', exigirLogin, (req, res) => {
    const { veiculo_id, data_agendamento, servico } = req.body;
    if (!veiculo_id || !db.prepare('SELECT id FROM veiculos WHERE id = ?').get(veiculo_id)) {
        return res.status(400).json({ erro: 'Selecione um veículo.' });
    }
    if (!dataValida(data_agendamento)) return res.status(400).json({ erro: 'Informe uma data válida.' });
    if (!servico || !servico.trim()) return res.status(400).json({ erro: 'Informe o serviço.' });
    db.prepare('INSERT INTO agendamentos (veiculo_id, data_agendamento, servico) VALUES (?,?,?)')
        .run(veiculo_id, data_agendamento, servico.trim());
    res.status(201).json({ ok: true });
});

// Reagendar altera SOMENTE a data (RN08): serviço e veículo ficam como estão.
app.put('/api/agendamentos/:id', exigirLogin, (req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT id FROM agendamentos WHERE id = ?').get(id)) {
        return res.status(404).json({ erro: 'Agendamento não encontrado.' });
    }
    if (!dataValida(req.body.data_agendamento)) {
        return res.status(400).json({ erro: 'Informe uma data válida.' });
    }
    db.prepare('UPDATE agendamentos SET data_agendamento = ? WHERE id = ?')
        .run(req.body.data_agendamento, id);
    res.json({ ok: true });
});

// Porta fixa 3000 (a documentação e o LEIA-ME dependem disso).
app.listen(3000, () => console.log('Servidor rodando em http://localhost:3000'));