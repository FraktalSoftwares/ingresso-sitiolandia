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

export interface RelatorioPayload {
  periodo_inicio: string;
  periodo_fim: string;
  dias: DiaPayload[];
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

export async function gerarRelatorioPDF({ periodo_inicio, periodo_fim, dias }: RelatorioPayload): Promise<Uint8Array> {
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

  // retângulo com cantos arredondados: cruz (2 retângulos) + 4 círculos nos cantos
  function desenharRetanguloArredondado(x: number, yBase: number, largura: number, altura: number, raio: number, cor: Cor): void {
    page.drawRectangle({ x: x + raio, y: yBase, width: largura - 2 * raio, height: altura, color: cor });
    page.drawRectangle({ x, y: yBase + raio, width: largura, height: altura - 2 * raio, color: cor });
    const cantos: [number, number][] = [
      [x + raio, yBase + raio],
      [x + largura - raio, yBase + raio],
      [x + raio, yBase + altura - raio],
      [x + largura - raio, yBase + altura - raio],
    ];
    for (const [cx, cy] of cantos) {
      page.drawCircle({ x: cx, y: cy, size: raio, color: cor });
    }
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

  // altura de um bloco de barra (label+numeros+bar+chips)
  const ALTURA_BLOCO_BARRA = 12 + 18 + 10;
  const ALTURA_HEADER_TABELA = 10 + 14; // texto + espaço até início das linhas

  function alturaCard(dia: DiaPayload): number {
    const parques = [...new Set(dia.excursoes.map((e) => e.parque))];
    let altura = PAD_CARD; // topo
    altura += ALTURA_HEADER_TABELA;
    altura += dia.excursoes.length * (DECREMENTO_PARA_PILL + ALTURA_PILL) + Math.max(dia.excursoes.length - 1, 0) * DECREMENTO_APOS_PILL;
    altura += GAP_APOS_EXCURSOES;
    altura += parques.length * ALTURA_BLOCO_BARRA;
    altura += PAD_CARD; // base
    return altura;
  }

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
      const texto = `${seg.nome} ( ${seg.qtd} )`;
      const largura = fontRegular.widthOfTextAtSize(texto, 7.5) + 12;
      page.drawRectangle({ x: chipX, y: y - 2, width: largura, height: 13, color: seg.cor });
      desenharTexto(texto, chipX + 6, y + 1, { size: 7.5, color: COR_BRANCO });
      chipX += largura + 6;
    }
    y -= 10;
  }

  function desenharBlocoBarras(cols: Colunas, parques: Excursao['parque'][], dia: DiaPayload): void {
    for (const parque of parques) {
      const doParque = dia.excursoes.filter((e) => e.parque === parque);
      const porSegmento = new Map<string, number>();
      for (const ex of doParque) {
        porSegmento.set(ex.segmento_grafico, (porSegmento.get(ex.segmento_grafico) || 0) + ex.qtd);
      }
      const segmentos: Segmento[] = [...porSegmento.entries()].map(([nome, qtd]) => ({ nome, qtd, cor: mapaCores.get(nome)! }));
      const ocupado = segmentos.reduce((acc, s) => acc + s.qtd, 0);
      const capacidade = parque === 'Educântaro' ? dia.capacidade_educantaro : dia.capacidade_sitiolandia;
      desenharBarra(cols, parque, ocupado, capacidade, segmentos);
    }
  }

