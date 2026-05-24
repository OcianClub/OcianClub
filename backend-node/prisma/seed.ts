import { PrismaClient, TipoCategoria, Role, TipoEvento, StatusPartida } from "@prisma/client";
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log("🧼 Fazendo uma limpa nas partidas, eventos e tabelas dependentes...");
    
    // Deleta em ordem reversa de chaves estrangeiras para não dar erro P2003
    await prisma.evento.deleteMany({});
    await prisma.escalacaoPartida.deleteMany({});
    await prisma.partida.deleteMany({});
    await prisma.competicaoTime.deleteMany({});
    await prisma.competicaoJogador.deleteMany({});
    await prisma.jogador.deleteMany({});
    await prisma.time.deleteMany({});
    await prisma.competicao.deleteMany({});
    
    console.log("🏁 Banco limpo para os dados de teste. Iniciando o seeding...");

    // ── 1. SEED DE CATEGORIAS ──────────────────────────────────────────
    const categoriasIniciacao = ['sub-7', 'sub-8', 'sub-9', 'sub-10'];
    for (const nome of categoriasIniciacao) {
        await prisma.categoria.upsert({
            where: { nome: nome },
            update: {},
            create: { nome: nome, tipo: TipoCategoria.INICIACAO, faixaIdade: parseInt(nome.replace('sub-', '')) },
        });
    }

    const categoriasBases = ['sub-12', 'sub-14', 'sub-16', 'sub-18'];
    for (const nome of categoriasBases) {
        await prisma.categoria.upsert({
            where: { nome: nome },
            update: {},
            create: { nome: nome, tipo: TipoCategoria.BASE, faixaIdade: parseInt(nome.replace('sub-', '')) },
        });
    }
    console.log("✅ Categorias de Iniciação e Base criadas/verificadas.");

    // ── 2. SEED DE ADMIN ───────────────────────────────────────────────
    const hashSenha = await bcrypt.hash('123456', 10);
    await prisma.usuario.upsert({
        where: { email: 'admin@ocian.com' },
        update: {},
        create: {
            nome: 'Administrador',
            email: 'admin@ocian.com',
            senha: hashSenha,
            role: Role.ADMIN,
        },
    });
    console.log('✅ Usuário Admin verificado (admin@ocian.com / 123456).');

    // ── 3. SEED DE TESTE EM MASSA ALINHADO AO NOVO SCHEMA ──────────────
    console.log("⚽ Gerando elencos (6 atletas), partidas e times por sub correspondente...");

    const todasCategorias = await prisma.categoria.findMany();
    const anoAtual = 2026;

    for (const cat of todasCategorias) {
        // Criando o registro do Ocian e Rival ESPECÍFICOS para esta categoria
        const ocianSub = await prisma.time.create({ data: { nome: "CFA Ocian", categoria_id: cat.id } });
        const rivalSub = await prisma.time.create({ data: { nome: "Rival FC", categoria_id: cat.id } });

        // Cálculo do ano de nascimento adequado para a categoria no ano de 2026
        const anoNascimento = anoAtual - cat.faixaIdade;
        const idStr = cat.id.toString().padStart(2, '0');

        // Criação de 6 jogadores com CPFs e numerações únicas
        const jogadoresData = [
            { nome: `Murilo Paredão (${cat.nome})`, posicao: 'Goleiro', camisa: 1,  titular: true },
            { nome: `Felipe Fixo (${cat.nome})`,    posicao: 'Fixo',    camisa: 4,  titular: true },
            { nome: `Jefferson Maestro (${cat.nome})`, posicao: 'Ala',   camisa: 10, titular: true },
            { nome: `Marcos Artilheiro (${cat.nome})`, posicao: 'Pivô',  camisa: 9,  titular: true },
            { nome: `Lucas Motorzinho (${cat.nome})`,  posicao: 'Ala',   camisa: 7,  titular: true },
            { nome: `Gabriel Talento (${cat.nome})`,   posicao: 'Ala',   camisa: 11, titular: false } // Reserva
        ];

        const jogadoresCriados = [];

        for (let i = 0; i < jogadoresData.length; i++) {
            const jData = jogadoresData[i];
            const cpf = `${String(i + 1).repeat(3)}.${String(i + 1).repeat(3)}.${idStr}-00`;
            
            const j = await prisma.jogador.create({
                data: { 
                    nome: jData.nome, 
                    cpf: cpf, 
                    dtNasc: new Date(`${anoNascimento}-05-10`), 
                    posicao: jData.posicao, 
                    categoria_id: cat.id, 
                    numCamisa: jData.camisa,
                    ativo: true
                }
            });
            jogadoresCriados.push({ jogador: j, titular: jData.titular, camisa: jData.camisa });
        }

        // Criando a Partida de Teste utilizando os IDs dos times corretos do sub atual
        const partida = await prisma.partida.create({
            data: {
                mandante_id: ocianSub.id, 
                visitante_id: rivalSub.id,
                gols_mandante: 4, 
                gols_visitante: 1,
                emCasa: true, 
                status: StatusPartida.FINALIZADA, 
                categoria_id: cat.id,
                data: new Date(),
                horario: "09:00",
                local: "Ginásio Ocian Praia Clube",
                rodada: 1
            }
        });

        // Criação da Súmula (5 titulares, 1 banco)
        await prisma.escalacaoPartida.createMany({
            data: jogadoresCriados.map(jc => ({
                partida_id: partida.id,
                jogador_id: jc.jogador.id,
                numCamisa: jc.camisa,
                titular: jc.titular
            }))
        });

        // Inserção dos eventos utilizando o novo campo 'periodo' em vez de 'minuto'
        await prisma.evento.createMany({
            data: [
                // Marcos Artilheiro fez 3 Gols
                { partida_id: partida.id, tipo: TipoEvento.GOL, periodo: 1, minuto: null, doOcian: true, jogador_id: jogadoresCriados[3].jogador.id },
                { partida_id: partida.id, tipo: TipoEvento.GOL, periodo: 1, minuto: null, doOcian: true, jogador_id: jogadoresCriados[3].jogador.id },
                { partida_id: partida.id, tipo: TipoEvento.GOL, periodo: 2, minuto: null, doOcian: true, jogador_id: jogadoresCriados[3].jogador.id },
                
                // Jefferson Maestro deu 2 Assistências e fez 1 Gol
                { partida_id: partida.id, tipo: TipoEvento.ASSISTENCIA, periodo: 1, minuto: null, doOcian: true, jogador_id: jogadoresCriados[2].jogador.id },
                { partida_id: partida.id, tipo: TipoEvento.ASSISTENCIA, periodo: 2, minuto: null, doOcian: true, jogador_id: jogadoresCriados[2].jogador.id },
                { partida_id: partida.id, tipo: TipoEvento.GOL, periodo: 2, minuto: null, doOcian: true, jogador_id: jogadoresCriados[2].jogador.id },
                
                // Murilo Paredão fez defesas
                { partida_id: partida.id, tipo: TipoEvento.DEFESA, periodo: 1, minuto: null, doOcian: true, jogador_id: jogadoresCriados[0].jogador.id },
                { partida_id: partida.id, tipo: TipoEvento.DEFESA, periodo: 2, minuto: null, doOcian: true, jogador_id: jogadoresCriados[0].jogador.id },

                // Faltas e Cartões para testar o esquema completo
                { partida_id: partida.id, tipo: TipoEvento.FALTA, periodo: 1, minuto: null, doOcian: true, jogador_id: jogadoresCriados[1].jogador.id },
                { partida_id: partida.id, tipo: TipoEvento.CARTAO_AMARELO, periodo: 2, minuto: null, doOcian: true, jogador_id: jogadoresCriados[1].jogador.id },
                { partida_id: partida.id, tipo: TipoEvento.CARTAO_AZUL, periodo: 2, minuto: null, doOcian: true, jogador_id: jogadoresCriados[4].jogador.id },
            ]
        });

        console.log(`⚡ Estrutura completa injetada para o [${cat.nome.toUpperCase()}]`);
    }

    console.log('🚀 Seeding concluído com sucesso e tabelas limpas!');
}

main()
    .catch((e) => {
        console.error("Erro durante o processo de seed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });