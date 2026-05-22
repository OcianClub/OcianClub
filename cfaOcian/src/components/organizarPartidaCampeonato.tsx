// cfaOcian/src/components/OrganizarPartidaCampeonato.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  Modal, Pressable, Image, ActivityIndicator, Alert,
} from 'react-native';
import { Header } from '@/src/components/Header';
import { colors } from '@/src/theme/colors';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchTimes, fetchCategorias, criarPartida, atualizarPartida } from '@/src/services/api';
import { styles } from '@/src/styles/organizarPartidaCampeonatoStyles';

interface Categoria { id: number; nome: string; tipo: 'INICIACAO' | 'BASE'; }
interface Time { id: number; nome: string; escudo: string | null; categoria_id: number; }
interface Competicao { id: number; nome: string; ano: number; tipo: 'INICIACAO' | 'BASE'; }

interface PartidaExistente {
  id: number; rodada: number | null; grupo: string | null;
  data: string; horario: string | null; local: string | null; emCasa: boolean;
  mandante: Time; visitante: Time; categoria: { id: number; nome: string };
}

interface Props {
  competicao: Competicao; partida?: PartidaExistente;
  onFechar: () => void; onSalvo: () => void;
}

const ORDEM_SUBS: Record<string, number> = {
  'SUB 7': 1,'SUB-7': 1,'SUB 8': 2,'SUB-8': 2,'SUB 9': 3,'SUB-9': 3,
  'SUB 10': 4,'SUB-10': 4,'SUB 12': 5,'SUB-12': 5,'SUB 14': 6,'SUB-14': 6,
  'SUB 16': 7,'SUB-16': 7,'SUB 18': 8,'SUB-18': 8,
};
const GRUPOS = ['A', 'B', 'C', 'D'];

