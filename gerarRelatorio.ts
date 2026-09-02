import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from 'pdf-lib';

// ---------- Tipos do payload (schema documentado no README) ----------
export interface Excursao {
  tipo: string;
  nome: string;
  agente: string;
  parque: 'Sitiolândia' | 'Educântaro';
  servico_contratado: string;
  segmento_grafico: string;
  qtd: number;
  cadastro: string;
  manutencao: string;
}

export interface DiaPayload {
  dia: string;
  capacidade_sitiolandia: number;
  capacidade_educantaro: number;
  excursoes: Excursao[];
}

// ---------- Payload real enviado pelo Bubble: duas listas soltas, unidas por data ----------
export interface DiaCapacidade {
  dia: string;
  capacidade_sitiolandia: number;
  capacidade_educantaro: number;
}

export interface ExcursaoComData extends Excursao {
  data: string; // chave de junção — precisa bater com algum "dia" em DiaCapacidade
}

export interface RelatorioPayload {
  periodo_inicio: string;
  periodo_fim: string;
  dias: DiaCapacidade[];
  excursoes: ExcursaoComData[];
}

export class PayloadInvalidoError extends Error {}

// agrupa a lista solta de excursões dentro de cada dia (pelo campo "data"),
// pra reaproveitar o mesmo loop de renderização por dia já validado.
// Só devolve dias que TÊM excursão — dias vazios não geram card (regra já documentada).
function agruparExcursoesPorDia(dias: DiaCapacidade[], excursoes: ExcursaoComData[]): DiaPayload[] {
  const porDia = new Map<string, DiaPayload>();
  for (const d of dias) {
    porDia.set(d.dia, {
      dia: d.dia,
      capacidade_sitiolandia: d.capacidade_sitiolandia,
      capacidade_educantaro: d.capacidade_educantaro,
      excursoes: [],
    });
  }

  const diasFaltando = new Set<string>();
  for (const ex of excursoes) {
    const alvo = porDia.get(ex.data);
    if (!alvo) {
      diasFaltando.add(ex.data);
      continue;
    }
    const { data, ...excursaoSemData } = ex;
    alvo.excursoes.push(excursaoSemData);
  }

  if (diasFaltando.size > 0) {
    throw new PayloadInvalidoError(
      `Excursões referenciam data(s) que não estão na lista "dias": ${[...diasFaltando].join(', ')}. ` +
      `Cada valor usado em "excursoes[].data" precisa ter uma entrada correspondente em "dias[].dia".`
    );
  }

  return [...porDia.values()].filter((d) => d.excursoes.length > 0);
}

// ---------- Tipos internos ----------
type Cor = ReturnType<typeof rgb>;

interface Colunas {
  x0: number;
  largura: number;
  tipo: number;
  nome: number;
  agente: number;
  servico: number;
  qtd: number;
}

interface Segmento {
  nome: string;
  qtd: number;
  cor: Cor;
}

interface TotalParque {
  ocupado: number;
  capacidade: number;
  segmentos: Map<string, number>;
}

interface TextoOpcoes {
  size?: number;
  font?: PDFFont;
  color?: Cor;
}

// unidade mínima de conteúdo dentro de um card de dia — usada pra decidir onde
// o card pode ser cortado entre páginas sem quebrar uma linha ou barra ao meio
type Unidade =
  | { tipo: 'header'; altura: number }
  | { tipo: 'excursao'; altura: number; ex: Excursao }
  | { tipo: 'gapPreBarras'; altura: number }
  | { tipo: 'barra'; altura: number; parque: Excursao['parque']; ocupado: number; capacidade: number; segmentos: Segmento[] };

// ---------- Paleta ----------
const COR_TITULO = rgb(0.10, 0.16, 0.29);
const COR_CINZA_TEXTO = rgb(0.42, 0.45, 0.49);
const COR_CARD_BG = rgb(0.929, 0.937, 0.925); // #edefec
const COR_BARRA_FUNDO = rgb(0.80, 0.81, 0.83);
const COR_BRANCO = rgb(1, 1, 1);
const COR_BULLET_SITIOLANDIA = rgb(0.30, 0.60, 0.28);
const COR_BULLET_EDUCANTARO = rgb(0.35, 0.65, 0.85);

