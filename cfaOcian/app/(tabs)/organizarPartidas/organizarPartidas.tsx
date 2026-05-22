import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal, Pressable, Image, ActivityIndicator } from 'react-native';
import { styles } from '@/src/styles/organizarPartidasStyles';
import { Header } from '@/src/components/Header';
import { colors } from '@/src/theme/colors';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { fetchTimes, fetchCompeticoes, fetchCategorias, criarPartida } from '@/src/services/api';

const ORDEM_SUBS: Record<string, number> = {
  'SUB 7': 1, 'SUB-7': 1, 'SUB 8': 2, 'SUB-8': 2, 'SUB 9': 3, 'SUB-9': 3,
  'SUB 10': 4, 'SUB-10': 4, 'SUB 12': 5, 'SUB-12': 5, 'SUB 14': 6, 'SUB-14': 6,
  'SUB 16': 7, 'SUB-16': 7, 'SUB 18': 8, 'SUB-18': 8,
};

interface Categoria { id: number; nome: string; tipo: 'INICIACAO' | 'BASE'; }
interface Time { id: number; nome: string; escudo: string | null; categoria_id: number; }
interface Competicao { id: number; nome: string; ano: number; }

interface OrganizarPartidasProps {
  onFechar: () => void;
  noModal?: boolean;
}

