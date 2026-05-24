// src/services/campeonato.service.ts
import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Mapa completo de eventos por temporada/título/divisão/sub ──────────────

export const EVENTO_MAP: Record<string, Record<string, Record<string, number>>> = {
  '2026': {
    paulista: {
      // Divisão A1
      'a1-sub7':  908,
      'a1-sub8':  909,
      'a1-sub9':  910,
      'a1-sub10': 911,
      'a1-sub12': 907,
      'a1-sub14': 905,
      'a1-sub16': 906,
      'a1-sub18': 904,
      // Divisão A2
      'a2-sub7':  900,
      'a2-sub8':  901,
      'a2-sub9':  902,
      'a2-sub10': 903,
      'a2-sub12': 899,
      'a2-sub14': 897,
      'a2-sub16': 898,
      'a2-sub18': 896,
      // Divisão A3
      'a3-sub7':  918,
      'a3-sub8':  919,
      'a3-sub9':  920,
      'a3-sub10': 921,
      'a3-sub12': 925,
      'a3-sub14': 923,
      'a3-sub16': 924,
      'a3-sub18': 922,
    },
  },
};

export const TEMPORADAS = ['2026'];
export const TITULOS    = ['paulista'];
export const DIVISOES   = ['a1', 'a2', 'a3'];
export const CATEGORIAS = ['sub7', 'sub8', 'sub9', 'sub10', 'sub12', 'sub14', 'sub16', 'sub18'];