const PALETA_SEGMENTOS: Cor[] = [
  rgb(0.30, 0.60, 0.28),
  rgb(0.18, 0.42, 0.20),
  rgb(0.90, 0.55, 0.13),
  rgb(0.35, 0.65, 0.85),
  rgb(0.55, 0.35, 0.75),
  rgb(0.75, 0.30, 0.30),
];

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

// ---------- Constantes de layout (fonte única pra medir e pra desenhar) ----------
const PAD_CARD = 20;
const RAIO_CARD = 8;
const GAP_APOS_EXCURSOES = 20;
const GAP_DATA_PARA_CARD = 10;
const GAP_ENTRE_DIAS = 20;
const GAP_ENTRE_BARRAS = 20; // separação entre os gráficos de Sitiolândia e Educântaro, quando os dois aparecem no mesmo card/resumo

function parseDataBR(str: string): Date {
  const [d, m, y] = str.split('/').map(Number);
  return new Date(y, m - 1, d);
}

function nomeDiaSemana(str: string): string {
  return DIAS_SEMANA[parseDataBR(str).getDay()];
}

function construirMapaCores(dias: DiaPayload[]): Map<string, Cor> {
  const mapa = new Map<string, Cor>();
  let i = 0;
  for (const dia of dias) {
    for (const ex of dia.excursoes) {
      if (!mapa.has(ex.segmento_grafico)) {
        mapa.set(ex.segmento_grafico, PALETA_SEGMENTOS[i % PALETA_SEGMENTOS.length]);
        i++;
      }
    }
  }
  return mapa;
}

