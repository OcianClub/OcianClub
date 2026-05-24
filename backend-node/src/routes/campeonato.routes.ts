// src/routes/campeonato.routes.ts
import { Router } from 'express';
import {
  getClassificacao,
  getOpcoes,
  postSincronizar,
} from '../controllers/campeonato.controller';

const router = Router();

// GET  /campeonato/classificacao?temporada=2026&titulo=paulista&divisao=a3&categoria=sub12
router.get('/classificacao', getClassificacao);

// GET  /campeonato/opcoes
router.get('/opcoes', getOpcoes);

// POST /campeonato/sincronizar?temporada=2026&titulo=paulista&divisao=a3&categoria=sub12
router.post('/sincronizar', postSincronizar);

export default router;