// Testes de API (precisam do servidor rodando em http://localhost:3000).
// Use banco NOVO (apague db/oficina_db.sqlite antes de npm start): os casos assumem o seed original.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const BASE = 'http://localhost:3000';
let cookie = '';
const res = [];

async function req(metodo, url, corpo, comCookie = true) {
    const r = await fetch(BASE + url, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(comCookie && cookie ? { Cookie: cookie } : {}) },
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    let json = null; try { json = await r.json(); } catch {}
    return { status: r.status, json };
}
async function caso(id, desc, esperado, fn) {
    let obtido, ok;
    try { const r = await fn(); ok = r.ok; obtido = r.texto; } catch (e) { ok = false; obtido = 'EXCEÇÃO ' + e.message; }
    res.push({ id, desc, esperado, obtido, ok });
    console.log(`${id} | ${ok ? 'PASSOU' : 'FALHOU'} | ${desc}\n      esperado: ${esperado}\n      obtido:   ${obtido}`);
}
const st = (r, n, extra = '') => ({ ok: r.status === n, texto: `HTTP ${r.status} ${JSON.stringify(r.json)} ${extra}`.trim() });

// procura o arquivo do banco nas pastas possíveis (sistema_comentado ou sistema)
function acharBanco() {
    for (const nome of ['sistema_comentado', 'sistema']) {
        const p = path.join(__dirname, '..', nome, 'db', 'oficina_db.sqlite');
        if (fs.existsSync(p)) return p;
    }
    throw new Error('oficina_db.sqlite não encontrado');
}

