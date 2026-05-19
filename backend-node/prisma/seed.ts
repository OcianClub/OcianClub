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
    const hashSenha = await bcrypt.hash('adm123', 10);
    await prisma.usuario.upsert({
        where: { email: 'adm@adm' },
        update: {},
        create: {
            nome: 'Administrador',
            email: 'adm@adm',
            senha: hashSenha,
            role: Role.ADMIN,
        },
    });
    console.log('✅ Usuário Admin verificado.');

    // ── 3. SEED DE TESTE EM MASSA ALINHADO AO NOVO SCHEMA ──────────────
    console.log("Gando elencos, partidas e times por sub correspondente...");

    const todasCategorias = await prisma.categoria.findMany();

    for (const cat of todasCategorias) {
        // Criando o registro do Ocian ESPECÍFICO para esta categoria (Garante o @@unique)
        const ocianSub = await prisma.time.create({
            data: { nome: "CFA Ocian", categoria_id: cat.id }
        });

        // Criando o Rival ESPECÍFICO para esta categoria
        const rivalSub = await prisma.time.create({
            data: { nome: "Rival FC", categoria_id: cat.id }
        });

        // CPFs dinâmicos e únicos baseados no ID da categoria
        const idStr = cat.id.toString().padStart(2, '0');
        const cpf1 = `111.111.111-${idStr}`;
        const cpf2 = `222.222.222-${idStr}`;
        const cpf3 = `333.333.333-${idStr}`;

        // Inserindo os jogadores vinculados à categoria
        const j1 = await prisma.jogador.create({
            data: { nome: `Marcos Artilheiro (${cat.nome})`, cpf: cpf1, dtNasc: new Date('2014-01-01'), posicao: 'Ala', categoria_id: cat.id, numCamisa: 9 }
        });

        const j2 = await prisma.jogador.create({
            data: { nome: `Jefferson Maestro (${cat.nome})`, cpf: cpf2, dtNasc: new Date('2014-01-01'), posicao: 'Ala', categoria_id: cat.id, numCamisa: 10 }
        });

        const j3 = await prisma.jogador.create({
            data: { nome: `Murilo Paredão (${cat.nome})`, cpf: cpf3, dtNasc: new Date('2014-01-01'), posicao: 'Goleiro', categoria_id: cat.id, numCamisa: 1 }
        });

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

        // Criação da Súmula / Escalação da partida
        await prisma.escalacaoPartida.createMany({
            data: [
                { partida_id: partida.id, jogador_id: j1.id, numCamisa: 9, titular: true },
                { partida_id: partida.id, jogador_id: j2.id, numCamisa: 10, titular: true },
                { partida_id: partida.id, jogador_id: j3.id, numCamisa: 1, titular: true },
            ]
        });

        // Inserção dos eventos utilizando o campo 'doOcian' (Novo Schema)
        await prisma.evento.createMany({
            data: [
                // Marcos Artilheiro fez 3 Gols
                { partida_id: partida.id, tipo: TipoEvento.GOL, minuto: 5, doOcian: true, jogador_id: j1.id },
                { partida_id: partida.id, tipo: TipoEvento.GOL, minuto: 12, doOcian: true, jogador_id: j1.id },
                { partida_id: partida.id, tipo: TipoEvento.GOL, minuto: 28, doOcian: true, jogador_id: j1.id },
                
                // Jefferson Maestro deu 2 Assistências e fez 1 Gol
                { partida_id: partida.id, tipo: TipoEvento.ASSISTENCIA, minuto: 5, doOcian: true, jogador_id: j2.id },
                { partida_id: partida.id, tipo: TipoEvento.ASSISTENCIA, minuto: 12, doOcian: true, jogador_id: j2.id },
                { partida_id: partida.id, tipo: TipoEvento.GOL, minuto: 35, doOcian: true, jogador_id: j2.id },
                
                // Murilo Paredão fez defesas
                { partida_id: partida.id, tipo: TipoEvento.DEFESA, minuto: 2, doOcian: true, jogador_id: j3.id },
                { partida_id: partida.id, tipo: TipoEvento.DEFESA, minuto: 15, doOcian: true, jogador_id: j3.id },
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