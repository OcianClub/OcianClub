import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  ActivityIndicator, Alert, Image, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';
import { styles } from '@/src/styles/detalhesPartidaStyles';
import {
  atualizarStatusPartida,
  atualizarPlacarPartida,
  criarEvento,
  fetchEscalacaoPartida,
  salvarEscalacaoPartida,
  fetchJogadoresParaEscalacao,
} from '@/src/services/api';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Partida {
  id: number;
  mandante:       { id: number; nome: string; escudo: string | null };
  visitante:      { id: number; nome: string; escudo: string | null };
  gols_mandante:  number;
  gols_visitante: number;
  data:           string;
  horario:        string | null;
  local:          string | null;
  status:         'AGENDADA' | 'AO_VIVO' | 'FINALIZADA';
  emCasa:         boolean;
  categoria:      { id: number; nome: string } | null;
  competicao?:    { id: number; nome: string } | null;
  competicao_id?: number | null;
}

interface JogadorEscalado {
  id:         number;
  jogador_id: number;
  numCamisa:  number;
  titular:    boolean;
  jogador: {
    nome:      string;
    posicao:   string;
    numCamisa: number | null;
  };
}

interface JogadorDisponivel {
  id_jogador: number;
  nome:       string;
  posicao:    string;
  numCamisa:  number | null;
}

type TipoEvento = 'GOL' | 'CARTAO_AMARELO' | 'CARTAO_VERMELHO' | 'FALTA' | 'DEFESA' | 'ASSISTENCIA';
type Periodo    = '1T' | '2T' | 'PRORROGACAO';