export function resolverEventoId(
  temporada: string,
  titulo: string,
  divisao: string,
  categoria: string,
): number | null {
  const chave = `${divisao.toLowerCase()}-${categoria.toLowerCase()}`;
  return EVENTO_MAP[temporada]?.[titulo.toLowerCase()]?.[chave] ?? null;
}

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface ClassificacaoItem {
  grupo: string;
  posicao: number;
  clube: string;
  pontos: number;
  jogos: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  golsPro: number;
  golsContra: number;
  saldo: number;
  average: number;
  mediaGolsMarcados: number;
  mediaGolsSofridos: number;
  indiceTecnico: number;
  destaque: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseNum(val: string | undefined): number {
  const n = Number((val ?? '').trim().replace('º', '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function parseF(val: string | undefined): number {
  const n = parseFloat((val ?? '').trim().replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// ── Scraping ───────────────────────────────────────────────────────────────
//
// Estrutura confirmada por análise do HTML real (24 eventos):
//
//   td[0] = Grupo/Chave  (ex: "CHAVE A", "GRUPO UNICO")
//   td[1] = Posição      (ex: "1º")
//   td[2] = Clube        (<td> com div.row > div.col-8 contendo o nome)
//   td[3] = Pontos
//   td[4] = Jogos
//   td[5] = Vitórias
//   td[6] = Empates
//   td[7] = Derrotas
//   td[8] = Gols Pró
//   td[9] = Gols Contra
//  td[10] = Saldo
//  td[11] = Average
//  td[12] = Média Gols Marcados
//  td[13] = Média Gols Sofridos
//  td[14] = Índice Técnico
//
// A página contém MÚLTIPLAS .classification_table (abas por grupo + total).
// Usamos APENAS panes sem "-chave" e sem "-total" no id para evitar duplicatas.
// Eventos com CHAVE UNICA/GRUPO UNICO têm 1 pane; eventos com grupos (A, B…)
// têm N panes (um por grupo) — todos são lidos e concatenados.

export async function scraperClassificacao(eventoId: number): Promise<ClassificacaoItem[]> {
  const url = `https://eventos.admfutsal.com.br/evento/${eventoId}`;

  const { data: html } = await axios.get(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    },
    timeout: 15_000,
  });

  const $   = cheerio.load(html);
  const itens: ClassificacaoItem[] = [];
  const vistos = new Set<string>(); // chave "grupo|clube" — garante sem duplicata

  // Itera sobre cada tab-pane que contenha uma classification_table,
  // ignorando os panes de resumo por chave e o pane "total"
  $('[id^="pills-fase-"]').each((_, pane) => {
    const paneId = $(pane).attr('id') ?? '';

    // Pula panes de resumo: pills-fase-XXXXX-chave  e  pills-fase-total
    if (paneId.endsWith('-chave') || paneId === 'pills-fase-total') return;

    const tabela = $(pane).find('table.classification_table').first();
    if (!tabela.length) return;

    tabela.find('tbody tr').each((_, row) => {
      const cols = $(row).find('td');
      if (cols.length < 15) return;

      const t = (i: number) => $(cols[i]).text().trim();

      // O nome do clube fica dentro de div.col-8 dentro do td[2]
      // Usar .text() direto no td[2] misturaria o alt da imagem com o nome
      const clube = $(cols[2]).find('div.col-8').text().trim();
      if (!clube) return;

      const grupo = t(0);
      const dedup = `${grupo}|${clube}`;
      if (vistos.has(dedup)) return;
      vistos.add(dedup);

      itens.push({
        grupo,
        posicao:           parseNum(t(1)),   // "1º" → 1
        clube,
        pontos:            parseNum(t(3)),
        jogos:             parseNum(t(4)),
        vitorias:          parseNum(t(5)),
        empates:           parseNum(t(6)),
        derrotas:          parseNum(t(7)),
        golsPro:           parseNum(t(8)),
        golsContra:        parseNum(t(9)),
        saldo:             parseNum(t(10)),
        average:           parseF(t(11)),
        mediaGolsMarcados: parseF(t(12)),
        mediaGolsSofridos: parseF(t(13)),
        indiceTecnico:     parseF(t(14)),
        destaque:          clube.toLowerCase().includes('ocian'),
      });
    });
  });

  return itens;
}

// ── Sincronização ──────────────────────────────────────────────────────────

export async function sincronizarClassificacao(
  temporada: string,
  titulo: string,
  divisao: string,
  categoria: string,
): Promise<void> {
  const eventoId = resolverEventoId(temporada, titulo, divisao, categoria);

  if (!eventoId) {
    console.warn(`[Campeonato] Combinação não mapeada: ${temporada}/${titulo}/${divisao}/${categoria}`);
    return;
  }

  console.log(`[Campeonato] Sincronizando evento ${eventoId} (${temporada}/${titulo}/${divisao}/${categoria})...`);

  const itens = await scraperClassificacao(eventoId);

  if (itens.length === 0) {
    console.warn(`[Campeonato] Nenhum dado retornado para evento ${eventoId}. Dados anteriores mantidos.`);
    return;
  }

  await prisma.$transaction([
    prisma.campeonatoClassificacao.deleteMany({
      where: { temporada, titulo, divisao, categoria },
    }),
    prisma.campeonatoClassificacao.createMany({
      data: itens.map(item => ({
        ...item,
        temporada,
        titulo,
        divisao,
        categoria,
        eventoId,
      })),
    }),
  ]);

  console.log(`[Campeonato] ${itens.length} times salvos para evento ${eventoId}.`);
}

// Sincroniza TODOS os eventos mapeados (usado no cron)
export async function sincronizarTodos(): Promise<void> {
  const tarefas: Promise<void>[] = [];

  for (const temporada of TEMPORADAS) {
    for (const titulo of TITULOS) {
      for (const divisao of DIVISOES) {
        for (const categoria of CATEGORIAS) {
          tarefas.push(
            sincronizarClassificacao(temporada, titulo, divisao, categoria).catch(err => {
              console.error(
                `[Campeonato] Erro em ${temporada}/${titulo}/${divisao}/${categoria}:`,
                err.message,
              );
            }),
          );
        }
      }
    }
  }

  await Promise.all(tarefas);
  console.log('[Campeonato] Sincronização completa de todos os eventos.');
}

// ── Busca do banco ─────────────────────────────────────────────────────────

export async function buscarClassificacao(
  temporada: string,
  titulo: string,
  divisao: string,
  categoria: string,
): Promise<ClassificacaoItem[]> {
  const registros = await prisma.campeonatoClassificacao.findMany({
    where: {
      temporada: temporada.toLowerCase(),
      titulo:    titulo.toLowerCase(),
      divisao:   divisao.toLowerCase(),
      categoria: categoria.toLowerCase(),
    },
    orderBy: [{ grupo: 'asc' }, { posicao: 'asc' }],
  });

  return registros.map(r => ({
    grupo:             r.grupo,
    posicao:           r.posicao,
    clube:             r.clube,
    pontos:            r.pontos,
    jogos:             r.jogos,
    vitorias:          r.vitorias,
    empates:           r.empates,
    derrotas:          r.derrotas,
    golsPro:           r.golsPro,
    golsContra:        r.golsContra,
    saldo:             r.saldo,
    average:           r.average,
    mediaGolsMarcados: r.mediaGolsMarcados,
    mediaGolsSofridos: r.mediaGolsSofridos,
    indiceTecnico:     r.indiceTecnico,
    destaque:          r.destaque,
  }));
}