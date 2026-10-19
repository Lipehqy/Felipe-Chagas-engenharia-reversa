const erro = document.getElementById('erro');

function mostrarErro(msg) {
    erro.textContent = msg;
    erro.style.display = 'block';
}

// veio redirecionado porque a sessão expirou
// comum.js redireciona com ?expirou=1 quando a sessão acaba; aqui é mostrado o motivo.
if (new URLSearchParams(location.search).get('expirou')) {
    mostrarErro('Sua sessão expirou. Faça login novamente.');
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    erro.style.display = 'none';
    try {
        await api('/api/login', {
            method: 'POST',
            body: {
                login: document.getElementById('login').value,
                senha: document.getElementById('senha').value
            }
        });
        // Só vai para o painel se a API respondeu 200; em erro cai no catch e permanece no login.
        window.location.href = '/principal.html';
    } catch (err) {
        mostrarErro(err.message);   // falha de autenticação: informa e fica no login
    }
});