  // ---------- Loop dos dias ----------
  for (const dia of dias) {
    const altura = alturaCard(dia);

    // bloco de dia é atômico: se não cabe no espaço restante, vai pra próxima página inteiro
    if (altura + 26 > espacoDisponivel()) {
      novaPagina();
    }

    desenharTexto(dia.dia, margem, y, { size: 12, font: fontBold, color: COR_TITULO });
    desenharTexto(nomeDiaSemana(dia.dia), margem + 75, y, { size: 8, color: COR_CINZA_TEXTO });
    y -= GAP_DATA_PARA_CARD + 8;

    const topoCard = y;
    desenharRetanguloArredondado(margem, topoCard - altura, larguraUtil, altura, RAIO_CARD, COR_CARD_BG);

    y -= PAD_CARD;
    const cardX0 = margem + PAD_CARD;
    const larguraInterna = larguraUtil - PAD_CARD * 2;
    const cols = calcularColunas(cardX0, larguraInterna);

    // cabeçalho da tabela
    desenharTexto('Tipo', cols.tipo, y, { size: 8, color: COR_CINZA_TEXTO });
    desenharTexto('Nome', cols.nome, y, { size: 8, color: COR_CINZA_TEXTO });
    desenharTexto('Ag. / Rep. / Atendente', cols.agente, y, { size: 8, color: COR_CINZA_TEXTO });
    desenharTexto('Serviço Contratado', cols.servico, y, { size: 8, color: COR_CINZA_TEXTO });
    desenharTexto('QTD', cols.qtd, y, { size: 8, color: COR_CINZA_TEXTO });
    y -= 24;

    dia.excursoes.forEach((ex, idx) => {
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
      {
        const textoStatus = `Data do Cadastro: ${ex.cadastro}  |  Status da Manutenção: ${ex.manutencao}`;
        const larguraTexto = fontRegular.widthOfTextAtSize(textoStatus, SIZE_STATUS);
        const larguraPill = larguraTexto + PAD_PILL * 2;
        desenharRetanguloArredondado(cols.tipo - PAD_PILL, y - ALTURA_PILL, larguraPill, ALTURA_PILL, 8, COR_BRANCO);
        desenharTexto(textoStatus, cols.tipo, y - (ALTURA_PILL - PAD_PILL - DESCENT_STATUS), { size: SIZE_STATUS, color: COR_CINZA_TEXTO });
      }
      y -= ALTURA_PILL;
      if (idx < dia.excursoes.length - 1) y -= DECREMENTO_APOS_PILL;
    });

    y -= GAP_APOS_EXCURSOES;

    const parques = [...new Set(dia.excursoes.map((e) => e.parque))];
    desenharBlocoBarras(cols, parques, dia);

    y = topoCard - altura - GAP_ENTRE_DIAS;
  }

  // ---------- Página de resumo ----------
  const parquesAtivos = (['Sitiolândia', 'Educântaro'] as const).filter((parque) =>
    dias.some((d) => d.excursoes.some((e) => e.parque === parque))
  ).length;
  const alturaResumoEstimada = 24 + parquesAtivos * ALTURA_BLOCO_BARRA + 10 + 16 + 14;

  if (alturaResumoEstimada + 26 > espacoDisponivel()) {
    novaPagina();
  }
  desenharTexto(`Totalizadores - ${periodo_inicio} a ${periodo_fim}.`, margem, y, { size: 12, font: fontBold, color: COR_TITULO });
  y -= 24;

  const totaisPorParque: Record<'Sitiolândia' | 'Educântaro', TotalParque> = {
    Sitiolândia: { ocupado: 0, capacidade: 0, segmentos: new Map() },
    Educântaro: { ocupado: 0, capacidade: 0, segmentos: new Map() },
  };
  const totalPorContratante: Record<string, number> = {};
  for (const dia of dias) {
    totaisPorParque.Sitiolândia.capacidade += dia.capacidade_sitiolandia || 0;
    totaisPorParque.Educântaro.capacidade += dia.capacidade_educantaro || 0;
    for (const ex of dia.excursoes) {
      const alvo = totaisPorParque[ex.parque];
      alvo.ocupado += ex.qtd;
      alvo.segmentos.set(ex.segmento_grafico, (alvo.segmentos.get(ex.segmento_grafico) || 0) + ex.qtd);
      totalPorContratante[ex.tipo] = (totalPorContratante[ex.tipo] || 0) + 1;
    }
  }

  const colsResumo = calcularColunas(margem, larguraUtil);
  for (const [parque, dados] of Object.entries(totaisPorParque) as [string, TotalParque][]) {
    if (dados.capacidade === 0) continue;
    const segmentos: Segmento[] = [...dados.segmentos.entries()].map(([nome, qtd]) => ({ nome, qtd, cor: mapaCores.get(nome)! }));
    desenharBarra(colsResumo, parque, dados.ocupado, dados.capacidade, segmentos);
  }

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