function EscudoTime({ escudo, nome, size = 40 }: { escudo: string | null; nome: string; size?: number }) {
  if (escudo) return <Image source={{ uri: escudo }} style={{ width: size, height: size, resizeMode: 'contain', borderRadius: size * 0.2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.25, backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2a2a2a' }}>
      <Text style={{ color: colors.text_secondary, fontFamily: 'Creato-Bold', fontSize: size * 0.28 }}>
        {nome.split(' ').map(p => p[0]).join('').slice(0, 3).toUpperCase()}
      </Text>
    </View>
  );
}

function dataParaInput(dataStr: string): string {
  const [, mes, dia] = dataStr.split('T')[0].split('-');
  return `${dia}/${mes}`;
}

export default function OrganizarPartidaCampeonato({ competicao, partida, onFechar, onSalvo }: Props) {
  const modoEdicao = !!partida;
  const [times, setTimes] = useState<Time[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [categoriaId, setCategoriaId] = useState<number | null>(partida?.categoria.id ?? null);
  const [mandante, setMandante] = useState<Time | null>(partida?.mandante ?? null);
  const [visitante, setVisitante] = useState<Time | null>(partida?.visitante ?? null);
  const [modalTime, setModalTime] = useState<'mandante' | 'visitante' | null>(null);
  const [buscaTime, setBuscaTime] = useState('');
  const [rodada, setRodada] = useState(partida?.rodada ? String(partida.rodada) : '');
  const [grupo, setGrupo] = useState<string | null>(partida?.grupo ?? null);
  const [data, setData] = useState(partida?.data ? dataParaInput(partida.data) : '');
  const [horario, setHorario] = useState(partida?.horario ?? '');
  const [local, setLocal] = useState(partida?.local ?? '');
  const [emCasa, setEmCasa] = useState(partida?.emCasa ?? true);
  const [salvando, setSalvando] = useState(false);
  const ehBase = competicao.tipo === 'BASE';

  useEffect(() => {
    Promise.all([fetchTimes(), fetchCategorias()])
      .then(([timesData, catData]) => {
        setTimes(timesData);
        const catFiltradas: Categoria[] = catData
          .filter((c: Categoria) => c.tipo === competicao.tipo)
          .sort((a: Categoria, b: Categoria) => (ORDEM_SUBS[a.nome.toUpperCase()] ?? 99) - (ORDEM_SUBS[b.nome.toUpperCase()] ?? 99));
        setCategorias(catFiltradas);
        if (!partida && catFiltradas.length > 0) setCategoriaId(catFiltradas[0].id);
      })
      .catch(console.error)
      .finally(() => setCarregando(false));
  }, []);

  const timesFiltrados = times.filter(t =>
    t.categoria_id === categoriaId && t.nome.toLowerCase().includes(buscaTime.toLowerCase())
  );

  const selecionarTime = (time: Time) => {
    if (modalTime === 'mandante') setMandante(time); else setVisitante(time);
    setModalTime(null); setBuscaTime('');
  };

  const handleDataChange = (text: string) => {
    const n = text.replace(/\D/g, '');
    setData(n.length > 2 ? `${n.slice(0, 2)}/${n.slice(2, 4)}` : n);
  };

  const handleHorarioChange = (text: string) => {
    const n = text.replace(/\D/g, '');
    setHorario(n.length > 2 ? `${n.slice(0, 2)}:${n.slice(2, 4)}` : n);
  };

  const salvar = async () => {
    if (!mandante || !visitante || !categoriaId || !rodada) return;
    if (data.length < 5 || horario.length < 5) return;
    if (ehBase && !grupo) return Alert.alert('Atenção', 'Selecione o grupo da partida.');
    setSalvando(true);
    try {
      const [dia, mes] = data.split('/');
      const dataISO = `${new Date().getFullYear()}-${mes}-${dia}`;
      if (modoEdicao && partida) {
        await atualizarPartida(partida.id, { mandante_id: mandante.id, visitante_id: visitante.id, data: dataISO, horario, local, emCasa, categoria_id: categoriaId, rodada: Number(rodada), grupo: grupo ?? undefined });
      } else {
        await criarPartida({ mandante_id: mandante.id, visitante_id: visitante.id, data: dataISO, horario, local, emCasa, categoria_id: categoriaId, competicao_id: competicao.id, rodada: Number(rodada), grupo: grupo ?? undefined });
      }
      onSalvo(); onFechar();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível salvar.');
    } finally { setSalvando(false); }
  };

  const isValido = !!(mandante && visitante && categoriaId && rodada && data.length === 5 && horario.length === 5 && (!ehBase || grupo));

  return (
    <View style={styles.container}>
      <Header title={modoEdicao ? 'EDITAR PARTIDA' : competicao.nome} showLogo={false} showProfile={false} btnVoltar="arrow-left" onBtnVoltar={onFechar} semSafeArea />

      {/* Banner edição */}
      {modoEdicao && (
        <View style={styles.editBanner}>
          <MaterialCommunityIcons name="pencil-circle" size={15} color={colors.amarelo} />
          <Text style={styles.editBannerTxt}>{competicao.nome} • Rodada {partida?.rodada ?? '—'}</Text>
        </View>
      )}

      {carregando ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingTxt}>Carregando dados...</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingTop: 6, paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">

          {/* CATEGORIA */}
          <Text style={styles.sectionLabel}>CATEGORIA</Text>
          {modoEdicao ? (
            <View style={styles.categoriaLocked}>
              <MaterialCommunityIcons name="lock-outline" size={14} color="#444" />
              <Text style={styles.categoriaLockedNome}>{categorias.find(c => c.id === categoriaId)?.nome ?? partida?.categoria.nome}</Text>
              <Text style={styles.categoriaLockedSub}>Não pode ser alterada</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              {categorias.map(cat => (
                <TouchableOpacity key={cat.id} style={[styles.pill, categoriaId === cat.id && styles.pillActive]}
                  onPress={() => { setCategoriaId(cat.id); setMandante(null); setVisitante(null); }}>
                  <Text style={[styles.pillText, categoriaId === cat.id && styles.pillTextActive]}>{cat.nome}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* RODADA */}
          <Text style={styles.sectionLabel}>RODADA</Text>
          <View style={styles.stepperContainer}>
            <TouchableOpacity
              style={[styles.stepperBtn, Number(rodada) > 1 && styles.stepperBtnAtivo, Number(rodada) <= 1 && styles.stepperBtnDisabled]}
              onPress={() => setRodada(r => String(Math.max(1, Number(r) - 1)))}
              disabled={Number(rodada) <= 1}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="minus" size={18} color={Number(rodada) > 1 ? colors.primary : colors.text_secondary} />
            </TouchableOpacity>
            <View style={styles.stepperDivider} />
            <View style={styles.stepperValue}>
              <Text style={[styles.stepperValueTxt, Number(rodada) === 0 && styles.stepperValueZero]}>
                {rodada || '—'}
              </Text>
            </View>
            <View style={styles.stepperDivider} />
            <TouchableOpacity
              style={[styles.stepperBtn, styles.stepperBtnAtivo]}
              onPress={() => setRodada(r => String(Number(r || '0') + 1))}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="plus" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {/* GRUPO */}
          {ehBase && (
            <>
              <Text style={styles.sectionLabel}>GRUPO</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {GRUPOS.map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.grupoPill, grupo === g && styles.grupoPillAtivo]}
                    onPress={() => setGrupo(g)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.grupoPillTxt, grupo === g && styles.grupoPillTxtAtivo]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* CONFRONTO */}
          <Text style={styles.sectionLabel}>CONFRONTO</Text>
          <View style={styles.confrontoContainer}>
            {(['mandante', 'visitante'] as const).map((tipo, index) => {
              const time = tipo === 'mandante' ? mandante : visitante;
              return (
                <React.Fragment key={tipo}>
                  <TouchableOpacity style={[styles.timeCard, time !== null && styles.timeCardSelecionado]} activeOpacity={0.8} onPress={() => setModalTime(tipo)}>
                    {time ? (
                      <>
                        <EscudoTime escudo={time.escudo} nome={time.nome} size={48} />
                        <Text style={styles.timeCardLabel}>{tipo === 'mandante' ? 'MANDANTE' : 'VISITANTE'}</Text>
                        <Text style={styles.timeCardNome} numberOfLines={2}>{time.nome}</Text>
                        <View style={styles.trocarBtn}>
                          <MaterialCommunityIcons name="swap-horizontal" size={11} color={colors.azulClaro} />
                          <Text style={styles.trocarTxt}>TROCAR</Text>
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={[styles.addIconCircle, styles.addCircle]}>
                          <MaterialCommunityIcons name="plus" size={26} color={colors.primary} />
                        </View>
                        <Text style={styles.timeCardLabel}>{tipo === 'mandante' ? 'MANDANTE' : 'VISITANTE'}</Text>
                        <Text style={[styles.timeCardSub, { color: colors.primary + 'aa' }]}>Selecionar time</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {index === 0 && (
                    <LinearGradient colors={['#006AFF', '#009FFF']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.vsBadge}>
                      <Text style={styles.vsText}>VS</Text>
                    </LinearGradient>
                  )}
                </React.Fragment>
              );
            })}
          </View>

          {/* MANDO DE CAMPO */}
          <Text style={styles.sectionLabel}>MANDO DE CAMPO</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[{ label: 'EM CASA', icon: 'home-outline', value: true }, { label: 'FORA', icon: 'bus-side', value: false }].map(opt => (
              <TouchableOpacity key={opt.label} style={[styles.mandoBtn, emCasa === opt.value && styles.mandoBtnAtivo]} onPress={() => setEmCasa(opt.value)} activeOpacity={0.8}>
                <MaterialCommunityIcons name={opt.icon as any} size={18} color={emCasa === opt.value ? colors.primary : colors.text_secondary} />
                <Text style={[styles.mandoTxt, emCasa === opt.value && styles.mandoTxtAtivo]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* DATA + HORÁRIO */}
          <View style={styles.rowDuplo}>
            <View style={styles.halfBlock}>
              <Text style={styles.sectionLabel}>DATA</Text>
              <View style={styles.inputRow}>
                <MaterialCommunityIcons name="calendar-outline" size={18} color={colors.text_secondary} />
                <TextInput style={styles.inputText} placeholder="DD/MM" placeholderTextColor={colors.text_secondary} value={data} onChangeText={handleDataChange} keyboardType="numeric" maxLength={5} />
              </View>
            </View>
            <View style={styles.halfBlock}>
              <Text style={styles.sectionLabel}>HORÁRIO</Text>
              <View style={styles.inputRow}>
                <MaterialCommunityIcons name="clock-outline" size={18} color={colors.text_secondary} />
                <TextInput style={styles.inputText} placeholder="00:00" placeholderTextColor={colors.text_secondary} value={horario} onChangeText={handleHorarioChange} keyboardType="numeric" maxLength={5} />
              </View>
            </View>
          </View>

          {/* LOCAL */}
          <Text style={styles.sectionLabel}>LOCAL DA PARTIDA</Text>
          <View style={styles.inputRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={18} color={colors.text_secondary} />
            <TextInput style={[styles.inputText, { flex: 1 }]} placeholder="Ginásio, quadra ou campo..." placeholderTextColor={colors.text_secondary} value={local} onChangeText={setLocal} />
          </View>

          {/* Resumo pré-salvar */}
          {isValido && (
            <View style={styles.resumoCard}>
              <View style={styles.resumoRow}>
                <MaterialCommunityIcons name="check-circle" size={13} color="#6FCF97" />
                <Text style={styles.resumoTxt} numberOfLines={1}>{mandante?.nome} vs {visitante?.nome}</Text>
              </View>
              <View style={styles.resumoRow}>
                <MaterialCommunityIcons name="check-circle" size={13} color="#6FCF97" />
                <Text style={styles.resumoTxt}>{data} às {horario}{rodada ? ` • Rodada ${rodada}` : ''}{local ? ` • ${local}` : ''}</Text>
              </View>
            </View>
          )}

          {/* BOTÃO SALVAR */}
          <TouchableOpacity activeOpacity={0.85} onPress={salvar} style={[styles.salvarBtn, { marginTop: isValido ? 16 : 32 }, !isValido && { opacity: 0.4 }]} disabled={!isValido || salvando}>
            <LinearGradient colors={['#006AFF', '#009FFF']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.salvarGradient}>
              {salvando ? <ActivityIndicator color="#FFF" /> : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialCommunityIcons name={modoEdicao ? 'content-save-edit-outline' : 'check'} size={18} color="#FFF" />
                  <Text style={styles.salvarText}>{modoEdicao ? 'SALVAR ALTERAÇÕES' : 'SALVAR PARTIDA'}</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* MODAL TIME */}
      <Modal visible={modalTime !== null} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => { setModalTime(null); setBuscaTime(''); }}>
          <Pressable style={[styles.modalContent, { maxHeight: '80%' }]}>
            <View style={styles.handle}><View style={styles.handleBar} /></View>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{modalTime === 'mandante' ? 'Selecionar Mandante' : 'Selecionar Visitante'}</Text>
                <Text style={styles.modalSub}>{categorias.find(c => c.id === categoriaId)?.nome ?? ''}</Text>
              </View>
              <TouchableOpacity onPress={() => { setModalTime(null); setBuscaTime(''); }}>
                <MaterialCommunityIcons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={[styles.inputRow, { marginBottom: 12 }]}>
              <MaterialCommunityIcons name="magnify" size={18} color={colors.text_secondary} />
              <TextInput style={[styles.inputText, { flex: 1 }]} placeholder="Buscar time..." placeholderTextColor={colors.text_secondary} value={buscaTime} onChangeText={setBuscaTime} autoFocus />
              {buscaTime.length > 0 && (
                <TouchableOpacity onPress={() => setBuscaTime('')}>
                  <MaterialCommunityIcons name="close-circle" size={16} color={colors.text_secondary} />
                </TouchableOpacity>
              )}
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {timesFiltrados.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
                  <MaterialCommunityIcons name="shield-off-outline" size={36} color="#2a2a2a" />
                  <Text style={{ fontFamily: 'Creato-Bold', color: '#333', fontSize: 13 }}>Nenhum time encontrado</Text>
                  <Text style={{ fontFamily: 'Creato-Bold', color: '#2a2a2a', fontSize: 11, textAlign: 'center' }}>Cadastre times para esta categoria em Equipes</Text>
                </View>
              ) : (
                timesFiltrados.map(time => {
                  const sel = modalTime === 'mandante' ? mandante?.id === time.id : visitante?.id === time.id;
                  return (
                    <TouchableOpacity key={time.id} style={[styles.modalItem, sel && styles.modalItemActive]} onPress={() => selecionarTime(time)} activeOpacity={0.7}>
                      <EscudoTime escudo={time.escudo} nome={time.nome} size={36} />
                      <Text style={[styles.modalItemText, sel && styles.modalItemTextActive, { flex: 1 }]}>{time.nome}</Text>
                      {sel && <View style={styles.checkBadge}><MaterialCommunityIcons name="check" size={14} color={colors.primary} /></View>}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}