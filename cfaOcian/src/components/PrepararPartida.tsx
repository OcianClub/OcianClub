import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, TextInput, StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';
import { Header } from '@/src/components/Header';
import {
  fetchJogadoresParaEscalacao,
  salvarEscalacaoPartida,
  atualizarStatusPartida,
} from '@/src/services/api';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Time { id: number; nome: string; }
interface Categoria { id: number; nome: string; }
interface Competicao { id: number; nome: string; ano: number; tipo: 'INICIACAO' | 'BASE'; }

interface Partida {
  id: number;
  mandante: Time;
  visitante: Time;
  categoria: Categoria;
  competicao_id?: number | null;
  horario?: string | null;
  data: string;
  local?: string | null;
  emCasa: boolean;
}

interface JogadorDisponivel {
  id_jogador: number;
  nome: string;
  posicao: string;
  numCamisa: number | null;
}

interface EstadoJogador {
  presente: boolean;
  titular: boolean;
  camisa: string; // string para TextInput fácil
}

interface Props {
  partida: Partida;
  competicao: Competicao;
  onFechar: () => void;
  onConfirmado: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Sub-12 para baixo: camisa fixa (vem do cadastro)
const SUBS_CAMISA_FIXA = ['sub-7', 'sub-8', 'sub-9', 'sub-10', 'sub-12'];

function camisaFixa(nomeCategoria: string) {
  return SUBS_CAMISA_FIXA.some(s => nomeCategoria.toLowerCase().includes(s.replace('-', ''))) ||
    SUBS_CAMISA_FIXA.some(s => nomeCategoria.toLowerCase().includes(s));
}

function nomeCurto(nome: string) {
  const partes = nome.trim().split(' ');
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1]}`;
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function PrepararPartida({ partida, competicao, onFechar, onConfirmado }: Props) {
  const [jogadores,    setJogadores]    = useState<JogadorDisponivel[]>([]);
  const [estado,       setEstado]       = useState<Record<number, EstadoJogador>>({});
  const [carregando,   setCarregando]   = useState(true);
  const [salvando,     setSalvando]     = useState(false);

  const fixaCamisa = camisaFixa(partida.categoria.nome);

  // ── Carrega elenco disponível ─────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await fetchJogadoresParaEscalacao(
        partida.categoria.id,
        partida.competicao_id ?? null,
      );
      setJogadores(lista);

      // Estado inicial: todos ausentes, não titulares, camisa = do cadastro
      const inicial: Record<number, EstadoJogador> = {};
      lista.forEach(j => {
        inicial[j.id_jogador] = {
          presente: false,
          titular:  false,
          camisa:   j.numCamisa != null ? String(j.numCamisa) : '',
        };
      });
      setEstado(inicial);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setCarregando(false);
    }
  }, [partida.categoria.id, partida.competicao_id]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Derivações ─────────────────────────────────────────────────────────────
  const presentes   = jogadores.filter(j => estado[j.id_jogador]?.presente);
  const titulares   = presentes.filter(j => estado[j.id_jogador]?.titular);
  const reservas    = presentes.filter(j => !estado[j.id_jogador]?.titular);

  // ── Ações de estado ────────────────────────────────────────────────────────
  const togglePresente = (id: number) => {
    setEstado(prev => {
      const atual = prev[id];
      // ao desmarcar presença, remove titular também
      return { ...prev, [id]: { ...atual, presente: !atual.presente, titular: false } };
    });
  };

  const toggleTitular = (id: number) => {
    setEstado(prev => {
      const atual = prev[id];
      if (!atual.presente) return prev; // não pode ser titular sem estar presente

      const jaTem5Titulares = titulares.length >= 5 && !atual.titular;
      if (jaTem5Titulares) {
        Alert.alert('Titulares', 'Já há 5 titulares. Remova um antes de adicionar outro.');
        return prev;
      }
      return { ...prev, [id]: { ...atual, titular: !atual.titular } };
    });
  };

  const setCamisa = (id: number, valor: string) => {
    setEstado(prev => ({ ...prev, [id]: { ...prev[id], camisa: valor } }));
  };

  // ── Selecionar / Desmarcar todos ───────────────────────────────────────────
  const toggleTodos = () => {
    const todosPresentes = jogadores.every(j => estado[j.id_jogador]?.presente);
    setEstado(prev => {
      const novo = { ...prev };
      jogadores.forEach(j => {
        novo[j.id_jogador] = {
          ...prev[j.id_jogador],
          presente: !todosPresentes,
          titular:  false,
        };
      });
      return novo;
    });
  };

  // ── Confirmar escalação ────────────────────────────────────────────────────
  const confirmar = async () => {
    if (presentes.length === 0) {
      return Alert.alert('Atenção', 'Selecione ao menos 1 jogador presente.');
    }
    if (titulares.length !== 5) {
      return Alert.alert('Atenção', `Marque exatamente 5 titulares. (${titulares.length}/5)`);
    }

    // Valida camisas para subs rotativos
    if (!fixaCamisa) {
      for (const j of presentes) {
        const camisa = estado[j.id_jogador]?.camisa?.trim();
        if (!camisa || isNaN(Number(camisa))) {
          return Alert.alert('Atenção', `Defina o número de camisa para ${nomeCurto(j.nome)}.`);
        }
      }
      // Duplicatas de camisa
      const camisas = presentes.map(j => estado[j.id_jogador].camisa.trim());
      const set = new Set(camisas);
      if (set.size !== camisas.length) {
        return Alert.alert('Atenção', 'Dois jogadores com o mesmo número de camisa.');
      }
    }

    setSalvando(true);
    try {
      const payload = presentes.map(j => ({
        jogador_id: j.id_jogador,
        titular:    estado[j.id_jogador].titular,
        numCamisa:  fixaCamisa
          ? (j.numCamisa ?? 0)
          : Number(estado[j.id_jogador].camisa.trim()),
      }));

      await salvarEscalacaoPartida(partida.id, payload);
      await atualizarStatusPartida(partida.id, 'PREPARADA');
      onConfirmado();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setSalvando(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderJogador = (j: JogadorDisponivel) => {
    const st        = estado[j.id_jogador];
    if (!st) return null;
    const presente  = st.presente;
    const titular   = st.titular;

    return (
      <View
        key={j.id_jogador}
        style={[
          styles.cardJogador,
          presente && { borderColor: titular ? colors.primary : colors.azulClaro, backgroundColor: titular ? colors.primary + '10' : colors.azulClaro + '08' },
        ]}
      >
        {/* Presença */}
        <TouchableOpacity onPress={() => togglePresente(j.id_jogador)} style={styles.checkBox}>
          <MaterialCommunityIcons
            name={presente ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={24}
            color={presente ? colors.primary : '#444'}
          />
        </TouchableOpacity>

        {/* Info */}
        <View style={styles.jogadorInfo}>
          <Text style={[styles.jogadorNome, !presente && { color: '#555' }]} numberOfLines={1}>
            {nomeCurto(j.nome)}
          </Text>
          <Text style={styles.jogadorPosicao}>{j.posicao}</Text>
        </View>

        {/* Camisa — só para presentes */}
        {presente && (
          fixaCamisa ? (
            <View style={styles.camisaBadge}>
              <Text style={styles.camisaBadgeTxt}>#{j.numCamisa ?? '—'}</Text>
            </View>
          ) : (
            <TextInput
              style={styles.camisaInput}
              placeholder="#"
              placeholderTextColor="#555"
              value={st.camisa}
              onChangeText={v => setCamisa(j.id_jogador, v.replace(/\D/g, ''))}
              keyboardType="numeric"
              maxLength={2}
            />
          )
        )}

        {/* Titular toggle — só para presentes */}
        {presente && (
          <TouchableOpacity
            onPress={() => toggleTitular(j.id_jogador)}
            style={[styles.titularBtn, titular && styles.titularBtnAtivo]}
          >
            <MaterialCommunityIcons
              name={titular ? 'star' : 'star-outline'}
              size={20}
              color={titular ? '#facc15' : '#444'}
            />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Header
        title="PREPARAR PARTIDA"
        showLogo={false}
        showProfile={false}
        btnVoltar="arrow-left"
        onBtnVoltar={onFechar}
      />

      {/* ── Info do jogo ── */}
      <View style={styles.infoBar}>
        <Text style={styles.infoBarTimes} numberOfLines={1}>
          {partida.mandante.nome} × {partida.visitante.nome}
        </Text>
        <Text style={styles.infoBarSub}>
          {partida.categoria.nome}
          {partida.horario ? `  •  ${partida.horario}` : ''}
          {partida.local   ? `  •  ${partida.local}`   : ''}
        </Text>
      </View>

      {/* ── Contador ── */}
      <View style={styles.contador}>
        <View style={styles.contadorItem}>
          <Text style={styles.contadorNum}>{presentes.length}</Text>
          <Text style={styles.contadorLabel}>Presentes</Text>
        </View>
        <View style={styles.contadorSep} />
        <View style={styles.contadorItem}>
          <Text style={[styles.contadorNum, { color: titulares.length === 5 ? '#22c55e' : colors.primary }]}>
            {titulares.length}/5
          </Text>
          <Text style={styles.contadorLabel}>Titulares</Text>
        </View>
        <View style={styles.contadorSep} />
        <View style={styles.contadorItem}>
          <Text style={styles.contadorNum}>{reservas.length}</Text>
          <Text style={styles.contadorLabel}>Reservas</Text>
        </View>
      </View>

      {/* ── Legenda ── */}
      {!fixaCamisa && (
        <View style={styles.legenda}>
          <MaterialCommunityIcons name="information-outline" size={13} color="#666" />
          <Text style={styles.legendaTxt}>Defina o nº de camisa para cada atleta presente.</Text>
        </View>
      )}

      {carregando ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.lista}
          showsVerticalScrollIndicator={false}
        >
          {/* Botão selecionar todos */}
          <TouchableOpacity style={styles.btnTodos} onPress={toggleTodos}>
            <MaterialCommunityIcons
              name={jogadores.every(j => estado[j.id_jogador]?.presente) ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={20}
              color={colors.azulClaro}
            />
            <Text style={styles.btnTodosTxt}>
              {jogadores.every(j => estado[j.id_jogador]?.presente) ? 'Desmarcar todos' : 'Todos presentes'}
            </Text>
          </TouchableOpacity>

          {jogadores.length === 0 ? (
            <View style={styles.vazio}>
              <MaterialCommunityIcons name="account-off-outline" size={44} color="#333" />
              <Text style={styles.vazioTxt}>Nenhum atleta convocado neste sub.</Text>
              <Text style={[styles.vazioTxt, { fontSize: 12, marginTop: 4 }]}>
                Adicione jogadores ao elenco do campeonato antes de preparar.
              </Text>
            </View>
          ) : (
            jogadores.map(renderJogador)
          )}

          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {/* ── Botão confirmar ── */}
      {!carregando && (
        <View style={styles.rodape}>
          <TouchableOpacity
            style={[styles.btnConfirmar, salvando && { opacity: 0.6 }]}
            onPress={confirmar}
            disabled={salvando}
            activeOpacity={0.85}
          >
            {salvando ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <MaterialCommunityIcons name="clipboard-check-outline" size={20} color="#FFF" />
                <Text style={styles.btnConfirmarTxt}>CONFIRMAR ESCALAÇÃO</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#0d0d0d' },

  infoBar:          { backgroundColor: '#161616', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1f1f1f' },
  infoBarTimes:     { color: colors.text, fontFamily: 'Creato-Bold', fontSize: 15 },
  infoBarSub:       { color: colors.text_secondary, fontSize: 12, marginTop: 2 },

  contador:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#1f1f1f', gap: 0 },
  contadorItem:     { flex: 1, alignItems: 'center' },
  contadorNum:      { color: colors.text, fontFamily: 'Creato-Bold', fontSize: 22 },
  contadorLabel:    { color: colors.text_secondary, fontSize: 11, marginTop: 1 },
  contadorSep:      { width: 1, height: 32, backgroundColor: '#222' },

  legenda:          { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#111' },
  legendaTxt:       { color: '#666', fontSize: 12 },

  lista:            { paddingHorizontal: 16, paddingTop: 12 },

  btnTodos:         { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#222', backgroundColor: '#161616', marginBottom: 12 },
  btnTodosTxt:      { color: colors.azulClaro, fontFamily: 'Creato-Bold', fontSize: 13 },

  cardJogador: {
    flexDirection:  'row',
    alignItems:     'center',
    backgroundColor: '#141414',
    borderRadius:   10,
    borderWidth:    1,
    borderColor:    '#222',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom:   8,
    gap: 10,
  },

  checkBox:         { padding: 2 },

  jogadorInfo:      { flex: 1, minWidth: 0 },
  jogadorNome:      { color: colors.text, fontFamily: 'Creato-Bold', fontSize: 14 },
  jogadorPosicao:   { color: colors.text_secondary, fontSize: 11, marginTop: 1 },

  camisaBadge:      { backgroundColor: '#222', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  camisaBadgeTxt:   { color: colors.text_secondary, fontFamily: 'Creato-Bold', fontSize: 13 },

  camisaInput: {
    backgroundColor: '#1a1a1a',
    borderRadius:    6,
    borderWidth:     1,
    borderColor:     '#333',
    color:           colors.text,
    fontFamily:      'Creato-Bold',
    fontSize:        13,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width:           40,
    textAlign:       'center',
  },

  titularBtn:       { padding: 6, borderRadius: 6, backgroundColor: '#1a1a1a' },
  titularBtnAtivo:  { backgroundColor: '#facc1518' },

  vazio:            { alignItems: 'center', paddingVertical: 40 },
  vazioTxt:         { color: '#555', textAlign: 'center', fontSize: 14, marginTop: 10 },

  rodape: {
    position:       'absolute',
    bottom:         0, left: 0, right: 0,
    padding:        16,
    backgroundColor: '#0d0d0d',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  btnConfirmar: {
    backgroundColor: '#a855f7',
    borderRadius:    12,
    paddingVertical: 14,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
  },
  btnConfirmarTxt:  { color: '#FFF', fontFamily: 'Creato-Bold', fontSize: 14, letterSpacing: 0.5 },
});