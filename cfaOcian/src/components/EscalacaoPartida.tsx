import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  Modal, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';
import {
  fetchEscalacaoPartida,
  salvarEscalacaoPartida,
  fetchJogadoresParaEscalacao,
  atualizarJogador,
} from '@/src/services/api';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface JogadorEscalado {
  id:         number;
  jogador_id: number;
  numCamisa:  number;
  titular:    boolean;
  jogador:    { nome: string; posicao: string; numCamisa: number | null };
}

export interface JogadorDisponivel {
  id_jogador: number;
  nome:       string;
  posicao:    string;
  numCamisa:  number | null;
}

interface EscalacaoPartidaProps {
  partidaId:     number;
  categoriaId:   number | null;
  competicaoId?: number | null;
  isAdmin:       boolean;
  onEscalacaoAtualizada?: (escalacao: JogadorEscalado[]) => void;
}

const MAX_TITULARES = 5;

// ── Sub-componente: linha de jogador escalado ─────────────────────────────────

function JogadorRow({ escalado }: { escalado: JogadorEscalado }) {
  return (
    <View style={[jr.row, escalado.titular && { borderColor: colors.primary + '44' }]}>
      <View style={jr.numero}>
        <Text style={jr.numeroTxt}>{escalado.numCamisa}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={jr.nome}>{escalado.jogador.nome}</Text>
        <Text style={jr.pos}>{escalado.jogador.posicao}</Text>
      </View>
      {escalado.titular && (
        <View style={jr.badge}>
          <Text style={jr.badgeTxt}>TITULAR</Text>
        </View>
      )}
    </View>
  );
}

