const tbody = document.getElementById('tbody');
let clientes = [];
// null = cadastrando; número = editando aquele cliente. O MESMO formulário serve aos dois casos.
let editandoId = null;

iniciarPagina();
carregar();

async function carregar() {
    const termo = document.getElementById('busca').value.trim();
    // A busca é feita no servidor (que descriptografa os CPFs); guardamos a lista para preencher o formulário de edição sem nova chamada.
    clientes = await api('/api/clientes?busca=' + encodeURIComponent(termo));
    tbody.innerHTML = clientes.map(t => `
        <tr>
            <td>${esc(t.nome)}</td>
            <td>${esc(formatarCpf(t.cpf))}</td>
            <td>${esc(t.telefone)}</td>
            <td>${esc(t.email)}</td>
            <td><button class="secundario" data-id="${t.id}">Editar</button></td>
        </tr>`).join('') || '<tr><td colspan="5" class="vazio">Nenhum cliente encontrado.</td></tr>';
}

// busca: atualiza a listagem ao confirmar (botão ou Enter)
document.getElementById('btn-buscar').addEventListener('click', carregar);
document.getElementById('busca').addEventListener('keydown', e => { if (e.key === 'Enter') carregar(); });

function abrirFormulario(cliente) {
    editandoId = cliente ? cliente.id : null;
    document.getElementById('modal-titulo').textContent = cliente ? 'Editar cliente' : 'Novo cliente';
    document.getElementById('nome').value = cliente ? cliente.nome : '';
    document.getElementById('cpf').value = cliente ? formatarCpf(cliente.cpf) : '';
    document.getElementById('telefone').value = cliente ? cliente.telefone : '';
    document.getElementById('email').value = cliente ? cliente.email : '';
    abrirModal('modal');
}

document.getElementById('btn-novo').addEventListener('click', () => abrirFormulario(null));
document.getElementById('btn-cancelar').addEventListener('click', () => fecharModal('modal'));
// Delegação de evento: um único listener cobre os botões 'Editar' criados dinamicamente.
tbody.addEventListener('click', e => {
    const botao = e.target.closest('button[data-id]');
    if (botao) abrirFormulario(clientes.find(t => t.id === Number(botao.dataset.id)));
});

document.getElementById('form').addEventListener('submit', async e => {
    e.preventDefault();
    // Envia o CPF como digitado (com máscara): quem normaliza para 11 dígitos é o servidor.
    const corpo = {
        nome: document.getElementById('nome').value,
        cpf: document.getElementById('cpf').value,
        telefone: document.getElementById('telefone').value,
        email: document.getElementById('email').value
    };
    try {
        await api(editandoId ? '/api/clientes/' + editandoId : '/api/clientes',
                  { method: editandoId ? 'PUT' : 'POST', body: corpo });
        fecharModal('modal');
        avisar(editandoId ? 'Cliente atualizado.' : 'Cliente cadastrado.');
        carregar();
    } catch (err) {
        avisar(err.message, 'erro');
    }
});