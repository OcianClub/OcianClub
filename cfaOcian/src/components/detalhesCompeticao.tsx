import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  Pressable, ActivityIndicator, Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';
import { Header } from '@/src/components/Header';
import OrganizarPartidaCampeonato from '@/src/components/organizarPartidaCampeonato';
import { fetchPartidasPorCompeticao, fetchJogadoresPorCompeticao, atualizarStatusPartida } from '@/src/services/api';
import PrepararPartida from '@/src/components/PrepararPartida';
import { s } from '@/src/styles/detalhesCompeticaoStyles';

interface Competicao { id: number; nome: string; ano: number; tipo: 'INICIACAO' | 'BASE'; }
interface Time { id: number; nome: string; escudo: string | null; categoria_id: number; }
interface Evento {
  id: number;
  tipo: 'GOL' | 'ASSISTENCIA' | 'DEFESA' | 'CARTAO_AMARELO' | 'CARTAO_VERMELHO' | 'FALTA';
  minuto: number; doOcian: boolean; jogador_id: number | null;
  jogador: { id: number; nome: string } | null;
}
interface Partida {
  id: number; rodada: number | null; grupo: string | null;
  data: string; horario: string | null; local: string | null;
  status: string; emCasa: boolean;
  mandante: Time; visitante: Time;
  categoria: { id: number; nome: string };
  gols_mandante: number; gols_visitante: number;
  eventos: Evento[];
}
interface Jogador {
  id: number; nome: string; posicao: string;
  numCamisa: number | null; categoria_id: number;
}
interface Props { competicao: Competicao; onFechar: () => void; }

const STATUS_OPCOES = ['AGENDADA', 'PREPARADA', 'AO_VIVO', 'FINALIZADA', 'CANCELADA'] as const;

const STATUS_COR: Record<string, string> = {
  AGENDADA: colors.azulClaro,
  PREPARADA: colors.amarelo,
  AO_VIVO: colors.primary, 
  FINALIZADA: '#6FCF97',
  CANCELADA: colors.vermelho,
};

const STATUS_LABEL: Record<string, string> = {
  AGENDADA:   'Agendada',
  PREPARADA:  'Preparada',
  AO_VIVO:    'Ao Vivo',
  FINALIZADA: 'Finalizada',
  CANCELADA:  'Cancelada',
};

const TIPO_ICONE: Record<string, string> = {
  GOL:            'soccer',
  ASSISTENCIA:    'shoe-cleat',
  DEFESA:         'shield-check',
  CARTAO_AMARELO: 'card',
  CARTAO_VERMELHO:'card',
  FALTA:          'hand-back-right',
};

const TIPO_COR: Record<string, string> = {
  GOL:            '#22c55e',
  ASSISTENCIA:    colors.azulClaro,
  DEFESA:         '#a855f7',
  CARTAO_AMARELO: '#eab308',
  CARTAO_VERMELHO:colors.vermelho,
  FALTA:          '#f97316',
};

const TIPO_LABEL: Record<string, string> = {
  GOL:            'Gols',
  ASSISTENCIA:    'Assist.',
  DEFESA:         'Defesas',
  CARTAO_AMARELO: 'Amarelos',
  CARTAO_VERMELHO:'Vermelhos',
  FALTA:          'Faltas',
};

function formatarData(dataStr: string) {
  const [ano, mes, dia] = dataStr.split('T')[0].split('-');
  const d = new Date(Number(ano), Number(mes) - 1, Number(dia));
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase();
}

function isHoje(dataStr: string): boolean {
  const hoje = new Date();
  const [ano, mes, dia] = dataStr.split('T')[0].split('-');
  return (
    hoje.getFullYear() === Number(ano) &&
    hoje.getMonth() + 1 === Number(mes) &&
    hoje.getDate() === Number(dia)
  );
}

function calcularStatsJogadores(eventos: Evento[]) {
  const mapa: Record<number, { nome: string; stats: Record<string, number> }> = {};
  eventos.forEach(ev => {
    if (!ev.doOcian || !ev.jogador) return;
    if (!mapa[ev.jogador.id]) mapa[ev.jogador.id] = { nome: ev.jogador.nome, stats: {} };
    mapa[ev.jogador.id].stats[ev.tipo] = (mapa[ev.jogador.id].stats[ev.tipo] || 0) + 1;
  });
  return Object.entries(mapa).map(([id, val]) => ({ id: Number(id), ...val }));
}

