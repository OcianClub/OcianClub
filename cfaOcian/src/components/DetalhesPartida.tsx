import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  Modal, ActivityIndicator, Alert, Image, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';
import { styles } from '@/src/styles/detalhesPartidaStyles';
import EscalacaoPartida, { JogadorEscalado } from '@/src/components/EscalacaoPartida';

import {
  atualizarStatusPartida,
  atualizarPlacarPartida,
  criarEvento,
} from '@/src/services/api';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface Partida {
  id:             number;
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
  competicao?: { id: number; nome: string; ano?: number; tipo: 'INICIACAO' | 'BASE' } | null;
  competicao_id?: number | null;
  rodada?:        number | null;
  grupo?:         string | null;
}

type TipoEvento = 'GOL' | 'CARTAO_AMARELO' | 'CARTAO_VERMELHO' | 'FALTA' | 'DEFESA' | 'ASSISTENCIA';

interface Props { partida: Partida; isAdmin: boolean; onBack: () => void; }

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Compara a data da partida (YYYY-MM-DD, sem fuso) com o dia local do dispositivo.
 * Evita o bug de UTC+0 vs UTC-3 onde split('T')[0] retornaria o dia errado.
 */
function isHoje(dataStr: string): boolean {
  const hoje = new Date();
  const [ano, mes, dia] = dataStr.split('T')[0].split('-').map(Number);
  return (
    hoje.getFullYear() === ano &&
    hoje.getMonth() + 1 === mes &&
    hoje.getDate() === dia
  );
}

/**
 * Retorna os rótulos de período corretos por categoria.
 * sub-7 ao sub-14 → 4 tempos
 * sub-16          → 2 tempos de 16min
 * sub-18          → 2 tempos de 18min
 */
function getPeriodos(nomeCategoria: string | undefined): string[] {
  const nome = (nomeCategoria ?? '').toLowerCase();
  if (nome.includes('18') || nome.includes('16')) {
    return ['1º Tempo', '2º Tempo'];
  }
  // sub-7, sub-8, sub-9, sub-10, sub-12, sub-14
  return ['1º Tempo', '2º Tempo', '3º Tempo', '4º Tempo'];
}

