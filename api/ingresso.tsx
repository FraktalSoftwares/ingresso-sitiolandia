import { ImageResponse } from '@vercel/og';

export const config = {
    runtime: 'edge',
};

const LOGO_URL = 'https://bf2227ac896298bd3da7ffb6d5e67cb2.cdn.bubble.io/f1743045895095x668604121136814600/LOGO%20HORIZ%203D.png';
const POPPINS_400_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/poppins@latest/latin-400-normal.ttf';
const POPPINS_500_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/poppins@latest/latin-500-normal.ttf';

// Pré-fetch das fontes no module-load — reusado em invocações warm (mesmo worker)
const fontRegPromise = fetch(POPPINS_400_URL).then(r => r.arrayBuffer());
const fontMedPromise = fetch(POPPINS_500_URL).then(r => r.arrayBuffer());

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
        const tipo        = String(body?.tipo        ?? '');
        const responsavel = String(body?.responsavel ?? '');
        const data        = String(body?.data        ?? '');
        const qrcode      = String(body?.qrcode      ?? '');

        if (!qrcode) {
            return new Response(JSON.stringify({ error: 'Campo "qrcode" é obrigatório.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const [fontReg, fontMed] = await Promise.all([fontRegPromise, fontMedPromise]);

        return new ImageResponse(
            (
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
                    {/* Recortes laterais da perfuração */}
                    <div
                        style={{
                            position: 'absolute',
                            left: -8,
                            top: 282,
                            width: 16,
                            height: 16,
                            backgroundColor: 'white',
                            borderRadius: 8,
                            display: 'flex',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            right: -8,
                            top: 282,
                            width: 16,
                            height: 16,
                            backgroundColor: 'white',
                            borderRadius: 8,
                            display: 'flex',
                        }}
                    />

                    {/* Linha tracejada da perfuração */}
                    <div
                        style={{
                            position: 'absolute',
                            left: 18,
                            top: 290,
                            width: 244,
                            height: 0,
                            borderTop: '1.2px dashed rgba(255,255,255,0.55)',
                            display: 'flex',
                        }}
                    />

                    {/* Logo */}
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            paddingTop: 20,
                        }}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={LOGO_URL} width={240} height={90} alt="" />
                    </div>

                    {/* Bloco de textos */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '20px 24px',
                            gap: 14,
                        }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 11, color: '#45464E', fontWeight: 400 }}>
                                Tipo de Ingresso
                            </span>
                            <span style={{ fontSize: 14, color: '#282A32', fontWeight: 500 }}>
                                {tipo}
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 11, color: '#45464E', fontWeight: 400 }}>
                                Responsável
                            </span>
                            <span style={{ fontSize: 14, color: '#282A32', fontWeight: 500 }}>
                                {responsavel}
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 11, color: '#45464E', fontWeight: 400 }}>
                                Data de Utilização
                            </span>
                            <span style={{ fontSize: 14, color: '#282A32', fontWeight: 500 }}>
                                {data}
                            </span>
                        </div>
                    </div>

                    {/* QR code centralizado no rodapé */}
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            marginTop: 'auto',
                            paddingBottom: 25,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                padding: 10,
                                backgroundColor: '#EBF6E8',
                                borderRadius: 6,
                            }}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={qrcode} width={150} height={150} alt="" />
                        </div>
                    </div>
                </div>
            ),
            {
                width: 280,
                height: 470,
                fonts: [
                    { name: 'Poppins', data: fontReg, weight: 400, style: 'normal' },
                    { name: 'Poppins', data: fontMed, weight: 500, style: 'normal' },
                ],
                headers: {
                    'Cache-Control': 'no-store',
                    'Access-Control-Allow-Origin': '*',
                },
            },
        );
    } catch (err: any) {
        return new Response(
            JSON.stringify({ error: err?.message || 'Erro desconhecido ao gerar imagem' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }
}
