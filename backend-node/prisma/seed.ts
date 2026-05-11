import { PrismaClient, TipoCategoria, Role } from "@prisma/client";
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log("Iniciando o seeding de Futsal em Massa...");

    // ── 1. SEED DE CATEGORIAS ──────────────────────────────────────────
    const categoriasIniciacao = ['sub-7', 'sub-8', 'sub-9', 'sub-10'];
    for (const nome of categoriasIniciacao) {
        const categoriaExiste = await prisma.categoria.findFirst({ where: { nome: nome } });
        if (!categoriaExiste) {
            await prisma.categoria.create({
                data: { nome: nome, tipo: TipoCategoria.INICIACAO },
            });
            console.log(`Categoria ${nome} Criada!`);
        }
    }

    const categoriasBases = ['sub-12', 'sub-14', 'sub-16', 'sub-18'];
    for (const nome of categoriasBases) {
        const categoriaExiste = await prisma.categoria.findFirst({ where: { nome: nome } });
        if (!categoriaExiste) {
            await prisma.categoria.create({
                data: { nome: nome, tipo: TipoCategoria.BASE },
            });
            console.log(`Categoria ${nome} Criada!`);
        }
    }

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
    console.log('Usuário Admin criado/verificado.');

    // ── 3. SEED DE TESTE EM MASSA PARA A IA ────────────────────────────
    console.log("Gerando elencos, partidas e eventos para todas as categorias...");

    let ocian = await prisma.time.findFirst({ where: { nome: 'CFA Ocian' } });
    if (!ocian) ocian = await prisma.time.create({ data: { nome: 'CFA Ocian' } });

    let rival = await prisma.time.findFirst({ where: { nome: 'Rival FC' } });
    if (!rival) rival = await prisma.time.create({ data: { nome: 'Rival FC' } });

    // Pega todas as categorias que acabaram de ser criadas
    const todasCategorias = await prisma.categoria.findMany();

    for (const cat of todasCategorias) {
        // Gera CPFs dinâmicos e únicos baseados no ID da categoria para nunca dar conflito
        const idStr = cat.id.toString().padStart(2, '0');
        const cpf1 = `111.111.111-${idStr}`;
        const cpf2 = `222.222.222-${idStr}`;
        const cpf3 = `333.333.333-${idStr}`;

        // Cria 3 jogadores para a categoria atual
        const j1 = await prisma.jogador.upsert({
            where: { cpf: cpf1 },
            update: {},
            create: { nome: `Marcos Artilheiro (${cat.nome})`, cpf: cpf1, dtNasc: new Date('2014-01-01'), posicao: 'Ala', categoria_id: cat.id, numCamisa: 9 }
        });

        const j2 = await prisma.jogador.upsert({
            where: { cpf: cpf2 },
            update: {},
            create: { nome: `Jefferson Maestro (${cat.nome})`, cpf: cpf2, dtNasc: new Date('2014-01-01'), posicao: 'Ala', categoria_id: cat.id, numCamisa: 10 }
        });

        const j3 = await prisma.jogador.upsert({
            where: { cpf: cpf3 },
            update: {},
            create: { nome: `Murilo Paredão (${cat.nome})`, cpf: cpf3, dtNasc: new Date('2014-01-01'), posicao: 'Goleiro', categoria_id: cat.id, numCamisa: 1 }
        });

        // Verifica se já existe uma partida de teste para esta categoria
        const partidaTesteExiste = await prisma.partida.findFirst({
            where: { mandante_id: ocian.id, visitante_id: rival.id, categoria_id: cat.id }
        });

        if (!partidaTesteExiste) {
            // Cria a Partida FINALIZADA
            const partida = await prisma.partida.create({
                data: {
                    mandante_id: ocian.id, visitante_id: rival.id,
                    gols_mandante: 4, gols_visitante: 1,
                    emCasa: true, status: 'FINALIZADA', categoria_id: cat.id,
                }
            });

            // Escala os 3 atletas
            await prisma.escalacaoPartida.createMany({
                data: [
                    { partida_id: partida.id, jogador_id: j1.id, numCamisa: 9, titular: true },
                    { partida_id: partida.id, jogador_id: j2.id, numCamisa: 10, titular: true },
                    { partida_id: partida.id, jogador_id: j3.id, numCamisa: 1, titular: true },
                ]
            });

            // Gera os Eventos que vão alimentar a Inteligência Artificial
            await prisma.evento.createMany({
                data: [
                    // O Artilheiro fez 3 Gols
                    { partida_id: partida.id, tipo: 'GOL', minuto: 5, time_id: ocian.id, jogador_id: j1.id },
                    { partida_id: partida.id, tipo: 'GOL', minuto: 12, time_id: ocian.id, jogador_id: j1.id },
                    { partida_id: partida.id, tipo: 'GOL', minuto: 28, time_id: ocian.id, jogador_id: j1.id },
                    
                    // O Maestro deu 2 Assistências e fez 1 Gol
                    { partida_id: partida.id, tipo: 'ASSISTENCIA', minuto: 5, time_id: ocian.id, jogador_id: j2.id },
                    { partida_id: partida.id, tipo: 'ASSISTENCIA', minuto: 12, time_id: ocian.id, jogador_id: j2.id },
                    { partida_id: partida.id, tipo: 'GOL', minuto: 35, time_id: ocian.id, jogador_id: j2.id },
                    
                    // O Goleiro fez 4 Defesas sensacionais
                    { partida_id: partida.id, tipo: 'DEFESA', minuto: 2, time_id: ocian.id, jogador_id: j3.id },
                    { partida_id: partida.id, tipo: 'DEFESA', minuto: 15, time_id: ocian.id, jogador_id: j3.id },
                    { partida_id: partida.id, tipo: 'DEFESA', minuto: 22, time_id: ocian.id, jogador_id: j3.id },
                    { partida_id: partida.id, tipo: 'DEFESA', minuto: 38, time_id: ocian.id, jogador_id: j3.id },
                ]
            });
            console.log(`✅ Partida e elenco gerados para a categoria ${cat.nome}!`);
        } else {
            console.log(`⏳ Dados da categoria ${cat.nome} já existem, pulando...`);
        }
    }

    console.log('🚀 Seed em massa concluído com sucesso!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });