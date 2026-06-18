import { ImageResponse } from '@vercel/og';
import { PDFDocument } from 'pdf-lib';

export const config = {
    runtime: 'edge',
};

const LOGO_URL = 'https://bf2227ac896298bd3da7ffb6d5e67cb2.cdn.bubble.io/f1743045895095x668604121136814600/LOGO%20HORIZ%203D.png';
const POPPINS_400_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/poppins@latest/latin-400-normal.ttf';
const POPPINS_500_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/poppins@latest/latin-500-normal.ttf';

// Cache de fontes a nível de módulo (reusado em invocações warm)
const fontRegPromise = fetch(POPPINS_400_URL).then(r => r.arrayBuffer());
const fontMedPromise = fetch(POPPINS_500_URL).then(r => r.arrayBuffer());

// =============================================================================
// Template visual do ingresso (idêntico ao /api/ingresso)
// =============================================================================
function IngressoTemplate({
    tipo,
    responsavel,
    data,
    qrcode,
    codigo,
}: {
    tipo: string;
    responsavel: string;
    data: string;
    qrcode: string;
    codigo: string;
}) {
    return (
        <div
            style={{
                width: 280,
                height: 470,
                backgroundColor: '#6CC868',
                borderRadius: 16,
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'Poppins',
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* Recortes laterais */}
            <div style={{ position: 'absolute', left: -8, top: 282, width: 16, height: 16, backgroundColor: 'white', borderRadius: 8, display: 'flex' }} />
            <div style={{ position: 'absolute', right: -8, top: 282, width: 16, height: 16, backgroundColor: 'white', borderRadius: 8, display: 'flex' }} />
            {/* Linha tracejada */}
            <div style={{ position: 'absolute', left: 18, top: 290, width: 244, height: 0, borderTop: '1.2px dashed rgba(255,255,255,0.55)', display: 'flex' }} />

            {/* Logo */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 20 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={LOGO_URL} width={240} height={90} alt="" />
            </div>

            {/* Textos */}
            <div style={{ display: 'flex', flexDirection: 'column', padding: '20px 24px', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 11, color: '#45464E', fontWeight: 400 }}>Tipo de Ingresso</span>
                    <span style={{ fontSize: 14, color: '#282A32', fontWeight: 500 }}>{tipo}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 11, color: '#45464E', fontWeight: 400 }}>Responsável</span>
                    <span style={{ fontSize: 14, color: '#282A32', fontWeight: 500 }}>{responsavel}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 11, color: '#45464E', fontWeight: 400 }}>Data de Utilização</span>
                    <span style={{ fontSize: 14, color: '#282A32', fontWeight: 500 }}>{data}</span>
                </div>
            </div>

            {/* QR + Código */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 'auto', paddingBottom: 18, gap: 6 }}>
                <div style={{ display: 'flex', padding: 10, backgroundColor: '#EBF6E8', borderRadius: 6 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrcode} width={150} height={150} alt="" />
                </div>
                <span style={{ fontSize: 11, color: '#45464E', fontWeight: 400 }}>{codigo}</span>
            </div>
        </div>
    );
}

// =============================================================================
// Renderiza um ingresso → bytes PNG
// =============================================================================
async function renderIngressoToPNG(ing: any, fonts: any[]): Promise<Uint8Array> {
    const response = new ImageResponse(
        <IngressoTemplate
            tipo={String(ing?.tipo ?? '')}
            responsavel={String(ing?.responsavel ?? '')}
            data={String(ing?.data ?? '')}
            qrcode={String(ing?.qrcode ?? '')}
            codigo={String(ing?.codigo ?? '')}
        />,
        { width: 280, height: 470, fonts },
    );
    const buf = await response.arrayBuffer();
    return new Uint8Array(buf);
}

// Renderiza em batches pra evitar saturar memória do Edge
async function renderAllInBatches(ingressos: any[], fonts: any[], batchSize = 3): Promise<Uint8Array[]> {
    const results: Uint8Array[] = [];
    for (let i = 0; i < ingressos.length; i += batchSize) {
        const batch = ingressos.slice(i, i + batchSize);
        const batchPngs = await Promise.all(batch.map(ing => renderIngressoToPNG(ing, fonts)));
        results.push(...batchPngs);
    }
    return results;
}

// =============================================================================
// Uint8Array → base64 (em chunks pra não estourar stack em PDFs grandes)
// =============================================================================
function uint8ToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000; // 32KB por chunk
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        // String.fromCharCode com chunk pequeno é seguro
        binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binary);
}

// =============================================================================
// Handler
// =============================================================================
export default async function handler(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Use POST' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const body = await req.json();
        const ingressos = body?.ingressos;
        const codigo = String(body?.codigo ?? 'ingressos');

        if (!Array.isArray(ingressos) || ingressos.length === 0) {
            return new Response(
                JSON.stringify({ error: 'Campo "ingressos" deve ser um array não-vazio.' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } },
            );
        }

        // Valida campos obrigatórios em cada ingresso
        for (let i = 0; i < ingressos.length; i++) {
            if (!ingressos[i]?.qrcode) {
                return new Response(
                    JSON.stringify({ error: `ingressos[${i}].qrcode é obrigatório.` }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } },
                );
            }
        }

        // Carrega fontes
        const [fontReg, fontMed] = await Promise.all([fontRegPromise, fontMedPromise]);
        const fonts = [
            { name: 'Poppins', data: fontReg, weight: 400, style: 'normal' as const },
            { name: 'Poppins', data: fontMed, weight: 500, style: 'normal' as const },
        ];

        // Renderiza todos os ingressos (em batches pra economizar memória)
        const pngs = await renderAllInBatches(ingressos, fonts, 3);

        // Monta PDF A4 — 4 ingressos por página (2 linhas × 2 colunas)
        const pdfDoc = await PDFDocument.create();

        const A4_W = 595;
        const A4_H = 842;
        // Dimensões com que o ingresso será DESENHADO no PDF (escalado de 280x470)
        const TICKET_DRAW_W = 220;
        const TICKET_DRAW_H = 370;
        const COLS = 2;
        const ROWS = 2;
        const PER_PAGE = COLS * ROWS;
        const GAP_X = 30;
        const GAP_Y = 30;

        const totalWidth = TICKET_DRAW_W * COLS + GAP_X * (COLS - 1);
        const totalHeight = TICKET_DRAW_H * ROWS + GAP_Y * (ROWS - 1);
        const marginX = (A4_W - totalWidth) / 2;
        const marginY = (A4_H - totalHeight) / 2;

        let page = pdfDoc.addPage([A4_W, A4_H]);

        for (let i = 0; i < pngs.length; i++) {
            // Nova página quando enche
            if (i > 0 && i % PER_PAGE === 0) {
                page = pdfDoc.addPage([A4_W, A4_H]);
            }

            const positionInPage = i % PER_PAGE;
            const col = positionInPage % COLS;
            const row = Math.floor(positionInPage / COLS);

            const x = marginX + col * (TICKET_DRAW_W + GAP_X);
            const y = A4_H - marginY - TICKET_DRAW_H - row * (TICKET_DRAW_H + GAP_Y);

            const embeddedPng = await pdfDoc.embedPng(pngs[i]);
            page.drawImage(embeddedPng, { x, y, width: TICKET_DRAW_W, height: TICKET_DRAW_H });
        }

        const pdfBytes = await pdfDoc.save();

        // =============================================================
        // Devolve base64 dentro de JSON (stateless, nada persiste)
        // =============================================================
        const pdf_base64 = uint8ToBase64(pdfBytes);

        return new Response(
            JSON.stringify({
                pdf_base64,
                filename: `${codigo}.pdf`,
                mime: 'application/pdf',
                codigo,
                total_ingressos: ingressos.length,
                size_bytes: pdfBytes.byteLength,
            }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store',
                    'Access-Control-Allow-Origin': '*',
                },
            },
        );
    } catch (err: any) {
        return new Response(
            JSON.stringify({ error: err?.message || 'Erro desconhecido ao gerar PDF' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }
}