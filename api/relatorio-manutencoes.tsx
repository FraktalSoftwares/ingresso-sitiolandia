import { gerarRelatorioPDF, PayloadInvalidoError } from '../gerarRelatorio';
import type { RelatorioPayload } from '../gerarRelatorio';

export const config = {
    runtime: 'edge',
};

// =============================================================================
// Uint8Array → base64 (em chunks pra não estourar stack em PDFs grandes)
// Mesma implementação de /api/ingressos-pdf — Buffer não é garantido no Edge Runtime.
// =============================================================================
function uint8ToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000; // 32KB por chunk
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
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
        const periodo_inicio = String(body?.periodo_inicio ?? '');
        const periodo_fim = String(body?.periodo_fim ?? '');
        const dias = body?.dias;
        const excursoes = body?.excursoes;

        if (!periodo_inicio || !periodo_fim || !Array.isArray(dias) || !Array.isArray(excursoes)) {
            return new Response(
                JSON.stringify({
                    error: 'Payload inválido. Esperado: { periodo_inicio, periodo_fim, dias: [], excursoes: [] }',
                }),
                { status: 400, headers: { 'Content-Type': 'application/json' } },
            );
        }

        const payload: RelatorioPayload = { periodo_inicio, periodo_fim, dias, excursoes };
        const pdfBytes = await gerarRelatorioPDF(payload);
        const pdf_base64 = uint8ToBase64(pdfBytes);
        const filename = `relatorio-manutencoes-${periodo_inicio.replace(/\//g, '-')}-a-${periodo_fim.replace(/\//g, '-')}.pdf`;

        return new Response(
            JSON.stringify({
                pdf_base64,
                filename,
                mime: 'application/pdf',
                periodo_inicio,
                periodo_fim,
                total_dias: dias.length,
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
        // erro de payload (ex: excursão referenciando data fora da lista "dias") → 400, não 500
        const status = err instanceof PayloadInvalidoError ? 400 : 500;
        return new Response(
            JSON.stringify({ error: err?.message || 'Erro desconhecido ao gerar PDF' }),
            { status, headers: { 'Content-Type': 'application/json' } },
        );
    }
}