interface Props {
  partida:  Partida;
  isAdmin:  boolean;
  onBack:   () => void;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PERIODOS: { label: string; value: Periodo }[] = [
  { label: '1º Tempo',    value: '1T' },
  { label: '2º Tempo',    value: '2T' },
  { label: 'Prorrogação', value: 'PRORROGACAO' },
];

// Minuto base para cada período — usado no evento registrado
const MINUTOS_POR_PERIODO: Record<Periodo, number> = {
  '1T': 0, '2T': 20, 'PRORROGACAO': 40,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function LogoTime({ uri, size = 56 }: { uri: string | null; size?: number }) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: 10, resizeMode: 'contain', backgroundColor: '#1e1e1e' }}
      />
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: 10, backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' }}>
      <MaterialCommunityIcons name="shield-outline" size={size * 0.5} color="#333" />
    </View>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DetalhesPartida({ partida: partidaInicial, isAdmin, onBack }: Props) {
  const [partida, setPartida]             = useState<Partida>(partidaInicial);
  const [golsMandante, setGolsMandante]   = useState(partidaInicial.gols_mandante);
  const [golsVisitante, setGolsVisitante] = useState(partidaInicial.gols_visitante);

  // Período como stepper (índice 0-2)
  const [periodoIdx, setPeriodoIdx]       = useState(0);
  const periodo: Periodo                  = PERIODOS[periodoIdx].value;

  const [salvandoPlacar, setSalvandoPlacar] = useState(false);

  // Escalação
  const [escalacao, setEscalacao]           = useState<JogadorEscalado[]>([]);
  const [disponiveis, setDisponiveis]       = useState<JogadorDisponivel[]>([]);
  const [carregandoEscalacao, setCarregandoEscalacao] = useState(false);

  // Modal seletor de jogador para evento
  const [modalEvento, setModalEvento]       = useState<{ tipo: TipoEvento; label: string } | null>(null);
  const [jogadorEvento, setJogadorEvento]   = useState<JogadorEscalado | null>(null);
  const [salvandoEvento, setSalvandoEvento] = useState(false);

  // Modal alterar escalação
  const [modalEscalacao, setModalEscalacao] = useState(false);
  const [selecionados, setSelecionados]     = useState<Set<number>>(new Set());
  const [titulares, setTitulares]           = useState<Set<number>>(new Set());
  const [salvandoEscalacao, setSalvandoEscalacao] = useState(false);

  // Modal confirmar finalizar
  const [modalFinalizar, setModalFinalizar] = useState(false);

  // Modo edição (partida finalizada)
  const [modoEdicao, setModoEdicao]         = useState(false);

  // ── Verifica auto-início da partida ao abrir a tela ──────────────────────
  // Se a partida está AGENDADA mas o horário marcado já passou, passa p/ AO_VIVO
  useEffect(() => {
    if (partida.status !== 'AGENDADA' || !isAdmin) return;
    if (!partida.horario || !partida.data) return;

    try {
      // data vem como "2025-05-22" — monta datetime local
      const dataStr  = typeof partida.data === 'string'
        ? partida.data.slice(0, 10)
        : new Date(partida.data).toISOString().slice(0, 10);
      const horaStr  = partida.horario; // "22:04"
      const dataHora = new Date(`${dataStr}T${horaStr}:00`);
      const agora    = new Date();

      if (agora >= dataHora) {
        // Atualiza silenciosamente no backend
        atualizarStatusPartida(partida.id, 'AO_VIVO')
          .then(() => setPartida(prev => ({ ...prev, status: 'AO_VIVO' })))
          .catch(() => { /* ignora — o admin pode iniciar manualmente */ });
      }
    } catch {
      // ignora erros de parsing de data
    }
  }, []); // só roda uma vez ao montar

  // ── Carrega escalação e disponíveis ──────────────────────────────────────

  const carregarEscalacao = useCallback(async () => {
    if (!partida.id) return;
    setCarregandoEscalacao(true);
    try {
      const data = await fetchEscalacaoPartida(partida.id);
      setEscalacao(data);
    } catch {
      // escalação vazia ok
    } finally {
      setCarregandoEscalacao(false);
    }
  }, [partida.id]);

  /**
   * Carrega a lista de jogadores disponíveis para escalação.
   * USA fetchJogadoresParaEscalacao que prioriza o elenco inscrito
   * no campeonato (CompeticaoJogador) quando há competicao_id.
   */
  const carregarDisponiveis = useCallback(async () => {
    if (!partida.categoria?.id) return;

    // Resolve o competicao_id a partir de múltiplas fontes possíveis
    const compId =
      partida.competicao_id ??
      (partida.competicao as any)?.id ??
      null;

    try {
      const data = await fetchJogadoresParaEscalacao(
        partida.categoria.id,
        compId,
      );
      setDisponiveis(data);
    } catch (e: any) {
      // Sem disponíveis é crítico — avisa o admin
      if (isAdmin) {
        Alert.alert(
          'Atenção',
          e.message || 'Não foi possível carregar o elenco para escalação.',
        );
      }
    }
  }, [partida.categoria?.id, partida.competicao_id, partida.competicao]);

  useEffect(() => {
    carregarEscalacao();
    carregarDisponiveis();
  }, [carregarEscalacao, carregarDisponiveis]);

  // ── Iniciar partida (manual) ───────────────────────────────────────────────

  const iniciarPartida = async () => {
    try {
      await atualizarStatusPartida(partida.id, 'AO_VIVO');
      setPartida(prev => ({ ...prev, status: 'AO_VIVO' }));
    } catch {
      Alert.alert('Erro', 'Não foi possível iniciar a partida.');
    }
  };

  // ── Placar ─────────────────────────────────────────────────────────────────

  const salvarPlacar = async (novoMandante: number, novoVisitante: number) => {
    setSalvandoPlacar(true);
    try {
      await atualizarPlacarPartida(partida.id, novoMandante, novoVisitante);
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar o placar.');
    } finally {
      setSalvandoPlacar(false);
    }
  };

  const alterarGol = (lado: 'mandante' | 'visitante', delta: number) => {
    if (!isAdmin) return;
    if (lado === 'mandante') {
      const novo = Math.max(0, golsMandante + delta);
      setGolsMandante(novo);
      salvarPlacar(novo, golsVisitante);
    } else {
      const novo = Math.max(0, golsVisitante + delta);
      setGolsVisitante(novo);
      salvarPlacar(golsMandante, novo);
    }
  };

  // ── Evento de jogador ─────────────────────────────────────────────────────

  const confirmarEvento = async () => {
    if (!modalEvento || !jogadorEvento) return;
    setSalvandoEvento(true);
    try {
      const minutoBase = MINUTOS_POR_PERIODO[periodo];
      await criarEvento(partida.id, {
        tipo:       modalEvento.tipo,
        minuto:     minutoBase + 1, // 1 como valor simbólico dentro do período
        jogador_id: jogadorEvento.jogador_id,
        doOcian:    true,
      });
      // Se for gol, atualiza placar automaticamente
      if (modalEvento.tipo === 'GOL') {
        const novoMandante  = partida.emCasa ? golsMandante + 1 : golsMandante;
        const novoVisitante = !partida.emCasa ? golsVisitante + 1 : golsVisitante;
        setGolsMandante(novoMandante);
        setGolsVisitante(novoVisitante);
        await atualizarPlacarPartida(partida.id, novoMandante, novoVisitante);
      }
      setModalEvento(null);
      setJogadorEvento(null);
    } catch {
      Alert.alert('Erro', 'Não foi possível registrar o evento.');
    } finally {
      setSalvandoEvento(false);
    }
  };

  // ── Escalação ──────────────────────────────────────────────────────────────

  const abrirModalEscalacao = () => {
    const ids  = new Set(escalacao.map(e => e.jogador_id));
    const tits = new Set(escalacao.filter(e => e.titular).map(e => e.jogador_id));
    setSelecionados(ids);
    setTitulares(tits);
    setModalEscalacao(true);
  };

  const toggleJogador = (id: number) => {
    setSelecionados(prev => {
      const nova = new Set(prev);
      if (nova.has(id)) {
        nova.delete(id);
        setTitulares(t => { const nt = new Set(t); nt.delete(id); return nt; });
      } else {
        nova.add(id);
      }
      return nova;
    });
  };

  const toggleTitular = (id: number) => {
    if (!selecionados.has(id)) return;
    setTitulares(prev => {
      const nova = new Set(prev);
      if (nova.has(id)) nova.delete(id); else nova.add(id);
      return nova;
    });
  };

  const confirmarEscalacao = async () => {
    const jogadoresSelecionados = Array.from(selecionados);
    if (jogadoresSelecionados.length === 0) {
      Alert.alert('Atenção', 'Selecione ao menos um jogador.');
      return;
    }
    setSalvandoEscalacao(true);
    try {
      const payload = jogadoresSelecionados.map(id => {
        const disp = disponiveis.find(d => d.id_jogador === id);
        return {
          jogador_id: id,
          numCamisa:  disp?.numCamisa ?? 0,
          titular:    titulares.has(id),
        };
      });
      await salvarEscalacaoPartida(partida.id, payload);
      await carregarEscalacao();
      setModalEscalacao(false);
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível salvar a escalação.');
    } finally {
      setSalvandoEscalacao(false);
    }
  };

  // ── Finalizar ──────────────────────────────────────────────────────────────

  const finalizarPartida = async () => {
    setModalFinalizar(false);
    try {
      await atualizarStatusPartida(partida.id, 'FINALIZADA');
      setPartida(prev => ({ ...prev, status: 'FINALIZADA' }));
    } catch {
      Alert.alert('Erro', 'Não foi possível finalizar a partida.');
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const emCampo  = escalacao.filter(e => e.titular);
  const reservas = escalacao.filter(e => !e.titular);

  const EVENTO_CARDS: { tipo: TipoEvento; label: string; icon: React.ReactNode }[] = [
    {
      tipo:  'CARTAO_AMARELO',
      label: 'Amarelo',
      icon:  <View style={{ width: 16, height: 22, borderRadius: 3, backgroundColor: colors.amarelo }} />,
    },
    {
      tipo:  'CARTAO_VERMELHO',
      label: 'Vermelho',
      icon:  <View style={{ width: 16, height: 22, borderRadius: 3, backgroundColor: colors.vermelho }} />,
    },
    {
      tipo:  'FALTA',
      label: 'Falta',
      icon:  <MaterialCommunityIcons name="whistle" size={22} color={colors.text_secondary} />,
    },
    {
      tipo:  'DEFESA',
      label: 'Defesa',
      icon:  <MaterialCommunityIcons name="shield-check" size={22} color={colors.azulClaro} />,
    },
    {
      tipo:  'ASSISTENCIA',
      label: 'Assistência',
      icon:  <MaterialCommunityIcons name="shoe-cleat" size={22} color={colors.primary} />,
    },
  ];

  return (
    <SafeAreaView style={styles.root}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBackBtn} onPress={onBack}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>DETALHES DA PARTIDA</Text>
        {isAdmin && partida.status === 'FINALIZADA' && (
          <TouchableOpacity style={styles.headerEditBtn} onPress={() => setModoEdicao(!modoEdicao)}>
            <Text style={styles.headerEditBtnText}>{modoEdicao ? 'CONCLUIR' : 'EDITAR'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ── Hero Placar ──────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.heroCatRow}>
            <Text style={styles.heroCatText}>{partida.categoria?.nome ?? '—'}</Text>
            <View style={styles.heroDot} />
            <Text style={styles.heroCatText}>
              {partida.data
                ? new Date(partida.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                : '—'}
            </Text>
          </View>

          <View style={styles.heroTeamsRow}>
            {/* Mandante */}
            <View style={styles.heroTeamCol}>
              <LogoTime uri={partida.mandante.escudo} size={64} />
              <Text style={styles.heroTeamName} numberOfLines={2}>{partida.mandante.nome}</Text>
            </View>

            {/* Placar */}
            <View style={styles.heroScoreBlock}>
              {partida.status === 'AGENDADA' ? (
                <Text style={styles.heroVs}>VS</Text>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {/* Stepper mandante — só admin e ao vivo */}
                  {isAdmin && partida.status === 'AO_VIVO' ? (
                    <View style={{ alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity
                        style={[styles.stepBtn, { width: 32, height: 32, borderRadius: 8 }]}
                        onPress={() => alterarGol('mandante', 1)}
                      >
                        <MaterialCommunityIcons name="plus" size={18} color="#fff" />
                      </TouchableOpacity>
                      <Text style={styles.heroScoreText}>{golsMandante}</Text>
                      <TouchableOpacity
                        style={[styles.stepBtn, styles.stepBtnMinus, { width: 32, height: 32, borderRadius: 8 }]}
                        onPress={() => alterarGol('mandante', -1)}
                      >
                        <MaterialCommunityIcons name="minus" size={18} color={colors.text_secondary} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.heroScoreText}>{golsMandante}</Text>
                  )}

                  <View style={styles.heroScoreSeparator} />

                  {/* Stepper visitante */}
                  {isAdmin && partida.status === 'AO_VIVO' ? (
                    <View style={{ alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity
                        style={[styles.stepBtn, { width: 32, height: 32, borderRadius: 8 }]}
                        onPress={() => alterarGol('visitante', 1)}
                      >
                        <MaterialCommunityIcons name="plus" size={18} color="#fff" />
                      </TouchableOpacity>
                      <Text style={styles.heroScoreText}>{golsVisitante}</Text>
                      <TouchableOpacity
                        style={[styles.stepBtn, styles.stepBtnMinus, { width: 32, height: 32, borderRadius: 8 }]}
                        onPress={() => alterarGol('visitante', -1)}
                      >
                        <MaterialCommunityIcons name="minus" size={18} color={colors.text_secondary} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.heroScoreText}>{golsVisitante}</Text>
                  )}
                </View>
              )}

              {/* Badge de status */}
              {partida.status === 'AO_VIVO' && (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveBadgeText}>AO VIVO</Text>
                </View>
              )}
              {partida.status === 'FINALIZADA' && (
                <View style={styles.finishedBadge}>
                  <Text style={styles.finishedBadgeText}>ENCERRADO</Text>
                </View>
              )}
              {partida.status === 'AGENDADA' && (
                <View style={styles.scheduledBadge}>
                  <Text style={styles.scheduledBadgeText}>{partida.horario ?? 'AGENDADO'}</Text>
                </View>
              )}
            </View>

            {/* Visitante */}
            <View style={styles.heroTeamCol}>
              <LogoTime uri={partida.visitante.escudo} size={64} />
              <Text style={styles.heroTeamName} numberOfLines={2}>{partida.visitante.nome}</Text>
            </View>
          </View>
        </View>

        {/* ── Info bar ──────────────────────────────────────────────────────── */}
        <View style={styles.infoBar}>
          <View style={styles.infoBarItem}>
            <MaterialCommunityIcons name="map-marker-outline" size={16} color={colors.text_secondary} />
            <Text style={styles.infoBarLabel}>Local</Text>
            <Text style={styles.infoBarValue} numberOfLines={1}>{partida.local ?? 'Não definido'}</Text>
          </View>
          <View style={styles.infoBarDivider} />
          <View style={styles.infoBarItem}>
            <MaterialCommunityIcons name="clock-outline" size={16} color={colors.text_secondary} />
            <Text style={styles.infoBarLabel}>Horário</Text>
            <Text style={styles.infoBarValue}>{partida.horario ?? '--:--'}</Text>
          </View>
          <View style={styles.infoBarDivider} />
          <View style={styles.infoBarItem}>
            <MaterialCommunityIcons
              name={partida.emCasa ? 'home-outline' : 'bus'}
              size={16}
              color={colors.text_secondary}
            />
            <Text style={styles.infoBarLabel}>Mando</Text>
            <Text style={styles.infoBarValue}>{partida.emCasa ? 'Casa' : 'Fora'}</Text>
          </View>
        </View>

        {/* ════════════════════════════════════════════════════
            SEÇÃO: AGENDADA — botão iniciar partida
        ════════════════════════════════════════════════════ */}
        {partida.status === 'AGENDADA' && isAdmin && (
          <View style={styles.section}>
            <TouchableOpacity
              style={[styles.finalizarBtn, { borderColor: colors.primary + '55', backgroundColor: colors.primary + '14' }]}
              onPress={iniciarPartida}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <MaterialCommunityIcons name="play-circle-outline" size={22} color={colors.primary} />
                <Text style={[styles.finalizarBtnText, { color: colors.primary }]}>INICIAR PARTIDA</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ════════════════════════════════════════════════════
            SEÇÃO: AO VIVO — período (stepper) e cards de evento
        ════════════════════════════════════════════════════ */}
        {partida.status === 'AO_VIVO' && isAdmin && (
          <>
            {/* ── Período como stepper ── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionBar} />
                  <Text style={styles.sectionTitle}>PERÍODO</Text>
                </View>
              </View>

              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#1a1a1a',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.primary + '44',
                paddingVertical: 14,
                paddingHorizontal: 16,
              }}>
                {/* Botão anterior */}
                <TouchableOpacity
                  onPress={() => setPeriodoIdx(i => Math.max(0, i - 1))}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: periodoIdx === 0 ? '#2a2a2a' : colors.primary + '22',
                    borderWidth: 1,
                    borderColor: periodoIdx === 0 ? '#333' : colors.primary + '66',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  disabled={periodoIdx === 0}
                >
                  <MaterialCommunityIcons
                    name="chevron-left"
                    size={22}
                    color={periodoIdx === 0 ? '#444' : colors.primary}
                  />
                </TouchableOpacity>

                {/* Label do período atual */}
                <View style={{ alignItems: 'center', gap: 4 }}>
                  <Text style={{
                    fontFamily: 'Creato-Bold',
                    color: colors.primary,
                    fontSize: 18,
                    letterSpacing: 1,
                  }}>
                    {PERIODOS[periodoIdx].label.toUpperCase()}
                  </Text>
                  <Text style={{
                    fontFamily: 'Creato-Regular',
                    color: colors.text_secondary,
                    fontSize: 11,
                    letterSpacing: 0.5,
                  }}>
                    {periodoIdx + 1} / {PERIODOS.length}
                  </Text>
                </View>

                {/* Botão próximo */}
                <TouchableOpacity
                  onPress={() => setPeriodoIdx(i => Math.min(PERIODOS.length - 1, i + 1))}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: periodoIdx === PERIODOS.length - 1 ? '#2a2a2a' : colors.primary + '22',
                    borderWidth: 1,
                    borderColor: periodoIdx === PERIODOS.length - 1 ? '#333' : colors.primary + '66',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  disabled={periodoIdx === PERIODOS.length - 1}
                >
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={22}
                    color={periodoIdx === PERIODOS.length - 1 ? '#444' : colors.primary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Cards de evento */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionBar} />
                  <Text style={styles.sectionTitle}>REGISTRAR EVENTO</Text>
                </View>
              </View>

              <View style={styles.eventsGrid}>
                {/* Card Gol do Jogador (grande, azul) */}
                <TouchableOpacity
                  style={styles.golCard}
                  activeOpacity={0.8}
                  onPress={() => setModalEvento({ tipo: 'GOL', label: 'Gol do Jogador' })}
                >
                  <View style={styles.golLeft}>
                    <View style={styles.golIconWrap}>
                      <MaterialCommunityIcons name="soccer" size={22} color={colors.primary} />
                    </View>
                    <View>
                      <Text style={styles.golLabel}>Gol</Text>
                      <Text style={styles.golSub}>Selecionar jogador →</Text>
                    </View>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={colors.primary} />
                </TouchableOpacity>

                {/* Grid 2x2 */}
                <View style={styles.eventsRow}>
                  {EVENTO_CARDS.slice(0, 2).map(card => (
                    <TouchableOpacity
                      key={card.tipo}
                      style={styles.eventCard}
                      activeOpacity={0.8}
                      onPress={() => setModalEvento({ tipo: card.tipo, label: card.label })}
                    >
                      <View style={styles.eventIconWrap}>{card.icon}</View>
                      <Text style={styles.eventLabel}>{card.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.eventsRow}>
                  {EVENTO_CARDS.slice(2, 4).map(card => (
                    <TouchableOpacity
                      key={card.tipo}
                      style={styles.eventCard}
                      activeOpacity={0.8}
                      onPress={() => setModalEvento({ tipo: card.tipo, label: card.label })}
                    >
                      <View style={styles.eventIconWrap}>{card.icon}</View>
                      <Text style={styles.eventLabel}>{card.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Card central — Assistência */}
                <TouchableOpacity
                  style={styles.eventCardCenter}
                  activeOpacity={0.8}
                  onPress={() => setModalEvento({ tipo: EVENTO_CARDS[4].tipo, label: EVENTO_CARDS[4].label })}
                >
                  <View style={styles.eventIconWrap}>{EVENTO_CARDS[4].icon}</View>
                  <Text style={styles.eventLabel}>{EVENTO_CARDS[4].label}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* ════════════════════════════════════════════════════
            SEÇÃO: ESCALAÇÃO (ao vivo + finalizada)
        ════════════════════════════════════════════════════ */}
        {(partida.status === 'AO_VIVO' || partida.status === 'FINALIZADA') && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.sectionBar} />
                <Text style={styles.sectionTitle}>ESCALAÇÃO</Text>
              </View>
              {isAdmin && (partida.status === 'AO_VIVO' || modoEdicao) && (
                <TouchableOpacity onPress={abrirModalEscalacao}>
                  <Text style={styles.sectionAction}>ALTERAR</Text>
                </TouchableOpacity>
              )}
            </View>

            {carregandoEscalacao ? (
              <ActivityIndicator color={colors.primary} />
            ) : escalacao.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 20, gap: 8 }}>
                <MaterialCommunityIcons name="account-group-outline" size={40} color="#333" />
                <Text style={{ fontFamily: 'Creato-Regular', color: '#444', fontSize: 13 }}>
                  Nenhum jogador escalado
                </Text>
                {isAdmin && partida.status === 'AO_VIVO' && (
                  <TouchableOpacity
                    style={{
                      marginTop: 8,
                      borderWidth: 1,
                      borderColor: colors.primary,
                      borderRadius: 10,
                      paddingVertical: 10,
                      paddingHorizontal: 20,
                    }}
                    onPress={abrirModalEscalacao}
                  >
                    <Text style={{ fontFamily: 'Creato-Bold', color: colors.primary, fontSize: 13 }}>
                      DEFINIR ESCALAÇÃO
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <>
                {emCampo.length > 0 && (
                  <>
                    <Text style={{
                      fontFamily: 'Creato-Bold',
                      color: colors.azulClaro,
                      fontSize: 11,
                      letterSpacing: 1.2,
                      marginBottom: 8,
                    }}>
                      EM CAMPO
                    </Text>
                    {emCampo.map(j => (
                      <JogadorRow key={j.id} escalado={j} partida={partida} isAdmin={isAdmin} />
                    ))}
                  </>
                )}
                {reservas.length > 0 && (
                  <>
                    <Text style={{
                      fontFamily: 'Creato-Bold',
                      color: colors.text_secondary,
                      fontSize: 11,
                      letterSpacing: 1.2,
                      marginTop: 12,
                      marginBottom: 8,
                    }}>
                      RESERVAS
                    </Text>
                    {reservas.map(j => (
                      <JogadorRow key={j.id} escalado={j} partida={partida} isAdmin={isAdmin} />
                    ))}
                  </>
                )}
              </>
            )}
          </View>
        )}

        {/* ════════════════════════════════════════════════════
            SEÇÃO: BOTÃO FINALIZAR (ao vivo)
        ════════════════════════════════════════════════════ */}
        {partida.status === 'AO_VIVO' && isAdmin && (
          <View style={styles.finalizarSection}>
            <TouchableOpacity style={styles.finalizarBtn} onPress={() => setModalFinalizar(true)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <MaterialCommunityIcons name="flag-checkered" size={20} color={colors.vermelho} />
                <Text style={styles.finalizarBtnText}>FINALIZAR PARTIDA</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ══════════════════════════════════════════════════════
          MODAL: Seletor de jogador para evento
      ══════════════════════════════════════════════════════ */}
      <Modal
        visible={!!modalEvento}
        transparent
        animationType="slide"
        onRequestClose={() => { setModalEvento(null); setJogadorEvento(null); }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '85%' }]}>
            <View style={styles.modalHandle} />

            {!jogadorEvento ? (
              /* Passo 1: selecionar jogador */
              <>
                <Text style={{ fontFamily: 'Creato-Bold', color: colors.text, fontSize: 16, marginBottom: 4 }}>
                  {modalEvento?.label}
                </Text>
                <Text style={{ fontFamily: 'Creato-Regular', color: colors.text_secondary, fontSize: 13, marginBottom: 16 }}>
                  Quem fez?
                </Text>

                {emCampo.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                    <MaterialCommunityIcons name="account-off-outline" size={40} color="#333" />
                    <Text style={{ fontFamily: 'Creato-Regular', color: '#555', fontSize: 13, textAlign: 'center' }}>
                      Nenhum jogador em campo.{'\n'}Defina a escalação primeiro.
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={emCampo}
                    keyExtractor={item => String(item.id)}
                    style={{ maxHeight: 400 }}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[styles.jogadorSelectRow, { marginBottom: 8 }]}
                        onPress={() => setJogadorEvento(item)}
                      >
                        <View style={[styles.jogadorNumero, { width: 32, height: 32, borderRadius: 8 }]}>
                          <Text style={styles.jogadorNumeroText}>{item.numCamisa}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.jogadorSelectNome}>{item.jogador.nome}</Text>
                          <Text style={styles.jogadorSelectPos}>{item.jogador.posicao}</Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.text_secondary} />
                      </TouchableOpacity>
                    )}
                  />
                )}

                <TouchableOpacity
                  style={{ marginTop: 12, alignItems: 'center', paddingVertical: 12 }}
                  onPress={() => setModalEvento(null)}
                >
                  <Text style={{ fontFamily: 'Creato-Bold', color: colors.text_secondary, fontSize: 13 }}>
                    CANCELAR
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              /* Passo 2: confirmar evento */
              <>
                <View style={styles.modalJogadorHeader}>
                  <View style={styles.modalJogadorNum}>
                    <Text style={styles.modalJogadorNumText}>{jogadorEvento.numCamisa}</Text>
                  </View>
                  <View>
                    <Text style={styles.modalJogadorNome}>{jogadorEvento.jogador.nome}</Text>
                    <Text style={styles.modalJogadorPos}>{jogadorEvento.jogador.posicao}</Text>
                  </View>
                </View>

                <Text style={{ fontFamily: 'Creato-Regular', color: colors.text_secondary, fontSize: 13, marginBottom: 20 }}>
                  Registrar{' '}
                  <Text style={{ fontFamily: 'Creato-Bold', color: colors.text }}>{modalEvento?.label}</Text>
                  {' '}para este jogador?
                </Text>

                <Text style={{ fontFamily: 'Creato-Regular', color: colors.text_secondary, fontSize: 12, marginBottom: 6 }}>
                  Período: {PERIODOS[periodoIdx].label}
                </Text>

                <TouchableOpacity
                  style={[styles.saveStatBtn, salvandoEvento && { opacity: 0.6 }]}
                  onPress={confirmarEvento}
                  disabled={salvandoEvento}
                >
                  {salvandoEvento
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.saveStatBtnText}>CONFIRMAR</Text>
                  }
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ marginTop: 10, alignItems: 'center', paddingVertical: 12 }}
                  onPress={() => setJogadorEvento(null)}
                >
                  <Text style={{ fontFamily: 'Creato-Bold', color: colors.text_secondary, fontSize: 13 }}>
                    ← VOLTAR
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════
          MODAL: Alterar Escalação
      ══════════════════════════════════════════════════════ */}
      <Modal
        visible={modalEscalacao}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setModalEscalacao(false)}
      >
        <SafeAreaView style={styles.fullModal}>
          <View style={styles.fullModalHeader}>
            <TouchableOpacity onPress={() => setModalEscalacao(false)}>
              <MaterialCommunityIcons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.fullModalTitle}>ALTERAR ESCALAÇÃO</Text>
            <Text style={{ fontFamily: 'Creato-Regular', color: colors.text_secondary, fontSize: 12 }}>
              {selecionados.size} sel. · {titulares.size} titular(es)
            </Text>
          </View>

          {disponiveis.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 }}>
              <MaterialCommunityIcons name="account-group-outline" size={48} color="#333" />
              <Text style={{ fontFamily: 'Creato-Bold', color: colors.text_secondary, fontSize: 14, textAlign: 'center' }}>
                Nenhum jogador encontrado
              </Text>
              <Text style={{ fontFamily: 'Creato-Regular', color: '#444', fontSize: 12, textAlign: 'center' }}>
                {partida.competicao_id
                  ? 'Verifique se o elenco foi inscrito nessa competição em Equipes → Campeonatos.'
                  : 'Nenhum jogador cadastrado nessa categoria.'}
              </Text>
            </View>
          ) : (
            <>
              <Text style={{
                fontFamily: 'Creato-Regular',
                color: colors.text_secondary,
                fontSize: 12,
                paddingHorizontal: 16,
                paddingBottom: 8,
              }}>
                Toque para incluir/remover · Toque em "T" para marcar como titular
              </Text>

              <FlatList
                data={disponiveis}
                keyExtractor={item => String(item.id_jogador)}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                renderItem={({ item }) => {
                  const sel = selecionados.has(item.id_jogador);
                  const tit = titulares.has(item.id_jogador);
                  return (
                    <TouchableOpacity
                      style={[styles.jogadorSelectRow, sel && styles.jogadorSelectRowActive, { marginBottom: 8 }]}
                      onPress={() => toggleJogador(item.id_jogador)}
                      activeOpacity={0.8}
                    >
                      {/* Checkbox */}
                      <View style={[styles.checkBox, sel && styles.checkBoxActive]}>
                        {sel && <MaterialCommunityIcons name="check" size={14} color="#fff" />}
                      </View>

                      {/* Número */}
                      <View style={[styles.jogadorNumero, { width: 30, height: 30, borderRadius: 7 }]}>
                        <Text style={styles.jogadorNumeroText}>{item.numCamisa ?? '?'}</Text>
                      </View>

                      {/* Nome e posição */}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.jogadorSelectNome}>{item.nome}</Text>
                        <Text style={styles.jogadorSelectPos}>{item.posicao}</Text>
                      </View>

                      {/* Botão Titular */}
                      {sel && (
                        <TouchableOpacity
                          onPress={() => toggleTitular(item.id_jogador)}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 8,
                            backgroundColor: tit ? colors.primary : '#2a2a2a',
                            borderWidth: 1,
                            borderColor: tit ? colors.primary : '#333',
                          }}
                        >
                          <Text style={{
                            fontFamily: 'Creato-Bold',
                            color: tit ? '#fff' : colors.text_secondary,
                            fontSize: 11,
                          }}>
                            {tit ? 'TITULAR' : 'T'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.applyEscalacaoBtn, (salvandoEscalacao || disponiveis.length === 0) && { opacity: 0.5 }]}
            onPress={confirmarEscalacao}
            disabled={salvandoEscalacao || disponiveis.length === 0}
          >
            {salvandoEscalacao
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.applyEscalacaoBtnText}>SALVAR ESCALAÇÃO</Text>
            }
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {/* ══════════════════════════════════════════════════════
          MODAL: Confirmar Finalizar Partida
      ══════════════════════════════════════════════════════ */}
      <Modal
        visible={modalFinalizar}
        transparent
        animationType="fade"
        onRequestClose={() => setModalFinalizar(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <View style={styles.confirmIcon}>
              <MaterialCommunityIcons name="flag-checkered" size={28} color={colors.vermelho} />
            </View>
            <Text style={styles.confirmTitle}>Finalizar Partida?</Text>
            <Text style={styles.confirmDesc}>
              Os dados serão salvos e o Scout de IA será atualizado com os eventos desta partida.
              Você poderá editar os dados depois se necessário.
            </Text>
            <View style={styles.confirmBtnRow}>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setModalFinalizar(false)}>
                <Text style={styles.confirmCancelText}>CANCELAR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmOk} onPress={finalizarPartida}>
                <Text style={styles.confirmOkText}>FINALIZAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Sub-componente: linha do jogador na escalação ────────────────────────────

function JogadorRow({
  escalado,
  partida,
  isAdmin,
}: {
  escalado: JogadorEscalado;
  partida:  Partida;
  isAdmin:  boolean;
}) {
  return (
    <View style={[styles.jogadorRow, escalado.titular && { borderColor: colors.primary + '44' }]}>
      <View style={styles.jogadorNumero}>
        <Text style={styles.jogadorNumeroText}>{escalado.numCamisa}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.jogadorNome}>{escalado.jogador.nome}</Text>
        <Text style={styles.jogadorPos}>{escalado.jogador.posicao}</Text>
      </View>
      {escalado.titular && (
        <View style={{
          backgroundColor: colors.primary + '22',
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 6,
        }}>
          <Text style={{ fontFamily: 'Creato-Bold', color: colors.primary, fontSize: 10 }}>TITULAR</Text>
        </View>
      )}
    </View>
  );
}