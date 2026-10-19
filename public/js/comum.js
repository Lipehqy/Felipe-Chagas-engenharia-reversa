// Chamada à API. Se a sessão expirou (401), volta para o login.
// Único ponto de acesso à API: padroniza JSON, tratamento de erro e expiração de sessão, para as telas não repetirem isso.
async function api(url, opcoes = {}) {
    const resp = await fetch(url, {
        method: opcoes.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: opcoes.body ? JSON.stringify(opcoes.body) : undefined
    });
    // 401 fora do login = sessão expirou. Exclui /api/login porque lá 401 significa 'senha errada' e a tela deve só mostrar o erro.
    if (resp.status === 401 && !url.includes('/api/login')) {
        window.location.href = '/login.html?expirou=1';
        // Promessa que nunca resolve: congela o código da tela enquanto o navegador redireciona (evita seguir com dados vazios).
        return new Promise(() => {});   // página está sendo redirecionada; não continua
    }
    const dados = await resp.json().catch(() => ({}));
    // Transforma erro HTTP em exceção com a mensagem do servidor; as telas a exibem com avisar().
    if (!resp.ok) throw new Error(dados.erro || 'Erro inesperado.');
    return dados;
}

// Evita quebrar o HTML (e XSS) ao exibir textos vindos do banco
// Escapa HTML antes de montar linhas com innerHTML: sem isso, um nome como <img onerror=...> executaria script (XSS armazenado).
function esc(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Só formata para exibição; o servidor sempre recebe/guarda apenas dígitos.
function formatarCpf(cpf) {
    const d = String(cpf).replace(/\D/g, '');
    return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf;
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Troca de string em vez de new Date() de propósito: evita o deslocamento de fuso horário que mudaria o dia exibido.
function formatarData(iso) {            // 2026-10-25 -> 25/10/2026
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
}
function nomeMes(iso) {                 // 2026-10-25 -> Outubro/2026
    const [a, m] = iso.split('-');
    return `${MESES[Number(m) - 1]}/${a}`;
}

function avisar(mensagem, tipo = 'ok') {
    const el = document.getElementById('aviso');
    el.textContent = mensagem;
    el.className = 'aviso ' + tipo;
    el.style.display = 'block';
    setTimeout(() => (el.style.display = 'none'), 3500);
}

function abrirModal(id) { document.getElementById(id).style.display = 'flex'; }
function fecharModal(id) { document.getElementById(id).style.display = 'none'; }

// Páginas internas: mostra o usuário logado e liga o botão Sair
// Chamada por toda página interna. Como o HTML é público, é ESTA chamada a /api/me que barra visitantes (redireciona no 401).
async function iniciarPagina() {
    const usuario = await api('/api/me');
    document.getElementById('nome-usuario').textContent = usuario.nome;
    document.getElementById('btn-sair').addEventListener('click', async () => {
        await api('/api/logout', { method: 'POST' });
        window.location.href = '/login.html';
    });
}