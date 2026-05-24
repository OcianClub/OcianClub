// src/controllers/campeonato.controller.ts
import { Request, Response } from 'express';
import {
  buscarClassificacao,
  sincronizarClassificacao,
  TEMPORADAS,
  TITULOS,
  DIVISOES,
  CATEGORIAS,
  resolverEventoId,
} from '../services/campeonato.service';

// GET /campeonato/classificacao?temporada=2026&titulo=paulista&divisao=a3&categoria=sub12
export async function getClassificacao(req: Request, res: Response): Promise<void> {
  const temporada = (req.query.temporada as string) ?? '2026';
  const titulo    = (req.query.titulo    as string) ?? 'paulista';
  const divisao   = (req.query.divisao   as string) ?? 'a3';
  const categoria = (req.query.categoria as string) ?? 'sub12';

  if (!resolverEventoId(temporada, titulo, divisao, categoria)) {
    res.status(400).json({ error: 'Combinação de filtros não mapeada.' });
    return;
  }

  try {
    const classificacao = await buscarClassificacao(temporada, titulo, divisao, categoria);

    if (classificacao.length === 0) {
      res.status(200).json({
        mensagem: 'Classificação ainda não disponível. Aguarde a próxima sincronização.',
        data: [],
      });
      return;
    }

    res.json(classificacao);
  } catch (error: any) {
    console.error('[Campeonato] Erro ao buscar classificação:', error.message);
    res.status(500).json({ error: 'Erro ao buscar classificação do campeonato.' });
  }
}

// GET /campeonato/opcoes — retorna as opções disponíveis para o frontend montar os filtros
export async function getOpcoes(_req: Request, res: Response): Promise<void> {
  res.json({
    temporadas: TEMPORADAS,
    titulos:    TITULOS,
    divisoes:   DIVISOES,
    categorias: CATEGORIAS,
  });
}

// POST /campeonato/sincronizar?temporada=2026&titulo=paulista&divisao=a3&categoria=sub12
// Rota manual para forçar sincronização de um filtro específico (uso admin)
export async function postSincronizar(req: Request, res: Response): Promise<void> {
  const temporada = (req.query.temporada as string) ?? '2026';
  const titulo    = (req.query.titulo    as string) ?? 'paulista';
  const divisao   = (req.query.divisao   as string) ?? 'a3';
  const categoria = (req.query.categoria as string) ?? 'sub12';

  try {
    await sincronizarClassificacao(temporada, titulo, divisao, categoria);
    res.json({ mensagem: 'Sincronização concluída.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}