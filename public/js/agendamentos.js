const tbody = document.getElementById('tbody');
let agendamentos = [];
let editandoId = null;

iniciarPagina();
carregar();

async function carregar() {
    // a API já devolve ordenado por mês; aqui só mostramos um cabeçalho a cada mês novo
    // Depende da ordem entregue pela API: o cabeçalho de mês é inserido sempre que o mês muda em relação à linha anterior.
    agendamentos = await api('/api/agendamentos');
    let mesAtual = '';
    let html = '';
    for (const a of agendamentos) {
        const mes = nomeMes(a.data_agendamento);
        if (mes !== mesAtual) {
            mesAtual = mes;
            html += `<tr class="linha-mes"><td colspan="11">${esc(mes)}</td></tr>`;
        }
        html += `
        <tr>
            <td>${esc(formatarData(a.data_agendamento))}</td>
            <td>${esc(a.servico)}</td>
            <td>${esc(a.placa)}</td>
            <td>${esc(a.veiculo_modelo)}</td>
            <td>${esc(a.tipo)}</td>
            <td>${esc(a.marca)}</td>
            <td>${esc(a.cliente_nome)}</td>
            <td>${esc(formatarCpf(a.cliente_cpf))}</td>
            <td>${esc(a.telefone)}</td>
            <td>${esc(a.email)}</td>
            <td><button class="secundario" data-id="${a.id}">Alterar data</button></td>
        </tr>`;
    }
    tbody.innerHTML = html || '<tr><td colspan="11" class="vazio">Nenhum agendamento.</td></tr>';
}

// ---- alterar data ----
tbody.addEventListener('click', e => {
    const botao = e.target.closest('button[data-id]');
    if (!botao) return;
    editandoId = Number(botao.dataset.id);
    document.getElementById('data-edit').value =
        agendamentos.find(a => a.id === editandoId).data_agendamento;
    abrirModal('modal-data');
});
document.getElementById('cancelar-data').addEventListener('click', () => fecharModal('modal-data'));

document.getElementById('form-data').addEventListener('submit', async e => {
    e.preventDefault();
    try {
        await api('/api/agendamentos/' + editandoId, {
            method: 'PUT',
            body: { data_agendamento: document.getElementById('data-edit').value }
        });
        fecharModal('modal-data');
        avisar('Data atualizada.');
        carregar();
    } catch (err) {
        avisar(err.message, 'erro');
    }
});

// ---- novo agendamento ----
document.getElementById('btn-novo').addEventListener('click', async () => {
    // Carregado a cada abertura do formulário para refletir veículos recém-cadastrados.
    const veiculos = await api('/api/veiculos');
    document.getElementById('veiculo').innerHTML =
        '<option value="">Selecione...</option>' +
        veiculos.map(v => `<option value="${v.id}">${esc(v.placa)} - ${esc(v.modelo)} (${esc(v.cliente_nome)})</option>`).join('');
    document.getElementById('form-novo').reset();
    abrirModal('modal-novo');
});
document.getElementById('cancelar-novo').addEventListener('click', () => fecharModal('modal-novo'));

document.getElementById('form-novo').addEventListener('submit', async e => {
    e.preventDefault();
    try {
        await api('/api/agendamentos', {
            method: 'POST',
            body: {
                veiculo_id: Number(document.getElementById('veiculo').value),
                data_agendamento: document.getElementById('data-novo').value,
                servico: document.getElementById('servico').value
            }
        });
        fecharModal('modal-novo');
        avisar('Agendamento cadastrado.');
        carregar();
    } catch (err) {
        avisar(err.message, 'erro');
    }
});