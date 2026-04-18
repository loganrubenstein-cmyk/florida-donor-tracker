import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Florida Influence';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div style={{
        background: '#01010d', width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '80px',
        borderTop: '6px solid #ffb060',
      }}>
        <div style={{ color: '#ffb060', fontSize: 64, fontWeight: 700, letterSpacing: '0.02em' }}>
          Florida Influence
        </div>
        <div style={{ color: '#5a6a88', fontSize: 32, marginTop: 24 }}>
          Follow the money in Florida politics
        </div>
        <div style={{ color: '#2a3450', fontSize: 22, marginTop: 48 }}>
          Campaign contributions, lobbyists, committees, and legislative finance — 1996 to 2026
        </div>
      </div>
    ),
    { ...size }
  );
}