const jr = {
  row: {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: '#2a2a2a', gap: 10,
  },
  numero: {
    width: 36, height: 36, borderRadius: 9, backgroundColor: '#252525',
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  numeroTxt: { fontFamily: 'Creato-Bold', color: colors.text, fontSize: 14 },
  nome: { fontFamily: 'Creato-Bold', color: colors.text, fontSize: 14 },
  pos:  { fontFamily: 'Creato-Regular', color: colors.text_secondary, fontSize: 11, marginTop: 1 },
  badge: { backgroundColor: colors.primary + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeTxt: { fontFamily: 'Creato-Bold', color: colors.primary, fontSize: 10 },
};

// ── Componente principal ──────────────────────────────────────────────────────

export default function EscalacaoPartida({
  partidaId, categoriaId, competicaoId, isAdmin, onEscalacaoAtualizada,
}: EscalacaoPartidaProps) {
  const [escalacao,         setEscalacao]         = useState<JogadorEscalado[]>([]);
  const [disponiveis,       setDisponiveis]       = useState<JogadorDisponivel[]>([]);
  const [carregando,        setCarregando]        = useState(false);
  const [modalEscalacao,    setModalEscalacao]    = useState(false);
  const [convocados,        setConvocados]        = useState<number[]>([]);
  const [salvandoEscalacao, setSalvandoEscalacao] = useState(false);

  // ── Edição de camisa ──────────────────────────────────────────────────────
  const [modalCamisa,       setModalCamisa]       = useState<JogadorDisponivel | null>(null);
  const [novaCamisa,        setNovaCamisa]        = useState('');
  const [salvandoCamisa,    setSalvandoCamisa]    = useState(false);

  const emCampo  = escalacao.filter(e => e.titular);
  const reservas = escalacao.filter(e => !e.titular);

  const carregarEscalacao = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await fetchEscalacaoPartida(partidaId);
      setEscalacao(data);
      onEscalacaoAtualizada?.(data);
    } catch {
    } finally { setCarregando(false); }
  }, [partidaId]);

  const carregarDisponiveis = useCallback(async () => {
    if (!categoriaId) return;
    try {
      const data = await fetchJogadoresParaEscalacao(categoriaId, competicaoId ?? null);
      setDisponiveis(data);
    } catch (e: any) {
      if (isAdmin) Alert.alert('Atenção', e.message || 'Não foi possível carregar o elenco.');
    }
  }, [categoriaId, competicaoId]);

  useEffect(() => {
    carregarEscalacao();
    carregarDisponiveis();
  }, [carregarEscalacao, carregarDisponiveis]);

  const abrirModal = () => {
    const tits = escalacao.filter(e => e.titular).map(e => e.jogador_id);
    const bnco = escalacao.filter(e => !e.titular).map(e => e.jogador_id);
    setConvocados([...tits, ...bnco]);
    setModalEscalacao(true);
  };

  const toggleConvocado = (id: number) => {
    setConvocados(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // ── Abre modal de edição de camisa ────────────────────────────────────────
  const abrirEdicaoCamisa = (jogador: JogadorDisponivel) => {
    setModalCamisa(jogador);
    setNovaCamisa(jogador.numCamisa ? String(jogador.numCamisa) : '');
  };

  // ── Salva nova camisa no cadastro do jogador ──────────────────────────────
  const salvarCamisa = async () => {
    if (!modalCamisa) return;
    const num = Number(novaCamisa.trim());
    if (!novaCamisa.trim() || isNaN(num) || num <= 0) {
      Alert.alert('Atenção', 'Digite um número de camisa válido.');
      return;
    }
    setSalvandoCamisa(true);
    try {
      await atualizarJogador(modalCamisa.id_jogador, { numCamisa: num });
      setDisponiveis(prev =>
        prev.map(d =>
          d.id_jogador === modalCamisa.id_jogador ? { ...d, numCamisa: num } : d
        )
      );
      setModalCamisa(null);
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível salvar a camisa.');
    } finally { setSalvandoCamisa(false); }
  };

  const confirmarEscalacao = async () => {
    if (convocados.length === 0) {
      Alert.alert('Atenção', 'Convoque ao menos um jogador.');
      return;
    }
    const semCamisa = convocados
      .map(id => disponiveis.find(d => Number(d.id_jogador) === id))
      .filter(d => !d?.numCamisa || d.numCamisa <= 0);

    if (semCamisa.length > 0) {
      Alert.alert(
        'Número de camisa ausente',
        `Segure o nome do jogador para definir a camisa:\n\n${semCamisa.map(d => d?.nome).join('\n')}`,
      );
      return;
    }
    setSalvandoEscalacao(true);
    try {
      const payload = convocados.map((id, idx) => {
        const disp = disponiveis.find(d => Number(d.id_jogador) === id)!;
        return { jogador_id: id, numCamisa: disp.numCamisa!, titular: idx < MAX_TITULARES };
      });
      await salvarEscalacaoPartida(partidaId, payload);
      await carregarEscalacao();
      setModalEscalacao(false);
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível salvar a escalação.');
    } finally { setSalvandoEscalacao(false); }
  };

  // ── Seção de visualização ─────────────────────────────────────────────────
  return (
    <>
      <View style={sv.section}>
        <View style={sv.header}>
          <View style={sv.titleRow}>
            <View style={sv.bar} />
            <Text style={sv.title}>ESCALAÇÃO</Text>
          </View>
          {isAdmin && (
            <TouchableOpacity onPress={abrirModal}>
              <Text style={sv.action}>ALTERAR</Text>
            </TouchableOpacity>
          )}
        </View>

        {carregando ? (
          <ActivityIndicator color={colors.primary} />
        ) : escalacao.length === 0 ? (
          <View style={sv.empty}>
            <MaterialCommunityIcons name="account-group-outline" size={40} color="#333" />
            <Text style={sv.emptyTxt}>Nenhum jogador escalado</Text>
            {isAdmin && (
              <TouchableOpacity style={sv.emptyBtn} onPress={abrirModal}>
                <Text style={sv.emptyBtnTxt}>DEFINIR ESCALAÇÃO</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {emCampo.length > 0 && (
              <>
                <Text style={sv.subLabel}>EM CAMPO</Text>
                {emCampo.map(j => <JogadorRow key={j.id} escalado={j} />)}
              </>
            )}
            {reservas.length > 0 && (
              <>
                <Text style={[sv.subLabel, { color: colors.text_secondary, marginTop: 12 }]}>RESERVAS</Text>
                {reservas.map(j => <JogadorRow key={j.id} escalado={j} />)}
              </>
            )}
          </>
        )}
      </View>

      <Modal visible={modalEscalacao} transparent={false} animationType="slide" onRequestClose={() => setModalEscalacao(false)}>
        <SafeAreaView style={m.root}>
          <View style={m.header}>
            <TouchableOpacity onPress={() => setModalEscalacao(false)}>
              <MaterialCommunityIcons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={m.title}>ESCALAÇÃO</Text>
            <View style={m.counter}>
              <Text style={m.counterNum}>{Math.min(convocados.length, MAX_TITULARES)}</Text>
              <Text style={m.counterSep}>/</Text>
              <Text style={m.counterMax}>{MAX_TITULARES}</Text>
            </View>
          </View>

          <View style={m.dica}>
            <MaterialCommunityIcons name="information-outline" size={14} color={colors.text_secondary} />
            <Text style={m.dicaTxt}>
              Toque para convocar · Segure para editar camisa · Primeiros {MAX_TITULARES} = titulares
            </Text>
          </View>

          {disponiveis.length === 0 ? (
            <View style={m.empty}>
              <MaterialCommunityIcons name="account-group-outline" size={48} color="#333" />
              <Text style={m.emptyTxt}>Nenhum jogador encontrado</Text>
              <Text style={m.emptySubTxt}>
                Verifique se o elenco foi inscrito nessa competição em Equipes → Campeonatos.
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
              <View style={m.sectionHeader}>
                <View style={[m.sectionDot, { backgroundColor: colors.primary }]} />
                <Text style={m.sectionTitle}>EM CAMPO</Text>
                <Text style={m.sectionCount}>{Math.min(convocados.length, MAX_TITULARES)}/{MAX_TITULARES}</Text>
              </View>

              {disponiveis.map(item => {
                const id      = Number(item.id_jogador);
                const pos     = convocados.indexOf(id);
                const titular = pos >= 0 && pos < MAX_TITULARES;
                if (!titular) return null;
                const semCamisa = !item.numCamisa || item.numCamisa <= 0;
                return (
                  <TouchableOpacity
                    key={String(item.id_jogador)}
                    style={[m.cardTitular, semCamisa && { borderColor: colors.amarelo + '60' }]}
                    onPress={() => toggleConvocado(id)}
                    onLongPress={() => abrirEdicaoCamisa(item)}
                    activeOpacity={0.75}
                  >
                    <View style={m.ordem}>
                      <Text style={m.ordemNum}>{pos + 1}</Text>
                    </View>
                    <View style={[m.camisa, semCamisa && { backgroundColor: colors.amarelo + '20' }]}>
                      {semCamisa
                        ? <MaterialCommunityIcons name="tshirt-crew-outline" size={18} color={colors.amarelo} />
                        : <Text style={m.camisaNum}>{item.numCamisa}</Text>
                      }
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={m.nome}>{item.nome}</Text>
                      <Text style={m.pos}>{item.posicao}{semCamisa ? ' · Segure para definir camisa' : ''}</Text>
                    </View>
                    <View style={m.tagTitular}>
                      <Text style={m.tagTitularTxt}>TITULAR</Text>
                    </View>
                    <MaterialCommunityIcons name="close-circle" size={20} color={colors.vermelho + '88'} />
                  </TouchableOpacity>
                );
              })}
              {Math.min(convocados.length, MAX_TITULARES) < MAX_TITULARES &&
                Array.from({ length: MAX_TITULARES - Math.min(convocados.length, MAX_TITULARES) }).map((_, i) => (
                  <View key={`slot-${i}`} style={m.slotVazio}>
                    <MaterialCommunityIcons name="account-plus-outline" size={18} color="#333" />
                    <Text style={m.slotVazioTxt}>Toque em um jogador abaixo</Text>
                  </View>
                ))
              }

              <View style={[m.sectionHeader, { marginTop: 20 }]}>
                <View style={[m.sectionDot, { backgroundColor: colors.text_secondary }]} />
                <Text style={m.sectionTitle}>BANCO</Text>
                <Text style={m.sectionCount}>{Math.max(0, convocados.length - MAX_TITULARES)}</Text>
              </View>

              {disponiveis.map(item => {
                const id        = Number(item.id_jogador);
                const pos       = convocados.indexOf(id);
                const convocado = pos >= 0;
                const titular   = convocado && pos < MAX_TITULARES;
                if (titular) return null;
                const semCamisa = !item.numCamisa || item.numCamisa <= 0;
                return (
                  <TouchableOpacity
                    key={String(item.id_jogador)}
                    style={[m.cardBanco, convocado && m.cardBancoConvocado, semCamisa && convocado && { borderColor: colors.amarelo + '50' }]}
                    onPress={() => toggleConvocado(id)}
                    onLongPress={() => abrirEdicaoCamisa(item)}
                    activeOpacity={0.75}
                  >
                    <View style={[m.camisa, convocado && { backgroundColor: colors.text_secondary + '33' }, semCamisa && convocado && { backgroundColor: colors.amarelo + '20' }]}>
                      {semCamisa && convocado
                        ? <MaterialCommunityIcons name="tshirt-crew-outline" size={16} color={colors.amarelo} />
                        : <Text style={[m.camisaNum, { color: convocado ? colors.text : '#555' }]}>{item.numCamisa ?? '?'}</Text>
                      }
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[m.nome, !convocado && { color: '#555' }]}>{item.nome}</Text>
                      <Text style={m.pos}>{item.posicao}{semCamisa ? ' · Segure p/ definir camisa' : ''}</Text>
                    </View>
                    {convocado ? (
                      <>
                        <View style={m.tagBanco}><Text style={m.tagBancoTxt}>BANCO</Text></View>
                        <MaterialCommunityIcons name="close-circle" size={20} color={colors.vermelho + '88'} />
                      </>
                    ) : (
                      <MaterialCommunityIcons name="plus-circle-outline" size={22} color="#333" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity
            style={[m.salvarBtn, (salvandoEscalacao || disponiveis.length === 0) && { opacity: 0.5 }]}
            onPress={confirmarEscalacao}
            disabled={salvandoEscalacao || disponiveis.length === 0}
          >
            {salvandoEscalacao
              ? <ActivityIndicator color="#fff" />
              : <Text style={m.salvarBtnTxt}>SALVAR · {convocados.length} CONVOCADO{convocados.length !== 1 ? 'S' : ''}</Text>
            }
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      <Modal visible={!!modalCamisa} transparent animationType="fade" onRequestClose={() => setModalCamisa(null)}>
        <View style={mc.overlay}>
          <View style={mc.box}>
            <Text style={mc.titulo}>Número de Camisa</Text>
            <Text style={mc.sub}>{modalCamisa?.nome}</Text>
            <TextInput
              style={mc.input}
              placeholder="Ex: 10"
              placeholderTextColor="#444"
              value={novaCamisa}
              onChangeText={v => setNovaCamisa(v.replace(/\D/g, ''))}
              keyboardType="numeric"
              maxLength={2}
              autoFocus
            />
            <View style={mc.btnRow}>
              <TouchableOpacity style={mc.btnCancel} onPress={() => setModalCamisa(null)}>
                <Text style={mc.btnCancelTxt}>CANCELAR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[mc.btnSave, salvandoCamisa && { opacity: 0.6 }]}
                onPress={salvarCamisa}
                disabled={salvandoCamisa}
              >
                {salvandoCamisa
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={mc.btnSaveTxt}>SALVAR</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ── Estilos da seção de visualização ─────────────────────────────────────────
const sv = {
  section: { paddingHorizontal: 16, paddingVertical: 20, borderTopWidth: 1, borderTopColor: '#1e1e1e' },
  header: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginBottom: 14 },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  bar: { width: 3, height: 16, borderRadius: 2, backgroundColor: colors.primary },
  title: { fontFamily: 'Creato-Bold', color: colors.text, fontSize: 13, letterSpacing: 1 },
  action: { fontFamily: 'Creato-Bold', color: colors.primary, fontSize: 12, letterSpacing: 0.5 },
  subLabel: { fontFamily: 'Creato-Bold', color: colors.azulClaro, fontSize: 11, letterSpacing: 1.2, marginBottom: 8 },
  empty: { alignItems: 'center' as const, paddingVertical: 20, gap: 8 },
  emptyTxt: { fontFamily: 'Creato-Regular', color: '#444', fontSize: 13 },
  emptyBtn: { marginTop: 8, borderWidth: 1, borderColor: colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  emptyBtnTxt: { fontFamily: 'Creato-Bold', color: colors.primary, fontSize: 13 },
};

// ── Estilos do modal de edição de escalação ───────────────────────────────────
const m = {
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  title: { fontFamily: 'Creato-Bold', color: colors.text, fontSize: 15, letterSpacing: 1 },
  counter: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 2 },
  counterNum: { fontFamily: 'Creato-Bold', color: colors.primary, fontSize: 22 },
  counterSep: { fontFamily: 'Creato-Regular', color: '#444', fontSize: 16 },
  counterMax: { fontFamily: 'Creato-Regular', color: '#444', fontSize: 16 },
  dica: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  dicaTxt: { fontFamily: 'Creato-Regular', color: colors.text_secondary, fontSize: 12, flex: 1 },
  empty: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 12, paddingHorizontal: 32 },
  emptyTxt: { fontFamily: 'Creato-Bold', color: colors.text_secondary, fontSize: 14, textAlign: 'center' as const },
  emptySubTxt: { fontFamily: 'Creato-Regular', color: '#444', fontSize: 12, textAlign: 'center' as const },
  sectionHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 10, marginTop: 16 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontFamily: 'Creato-Bold', color: colors.text, fontSize: 12, letterSpacing: 1, flex: 1 },
  sectionCount: { fontFamily: 'Creato-Bold', color: colors.text_secondary, fontSize: 12 },
  cardTitular: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: colors.primary + '12', borderRadius: 12, padding: 12, marginBottom: 8, gap: 10, borderWidth: 1, borderColor: colors.primary + '40' },
  cardBanco: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: '#111', borderRadius: 12, padding: 12, marginBottom: 8, gap: 10, borderWidth: 1, borderColor: '#1e1e1e' },
  cardBancoConvocado: { backgroundColor: '#1a1a1a', borderColor: colors.text_secondary + '40' },
  ordem: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary + '30', alignItems: 'center' as const, justifyContent: 'center' as const },
  ordemNum: { fontFamily: 'Creato-Bold', color: colors.primary, fontSize: 12 },
  camisa: { width: 36, height: 36, borderRadius: 9, backgroundColor: '#252525', alignItems: 'center' as const, justifyContent: 'center' as const },
  camisaNum: { fontFamily: 'Creato-Bold', color: colors.text, fontSize: 14 },
  nome: { fontFamily: 'Creato-Bold', color: colors.text, fontSize: 14 },
  pos:  { fontFamily: 'Creato-Regular', color: colors.text_secondary, fontSize: 11, marginTop: 1 },
  tagTitular: { backgroundColor: colors.primary + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagTitularTxt: { fontFamily: 'Creato-Bold', color: colors.primary, fontSize: 10 },
  tagBanco: { backgroundColor: colors.text_secondary + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagBancoTxt: { fontFamily: 'Creato-Bold', color: colors.text_secondary, fontSize: 10 },
  slotVazio: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, backgroundColor: '#0d0d0d', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#1a1a1a', borderStyle: 'dashed' as const },
  slotVazioTxt: { fontFamily: 'Creato-Regular', color: '#333', fontSize: 12 },
  salvarBtn: { margin: 16, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center' as const },
  salvarBtnTxt: { fontFamily: 'Creato-Bold', color: '#FFF', fontSize: 14, letterSpacing: 1 },
};

// ── Estilos do modal de camisa ────────────────────────────────────────────────
const mc = {
  overlay: { flex: 1, backgroundColor: '#000000aa', alignItems: 'center' as const, justifyContent: 'center' as const, padding: 32 },
  box: { backgroundColor: '#1a1a1a', borderRadius: 16, padding: 24, width: '100%' as const, borderWidth: 1, borderColor: '#2a2a2a' },
  titulo: { fontFamily: 'Creato-Bold', color: colors.text, fontSize: 16, marginBottom: 4 },
  sub: { fontFamily: 'Creato-Regular', color: colors.text_secondary, fontSize: 13, marginBottom: 16 },
  input: {
    backgroundColor: '#111', borderRadius: 10, borderWidth: 1, borderColor: '#333',
    color: colors.text, fontFamily: 'Creato-Bold', fontSize: 24,
    paddingVertical: 12, paddingHorizontal: 16, textAlign: 'center' as const, marginBottom: 20,
  },
  btnRow: { flexDirection: 'row' as const, gap: 10 },
  btnCancel: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#333', alignItems: 'center' as const },
  btnCancelTxt: { fontFamily: 'Creato-Bold', color: colors.text_secondary, fontSize: 13 },
  btnSave: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' as const },
  btnSaveTxt: { fontFamily: 'Creato-Bold', color: '#FFF', fontSize: 13 },
};