// app/(tabs)/placar/campeonato.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, RefreshControl,
  StyleSheet, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '@/src/components/Header';
import { colors } from '@/src/theme/colors';
import {
  fetchClassificacaoCampeonato,
  ClassificacaoItem,
  FiltrosCampeonato,
} from '@/src/services/api';

const MARGIN = 16;

// ── Filtros estáticos ─────────────────────────────────────────────────────────

const DIVISOES   = ['a1', 'a2', 'a3'] as const;
const CATEGORIAS = ['sub7','sub8','sub9','sub10','sub12','sub14','sub16','sub18'] as const;

type Divisao   = typeof DIVISOES[number];
type Categoria = typeof CATEGORIAS[number];

const LABEL_DIVISAO: Record<Divisao, string> = {
  a1: 'Div. A1', a2: 'Div. A2', a3: 'Div. A3',
};
const LABEL_CATEGORIA: Record<Categoria, string> = {
  sub7: 'Sub-7', sub8: 'Sub-8', sub9: 'Sub-9', sub10: 'Sub-10',
  sub12: 'Sub-12', sub14: 'Sub-14', sub16: 'Sub-16', sub18: 'Sub-18',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const GERAL = '__GERAL__';

function formatSaldo(s: number): string {
  return s > 0 ? `+${s}` : String(s);
}

function tempoDesde(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)   return 'agora mesmo';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  return `há ${Math.floor(diff / 3600)}h`;
}

// Extrai a letra do grupo: "GRUPO C" → "C", "CHAVE A" → "A", "1ª FASE - B" → "B"
function letraDoGrupo(grupo: string): string {
  const m = grupo.match(/\b([A-Z])\s*$/);
  return m ? m[1] : grupo;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <View style={[s.tableRow, s.rowBorder]}>
      <View style={[s.skeleton, { width: 24, marginRight: 10 }]} />
      <View style={[s.skeleton, { flex: 1, marginRight: 8 }]} />
      <View style={[s.skeleton, { width: 22 }]} />
      <View style={[s.skeleton, { width: 22, marginHorizontal: 4 }]} />
      <View style={[s.skeleton, { width: 22 }]} />
      <View style={[s.skeleton, { width: 28, marginLeft: 4 }]} />
    </View>
  );
}

// ── Banner ────────────────────────────────────────────────────────────────────

function CampeonatoBanner({ divisao, categoria }: { divisao: Divisao; categoria: Categoria }) {
  return (
    <View style={s.banner}>
      <View style={s.bannerIconWrap}>
        <Ionicons name="trophy" size={20} color={colors.azulClaro} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.bannerCampeonato}>PAULISTA 2026</Text>
        <Text style={s.bannerSub}>
          {LABEL_DIVISAO[divisao]} · {LABEL_CATEGORIA[categoria]}
        </Text>
      </View>
    </View>
  );
}

// ── Card do Ocian ─────────────────────────────────────────────────────────────

