const qrcode = require('qrcode-terminal');
const { Client } = require('whatsapp-web.js');
const sqlite3 = require('sqlite3').verbose();
const client = new Client();

// Conexão com o banco de dados SQLite
const db = new sqlite3.Database('./barbearia.db', (err) => {
    if (err) {
        return console.error('❌ Erro ao conectar ao banco de dados:', err.message);
    }
    console.log('✅ Conectado ao banco de dados SQLite.');
});

// Criação da tabela de agendamentos
db.run(`CREATE TABLE IF NOT EXISTS agendamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    horario TEXT,
    data TEXT,
    status TEXT
)`);

// Exibe o QR Code para login
client.on('qr', qr => {
    console.log('📱 Escaneie o QR Code para conectar ao WhatsApp.');
    qrcode.generate(qr, { small: true });
});

// Confirma que o WhatsApp foi conectado
client.on('ready', () => {
    console.log('✅ Tudo certo! WhatsApp conectado.');
});

client.initialize();

// Variável para armazenar dados temporários dos clientes
const sessionData = {};

// Função de delay para simular digitação
const delay = ms => new Promise(res => setTimeout(res, ms));

// Fluxo do chatbot
client.on('message', async msg => {
    const chatId = msg.from;

    // Inicializa a sessão do usuário, se não existir
    if (!sessionData[chatId]) sessionData[chatId] = { step: null, error: false };

    // Menu inicial
    if (msg.body.match(/^(menu|oi|olá|ola|bom dia|boa tarde|boa noite)$/i)) {
        sessionData[chatId] = { step: null, error: false }; // Reseta a sessão
        await client.sendMessage(chatId, `Olá! Sou o assistente virtual da Barbearia Tal. Escolha uma opção:

1️⃣ Agendar Horário
2️⃣ Promoções
3️⃣ Endereço e Contato
4️⃣ Cancelar Agendamento
5️⃣ Perguntas Frequentes`);
        return;
    }

    // Passo 1: Agendar horário
    if (msg.body === '1' && !sessionData[chatId].step) {
        sessionData[chatId].step = 'date';
        await client.sendMessage(chatId, `📅 Informe o dia e mês do seu agendamento (formato Mês Dia, ex: Janeiro 15).`);
        return;
    }

    // Passo 2: Escolher a data com mês por extenso
    if (sessionData[chatId].step === 'date') {
        const inputText = msg.body.trim();
        if (inputText.match(/^[a-zA-Z]+ [0-9]{1,2}$/)) {
            const currentDate = new Date();
            const [monthName, day] = inputText.split(' ');

            const monthNames = [
                'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
            ];

            const monthIndex = monthNames.findIndex(name => name.toLowerCase() === monthName.toLowerCase());
            if (monthIndex === -1) {
                await client.sendMessage(chatId, `❌ Mês inválido. Por favor, informe o mês por extenso (ex: Janeiro).`);
                return;
            }

            const inputDate = new Date(currentDate.getFullYear(), monthIndex, day);
            if (inputDate <= currentDate || [0, 6].includes(inputDate.getDay())) {
                await client.sendMessage(chatId, `❌ Escolha uma data válida de segunda a sexta-feira, no futuro.`);
                return;
            }

            sessionData[chatId].date = inputText;
            sessionData[chatId].step = 'time';

            // Consultar os agendamentos para verificar horários indisponíveis
            db.all(`SELECT * FROM agendamentos WHERE data = ? AND status = 'Pendente'`, [sessionData[chatId].date], (err, rows) => {
                if (err) {
                    console.error('❌ Erro ao consultar os agendamentos:', err.message);
                    return;
                }

                const horarios = {
                    A: '09:00',
                    B: '10:00',
                    C: '11:00',
                    D: '13:00',
                    E: '14:00',
                    F: '15:00'
                };

                const horariosIndisponiveis = [];
                rows.forEach(agendamento => {
                    const horarioIndisponivel = Object.keys(horarios).find(key => horarios[key] === agendamento.horario);
                    if (horarioIndisponivel) {
                        horariosIndisponiveis.push(horarioIndisponivel);
                    }
                });

                const horariosDisponiveis = Object.keys(horarios).filter(key => !horariosIndisponiveis.includes(key));

                if (horariosDisponiveis.length > 0) {
                    let mensagem = `✅ Escolha o horário disponível:\n\n`;
                    horariosDisponiveis.forEach(key => {
                        mensagem += `🕒 ${key}: ${horarios[key]}\n`;
                    });
                    client.sendMessage(chatId, mensagem);
                } else {
                    client.sendMessage(chatId, `❌ Todos os horários estão ocupados para a data ${sessionData[chatId].date}. Por favor, escolha outra data.`);
                }
            });
        } else {
            await client.sendMessage(chatId, `❌ A data informada não está no formato correto. Por favor, use o formato "Mês Dia" (ex: Janeiro 15).`);
        }
        return;
    }

    // Passo 3: Escolher o horário
    if (sessionData[chatId].step === 'time' && msg.body.match(/^[A-Fa-f]$/)) {
        const horarios = {
            A: '09:00',
            B: '10:00',
            C: '11:00',
            D: '13:00',
            E: '14:00',
            F: '15:00'
        };

        const horarioEscolhido = msg.body.toUpperCase();
        const horariosIndisponiveis = [];

        // Consultar os agendamentos para verificar horários indisponíveis
        db.all(`SELECT * FROM agendamentos WHERE data = ? AND status = 'Pendente'`, [sessionData[chatId].date], (err, rows) => {
            if (err) {
                console.error('❌ Erro ao consultar os agendamentos:', err.message);
                return;
            }

            rows.forEach(agendamento => {
                const horarioIndisponivel = Object.keys(horarios).find(key => horarios[key] === agendamento.horario);
                if (horarioIndisponivel) {
                    horariosIndisponiveis.push(horarioIndisponivel);
                }
            });

            if (horariosIndisponiveis.includes(horarioEscolhido)) {
                client.sendMessage(chatId, `❌ O horário ${horarios[horarioEscolhido]} não está disponível. Escolha outro horário.`);
                return;
            }

            sessionData[chatId].time = horarios[horarioEscolhido];
            sessionData[chatId].step = 'name';
            client.sendMessage(chatId, `✅ Horário ${sessionData[chatId].time} selecionado! Agora, por favor, informe seu nome completo.`);
        });
        return;
    }

    // Passo 4: Confirmar o nome
    if (sessionData[chatId].step === 'name' && msg.body.trim().length > 1) {
        sessionData[chatId].name = msg.body.trim();
        db.run(`INSERT INTO agendamentos (nome, horario, data, status) VALUES (?, ?, ?, ?)`, [sessionData[chatId].name, sessionData[chatId].time, sessionData[chatId].date, 'Pendente'], (err) => {
            if (err) {
                return console.error('❌ Erro ao salvar no banco de dados:', err.message);
            }
            console.log('✅ Agendamento salvo no banco de dados.');
        });
        await client.sendMessage(chatId, `✅ Seu agendamento foi registrado com sucesso!

🕒 Data: ${sessionData[chatId].date} às ${sessionData[chatId].time}
👤 Nome: ${sessionData[chatId].name}

Digite "menu" para voltar ao início.`);

        const BARBER_NUMBER = '11962094589@c.us';
        await client.sendMessage(BARBER_NUMBER, `📅 Novo agendamento:

👤 Nome: ${sessionData[chatId].name}
🕒 Data: ${sessionData[chatId].date} às ${sessionData[chatId].time}

Status: Pendente`);
        delete sessionData[chatId];
        return;
    }

    // Outras opções
    if (msg.body === '2') {
        await client.sendMessage(chatId, `🔥 Promoções da Barbearia:

1️⃣ Corte Tradicional: R$ 30,00
2️⃣ Corte + Barba: R$ 50,00

🕒 O tempo médio de corte é de 30 minutos. O tempo de corte + barba é de 60 minutos.`);
        return;
    }

    if (msg.body === '3') {
        await client.sendMessage(chatId, `📍 Estamos localizados na Rua X, nº 123, Bairro Y, São Paulo, SP.

📞 Para agendamentos por telefone, ligue para (11) 99999-9999.`);
        return;
    }

    if (msg.body === '4') {
        await client.sendMessage(chatId, `📞 Opa! Para cancelar um agendamento, pedimos que você entre em contato diretamente pelo telefone. Assim, garantimos que tudo seja feito certinho e sem erros! 😉

📲 Ligue para (11) 99999-9999 e fale diretamente com a nossa equipe. Prometemos que será rapidinho!`);
        return;
    }

    if (msg.body === '5') {
        await client.sendMessage(chatId, `❓ Perguntas Frequentes:

- Quais são os horários disponíveis?
🕒 Os horários disponíveis são de segunda a sexta-feira, das 09:00 às 15:00.

- Vocês aceitam cartão?
💳 Sim, aceitamos cartões de crédito e débito.

- Onde fica a barbearia?
📍 Estamos localizados na Rua X, nº 123, Bairro Y, São Paulo, SP.`);
        return;
    }
});
