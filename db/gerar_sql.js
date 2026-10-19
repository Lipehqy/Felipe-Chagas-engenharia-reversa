// Gera o arquivo oficina_db.sql com dados de exemplo.
// Senhas em hash (bcrypt) e CPFs criptografados (AES-256-GCM) já saem prontos no script.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { criptografar } = require('../seguranca');

const h = s => bcrypt.hashSync(s, 8);

const sql = `-- =========================================================
-- Banco de dados: oficina_db  (Oficina Mecânica AutoCerta)
-- SGBD: SQLite 3
-- =========================================================
PRAGMA foreign_keys = ON;

CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    login TEXT NOT NULL UNIQUE,
    senha TEXT NOT NULL            -- hash bcrypt
);

CREATE TABLE clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cpf TEXT NOT NULL,             -- criptografado (AES-256-GCM)
    telefone TEXT,
    email TEXT
);

CREATE TABLE veiculos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    placa TEXT NOT NULL UNIQUE,
    modelo TEXT NOT NULL,
    tipo TEXT NOT NULL,
    marca TEXT,
    cliente_id INTEGER NOT NULL,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

CREATE TABLE agendamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    veiculo_id INTEGER NOT NULL,
    data_agendamento TEXT NOT NULL,  -- formato AAAA-MM-DD
    servico TEXT NOT NULL,
    FOREIGN KEY (veiculo_id) REFERENCES veiculos(id)
);

-- ---------------------------------------------------------
-- Dados iniciais (mínimo de 3 registros por tabela)
-- Logins: admin/admin123, ana.mecanica/ana123, carlos.recepcao/carlos123
-- ---------------------------------------------------------
INSERT INTO usuarios (nome, login, senha) VALUES
('Administrador', 'admin', '${h('admin123')}'),
('Ana Beatriz (Mecânica Chefe)', 'ana.mecanica', '${h('ana123')}'),
('Carlos Lima (Recepção)', 'carlos.recepcao', '${h('carlos123')}');

INSERT INTO clientes (nome, cpf, telefone, email) VALUES
('Maria Silva', '${criptografar('52998224725')}', '(11) 98888-1111', 'maria.silva@email.com'),
('João Pereira', '${criptografar('11144477735')}', '(11) 97777-2222', 'joao.pereira@email.com'),
('Fernanda Costa', '${criptografar('39053344705')}', '(11) 96666-3333', 'fernanda.costa@email.com');

INSERT INTO veiculos (placa, modelo, tipo, marca, cliente_id) VALUES
('ABC1D23', 'Onix', 'Carro', 'Chevrolet', 1),
('DEF4G56', 'CG 160', 'Moto', 'Honda', 2),
('GHI7J89', 'Hilux', 'Utilitário', 'Toyota', 3),
('JKL0M12', 'HB20', 'Carro', 'Hyundai', 1);

-- inseridos fora de ordem de propósito (a listagem ordena por mês)
INSERT INTO agendamentos (veiculo_id, data_agendamento, servico) VALUES
(3, '2026-12-10', 'Revisão completa'),
(2, '2026-10-25', 'Troca de óleo'),
(1, '2026-11-05', 'Alinhamento e balanceamento'),
(4, '2026-11-20', 'Troca de pastilhas de freio');
`;

fs.writeFileSync(path.join(__dirname, 'oficina_db.sql'), sql);
console.log('oficina_db.sql gerado.');