function OcianCard({ time }: { time: ClassificacaoItem }) {
  const stats = [
    { label: 'PTS', value: String(time.pontos) },
    { label: 'J',   value: String(time.jogos) },
    { label: 'GP',  value: String(time.golsPro) },
    { label: 'GC',  value: String(time.golsContra) },
    { label: 'SG',  value: formatSaldo(time.saldo) },
  ];
  return (
    <View style={s.ocianCard}>
      <View style={s.ocianHeader}>
        <View style={s.ocianIcone}>
          <Text style={s.ocianIniciais}>OPC</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.ocianNome}>{time.clube}</Text>
          <Text style={s.ocianPos}>{time.posicao}º Lugar · {time.grupo}</Text>
        </View>
        <View style={s.ocianBadge}>
          <Text style={s.ocianBadgeText}>DESTAQUE</Text>
        </View>
      </View>
      <View style={s.ocianStats}>
        {stats.map(({ label, value }) => (
          <View key={label} style={s.ocianStatItem}>
            <Text style={s.ocianStatValue}>{value}</Text>
            <Text style={s.ocianStatLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Linha da tabela ───────────────────────────────────────────────────────────

function ClassificacaoRow({ time, isLast }: { time: ClassificacaoItem; isLast: boolean }) {
  const iniciais = time.clube.split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 3);
  return (
    <View style={[s.tableRow, !isLast && s.rowBorder, time.destaque && s.tableRowOcian]}>
      {time.destaque && <View style={s.ocianBorda} />}
      <Text style={[s.colPosText, time.destaque && s.ocianColor]}>{time.posicao}</Text>
      <View style={s.clubeContainer}>
        <View style={[s.clubeIcone, time.destaque && s.clubeIconeOcian]}>
          <Text style={[s.clubeIniciais, time.destaque && s.clubeIniciaisOcian]}>{iniciais}</Text>
        </View>
        <Text style={[s.tdText, s.clubeText, time.destaque && s.ocianTextBold]} numberOfLines={1}>
          {time.clube}
        </Text>
      </View>
      <Text style={[s.tdText, s.colStat, s.colDestaque, time.destaque && s.ocianColor]}>
        {time.pontos}
      </Text>
      <Text style={[s.tdText, s.colStat]}>{time.jogos}</Text>
      <Text style={[s.tdText, s.colStat]}>{time.vitorias}</Text>
      <Text style={[s.tdText, s.colStat, s.colDestaque, time.destaque && s.ocianColor]}>
        {formatSaldo(time.saldo)}
      </Text>
    </View>
  );
}

// ── Chip ──────────────────────────────────────────────────────────────────────

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.chip, active && s.chipActive]} onPress={onPress} activeOpacity={0.75}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Tabela ────────────────────────────────────────────────────────────────────

function Tabela({ times }: { times: ClassificacaoItem[] }) {
  if (times.length === 0) return null;
  return (
    <View style={s.tableContainer}>
      <View style={s.tableHeader}>
        <Text style={[s.thText, s.colPosHeader]}>POS</Text>
        <Text style={[s.thText, { flex: 1 }]}>CLUBE</Text>
        <Text style={[s.thText, s.colStatHeader]}>P</Text>
        <Text style={[s.thText, s.colStatHeader]}>J</Text>
        <Text style={[s.thText, s.colStatHeader]}>V</Text>
        <Text style={[s.thText, s.colStatHeader]}>SG</Text>
      </View>
      {times.map((time, idx) => (
        <ClassificacaoRow
          key={`${time.grupo}-${time.posicao}-${idx}`}
          time={time}
          isLast={idx === times.length - 1}
        />
      ))}
    </View>
  );
}

// ── Tela principal ────────────────────────────────────────────────────────────

export default function Campeonato() {
  // Filtros 1 e 2 — Divisão e Sub
  const [divisao,   setDivisao]   = useState<Divisao>('a3');
  const [categoria, setCategoria] = useState<Categoria>('sub12');

  // Filtro 3 — Grupo (A, B, C, Geral) — populado dinamicamente pela API
  const [grupoAtivo, setGrupoAtivo] = useState<string>(GERAL);
  const [grupos,     setGrupos]     = useState<string[]>([]); // nomes exatos vindos da API

  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [tabela,       setTabela]       = useState<ClassificacaoItem[]>([]);
  const [erro,         setErro]         = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  const carregar = useCallback(async (viaPull = false) => {
    if (viaPull) setRefreshing(true);
    else         setLoading(true);
    setErro(null);

    try {
      const filtros: FiltrosCampeonato = {
        temporada: '2026',
        titulo:    'paulista',
        divisao,
        categoria,
      };
      const dados = await fetchClassificacaoCampeonato(filtros);
      setTabela(dados);

      // Extrai grupos únicos preservando ordem de chegada da API
      const gruposUnicos = [...new Set(dados.map(t => t.grupo).filter(Boolean))];
      setGrupos(gruposUnicos);
      setAtualizadoEm(new Date());

      // Seleciona automaticamente o grupo do Ocian; fallback: Geral
      const grupoOcian = dados.find(t => t.destaque)?.grupo;
      setGrupoAtivo(grupoOcian ?? GERAL);
    } catch (e) {
        console.error('[Campeonato] Erro ao carregar:', e);
        setErro('Não foi possível carregar a classificação. Verifique sua conexão.');
      } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [divisao, categoria]);

  // Recarrega sempre que divisão ou sub mudar
  useEffect(() => { carregar(); }, [carregar]);

  // ── Dados filtrados pelo grupo ativo ─────────────────────────────────────────

  // Geral: todos os times ordenados por posição
  // Grupo específico: só os times daquele grupo
  const timesVisiveis: ClassificacaoItem[] =
    grupoAtivo === GERAL
      ? [...tabela].sort((a, b) => a.posicao - b.posicao)
      : tabela.filter(t => t.grupo === grupoAtivo);

  // Card do Ocian: busca no grupo visível; se não achar, busca em todos
  const ocian = timesVisiveis.find(t => t.destaque) ?? tabela.find(t => t.destaque) ?? null;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>
      <Header
        title="CAMPEONATO"
        icon="trophy-outline"
        showLogo={false}
        showProfile={true}
        btnNotificacao="bell"
      />

      {/* Banner */}
      <CampeonatoBanner divisao={divisao} categoria={categoria} />

      {/* ── Filtro 1: Divisão ───────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipRow} style={s.chipScroll}>
        {DIVISOES.map(d => (
          <Chip key={d} label={LABEL_DIVISAO[d]} active={divisao === d} onPress={() => setDivisao(d)} />
        ))}
      </ScrollView>

      {/* ── Filtro 2: Sub ───────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipRow} style={s.chipScroll}>
        {CATEGORIAS.map(c => (
          <Chip key={c} label={LABEL_CATEGORIA[c]} active={categoria === c} onPress={() => setCategoria(c)} />
        ))}
      </ScrollView>

      {/* ── Filtro 3: Grupo (A / B / C / Geral) ─────────
           Só aparece após carregar e se tiver mais de 1 grupo.
           Exibe letra extraída do nome (ex: "GRUPO C" → "C").
           "Geral" sempre aparece no fim.                      */}
      {!loading && grupos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.grupoRow} style={s.grupoScroll}>
          {grupos.map(g => (
            <TouchableOpacity
              key={g}
              style={[s.grupoTab, grupoAtivo === g && s.grupoTabAtivo]}
              onPress={() => setGrupoAtivo(g)}
              activeOpacity={0.75}
            >
              <Text style={[s.grupoTabText, grupoAtivo === g && s.grupoTabTextAtivo]}>
                {letraDoGrupo(g)}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[s.grupoTab, grupoAtivo === GERAL && s.grupoTabAtivo]}
            onPress={() => setGrupoAtivo(GERAL)}
            activeOpacity={0.75}
          >
            <Text style={[s.grupoTabText, grupoAtivo === GERAL && s.grupoTabTextAtivo]}>
              Geral
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Conteúdo ─────────────────────────────────────── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => carregar(true)} tintColor={colors.primary} />
        }
      >
        {atualizadoEm && (
          <Text style={s.atualizadoText}>Atualizado {tempoDesde(atualizadoEm)}</Text>
        )}

        {loading ? (
          <>
            <View style={[s.ocianCard, { opacity: 0.4 }]}>
              <View style={[s.skeleton, { width: 200, height: 18, marginBottom: 10 }]} />
              <View style={[s.skeleton, { width: 120, height: 13, marginBottom: 18 }]} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[0,1,2,3,4].map(i => (
                  <View key={i} style={[s.skeleton, { flex: 1, height: 44, borderRadius: 10 }]} />
                ))}
              </View>
            </View>
            <View style={[s.tableContainer, { marginHorizontal: MARGIN }]}>
              {[0,1,2,3,4].map(i => <SkeletonRow key={i} />)}
            </View>
          </>
        ) : erro ? (
          <View style={s.emptyState}>
            <Ionicons name="warning-outline" size={48} color={colors.text_secondary} style={{ marginBottom: 16 }} />
            <Text style={s.emptyTitle}>Ops!</Text>
            <Text style={s.emptyText}>{erro}</Text>
          </View>
        ) : tabela.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="trophy-outline" size={48} color={colors.text_secondary} style={{ marginBottom: 16 }} />
            <Text style={s.emptyTitle}>Classificação não disponível</Text>
            <Text style={s.emptyText}>Puxe para baixo para atualizar ou tente outra categoria.</Text>
          </View>
        ) : (
          <>
            {/* Card do Ocian — visível em qualquer aba */}
            {ocian && <OcianCard time={ocian} />}

            {/* Tabela única do grupo/geral selecionado */}
            <Tabela times={timesVisiveis.filter(t => !t.destaque)} />

            <View style={{ height: 8 }} />
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content:   { paddingTop: 8, paddingBottom: 40 },

  atualizadoText: {
    fontFamily: 'Creato-Regular', color: colors.text_secondary,
    fontSize: 11, textAlign: 'center', marginBottom: 12, letterSpacing: 0.5,
  },

  // ── Banner ──────────────────────────────────────────────
  banner: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: MARGIN, marginTop: 12, marginBottom: 12,
    backgroundColor: '#141414', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#2a2a2a', gap: 12,
  },
  bannerIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#0e78ff18', justifyContent: 'center', alignItems: 'center',
  },
  bannerCampeonato: { fontFamily: 'Creato-Bold', color: colors.text, fontSize: 15, letterSpacing: 1 },
  bannerSub: { fontFamily: 'Creato-Regular', color: colors.text_secondary, fontSize: 11, marginTop: 2, letterSpacing: 0.4 },

  // ── Filtros 1 e 2 (Divisão / Sub) ──────────────────────
  chipScroll: { flexGrow: 0, flexShrink: 0, marginBottom: 8 },
  chipRow: { paddingHorizontal: MARGIN, paddingVertical: 4, gap: 8, flexDirection: 'row', alignItems: 'center' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2a2a2a',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: 'Creato-Bold', color: colors.text_secondary, fontSize: 12, letterSpacing: 0.4 },
  chipTextActive: { color: '#fff' },

  // ── Filtro 3 (Grupo: A / B / C / Geral) ────────────────
  grupoScroll: { flexGrow: 0, flexShrink: 0, marginBottom: 12 },
  grupoRow: { paddingHorizontal: MARGIN, gap: 6, flexDirection: 'row', alignItems: 'center' },
  grupoTab: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2a2a2a',
    minWidth: 52, alignItems: 'center',
  },
  grupoTabAtivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  grupoTabText: { fontFamily: 'Creato-Bold', color: colors.text_secondary, fontSize: 13, letterSpacing: 0.4 },
  grupoTabTextAtivo: { color: '#fff' },

  // ── Card Ocian ──────────────────────────────────────────
  ocianCard: {
    marginHorizontal: MARGIN, backgroundColor: '#0e78ff0f', borderRadius: 16,
    borderWidth: 1, borderColor: '#0e78ff44', padding: 18, marginBottom: 16, marginTop: 4,
  },
  ocianHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  ocianIcone: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#0e78ff33', justifyContent: 'center', alignItems: 'center',
  },
  ocianIniciais: { fontFamily: 'Creato-Bold', color: colors.azulClaro, fontSize: 11, letterSpacing: 0.5 },
  ocianNome: { fontFamily: 'Creato-Bold', color: colors.text, fontSize: 15 },
  ocianPos:  { fontFamily: 'Creato-Regular', color: colors.azulClaro, fontSize: 12, marginTop: 2 },
  ocianBadge: {
    backgroundColor: '#0e78ff22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: '#0e78ff44',
  },
  ocianBadgeText: { fontFamily: 'Creato-Bold', color: colors.azulClaro, fontSize: 9, letterSpacing: 1.2 },
  ocianStats: { flexDirection: 'row', gap: 6 },
  ocianStatItem: { flex: 1, backgroundColor: '#0e78ff18', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  ocianStatValue: { fontFamily: 'Creato-Bold', color: colors.text, fontSize: 15 },
  ocianStatLabel: { fontFamily: 'Creato-Bold', color: colors.text_secondary, fontSize: 9, letterSpacing: 1, marginTop: 2 },

  // ── Tabela ──────────────────────────────────────────────
  tableContainer: {
    marginHorizontal: MARGIN, backgroundColor: '#1A1A1A', borderRadius: 16,
    overflow: 'hidden', borderWidth: 1, borderColor: '#2a2a2a',
  },
  tableHeader: {
    flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: '#111111', alignItems: 'center',
  },
  thText: { fontFamily: 'Creato-Bold', color: colors.text_secondary, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  colPosHeader:  { width: 36, paddingLeft: 4 },
  colStatHeader: { width: 28, textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 14, alignItems: 'center' },
  tableRowOcian: { backgroundColor: '#0e78ff10' },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#252525' },
  ocianBorda: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: colors.primary ?? '#0e78ff', borderRadius: 2 },

  // ── Células ─────────────────────────────────────────────
  tdText:      { fontFamily: 'Creato-Regular', color: colors.text, fontSize: 13 },
  colPosText:  { fontFamily: 'Creato-Bold', color: colors.text_secondary, fontSize: 13, width: 36, paddingLeft: 4 },
  colStat:     { width: 28, textAlign: 'center' },
  colDestaque: { fontFamily: 'Creato-Bold', fontSize: 13 },
  ocianColor:  { color: colors.azulClaro },

  // ── Clube ───────────────────────────────────────────────
  clubeContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  clubeIcone: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  clubeIconeOcian: { backgroundColor: '#0e78ff22' },
  clubeIniciais: { fontFamily: 'Creato-Bold', color: colors.text_secondary, fontSize: 9 },
  clubeIniciaisOcian: { color: colors.azulClaro },
  clubeText: { fontFamily: 'Creato-Regular', color: colors.text, fontSize: 13, flexShrink: 1 },
  ocianTextBold: { fontFamily: 'Creato-Bold', color: colors.text },

  // ── Empty / Erro ────────────────────────────────────────
  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontFamily: 'Creato-Bold', color: colors.text, fontSize: 16, marginBottom: 8, textAlign: 'center' },
  emptyText: { fontFamily: 'Creato-Regular', color: colors.text_secondary, fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // ── Skeleton ────────────────────────────────────────────
  skeleton: { height: 14, borderRadius: 6, backgroundColor: '#2a2a2a' },
});