(async () => {
    await caso('A01', 'GET /api/clientes sem login', 'HTTP 401', async () => st(await req('GET', '/api/clientes', undefined, false), 401));
    await caso('A02', 'Login sem senha', 'HTTP 400', async () => st(await req('POST', '/api/login', { login: 'admin' }, false), 400));
    await caso('A03', 'Login com senha errada', 'HTTP 401', async () => st(await req('POST', '/api/login', { login: 'admin', senha: 'x' }, false), 401));
    await caso('A04', 'Login inexistente', 'HTTP 401 (mesma mensagem da senha errada)', async () => st(await req('POST', '/api/login', { login: 'fantasma', senha: 'x' }, false), 401));
    await caso('A05', 'Login com login numérico {"login":1}', 'HTTP 500 (bug: .trim em número)', async () => { const r = await req('POST', '/api/login', { login: 1, senha: 'x' }, false); return { ok: r.status === 500, texto: `HTTP ${r.status}` }; });
    await caso('A06', 'Login válido admin/admin123', 'HTTP 200 + cookie', async () => { const r = await req('POST', '/api/login', { login: 'admin', senha: 'admin123' }, false); return { ok: r.status === 200 && !!cookie, texto: `HTTP ${r.status} cookie=${cookie.split('=')[0]}` }; });
    await caso('A07', 'GET /api/me logado', 'HTTP 200 nome Administrador', async () => { const r = await req('GET', '/api/me'); return { ok: r.status === 200 && r.json.nome === 'Administrador', texto: JSON.stringify(r.json) }; });
    await caso('A08', 'Cliente com CPF de 10 dígitos', 'HTTP 400', async () => st(await req('POST', '/api/clientes', { nome: 'T', cpf: '1234567890' }), 400));
    await caso('A09', 'Cliente com e-mail inválido', 'HTTP 400', async () => st(await req('POST', '/api/clientes', { nome: 'T', cpf: '12345678909', email: 'abc' }), 400));
    await caso('A10', 'Cliente válido, CPF mascarado', 'HTTP 201', async () => st(await req('POST', '/api/clientes', { nome: 'Teste Silva', cpf: '123.456.789-09', telefone: '(11) 90000-0000', email: 't@t.com' }), 201));
    await caso('A11', 'Mesmo CPF (sem máscara) de novo', 'HTTP 400 duplicado', async () => st(await req('POST', '/api/clientes', { nome: 'Outro', cpf: '12345678909' }), 400));
    await caso('A12', 'Busca por CPF parcial "1234567"', 'retorna Teste Silva', async () => { const r = await req('GET', '/api/clientes?busca=1234567'); return { ok: r.json.some(c => c.nome === 'Teste Silva'), texto: r.json.map(c => c.nome).join() }; });
    await caso('A13', 'PUT /api/clientes/9999', 'HTTP 404', async () => st(await req('PUT', '/api/clientes/9999', { nome: 'x', cpf: '12345678909' }), 404));
    await caso('A14', 'PUT do cliente mantendo o próprio CPF (não é duplicado)', 'HTTP 200', async () => { const l = (await req('GET', '/api/clientes?busca=Teste')).json; return st(await req('PUT', '/api/clientes/' + l[0].id, { nome: 'Teste Silva 2', cpf: '12345678909' }), 200); });
    await caso('A15', 'Veículo Mercosul QWE1R23', 'HTTP 201', async () => st(await req('POST', '/api/veiculos', { placa: 'QWE1R23', modelo: 'Gol', tipo: 'Carro', cliente_id: 1 }), 201));
    await caso('A16', 'Placa inválida AB12345', 'HTTP 400', async () => st(await req('POST', '/api/veiculos', { placa: 'AB12345', modelo: 'Gol', tipo: 'Carro', cliente_id: 1 }), 400));
    await caso('A17', 'Placa repetida em minúscula com hífen "qwe-1r23"', 'HTTP 400 duplicada', async () => st(await req('POST', '/api/veiculos', { placa: 'qwe-1r23', modelo: 'Gol', tipo: 'Carro', cliente_id: 1 }), 400));
    await caso('A18', 'Veículo com cliente_id inexistente', 'HTTP 400', async () => st(await req('POST', '/api/veiculos', { placa: 'RTY4U56', modelo: 'Gol', tipo: 'Carro', cliente_id: 9999 }), 400));
    await caso('A19', 'Tipo de veículo arbitrário "Foguete"', 'HTTP 201 (só o front restringe)', async () => st(await req('POST', '/api/veiculos', { placa: 'UIO7P89', modelo: 'X', tipo: 'Foguete', cliente_id: 1 }), 201));
    await caso('A20', 'Agendamento com data 2026-02-31', 'HTTP 400', async () => st(await req('POST', '/api/agendamentos', { veiculo_id: 1, data_agendamento: '2026-02-31', servico: 'Teste' }), 400));
    await caso('A21', 'Agendamento válido', 'HTTP 201', async () => st(await req('POST', '/api/agendamentos', { veiculo_id: 1, data_agendamento: '2026-11-30', servico: 'Teste de freio' }), 201));
    await caso('A22', 'Agendamento em data passada 2020-01-01', 'HTTP 201 (sem regra de data futura)', async () => st(await req('POST', '/api/agendamentos', { veiculo_id: 1, data_agendamento: '2020-01-01', servico: 'Passado' }), 201));
    await caso('A23', 'PUT agendamento: troca só a data, serviço permanece', 'HTTP 200 e serviço igual', async () => {
        const antes = (await req('GET', '/api/agendamentos')).json.find(a => a.servico === 'Teste de freio');
        const r = await req('PUT', '/api/agendamentos/' + antes.id, { data_agendamento: '2026-12-01', servico: 'HACK' });
        const dep = (await req('GET', '/api/agendamentos')).json.find(a => a.id === antes.id);
        return { ok: r.status === 200 && dep.data_agendamento === '2026-12-01' && dep.servico === 'Teste de freio', texto: `HTTP ${r.status} data=${dep.data_agendamento} servico="${dep.servico}"` };
    });
    await caso('A24', 'PUT /api/agendamentos/9999', 'HTTP 404', async () => st(await req('PUT', '/api/agendamentos/9999', { data_agendamento: '2026-12-01' }), 404));
    await caso('A25', 'GET /api/agendamentos expõe CPF completo', 'cliente_cpf com 11 dígitos', async () => { const a = (await req('GET', '/api/agendamentos')).json[0]; return { ok: /^\d{11}$/.test(a.cliente_cpf), texto: 'cliente_cpf=' + a.cliente_cpf }; });
    await caso('A26', 'No arquivo .sqlite o CPF está criptografado', 'sem 11 dígitos em claro', async () => {
        const db = new DatabaseSync(acharBanco(), { readOnly: true });
        const l = db.prepare('SELECT cpf FROM clientes').all(); db.close();
        return { ok: l.every(c => !/\d{11}/.test(c.cpf)), texto: 'ex.: ' + l[l.length - 1].cpf };
    });
    await caso('A27', 'Logout e acesso posterior', 'logout 200, depois /api/me 401', async () => {
        const a = await req('POST', '/api/logout'); const b = await req('GET', '/api/me');
        return { ok: a.status === 200 && b.status === 401, texto: `logout=${a.status} me=${b.status}` };
    });
    const f = res.filter(r => !r.ok).length;
    console.log(`\nTotal: ${res.length} | Passaram: ${res.length - f} | Falharam: ${f}`);
})();