export default function DetalhesCompeticao({ competicao, onFechar }: Props) {
  const [partidas,           setPartidas]           = useState<Partida[]>([]);
  const [jogadores,          setJogadores]          = useState<Jogador[]>([]);
  const [categorias,         setCategorias]         = useState<{ id: number; nome: string }[]>([]);
  const [catFiltro,          setCatFiltro]          = useState<number | null>(null);
  const [carregando,         setCarregando]         = useState(true);
  const [partidaSelecionada, setPartidaSelecionada] = useState<Partida | null>(null);
  const [modalDetalhes,      setModalDetalhes]      = useState(false);
  const [modalStatus,        setModalStatus]        = useState(false);
  const [modalEditar,        setModalEditar]        = useState(false);
  const [modalPreparar, setModalPreparar] = useState(false);
  const [atualizandoStatus,  setAtualizandoStatus]  = useState(false);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const [p, j] = await Promise.all([
        fetchPartidasPorCompeticao(competicao.id),
        fetchJogadoresPorCompeticao(competicao.id),
      ]);
      setPartidas(p);
      setJogadores(j);
      const cats = Array.from(
        new Map(p.map((x: Partida) => [x.categoria.id, x.categoria])).values()
      ) as { id: number; nome: string }[];
      setCategorias(cats.sort((a: any, b: any) => a.nome.localeCompare(b.nome)));
    } catch (e) {
      console.error(e);
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }, [competicao.id]);

  useEffect(() => { carregar(); }, [carregar]);

  const partidasFiltradas = catFiltro
    ? partidas.filter(p => p.categoria.id === catFiltro)
    : partidas;

  const porRodada = partidasFiltradas.reduce((acc: Record<string, Partida[]>, p) => {
    const chave = p.rodada
      ? `Rodada ${p.rodada}${p.grupo ? ` • Grupo ${p.grupo}` : ''}`
      : 'Sem rodada';
    if (!acc[chave]) acc[chave] = [];
    acc[chave].push(p);
    return acc;
  }, {});

  const atualizarStatus = async (novoStatus: string) => {
    if (!partidaSelecionada) return;
    setAtualizandoStatus(true);
    try {
      await atualizarStatusPartida(partidaSelecionada.id, novoStatus);
      setPartidaSelecionada({ ...partidaSelecionada, status: novoStatus });
      setModalStatus(false);
      carregar(true);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setAtualizandoStatus(false);
    }
  };

  const jogadoresDaPartida = partidaSelecionada
    ? jogadores.filter(j => j.categoria_id === partidaSelecionada.categoria.id)
    : [];

  const statsJogadores   = partidaSelecionada ? calcularStatsJogadores(partidaSelecionada.eventos ?? []) : [];
  const temStats         = statsJogadores.length > 0;

  return (
    <View style={s.container}>
      <Header
        title={competicao.nome}
        showLogo={false}
        showProfile={false}
        btnVoltar="arrow-left"
        onBtnVoltar={onFechar}
        semSafeArea={true}
      />

      {carregando ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : partidas.length === 0 ? (
        <View style={s.emptyContainer}>
          <MaterialCommunityIcons name="calendar-remove-outline" size={56} color="#2a2a2a" />
          <Text style={s.emptyTxt}>Nenhuma partida importada ainda.</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.listaContent}>
          {/* Filtros - AGORA COM O WRAPPER DE BLINDAGEM */}
      <View style={s.filtrosWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filtrosContent}
        >
          {[{ id: null, nome: 'Todos' }, ...categorias].map(cat => (
            <TouchableOpacity
              key={cat.id ?? 'todos'}
              style={[s.filtroPill, catFiltro === cat.id && s.filtroPillAtivo]}
              onPress={() => setCatFiltro(cat.id)}
            >
              <Text style={s.filtroPillTxt}>
                {cat.nome.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
          {Object.entries(porRodada).map(([rodada, jogos]) => (
            <View key={rodada}>
              <Text style={s.rodadaLabel}>{rodada.toUpperCase()}</Text>
              <View style={s.rodadaJogos}>
                {jogos.map(partida => {
                  const podePrepararCard = partida.status === 'AGENDADA' && isHoje(partida.data);
                  const corStatus        = STATUS_COR[partida.status] ?? colors.azulClaro;
                  return (
                    <TouchableOpacity
                      key={partida.id}
                      style={[s.cardPartida, podePrepararCard && s.cardPartidaPreparar]}
                      onPress={() => { setPartidaSelecionada(partida); setModalDetalhes(true); }}
                      activeOpacity={0.8}
                    >
                      <View style={s.cardTopo}>
                        <Text style={s.cardCategoriaTxt}>
                          {partida.categoria.nome.toUpperCase()}
                        </Text>
                        <View style={s.statusRow}>
                          <View style={[s.statusDot, { backgroundColor: corStatus }]} />
                          <Text style={[s.statusTxt, { color: corStatus }]}>
                            {STATUS_LABEL[partida.status] ?? partida.status}
                          </Text>
                        </View>
                      </View>

                      <View style={s.placarRow}>
                        <Text style={s.timeTxt} numberOfLines={2}>{partida.mandante.nome}</Text>
                        <View style={s.placarCentro}>
                          {partida.status === 'FINALIZADA' || partida.status === 'AO_VIVO' ? (
                            <Text style={s.placarTxt}>
                              {partida.gols_mandante} - {partida.gols_visitante}
                            </Text>
                          ) : (
                            <Text style={s.placarDash}>—</Text>
                          )}
                          <Text style={s.placarInfo}>
                            {partida.horario ?? '--:--'} • {formatarData(partida.data)}
                          </Text>
                        </View>
                        <Text style={[s.timeTxt, s.timeTxtDireita]} numberOfLines={2}>
                          {partida.visitante.nome}
                        </Text>
                      </View>

                      {partida.local ? (
                        <Text style={s.localTxt} numberOfLines={1}>{partida.local}</Text>
                      ) : null}

                      {podePrepararCard && (
                        <TouchableOpacity
                          style={s.btnPreparar}
                          onPress={() => { setPartidaSelecionada(partida); setModalDetalhes(true); }}
                        >
                          <MaterialCommunityIcons name="clipboard-list-outline" size={16} color="#a855f7" />
                          <Text style={s.btnPrepararTxt}>PREPARAR PARTIDA</Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── MODAL DETALHES ── */}
      <Modal visible={modalDetalhes} transparent animationType="slide">
        <View style={s.modalDetalhesOverlay}>
          <Pressable style={s.modalDetalhesBack} onPress={() => setModalDetalhes(false)} />
          <View style={s.modalDetalhesContent}>
            <View style={s.dragHandle}>
              <View style={s.dragBar} />
            </View>

            <ScrollView
              contentContainerStyle={s.modalDetalhesScroll}
              showsVerticalScrollIndicator={false}
            >
              {partidaSelecionada && (
                <>
                  <View style={s.modalDetalhesTitulo}>
                    <Text style={s.modalDetalhesTituloTxt}>
                      {partidaSelecionada.categoria.nome}
                      {partidaSelecionada.rodada ? ` • Rodada ${partidaSelecionada.rodada}` : ''}
                      {partidaSelecionada.grupo ? ` • Grupo ${partidaSelecionada.grupo}` : ''}
                    </Text>
                    <TouchableOpacity onPress={() => setModalDetalhes(false)}>
                      <MaterialCommunityIcons name="close" size={22} color={colors.text} />
                    </TouchableOpacity>
                  </View>

                  {/* Placar */}
                  <View style={s.placarCard}>
                    <View style={s.placarGrandeRow}>
                      <Text style={[s.timeTxt, { textAlign: 'center' }]} numberOfLines={2}>
                        {partidaSelecionada.mandante.nome}
                      </Text>
                      <View style={s.placarCentro}>
                        {partidaSelecionada.status === 'FINALIZADA' || partidaSelecionada.status === 'AO_VIVO' ? (
                          <Text style={s.placarGrandeTxt}>
                            {partidaSelecionada.gols_mandante} × {partidaSelecionada.gols_visitante}
                          </Text>
                        ) : (
                          <Text style={s.placarGrandeDash}>— × —</Text>
                        )}
                        <View style={s.placarGrandeStatusRow}>
                          <View style={[s.statusDot, { backgroundColor: STATUS_COR[partidaSelecionada.status] }]} />
                          <Text style={[s.statusTxt, { color: STATUS_COR[partidaSelecionada.status] }]}>
                            {STATUS_LABEL[partidaSelecionada.status]}
                          </Text>
                        </View>
                      </View>
                      <Text style={[s.timeTxt, { textAlign: 'center' }]} numberOfLines={2}>
                        {partidaSelecionada.visitante.nome}
                      </Text>
                    </View>

                    <View style={s.placarGrandeInfoRow}>
                      <Text style={s.placarGrandeInfoTxt}>{formatarData(partidaSelecionada.data)}</Text>
                      {partidaSelecionada.horario && (
                        <Text style={s.placarGrandeInfoTxt}>{partidaSelecionada.horario}</Text>
                      )}
                      {partidaSelecionada.local && (
                        <Text style={s.placarGrandeInfoTxt} numberOfLines={1}>{partidaSelecionada.local}</Text>
                      )}
                    </View>
                  </View>

                  {/* Stats */}
                  {partidaSelecionada.status === 'FINALIZADA' && temStats && (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={s.secaoLabel}>ESTATÍSTICAS DO OCIAN</Text>
                      {statsJogadores.map(j => {
                        const tiposComValor = Object.entries(j.stats).filter(([, v]) => v > 0);
                        if (tiposComValor.length === 0) return null;
                        return (
                          <View key={j.id} style={s.statJogadorCard}>
                            <Text style={s.statJogadorNome}>{j.nome.split(' ')[0]}</Text>
                            <View style={s.statBadgesRow}>
                              {tiposComValor.map(([tipo, valor]) => (
                                <View key={tipo} style={[s.statBadge, { backgroundColor: TIPO_COR[tipo] + '22' }]}>
                                  <MaterialCommunityIcons name={TIPO_ICONE[tipo] as any} size={12} color={TIPO_COR[tipo]} />
                                  <Text style={[s.statBadgeTxt, { color: TIPO_COR[tipo] }]}>
                                    {valor} {TIPO_LABEL[tipo]}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Convocados */}
                  {jogadoresDaPartida.length > 0 && (
                    <View style={s.convocadosScroll}>
                      <Text style={s.secaoLabel}>CONVOCADOS ({jogadoresDaPartida.length})</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={s.convocadosRow}>
                          {jogadoresDaPartida.map(j => (
                            <View key={j.id} style={s.convocadoCard}>
                              <Text style={s.convocadoNum}>#{j.numCamisa ?? '—'}</Text>
                              <Text style={s.convocadoNome} numberOfLines={1}>{j.nome.split(' ')[0]}</Text>
                              <Text style={s.convocadoPosicao}>{j.posicao}</Text>
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  )}

                  {/* Ações */}
                  <View style={s.acoesRow}>
                    <TouchableOpacity
                      style={s.btnAcao}
                      onPress={() => { setModalDetalhes(false); setModalEditar(true); }}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.azulClaro} />
                      <Text style={[s.btnAcaoTxt, { color: colors.azulClaro }]}>Editar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[s.btnAcao, {
                        backgroundColor: STATUS_COR[partidaSelecionada.status] + '18',
                        borderColor: STATUS_COR[partidaSelecionada.status] + '60',
                      }]}
                      onPress={() => setModalStatus(true)}
                    >
                      <MaterialCommunityIcons name="swap-horizontal" size={18} color={STATUS_COR[partidaSelecionada.status]} />
                      <Text style={[s.btnAcaoTxt, { color: STATUS_COR[partidaSelecionada.status] }]}>
                        {STATUS_LABEL[partidaSelecionada.status]}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {partidaSelecionada.status === 'AGENDADA' && isHoje(partidaSelecionada.data) && (
                    <TouchableOpacity
                      style={s.btnPreparaModal}
                      onPress={() => {
                        setModalDetalhes(false);
                        setModalPreparar(true);
                      }}
                    >
                      <MaterialCommunityIcons name="clipboard-list-outline" size={20} color="#a855f7" />
                      <Text style={{ color: '#a855f7', fontFamily: 'Creato-Bold', fontSize: 14 }}>
                        PREPARAR PARTIDA
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── MODAL STATUS ── */}
      <Modal visible={modalStatus} transparent animationType="fade">
        <Pressable style={s.modalStatusOverlay} onPress={() => setModalStatus(false)}>
          <View style={s.modalStatusCard}>
            <Text style={s.modalStatusTitulo}>Alterar Status</Text>
            {STATUS_OPCOES.map(st => (
              <TouchableOpacity
                key={st}
                style={[
                  s.statusOpcao,
                  partidaSelecionada?.status === st && { ...s.statusOpcaoAtiva, borderColor: STATUS_COR[st] },
                  partidaSelecionada?.status === st && { backgroundColor: STATUS_COR[st] + '22' },
                ]}
                onPress={() => atualizarStatus(st)}
                disabled={atualizandoStatus}
              >
                <View style={[s.statusDot, { backgroundColor: STATUS_COR[st] }]} />
                <Text style={[s.statusOpcaoTxt, { color: STATUS_COR[st] }]}>
                  {STATUS_LABEL[st]}
                </Text>
                {atualizandoStatus && partidaSelecionada?.status !== st && (
                  <ActivityIndicator size="small" color={STATUS_COR[st]} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── MODAL EDITAR ── */}
      <Modal visible={modalEditar} transparent={false} animationType="slide">
        {partidaSelecionada && (
          <OrganizarPartidaCampeonato
            competicao={competicao}
            partida={partidaSelecionada}
            onFechar={() => setModalEditar(false)}
            onSalvo={() => { setModalEditar(false); carregar(true); }}
          />
        )}
      </Modal>~

      {/* ── MODAL PREPARAR PARTIDA ── */}
      <Modal visible={modalPreparar} transparent={false} animationType="slide">
        {partidaSelecionada && (
          <PrepararPartida
            partida={partidaSelecionada}
            competicao={competicao}
            onFechar={() => setModalPreparar(false)}
            onConfirmado={() => {
              setModalPreparar(false);
              carregar(true); // recarrega a lista para mostrar status PREPARADA
            }}
          />
        )}
      </Modal>
    </View>
  );
}