// trunca por LARGURA REAL medida na fonte, não por contagem de caracteres
function truncarPorLargura(texto: string, font: PDFFont, size: number, maxWidth: number): string {
  if (!texto) return '';
  if (font.widthOfTextAtSize(texto, size) <= maxWidth) return texto;
  let low = 0;
  let high = texto.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidato = texto.slice(0, mid) + '…';
    if (font.widthOfTextAtSize(candidato, size) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return low <= 0 ? '…' : texto.slice(0, low) + '…';
}

export async function gerarRelatorioPDF({ periodo_inicio, periodo_fim, dias: diasCapacidade, excursoes: excursoesFlat }: RelatorioPayload): Promise<Uint8Array> {
  const dias = agruparExcursoesPorDia(diasCapacidade, excursoesFlat);

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const larguraPagina = 595.28;
  const alturaPagina = 841.89;
  const margem = 42;
  const larguraUtil = larguraPagina - margem * 2;

  const mapaCores = construirMapaCores(dias);

  const SIZE_STATUS = 7.5;
  const PAD_PILL = 4;
  const ALTURA_TEXTO_STATUS = fontRegular.heightAtSize(SIZE_STATUS); // altura real (ascent+descent)
  const DESCENT_STATUS = ALTURA_TEXTO_STATUS - fontRegular.heightAtSize(SIZE_STATUS, { descender: false });
  const ALTURA_PILL = Math.max(ALTURA_TEXTO_STATUS + PAD_PILL * 2, 17); // 17 = mínimo pra caber o raio de 8

  // gaps calculados pela métrica real da fonte de 9pt (linhas de excursão), pra garantir
  // que o espaço em branco VISÍVEL (não só o deslocamento do baseline) siga o pedido:
  // pouco espaço entre a linha da escola e sua própria pill, e um respiro maior antes da próxima escola.
  const ASCENT_LINHA = fontRegular.heightAtSize(9, { descender: false });
  const DESCENT_LINHA = fontRegular.heightAtSize(9) - ASCENT_LINHA;
  const GAP_VISUAL_LINHA_PILL = 4; // espaço branco visível entre a linha e a pill (pequeno, pill "gruda" na linha)
  const GAP_VISUAL_ENTRE_ESCOLAS_PX = 10; // espaço branco visível entre a pill e a próxima escola (o "10px" pedido)
  const DECREMENTO_PARA_PILL = GAP_VISUAL_LINHA_PILL + DESCENT_LINHA;
  const DECREMENTO_APOS_PILL = GAP_VISUAL_ENTRE_ESCOLAS_PX + ASCENT_LINHA;

  let page: PDFPage = pdfDoc.addPage([larguraPagina, alturaPagina]);
  let y = alturaPagina - margem;
  const paginasRefs: PDFPage[] = [];

  function novaPagina(): void {
    paginasRefs.push(page);
    page = pdfDoc.addPage([larguraPagina, alturaPagina]);
    y = alturaPagina - margem;
  }

  function desenharTexto(texto: string, x: number, yPos: number, opcoes: TextoOpcoes = {}): void {
    const { size = 9, font = fontRegular, color = COR_TITULO } = opcoes;
    page.drawText(texto, { x, y: yPos, size, font, color });
  }

  // retângulo com cantos arredondados SELETIVOS — arredondarTopo/arredondarBase controlam
  // quais bordas ganham o raio; as outras ficam retas (usado quando um card de dia
  // continua na página seguinte: só a borda que é o início/fim REAL do card é arredondada).
  function desenharCardFundo(x: number, yBase: number, largura: number, altura: number, raio: number, cor: Cor, arredondarTopo: boolean, arredondarBase: boolean): void {
    const insetTopo = arredondarTopo ? raio : 0;
    const insetBase = arredondarBase ? raio : 0;
    page.drawRectangle({ x, y: yBase + insetBase, width: largura, height: altura - insetBase - insetTopo, color: cor });
    if (arredondarTopo) {
      page.drawRectangle({ x: x + raio, y: yBase + altura - raio, width: largura - 2 * raio, height: raio, color: cor });
      page.drawCircle({ x: x + raio, y: yBase + altura - raio, size: raio, color: cor });
      page.drawCircle({ x: x + largura - raio, y: yBase + altura - raio, size: raio, color: cor });
    }
    if (arredondarBase) {
      page.drawRectangle({ x: x + raio, y: yBase, width: largura - 2 * raio, height: raio, color: cor });
      page.drawCircle({ x: x + raio, y: yBase + raio, size: raio, color: cor });
      page.drawCircle({ x: x + largura - raio, y: yBase + raio, size: raio, color: cor });
    }
  }

  // retângulo com todos os 4 cantos arredondados (usado pra pill branca, que nunca corta entre páginas)
  function desenharPill(x: number, yBase: number, largura: number, altura: number, raio: number, cor: Cor): void {
    desenharCardFundo(x, yBase, largura, altura, raio, cor, true, true);
  }

  desenharTexto('Manutenções de Agendamentos', margem, y, { size: 18, font: fontBold, color: COR_TITULO });
  y -= 20;
  desenharTexto(`Período selecionado: ${periodo_inicio} a ${periodo_fim}`, margem, y, { size: 11, color: COR_CINZA_TEXTO });
  y -= 30;

  // ---------- Colunas (dentro do card, já descontando padding) ----------
  function calcularColunas(cardX0: number, larguraInterna: number): Colunas {
    return {
      x0: cardX0,
      largura: larguraInterna,
      tipo: cardX0,
      nome: cardX0 + larguraInterna * 0.17,
      agente: cardX0 + larguraInterna * 0.45,
      servico: cardX0 + larguraInterna * 0.66,
      qtd: cardX0 + larguraInterna - 22,
    };
  }

  function corBullet(parque: Excursao['parque']): Cor {
    return parque === 'Educântaro' ? COR_BULLET_EDUCANTARO : COR_BULLET_SITIOLANDIA;
  }

  const ALTURA_BLOCO_BARRA = 12 + 18 + 10;
  const ALTURA_HEADER_TABELA = 10 + 14;
  const ALTURA_EXCURSAO = DECREMENTO_PARA_PILL + ALTURA_PILL + DECREMENTO_APOS_PILL;

  function espacoDisponivel(): number {
    return y - margem;
  }

  function desenharBarra(cols: Colunas, label: string, ocupado: number, capacidade: number, segmentos: Segmento[]): void {
    const restante = Math.max(capacidade - ocupado, 0);
    const barraX = cols.x0 + 90;
    const barraLargura = cols.largura - 90;

    desenharTexto(String(ocupado), barraX, y, { size: 8, color: COR_TITULO });
    if (capacidade > 0) {
      desenharTexto(String(restante), barraX + barraLargura * (ocupado / capacidade) + 8, y, { size: 8, color: COR_TITULO });
    }
    y -= 12;

    desenharTexto(`${label}:`, cols.x0, y + 3, { size: 9, font: fontBold, color: COR_TITULO });
    const barraAltura = 10;
    page.drawRectangle({ x: barraX, y, width: barraLargura, height: barraAltura, color: COR_BARRA_FUNDO });
    let cursorX = barraX;
    if (capacidade > 0) {
      for (const seg of segmentos) {
        const largura = barraLargura * (seg.qtd / capacidade);
        page.drawRectangle({ x: cursorX, y, width: largura, height: barraAltura, color: seg.cor });
        cursorX += largura;
      }
    }
    y -= 18;

    let chipX = barraX;
    for (const seg of segmentos) {
      if (!seg.nome) continue; // segmento sem nome (segmento_grafico vazio) entra na barra, mas não vira chip
      const texto = `${seg.nome} ( ${seg.qtd} )`;
      const largura = fontRegular.widthOfTextAtSize(texto, 7.5) + 12;
      page.drawRectangle({ x: chipX, y: y - 2, width: largura, height: 13, color: seg.cor });
      desenharTexto(texto, chipX + 6, y + 1, { size: 7.5, color: COR_BRANCO });
      chipX += largura + 6;
    }
    y -= 10;
  }

  function desenharCabecalhoTabela(cols: Colunas): void {
    desenharTexto('Tipo', cols.tipo, y, { size: 8, color: COR_CINZA_TEXTO });
    desenharTexto('Nome', cols.nome, y, { size: 8, color: COR_CINZA_TEXTO });
    desenharTexto('Ag. / Rep. / Atendente', cols.agente, y, { size: 8, color: COR_CINZA_TEXTO });
    desenharTexto('Serviço Contratado', cols.servico, y, { size: 8, color: COR_CINZA_TEXTO });
    desenharTexto('QTD', cols.qtd, y, { size: 8, color: COR_CINZA_TEXTO });
    y -= 24;
  }

  // ---------- Monta a lista de "unidades" indivisíveis de um dia (cabeçalho, cada excursão, cada barra) ----------
  function construirUnidades(dia: DiaPayload): Unidade[] {
    const parques = [...new Set(dia.excursoes.map((e) => e.parque))];
    const unidades: Unidade[] = [{ tipo: 'header', altura: ALTURA_HEADER_TABELA }];
    dia.excursoes.forEach((ex, idx) => {
      const ultima = idx === dia.excursoes.length - 1;
      unidades.push({ tipo: 'excursao', altura: DECREMENTO_PARA_PILL + ALTURA_PILL + (ultima ? 0 : DECREMENTO_APOS_PILL), ex });
    });
    unidades.push({ tipo: 'gapPreBarras', altura: GAP_APOS_EXCURSOES });
    parques.forEach((parque, idxParque) => {
      const doParque = dia.excursoes.filter((e) => e.parque === parque);
      const porSegmento = new Map<string, number>();
      for (const ex of doParque) {
        porSegmento.set(ex.segmento_grafico, (porSegmento.get(ex.segmento_grafico) || 0) + ex.qtd);
      }
      const segmentos: Segmento[] = [...porSegmento.entries()].map(([nome, qtd]) => ({ nome, qtd, cor: mapaCores.get(nome)! }));
      const ocupado = segmentos.reduce((acc, s) => acc + s.qtd, 0);
      const capacidade = parque === 'Educântaro' ? dia.capacidade_educantaro : dia.capacidade_sitiolandia;
      const ultimaBarra = idxParque === parques.length - 1;
      unidades.push({ tipo: 'barra', altura: ALTURA_BLOCO_BARRA + (ultimaBarra ? 0 : GAP_ENTRE_BARRAS), parque, ocupado, capacidade, segmentos });
    });
    return unidades;
  }

  function desenharUnidade(cols: Colunas, unidade: Unidade): void {
    switch (unidade.tipo) {
      case 'header':
        desenharCabecalhoTabela(cols);
        break;
      case 'excursao': {
        const yAntes = y;
        desenharLinhaExcursaoSemGapExtra(cols, unidade.ex);
        const consumidoReal = yAntes - y;
        y -= unidade.altura - consumidoReal; // desconta o gap restante (embutido na altura, mas não no desenho em si)
        break;
      }
      case 'gapPreBarras':
        y -= unidade.altura;
        break;
      case 'barra': {
        const yAntes = y;
        desenharBarra(cols, unidade.parque, unidade.ocupado, unidade.capacidade, unidade.segmentos);
        const consumidoReal = yAntes - y;
        y -= unidade.altura - consumidoReal; // desconta o gap extra entre parques, se houver (embutido na altura)
        break;
      }
    }
  }

  // variante de desenharLinhaExcursao que não decide sozinha se é a última — o gap posterior
  // já foi contabilizado (ou não) na altura da unidade, então aqui só desenhamos e nunca subtraímos de novo.
  function desenharLinhaExcursaoSemGapExtra(cols: Colunas, ex: Excursao): void {
    const larguraTipo = cols.nome - cols.tipo - 8;
    const larguraNome = cols.agente - cols.nome - 8;
    const larguraAgente = cols.servico - cols.agente - 16;
    const larguraServico = cols.qtd - cols.servico - 8;

    page.drawCircle({ x: cols.servico - 8, y: y + 3, size: 3, color: corBullet(ex.parque) });
    desenharTexto(truncarPorLargura(ex.tipo, fontRegular, 9, larguraTipo), cols.tipo, y, { size: 9 });
    desenharTexto(truncarPorLargura(ex.nome, fontRegular, 9, larguraNome), cols.nome, y, { size: 9 });
    desenharTexto(truncarPorLargura(ex.agente, fontRegular, 9, larguraAgente), cols.agente, y, { size: 9 });
    desenharTexto(truncarPorLargura(ex.servico_contratado, fontRegular, 9, larguraServico), cols.servico, y, { size: 9 });
    desenharTexto(String(ex.qtd), cols.qtd, y, { size: 9 });
    y -= DECREMENTO_PARA_PILL;
    const textoStatus = `Data do Cadastro: ${ex.cadastro}  |  Status da Manutenção: ${ex.manutencao}`;
    const larguraTexto = fontRegular.widthOfTextAtSize(textoStatus, SIZE_STATUS);
    const larguraPill = larguraTexto + PAD_PILL * 2;
    desenharPill(cols.tipo - PAD_PILL, y - ALTURA_PILL, larguraPill, ALTURA_PILL, 8, COR_BRANCO);
    desenharTexto(textoStatus, cols.tipo, y - (ALTURA_PILL - PAD_PILL - DESCENT_STATUS), { size: SIZE_STATUS, color: COR_CINZA_TEXTO });
    y -= ALTURA_PILL;
  }

  // ---------- Loop dos dias — cada dia pode se dividir em vários "fragmentos" entre páginas ----------
  for (const dia of dias) {
    const unidades = construirUnidades(dia);
    let idx = 0;
    let primeiroFragmento = true;

    while (idx < unidades.length) {
      const alturaTitulo = primeiroFragmento ? GAP_DATA_PARA_CARD + 8 : 16;

      // no primeiro fragmento de um dia, exige cabeçalho + pelo menos 1 excursão —
      // nunca deixa um card começar só com o cabeçalho da tabela e nenhuma linha (fica parecendo quebrado).
      // Em fragmentos de continuação, 1 unidade já basta.
      const minimoNecessario = primeiroFragmento && unidades.length > 1
        ? unidades[idx].altura + unidades[idx + 1].altura
        : unidades[idx].altura;

      if (y - margem - alturaTitulo - PAD_CARD < minimoNecessario) {
        novaPagina();
      }

      if (primeiroFragmento) {
        desenharTexto(dia.dia, margem, y, { size: 12, font: fontBold, color: COR_TITULO });
        desenharTexto(nomeDiaSemana(dia.dia), margem + 75, y, { size: 8, color: COR_CINZA_TEXTO });
        y -= GAP_DATA_PARA_CARD + 8;
      } else {
        desenharTexto(`${dia.dia} (continuação)`, margem, y, { size: 9, color: COR_CINZA_TEXTO });
        y -= 16;
      }

      const topoFragmento = y;
      const espacoParaConteudo = y - margem - PAD_CARD;

      const alturaTotalRestante = unidades.slice(idx).reduce((acc, u) => acc + u.altura, 0);
      const ehUltimoFragmento = alturaTotalRestante + PAD_CARD <= espacoParaConteudo;

      let fim: number;
      let alturaUsada: number;
      if (ehUltimoFragmento) {
        fim = unidades.length;
        alturaUsada = alturaTotalRestante;
      } else {
        let acumulado = 0;
        let j = idx;
        while (j < unidades.length && acumulado + unidades[j].altura <= espacoParaConteudo) {
          acumulado += unidades[j].altura;
          j++;
        }
        fim = Math.max(j, idx + 1); // garante progresso mínimo de 1 unidade por fragmento
        alturaUsada = acumulado;
      }

      const alturaFragmentoCard = PAD_CARD + alturaUsada + (ehUltimoFragmento ? PAD_CARD : 0);
      desenharCardFundo(margem, topoFragmento - alturaFragmentoCard, larguraUtil, alturaFragmentoCard, RAIO_CARD, COR_CARD_BG, primeiroFragmento, ehUltimoFragmento);

      y -= PAD_CARD;
      const cardX0 = margem + PAD_CARD;
      const larguraInterna = larguraUtil - PAD_CARD * 2;
      const cols = calcularColunas(cardX0, larguraInterna);

      for (let k = idx; k < fim; k++) {
        desenharUnidade(cols, unidades[k]);
      }
      if (ehUltimoFragmento) y -= PAD_CARD;

      idx = fim;
      primeiroFragmento = false;
      if (idx < unidades.length) {
        novaPagina();
      }
    }

    y -= GAP_ENTRE_DIAS;
  }

  // ---------- Página de resumo ----------
  // parquesAtivos e os totais usam as listas ORIGINAIS (diasCapacidade/excursoesFlat), não o "dias"
  // agrupado/filtrado acima — porque o resumo deve cobrir a capacidade do período INTEIRO
  // (mesmo dias sem nenhuma excursão), enquanto os cards só existem para dias com movimento.
  const parquesAtivos = (['Sitiolândia', 'Educântaro'] as const).filter((parque) =>
    excursoesFlat.some((e) => e.parque === parque)
  ).length;
  const alturaResumoEstimada = 24 + parquesAtivos * ALTURA_BLOCO_BARRA + Math.max(parquesAtivos - 1, 0) * GAP_ENTRE_BARRAS + 10 + 16 + 14;

  if (alturaResumoEstimada + 26 > espacoDisponivel()) {
    novaPagina();
  }
  desenharTexto(`Totalizadores - ${periodo_inicio} a ${periodo_fim}.`, margem, y, { size: 12, font: fontBold, color: COR_TITULO });
  y -= 24;

  const totaisPorParque: Record<'Sitiolândia' | 'Educântaro', TotalParque> = {
    Sitiolândia: { ocupado: 0, capacidade: 0, segmentos: new Map() },
    Educântaro: { ocupado: 0, capacidade: 0, segmentos: new Map() },
  };
  for (const d of diasCapacidade) {
    totaisPorParque.Sitiolândia.capacidade += d.capacidade_sitiolandia || 0;
    totaisPorParque.Educântaro.capacidade += d.capacidade_educantaro || 0;
  }
  const totalPorContratante: Record<string, number> = {};
  for (const ex of excursoesFlat) {
    const alvo = totaisPorParque[ex.parque];
    alvo.ocupado += ex.qtd;
    alvo.segmentos.set(ex.segmento_grafico, (alvo.segmentos.get(ex.segmento_grafico) || 0) + ex.qtd);
    totalPorContratante[ex.tipo] = (totalPorContratante[ex.tipo] || 0) + 1;
  }

  const colsResumo = calcularColunas(margem, larguraUtil);
  const parquesParaDesenhar = (Object.entries(totaisPorParque) as [string, TotalParque][]).filter(([, dados]) => dados.capacidade > 0);
  parquesParaDesenhar.forEach(([parque, dados], idx) => {
    const segmentos: Segmento[] = [...dados.segmentos.entries()].map(([nome, qtd]) => ({ nome, qtd, cor: mapaCores.get(nome)! }));
    desenharBarra(colsResumo, parque, dados.ocupado, dados.capacidade, segmentos);
    if (idx < parquesParaDesenhar.length - 1) y -= GAP_ENTRE_BARRAS;
  });

  y -= 10;
  desenharTexto('Total por Contratante:', margem, y, { size: 10, font: fontBold, color: COR_TITULO });
  y -= 16;
  let xContratante = margem;
  for (const [tipo, qtd] of Object.entries(totalPorContratante)) {
    const texto = `${tipo}: ${qtd}`;
    desenharTexto(texto, xContratante, y, { size: 9, color: COR_TITULO });
    xContratante += fontBold.widthOfTextAtSize(texto, 9) + 24;
  }

  paginasRefs.push(page);

  paginasRefs.forEach((p, idx) => {
    p.drawText(String(idx + 1), {
      x: larguraPagina - margem - 10,
      y: margem - 20,
      size: 9,
      font: fontRegular,
      color: COR_CINZA_TEXTO,
    });
  });

  const bytes = await pdfDoc.save();
  return bytes;
}