function EscudoTime({ escudo, nome, size = 40 }: { escudo: string | null; nome: string; size?: number }) {
  if (escudo) {
    return <Image source={{ uri: escudo }} style={{ width: size, height: size, resizeMode: 'contain', borderRadius: size * 0.2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.25, backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2a2a2a' }}>
      <Text style={{ fontFamily: 'Creato-Bold', color: colors.text_secondary, fontSize: size * 0.28 }}>
        {nome.split(' ').map(p => p[0]).join('').slice(0, 3).toUpperCase()}
      </Text>
    </View>
  );
}

export default function OrganizarPartidas({ onFechar, noModal }: OrganizarPartidasProps) {
  const router = useRouter();

  const [times, setTimes] = useState<Time[]>([]);
  const [competicoes, setCompeticoes] = useState<Competicao[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);

  const [tipoFiltro, setTipoFiltro] = useState<'INICIACAO' | 'BASE'>('INICIACAO');
  const [competicaoSelecionada, setCompeticaoSelecionada] = useState<Competicao | null>(null);
  const [modalCompeticao, setModalCompeticao] = useState(false);
  const [modalTime, setModalTime] = useState<'mandante' | 'visitante' | null>(null);
  const [buscaTime, setBuscaTime] = useState('');

  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [mandante, setMandante] = useState<Time | null>(null);
  const [visitante, setVisitante] = useState<Time | null>(null);
  const [data, setData] = useState('');
  const [horario, setHorario] = useState('');
  const [local, setLocal] = useState('');
  const [emCasa, setEmCasa] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    Promise.all([fetchTimes(), fetchCompeticoes(), fetchCategorias()])
      .then(([timesData, competicoesData, categoriasData]) => {
        setTimes(timesData);
        setCompeticoes(competicoesData);
        const catOrdenadas = categoriasData.sort((a: Categoria, b: Categoria) =>
          (ORDEM_SUBS[a.nome.toUpperCase()] ?? 99) - (ORDEM_SUBS[b.nome.toUpperCase()] ?? 99)
        );
        setCategorias(catOrdenadas);
        if (competicoesData.length > 0) setCompeticaoSelecionada(competicoesData[0]);
        const primeiraIniciacao = catOrdenadas.find((c: Categoria) => c.tipo === 'INICIACAO');
        if (primeiraIniciacao) setCategoriaId(primeiraIniciacao.id);
      })
      .catch(console.error)
      .finally(() => setCarregandoDados(false));
  }, []);

  const handleTipoFiltro = (tipo: 'INICIACAO' | 'BASE') => {
    setTipoFiltro(tipo);
    const primeiraDaFase = categorias.find(c => c.tipo === tipo);
    if (primeiraDaFase) setCategoriaId(primeiraDaFase.id);
    setMandante(null);
    setVisitante(null);
  };

  const categoriasFiltradas = categorias.filter(c => c.tipo === tipoFiltro);

  const timesFiltrados = times.filter(t =>
    t.nome.toLowerCase().includes(buscaTime.toLowerCase()) && t.categoria_id === categoriaId
  );

  const selecionarTime = (time: Time) => {
    if (modalTime === 'mandante') setMandante(mandante?.id === time.id ? null : time);
    else setVisitante(visitante?.id === time.id ? null : time);
    setModalTime(null);
    setBuscaTime('');
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
    if (!mandante || !visitante || data.length < 5 || horario.length < 5 || !categoriaId) return;
    setSalvando(true);
    try {
      const [dia, mes] = data.split('/');
      await criarPartida({
        mandante_id: mandante.id,
        visitante_id: visitante.id,
        data: `${new Date().getFullYear()}-${mes}-${dia}`,
        horario,
        local,
        emCasa,
        categoria_id: categoriaId,
        competicao_id: competicaoSelecionada?.id,
      });
      onFechar();
    } catch (e) {
      console.error(e);
    } finally {
      setSalvando(false);
    }
  };

  const isFormValido = mandante && visitante && data.length === 5 && horario.length === 5 && categoriaId !== null;

  return (
    <View style={styles.container}>
      <Header title="ORGANIZAR PARTIDA" showLogo={false} showProfile={false} btnVoltar="arrow-left" onBtnVoltar={onFechar} semSafeArea={noModal} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* COMPETIÇÃO */}
        <Text style={styles.sectionLabel}>COMPETIÇÃO</Text>
        <TouchableOpacity
          style={[styles.dropdownBtn, competicoes.length === 0 && { opacity: 0.5 }]}
          activeOpacity={0.8}
          onPress={() => competicoes.length > 0 && setModalCompeticao(true)}
        >
          <MaterialCommunityIcons name="trophy-outline" size={20} color={colors.azulClaro} />
          <Text style={styles.dropdownText}>
            {carregandoDados ? 'Carregando...' : competicaoSelecionada ? competicaoSelecionada.nome : 'Nenhuma competição cadastrada'}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={20} color={colors.text_secondary} />
        </TouchableOpacity>

        {/* CATEGORIA */}
        <Text style={styles.sectionLabel}>CATEGORIA</Text>
        <View style={styles.tipoSwitchContainer}>
          {(['INICIACAO', 'BASE'] as const).map(tipo => (
            <TouchableOpacity
              key={tipo}
              style={[styles.tipoSwitchBtn, tipoFiltro === tipo && styles.tipoSwitchBtnAtivo]}
              onPress={() => handleTipoFiltro(tipo)}
            >
              <Text style={[styles.tipoSwitchTxt, tipoFiltro === tipo && styles.tipoSwitchTxtAtivo]}>
                {tipo === 'INICIACAO' ? 'INICIAÇÃO' : 'BASE'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
          {categoriasFiltradas.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.pill, categoriaId === cat.id && styles.pillActive]}
              onPress={() => { setCategoriaId(cat.id); setMandante(null); setVisitante(null); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.pillText, categoriaId === cat.id && styles.pillTextActive]}>{cat.nome}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* CONFRONTO */}
        <Text style={styles.sectionLabel}>CONFRONTO</Text>
        <View style={styles.confrontoContainer}>
          {(['mandante', 'visitante'] as const).map((tipo, index) => {
            const time = tipo === 'mandante' ? mandante : visitante;
            return (
              <React.Fragment key={tipo}>
                <TouchableOpacity
                  style={[styles.timeCard, time !== null && styles.timeCardSelecionado]}
                  activeOpacity={0.8}
                  onPress={() => setModalTime(tipo)}
                >
                  {time === null ? (
                    <>
                      <View style={styles.addIconCircle}>
                        <MaterialCommunityIcons name="plus" size={26} color={colors.primary} />
                      </View>
                      <Text style={styles.timeCardLabel}>{tipo === 'mandante' ? 'MANDANTE' : 'VISITANTE'}</Text>
                      <Text style={[styles.timeCardSub, { color: colors.primary + 'aa' }]}>Selecionar time</Text>
                    </>
                  ) : (
                    <>
                      <EscudoTime escudo={time.escudo} nome={time.nome} size={48} />
                      <Text style={styles.timeCardLabel}>{tipo === 'mandante' ? 'MANDANTE' : 'VISITANTE'}</Text>
                      <Text style={styles.timeCardNome} numberOfLines={2}>{time.nome}</Text>
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
            <TouchableOpacity
              key={opt.label}
              style={[styles.mandoBtn, emCasa === opt.value && styles.mandoBtnAtivo]}
              onPress={() => setEmCasa(opt.value)}
              activeOpacity={0.8}
            >
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
          <TouchableOpacity><Text style={styles.explorarText}>EXPLORAR</Text></TouchableOpacity>
        </View>

        {/* SALVAR */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={salvar}
          style={[styles.salvarBtn, !isFormValido && { opacity: 0.4 }]}
          disabled={!isFormValido || salvando}
        >
          <LinearGradient colors={['#006AFF', '#009FFF']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.salvarGradient}>
            {salvando ? <ActivityIndicator color="#FFF" /> : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="check" size={18} color="#FFF" />
                <Text style={styles.salvarText}>SALVAR PARTIDA</Text>
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* MODAL COMPETIÇÃO */}
      <Modal visible={modalCompeticao} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setModalCompeticao(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecione a Competição</Text>
              <TouchableOpacity onPress={() => setModalCompeticao(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            {competicoes.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.modalItem, competicaoSelecionada?.id === c.id && styles.modalItemActive]}
                onPress={() => { setCompeticaoSelecionada(c); setModalCompeticao(false); }}
              >
                <MaterialCommunityIcons name="trophy-outline" size={18} color={competicaoSelecionada?.id === c.id ? colors.azulClaro : colors.text_secondary} />
                <Text style={[styles.modalItemText, competicaoSelecionada?.id === c.id && styles.modalItemTextActive, { flex: 1 }]}>{c.nome}</Text>
                {competicaoSelecionada?.id === c.id && <MaterialCommunityIcons name="check" size={18} color={colors.azulClaro} />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* MODAL TIME */}
      <Modal visible={modalTime !== null} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => { setModalTime(null); setBuscaTime(''); }}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {modalTime === 'mandante' ? 'Selecionar Mandante' : 'Selecionar Visitante'}
              </Text>
              <TouchableOpacity onPress={() => { setModalTime(null); setBuscaTime(''); }}>
                <MaterialCommunityIcons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={[styles.inputRow, { marginBottom: 12 }]}>
              <MaterialCommunityIcons name="magnify" size={18} color={colors.text_secondary} />
              <TextInput
                style={[styles.inputText, { flex: 1 }]}
                placeholder="Buscar time..."
                placeholderTextColor={colors.text_secondary}
                value={buscaTime}
                onChangeText={setBuscaTime}
                autoFocus
              />
              {buscaTime.length > 0 && (
                <TouchableOpacity onPress={() => setBuscaTime('')}>
                  <MaterialCommunityIcons name="close-circle" size={16} color={colors.text_secondary} />
                </TouchableOpacity>
              )}
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {carregandoDados ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
              ) : timesFiltrados.length === 0 ? (
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
                      {sel && <MaterialCommunityIcons name="check" size={18} color={colors.azulClaro} />}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}