function LogoTime({ uri, size = 56 }: { uri: string | null; size?: number }) {
  if (uri) return (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 10, resizeMode: 'contain', backgroundColor: '#1e1e1e' }} />
  );
  return (
    <View style={{ width: size, height: size, borderRadius: 10, backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' }}>
      <MaterialCommunityIcons name="shield-outline" size={size * 0.5} color="#333" />
    </View>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function DetalhesPartida({ partida: partidaInicial, isAdmin, onBack }: Props) {
  const [partida,         setPartida]         = useState<Partida>(partidaInicial);
  const [golsMandante,    setGolsMandante]    = useState(partidaInicial.gols_mandante);
  const [golsVisitante,   setGolsVisitante]   = useState(partidaInicial.gols_visitante);
  const [periodoIdx,      setPeriodoIdx]      = useState(0);
  const [salvandoPlacar,  setSalvandoPlacar]  = useState(false);
  const [escalacao,       setEscalacao]       = useState<JogadorEscalado[]>([]);
  const [modalEvento,     setModalEvento]     = useState<{ tipo: TipoEvento; label: string } | null>(null);
  const [jogadorEvento,   setJogadorEvento]   = useState<JogadorEscalado | null>(null);
  const [salvandoEvento,  setSalvandoEvento]  = useState(false);
  const [modalFinalizar,  setModalFinalizar]  = useState(false);
  const [modalDeletar,    setModalDeletar]    = useState(false);
  const [modoEdicao,      setModoEdicao]      = useState(false);

  const periodos    = getPeriodos(partida.categoria?.nome);
  const isInterativo = isAdmin && (partida.status === 'AO_VIVO' || modoEdicao);

  // ── Ações ─────────────────────────────────────────────────────────────────

  const iniciarPartida = async () => {
    const qtdeTitulares = escalacao.filter(e => e.titular).length;
    if (qtdeTitulares !== 5) {
      Alert.alert('Atenção', `Para iniciar é obrigatório definir exatamente 5 titulares. Atualmente há ${qtdeTitulares}. Clique em ALTERAR na seção Escalação.`);
      return;
    }
    try {
      await atualizarStatusPartida(partida.id, 'AO_VIVO');
      setPartida(prev => ({ ...prev, status: 'AO_VIVO' }));
    } catch { Alert.alert('Erro', 'Não foi possível iniciar a partida.'); }
  };

  const salvarPlacar = async (novoMandante: number, novoVisitante: number) => {
    setSalvandoPlacar(true);
    try { await atualizarPlacarPartida(partida.id, novoMandante, novoVisitante); }
    catch { Alert.alert('Erro', 'Não foi possível atualizar o placar.'); }
    finally { setSalvandoPlacar(false); }
  };

  const alterarGol = (lado: 'mandante' | 'visitante', delta: number) => {
    if (!isAdmin) return;
    if (lado === 'mandante') {
      const novo = Math.max(0, golsMandante + delta);
      setGolsMandante(novo); salvarPlacar(novo, golsVisitante);
    } else {
      const novo = Math.max(0, golsVisitante + delta);
      setGolsVisitante(novo); salvarPlacar(golsMandante, novo);
    }
  };

  const confirmarEvento = async () => {
    if (!modalEvento || !jogadorEvento) return;
    setSalvandoEvento(true);
    try {
      // periodo = índice + 1 (1º, 2º, 3º ou 4º tempo)
      await criarEvento(partida.id, {
        tipo:       modalEvento.tipo,
        minuto:     null as any,   // nulo por enquanto — será preenchido quando houver cronômetro
        periodo:    periodoIdx + 1,
        jogador_id: jogadorEvento.jogador_id,
        doOcian:    true,
      });
      if (modalEvento.tipo === 'GOL') {
        const novoMandante  = partida.emCasa ? golsMandante + 1 : golsMandante;
        const novoVisitante = !partida.emCasa ? golsVisitante + 1 : golsVisitante;
        setGolsMandante(novoMandante); setGolsVisitante(novoVisitante);
        await atualizarPlacarPartida(partida.id, novoMandante, novoVisitante);
      }
      setModalEvento(null); setJogadorEvento(null);
    } catch { Alert.alert('Erro', 'Não foi possível registrar o evento.'); }
    finally { setSalvandoEvento(false); }
  };

  const finalizarPartida = async () => {
    setModalFinalizar(false);
    try {
      await atualizarStatusPartida(partida.id, 'FINALIZADA');
      setPartida(prev => ({ ...prev, status: 'FINALIZADA' }));
      setModoEdicao(false);
    } catch { Alert.alert('Erro', 'Não foi possível finalizar a partida.'); }
  };

  const deletarPartida = async () => {
    setModalDeletar(false);
    try {
      const res = await fetch(`${require('@/src/services/api').BASE_URL}/partidas/${partida.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao deletar');
      onBack();
    } catch { Alert.alert('Erro', 'Não foi possível deletar a partida.'); }
  };

  // ── Cards de evento ────────────────────────────────────────────────────────
  const EVENTO_CARDS: { tipo: TipoEvento; label: string; icon: React.ReactNode }[] = [
    { tipo: 'CARTAO_AMARELO',  label: 'Amarelo',     icon: <View style={{ width: 16, height: 22, borderRadius: 3, backgroundColor: colors.amarelo }} /> },
    { tipo: 'CARTAO_VERMELHO', label: 'Vermelho',    icon: <View style={{ width: 16, height: 22, borderRadius: 3, backgroundColor: colors.vermelho }} /> },
    { tipo: 'FALTA',           label: 'Falta',       icon: <MaterialCommunityIcons name="whistle" size={22} color={colors.text_secondary} /> },
    { tipo: 'DEFESA',          label: 'Defesa',      icon: <MaterialCommunityIcons name="shield-check" size={22} color={colors.azulClaro} /> },
    { tipo: 'ASSISTENCIA',     label: 'Assistência', icon: <MaterialCommunityIcons name="shoe-cleat" size={22} color={colors.primary} /> },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root}>

      {/* ── HEADER ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBackBtn} onPress={onBack}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>DETALHES DA PARTIDA</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isAdmin && partida.status === 'FINALIZADA' && (
            <TouchableOpacity
              style={[styles.headerEditBtn, modoEdicao && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => setModoEdicao(!modoEdicao)}
            >
              <Text style={[styles.headerEditBtnText, modoEdicao && { color: '#fff' }]}>
                {modoEdicao ? 'CONCLUIR' : 'SCOUT'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── HERO ── */}
        <View style={styles.hero}>
          <View style={styles.heroCatRow}>
            <Text style={styles.heroCatText}>{partida.categoria?.nome ?? '—'}</Text>
            <View style={styles.heroDot} />
            <Text style={styles.heroCatText}>
              {partida.data ? new Date(partida.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—'}
            </Text>
          </View>

          <View style={styles.heroTeamsRow}>
            <View style={styles.heroTeamCol}>
              <LogoTime uri={partida.mandante.escudo} size={64} />
              <Text style={styles.heroTeamName} numberOfLines={2}>{partida.mandante.nome}</Text>
            </View>

            <View style={styles.heroScoreBlock}>
              {partida.status === 'AGENDADA' ? (
                <Text style={styles.heroVs}>VS</Text>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {isInterativo ? (
                    <View style={{ alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity style={[styles.stepBtn, { width: 32, height: 32, borderRadius: 8 }]} onPress={() => alterarGol('mandante', 1)}>
                        <MaterialCommunityIcons name="plus" size={18} color="#fff" />
                      </TouchableOpacity>
                      <Text style={styles.heroScoreText}>{golsMandante}</Text>
                      <TouchableOpacity style={[styles.stepBtn, styles.stepBtnMinus, { width: 32, height: 32, borderRadius: 8 }]} onPress={() => alterarGol('mandante', -1)}>
                        <MaterialCommunityIcons name="minus" size={18} color={colors.text_secondary} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.heroScoreText}>{golsMandante}</Text>
                  )}
                  <View style={styles.heroScoreSeparator} />
                  {isInterativo ? (
                    <View style={{ alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity style={[styles.stepBtn, { width: 32, height: 32, borderRadius: 8 }]} onPress={() => alterarGol('visitante', 1)}>
                        <MaterialCommunityIcons name="plus" size={18} color="#fff" />
                      </TouchableOpacity>
                      <Text style={styles.heroScoreText}>{golsVisitante}</Text>
                      <TouchableOpacity style={[styles.stepBtn, styles.stepBtnMinus, { width: 32, height: 32, borderRadius: 8 }]} onPress={() => alterarGol('visitante', -1)}>
                        <MaterialCommunityIcons name="minus" size={18} color={colors.text_secondary} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.heroScoreText}>{golsVisitante}</Text>
                  )}
                </View>
              )}
              {partida.status === 'AO_VIVO'    && <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveBadgeText}>AO VIVO</Text></View>}
              {partida.status === 'FINALIZADA' && <View style={styles.finishedBadge}><Text style={styles.finishedBadgeText}>ENCERRADO</Text></View>}
              {partida.status === 'AGENDADA'   && <View style={styles.scheduledBadge}><Text style={styles.scheduledBadgeText}>{partida.horario ?? 'AGENDADO'}</Text></View>}
            </View>

            <View style={styles.heroTeamCol}>
              <LogoTime uri={partida.visitante.escudo} size={64} />
              <Text style={styles.heroTeamName} numberOfLines={2}>{partida.visitante.nome}</Text>
            </View>
          </View>
        </View>

        {/* ── INFO BAR ── */}
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
            <MaterialCommunityIcons name={partida.emCasa ? 'home-outline' : 'bus'} size={16} color={colors.text_secondary} />
            <Text style={styles.infoBarLabel}>Mando</Text>
            <Text style={styles.infoBarValue}>{partida.emCasa ? 'Casa' : 'Fora'}</Text>
          </View>
        </View>

        {/* ── BOTÃO INICIAR (só no dia da partida) ── */}
        {partida.status === 'AGENDADA' && isAdmin && isHoje(partida.data) && (
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

        {/* ── SELETOR DE PERÍODO + EVENTOS (AO_VIVO ou modo edição scout) ── */}
        {isInterativo && (
          <>
            {/* Período */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionBar} />
                  <Text style={styles.sectionTitle}>PERÍODO (TEMPO)</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1a1a1a', borderRadius: 14, borderWidth: 1, borderColor: colors.primary + '44', paddingVertical: 14, paddingHorizontal: 16 }}>
                <TouchableOpacity
                  onPress={() => setPeriodoIdx(i => Math.max(0, i - 1))}
                  style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: periodoIdx === 0 ? '#2a2a2a' : colors.primary + '22', borderWidth: 1, borderColor: periodoIdx === 0 ? '#333' : colors.primary + '66', alignItems: 'center', justifyContent: 'center' }}
                  disabled={periodoIdx === 0}
                >
                  <MaterialCommunityIcons name="chevron-left" size={22} color={periodoIdx === 0 ? '#444' : colors.primary} />
                </TouchableOpacity>

                <View style={{ alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontFamily: 'Creato-Bold', color: colors.primary, fontSize: 18, letterSpacing: 1 }}>
                    {periodos[periodoIdx]?.toUpperCase()}
                  </Text>
                  <Text style={{ fontFamily: 'Creato-Regular', color: colors.text_secondary, fontSize: 11, letterSpacing: 0.5 }}>
                    {periodoIdx + 1} / {periodos.length}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setPeriodoIdx(i => Math.min(periodos.length - 1, i + 1))}
                  style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: periodoIdx === periodos.length - 1 ? '#2a2a2a' : colors.primary + '22', borderWidth: 1, borderColor: periodoIdx === periodos.length - 1 ? '#333' : colors.primary + '66', alignItems: 'center', justifyContent: 'center' }}
                  disabled={periodoIdx === periodos.length - 1}
                >
                  <MaterialCommunityIcons name="chevron-right" size={22} color={periodoIdx === periodos.length - 1 ? '#444' : colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Eventos */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionBar} />
                  <Text style={styles.sectionTitle}>REGISTRAR EVENTO NO SCOUT</Text>
                </View>
              </View>
              <View style={styles.eventsGrid}>
                <TouchableOpacity style={styles.golCard} activeOpacity={0.8} onPress={() => setModalEvento({ tipo: 'GOL', label: 'Gol do Jogador' })}>
                  <View style={styles.golLeft}>
                    <View style={styles.golIconWrap}><MaterialCommunityIcons name="soccer" size={22} color={colors.primary} /></View>
                    <View><Text style={styles.golLabel}>Gol</Text><Text style={styles.golSub}>Selecionar jogador →</Text></View>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={colors.primary} />
                </TouchableOpacity>
                <View style={styles.eventsRow}>
                  {EVENTO_CARDS.slice(0, 2).map(card => (
                    <TouchableOpacity key={card.tipo} style={styles.eventCard} activeOpacity={0.8} onPress={() => setModalEvento({ tipo: card.tipo, label: card.label })}>
                      <View style={styles.eventIconWrap}>{card.icon}</View>
                      <Text style={styles.eventLabel}>{card.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.eventsRow}>
                  {EVENTO_CARDS.slice(2, 4).map(card => (
                    <TouchableOpacity key={card.tipo} style={styles.eventCard} activeOpacity={0.8} onPress={() => setModalEvento({ tipo: card.tipo, label: card.label })}>
                      <View style={styles.eventIconWrap}>{card.icon}</View>
                      <Text style={styles.eventLabel}>{card.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={styles.eventCardCenter} activeOpacity={0.8} onPress={() => setModalEvento({ tipo: EVENTO_CARDS[4].tipo, label: EVENTO_CARDS[4].label })}>
                  <View style={styles.eventIconWrap}>{EVENTO_CARDS[4].icon}</View>
                  <Text style={styles.eventLabel}>{EVENTO_CARDS[4].label}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* ── ESCALAÇÃO ── */}
        <EscalacaoPartida
          partidaId={partida.id}
          categoriaId={partida.categoria?.id ?? null}
          competicaoId={partida.competicao_id ?? partida.competicao?.id ?? null}
          isAdmin={isAdmin}
          onEscalacaoAtualizada={setEscalacao}
        />

        {/* ── FINALIZAR ── */}
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

        {/* ── DELETAR (admin, qualquer status) ── */}
        {isAdmin && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 20 }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.vermelho + '40', backgroundColor: colors.vermelho + '10' }}
              onPress={() => setModalDeletar(true)}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.vermelho} />
              <Text style={{ fontFamily: 'Creato-Bold', color: colors.vermelho, fontSize: 13, letterSpacing: 0.5 }}>DELETAR PARTIDA</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── MODAL: SELECIONAR JOGADOR PARA EVENTO ── */}
      <Modal visible={!!modalEvento} transparent animationType="slide" onRequestClose={() => { setModalEvento(null); setJogadorEvento(null); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '85%' }]}>
            <View style={styles.modalHandle} />
            {!jogadorEvento ? (
              <>
                <Text style={{ fontFamily: 'Creato-Bold', color: colors.text, fontSize: 16, marginBottom: 4 }}>{modalEvento?.label}</Text>
                <Text style={{ fontFamily: 'Creato-Regular', color: colors.text_secondary, fontSize: 13, marginBottom: 4 }}>Quem fez?</Text>
                <Text style={{ fontFamily: 'Creato-Regular', color: colors.primary, fontSize: 12, marginBottom: 16 }}>{periodos[periodoIdx]}</Text>
                {escalacao.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                    <MaterialCommunityIcons name="account-off-outline" size={40} color="#333" />
                    <Text style={{ fontFamily: 'Creato-Regular', color: '#555', fontSize: 13, textAlign: 'center' }}>
                      Nenhum jogador cadastrado na súmula.{'\n'}Defina a escalação primeiro.
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={escalacao}
                    keyExtractor={item => String(item.id)}
                    style={{ maxHeight: 400 }}
                    renderItem={({ item }) => (
                      <TouchableOpacity style={[styles.jogadorSelectRow, { marginBottom: 8 }]} onPress={() => setJogadorEvento(item)}>
                        <View style={[styles.jogadorNumero, { width: 32, height: 32, borderRadius: 8 }]}>
                          <Text style={styles.jogadorNumeroText}>{item.numCamisa}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.jogadorSelectNome}>{item.jogador.nome}</Text>
                          <Text style={styles.jogadorSelectPos}>{item.jogador.posicao}{item.titular ? '' : ' (Banco)'}</Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.text_secondary} />
                      </TouchableOpacity>
                    )}
                  />
                )}
                <TouchableOpacity style={{ marginTop: 12, alignItems: 'center', paddingVertical: 12 }} onPress={() => setModalEvento(null)}>
                  <Text style={{ fontFamily: 'Creato-Bold', color: colors.text_secondary, fontSize: 13 }}>CANCELAR</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.modalJogadorHeader}>
                  <View style={styles.modalJogadorNum}><Text style={styles.modalJogadorNumText}>{jogadorEvento.numCamisa}</Text></View>
                  <View>
                    <Text style={styles.modalJogadorNome}>{jogadorEvento.jogador.nome}</Text>
                    <Text style={styles.modalJogadorPos}>{jogadorEvento.jogador.posicao}</Text>
                  </View>
                </View>
                <Text style={{ fontFamily: 'Creato-Regular', color: colors.text_secondary, fontSize: 13, marginBottom: 8 }}>
                  Registrar <Text style={{ fontFamily: 'Creato-Bold', color: colors.text }}>{modalEvento?.label}</Text> para este jogador?
                </Text>
                <Text style={{ fontFamily: 'Creato-Regular', color: colors.primary, fontSize: 12, marginBottom: 20 }}>
                  {periodos[periodoIdx]}
                </Text>
                <TouchableOpacity
                  style={[styles.saveStatBtn, salvandoEvento && { opacity: 0.6 }]}
                  onPress={confirmarEvento}
                  disabled={salvandoEvento}
                >
                  {salvandoEvento ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveStatBtnText}>CONFIRMAR</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={{ marginTop: 10, alignItems: 'center', paddingVertical: 12 }} onPress={() => setJogadorEvento(null)}>
                  <Text style={{ fontFamily: 'Creato-Bold', color: colors.text_secondary, fontSize: 13 }}>← VOLTAR</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── MODAL: FINALIZAR ── */}
      <Modal visible={modalFinalizar} transparent animationType="fade" onRequestClose={() => setModalFinalizar(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <View style={styles.confirmIcon}><MaterialCommunityIcons name="flag-checkered" size={28} color={colors.vermelho} /></View>
            <Text style={styles.confirmTitle}>Finalizar Partida?</Text>
            <Text style={styles.confirmDesc}>Os dados serão salvos e o Scout de IA será atualizado com os eventos desta partida.</Text>
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

      {/* ── MODAL: DELETAR ── */}
      <Modal visible={modalDeletar} transparent animationType="fade" onRequestClose={() => setModalDeletar(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <View style={[styles.confirmIcon, { backgroundColor: colors.vermelho + '20' }]}>
              <MaterialCommunityIcons name="trash-can-outline" size={28} color={colors.vermelho} />
            </View>
            <Text style={styles.confirmTitle}>Deletar Partida?</Text>
            <Text style={styles.confirmDesc}>Esta ação é irreversível. Todos os eventos e escalação desta partida serão apagados.</Text>
            <View style={styles.confirmBtnRow}>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setModalDeletar(false)}>
                <Text style={styles.confirmCancelText}>CANCELAR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmOk, { backgroundColor: colors.vermelho }]} onPress={deletarPartida}>
                <Text style={styles.confirmOkText}>DELETAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>


    </SafeAreaView>
  );
}